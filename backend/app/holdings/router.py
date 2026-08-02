import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user, require_csrf
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.data_sources.domain import AssetType
from app.holdings.schemas import (
    HoldingCreate,
    HoldingItem,
    HoldingsListResponse,
    HoldingStatus,
    HoldingSummaryResponse,
    HoldingUpdate,
    InstrumentSearchResponse,
    MessageResponse,
)
from app.holdings.service import (
    create_holding,
    delete_holding,
    get_holding_summary,
    list_holdings,
    record_to_item,
    resolve_instrument,
    search_instruments,
    update_holding,
)

router = APIRouter(tags=["持仓管理"])


@router.get("/instruments/search", response_model=InstrumentSearchResponse)
async def get_instrument_search(
    q: Annotated[str, Query(min_length=1, max_length=80)],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> InstrumentSearchResponse:
    return await search_instruments(db, user, q.strip(), settings)


@router.get("/holdings", response_model=HoldingsListResponse)
async def get_holdings(
    status_filter: Annotated[HoldingStatus, Query(alias="status")] = "open",
    keyword: Annotated[str | None, Query(alias="keyword", min_length=1, max_length=80)] = None,
    asset_type: Annotated[AssetType | None, Query(alias="asset_type")] = None,
    opened_from: Annotated[date | None, Query(alias="opened_from")] = None,
    opened_to: Annotated[date | None, Query(alias="opened_to")] = None,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> HoldingsListResponse:
    return await list_holdings(
        db,
        cache,
        user,
        status_filter,
        settings,
        keyword=keyword,
        asset_type=asset_type,
        opened_from=opened_from,
        opened_to=opened_to,
    )


@router.get("/holdings/summary", response_model=HoldingSummaryResponse)
async def get_holdings_summary(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> HoldingSummaryResponse:
    return await get_holding_summary(db, cache, user, settings)


@router.post(
    "/holdings",
    response_model=HoldingItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def post_holding(
    payload: HoldingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> HoldingItem:
    instrument = await resolve_instrument(db, user, payload.thscode, settings)
    return record_to_item(await create_holding(db, user, payload, instrument))


@router.patch(
    "/holdings/{holding_id}",
    response_model=HoldingItem,
    dependencies=[Depends(require_csrf)],
)
async def patch_holding(
    holding_id: uuid.UUID,
    payload: HoldingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HoldingItem:
    return record_to_item(await update_holding(db, user, holding_id, payload))


@router.delete(
    "/holdings/{holding_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def remove_holding(
    holding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await delete_holding(db, user, holding_id)
    return MessageResponse(message="持仓记录已永久删除")
