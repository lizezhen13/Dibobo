import asyncio
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import Settings
from app.global_market.adapter import (
    AKSHARE_VERSION,
    AkshareGlobalMarketAdapter,
    GlobalMarketAdapterError,
    GlobalMarketFetchResult,
    GlobalMarketRawQuote,
)
from app.global_market.catalog import (
    EXPECTED_COUNTS,
    PRODUCTS_BY_GROUP,
    GlobalMarketGroup,
    ProductDefinition,
)
from app.global_market.schemas import (
    GlobalMarketGroupResponse,
    GlobalMarketItem,
    GlobalMarketResponse,
    GlobalMarketState,
)

logger = logging.getLogger(__name__)

GROUPS: tuple[GlobalMarketGroup, ...] = ("indices", "fx", "commodities", "yields")
# Keep the heavier commodity calls last.  The public response still uses GROUPS
# so the API contract and frontend ordering remain unchanged.
REFRESH_GROUPS: tuple[GlobalMarketGroup, ...] = ("indices", "fx", "yields", "commodities")
CURRENT_KEY_PREFIX = "global-market:v1:current"
LAST_SUCCESS_KEY_PREFIX = "global-market:v1:last-success"
REFRESHING_KEY_PREFIX = "global-market:v1:refreshing"
ERROR_KEY_PREFIX = "global-market:v1:error"
LOCK_KEY_PREFIX = "global-market:v1:lock"


def _refresh_seconds_for_group(
    group: GlobalMarketGroup,
    settings: Settings,
) -> int:
    if group == "commodities":
        return settings.global_market_commodity_refresh_seconds
    if group == "yields":
        return settings.global_market_yield_refresh_seconds
    return settings.global_market_refresh_seconds


def _global_market_poll_seconds(settings: Settings) -> int:
    return min(_refresh_seconds_for_group(group, settings) for group in GROUPS)


def _current_snapshot_ttl(group: GlobalMarketGroup, settings: Settings) -> int:
    return max(
        _refresh_seconds_for_group(group, settings) * 2,
        settings.global_market_lock_seconds * 2,
        300,
    )


def capability_for_product(product: ProductDefinition) -> str:
    if product.group == "indices":
        return "global_index_quote"
    if product.group == "fx":
        return "fx_quote"
    if product.display_code in {"AU", "AG"}:
        return "domestic_main_futures_quote"
    if product.group == "commodities":
        return "global_commodity_quote"
    return "sovereign_yield"


@dataclass(slots=True)
class RefreshResult:
    group: GlobalMarketGroup
    state: GlobalMarketState
    acquired: bool
    message: str | None = None


def _current_key(group: GlobalMarketGroup) -> str:
    return f"{CURRENT_KEY_PREFIX}:{group}"


def _last_success_key(group: GlobalMarketGroup) -> str:
    return f"{LAST_SUCCESS_KEY_PREFIX}:{group}"


def _refreshing_key(group: GlobalMarketGroup) -> str:
    return f"{REFRESHING_KEY_PREFIX}:{group}"


def _error_key(group: GlobalMarketGroup) -> str:
    return f"{ERROR_KEY_PREFIX}:{group}"


def _lock_key(group: GlobalMarketGroup) -> str:
    return f"{LOCK_KEY_PREFIX}:{group}"


def _safe_number(value: float | None) -> float | None:
    return value if value is not None and math.isfinite(value) else None


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _local_now(now: datetime, timezone_name: str) -> datetime:
    return now.astimezone(ZoneInfo(timezone_name))


def _between(value: time, start: time, end: time) -> bool:
    return start <= value <= end


def market_status_for_product(product: ProductDefinition, now: datetime) -> str:
    """Use conservative configured windows; holidays remain休市/未知 until a calendar is added."""
    if product.is_daily:
        return "不适用"
    timezone_name = product.market_timezone or "Asia/Shanghai"
    local_now = _local_now(now, timezone_name)
    if local_now.weekday() >= 5:
        return "休市"
    current = local_now.time().replace(tzinfo=None)
    schedule = product.market_schedule
    if schedule == "hong-kong":
        if _between(current, time(9, 30), time(12, 0)) or _between(
            current, time(13, 0), time(16, 0)
        ):
            return "交易中"
        return "休市" if current < time(9, 30) else "已收盘"
    if schedule == "japan":
        if _between(current, time(9, 0), time(11, 30)) or _between(
            current, time(12, 30), time(15, 30)
        ):
            return "交易中"
        return "休市" if current < time(9, 0) else "已收盘"
    if schedule == "korea":
        if _between(current, time(9, 0), time(15, 30)):
            return "交易中"
        return "休市" if current < time(9, 0) else "已收盘"
    if schedule == "new-york":
        if _between(current, time(9, 30), time(16, 0)):
            return "交易中"
        return "休市" if current < time(9, 30) else "已收盘"
    if schedule == "shfe":
        if _between(current, time(9, 0), time(11, 30)) or _between(
            current, time(13, 30), time(15, 0)
        ) or _between(current, time(21, 0), time(23, 59, 59)):
            return "交易中"
        return "休市" if current < time(9, 0) else "已收盘"
    if schedule in {"fx", "global-commodity"}:
        return "交易中"
    return "未知"


def realtime_freshness(
    product: ProductDefinition,
    quote: GlobalMarketRawQuote,
    now: datetime,
    *,
    fresh_seconds: int = 120,
    delayed_seconds: int = 600,
) -> str:
    if quote.latest is None:
        return "unknown"
    status = market_status_for_product(product, now)
    reference = _as_utc(quote.quoted_at) or _as_utc(quote.fetched_at)
    if reference is None:
        return "unknown"
    age = max(0.0, (_as_utc(now) - reference).total_seconds())
    if status in {"休市", "已收盘"}:
        # A valid last close must not become a fake real-time interruption overnight.
        return "fresh"
    if age <= fresh_seconds:
        return "fresh"
    if age <= delayed_seconds:
        return "delayed"
    return "interrupted"


def yield_freshness(as_of_date: date | None, now: datetime) -> str:
    if as_of_date is None:
        return "unknown"
    local_today = now.astimezone(ZoneInfo("Asia/Shanghai")).date()
    if as_of_date >= local_today:
        return "fresh"
    working_days = 0
    cursor = as_of_date + timedelta(days=1)
    while cursor <= local_today:
        if cursor.weekday() < 5:
            working_days += 1
        cursor += timedelta(days=1)
    return "fresh" if working_days <= 1 else "stale"


def _change_values(quote: GlobalMarketRawQuote) -> tuple[float | None, float | None]:
    latest = _safe_number(quote.latest)
    previous = _safe_number(quote.previous)
    change = _safe_number(quote.change)
    change_percent = _safe_number(quote.change_percent)
    if change is None and latest is not None and previous not in (None, 0):
        change = latest - previous
    if change_percent is None and change is not None and previous not in (None, 0):
        change_percent = change / previous * 100
    return _safe_number(change), _safe_number(change_percent)


def _item_from_quote(
    product: ProductDefinition,
    quote: GlobalMarketRawQuote | None,
    *,
    missing_reason: str | None,
    now: datetime,
    snapshot_id: str,
    stale: bool = False,
    error_message: str | None = None,
    settings: Settings | None = None,
) -> GlobalMarketItem:
    fresh_seconds = settings.global_market_fresh_seconds if settings else 120
    delayed_seconds = settings.global_market_delayed_seconds if settings else 600
    quality_profile = settings.global_market_quality_profile if settings else "global-market-v1"
    quote = quote or GlobalMarketRawQuote(
        product_id=product.id,
        source_symbol=product.source_symbol,
    )
    latest = _safe_number(quote.latest)
    change, change_percent = _change_values(quote)
    change_bp: float | None = None
    if product.is_daily:
        change = None
        change_percent = None
        if quote.previous is not None and latest is not None:
            change_bp = _safe_number((latest - quote.previous) * 100)
        freshness = yield_freshness(quote.as_of_date, now)
        market_status = "不适用"
    else:
        change_bp = None
        freshness = realtime_freshness(
            product,
            quote,
            now,
            fresh_seconds=fresh_seconds,
            delayed_seconds=delayed_seconds,
        )
        market_status = market_status_for_product(product, now)
    if stale and latest is not None:
        freshness = "stale"
    if latest is None:
        freshness = "unknown"
    return GlobalMarketItem(
        id=product.id,
        group=product.group,
        subgroup=product.subgroup,
        name=product.name,
        display_code=product.display_code,
        source_symbol=quote.source_symbol or product.source_symbol,
        value_kind=product.value_kind,
        latest=latest,
        change=change,
        change_percent=change_percent,
        change_bp=change_bp,
        unit=product.unit,
        quote_direction=product.quote_direction,
        precision=product.precision,
        market_status=market_status,
        freshness=freshness,
        quoted_at=_as_utc(quote.quoted_at),
        as_of_date=quote.as_of_date,
        fetched_at=_as_utc(quote.fetched_at),
        mapped_contract=quote.mapped_contract,
        provider_type="akshare",
        adapter_version=AKSHARE_VERSION,
        capability=capability_for_product(product),
        origin=product.origin,
        missing_reason=missing_reason or quote.missing_reason or error_message,
        snapshot_id=snapshot_id,
        quality_profile=quality_profile,
        source_status=quote.source_status if latest is not None else "missing",
    )


def unavailable_group(
    group: GlobalMarketGroup,
    message: str,
    *,
    now: datetime | None = None,
) -> GlobalMarketGroupResponse:
    current = now or datetime.now(UTC)
    snapshot_id = f"unavailable-{group}"
    items = [
        _item_from_quote(
            product,
            None,
            missing_reason=message,
            now=current,
            snapshot_id=snapshot_id,
        )
        for product in PRODUCTS_BY_GROUP[group]
    ]
    return GlobalMarketGroupResponse(
        state="unavailable",
        expected_count=EXPECTED_COUNTS[group],
        available_count=0,
        items=items,
        message=message,
    )


def build_group_snapshot(
    result: GlobalMarketFetchResult,
    now: datetime | None = None,
    *,
    stale: bool = False,
    settings: Settings | None = None,
) -> GlobalMarketGroupResponse:
    current = now or datetime.now(UTC)
    snapshot_id = f"global-market-{current.strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"
    products = PRODUCTS_BY_GROUP[result.group]
    items: list[GlobalMarketItem] = []
    for product in products:
        item = _item_from_quote(
            product,
            result.quotes.get(product.id),
            missing_reason=result.missing_reasons.get(product.id),
            now=current,
            snapshot_id=snapshot_id,
            stale=stale,
            error_message=(
                result.errors[0]
                if result.errors and product.id not in result.quotes
                else None
            ),
            settings=settings,
        )
        items.append(item)
    available_count = sum(item.latest is not None for item in items)
    expected_count = EXPECTED_COUNTS[result.group]
    if stale and available_count:
        state: GlobalMarketState = "stale"
        message = "当前展示最后一次成功快照"
    elif available_count == 0:
        state = "unavailable"
        message = result.errors[0] if result.errors else "当前数据组没有可用数据"
    elif available_count < expected_count or result.errors:
        state = "partial"
        message = "部分指标暂不可用，缺失项目保留固定位置"
    else:
        state = "ready"
        message = None
    return GlobalMarketGroupResponse(
        state=state,
        updated_at=result.fetched_at,
        expected_count=expected_count,
        available_count=available_count,
        items=items,
        message=message,
    )


def _mark_stale(group: GlobalMarketGroupResponse, message: str) -> GlobalMarketGroupResponse:
    copy = group.model_copy(deep=True)
    copy.state = "stale"
    copy.message = message
    copy.items = [
        item.model_copy(update={"freshness": "stale" if item.latest is not None else "unknown"})
        for item in copy.items
    ]
    return copy


async def _cache_get(cache: Redis, key: str) -> str | None:
    try:
        value = await cache.get(key)
    except RedisError:
        logger.warning("Global market cache read failed", extra={"cache_key": key})
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value if isinstance(value, str) else None


async def _cache_set(cache: Redis, key: str, value: str, seconds: int) -> bool:
    try:
        await cache.set(key, value, ex=seconds)
    except RedisError:
        logger.warning("Global market cache write failed", extra={"cache_key": key})
        return False
    return True


async def _load_group(cache: Redis, key: str) -> GlobalMarketGroupResponse | None:
    raw = await _cache_get(cache, key)
    if not raw:
        return None
    try:
        return GlobalMarketGroupResponse.model_validate_json(raw)
    except ValueError:
        logger.warning("Global market cache payload invalid", extra={"cache_key": key})
        return None


async def _is_refreshing(cache: Redis, group: GlobalMarketGroup) -> bool:
    return bool(await _cache_get(cache, _refreshing_key(group)))


async def _refresh_group(
    cache: Redis,
    settings: Settings,
    adapter: AkshareGlobalMarketAdapter,
    group: GlobalMarketGroup,
) -> RefreshResult:
    lock_token = uuid.uuid4().hex
    try:
        acquired = await cache.set(
            _lock_key(group),
            lock_token,
            ex=settings.global_market_lock_seconds,
            nx=True,
        )
    except RedisError:
        logger.warning("Global market lock unavailable", extra={"group": group})
        return RefreshResult(
            group=group,
            state="unavailable",
            acquired=False,
            message="缓存锁不可用",
        )
    if not acquired:
        return RefreshResult(
            group=group,
            state="unavailable",
            acquired=False,
            message="已有刷新任务",
        )

    await _cache_set(
        cache,
        _refreshing_key(group),
        lock_token,
        settings.global_market_lock_seconds,
    )
    try:
        try:
            result = await adapter.fetch_group(group)
        except GlobalMarketAdapterError as exc:
            result = GlobalMarketFetchResult(group=group, errors=[f"{exc.code}: {exc.message}"])
        snapshot = build_group_snapshot(result, settings=settings)
        if snapshot.state == "unavailable":
            last_success = await _load_group(cache, _last_success_key(group))
            if last_success is not None:
                snapshot = _mark_stale(last_success, "上游暂不可用，当前展示最后一次成功快照")
            else:
                current = await _load_group(cache, _current_key(group))
                if current is not None:
                    snapshot = current
        else:
            await _cache_set(
                cache,
                _last_success_key(group),
                snapshot.model_dump_json(),
                settings.global_market_retention_seconds,
            )
        await _cache_set(
            cache,
            _current_key(group),
            snapshot.model_dump_json(),
            _current_snapshot_ttl(group, settings),
        )
        if snapshot.state == "unavailable":
            await _cache_set(
                cache,
                _error_key(group),
                snapshot.message or "数据不可用",
                settings.global_market_retention_seconds,
            )
        return RefreshResult(
            group=group,
            state=snapshot.state,
            acquired=True,
            message=snapshot.message,
        )
    except Exception as exc:  # noqa: BLE001 - scheduler must isolate groups
        logger.exception("Global market group refresh failed", extra={"group": group})
        return RefreshResult(
            group=group,
            state="unavailable",
            acquired=True,
            message=f"刷新失败: {type(exc).__name__}",
        )
    finally:
        try:
            await cache.eval(
                """
                for _, key in ipairs(KEYS) do
                    if redis.call('get', key) == ARGV[1] then
                        redis.call('del', key)
                    end
                end
                return 1
                """,
                2,
                _lock_key(group),
                _refreshing_key(group),
                lock_token,
            )
        except RedisError:
            logger.warning("Global market lock release failed", extra={"group": group})


async def refresh_global_market(
    cache: Redis,
    settings: Settings,
    *,
    adapter: AkshareGlobalMarketAdapter | None = None,
) -> list[RefreshResult]:
    if not settings.akshare_enabled or not settings.global_market_enabled:
        return []
    active_adapter = adapter or AkshareGlobalMarketAdapter(settings.global_market_timeout_seconds)
    results: list[RefreshResult] = []
    for index, group in enumerate(REFRESH_GROUPS):
        if index > 0 and settings.global_market_group_stagger_seconds > 0:
            await asyncio.sleep(settings.global_market_group_stagger_seconds)
        results.append(await _refresh_group(cache, settings, active_adapter, group))
    return results


async def refresh_global_market_group(
    cache: Redis,
    settings: Settings,
    group: GlobalMarketGroup,
    *,
    adapter: AkshareGlobalMarketAdapter | None = None,
) -> RefreshResult:
    if not settings.akshare_enabled or not settings.global_market_enabled:
        return RefreshResult(
            group=group,
            state="unavailable",
            acquired=False,
            message="全球市场功能尚未启用",
        )
    active_adapter = adapter or AkshareGlobalMarketAdapter(settings.global_market_timeout_seconds)
    return await _refresh_group(cache, settings, active_adapter, group)


def _group_message_for_cache_error(group: GlobalMarketGroup) -> str:
    return "缓存暂时不可用，等待后台快照恢复"


async def read_global_market(cache: Redis, settings: Settings) -> GlobalMarketResponse:
    if not settings.akshare_enabled or not settings.global_market_enabled:
        message = "全球市场功能尚未启用"
        return GlobalMarketResponse(
            enabled=False,
            refresh_seconds=_global_market_poll_seconds(settings),
            polling_enabled=False,
            groups={group: unavailable_group(group, message) for group in GROUPS},
            message=message,
        )

    now = datetime.now(UTC)
    groups: dict[GlobalMarketGroup, GlobalMarketGroupResponse] = {}
    cache_failed = False
    for group in GROUPS:
        current = await _load_group(cache, _current_key(group))
        if current is None:
            stale = await _load_group(cache, _last_success_key(group))
            current = (
                _mark_stale(stale, "当前快照已过期，展示最后一次成功数据")
                if stale is not None
                else None
            )
        if current is None:
            # _cache_get deliberately turns Redis errors into None. Keep the API
            # deterministic and expose an unavailable group instead of fetching upstream.
            cache_failed = True
            current = unavailable_group(group, _group_message_for_cache_error(group), now=now)
        current.is_fetching = await _is_refreshing(cache, group)
        groups[group] = current
    all_unavailable = all(group.state == "unavailable" for group in groups.values())
    return GlobalMarketResponse(
        enabled=True,
        refresh_seconds=_global_market_poll_seconds(settings),
        polling_enabled=True,
        groups=groups,
        message=("当前没有可读取的全球市场快照" if all_unavailable or cache_failed else None),
    )


async def run_global_market_scheduler(cache: Redis, settings: Settings) -> None:
    """Run one lock-protected refresh loop per market group."""
    if not settings.akshare_enabled or not settings.global_market_enabled:
        return

    adapter = AkshareGlobalMarketAdapter(settings.global_market_timeout_seconds)
    tasks = [
        asyncio.create_task(
            run_global_market_group_scheduler(
                cache,
                settings,
                adapter,
                group,
                index * settings.global_market_group_stagger_seconds,
            ),
            name=f"dibobo-global-market-refresh-{group}",
        )
        for index, group in enumerate(REFRESH_GROUPS)
    ]
    try:
        await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def run_global_market_group_scheduler(
    cache: Redis,
    settings: Settings,
    adapter: AkshareGlobalMarketAdapter,
    group: GlobalMarketGroup,
    initial_delay: float,
) -> None:
    """Refresh a single group without allowing slow groups to delay fast ones."""
    if initial_delay > 0:
        await asyncio.sleep(initial_delay)

    interval = _refresh_seconds_for_group(group, settings)
    while True:
        try:
            await _refresh_group(cache, settings, adapter, group)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - one group must not stop its loop
            logger.exception(
                "Global market group scheduler iteration failed",
                extra={"group": group},
            )
        await asyncio.sleep(interval)
