from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.models import Holding, User
from app.data_sources.domain import Instrument, SecurityQuote
from app.holdings.schemas import HoldingCreate, HoldingUpdate
from app.holdings.service import (
    build_holding_items,
    calculate_summary_values,
    create_holding,
    get_owned_holding,
    update_holding,
)


@pytest.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


async def make_user(db: AsyncSession, username: str) -> User:
    user = User(username=username, password_hash="not-used")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def instrument(thscode: str = "600519.SH") -> Instrument:
    return Instrument(
        thscode=thscode,
        ticker=thscode.split(".")[0],
        name="贵州茅台" if thscode == "600519.SH" else "沪深300ETF",
        asset_type="a_share" if thscode == "600519.SH" else "fund_etf",
        exchange="SH",
    )


def payload(
    *,
    thscode: str = "600519.SH",
    average_cost: str = "10.0000",
    quantity: int = 100,
) -> HoldingCreate:
    return HoldingCreate(
        thscode=thscode,
        average_cost=Decimal(average_cost),
        quantity=quantity,
        opened_on=date(2026, 7, 1),
        note="核心仓位",
    )


@pytest.mark.asyncio
async def test_duplicate_open_holding_is_rejected_but_reopen_after_close_is_allowed(
    db: AsyncSession,
) -> None:
    user = await make_user(db, "alice")
    first = await create_holding(db, user, payload(), instrument())

    with pytest.raises(HTTPException) as duplicate:
        await create_holding(db, user, payload(), instrument())
    assert duplicate.value.status_code == 409

    await update_holding(db, user, first.id, HoldingUpdate(quantity=0))
    reopened = await create_holding(db, user, payload(average_cost="12.5"), instrument())

    assert reopened.id != first.id
    assert reopened.status == "open"
    assert first.status == "closed"
    assert first.closed_at is not None


@pytest.mark.asyncio
async def test_holding_lookup_is_scoped_to_owner(db: AsyncSession) -> None:
    owner = await make_user(db, "owner")
    other = await make_user(db, "other")
    holding = await create_holding(db, owner, payload(), instrument())

    with pytest.raises(HTTPException) as error:
        await get_owned_holding(db, other, holding.id)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_closed_holding_only_allows_note_edit(db: AsyncSession) -> None:
    user = await make_user(db, "archivist")
    holding = await create_holding(db, user, payload(), instrument())
    await update_holding(db, user, holding.id, HoldingUpdate(quantity=0))

    updated = await update_holding(db, user, holding.id, HoldingUpdate(note="复盘完成"))
    assert updated.note == "复盘完成"

    with pytest.raises(HTTPException) as error:
        await update_holding(db, user, holding.id, HoldingUpdate(quantity=10))
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_sqlite_holding_timestamps_are_serialized_as_utc(db: AsyncSession) -> None:
    user = await make_user(db, "timezone-check")
    holding = await create_holding(db, user, payload(), instrument())
    closed = await update_holding(db, user, holding.id, HoldingUpdate(quantity=0))

    item = build_holding_items([closed], {})[0]
    dumped = item.model_dump(mode="json")

    assert item.closed_at is not None
    assert item.closed_at.utcoffset() is not None
    assert dumped["closed_at"].endswith("Z")
    assert dumped["created_at"].endswith("Z")
    assert dumped["updated_at"].endswith("Z")


@pytest.mark.asyncio
async def test_holding_formulas_cover_missing_quote_and_zero_cost(db: AsyncSession) -> None:
    user = await make_user(db, "calculator")
    priced = await create_holding(db, user, payload(average_cost="10", quantity=100), instrument())
    missing = await create_holding(
        db,
        user,
        payload(thscode="510300.SH", average_cost="20", quantity=50),
        instrument("510300.SH"),
    )
    zero_cost = Holding(
        user_id=user.id,
        thscode="000001.SZ",
        ticker="000001",
        name="平安银行",
        asset_type="a_share",
        exchange="SZ",
        average_cost=Decimal("0"),
        quantity=10,
        opened_on=date(2026, 7, 1),
        status="open",
    )
    db.add(zero_cost)
    await db.commit()
    await db.refresh(zero_cost)

    quotes = {
        "600519.SH": SecurityQuote(thscode="600519.SH", latest=12, change_percent=1.5),
        "000001.SZ": SecurityQuote(thscode="000001.SZ", latest=5, change_percent=-0.5),
    }
    items = {
        item.thscode: item
        for item in build_holding_items([priced, missing, zero_cost], quotes)
    }
    summary = calculate_summary_values([priced, missing, zero_cost], quotes)

    assert items["600519.SH"].cost_amount == 1000
    assert items["600519.SH"].market_value == 1200
    assert items["600519.SH"].floating_gain == 200
    assert items["600519.SH"].floating_gain_percent == 20
    assert items["510300.SH"].market_value is None
    assert items["000001.SZ"].floating_gain_percent is None
    assert summary.total_cost == Decimal("2000")
    assert summary.priced_cost == Decimal("1000")
    assert summary.total_market_value == Decimal("1250")
    assert summary.floating_gain == Decimal("250")
    assert summary.floating_gain_percent == Decimal("25")
    assert summary.incomplete
