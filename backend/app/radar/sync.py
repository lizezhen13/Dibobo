import asyncio
import logging
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, RadarMetric, RadarSnapshot
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import DividendEvent, Instrument, RoeIndicator
from app.data_sources.fuyao import FuyaoAdapter

logger = logging.getLogger(__name__)

CALCULATION_VERSION = "dividend-radar-v1"
EXPECTED_MISSING_CODES = {3001, 3002, 3004}


def report_candidates(today: date) -> list[str]:
    if today.month >= 10:
        first_quarter = 3
    elif today.month >= 8:
        first_quarter = 2
    elif today.month >= 4:
        first_quarter = 1
    else:
        first_quarter = 4

    year = today.year if first_quarter != 4 else today.year - 1
    candidates: list[str] = []
    quarter = first_quarter
    while len(candidates) < 8:
        candidates.append(f"{year}-{quarter}")
        if quarter == 1:
            year -= 1
            quarter = 4
        else:
            quarter -= 1
    return candidates


def display_report_period(report: str | None) -> str | None:
    if report is None or "-" not in report:
        return report
    year, quarter = report.split("-", 1)
    suffix = {"1": "Q1", "2": "H1", "3": "Q3", "4": "FY"}.get(quarter)
    return f"{year}-{suffix}" if suffix else report


def one_year_before(value: date) -> date:
    try:
        return value.replace(year=value.year - 1)
    except ValueError:
        return value.replace(year=value.year - 1, day=28)


def years_before(value: date, years: int) -> date:
    try:
        return value.replace(year=value.year - years)
    except ValueError:
        return value.replace(year=value.year - years, day=28)


def calculate_dividend_metrics(
    events: list[DividendEvent],
    latest: float,
    as_of: date,
) -> tuple[float, int]:
    window_start = one_year_before(as_of)
    local_dates = [
        (event, event.ex_date.astimezone(ZoneInfo("Asia/Shanghai")).date())
        for event in events
    ]
    ttm_cash = sum(
        event.dividend_per_share
        for event, ex_date in local_dates
        if window_start <= ex_date <= as_of and event.dividend_per_share > 0
    )
    event_years = {
        ex_date.year
        for event, ex_date in local_dates
        if ex_date <= as_of and event.dividend_per_share > 0
    }
    if as_of.year in event_years:
        cursor = as_of.year
    elif as_of.year - 1 in event_years:
        cursor = as_of.year - 1
    else:
        cursor = -1

    consecutive = 0
    while cursor in event_years:
        consecutive += 1
        cursor -= 1
    return ttm_cash / latest * 100, consecutive


def excluded_status(instrument: Instrument, has_valid_quote: bool) -> str | None:
    normalized_name = instrument.name.upper().replace(" ", "")
    if normalized_name.startswith("*ST") or normalized_name.startswith("ST"):
        return "ST"
    if "退" in instrument.name:
        return "退市整理"
    if not has_valid_quote:
        return "停牌或行情缺失"
    return None


async def create_building_snapshot(
    db: AsyncSession,
    source: DataSource,
) -> tuple[RadarSnapshot, bool]:
    building = await db.scalar(
        select(RadarSnapshot).where(
            RadarSnapshot.data_source_id == source.id,
            RadarSnapshot.status == "building",
        )
    )
    if building is not None:
        return building, False
    now = datetime.now(UTC)
    snapshot = RadarSnapshot(
        data_source_id=source.id,
        status="building",
        as_of=now,
        calculation_version=CALCULATION_VERSION,
        started_at=now,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot, True


async def _optional_roe(
    adapter: FuyaoAdapter,
    instrument: Instrument,
    reports: list[str],
) -> RoeIndicator | None:
    try:
        return await adapter.get_roe_indicator(instrument.thscode, reports)
    except DataSourceError as exc:
        if exc.code in EXPECTED_MISSING_CODES:
            return None
        raise


async def _optional_dividends(
    adapter: FuyaoAdapter,
    instrument: Instrument,
    date_from: str,
    date_to: str,
) -> list[DividendEvent] | None:
    try:
        result = await adapter.get_dividend_events(
            instrument.thscode,
            date_from,
            date_to,
        )
        return result.items
    except DataSourceError as exc:
        if exc.code in EXPECTED_MISSING_CODES:
            return None
        raise


async def build_radar_snapshot(
    db: AsyncSession,
    snapshot_id: uuid.UUID,
    settings: Settings,
) -> None:
    snapshot = await db.get(RadarSnapshot, snapshot_id)
    if snapshot is None or snapshot.status != "building":
        return
    source = await db.get(DataSource, snapshot.data_source_id)
    if source is None:
        snapshot.status = "failed"
        snapshot.error_summary = "数据源配置不存在"
        snapshot.completed_at = datetime.now(UTC)
        await db.commit()
        return

    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    try:
        api_key = cipher.decrypt(source.api_key_ciphertext)
    except ValueError as exc:
        snapshot.status = "failed"
        snapshot.error_summary = "数据源密钥无法解密，请重新保存 API Key"
        snapshot.completed_at = datetime.now(UTC)
        await db.commit()
        raise DataSourceError(5003, snapshot.error_summary) from exc

    try:
        async with FuyaoAdapter(
            source.base_url,
            api_key,
            settings.upstream_timeout_seconds,
        ) as adapter:
            instrument_result = await adapter.list_a_share_instruments()
            instruments = instrument_result.items
            snapshot.instrument_count = len(instruments)
            await db.commit()

            quote_batch = await adapter.get_security_quotes(
                instruments,
                settings.upstream_concurrency,
            )
            quotes = {quote.thscode: quote for quote in quote_batch.quotes}
            eligible: list[Instrument] = []
            for instrument in instruments:
                quote = quotes.get(instrument.thscode)
                status = excluded_status(
                    instrument,
                    quote is not None and quote.latest is not None and quote.latest > 0,
                )
                if status is None:
                    eligible.append(instrument)
            snapshot.excluded_count = len(instruments) - len(eligible)
            await db.commit()

            valuation_batch = await adapter.get_valuation_snapshots(
                [instrument.thscode for instrument in eligible],
                settings.upstream_concurrency,
            )
            valuations = {item.thscode: item for item in valuation_batch.items}
            as_of = snapshot.as_of.date()
            reports = report_candidates(as_of)
            oldest_date = years_before(as_of, 10)
            semaphore = asyncio.Semaphore(settings.upstream_concurrency)

            async def build_metric(instrument: Instrument) -> RadarMetric:
                async with semaphore:
                    roe, events = await asyncio.gather(
                        _optional_roe(adapter, instrument, reports),
                        _optional_dividends(
                            adapter,
                            instrument,
                            oldest_date.isoformat(),
                            as_of.isoformat(),
                        ),
                    )

                quote = quotes[instrument.thscode]
                latest = quote.latest
                if latest is None or latest <= 0:
                    raise RuntimeError("入选股票缺少有效行情")
                valuation = valuations.get(instrument.thscode)
                dividend_yield: float | None = None
                consecutive_years: int | None = None
                if events is not None:
                    dividend_yield, consecutive_years = calculate_dividend_metrics(
                        events,
                        latest,
                        as_of,
                    )

                missing_reasons = ["当前数据源暂不支持总市值"]
                if valuation is None or valuation.pb_mrq is None:
                    missing_reasons.append("PB 暂无数据")
                if roe is None or roe.value is None:
                    missing_reasons.append("ROE 暂无数据")
                if events is None:
                    missing_reasons.append("分红事件暂无数据")
                return RadarMetric(
                    snapshot_id=snapshot.id,
                    thscode=instrument.thscode,
                    ticker=instrument.ticker,
                    name=instrument.name,
                    exchange=instrument.exchange,
                    security_status="正常",
                    latest=Decimal(str(latest)),
                    change_percent=(
                        Decimal(str(quote.change_percent))
                        if quote.change_percent is not None
                        else None
                    ),
                    total_market_cap=None,
                    dividend_yield_ttm=(
                        Decimal(str(dividend_yield)) if dividend_yield is not None else None
                    ),
                    pb_mrq=(
                        Decimal(str(valuation.pb_mrq))
                        if valuation is not None and valuation.pb_mrq is not None
                        else None
                    ),
                    roe_weighted=(
                        Decimal(str(roe.value))
                        if roe is not None and roe.value is not None
                        else None
                    ),
                    roe_report_period=display_report_period(roe.report) if roe else None,
                    consecutive_dividend_years=consecutive_years,
                    metric_time=snapshot.as_of,
                    quoted_at=quote.quoted_at,
                    missing_reasons=missing_reasons,
                )

            metrics: list[RadarMetric] = []
            for start in range(0, len(eligible), 100):
                metrics.extend(
                    await asyncio.gather(
                        *(build_metric(item) for item in eligible[start : start + 100])
                    )
                )

        await db.execute(delete(RadarMetric).where(RadarMetric.snapshot_id == snapshot.id))
        db.add_all(metrics)
        snapshot.eligible_count = len(metrics)
        snapshot.incomplete_count = sum(bool(item.missing_reasons) for item in metrics)
        snapshot.status = "ready"
        snapshot.completed_at = datetime.now(UTC)
        snapshot.error_summary = None
        await db.commit()
        logger.info(
            "Radar snapshot completed",
            extra={
                "data_source_id": str(source.id),
                "snapshot_id": str(snapshot.id),
                "eligible_count": len(metrics),
            },
        )
    except Exception as exc:
        await db.rollback()
        snapshot = await db.get(RadarSnapshot, snapshot_id)
        if snapshot is not None:
            snapshot.status = "failed"
            snapshot.completed_at = datetime.now(UTC)
            snapshot.error_summary = (
                exc.user_message if isinstance(exc, DataSourceError) else "雷达快照同步失败"
            )
            await db.commit()
        logger.exception(
            "Radar snapshot failed",
            extra={"data_source_id": str(source.id), "snapshot_id": str(snapshot_id)},
        )
        raise
