import uuid
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Journal, User
from app.journals.schemas import (
    JournalCreate,
    JournalItem,
    JournalListResponse,
    JournalUpdate,
)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def record_to_item(journal: Journal) -> JournalItem:
    return JournalItem(
        id=journal.id,
        journal_date=journal.journal_date,
        title=journal.title,
        content=journal.content,
        created_at=_as_utc(journal.created_at),
        updated_at=_as_utc(journal.updated_at),
    )


async def get_owned_journal(
    db: AsyncSession,
    user: User,
    journal_id: uuid.UUID,
) -> Journal:
    journal = await db.scalar(
        select(Journal).where(Journal.id == journal_id, Journal.user_id == user.id)
    )
    if journal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="投资日记不存在")
    return journal


async def list_journals(
    db: AsyncSession,
    user: User,
    *,
    date_from: date | None,
    date_to: date | None,
    page: int,
    page_size: int,
) -> JournalListResponse:
    filters = [Journal.user_id == user.id]
    if date_from is not None:
        filters.append(Journal.journal_date >= date_from)
    if date_to is not None:
        filters.append(Journal.journal_date <= date_to)

    total = int(await db.scalar(select(func.count(Journal.id)).where(*filters)) or 0)
    total_pages = (total + page_size - 1) // page_size
    records = list(
        (
            await db.scalars(
                select(Journal)
                .where(*filters)
                .order_by(Journal.journal_date.desc(), Journal.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
    )
    return JournalListResponse(
        items=[record_to_item(record) for record in records],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


async def create_journal(
    db: AsyncSession,
    user: User,
    payload: JournalCreate,
) -> Journal:
    journal = Journal(user_id=user.id, **payload.model_dump())
    db.add(journal)
    await db.commit()
    await db.refresh(journal)
    return journal


async def update_journal(
    db: AsyncSession,
    user: User,
    journal_id: uuid.UUID,
    payload: JournalUpdate,
) -> Journal:
    journal = await get_owned_journal(db, user, journal_id)
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(journal, field_name, value)
    await db.commit()
    await db.refresh(journal)
    return journal


async def delete_journal(
    db: AsyncSession,
    user: User,
    journal_id: uuid.UUID,
) -> None:
    journal = await get_owned_journal(db, user, journal_id)
    await db.delete(journal)
    await db.commit()
