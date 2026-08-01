from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.models import DataSource, RadarMetric, RadarSnapshot, User
from app.data_sources.domain import DividendEvent
from app.radar.schemas import NumberRange, RadarFilters, RadarSearchRequest
from app.radar.service import get_radar_status, search_radar
from app.radar.sync import calculate_dividend_metrics, display_report_period, report_candidates


@pytest.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


async def make_source(db: AsyncSession, username: str = "radar-user") -> tuple[User, DataSource]:
    user = User(username=username, password_hash="not-used")
    db.add(user)
    await db.flush()
    source = DataSource(
        user_id=user.id,
        name="扶摇主数据",
        provider_type="fuyao",
        base_url="https://example.invalid",
        api_key_ciphertext="encrypted",
        api_key_last4="1234",
        is_active=True,
        capabilities={
            "valuation_pb": "supported",
            "financial_roe": "supported",
            "corporate_action_dividend": "supported",
            "total_market_cap": "unsupported",
        },
    )
    db.add(source)
    await db.commit()
    await db.refresh(user)
    await db.refresh(source)
    return user, source


async def make_ready_snapshot(db: AsyncSession, source: DataSource) -> RadarSnapshot:
    now = datetime.now(UTC)
    snapshot = RadarSnapshot(
        data_source_id=source.id,
        status="ready",
        as_of=now,
        calculation_version="test-v1",
        started_at=now - timedelta(minutes=5),
        completed_at=now,
        instrument_count=3,
        eligible_count=3,
        incomplete_count=2,
        excluded_count=0,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


def metric(
    snapshot: RadarSnapshot,
    thscode: str,
    *,
    dividend_yield: str | None,
    roe: str | None,
    total_market_cap: str | None = None,
) -> RadarMetric:
    return RadarMetric(
        snapshot_id=snapshot.id,
        thscode=thscode,
        ticker=thscode.split(".")[0],
        name={"600001.SH": "完整公司", "600002.SH": "缺股息公司"}.get(thscode, "越界公司"),
        exchange="SH",
        security_status="正常",
        latest=Decimal("10"),
        change_percent=Decimal("1"),
        total_market_cap=(
            Decimal(total_market_cap) if total_market_cap is not None else None
        ),
        dividend_yield_ttm=Decimal(dividend_yield) if dividend_yield is not None else None,
        pb_mrq=Decimal("1.2"),
        roe_weighted=Decimal(roe) if roe is not None else None,
        roe_report_period="2026-H1" if roe is not None else None,
        consecutive_dividend_years=5,
        metric_time=snapshot.as_of,
        quoted_at=snapshot.as_of,
        missing_reasons=["当前数据源暂不支持总市值"],
    )


def test_dividend_metrics_use_trailing_twelve_months_and_natural_year_streak() -> None:
    events = [
        DividendEvent(
            ex_date=datetime(2026, 7, 1, tzinfo=UTC),
            dividend_per_share=0.3,
        ),
        DividendEvent(
            ex_date=datetime(2025, 9, 1, tzinfo=UTC),
            dividend_per_share=0.2,
        ),
        DividendEvent(
            ex_date=datetime(2025, 6, 1, tzinfo=UTC),
            dividend_per_share=9,
        ),
        DividendEvent(
            ex_date=datetime(2024, 7, 1, tzinfo=UTC),
            dividend_per_share=0.1,
        ),
    ]

    dividend_yield, years = calculate_dividend_metrics(events, latest=10, as_of=date(2026, 8, 1))

    assert dividend_yield == pytest.approx(5)
    assert years == 3


def test_report_candidates_and_display_period_start_from_latest_plausible_period() -> None:
    assert report_candidates(date(2026, 8, 1))[:4] == [
        "2026-2",
        "2026-1",
        "2025-4",
        "2025-3",
    ]
    assert display_report_period("2026-2") == "2026-H1"
    assert display_report_period("2025-4") == "2025-FY"


def test_dividend_event_year_uses_shanghai_natural_date() -> None:
    event = DividendEvent(
        ex_date=datetime(2025, 12, 31, 16, tzinfo=UTC),
        dividend_per_share=1,
    )

    dividend_yield, years = calculate_dividend_metrics(
        [event], latest=20, as_of=date(2026, 1, 1)
    )

    assert dividend_yield == pytest.approx(5)
    assert years == 1


@pytest.mark.asyncio
async def test_three_value_filter_retains_missing_metric_after_complete_results(
    db: AsyncSession,
) -> None:
    user, source = await make_source(db)
    snapshot = await make_ready_snapshot(db, source)
    db.add_all(
        [
            metric(snapshot, "600001.SH", dividend_yield="5", roe="12"),
            metric(snapshot, "600002.SH", dividend_yield=None, roe="11"),
            metric(snapshot, "600003.SH", dividend_yield="3", roe="15"),
        ]
    )
    await db.commit()

    response = await search_radar(
        db,
        user,
        RadarSearchRequest(
            filters=RadarFilters(
                dividend_yield_ttm=NumberRange(minimum=4),
                roe_weighted=NumberRange(minimum=10),
            )
        ),
    )

    assert response.total == 2
    assert response.incomplete_total == 1
    assert [item.thscode for item in response.items] == ["600001.SH", "600002.SH"]
    assert response.items[0].data_incomplete is False
    assert response.items[1].data_incomplete is True


@pytest.mark.asyncio
async def test_failed_refresh_keeps_previous_ready_snapshot_searchable(db: AsyncSession) -> None:
    user, source = await make_source(db, "fallback-user")
    ready = await make_ready_snapshot(db, source)
    failed = RadarSnapshot(
        data_source_id=source.id,
        status="failed",
        as_of=ready.as_of + timedelta(hours=1),
        calculation_version="test-v1",
        started_at=ready.started_at + timedelta(hours=1),
        completed_at=ready.completed_at + timedelta(hours=1),  # type: ignore[operator]
        error_summary="数据源响应超时",
    )
    db.add(failed)
    await db.commit()

    response = await get_radar_status(db, user)

    assert response.state == "partial_failed"
    assert response.can_search is True
    assert response.snapshot_id == ready.id
    assert "继续使用上次完整快照" in (response.message or "")


@pytest.mark.asyncio
async def test_market_cap_filter_converts_hundred_million_yuan_to_yuan(
    db: AsyncSession,
) -> None:
    user, source = await make_source(db, "market-cap-user")
    source.capabilities = {**source.capabilities, "total_market_cap": "supported"}
    snapshot = await make_ready_snapshot(db, source)
    db.add_all(
        [
            metric(
                snapshot,
                "600001.SH",
                dividend_yield="5",
                roe="12",
                total_market_cap="15000000000",
            ),
            metric(
                snapshot,
                "600003.SH",
                dividend_yield="4",
                roe="10",
                total_market_cap="5000000000",
            ),
        ]
    )
    await db.commit()

    response = await search_radar(
        db,
        user,
        RadarSearchRequest(
            filters=RadarFilters(
                total_market_cap=NumberRange(minimum=100, maximum=200),
            )
        ),
    )

    assert [item.thscode for item in response.items] == ["600001.SH"]
    assert response.items[0].total_market_cap == 150
