import hashlib
import json
import logging
import math
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import (
    DataSource,
    RadarIndicatorCache,
    RadarSearchJob,
    User,
)
from app.core.models import RadarSearchResult as RadarSearchResultRow
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import Instrument, SecurityQuoteBatch
from app.data_sources.fuyao import FuyaoAdapter
from app.overview.service import get_cached_calendar, resolve_market_status
from app.radar.schemas import (
    RadarQuoteItem,
    RadarQuotesResponse,
    RadarResultItem,
    RadarSearchQueuedResponse,
    RadarSearchRequest,
    RadarSearchResponse,
    RadarSearchStatusResponse,
    RadarSortField,
    RadarStatusResponse,
    SortDirection,
)
from app.radar.upstream_control import RadarUpstreamController

logger = logging.getLogger(__name__)

SORT_COLUMNS: dict[str, Any] = {
    "latest": RadarSearchResultRow.latest,
    "change_percent": RadarSearchResultRow.change_percent,
    "total_market_cap": RadarSearchResultRow.total_market_cap,
    "dividend_yield_ttm": RadarSearchResultRow.dividend_yield_ttm,
    "pb_mrq": RadarSearchResultRow.pb_mrq,
    "roe_weighted": RadarSearchResultRow.roe_weighted,
    "consecutive_dividend_years": RadarSearchResultRow.consecutive_dividend_years,
}


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _search_fingerprint(payload: RadarSearchRequest) -> str:
    canonical = json.dumps(
        payload.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def recover_stale_search_jobs(db: AsyncSession, settings: Settings) -> int:
    now = datetime.now(UTC)
    queued_cutoff = now - timedelta(seconds=settings.radar_queued_stale_seconds)
    running_cutoff = now - timedelta(minutes=settings.radar_running_stale_minutes)
    result = await db.execute(
        update(RadarSearchJob)
        .where(
            or_(
                (
                    (RadarSearchJob.state == "queued")
                    & (RadarSearchJob.created_at < queued_cutoff)
                ),
                (
                    (RadarSearchJob.state == "running")
                    & (RadarSearchJob.started_at.is_not(None))
                    & (RadarSearchJob.started_at < running_cutoff)
                ),
            )
        )
        .values(
            state="failed",
            stage="failed",
            stage_message="后台检索任务已失去执行器",
            error_summary="检索任务异常中断，请重新搜索",
            completed_at=now,
        )
        .execution_options(synchronize_session=False)
    )
    await db.commit()
    return int(result.rowcount or 0)


async def mark_search_failed(
    db: AsyncSession,
    search_id: uuid.UUID,
    message: str,
) -> None:
    await db.execute(
        update(RadarSearchJob)
        .where(
            RadarSearchJob.id == search_id,
            RadarSearchJob.state.in_(("queued", "running")),
        )
        .values(
            state="failed",
            stage="failed",
            stage_message="后台检索任务异常退出",
            error_summary=message,
            completed_at=datetime.now(UTC),
        )
        .execution_options(synchronize_session=False)
    )
    await db.commit()


async def mark_search_waiting(db: AsyncSession, search_id: uuid.UUID) -> None:
    job = await db.get(RadarSearchJob, search_id)
    if job is None or job.state != "queued":
        return
    job.state = "running"
    job.stage = "queued"
    job.stage_message = "等待同一数据源的检索任务完成"
    job.started_at = datetime.now(UTC)
    await db.commit()


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

    cache_count = int(
        await db.scalar(
            select(func.count())
            .select_from(RadarIndicatorCache)
            .where(
                RadarIndicatorCache.data_source_id == source.id,
                RadarIndicatorCache.is_active_universe.is_(True),
            )
        )
        or 0
    )
    cache_updated_at = await db.scalar(
        select(func.max(RadarIndicatorCache.updated_at)).where(
            RadarIndicatorCache.data_source_id == source.id,
            RadarIndicatorCache.is_active_universe.is_(True),
        )
    )
    return RadarStatusResponse(
        state="ready",
        data_source_name=source.name,
        message="按需检索引擎已就绪；搜索时只刷新缺失或过期指标",
        cache_instrument_count=cache_count,
        cache_updated_at=cache_updated_at,
        total_market_cap_supported=source.capabilities.get("total_market_cap") == "supported",
        can_search=True,
    )


async def create_search_job(
    db: AsyncSession,
    user: User,
    payload: RadarSearchRequest,
    settings: Settings,
) -> tuple[RadarSearchJob, RadarSearchQueuedResponse, bool]:
    source = await get_active_source(db, user)
    if source is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先启用数据源")
    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前版本尚不支持该数据源类型",
        )
    market_cap_range = payload.filters.total_market_cap
    if (
        market_cap_range.minimum is not None
        or market_cap_range.maximum is not None
        or payload.sort_by == "total_market_cap"
    ) and source.capabilities.get("total_market_cap") != "supported":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前数据源暂不支持总市值筛选",
        )

    await recover_stale_search_jobs(db, settings)
    now = datetime.now(UTC)
    await db.execute(
        delete(RadarSearchJob)
        .where(RadarSearchJob.expires_at <= now)
        .execution_options(synchronize_session=False)
    )
    fingerprint = _search_fingerprint(payload)
    ready_cutoff = now - timedelta(seconds=settings.radar_search_reuse_seconds)
    active_cutoff = now - timedelta(minutes=settings.radar_running_stale_minutes)
    reusable = await db.scalar(
        select(RadarSearchJob)
        .where(
            RadarSearchJob.user_id == user.id,
            RadarSearchJob.data_source_id == source.id,
            RadarSearchJob.request_fingerprint == fingerprint,
            RadarSearchJob.expires_at > now,
            or_(
                (
                    RadarSearchJob.state.in_(("queued", "running"))
                    & (RadarSearchJob.created_at >= active_cutoff)
                ),
                (
                    (RadarSearchJob.state == "ready")
                    & (RadarSearchJob.completed_at.is_not(None))
                    & (RadarSearchJob.completed_at >= ready_cutoff)
                ),
            ),
        )
        .order_by(RadarSearchJob.created_at.desc())
        .limit(1)
    )
    if reusable is not None:
        state = reusable.state if reusable.state in {"queued", "running", "ready"} else "queued"
        return (
            reusable,
            RadarSearchQueuedResponse(
                search_id=reusable.id,
                state=state,  # type: ignore[arg-type]
                message="已复用相同条件的检索任务",
            ),
            False,
        )

    job = RadarSearchJob(
        user_id=user.id,
        data_source_id=source.id,
        state="queued",
        stage="queued",
        request_fingerprint=fingerprint,
        stage_message="检索任务等待后台执行",
        filters=payload.filters.model_dump(mode="json"),
        sort_by=payload.sort_by,
        sort_direction=payload.sort_direction,
        current_page=1,
        page_size=payload.page_size,
        expires_at=now + timedelta(hours=24),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    response = RadarSearchQueuedResponse(
        search_id=job.id,
        message="实时检索任务已进入后台队列",
    )
    return job, response, True


async def _owned_search(
    db: AsyncSession,
    user: User,
    search_id: uuid.UUID,
) -> RadarSearchJob:
    job = await db.scalar(
        select(RadarSearchJob).where(
            RadarSearchJob.id == search_id,
            RadarSearchJob.user_id == user.id,
        )
    )
    if job is None or _as_utc(job.expires_at) <= datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="筛选结果已过期，请重新搜索",
        )
    return job


def _search_status(job: RadarSearchJob) -> RadarSearchStatusResponse:
    return RadarSearchStatusResponse(
        search_id=job.id,
        state=job.state,  # type: ignore[arg-type]
        stage=job.stage,  # type: ignore[arg-type]
        message=job.stage_message,
        processed_count=job.processed_count,
        candidate_count=job.candidate_count,
        total_results=job.total_results,
        incomplete_results=job.incomplete_results,
        stale_results=job.stale_results,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        expires_at=job.expires_at,
        error_summary=job.error_summary,
    )


async def get_search_status(
    db: AsyncSession,
    user: User,
    search_id: uuid.UUID,
) -> RadarSearchStatusResponse:
    return _search_status(await _owned_search(db, user, search_id))


def _sort_clauses(sort_by: str, sort_direction: str) -> list[Any]:
    column = SORT_COLUMNS[sort_by]
    direction = column.asc() if sort_direction == "asc" else column.desc()
    return [
        case((RadarSearchResultRow.data_incomplete.is_(True), 1), else_=0).asc(),
        case((RadarSearchResultRow.data_stale.is_(True), 1), else_=0).asc(),
        case((column.is_(None), 1), else_=0).asc(),
        direction,
        RadarSearchResultRow.thscode.asc(),
    ]


def _result_item(row: RadarSearchResultRow) -> RadarResultItem:
    return RadarResultItem(
        thscode=row.thscode,
        ticker=row.ticker,
        name=row.name,
        exchange=row.exchange,
        latest=float(row.latest) if row.latest is not None else None,
        change_percent=float(row.change_percent) if row.change_percent is not None else None,
        total_market_cap=(
            float(row.total_market_cap) / 100_000_000
            if row.total_market_cap is not None
            else None
        ),
        dividend_yield_ttm=(
            float(row.dividend_yield_ttm) if row.dividend_yield_ttm is not None else None
        ),
        pb_mrq=float(row.pb_mrq) if row.pb_mrq is not None else None,
        roe_weighted=float(row.roe_weighted) if row.roe_weighted is not None else None,
        roe_report_period=row.roe_report_period,
        consecutive_dividend_years=row.consecutive_dividend_years,
        metric_time=row.metric_time,
        quoted_at=row.quoted_at,
        data_incomplete=row.data_incomplete,
        data_stale=row.data_stale,
        missing_reasons=row.missing_reasons,
        stale_fields=row.stale_fields,
    )


async def get_search_results(
    db: AsyncSession,
    user: User,
    search_id: uuid.UUID,
    page: int,
    sort_by: RadarSortField,
    sort_direction: SortDirection,
) -> RadarSearchResponse:
    job = await _owned_search(db, user, search_id)
    if job.state == "failed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=job.error_summary or "实时检索失败，请重新搜索",
        )
    if job.state != "ready" or job.completed_at is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="实时检索尚未完成",
        )

    if sort_by != job.sort_by or sort_direction != job.sort_direction:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="更换排序指标需要重新执行按需检索",
        )

    rows = list(
        (
            await db.scalars(
                select(RadarSearchResultRow)
                .where(RadarSearchResultRow.search_id == job.id)
                .order_by(*_sort_clauses(sort_by, sort_direction))
                .offset((page - 1) * job.page_size)
                .limit(job.page_size)
            )
        ).all()
    )
    job.current_page = page
    await db.commit()
    return RadarSearchResponse(
        search_id=job.id,
        searched_at=job.completed_at,
        page=page,
        page_size=job.page_size,
        total=job.total_results,
        pages=math.ceil(job.total_results / job.page_size) if job.total_results else 0,
        incomplete_total=job.incomplete_results,
        stale_total=job.stale_results,
        sort_by=sort_by,
        sort_direction=sort_direction,
        items=[_result_item(row) for row in rows],
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
    page: int,
    sort_by: RadarSortField,
    sort_direction: SortDirection,
    settings: Settings,
) -> RadarQuotesResponse:
    job = await _owned_search(db, user, search_id)
    if sort_by != job.sort_by or sort_direction != job.sort_direction:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="更换排序指标需要重新执行按需检索",
        )
    if job.state != "ready":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="实时检索尚未完成")
    rows = list(
        (
            await db.scalars(
                select(RadarSearchResultRow)
                .where(RadarSearchResultRow.search_id == job.id)
                .order_by(*_sort_clauses(sort_by, sort_direction))
                .offset((page - 1) * job.page_size)
                .limit(job.page_size)
            )
        ).all()
    )
    source = await db.get(DataSource, job.data_source_id)
    static_items = [
        RadarQuoteItem(
            thscode=row.thscode,
            latest=float(row.latest) if row.latest is not None else None,
            change_percent=(
                float(row.change_percent) if row.change_percent is not None else None
            ),
            quoted_at=row.quoted_at,
        )
        for row in rows
    ]
    if source is None or source.provider_type not in {"fuyao", "fuyao_compatible"} or not rows:
        return RadarQuotesResponse(
            search_id=job.id,
            page=page,
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
            search_id=job.id,
            page=page,
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=True,
            items=static_items,
        )

    instruments = [
        Instrument(
            thscode=row.thscode,
            ticker=row.ticker,
            name=row.name,
            asset_type="a_share",
            exchange=row.exchange,  # type: ignore[arg-type]
        )
        for row in rows
    ]
    signature = ",".join(item.thscode for item in instruments)
    cache_key = f"quotes:radar:{source.id}:{signature}"
    stale_key = f"quotes:radar:last-success:{source.id}:{signature}"
    cached = await _cache_get(cache, cache_key)
    batch = SecurityQuoteBatch.model_validate_json(cached) if cached else None
    stale = False
    market_status = "未知"
    try:
        async with FuyaoAdapter(
            source.base_url,
            api_key,
            settings.upstream_timeout_seconds,
            request_concurrency=settings.upstream_concurrency,
            request_control=RadarUpstreamController(cache, source.id, settings),
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
            search_id=job.id,
            page=page,
            market_status=market_status,
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=True,
            items=static_items,
        )

    quotes = {item.thscode: item for item in batch.quotes} if batch else {}
    if quotes and not stale:
        cache_rows = list(
            (
                await db.scalars(
                    select(RadarIndicatorCache).where(
                        RadarIndicatorCache.data_source_id == source.id,
                        RadarIndicatorCache.thscode.in_(quotes),
                    )
                )
            ).all()
        )
        fetched_at = datetime.now(UTC)
        for cache_row in cache_rows:
            quote = quotes.get(cache_row.thscode)
            if quote is None:
                continue
            cache_row.latest = Decimal(str(quote.latest)) if quote.latest is not None else None
            cache_row.change_percent = (
                Decimal(str(quote.change_percent))
                if quote.change_percent is not None
                else None
            )
            cache_row.quoted_at = quote.quoted_at
            cache_row.quote_status = "available" if quote.latest is not None else "not_available"
            cache_row.quote_fetched_at = fetched_at
        await db.commit()

    return RadarQuotesResponse(
        search_id=job.id,
        page=page,
        market_status=market_status,
        polling_enabled=market_status == "交易中",
        refresh_seconds=settings.quote_refresh_seconds,
        stale=stale,
        items=[
            RadarQuoteItem(
                thscode=row.thscode,
                latest=quotes[row.thscode].latest if row.thscode in quotes else None,
                change_percent=(
                    quotes[row.thscode].change_percent if row.thscode in quotes else None
                ),
                quoted_at=quotes[row.thscode].quoted_at if row.thscode in quotes else None,
            )
            for row in rows
        ],
    )
