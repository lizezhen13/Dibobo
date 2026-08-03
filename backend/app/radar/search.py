import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import (
    DataSource,
    RadarIndicatorCache,
    RadarSearchJob,
    RadarSearchResult,
)
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError, UpstreamRequestControl
from app.data_sources.domain import DividendEvent, Instrument, RoeIndicator
from app.data_sources.fuyao import FuyaoAdapter
from app.radar.calculations import (
    calculate_dividend_metrics,
    display_report_period,
    excluded_status,
    report_candidates,
    years_before,
)
from app.radar.schemas import NumberRange, RadarFilters

logger = logging.getLogger(__name__)

EXPECTED_MISSING_CODES = {3001, 3002, 3004}
RETRYABLE_CACHE_STATES = {"not_fetched", "fetch_failed", "stale"}


@dataclass(frozen=True)
class MetricPlan:
    refresh_pb: bool
    refresh_dividends: bool
    refresh_roe: bool


def _range_is_active(number_range: NumberRange) -> bool:
    return number_range.minimum is not None or number_range.maximum is not None


def build_metric_plan(filters: RadarFilters, sort_by: str) -> MetricPlan:
    return MetricPlan(
        refresh_pb=_range_is_active(filters.pb_mrq) or sort_by == "pb_mrq",
        refresh_dividends=(
            _range_is_active(filters.dividend_yield_ttm)
            or sort_by in {"dividend_yield_ttm", "consecutive_dividend_years"}
        ),
        refresh_roe=_range_is_active(filters.roe_weighted) or sort_by == "roe_weighted",
    )


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _is_fresh(value: datetime | None, now: datetime, ttl: timedelta) -> bool:
    normalized = _as_utc(value)
    return normalized is not None and normalized >= now - ttl


def _needs_refresh(
    state: str | None,
    fetched_at: datetime | None,
    now: datetime,
    regular_ttl: timedelta,
    retry_ttl: timedelta,
) -> bool:
    ttl = retry_ttl if state in RETRYABLE_CACHE_STATES else regular_ttl
    return not _is_fresh(fetched_at, now, ttl)


def _known_outside(value: Decimal | None, number_range: NumberRange, multiplier: int = 1) -> bool:
    if value is None:
        return False
    numeric = float(value)
    if number_range.minimum is not None and numeric < number_range.minimum * multiplier:
        return True
    return number_range.maximum is not None and numeric > number_range.maximum * multiplier


def _active_missing(value: object | None, number_range: NumberRange) -> bool:
    return value is None and (
        number_range.minimum is not None or number_range.maximum is not None
    )


async def _set_progress(
    db: AsyncSession,
    job: RadarSearchJob,
    *,
    stage: str,
    message: str,
    processed: int | None = None,
    candidates: int | None = None,
) -> None:
    job.stage = stage
    job.stage_message = message
    if processed is not None:
        job.processed_count = processed
    if candidates is not None:
        job.candidate_count = candidates
    await db.commit()


async def _load_universe(
    db: AsyncSession,
    source: DataSource,
    adapter: FuyaoAdapter,
    settings: Settings,
    now: datetime,
) -> tuple[list[RadarIndicatorCache], bool]:
    existing = list(
        (
            await db.scalars(
                select(RadarIndicatorCache).where(
                    RadarIndicatorCache.data_source_id == source.id
                )
            )
        ).all()
    )
    active = [row for row in existing if row.is_active_universe]
    newest = max((_as_utc(row.instrument_fetched_at) for row in active), default=None)
    universe_ttl = timedelta(hours=settings.radar_instrument_cache_hours)
    if active and newest is not None and newest >= now - universe_ttl:
        return active, False

    try:
        instruments = (await adapter.list_a_share_instruments()).items
    except DataSourceError:
        if active:
            return active, True
        raise

    existing_by_code = {row.thscode: row for row in existing}
    for row in existing:
        row.is_active_universe = False
    refreshed: list[RadarIndicatorCache] = []
    for instrument in instruments:
        row = existing_by_code.get(instrument.thscode)
        if row is None:
            row = RadarIndicatorCache(
                data_source_id=source.id,
                thscode=instrument.thscode,
                ticker=instrument.ticker,
                name=instrument.name,
                exchange=instrument.exchange,
                is_active_universe=True,
                instrument_fetched_at=now,
                quote_status="not_fetched",
                market_cap_status="unsupported",
                pb_status="not_fetched",
                roe_status="not_fetched",
                dividend_events=[],
                dividend_status="not_fetched",
            )
            db.add(row)
        else:
            row.ticker = instrument.ticker
            row.name = instrument.name
            row.exchange = instrument.exchange
            row.is_active_universe = True
            row.instrument_fetched_at = now
        refreshed.append(row)
    await db.commit()
    return refreshed, False


async def _refresh_quotes(
    db: AsyncSession,
    rows: list[RadarIndicatorCache],
    adapter: FuyaoAdapter,
    settings: Settings,
    now: datetime,
) -> bool:
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
    try:
        batch = await adapter.get_security_quotes(
            instruments,
            settings.upstream_concurrency,
        )
    except DataSourceError as exc:
        has_fallback = False
        for row in rows:
            row.quote_fetched_at = now
            row.last_error = exc.user_message
            if row.latest is not None and row.latest > 0:
                row.quote_status = "stale"
                has_fallback = True
            else:
                row.quote_status = "fetch_failed"
        await db.commit()
        if has_fallback:
            return True
        raise

    quotes = {quote.thscode: quote for quote in batch.quotes}
    for row in rows:
        quote = quotes.get(row.thscode)
        row.quote_fetched_at = now
        row.last_error = None
        if quote is None or quote.latest is None:
            row.latest = None
            row.change_percent = None
            row.quoted_at = None
            row.quote_status = "not_available"
            continue
        row.latest = Decimal(str(quote.latest))
        row.change_percent = (
            Decimal(str(quote.change_percent)) if quote.change_percent is not None else None
        )
        row.quoted_at = quote.quoted_at
        row.quote_status = "available"
    await db.commit()
    return False


async def _refresh_pb(
    db: AsyncSession,
    rows: list[RadarIndicatorCache],
    adapter: FuyaoAdapter,
    settings: Settings,
    now: datetime,
) -> None:
    regular_ttl = timedelta(minutes=settings.radar_pb_cache_minutes)
    retry_ttl = timedelta(minutes=settings.radar_failure_retry_minutes)
    stale_rows = [
        row
        for row in rows
        if _needs_refresh(row.pb_status, row.pb_fetched_at, now, regular_ttl, retry_ttl)
    ]
    if not stale_rows:
        return
    try:
        batch = await adapter.get_valuation_snapshots(
            [row.thscode for row in stale_rows],
            settings.upstream_concurrency,
        )
    except DataSourceError as exc:
        for row in stale_rows:
            row.pb_fetched_at = now
            row.last_error = exc.user_message
            row.pb_status = "stale" if row.pb_mrq is not None else "fetch_failed"
        await db.commit()
        return

    valuations = {item.thscode: item for item in batch.items}
    for row in stale_rows:
        valuation = valuations.get(row.thscode)
        row.pb_fetched_at = now
        row.last_error = None
        if valuation is None or valuation.pb_mrq is None:
            row.pb_mrq = None
            row.pb_metric_at = valuation.metric_at if valuation else None
            row.pb_status = "not_available"
        else:
            row.pb_mrq = Decimal(str(valuation.pb_mrq))
            row.pb_metric_at = valuation.metric_at
            row.pb_status = "available"
    await db.commit()


async def _fetch_roe(
    adapter: FuyaoAdapter,
    thscode: str,
    reports: list[str],
) -> tuple[str, RoeIndicator | None, str | None]:
    try:
        indicator = await adapter.get_roe_indicator(thscode, reports)
    except DataSourceError as exc:
        if exc.code in EXPECTED_MISSING_CODES:
            return "not_available", None, None
        return "fetch_failed", None, exc.user_message
    if indicator.value is None:
        return "not_available", None, None
    return "available", indicator, None


async def _fetch_dividends(
    adapter: FuyaoAdapter,
    thscode: str,
    date_from: str,
    date_to: str,
) -> tuple[str, list[DividendEvent] | None, str | None]:
    try:
        result = await adapter.get_dividend_events(thscode, date_from, date_to)
    except DataSourceError as exc:
        if exc.code in EXPECTED_MISSING_CODES:
            return "not_available", None, None
        return "fetch_failed", None, exc.user_message
    return "available", result.items, None


async def _refresh_dividends(
    db: AsyncSession,
    job: RadarSearchJob,
    rows: list[RadarIndicatorCache],
    adapter: FuyaoAdapter,
    settings: Settings,
    now: datetime,
) -> None:
    local_date = now.astimezone(ZoneInfo("Asia/Shanghai")).date()
    oldest = years_before(local_date, 10).isoformat()
    newest = local_date.isoformat()
    regular_ttl = timedelta(hours=settings.radar_fundamental_cache_hours)
    retry_ttl = timedelta(minutes=settings.radar_failure_retry_minutes)
    refresh_rows = [
        row
        for row in rows
        if _needs_refresh(
            row.dividend_status,
            row.dividend_fetched_at,
            now,
            regular_ttl,
            retry_ttl,
        )
    ]
    if not refresh_rows:
        return

    semaphore = asyncio.Semaphore(settings.upstream_concurrency)

    async def fetch(
        row: RadarIndicatorCache,
    ) -> tuple[RadarIndicatorCache, tuple[str, list[DividendEvent] | None, str | None]]:
        async with semaphore:
            result = await _fetch_dividends(adapter, row.thscode, oldest, newest)
        return row, result

    processed = 0
    for start in range(0, len(refresh_rows), settings.radar_search_chunk_size):
        chunk = refresh_rows[start : start + settings.radar_search_chunk_size]
        results = await asyncio.gather(*(fetch(row) for row in chunk))
        for row, dividend_result in results:
            state, events, error = dividend_result
            row.dividend_fetched_at = now
            if state == "available" and events is not None:
                row.dividend_events = [event.model_dump(mode="json") for event in events]
                row.dividend_status = "available"
            elif state == "not_available":
                row.dividend_events = []
                row.dividend_status = "not_available"
            elif row.dividend_status in {"available", "stale"}:
                row.dividend_status = "stale"
            else:
                row.dividend_status = "fetch_failed"
            row.last_error = error

        processed += len(chunk)
        job.processed_count = processed
        job.stage_message = f"正在按需刷新分红数据 · {processed}/{len(refresh_rows)}"
        await db.commit()


async def _refresh_roe(
    db: AsyncSession,
    job: RadarSearchJob,
    rows: list[RadarIndicatorCache],
    adapter: FuyaoAdapter,
    settings: Settings,
    now: datetime,
) -> None:
    local_date = now.astimezone(ZoneInfo("Asia/Shanghai")).date()
    reports = report_candidates(local_date)
    regular_ttl = timedelta(hours=settings.radar_fundamental_cache_hours)
    retry_ttl = timedelta(minutes=settings.radar_failure_retry_minutes)
    refresh_rows = [
        row
        for row in rows
        if _needs_refresh(
            row.roe_status,
            row.roe_fetched_at,
            now,
            regular_ttl,
            retry_ttl,
        )
    ]
    if not refresh_rows:
        return

    semaphore = asyncio.Semaphore(settings.upstream_concurrency)

    async def fetch(
        row: RadarIndicatorCache,
    ) -> tuple[RadarIndicatorCache, tuple[str, RoeIndicator | None, str | None]]:
        async with semaphore:
            result = await _fetch_roe(adapter, row.thscode, reports)
        return row, result

    processed = 0
    for start in range(0, len(refresh_rows), settings.radar_search_chunk_size):
        chunk = refresh_rows[start : start + settings.radar_search_chunk_size]
        results = await asyncio.gather(*(fetch(row) for row in chunk))
        for row, roe_result in results:
            state, indicator, error = roe_result
            row.roe_fetched_at = now
            if state == "available" and indicator is not None:
                row.roe_weighted = Decimal(str(indicator.value))
                row.roe_report_period = display_report_period(indicator.report)
                row.roe_status = "available"
            elif state == "not_available":
                row.roe_weighted = None
                row.roe_report_period = None
                row.roe_status = "not_available"
            elif row.roe_weighted is not None:
                row.roe_status = "stale"
            else:
                row.roe_status = "fetch_failed"
            row.last_error = error

        processed += len(chunk)
        job.processed_count = processed
        job.stage_message = f"正在按需刷新候选股 ROE · {processed}/{len(refresh_rows)}"
        await db.commit()


def _dividend_values(
    row: RadarIndicatorCache,
    as_of: datetime,
) -> tuple[Decimal | None, int | None]:
    if row.dividend_status not in {"available", "stale"}:
        return None, None
    if row.latest is None or row.latest <= 0:
        return None, None
    try:
        events = [DividendEvent.model_validate(item) for item in row.dividend_events]
    except (TypeError, ValueError):
        return None, None
    local_date = as_of.astimezone(ZoneInfo("Asia/Shanghai")).date()
    dividend_yield, years = calculate_dividend_metrics(events, float(row.latest), local_date)
    return Decimal(str(dividend_yield)), years


def _missing_reasons(row: RadarIndicatorCache, _plan: MetricPlan) -> list[str]:
    reasons: list[str] = []
    if row.total_market_cap is None:
        reasons.append("总市值暂无数据")
    if row.pb_mrq is None:
        reasons.append("PB 暂无数据")
    if row.roe_weighted is None:
        reasons.append("ROE 暂无数据")
    if row.dividend_status not in {"available", "stale"}:
        reasons.append("分红事件暂无数据")
    return reasons


def _stale_fields(row: RadarIndicatorCache) -> list[str]:
    fields: list[str] = []
    if row.quote_status == "stale":
        fields.append("行情")
    if row.market_cap_status == "stale":
        fields.append("总市值")
    if row.pb_status == "stale":
        fields.append("PB")
    if row.roe_status == "stale":
        fields.append("ROE")
    if row.dividend_status == "stale":
        fields.append("分红事件")
    return fields


def _matches_filters(
    row: RadarIndicatorCache,
    dividend_yield: Decimal | None,
    filters: RadarFilters,
) -> bool:
    return not any(
        (
            _known_outside(row.total_market_cap, filters.total_market_cap, 100_000_000),
            _known_outside(dividend_yield, filters.dividend_yield_ttm),
            _known_outside(row.pb_mrq, filters.pb_mrq),
            _known_outside(row.roe_weighted, filters.roe_weighted),
        )
    )


def _is_incomplete(
    row: RadarIndicatorCache,
    dividend_yield: Decimal | None,
    filters: RadarFilters,
) -> bool:
    return any(
        (
            _active_missing(row.total_market_cap, filters.total_market_cap),
            _active_missing(dividend_yield, filters.dividend_yield_ttm),
            _active_missing(row.pb_mrq, filters.pb_mrq),
            _active_missing(row.roe_weighted, filters.roe_weighted),
        )
    )


async def execute_radar_search(
    db: AsyncSession,
    search_id: uuid.UUID,
    settings: Settings,
    request_control: UpstreamRequestControl | None = None,
) -> None:
    job = await db.get(RadarSearchJob, search_id)
    if job is None or job.state not in {"queued", "running"}:
        return
    source = await db.get(DataSource, job.data_source_id)
    if source is None:
        job.state = "failed"
        job.stage = "failed"
        job.error_summary = "数据源配置不存在"
        job.completed_at = datetime.now(UTC)
        await db.commit()
        return

    now = datetime.now(UTC)
    job.state = "running"
    job.stage = "universe"
    job.stage_message = "正在加载 A 股代码池"
    job.started_at = job.started_at or now
    await db.commit()

    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    try:
        api_key = cipher.decrypt(source.api_key_ciphertext)
    except ValueError:
        job.state = "failed"
        job.stage = "failed"
        job.error_summary = "数据源密钥无法解密，请重新保存 API Key"
        job.completed_at = datetime.now(UTC)
        await db.commit()
        return

    try:
        filters = RadarFilters.model_validate(job.filters)
        plan = build_metric_plan(filters, job.sort_by)
        async with FuyaoAdapter(
            source.base_url,
            api_key,
            settings.upstream_timeout_seconds,
            request_concurrency=settings.upstream_concurrency,
            request_control=request_control,
        ) as adapter:
            universe, universe_stale = await _load_universe(
                db,
                source,
                adapter,
                settings,
                now,
            )
            await _set_progress(
                db,
                job,
                stage="quotes",
                message=f"正在批量刷新 {len(universe)} 只股票行情",
                processed=0,
                candidates=len(universe),
            )
            quote_stale = await _refresh_quotes(db, universe, adapter, settings, now)

            eligible: list[RadarIndicatorCache] = []
            for row in universe:
                instrument = Instrument(
                    thscode=row.thscode,
                    ticker=row.ticker,
                    name=row.name,
                    asset_type="a_share",
                    exchange=row.exchange,  # type: ignore[arg-type]
                )
                exclusion = excluded_status(
                    instrument,
                    row.latest is not None and row.latest > 0,
                )
                row.security_status = exclusion or "正常"
                if exclusion is None:
                    eligible.append(row)
            await db.commit()

            await _set_progress(
                db,
                job,
                stage="valuation",
                message=f"正在刷新 {len(eligible)} 只有效标的 PB",
                candidates=len(eligible),
            )
            if plan.refresh_pb:
                await _refresh_pb(db, eligible, adapter, settings, now)
            else:
                await _set_progress(
                    db,
                    job,
                    stage="valuation",
                    message="PB 未参与本次筛选，跳过全市场刷新",
                    candidates=len(eligible),
                )
            candidates = [
                row
                for row in eligible
                if not _known_outside(row.pb_mrq, filters.pb_mrq)
                and not _known_outside(
                    row.total_market_cap,
                    filters.total_market_cap,
                    100_000_000,
                )
            ]

            await _set_progress(
                db,
                job,
                stage="fundamentals",
                message=f"正在准备 {len(candidates)} 只候选股 ROE 与分红数据",
                processed=0,
                candidates=len(candidates),
            )
            if plan.refresh_dividends:
                job.stage_message = f"正在准备 {len(candidates)} 只候选股分红数据"
                await db.commit()
                await _refresh_dividends(db, job, candidates, adapter, settings, now)
                candidates = [
                    row
                    for row in candidates
                    if not _known_outside(
                        _dividend_values(row, now)[0],
                        filters.dividend_yield_ttm,
                    )
                ]
                job.candidate_count = len(candidates)
                await db.commit()

            if plan.refresh_roe:
                job.processed_count = 0
                job.candidate_count = len(candidates)
                job.stage_message = f"股息率初筛后，刷新 {len(candidates)} 只候选股 ROE"
                await db.commit()
                await _refresh_roe(db, job, candidates, adapter, settings, now)
                candidates = [
                    row
                    for row in candidates
                    if not _known_outside(row.roe_weighted, filters.roe_weighted)
                ]

        await _set_progress(
            db,
            job,
            stage="finalizing",
            message="正在计算股息率、连续分红与三值筛选结果",
            processed=len(candidates),
            candidates=len(candidates),
        )
        await db.execute(
            delete(RadarSearchResult).where(RadarSearchResult.search_id == job.id)
        )
        result_rows: list[RadarSearchResult] = []
        for row in candidates:
            dividend_yield, consecutive_years = _dividend_values(row, now)
            if not _matches_filters(row, dividend_yield, filters):
                continue
            stale_fields = _stale_fields(row)
            if universe_stale:
                stale_fields.append("股票代码池")
            if quote_stale and "行情" not in stale_fields:
                stale_fields.append("行情")
            result_rows.append(
                RadarSearchResult(
                    search_id=job.id,
                    thscode=row.thscode,
                    ticker=row.ticker,
                    name=row.name,
                    exchange=row.exchange,
                    latest=row.latest,
                    change_percent=row.change_percent,
                    total_market_cap=row.total_market_cap,
                    dividend_yield_ttm=dividend_yield,
                    pb_mrq=row.pb_mrq,
                    roe_weighted=row.roe_weighted,
                    roe_report_period=row.roe_report_period,
                    consecutive_dividend_years=consecutive_years,
                    metric_time=now,
                    quoted_at=row.quoted_at,
                    data_incomplete=_is_incomplete(row, dividend_yield, filters),
                    data_stale=bool(stale_fields),
                    missing_reasons=_missing_reasons(row, plan),
                    stale_fields=list(dict.fromkeys(stale_fields)),
                )
            )
        db.add_all(result_rows)
        job.state = "ready"
        job.stage = "ready"
        job.stage_message = "实时检索完成；结果已冻结 24 小时"
        job.total_results = len(result_rows)
        job.incomplete_results = sum(row.data_incomplete for row in result_rows)
        job.stale_results = sum(row.data_stale for row in result_rows)
        job.processed_count = len(candidates)
        job.candidate_count = len(candidates)
        job.completed_at = datetime.now(UTC)
        job.error_summary = None
        await db.commit()
        logger.info(
            "On-demand radar search completed",
            extra={
                "search_id": str(job.id),
                "data_source_id": str(source.id),
                "candidate_count": len(candidates),
                "result_count": len(result_rows),
            },
        )
    except Exception as exc:
        await db.rollback()
        job = await db.get(RadarSearchJob, search_id)
        if job is not None:
            job.state = "failed"
            job.stage = "failed"
            job.stage_message = "实时检索未完成"
            job.completed_at = datetime.now(UTC)
            job.error_summary = (
                exc.user_message if isinstance(exc, DataSourceError) else "实时检索失败，请稍后重试"
            )
            await db.commit()
        logger.exception(
            "On-demand radar search failed",
            extra={"search_id": str(search_id), "data_source_id": str(source.id)},
        )
