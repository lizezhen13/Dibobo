import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.core.database import Base
from app.core.models import DataSource, RadarSearchJob, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import (
    DividendEvent,
    DividendEventResult,
    Instrument,
    InstrumentListResult,
    RoeIndicator,
    SecurityQuote,
    SecurityQuoteBatch,
    ValuationSnapshot,
    ValuationSnapshotBatch,
)
from app.radar.calculations import (
    calculate_dividend_metrics,
    display_report_period,
    report_candidates,
)
from app.radar.schemas import NumberRange, RadarFilters, RadarSearchRequest
from app.radar.search import build_metric_plan, execute_radar_search
from app.radar.service import (
    create_search_job,
    get_radar_status,
    get_search_results,
    recover_stale_search_jobs,
)
from app.radar.upstream_control import RadarUpstreamController


@pytest.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None)


async def make_source(
    db: AsyncSession,
    settings: Settings,
    username: str = "radar-user",
) -> tuple[User, DataSource]:
    user = User(username=username, password_hash="not-used")
    db.add(user)
    await db.flush()
    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    source = DataSource(
        user_id=user.id,
        name="扶摇主数据",
        provider_type="fuyao",
        base_url="https://example.invalid",
        api_key_ciphertext=cipher.encrypt("test-api-key"),
        api_key_last4="-key",
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


class FakeFuyaoAdapter:
    list_calls = 0
    quote_calls = 0
    pb_calls = 0
    roe_calls = 0
    dividend_calls = 0

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    async def __aenter__(self) -> "FakeFuyaoAdapter":
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    @classmethod
    def reset(cls) -> None:
        cls.list_calls = 0
        cls.quote_calls = 0
        cls.pb_calls = 0
        cls.roe_calls = 0
        cls.dividend_calls = 0

    async def list_a_share_instruments(self) -> InstrumentListResult:
        self.__class__.list_calls += 1
        return InstrumentListResult(
            items=[
                Instrument(
                    thscode=code,
                    ticker=code.split(".")[0],
                    name=name,
                    asset_type="a_share",
                    exchange="SH",
                )
                for code, name in (
                    ("600001.SH", "完整公司"),
                    ("600002.SH", "缺股息公司"),
                    ("600003.SH", "越界公司"),
                )
            ],
            fetched_at=datetime.now(UTC),
        )

    async def get_security_quotes(
        self,
        instruments: list[Instrument],
        _concurrency: int,
    ) -> SecurityQuoteBatch:
        self.__class__.quote_calls += 1
        now = datetime.now(UTC)
        return SecurityQuoteBatch(
            quotes=[
                SecurityQuote(
                    thscode=instrument.thscode,
                    latest=10,
                    change_percent=1,
                    quoted_at=now,
                )
                for instrument in instruments
            ],
            fetched_at=now,
        )

    async def get_valuation_snapshots(
        self,
        thscodes: list[str],
        _concurrency: int,
    ) -> ValuationSnapshotBatch:
        self.__class__.pb_calls += 1
        now = datetime.now(UTC)
        return ValuationSnapshotBatch(
            items=[ValuationSnapshot(thscode=code, pb_mrq=1.2, metric_at=now) for code in thscodes],
            fetched_at=now,
        )

    async def get_roe_indicator(self, thscode: str, reports: list[str]) -> RoeIndicator:
        self.__class__.roe_calls += 1
        values = {"600001.SH": 12, "600002.SH": 11, "600003.SH": 15}
        return RoeIndicator(
            thscode=thscode,
            report=reports[0],
            value=values[thscode],
            fetched_at=datetime.now(UTC),
        )

    async def get_dividend_events(
        self,
        thscode: str,
        _date_from: str,
        _date_to: str,
    ) -> DividendEventResult:
        self.__class__.dividend_calls += 1
        if thscode == "600002.SH":
            raise DataSourceError(3002, "分红数据暂未就绪")
        amount = 0.5 if thscode == "600001.SH" else 0.3
        return DividendEventResult(
            thscode=thscode,
            items=[
                DividendEvent(
                    ex_date=datetime.now(UTC) - timedelta(days=30),
                    dividend_per_share=amount,
                )
            ],
            fetched_at=datetime.now(UTC),
        )


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, int | str] = {}

    async def get(self, key: str) -> int | str | None:
        return self.values.get(key)

    async def incr(self, key: str) -> int:
        value = int(self.values.get(key, 0)) + 1
        self.values[key] = value
        return value

    async def expire(self, _key: str, _seconds: int) -> bool:
        return True

    async def set(self, key: str, value: str, **_kwargs: object) -> bool:
        self.values[key] = value
        return True


def test_dividend_metrics_use_trailing_twelve_months_and_natural_year_streak() -> None:
    events = [
        DividendEvent(ex_date=datetime(2026, 7, 1, tzinfo=UTC), dividend_per_share=0.3),
        DividendEvent(ex_date=datetime(2025, 9, 1, tzinfo=UTC), dividend_per_share=0.2),
        DividendEvent(ex_date=datetime(2025, 6, 1, tzinfo=UTC), dividend_per_share=9),
        DividendEvent(ex_date=datetime(2024, 7, 1, tzinfo=UTC), dividend_per_share=0.1),
    ]

    dividend_yield, years = calculate_dividend_metrics(
        events,
        latest=10,
        as_of=date(2026, 8, 1),
    )

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


def test_metric_plan_only_blocks_on_active_filters_and_sort() -> None:
    dividend_only = build_metric_plan(
        RadarFilters(dividend_yield_ttm=NumberRange(minimum=4, maximum=6)),
        "dividend_yield_ttm",
    )
    assert dividend_only.refresh_dividends is True
    assert dividend_only.refresh_pb is False
    assert dividend_only.refresh_roe is False

    roe_sort = build_metric_plan(RadarFilters(), "roe_weighted")
    assert roe_sort.refresh_roe is True
    assert roe_sort.refresh_dividends is False
    assert roe_sort.refresh_pb is False


@pytest.mark.asyncio
async def test_upstream_controller_opens_capability_circuit(settings: Settings) -> None:
    cache = FakeRedis()
    controller = RadarUpstreamController(cache, uuid.uuid4(), settings)  # type: ignore[arg-type]

    for _ in range(settings.radar_breaker_failure_threshold):
        await controller.record_failure("financial_roe", 5003)

    with pytest.raises(DataSourceError, match="financial_roe"):
        await controller.before_request("financial_roe")


@pytest.mark.asyncio
async def test_on_demand_search_uses_three_value_logic_and_freezes_results(
    db: AsyncSession,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeFuyaoAdapter.reset()
    monkeypatch.setattr("app.radar.search.FuyaoAdapter", FakeFuyaoAdapter)
    user, _source = await make_source(db, settings)
    job, _queued, should_enqueue = await create_search_job(
        db,
        user,
        RadarSearchRequest(
            filters=RadarFilters(
                dividend_yield_ttm=NumberRange(minimum=4),
                roe_weighted=NumberRange(minimum=10),
            )
        ),
        settings,
    )
    assert should_enqueue is True

    await execute_radar_search(db, job.id, settings)
    await db.refresh(job)
    response = await get_search_results(
        db,
        user,
        job.id,
        page=1,
        sort_by="dividend_yield_ttm",
        sort_direction="desc",
    )

    assert job.state == "ready"
    assert response.total == 2
    assert response.incomplete_total == 1
    assert [item.thscode for item in response.items] == ["600001.SH", "600002.SH"]
    assert response.items[0].dividend_yield_ttm == pytest.approx(5)
    assert response.items[0].data_incomplete is False
    assert response.items[1].data_incomplete is True
    assert FakeFuyaoAdapter.pb_calls == 0
    assert FakeFuyaoAdapter.dividend_calls == 3
    assert FakeFuyaoAdapter.roe_calls == 2


@pytest.mark.asyncio
async def test_repeated_search_reuses_recent_identical_job(
    db: AsyncSession,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    FakeFuyaoAdapter.reset()
    monkeypatch.setattr("app.radar.search.FuyaoAdapter", FakeFuyaoAdapter)
    user, _source = await make_source(db, settings, "cache-user")

    first, _queued, first_should_enqueue = await create_search_job(
        db,
        user,
        RadarSearchRequest(),
        settings,
    )
    assert first_should_enqueue is True
    await execute_radar_search(db, first.id, settings)
    counts_after_first = (
        FakeFuyaoAdapter.list_calls,
        FakeFuyaoAdapter.pb_calls,
        FakeFuyaoAdapter.roe_calls,
        FakeFuyaoAdapter.dividend_calls,
    )

    second, reused, second_should_enqueue = await create_search_job(
        db,
        user,
        RadarSearchRequest(),
        settings,
    )

    assert second.id == first.id
    assert reused.state == "ready"
    assert second_should_enqueue is False
    assert (
        FakeFuyaoAdapter.list_calls,
        FakeFuyaoAdapter.pb_calls,
        FakeFuyaoAdapter.roe_calls,
        FakeFuyaoAdapter.dividend_calls,
    ) == counts_after_first
    assert FakeFuyaoAdapter.quote_calls == 1


@pytest.mark.asyncio
async def test_stale_queued_job_is_recovered(
    db: AsyncSession,
    settings: Settings,
) -> None:
    user, _source = await make_source(db, settings, "recovery-user")
    job, _queued, _should_enqueue = await create_search_job(
        db,
        user,
        RadarSearchRequest(),
        settings,
    )
    job.created_at = datetime.now(UTC) - timedelta(
        seconds=settings.radar_queued_stale_seconds + 1
    )
    await db.commit()

    recovered = await recover_stale_search_jobs(db, settings)
    await db.refresh(job)

    assert recovered == 1
    assert job.state == "failed"
    assert job.completed_at is not None


@pytest.mark.asyncio
async def test_radar_status_is_ready_without_prebuilt_snapshot(
    db: AsyncSession,
    settings: Settings,
) -> None:
    user, _source = await make_source(db, settings, "status-user")

    response = await get_radar_status(db, user)

    assert response.state == "ready"
    assert response.can_search is True
    assert response.cache_instrument_count == 0
    assert "按需检索" in (response.message or "")


@pytest.mark.asyncio
async def test_failed_job_is_reported_without_ready_result(
    db: AsyncSession,
    settings: Settings,
) -> None:
    user, source = await make_source(db, settings, "failed-user")
    job = RadarSearchJob(
        user_id=user.id,
        data_source_id=source.id,
        state="failed",
        stage="failed",
        stage_message="实时检索未完成",
        filters=RadarFilters().model_dump(mode="json"),
        sort_by="dividend_yield_ttm",
        sort_direction="desc",
        error_summary="数据源响应超时",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(job)
    await db.commit()

    with pytest.raises(Exception, match="数据源响应超时"):
        await get_search_results(
            db,
            user,
            job.id,
            page=1,
            sort_by="dividend_yield_ttm",
            sort_direction="desc",
        )
