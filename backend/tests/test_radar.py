from datetime import UTC, date, datetime

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.core.database import Base
from app.core.models import DataSource, RadarSnapshot, User, WatchlistItem
from app.data_sources.longbridge import LongbridgeScreenerItem
from app.radar.schemas import RadarFilters
from app.radar.service import (
    DEFAULT_RADAR_FILTERS,
    RadarSearchResult,
    read_daily_radar,
    refresh_daily_radar,
)
from app.watchlist.schemas import WatchlistFromRadarCreate
from app.watchlist.service import create_watchlist_item_from_radar


@pytest.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


async def make_user_and_source(db: AsyncSession) -> tuple[User, DataSource]:
    user = User(username="radar-user", password_hash="not-used")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    source = DataSource(
        user_id=user.id,
        name="Longbridge",
        provider_type="longbridge",
        base_url="https://openapi.longbridge.cn",
        api_key_ciphertext="encrypted",
        api_key_last4="oken",
        is_active=True,
        last_test_status="success",
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return user, source


def test_radar_filters_are_inclusive_and_validate_ranges() -> None:
    filters = RadarFilters(market_cap_min=1000, dividend_yield_min=4)
    assert filters.market_cap_min == 1000
    assert filters.dividend_yield_min == 4
    assert DEFAULT_RADAR_FILTERS.market_cap_min == 800
    assert DEFAULT_RADAR_FILTERS.dividend_yield_min == 4

    with pytest.raises(ValidationError):
        RadarFilters(pb_min=2, pb_max=1)


@pytest.mark.asyncio
async def test_daily_snapshot_keeps_missing_metrics_and_marks_watchlist_state(
    db: AsyncSession,
) -> None:
    user, source = await make_user_and_source(db)
    snapshot = RadarSnapshot(
        user_id=user.id,
        data_source_id=source.id,
        run_date=date(2026, 8, 18),
        filters=DEFAULT_RADAR_FILTERS.model_dump(mode="json"),
        items=[
            {
                "thscode": "600000.SH",
                "ticker": "600000",
                "name": "浦发银行",
                "exchange": "SH",
                "latest": 10.2,
                "change_percent": 1.1,
                "market_cap": 1200,
                "dividend_yield": 4.2,
                "pb": None,
                "pe_ttm": 5.2,
                "industry": "银行",
                "quoted_at": None,
                "data_quality": "incomplete",
                "missing_fields": ["市净率"],
            }
        ],
        total=1,
        status="success",
        generated_at=datetime(2026, 8, 18, 7, 35, tzinfo=UTC),
    )
    db.add(snapshot)
    db.add(
        WatchlistItem(
            user_id=user.id,
            thscode="600000.SH",
            ticker="600000",
            name="浦发银行",
            asset_type="a_share",
            exchange="SH",
            sort_order=0,
        )
    )
    await db.commit()

    response = await read_daily_radar(db, user, Settings(), page=1, page_size=20)

    assert response.snapshot_status == "success"
    assert response.total == 1
    assert response.items[0].pb is None
    assert response.items[0].data_quality == "incomplete"
    assert response.items[0].in_watchlist is True


@pytest.mark.asyncio
async def test_daily_refresh_persists_default_longbridge_result(
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user, source = await make_user_and_source(db)
    result = RadarSearchResult(
        items=[
            LongbridgeScreenerItem(
                thscode="000001.SZ",
                ticker="000001",
                name="平安银行",
                exchange="SZ",
                market_cap=1800,
                dividend_yield=4.6,
                pb=0.7,
                pe_ttm=5.3,
            )
        ],
        generated_at=datetime(2026, 8, 18, 7, 35, tzinfo=UTC),
    )

    async def fake_fetch(*_: object) -> RadarSearchResult:
        return result

    monkeypatch.setattr("app.radar.service._fetch_all_screener_items", fake_fetch)
    snapshot = await refresh_daily_radar(
        db,
        user,
        Settings(),
        run_date=date(2026, 8, 18),
    )

    assert snapshot is not None
    assert snapshot.data_source_id == source.id
    assert snapshot.status == "success"
    assert snapshot.total == 1
    assert snapshot.items[0]["thscode"] == "000001.SZ"


@pytest.mark.asyncio
async def test_radar_add_uses_existing_local_watchlist_and_rejects_duplicates(
    db: AsyncSession,
) -> None:
    user, _ = await make_user_and_source(db)
    payload = WatchlistFromRadarCreate(
        thscode="000001.SZ",
        name="平安银行",
        industry="银行",
    )
    item = await create_watchlist_item_from_radar(db, user, payload)
    assert item.thscode == "000001.SZ"
    assert item.industry == "银行"

    with pytest.raises(HTTPException) as error:
        await create_watchlist_item_from_radar(db, user, payload)
    assert error.value.status_code == 409


def test_radar_watchlist_payload_rejects_bj_symbols() -> None:
    with pytest.raises(ValidationError):
        WatchlistFromRadarCreate(thscode="430047.BJ", name="北交所样本")
