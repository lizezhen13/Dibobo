import uuid
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.models import User
from app.data_sources.domain import Instrument, SecurityQuote
from app.watchlist.schemas import (
    WatchlistBatchDeletePayload,
    WatchlistItemCreate,
    WatchlistItemUpdate,
    WatchlistOrderPayload,
)
from app.watchlist.service import (
    build_watchlist_items,
    create_watchlist_item,
    delete_watchlist_item,
    delete_watchlist_items,
    reorder_watchlist,
    update_watchlist_item,
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


def instrument(thscode: str = "600519.SH", name: str = "贵州茅台") -> Instrument:
    return Instrument(
        thscode=thscode,
        ticker=thscode.split(".")[0],
        name=name,
        asset_type="fund_etf" if thscode == "510300.SH" else "a_share",
        exchange=thscode.split(".")[1],  # type: ignore[arg-type]
        industry="白酒" if thscode == "600519.SH" else None,
    )


@pytest.mark.asyncio
async def test_watchlist_is_user_scoped_and_duplicate_is_rejected(db: AsyncSession) -> None:
    owner = await make_user(db, "watchlist-owner")
    other = await make_user(db, "watchlist-other")
    payload = WatchlistItemCreate(thscode="600519.SH", note="长期观察")

    first = await create_watchlist_item(db, owner, payload, instrument())

    with pytest.raises(HTTPException) as duplicate:
        await create_watchlist_item(db, owner, payload, instrument())
    assert duplicate.value.status_code == 409

    other_item = await create_watchlist_item(db, other, payload, instrument())
    assert first.id != other_item.id


@pytest.mark.asyncio
async def test_watchlist_new_items_are_added_to_top_and_order_can_be_saved(
    db: AsyncSession,
) -> None:
    user = await make_user(db, "watchlist-order")
    first = await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode="600519.SH"),
        instrument(),
    )
    second = await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode="510300.SH"),
        instrument("510300.SH", "沪深300ETF"),
    )

    assert second.sort_order == 0
    assert first.sort_order == 1

    await reorder_watchlist(db, user, WatchlistOrderPayload(item_ids=[first.id, second.id]))

    assert first.sort_order == 0
    assert second.sort_order == 1


@pytest.mark.asyncio
async def test_watchlist_note_update_and_delete_recompact_order(db: AsyncSession) -> None:
    user = await make_user(db, "watchlist-edit")
    first = await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode="600519.SH"),
        instrument(),
    )
    second = await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode="510300.SH"),
        instrument("510300.SH", "沪深300ETF"),
    )

    updated = await update_watchlist_item(
        db,
        user,
        second.id,
        WatchlistItemUpdate(note="观察成交量变化"),
    )
    assert updated.note == "观察成交量变化"

    await delete_watchlist_item(db, user, second.id)
    assert first.sort_order == 0


@pytest.mark.asyncio
async def test_watchlist_batch_delete_only_accepts_owned_records(db: AsyncSession) -> None:
    user = await make_user(db, "watchlist-batch")
    first = await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode="600519.SH"),
        instrument(),
    )
    second = await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode="510300.SH"),
        instrument("510300.SH", "沪深300ETF"),
    )

    count = await delete_watchlist_items(
        db,
        user,
        WatchlistBatchDeletePayload(item_ids=[first.id, second.id]),
    )
    assert count == 2


def test_watchlist_items_include_quote_fields_and_preserve_missing_values() -> None:
    from app.core.models import WatchlistItem

    now = datetime.now(UTC)
    item = WatchlistItem(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        thscode="600519.SH",
        ticker="600519",
        name="贵州茅台",
        asset_type="a_share",
        exchange="SH",
        industry="白酒",
        note=None,
        sort_order=0,
        added_at=now,
        created_at=now,
        updated_at=now,
    )
    priced = build_watchlist_items(
        [item],
        {
            "600519.SH": SecurityQuote(
                thscode="600519.SH",
                latest=1288.5,
                change=12.2,
                change_percent=0.95,
                volume=100000,
                turnover=128850000,
                quoted_at=now,
            )
        },
    )[0]
    missing = build_watchlist_items([item], {})[0]

    assert priced.latest == 1288.5
    assert priced.change == 12.2
    assert priced.volume == 100000
    assert priced.turnover == 128850000
    assert missing.latest is None
    assert missing.change_percent is None
