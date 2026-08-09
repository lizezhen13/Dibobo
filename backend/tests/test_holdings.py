from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.models import Holding, User
from app.data_sources.domain import Instrument, InstrumentSearchResult, SecurityQuote
from app.holdings import service as holdings_service
from app.holdings.schemas import HoldingCreate, HoldingOrderPayload, HoldingUpdate, InstrumentResponse
from app.holdings.service import (
    build_holding_items,
    calculate_realized_values,
    calculate_summary_values,
    create_holding,
    get_owned_holding,
    reorder_holdings,
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
async def test_instrument_search_maps_domain_models_to_response_models(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = SimpleNamespace(id="source-id", provider_type="fuyao")
    user = SimpleNamespace(id="user-id")

    async def active_source(*_: object) -> SimpleNamespace:
        return source

    class StubAdapter:
        async def __aenter__(self) -> "StubAdapter":
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def search_instruments(
            self,
            query: str,
            limit: int = 10,
        ) -> InstrumentSearchResult:
            assert query == "中国平安"
            assert limit == 10
            return InstrumentSearchResult(
                items=[
                    Instrument(
                        thscode="601318.SH",
                        ticker="601318",
                        name="中国平安",
                        asset_type="a_share",
                        exchange="SH",
                    )
                ],
                fetched_at=datetime.now(UTC),
            )

    monkeypatch.setattr(holdings_service, "_active_source", active_source)
    monkeypatch.setattr(holdings_service, "_adapter", lambda *_: StubAdapter())

    result = await holdings_service.search_instruments(object(), user, "中国平安", object())  # type: ignore[arg-type]

    assert result.items == [
        InstrumentResponse(
            thscode="601318.SH",
            ticker="601318",
            name="中国平安",
            asset_type="a_share",
            exchange="SH",
        )
    ]


@pytest.mark.asyncio
async def test_duplicate_open_holding_is_rejected_but_reopen_after_close_is_allowed(
    db: AsyncSession,
) -> None:
    user = await make_user(db, "alice")
    first = await create_holding(db, user, payload(), instrument())

    with pytest.raises(HTTPException) as duplicate:
        await create_holding(db, user, payload(), instrument())
    assert duplicate.value.status_code == 409

    await update_holding(
        db,
        user,
        first.id,
        HoldingUpdate(quantity=0, close_price=Decimal("12"), closed_on=date(2026, 7, 2)),
    )
    reopened = await create_holding(db, user, payload(average_cost="12.5"), instrument())

    assert reopened.id != first.id
    assert reopened.status == "open"
    assert first.status == "closed"
    assert first.closed_at is not None


@pytest.mark.asyncio
async def test_closing_requires_details_and_calculates_realized_gain(db: AsyncSession) -> None:
    user = await make_user(db, "realized-gain")
    holding = await create_holding(db, user, payload(average_cost="10", quantity=100), instrument())

    with pytest.raises(HTTPException) as missing_details:
        await update_holding(db, user, holding.id, HoldingUpdate(quantity=0))
    assert missing_details.value.status_code == 422

    closed = await update_holding(
        db,
        user,
        holding.id,
        HoldingUpdate(quantity=0, close_price=Decimal("12"), closed_on=date(2026, 7, 2)),
    )
    item = build_holding_items([closed], {})[0]
    realized_gain, realized_gain_percent, incomplete = calculate_realized_values([closed])

    assert closed.quantity == 0
    assert closed.closed_quantity == 100
    assert closed.close_price == Decimal("12.0000")
    assert item.cost_amount == 1000
    assert item.close_amount == 1200
    assert item.realized_gain == 200
    assert item.realized_gain_percent == 20
    assert realized_gain == Decimal("200")
    assert realized_gain_percent == Decimal("20")
    assert not incomplete


@pytest.mark.asyncio
async def test_open_holdings_can_be_reordered_within_a_portfolio(db: AsyncSession) -> None:
    user = await make_user(db, "holding-order")
    first = await create_holding(db, user, payload(), instrument("600519.SH"))
    second = await create_holding(db, user, payload(thscode="510300.SH"), instrument("510300.SH"))
    third = await create_holding(db, user, payload(thscode="000001.SZ"), instrument("000001.SZ"))

    assert [first.sort_order, second.sort_order, third.sort_order] == [0, 1, 2]

    result = await reorder_holdings(
        db,
        user,
        first.portfolio_id,
        HoldingOrderPayload(holding_ids=[third.id, first.id, second.id]),
    )

    assert result.message == "持仓排序已保存"
    ordered = list(
        (
            await db.scalars(
                select(Holding)
                .where(Holding.portfolio_id == first.portfolio_id, Holding.status == "open")
                .order_by(Holding.sort_order)
            )
        ).all()
    )
    assert [holding.id for holding in ordered] == [third.id, first.id, second.id]


@pytest.mark.asyncio
async def test_holding_lookup_is_scoped_to_owner(db: AsyncSession) -> None:
    owner = await make_user(db, "owner")
    other = await make_user(db, "other")
    holding = await create_holding(db, owner, payload(), instrument())

    with pytest.raises(HTTPException) as error:
        await get_owned_holding(db, other, holding.id)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_closed_holding_allows_note_and_close_detail_edit(db: AsyncSession) -> None:
    user = await make_user(db, "archivist")
    holding = await create_holding(db, user, payload(), instrument())
    await update_holding(
        db,
        user,
        holding.id,
        HoldingUpdate(quantity=0, close_price=Decimal("12"), closed_on=date(2026, 7, 2)),
    )

    updated = await update_holding(
        db,
        user,
        holding.id,
        HoldingUpdate(note="复盘完成", close_price=Decimal("11.5")),
    )
    assert updated.note == "复盘完成"
    assert updated.close_price == Decimal("11.5000")

    with pytest.raises(HTTPException) as error:
        await update_holding(db, user, holding.id, HoldingUpdate(quantity=10))
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_sqlite_holding_timestamps_are_serialized_as_utc(db: AsyncSession) -> None:
    user = await make_user(db, "timezone-check")
    holding = await create_holding(db, user, payload(), instrument())
    closed = await update_holding(
        db,
        user,
        holding.id,
        HoldingUpdate(quantity=0, close_price=Decimal("12"), closed_on=date(2026, 7, 2)),
    )

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
        portfolio_id=priced.portfolio_id,
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
