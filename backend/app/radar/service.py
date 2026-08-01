import logging
import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import ColumnElement, and_, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, RadarMetric, RadarSearch, RadarSnapshot, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import Instrument, SecurityQuoteBatch
from app.data_sources.fuyao import FuyaoAdapter
from app.overview.service import get_cached_calendar, resolve_market_status
from app.radar.schemas import (
    RadarFilters,
    RadarQuoteItem,
    RadarQuotesResponse,
    RadarResultItem,
    RadarSearchRequest,
    RadarSearchResponse,
    RadarStatusResponse,
)

logger = logging.getLogger(__name__)

SORT_COLUMNS: dict[str, Any] = {
    "latest": RadarMetric.latest,
    "change_percent": RadarMetric.change_percent,
    "total_market_cap": RadarMetric.total_market_cap,
    "dividend_yield_ttm": RadarMetric.dividend_yield_ttm,
    "pb_mrq": RadarMetric.pb_mrq,
    "roe_weighted": RadarMetric.roe_weighted,
    "consecutive_dividend_years": RadarMetric.consecutive_dividend_years,
}
FILTER_COLUMNS: dict[str, Any] = {
    "total_market_cap": RadarMetric.total_market_cap,
    "dividend_yield_ttm": RadarMetric.dividend_yield_ttm,
    "pb_mrq": RadarMetric.pb_mrq,
    "roe_weighted": RadarMetric.roe_weighted,
}


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def get_active_source(db: AsyncSession, user: User) -> DataSource | None:
    return await db.scalar(
        select(DataSource).where(
            DataSource.user_id == user.id,
            DataSource.is_active.is_(True),
        )
    )


async def get_radar_status(db: AsyncSession, user: User) -> RadarStatusResponse:
    source = await get_active_source(db, user)
    if source is None:
        return RadarStatusResponse(
            state="not_configured",
            message="请先在系统设置中测试并启用数据源",
        )
    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        return RadarStatusResponse(
            state="unsupported",
            data_source_name=source.name,
            message="当前版本尚不支持该数据源类型",
        )

    latest_attempt = await db.scalar(
        select(RadarSnapshot)
        .where(RadarSnapshot.data_source_id == source.id)
        .order_by(RadarSnapshot.started_at.desc())
        .limit(1)
    )
    ready = await db.scalar(
        select(RadarSnapshot)
        .where(
            RadarSnapshot.data_source_id == source.id,
            RadarSnapshot.status == "ready",
        )
        .order_by(RadarSnapshot.completed_at.desc())
        .limit(1)
    )
    total_market_cap_supported = source.capabilities.get("total_market_cap") == "supported"
    if latest_attempt is None:
        return RadarStatusResponse(
            state="not_synced",
            data_source_name=source.name,
            message="尚未生成全市场指标快照，首次同步可能需要较长时间",
            total_market_cap_supported=total_market_cap_supported,
        )
    if latest_attempt.status == "building":
        return RadarStatusResponse(
            state="syncing",
            data_source_name=source.name,
            message="正在后台同步代码表、估值、财务与分红数据",
            snapshot_id=ready.id if ready else latest_attempt.id,
            snapshot_time=ready.as_of if ready else None,
            started_at=latest_attempt.started_at,
            completed_at=ready.completed_at if ready else None,
            instrument_count=latest_attempt.instrument_count,
            eligible_count=ready.eligible_count if ready else 0,
            incomplete_count=ready.incomplete_count if ready else 0,
            excluded_count=ready.excluded_count if ready else latest_attempt.excluded_count,
            total_market_cap_supported=total_market_cap_supported,
            can_search=ready is not None,
        )
    if latest_attempt.status == "failed":
        return RadarStatusResponse(
            state="partial_failed" if ready else "failed",
            data_source_name=source.name,
            message=(
                f"最新同步失败，继续使用上次完整快照：{latest_attempt.error_summary}"
                if ready
                else latest_attempt.error_summary or "雷达指标同步失败"
            ),
            snapshot_id=ready.id if ready else latest_attempt.id,
            snapshot_time=ready.as_of if ready else None,
            started_at=latest_attempt.started_at,
            completed_at=ready.completed_at if ready else latest_attempt.completed_at,
            instrument_count=ready.instrument_count if ready else latest_attempt.instrument_count,
            eligible_count=ready.eligible_count if ready else 0,
            incomplete_count=ready.incomplete_count if ready else 0,
            excluded_count=ready.excluded_count if ready else latest_attempt.excluded_count,
            total_market_cap_supported=total_market_cap_supported,
            can_search=ready is not None,
        )
    snapshot = ready or latest_attempt
    return RadarStatusResponse(
        state="ready",
        data_source_name=source.name,
        message="完整指标快照可用",
        snapshot_id=snapshot.id,
        snapshot_time=snapshot.as_of,
        started_at=snapshot.started_at,
        completed_at=snapshot.completed_at,
        instrument_count=snapshot.instrument_count,
        eligible_count=snapshot.eligible_count,
        incomplete_count=snapshot.incomplete_count,
        excluded_count=snapshot.excluded_count,
        total_market_cap_supported=total_market_cap_supported,
        can_search=True,
    )


def _filter_clauses(
    filters: RadarFilters,
) -> tuple[list[ColumnElement[bool]], ColumnElement[bool]]:
    clauses: list[ColumnElement[bool]] = []
    missing_checks: list[ColumnElement[bool]] = []
    for name, column in FILTER_COLUMNS.items():
        number_range = getattr(filters, name)
        if number_range.minimum is None and number_range.maximum is None:
            continue
        known_conditions: list[ColumnElement[bool]] = []
        unit_multiplier = 100_000_000 if name == "total_market_cap" else 1
        if number_range.minimum is not None:
            known_conditions.append(column >= number_range.minimum * unit_multiplier)
        if number_range.maximum is not None:
            known_conditions.append(column <= number_range.maximum * unit_multiplier)
        clauses.append(or_(column.is_(None), and_(*known_conditions)))
        missing_checks.append(column.is_(None))
    return clauses, or_(*missing_checks) if missing_checks else literal(False)


def _sort_clauses(
    missing: ColumnElement[bool],
    sort_by: str,
    sort_direction: str,
) -> list[Any]:
    column = SORT_COLUMNS[sort_by]
    direction = column.asc() if sort_direction == "asc" else column.desc()
    return [
        case((missing, 1), else_=0).asc(),
        case((column.is_(None), 1), else_=0).asc(),
        direction,
        RadarMetric.thscode.asc(),
    ]


async def _owned_search(
    db: AsyncSession,
    user: User,
    search_id: uuid.UUID,
) -> RadarSearch:
    search = await db.scalar(
        select(RadarSearch).where(
            RadarSearch.id == search_id,
            RadarSearch.user_id == user.id,
        )
    )
    if search is None or _as_utc(search.expires_at) <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="筛选快照已过期，请重新筛选",
        )
    return search


def _is_result_incomplete(metric: RadarMetric, filters: RadarFilters) -> bool:
    for name in FILTER_COLUMNS:
        number_range = getattr(filters, name)
        if (
            number_range.minimum is not None or number_range.maximum is not None
        ) and getattr(metric, name) is None:
            return True
    return False


def _result_item(metric: RadarMetric, filters: RadarFilters) -> RadarResultItem:
    return RadarResultItem(
        thscode=metric.thscode,
        ticker=metric.ticker,
        name=metric.name,
        exchange=metric.exchange,
        latest=float(metric.latest) if metric.latest is not None else None,
        change_percent=(
            float(metric.change_percent) if metric.change_percent is not None else None
        ),
        total_market_cap=(
            float(metric.total_market_cap) / 100_000_000
            if metric.total_market_cap is not None
            else None
        ),
        dividend_yield_ttm=(
            float(metric.dividend_yield_ttm)
            if metric.dividend_yield_ttm is not None
            else None
        ),
        pb_mrq=float(metric.pb_mrq) if metric.pb_mrq is not None else None,
        roe_weighted=(
            float(metric.roe_weighted) if metric.roe_weighted is not None else None
        ),
        roe_report_period=metric.roe_report_period,
        consecutive_dividend_years=metric.consecutive_dividend_years,
        metric_time=metric.metric_time,
        quoted_at=metric.quoted_at,
        data_incomplete=_is_result_incomplete(metric, filters),
        missing_reasons=metric.missing_reasons,
    )


async def search_radar(
    db: AsyncSession,
    user: User,
    payload: RadarSearchRequest,
) -> RadarSearchResponse:
    if payload.search_id is not None:
        search = await _owned_search(db, user, payload.search_id)
        filters = RadarFilters.model_validate(search.filters)
        snapshot = await db.get(RadarSnapshot, search.snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="雷达指标快照不存在")
    else:
        source = await get_active_source(db, user)
        if source is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先启用数据源")
        filters = payload.filters
        market_cap_range = filters.total_market_cap
        if (
            market_cap_range.minimum is not None or market_cap_range.maximum is not None
        ) and source.capabilities.get("total_market_cap") != "supported":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="当前数据源暂不支持总市值筛选",
            )
        snapshot = await db.scalar(
            select(RadarSnapshot)
            .where(
                RadarSnapshot.data_source_id == source.id,
                RadarSnapshot.status == "ready",
            )
            .order_by(RadarSnapshot.completed_at.desc())
            .limit(1)
        )
        if snapshot is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="完整雷达指标快照尚未就绪",
            )
        search = RadarSearch(
            user_id=user.id,
            data_source_id=source.id,
            snapshot_id=snapshot.id,
            filters=filters.model_dump(mode="json"),
            sort_by=payload.sort_by,
            sort_direction=payload.sort_direction,
            current_page=payload.page,
            page_size=payload.page_size,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
        db.add(search)

    clauses, missing = _filter_clauses(filters)
    where = [RadarMetric.snapshot_id == snapshot.id, *clauses]
    total = int(await db.scalar(select(func.count()).select_from(RadarMetric).where(*where)) or 0)
    incomplete_total = int(
        await db.scalar(
            select(func.count()).select_from(RadarMetric).where(*where, missing)
        )
        or 0
    )
    statement = (
        select(RadarMetric)
        .where(*where)
        .order_by(*_sort_clauses(missing, payload.sort_by, payload.sort_direction))
        .offset((payload.page - 1) * payload.page_size)
        .limit(payload.page_size)
    )
    metrics = list((await db.scalars(statement)).all())
    search.sort_by = payload.sort_by
    search.sort_direction = payload.sort_direction
    search.current_page = payload.page
    search.page_size = payload.page_size
    search.total_results = total
    search.incomplete_results = incomplete_total
    await db.commit()
    await db.refresh(search)
    return RadarSearchResponse(
        search_id=search.id,
        snapshot_id=snapshot.id,
        snapshot_time=snapshot.as_of,
        page=payload.page,
        page_size=payload.page_size,
        total=total,
        pages=math.ceil(total / payload.page_size) if total else 0,
        incomplete_total=incomplete_total,
        sort_by=payload.sort_by,
        sort_direction=payload.sort_direction,
        items=[_result_item(metric, filters) for metric in metrics],
    )


async def _cache_get(cache: Redis, key: str) -> str | None:
    try:
        value = await cache.get(key)
    except RedisError:
        return None
    return value if isinstance(value, str) else None


async def _cache_set(cache: Redis, key: str, value: str, seconds: int) -> None:
    try:
        await cache.set(key, value, ex=seconds)
    except RedisError:
        logger.warning("Radar quote cache write failed", extra={"cache_key": key})


async def get_radar_quotes(
    db: AsyncSession,
    cache: Redis,
    user: User,
    search_id: uuid.UUID,
    page: int | None,
    settings: Settings,
) -> RadarQuotesResponse:
    search = await _owned_search(db, user, search_id)
    if page is not None:
        search.current_page = page
        await db.commit()
    filters = RadarFilters.model_validate(search.filters)
    clauses, missing = _filter_clauses(filters)
    statement = (
        select(RadarMetric)
        .where(RadarMetric.snapshot_id == search.snapshot_id, *clauses)
        .order_by(*_sort_clauses(missing, search.sort_by, search.sort_direction))
        .offset((search.current_page - 1) * search.page_size)
        .limit(search.page_size)
    )
    metrics = list((await db.scalars(statement)).all())
    source = await db.get(DataSource, search.data_source_id)
    static_items = [
        RadarQuoteItem(
            thscode=item.thscode,
            latest=float(item.latest) if item.latest is not None else None,
            change_percent=(
                float(item.change_percent) if item.change_percent is not None else None
            ),
            quoted_at=item.quoted_at,
        )
        for item in metrics
    ]
    if source is None or source.provider_type not in {"fuyao", "fuyao_compatible"} or not metrics:
        return RadarQuotesResponse(
            search_id=search.id,
            page=search.current_page,
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            items=static_items,
        )

    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    try:
        api_key = cipher.decrypt(source.api_key_ciphertext)
    except ValueError:
        return RadarQuotesResponse(
            search_id=search.id,
            page=search.current_page,
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=True,
            items=static_items,
        )
    instruments = [
        Instrument(
            thscode=item.thscode,
            ticker=item.ticker,
            name=item.name,
            asset_type="a_share",
            exchange=item.exchange,  # type: ignore[arg-type]
        )
        for item in metrics
    ]
    signature = ",".join(item.thscode for item in instruments)
    cache_key = f"quotes:radar:{source.id}:{signature}"
    stale_key = f"quotes:radar:last-success:{source.id}:{signature}"
    cached = await _cache_get(cache, cache_key)
    batch: SecurityQuoteBatch | None = (
        SecurityQuoteBatch.model_validate_json(cached) if cached else None
    )
    stale = False
    market_status = "未知"
    try:
        async with FuyaoAdapter(
            source.base_url,
            api_key,
            settings.upstream_timeout_seconds,
        ) as adapter:
            calendar = await get_cached_calendar(cache, source, adapter)
            market_status = resolve_market_status(datetime.now(UTC), calendar.dates)
            if batch is None:
                try:
                    batch = await adapter.get_security_quotes(
                        instruments,
                        settings.upstream_concurrency,
                    )
                    serialized = batch.model_dump_json()
                    await _cache_set(
                        cache,
                        cache_key,
                        serialized,
                        settings.quote_refresh_seconds,
                    )
                    await _cache_set(cache, stale_key, serialized, 24 * 60 * 60)
                except DataSourceError:
                    stale_cached = await _cache_get(cache, stale_key)
                    if stale_cached:
                        batch = SecurityQuoteBatch.model_validate_json(stale_cached)
                        stale = True
                    else:
                        raise
    except DataSourceError:
        return RadarQuotesResponse(
            search_id=search.id,
            page=search.current_page,
            market_status=market_status,
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=True,
            items=static_items,
        )

    quotes = {item.thscode: item for item in batch.quotes} if batch else {}
    return RadarQuotesResponse(
        search_id=search.id,
        page=search.current_page,
        market_status=market_status,
        polling_enabled=market_status == "交易中",
        refresh_seconds=settings.quote_refresh_seconds,
        stale=stale,
        items=[
            RadarQuoteItem(
                thscode=item.thscode,
                latest=quotes[item.thscode].latest if item.thscode in quotes else None,
                change_percent=(
                    quotes[item.thscode].change_percent if item.thscode in quotes else None
                ),
                quoted_at=quotes[item.thscode].quoted_at if item.thscode in quotes else None,
            )
            for item in metrics
        ],
    )
