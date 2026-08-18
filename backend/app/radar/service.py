import asyncio
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.database import SessionLocal
from app.core.models import DataSource, RadarSnapshot, User, WatchlistItem
from app.core.security import ApiKeyCipher
from app.data_sources.longbridge import (
    LongbridgeError,
    LongbridgeHttpClient,
    LongbridgeScreenerAdapter,
    LongbridgeScreenerItem,
)
from app.overview.schemas import DataSourceSummary
from app.radar.schemas import (
    RadarFilters,
    RadarItem,
    RadarResponse,
    RadarSearchPayload,
)
from app.settings.service import (
    _as_utc,
    _decode_credentials,
    _refresh_longbridge_source_token,
    _source_auth_type,
)

logger = logging.getLogger(__name__)

DEFAULT_RADAR_FILTERS = RadarFilters(
    market_cap_min=800,
    dividend_yield_min=4,
)


class RadarNotConfiguredError(Exception):
    """Raised when a user has no active Longbridge source for radar."""


@dataclass(frozen=True, slots=True)
class RadarSearchResult:
    items: list[LongbridgeScreenerItem]
    generated_at: datetime


async def _active_longbridge_source(
    db: AsyncSession,
    user: User,
) -> DataSource | None:
    return await db.scalar(
        select(DataSource).where(
            DataSource.user_id == user.id,
            DataSource.provider_type == "longbridge",
            DataSource.is_active.is_(True),
        )
    )


def _source_error_state(code: int) -> str:
    if code == 2001:
        return "authentication_failed"
    if code == 4001:
        return "rate_limited"
    return "unavailable"


def _source_summary(
    source: DataSource | None,
    *,
    message: str | None = None,
    error_code: int | None = None,
) -> DataSourceSummary:
    if source is None:
        return DataSourceSummary(
            state="not_configured",
            message=message or "请先配置并启用 Longbridge 数据源",
        )
    if error_code is not None:
        return DataSourceSummary(
            state=_source_error_state(error_code),
            name=source.name,
            message=message,
        )
    return DataSourceSummary(state="ready", name=source.name, message=message)


@asynccontextmanager
async def _longbridge_client(
    db: AsyncSession,
    source: DataSource,
    settings: Settings,
):
    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    credentials = _decode_credentials(cipher, source.api_key_ciphertext)
    auth_type = _source_auth_type(source)
    if auth_type == "oauth":
        access_token = credentials.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise LongbridgeError("Longbridge 尚未完成 OAuth 授权，请先授权", code=2001)
        expires_at = _as_utc(source.oauth_expires_at)
        if expires_at is not None and expires_at <= datetime.now(UTC) + timedelta(seconds=60):
            credentials = await _refresh_longbridge_source_token(
                source, credentials, cipher, settings
            )
            await db.commit()

    async with LongbridgeHttpClient(
        source.base_url,
        auth_type,  # type: ignore[arg-type]
        credentials,
        settings.upstream_timeout_seconds,
    ) as client:
        yield client


def _matches_filters(item: LongbridgeScreenerItem, filters: RadarFilters) -> bool:
    for value, minimum, maximum in (
        (item.market_cap, filters.market_cap_min, filters.market_cap_max),
        (item.dividend_yield, filters.dividend_yield_min, filters.dividend_yield_max),
        (item.pb, filters.pb_min, filters.pb_max),
        (item.pe_ttm, filters.pe_min, filters.pe_max),
    ):
        # Missing indicators are intentionally retained. A populated value
        # must explicitly fail the range before a row is excluded.
        if value is None:
            continue
        if minimum is not None and value < minimum:
            return False
        if maximum is not None and value > maximum:
            return False
    return True


async def _fetch_all_screener_items(
    db: AsyncSession,
    source: DataSource,
    filters: RadarFilters,
    settings: Settings,
) -> RadarSearchResult:
    started_at = datetime.now(UTC)
    collected: list[LongbridgeScreenerItem] = []
    seen: set[str] = set()
    page = 0
    total = 0

    async with _longbridge_client(db, source, settings) as client:
        adapter = LongbridgeScreenerAdapter(client)
        while page < 500:
            result = await adapter.search(
                filters.model_dump(),
                page=page,
                size=settings.radar_fetch_page_size,
            )
            total = max(total, result.total)
            previous_seen = len(seen)
            for item in result.items:
                if item.thscode in seen:
                    continue
                seen.add(item.thscode)
                if _matches_filters(item, filters):
                    collected.append(item)

            if not result.items or len(seen) == previous_seen or len(seen) >= total:
                break
            page += 1

    logger.info(
        "Longbridge radar search completed",
        extra={
            "data_source_id": str(source.id),
            "page_count": page + 1,
            "upstream_total": total,
            "result_count": len(collected),
            "duration_ms": round((datetime.now(UTC) - started_at).total_seconds() * 1000),
        },
    )
    return RadarSearchResult(items=collected, generated_at=datetime.now(UTC))


async def _watchlist_codes(db: AsyncSession, user: User) -> set[str]:
    values = await db.scalars(select(WatchlistItem.thscode).where(WatchlistItem.user_id == user.id))
    return set(values.all())


def _to_radar_item(item: LongbridgeScreenerItem, watchlist_codes: set[str]) -> RadarItem:
    missing_fields = [
        label
        for value, label in (
            (item.market_cap, "市值"),
            (item.dividend_yield, "股息率"),
            (item.pb, "市净率"),
            (item.pe_ttm, "市盈率"),
        )
        if value is None
    ]
    return RadarItem(
        thscode=item.thscode,
        ticker=item.ticker,
        name=item.name,
        exchange=item.exchange,
        latest=item.latest,
        change_percent=item.change_percent,
        market_cap=item.market_cap,
        dividend_yield=item.dividend_yield,
        pb=item.pb,
        pe_ttm=item.pe_ttm,
        industry=item.industry,
        quoted_at=item.quoted_at,
        data_quality="incomplete" if missing_fields else "complete",
        missing_fields=missing_fields,
        in_watchlist=item.thscode in watchlist_codes,
    )


def _paginate[T](items: list[T], page: int, page_size: int) -> list[T]:
    start = (page - 1) * page_size
    return items[start : start + page_size]


def _response_from_items(
    *,
    items: list[RadarItem],
    payload: RadarSearchPayload,
    result_type: str,
    data_source: DataSourceSummary,
    generated_at: datetime | None,
    snapshot_status: str,
    daily_snapshot_at: datetime | None = None,
    daily_snapshot_error: str | None = None,
    stale: bool = False,
) -> RadarResponse:
    return RadarResponse(
        items=_paginate(items, payload.page, payload.page_size),
        total=len(items),
        page=payload.page,
        page_size=payload.page_size,
        filters=payload.filters,
        result_type=result_type,  # type: ignore[arg-type]
        snapshot_status=snapshot_status,  # type: ignore[arg-type]
        generated_at=generated_at,
        daily_snapshot_at=daily_snapshot_at,
        daily_snapshot_error=daily_snapshot_error,
        data_source=data_source,
        stale=stale,
    )


async def search_radar(
    db: AsyncSession,
    user: User,
    payload: RadarSearchPayload,
    settings: Settings,
) -> RadarResponse:
    source = await _active_longbridge_source(db, user)
    if source is None:
        raise RadarNotConfiguredError("请先配置并启用 Longbridge 数据源")

    result = await _fetch_all_screener_items(db, source, payload.filters, settings)
    watchlist_codes = await _watchlist_codes(db, user)
    items = [_to_radar_item(item, watchlist_codes) for item in result.items]
    return _response_from_items(
        items=items,
        payload=payload,
        result_type="manual",
        data_source=_source_summary(source),
        generated_at=result.generated_at,
        snapshot_status="never",
    )


def _default_payload(page: int, page_size: int) -> RadarSearchPayload:
    return RadarSearchPayload(filters=DEFAULT_RADAR_FILTERS, page=page, page_size=page_size)


def _snapshot_items(snapshot: RadarSnapshot, watchlist_codes: set[str]) -> list[RadarItem]:
    normalized: list[RadarItem] = []
    for raw_item in snapshot.items:
        try:
            item = RadarItem.model_validate(raw_item)
        except Exception:  # noqa: BLE001 - one malformed cached row must not break the page
            logger.warning(
                "Ignoring malformed radar snapshot item",
                extra={"snapshot_id": str(snapshot.id)},
            )
            continue
        item.in_watchlist = item.thscode in watchlist_codes
        normalized.append(item)
    return normalized


async def read_daily_radar(
    db: AsyncSession,
    user: User,
    settings: Settings,
    *,
    page: int,
    page_size: int,
) -> RadarResponse:
    source = await _active_longbridge_source(db, user)
    payload = _default_payload(page, page_size)
    if source is None:
        return _response_from_items(
            items=[],
            payload=payload,
            result_type="daily",
            data_source=_source_summary(None),
            generated_at=None,
            snapshot_status="never",
        )

    snapshot = await db.scalar(
        select(RadarSnapshot).where(RadarSnapshot.user_id == user.id)
    )
    if snapshot is None or snapshot.data_source_id != source.id:
        return _response_from_items(
            items=[],
            payload=payload,
            result_type="daily",
            data_source=_source_summary(source, message="等待每日默认策略快照，或先执行手动同步"),
            generated_at=None,
            snapshot_status="never",
        )

    watchlist_codes = await _watchlist_codes(db, user)
    items = _snapshot_items(snapshot, watchlist_codes)
    filters = RadarFilters.model_validate(snapshot.filters)
    payload = RadarSearchPayload(filters=filters, page=page, page_size=page_size)
    generated_at = _as_utc(snapshot.generated_at)
    failed = snapshot.status != "success"
    return _response_from_items(
        items=items,
        payload=payload,
        result_type="daily",
        data_source=_source_summary(
            source,
            message=("上次刷新失败，当前展示最近一次成功快照" if failed else None),
        ),
        generated_at=generated_at,
        snapshot_status="failed" if failed else "success",
        daily_snapshot_at=generated_at,
        daily_snapshot_error=snapshot.last_error,
        stale=failed,
    )


def _snapshot_values(items: list[LongbridgeScreenerItem]) -> list[dict[str, object]]:
    return [
        _to_radar_item(item, set()).model_dump(mode="json", exclude={"in_watchlist"})
        for item in items
    ]


async def _persist_daily_success(
    db: AsyncSession,
    user: User,
    source: DataSource,
    filters: RadarFilters,
    result: RadarSearchResult,
    run_date: date,
) -> RadarSnapshot:
    snapshot = await db.scalar(
        select(RadarSnapshot).where(RadarSnapshot.user_id == user.id)
    )
    if snapshot is None:
        snapshot = RadarSnapshot(user_id=user.id)
        db.add(snapshot)
    snapshot.data_source_id = source.id
    snapshot.run_date = run_date
    snapshot.filters = filters.model_dump(mode="json")
    snapshot.items = _snapshot_values(result.items)
    snapshot.total = len(result.items)
    snapshot.status = "success"
    snapshot.generated_at = result.generated_at
    snapshot.last_error = None
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


async def _persist_daily_failure(
    db: AsyncSession,
    user: User,
    source: DataSource,
    filters: RadarFilters,
    run_date: date,
    error_message: str,
) -> RadarSnapshot:
    snapshot = await db.scalar(
        select(RadarSnapshot).where(RadarSnapshot.user_id == user.id)
    )
    if snapshot is None:
        snapshot = RadarSnapshot(
            user_id=user.id,
            data_source_id=source.id,
            run_date=run_date,
            filters=filters.model_dump(mode="json"),
            items=[],
            total=0,
            status="failed",
            generated_at=datetime.now(UTC),
            last_error=error_message,
        )
        db.add(snapshot)
    else:
        source_changed = snapshot.data_source_id != source.id
        snapshot.data_source_id = source.id
        snapshot.run_date = run_date
        snapshot.status = "failed"
        snapshot.last_error = error_message
        if source_changed:
            snapshot.filters = filters.model_dump(mode="json")
            snapshot.items = []
            snapshot.total = 0
            snapshot.generated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


async def refresh_daily_radar(
    db: AsyncSession,
    user: User,
    settings: Settings,
    *,
    run_date: date | None = None,
) -> RadarSnapshot | None:
    source = await _active_longbridge_source(db, user)
    if source is None:
        return None
    local_date = run_date or datetime.now(ZoneInfo(settings.timezone)).date()
    existing = await db.scalar(
        select(RadarSnapshot).where(RadarSnapshot.user_id == user.id)
    )
    if (
        existing is not None
        and existing.data_source_id == source.id
        and existing.run_date == local_date
        and existing.status == "success"
    ):
        return existing
    try:
        result = await _fetch_all_screener_items(db, source, DEFAULT_RADAR_FILTERS, settings)
    except LongbridgeError as exc:
        logger.warning(
            "Daily radar refresh failed",
            extra={
                "user_id": str(user.id),
                "data_source_id": str(source.id),
                "code": exc.code,
            },
        )
        return await _persist_daily_failure(
            db,
            user,
            source,
            DEFAULT_RADAR_FILTERS,
            local_date,
            exc.user_message,
        )
    return await _persist_daily_success(
        db,
        user,
        source,
        DEFAULT_RADAR_FILTERS,
        result,
        local_date,
    )


async def run_daily_radar_for_all_users(settings: Settings) -> None:
    async with SessionLocal() as db:
        users = list(
            (
                await db.scalars(
                    select(User)
                    .join(DataSource, DataSource.user_id == User.id)
                    .where(
                        User.is_active.is_(True),
                        DataSource.provider_type == "longbridge",
                        DataSource.is_active.is_(True),
                    )
                )
            ).unique().all()
        )
        for user in users:
            try:
                await refresh_daily_radar(db, user, settings)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - one user's task must not stop the daily run
                await db.rollback()
                logger.exception(
                    "Unexpected daily radar refresh error",
                    extra={"user_id": str(user.id)},
                )


def _next_daily_run(now: datetime, settings: Settings) -> datetime:
    timezone = ZoneInfo(settings.timezone)
    local_now = now.astimezone(timezone)
    target_time = time(settings.radar_daily_hour, settings.radar_daily_minute)
    target = datetime.combine(local_now.date(), target_time, tzinfo=timezone)
    if local_now >= target:
        target += timedelta(days=1)
    return target


async def run_radar_scheduler(settings: Settings) -> None:
    """Run the default radar refresh once per day at the configured local time."""
    if not settings.radar_scheduler_enabled:
        return

    timezone = ZoneInfo(settings.timezone)
    while True:
        now = datetime.now(timezone)
        target_time = time(settings.radar_daily_hour, settings.radar_daily_minute)
        target = datetime.combine(now.date(), target_time, tzinfo=timezone)
        if now >= target:
            logger.info("Starting daily radar refresh", extra={"run_date": now.date().isoformat()})
            try:
                await run_daily_radar_for_all_users(settings)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001 - scheduler must continue after an iteration failure
                logger.exception("Daily radar scheduler iteration failed")
            next_run = _next_daily_run(datetime.now(UTC), settings)
            await asyncio.sleep(max(1, (next_run - datetime.now(UTC)).total_seconds()))
            continue

        await asyncio.sleep(max(1, (target - now).total_seconds()))
