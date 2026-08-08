from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.models import Holding, Portfolio, User
from app.data_sources.domain import Instrument
from app.holdings.schemas import HoldingCreate
from app.holdings.service import create_holding
from app.portfolios.schemas import PortfolioCreate, PortfolioOrderPayload, PortfolioUpdate
from app.portfolios.service import (
    create_portfolio,
    delete_portfolio,
    ensure_default_portfolio,
    list_portfolios,
    reorder_portfolios,
    set_default_portfolio,
    update_portfolio,
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


def holding_payload(thscode: str = "600519.SH") -> HoldingCreate:
    return HoldingCreate(
        thscode=thscode,
        average_cost=Decimal("10.0000"),
        quantity=100,
        opened_on=date(2026, 7, 1),
        note=None,
    )


def instrument(thscode: str = "600519.SH") -> Instrument:
    return Instrument(
        thscode=thscode,
        ticker=thscode.split(".")[0],
        name="贵州茅台" if thscode == "600519.SH" else "沪深300ETF",
        asset_type="a_share" if thscode == "600519.SH" else "fund_etf",
        exchange="SH",
    )


@pytest.mark.asyncio
async def test_default_portfolio_is_created_for_a_new_user(db: AsyncSession) -> None:
    user = await make_user(db, "portfolio-default")

    portfolio = await ensure_default_portfolio(db, user)
    listed = await list_portfolios(db, user)

    assert portfolio.name == "我的投资组合"
    assert portfolio.is_default
    assert len(listed.items) == 1
    assert listed.items[0].is_default
    assert listed.items[0].open_holding_count == 0


@pytest.mark.asyncio
async def test_same_instrument_can_be_open_in_different_portfolios(db: AsyncSession) -> None:
    user = await make_user(db, "portfolio-scope")
    first = await ensure_default_portfolio(db, user)
    second = await create_portfolio(db, user, PortfolioCreate(name="第二组合"))

    first_holding = await create_holding(
        db, user, holding_payload(), instrument(), portfolio_id=first.id
    )
    second_holding = await create_holding(
        db, user, holding_payload(), instrument(), portfolio_id=second.id
    )

    assert first_holding.id != second_holding.id
    listed = await list_portfolios(db, user)
    counts = {item.id: item.open_holding_count for item in listed.items}
    assert counts[first.id] == 1
    assert counts[second.id] == 1

    with pytest.raises(HTTPException) as duplicate:
        await create_holding(db, user, holding_payload(), instrument(), portfolio_id=first.id)
    assert duplicate.value.status_code == 409


@pytest.mark.asyncio
async def test_default_and_order_can_be_changed(db: AsyncSession) -> None:
    user = await make_user(db, "portfolio-order")
    first = await ensure_default_portfolio(db, user)
    second = await create_portfolio(db, user, PortfolioCreate(name="第二组合"))
    third = await create_portfolio(db, user, PortfolioCreate(name="第三组合"))

    await set_default_portfolio(db, user, third.id)
    reordered = await reorder_portfolios(
        db,
        user,
        PortfolioOrderPayload(portfolio_ids=[third.id, first.id, second.id]),
    )

    assert [item.id for item in reordered.items] == [third.id, first.id, second.id]
    assert reordered.items[0].is_default
    assert not reordered.items[1].is_default


@pytest.mark.asyncio
async def test_delete_portfolio_cascades_holdings_and_promotes_next_default(
    db: AsyncSession,
) -> None:
    user = await make_user(db, "portfolio-delete")
    first = await ensure_default_portfolio(db, user)
    second = await create_portfolio(db, user, PortfolioCreate(name="第二组合"))
    await create_holding(db, user, holding_payload(), instrument(), portfolio_id=first.id)

    await delete_portfolio(db, user, first.id)

    remaining = await db.scalar(select(Portfolio).where(Portfolio.id == second.id))
    orphaned = list(
        (
            await db.scalars(select(Holding).where(Holding.portfolio_id == first.id))
        ).all()
    )
    assert remaining is not None
    assert remaining.is_default
    assert orphaned == []


@pytest.mark.asyncio
async def test_update_portfolio_preserves_holdings(db: AsyncSession) -> None:
    user = await make_user(db, "portfolio-update")
    portfolio = await ensure_default_portfolio(db, user)
    await create_holding(db, user, holding_payload(), instrument(), portfolio_id=portfolio.id)

    updated = await update_portfolio(
        db,
        user,
        portfolio.id,
        PortfolioUpdate(name="长期组合", note="只做长期配置"),
    )

    assert updated.name == "长期组合"
    assert updated.note == "只做长期配置"
    holdings = list(
        (
            await db.scalars(select(Holding).where(Holding.portfolio_id == portfolio.id))
        ).all()
    )
    assert len(holdings) == 1
