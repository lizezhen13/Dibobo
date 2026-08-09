import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user, require_csrf
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.data_sources.domain import AssetType
from app.watchlist.schemas import (
    MessageResponse,
    WatchlistBatchDeletePayload,
    WatchlistItemCreate,
    WatchlistItemResponse,
    WatchlistItemUpdate,
    WatchlistListResponse,
    WatchlistOrderPayload,
)
from app.watchlist.service import (
    build_watchlist_items,
    create_watchlist_item,
    delete_watchlist_item,
    delete_watchlist_items,
    list_watchlist,
    reorder_watchlist,
    resolve_watchlist_instrument,
    update_watchlist_item,
)

router = APIRouter(tags=["自选管理"])


@router.get("/watchlist", response_model=WatchlistListResponse)
async def get_watchlist(
    keyword: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    asset_type: Annotated[AssetType | None, Query()] = None,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WatchlistListResponse:
    return await list_watchlist(
        db,
        cache,
        user,
        settings,
        keyword=keyword.strip() if keyword else None,
        asset_type=asset_type,
    )


@router.post(
    "/watchlist",
    response_model=WatchlistItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def post_watchlist_item(
    payload: WatchlistItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> WatchlistItemResponse:
    instrument = await resolve_watchlist_instrument(db, user, payload.thscode, settings)
    item = await create_watchlist_item(db, user, payload, instrument)
    return build_watchlist_items([item], {})[0]


@router.patch(
    "/watchlist/order",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def patch_watchlist_order(
    payload: WatchlistOrderPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await reorder_watchlist(db, user, payload)
    return MessageResponse(message="自选顺序已保存")


@router.post(
    "/watchlist/batch-delete",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def batch_delete_watchlist(
    payload: WatchlistBatchDeletePayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    count = await delete_watchlist_items(db, user, payload)
    return MessageResponse(message=f"已删除 {count} 条自选记录")


@router.patch(
    "/watchlist/{item_id}",
    response_model=WatchlistItemResponse,
    dependencies=[Depends(require_csrf)],
)
async def patch_watchlist_item(
    item_id: uuid.UUID,
    payload: WatchlistItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WatchlistItemResponse:
    item = await update_watchlist_item(db, user, item_id, payload)
    return build_watchlist_items([item], {})[0]


@router.delete(
    "/watchlist/{item_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def remove_watchlist_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await delete_watchlist_item(db, user, item_id)
    return MessageResponse(message="自选记录已永久删除")
