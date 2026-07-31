import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_csrf
from app.core.database import get_db
from app.core.models import User
from app.journals.schemas import (
    JournalCreate,
    JournalItem,
    JournalListResponse,
    JournalUpdate,
    MessageResponse,
)
from app.journals.service import (
    create_journal,
    delete_journal,
    get_owned_journal,
    list_journals,
    record_to_item,
    update_journal,
)

router = APIRouter(prefix="/journals", tags=["投资日记"])


@router.get("", response_model=JournalListResponse)
async def get_journals(
    date_from: date | None = None,
    date_to: date | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JournalListResponse:
    if date_from is not None and date_to is not None and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="开始日期不能晚于结束日期",
        )
    return await list_journals(
        db,
        user,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )


@router.get("/{journal_id}", response_model=JournalItem)
async def get_journal(
    journal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JournalItem:
    return record_to_item(await get_owned_journal(db, user, journal_id))


@router.post(
    "",
    response_model=JournalItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def post_journal(
    payload: JournalCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JournalItem:
    return record_to_item(await create_journal(db, user, payload))


@router.patch(
    "/{journal_id}",
    response_model=JournalItem,
    dependencies=[Depends(require_csrf)],
)
async def patch_journal(
    journal_id: uuid.UUID,
    payload: JournalUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> JournalItem:
    return record_to_item(await update_journal(db, user, journal_id, payload))


@router.delete(
    "/{journal_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def remove_journal(
    journal_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await delete_journal(db, user, journal_id)
    return MessageResponse(message="投资日记已永久删除")
