from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.models import Journal, User
from app.journals.schemas import JournalCreate, JournalUpdate
from app.journals.service import (
    create_journal,
    delete_journal,
    get_owned_journal,
    list_journals,
    record_to_item,
    update_journal,
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


def payload(day: int, title: str) -> JournalCreate:
    return JournalCreate(
        journal_date=date(2026, 7, day),
        title=title,
        content=f"{title} 的复盘正文",
    )


@pytest.mark.asyncio
async def test_journal_list_is_user_scoped_sorted_filtered_and_paginated(
    db: AsyncSession,
) -> None:
    owner = await make_user(db, "owner")
    other = await make_user(db, "other")
    await create_journal(db, owner, payload(29, "较早记录"))
    await create_journal(db, owner, payload(31, "同日第一篇"))
    await create_journal(db, owner, payload(31, "同日第二篇"))
    await create_journal(db, other, payload(31, "其他用户记录"))

    first_page = await list_journals(
        db,
        owner,
        date_from=date(2026, 7, 30),
        date_to=date(2026, 7, 31),
        page=1,
        page_size=1,
    )
    second_page = await list_journals(
        db,
        owner,
        date_from=date(2026, 7, 30),
        date_to=date(2026, 7, 31),
        page=2,
        page_size=1,
    )

    assert first_page.total == 2
    assert first_page.total_pages == 2
    assert first_page.items[0].title == "同日第二篇"
    assert second_page.items[0].title == "同日第一篇"


@pytest.mark.asyncio
async def test_journal_lookup_update_and_delete_are_scoped_to_owner(db: AsyncSession) -> None:
    owner = await make_user(db, "writer")
    other = await make_user(db, "reader")
    journal = await create_journal(db, owner, payload(31, "初稿"))

    with pytest.raises(HTTPException) as hidden:
        await get_owned_journal(db, other, journal.id)
    assert hidden.value.status_code == 404

    updated = await update_journal(
        db,
        owner,
        journal.id,
        JournalUpdate(title="复盘终稿", content="  保留段落内容  "),
    )
    assert updated.title == "复盘终稿"
    assert updated.content == "保留段落内容"

    with pytest.raises(HTTPException) as forbidden_delete:
        await delete_journal(db, other, journal.id)
    assert forbidden_delete.value.status_code == 404

    await delete_journal(db, owner, journal.id)
    assert await db.get(Journal, journal.id) is None


@pytest.mark.asyncio
async def test_journal_timestamps_are_serialized_as_utc(db: AsyncSession) -> None:
    user = await make_user(db, "timezone-check")
    journal = await create_journal(db, user, payload(31, "时区验证"))

    dumped = record_to_item(journal).model_dump(mode="json")

    assert dumped["created_at"].endswith("Z")
    assert dumped["updated_at"].endswith("Z")
