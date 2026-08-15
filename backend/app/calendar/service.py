import hashlib
import json
import logging
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.calendar.schemas import (
    CalendarCategory,
    CalendarDataSource,
    CalendarEvent,
    CalendarEventGroup,
    CalendarEventsResponse,
    CalendarFiltersResponse,
    CalendarScope,
)
from app.core.config import Settings
from app.core.models import CalendarEvent as CalendarEventModel
from app.core.models import (
    CalendarEventSource,
    DataSource,
    Holding,
    User,
    WatchlistItem,
    utc_now,
)
from app.core.security import ApiKeyCipher
from app.data_sources.longbridge import (
    LongbridgeCalendarAdapter,
    LongbridgeError,
    LongbridgeHttpClient,
)
from app.settings.service import (
    _decode_credentials,
    _refresh_longbridge_source_token,
    _source_auth_type,
)

logger = logging.getLogger(__name__)

CALENDAR_TIMEZONE = "Asia/Shanghai"
_SHANGHAI = ZoneInfo(CALENDAR_TIMEZONE)

SUPPORTED_MARKETS: dict[CalendarCategory, tuple[str, ...]] = {
    CalendarCategory.MACRO: ("US", "HK", "SH", "SZ"),
    CalendarCategory.EARNINGS: ("US", "HK", "SH", "SZ"),
    CalendarCategory.DIVIDEND: ("US", "HK", "SH", "SZ"),
    CalendarCategory.SPLIT: ("US", "HK", "SH", "SZ"),
    CalendarCategory.CLOSED: ("US", "HK", "CN"),
}

_MARKET_NAMES = {
    "US": "美国",
    "HK": "中国香港",
    "SH": "中国上海",
    "SZ": "中国深圳",
    "CN": "中国大陆",
}
_MARKET_TIMEZONES = {
    "US": "America/New_York",
    "HK": CALENDAR_TIMEZONE,
    "SH": CALENDAR_TIMEZONE,
    "SZ": CALENDAR_TIMEZONE,
    "CN": CALENDAR_TIMEZONE,
}


def validate_markets(category: CalendarCategory, markets: list[str]) -> list[str]:
    normalized = list(dict.fromkeys(market.upper() for market in markets if market.strip()))
    unsupported = [market for market in normalized if market not in SUPPORTED_MARKETS[category]]
    if unsupported:
        raise ValueError(f"{category.value} 不支持市场：{', '.join(unsupported)}")
    return normalized


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _value_text(value: object) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (str, int, float)):
        return _text(str(value))
    return None


def _parse_date(value: object) -> date | None:
    raw = _text(value)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10].replace(".", "-"))
    except ValueError:
        return None


def _parse_datetime(value: object, timezone_name: str) -> datetime | None:
    raw = _text(value)
    if not raw:
        return None
    if raw.isdigit():
        try:
            timestamp = float(raw)
            if timestamp > 10_000_000_000:
                timestamp /= 1000
            return datetime.fromtimestamp(timestamp, tz=UTC).astimezone(
                ZoneInfo(timezone_name)
            )
        except (OverflowError, OSError, ValueError):
            return None
    # Longbridge may repeat the event date in `datetime`. That is not an
    # exact release time and must remain an all-day event in the product.
    if len(raw) <= 10 and " " not in raw and "T" not in raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        for pattern in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
            try:
                parsed = datetime.strptime(raw, pattern)
                break
            except ValueError:
                continue
        else:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo(timezone_name))
    return parsed


def _kv_map(value: object) -> dict[str, str]:
    if isinstance(value, dict):
        result: dict[str, str] = {}
        for key, raw in value.items():
            nested = _kv_map(raw) if isinstance(raw, dict) else {}
            result.update(nested)
            text = _value_text(raw)
            if text is not None:
                result[str(key).strip().lower()] = text
        return result
    if not isinstance(value, list):
        return {}
    result: dict[str, str] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        key = _text(item.get("key") or item.get("name") or item.get("label"))
        raw = item.get("value")
        if raw is None:
            raw = item.get("val") or item.get("text")
        text = _value_text(raw)
        value_type = _text(item.get("type") or item.get("value_type"))
        if text:
            if key:
                result[key.lower()] = text
            if value_type:
                result.setdefault(value_type.lower(), text)
    return result


def _first(mapping: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        if mapping.get(key):
            return mapping[key]
    return None


def _importance(value: object) -> int | None:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed if 1 <= parsed <= 3 else None


def _scope_tags(value: set[str]) -> list[str]:
    return [tag for tag in ("watchlist", "holding") if tag in value]


def _timezone_for_market(market: str | None) -> str:
    return _MARKET_TIMEZONES.get(market or "", CALENDAR_TIMEZONE)


def _event_title(category: CalendarCategory, info: dict[str, Any], kv: dict[str, str]) -> str:
    content = _text(info.get("content"))
    event_type = _text(info.get("event_type"))
    activity_type = _text(info.get("activity_type"))
    if category is CalendarCategory.MACRO:
        return (
            _first(kv, "indicator", "indicator_name", "name")
            or content
            or event_type
            or activity_type
            or "宏观经济数据"
        )
    if category is CalendarCategory.EARNINGS:
        return content or activity_type or event_type or "财报披露"
    if category is CalendarCategory.DIVIDEND:
        return content or activity_type or event_type or "分红"
    if category is CalendarCategory.SPLIT:
        action = _first(kv, "action", "type", "split_type") or activity_type or event_type
        if action and any(word in action.lower() for word in ("merge", "reverse", "合股")):
            return "合股"
        if action and any(word in action.lower() for word in ("split", "拆股")):
            return "拆股"
        return content or action or "拆合股"
    return content or activity_type or event_type or "市场休市"


def _details(
    category: CalendarCategory,
    info: dict[str, Any],
    kv: dict[str, str],
) -> dict[str, Any]:
    aliases = {
        "report_period": (
            "report_period",
            "period",
            "fiscal_period",
            "fiscal_year",
            "报告期",
        ),
        "report_time": ("report_time", "time", "披露时间", "market_time"),
        "eps": ("eps", "eps_actual", "actual_eps", "每股收益"),
        "revenue": ("revenue", "revenue_actual", "actual_revenue", "营收"),
        "dividend_amount": ("dividend_amount", "amount", "dividend", "每股股息"),
        "ex_date": ("ex_date", "ex_dividend_date", "除息日"),
        "record_date": ("record_date", "登记日"),
        "pay_date": ("pay_date", "payment_date", "派息日"),
        "action": ("action", "type", "split_type", "activity_type"),
        "ratio": ("ratio", "split_ratio", "合拆比例"),
        "closure_name": ("closure_name", "holiday", "name", "节假日"),
        "closure_type": ("closure_type", "date_type", "全天/半天"),
    }
    result: dict[str, Any] = {}
    for name, keys in aliases.items():
        value = _first(kv, *keys)
        if value is not None:
            result[name] = value
    if category is CalendarCategory.CLOSED:
        result.setdefault(
            "closure_name",
            _text(info.get("content")) or _text(info.get("event_type")),
        )
        result.setdefault("closure_type", _text(info.get("date_type")))
    return {key: value for key, value in result.items() if value is not None}


def _canonical_key(
    category: CalendarCategory,
    info: dict[str, Any],
    event_date: date,
    title: str,
    period: str | None,
) -> tuple[str, str | None]:
    provider_event_id = _text(info.get("id"))
    if provider_event_id:
        return f"longbridge:{provider_event_id}", provider_event_id
    market = (_text(info.get("market")) or "").upper()
    symbol = (_text(info.get("symbol")) or "").upper()
    event_type = _text(info.get("event_type")) or _text(info.get("activity_type")) or ""
    raw = "|".join(
        (category.value, market, symbol, event_date.isoformat(), event_type, title, period or "")
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"longbridge:fallback:{digest}", None


def _normalize_event(
    category: CalendarCategory,
    info: dict[str, Any],
    tags: set[str],
    synced_at: datetime,
) -> CalendarEvent | None:
    market = (_text(info.get("market")) or "").upper() or None
    timezone_name = _text(info.get("timezone")) or _timezone_for_market(market)
    event_datetime = (
        None
        if category is CalendarCategory.CLOSED
        else _parse_datetime(info.get("datetime"), timezone_name)
    )
    event_date = _parse_date(info.get("date")) or (
        event_datetime.date() if event_datetime else None
    )
    if event_date is None:
        return None
    kv = _kv_map(info.get("data_kv"))
    for key, value in _kv_map(info.get("ext")).items():
        kv.setdefault(key, value)
    title = _event_title(category, info, kv)
    period = _first(kv, "period", "report_period", "fiscal_period", "报告期")
    canonical_key, provider_event_id = _canonical_key(category, info, event_date, title, period)
    raw_symbol = _text(info.get("symbol"))
    symbol = raw_symbol.upper() if raw_symbol else None
    importance = _importance(info.get("star"))
    details = _details(category, info, kv)
    raw_country = _text(info.get("country_name")) or _text(info.get("country"))
    return CalendarEvent(
        id=str(uuid.uuid5(uuid.NAMESPACE_URL, canonical_key)),
        provider_event_id=provider_event_id,
        category=category,
        event_type=_text(info.get("event_type")) or _text(info.get("activity_type")),
        title=title,
        market=market,
        country_or_region=raw_country or _MARKET_NAMES.get(market or ""),
        symbol=symbol,
        security_name=_text(info.get("counter_name")),
        event_date=event_date,
        event_datetime=event_datetime,
        timezone=timezone_name,
        all_day=event_datetime is None,
        financial_market_time=_text(info.get("financial_market_time"))
        or _first(kv, "market_time", "financial_market_time"),
        importance=importance,
        period=period,
        actual_value=_first(
            kv,
            "actual",
            "actual_value",
            "actual_eps",
            "actual_revenue",
            "result",
            "实际值",
        ),
        forecast_value=_first(
            kv,
            "forecast",
            "forecast_value",
            "estimate",
            "estimate_eps",
            "estimate_revenue",
            "预测值",
        ),
        previous_value=_first(kv, "previous", "previous_value", "前值"),
        revised_value=_first(kv, "revised", "revised_value", "修正值"),
        unit=_first(kv, "unit", "单位"),
        currency=_text(info.get("currency")) or _first(kv, "currency", "币种"),
        content=_text(info.get("content")),
        scope_tags=_scope_tags(tags),
        details=details,
        extra_data={
            "provider": "longbridge",
            "canonical_key": canonical_key,
            "raw": info,
            "data_kv": info.get("data_kv", []),
            "details": details,
        },
        last_synced_at=synced_at,
    )


def _sort_key(event: CalendarEvent) -> tuple[date, int, datetime, int, str]:
    return (
        event.event_date,
        0 if event.all_day else 1,
        event.event_datetime or datetime.combine(event.event_date, time.min, tzinfo=UTC),
        -(event.importance or 0),
        event.title,
    )


def _group_events(events: list[CalendarEvent]) -> list[CalendarEventGroup]:
    grouped: dict[date, list[CalendarEvent]] = defaultdict(list)
    for event in events:
        grouped[event.event_date].append(event)
    return [
        CalendarEventGroup(event_date=event_date, items=items)
        for event_date, items in sorted(grouped.items())
    ]


def _cache_key(
    user: User,
    category: CalendarCategory,
    start: date,
    end: date,
    markets: list[str],
    scope: CalendarScope,
    importance: list[int],
    symbols: list[str],
) -> str:
    universe = ",".join(sorted(symbols))
    fingerprint = hashlib.sha256(universe.encode("utf-8")).hexdigest()[:12]
    market_key = ",".join(markets) or "all"
    importance_key = ",".join(str(value) for value in importance) or "all"
    return (
        f"calendar:v3:{user.id}:{category.value}:{start.isoformat()}:{end.isoformat()}"
        f":{market_key}:{scope.value}:{importance_key}:{fingerprint}"
    )


async def _cache_get(cache: Redis, key: str) -> CalendarEventsResponse | None:
    try:
        raw = await cache.get(key)
        if not isinstance(raw, str):
            return None
        return CalendarEventsResponse.model_validate(json.loads(raw))
    except Exception:  # noqa: BLE001 - cache is optional and must not block calendar reads
        return None


async def _cache_set(cache: Redis, key: str, response: CalendarEventsResponse) -> None:
    try:
        async with cache.pipeline(transaction=False) as pipeline:
            pipeline.set(
                key,
                json.dumps(response.model_dump(mode="json", by_alias=True), ensure_ascii=False),
                ex=900,
            )
            for event in response.items:
                pipeline.set(
                    f"calendar:event:v1:{event.id}",
                    json.dumps(event.model_dump(mode="json"), ensure_ascii=False),
                    ex=1800,
                )
            await pipeline.execute()
    except Exception:  # noqa: BLE001 - cache is best effort
        logger.debug("Calendar cache write failed", exc_info=True)


async def _longbridge_source(db: AsyncSession, user: User) -> DataSource | None:
    return await db.scalar(
        select(DataSource)
        .where(DataSource.user_id == user.id, DataSource.provider_type == "longbridge")
        .order_by(DataSource.is_active.desc(), DataSource.updated_at.desc())
    )


async def _scope_universe(
    db: AsyncSession,
    user: User,
    scope: CalendarScope,
) -> dict[str, set[str]]:
    result: dict[str, set[str]] = defaultdict(set)
    if scope in {CalendarScope.ALL, CalendarScope.WATCHLIST}:
        watchlist = (
            await db.scalars(select(WatchlistItem).where(WatchlistItem.user_id == user.id))
        ).all()
        for item in watchlist:
            result[item.thscode.upper()].add("watchlist")
    if scope in {CalendarScope.ALL, CalendarScope.HOLDING}:
        holdings = (
            await db.scalars(
                select(Holding).where(Holding.user_id == user.id, Holding.status == "open")
            )
        ).all()
        for item in holdings:
            result[item.thscode.upper()].add("holding")
    return result


async def _persist_events(
    db: AsyncSession,
    events: list[CalendarEvent],
    source: DataSource,
) -> None:
    """Persist normalized events and raw provider payloads in two bulk reads."""

    try:
        if not events:
            await db.commit()
            return

        canonical_keys: list[str] = []
        canonical_keys_by_event: dict[str, str] = {}
        provider_ids: set[str] = set()
        for event in events:
            canonical_key = event.extra_data.get("canonical_key")
            if not isinstance(canonical_key, str):
                canonical_key = (
                    f"longbridge:{event.provider_event_id}"
                    if event.provider_event_id
                    else (
                        "longbridge:fallback:"
                        f"{hashlib.sha256(event.model_dump_json().encode()).hexdigest()}"
                    )
                )
            canonical_keys.append(canonical_key)
            canonical_keys_by_event[event.id] = canonical_key
            if event.provider_event_id:
                provider_ids.add(event.provider_event_id)

        existing_models = (
            await db.scalars(
                select(CalendarEventModel).where(
                    CalendarEventModel.canonical_key.in_(set(canonical_keys))
                )
            )
        ).all()
        models_by_key = {model.canonical_key: model for model in existing_models}

        existing_sources = []
        if provider_ids:
            existing_sources = (
                await db.scalars(
                    select(CalendarEventSource).where(
                        CalendarEventSource.provider == "longbridge",
                        CalendarEventSource.provider_event_id.in_(provider_ids),
                    )
                )
            ).all()
        sources_by_provider_id = {
            row.provider_event_id: row for row in existing_sources
        }

        for event in events:
            raw = event.extra_data.get("raw")
            raw_payload = raw if isinstance(raw, dict) else {}
            canonical_key = canonical_keys_by_event[event.id]
            model = models_by_key.get(canonical_key)
            scheduled_at = event.event_datetime or datetime.combine(
                event.event_date, time.min, tzinfo=ZoneInfo(event.timezone)
            )
            values = {
                "canonical_key": canonical_key,
                "category": event.category.value,
                "event_type": event.event_type or event.category.value,
                "title": event.title,
                "country_code": event.market or "",
                "country_name": event.country_or_region or "",
                "market": event.market,
                "security_id": event.symbol,
                "security_name": event.security_name,
                "scheduled_at": scheduled_at,
                "timezone": event.timezone,
                "all_day": event.all_day,
                "status": "active",
                "importance": str(event.importance) if event.importance is not None else "",
                "period": event.period,
                "actual_value": event.actual_value,
                "forecast_value": event.forecast_value,
                "previous_value": event.previous_value,
                "revised_value": event.revised_value,
                "unit": event.unit,
                "issuer": event.security_name,
                "summary": event.content,
                "source_name": source.name,
                "source_url": None,
                "source_timezone_label": event.timezone,
                "extra_data": event.extra_data,
                "last_synced_at": event.last_synced_at,
            }
            if model is None:
                model = CalendarEventModel(id=uuid.UUID(event.id), **values)
                db.add(model)
                models_by_key[canonical_key] = model
            else:
                for key, value in values.items():
                    setattr(model, key, value)
            if event.provider_event_id:
                source_row = sources_by_provider_id.get(event.provider_event_id)
                if source_row is None:
                    source_row = CalendarEventSource(
                        event_id=model.id,
                        provider="longbridge",
                        provider_event_id=event.provider_event_id,
                        source_url=None,
                        provider_importance=str(event.importance) if event.importance else None,
                        is_authoritative=True,
                        raw_payload=raw_payload,
                        observed_at=event.last_synced_at,
                    )
                    db.add(source_row)
                    sources_by_provider_id[event.provider_event_id] = source_row
                else:
                    source_row.event_id = model.id
                    source_row.raw_payload = raw_payload
                    source_row.observed_at = event.last_synced_at
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.exception("Calendar event persistence failed", extra={"source": source.name})


def _source_summary(
    source: DataSource,
    state: str,
    message: str | None = None,
) -> CalendarDataSource:
    return CalendarDataSource(name=source.name, state=state, message=message)


async def list_events(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
    *,
    category: CalendarCategory,
    start: date,
    end: date,
    markets: list[str] | None = None,
    scope: CalendarScope = CalendarScope.ALL,
    importance: list[int] | None = None,
    refresh: bool = False,
    limit: int = 500,
) -> CalendarEventsResponse:
    if start > end:
        raise ValueError("开始日期不能晚于结束日期")
    selected_markets = validate_markets(category, markets or [])
    importance_values = sorted(set(importance or []))
    universe = await _scope_universe(db, user, scope) if category not in {
        CalendarCategory.MACRO,
        CalendarCategory.CLOSED,
    } else {}
    symbols = sorted(universe)
    key = _cache_key(
        user,
        category,
        start,
        end,
        selected_markets,
        scope,
        importance_values,
        symbols,
    )
    cached = await _cache_get(cache, key)
    if cached is not None and not refresh:
        return cached

    source = await _longbridge_source(db, user)
    if source is None:
        if cached is not None:
            cached.data_source = CalendarDataSource(
                name=cached.data_source.name,
                state="stale",
                message="Longbridge 尚未配置，当前展示最近一次成功同步的数据",
            )
            return cached
        raise LongbridgeError("请先在系统设置中接入 Longbridge 数据源", code=2001)

    if category not in {CalendarCategory.MACRO, CalendarCategory.CLOSED} and not symbols:
        now = utc_now()
        response = CalendarEventsResponse(
            category=category,
            from_date=start,
            to_date=end,
            items=[],
            groups=[],
            last_synced_at=now,
            data_source=_source_summary(source, "ready"),
        )
        await _cache_set(cache, key, response)
        return response

    synced_at = utc_now()
    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    credentials = _decode_credentials(cipher, source.api_key_ciphertext)
    if _source_auth_type(source) == "oauth":
        expires_at = source.oauth_expires_at
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at is not None and expires_at <= utc_now():
            credentials = await _refresh_longbridge_source_token(
                source,
                credentials,
                cipher,
                settings,
            )
            await db.commit()

    try:
        async with LongbridgeHttpClient(
            source.base_url,
            _source_auth_type(source),  # type: ignore[arg-type]
            credentials,
            settings.upstream_timeout_seconds,
        ) as client:
            adapter = LongbridgeCalendarAdapter(client)
            raw_events = await adapter.get_calendar_events(
                category.value,  # type: ignore[arg-type]
                start,
                end,
                selected_markets or list(SUPPORTED_MARKETS[category]),
                symbols or None,
            )
    except LongbridgeError as exc:
        if cached is not None:
            cached.data_source = CalendarDataSource(
                name=source.name,
                state="stale",
                message=(
                    "Longbridge 暂时不可用，当前展示最近一次成功同步的数据："
                    f"{exc.user_message}"
                ),
            )
            return cached
        raise

    by_key: dict[str, CalendarEvent] = {}
    for raw in raw_events:
        raw_symbol = (_text(raw.get("symbol")) or "").upper()
        event = _normalize_event(category, raw, universe.get(raw_symbol, set()), synced_at)
        if event is None:
            continue
        if importance_values and event.importance not in importance_values:
            continue
        previous = by_key.get(event.id)
        if previous is None:
            by_key[event.id] = event
        else:
            previous.scope_tags = sorted(set(previous.scope_tags + event.scope_tags))  # type: ignore[assignment]

    events = sorted(by_key.values(), key=_sort_key)[:limit]
    response = CalendarEventsResponse(
        category=category,
        from_date=start,
        to_date=end,
        items=events,
        groups=_group_events(events),
        last_synced_at=synced_at,
        data_source=_source_summary(source, "ready"),
    )
    await _persist_events(db, events, source)
    await _cache_set(cache, key, response)
    return response


async def get_event(
    db: AsyncSession,
    cache: Redis,
    event_id: str,
) -> CalendarEvent:
    try:
        raw = await cache.get(f"calendar:event:v1:{event_id}")
        if isinstance(raw, str):
            return CalendarEvent.model_validate(json.loads(raw))
    except Exception:  # noqa: BLE001 - fall through to persisted event
        pass

    try:
        parsed_id = uuid.UUID(event_id)
    except ValueError as exc:
        raise KeyError(event_id) from exc
    model = await db.get(CalendarEventModel, parsed_id)
    if model is None:
        raise KeyError(event_id)
    extra = model.extra_data if isinstance(model.extra_data, dict) else {}
    raw = extra.get("raw")
    provider_event_id = raw.get("id") if isinstance(raw, dict) else None
    raw_currency = raw.get("currency") if isinstance(raw, dict) else None
    raw_market_time = raw.get("financial_market_time") if isinstance(raw, dict) else None
    details = extra.get("details") if isinstance(extra.get("details"), dict) else {}
    return CalendarEvent(
        id=str(model.id),
        provider_event_id=provider_event_id if isinstance(provider_event_id, str) else None,
        category=CalendarCategory(model.category),
        event_type=model.event_type,
        title=model.title,
        market=model.market,
        country_or_region=model.country_name,
        symbol=model.security_id,
        security_name=model.security_name,
        event_date=model.scheduled_at.astimezone(ZoneInfo(model.timezone)).date(),
        event_datetime=None if model.all_day else model.scheduled_at,
        timezone=model.timezone,
        all_day=model.all_day,
        importance=int(model.importance) if model.importance.isdigit() else None,
        financial_market_time=raw_market_time if isinstance(raw_market_time, str) else None,
        period=model.period,
        actual_value=model.actual_value,
        forecast_value=model.forecast_value,
        previous_value=model.previous_value,
        revised_value=model.revised_value,
        unit=model.unit,
        currency=raw_currency if isinstance(raw_currency, str) else None,
        content=model.summary,
        scope_tags=[],
        details=details,
        extra_data=extra,
        source_name=model.source_name,
        last_synced_at=model.last_synced_at,
    )


def filters(category: CalendarCategory) -> CalendarFiltersResponse:
    return CalendarFiltersResponse(
        category=category,
        markets=list(SUPPORTED_MARKETS[category]),
        importance=[1, 2, 3],
        scopes=[CalendarScope.ALL, CalendarScope.WATCHLIST, CalendarScope.HOLDING]
        if category not in {CalendarCategory.MACRO, CalendarCategory.CLOSED}
        else [CalendarScope.ALL],
    )
