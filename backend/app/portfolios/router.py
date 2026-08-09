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
    HoldingOrderPayload,
    HoldingItem,
    HoldingsListResponse,
    HoldingStatus,
    HoldingSummaryResponse,
    HoldingUpdate,
    MessageResponse,
)
from app.holdings.service import (
    create_holding,
    delete_holding,
    get_holding_summary,
    list_holdings,
    record_to_item,
    reorder_holdings,
    resolve_instrument,
    update_holding,
)
from app.portfolios.schemas import (
    PortfolioCreate,
    PortfolioItem,
    PortfolioListResponse,
    PortfolioOrderPayload,
    PortfolioUpdate,
)
from app.portfolios.service import (
    create_portfolio,
    delete_portfolio,
    get_open_holding_count,
    get_owned_portfolio,
    list_portfolios,
    reorder_portfolios,
    set_default_portfolio,
    update_portfolio,
)
from app.portfolios.service import record_to_item as portfolio_to_item

router = APIRouter(tags=["投资组合"])


@router.get("/portfolios", response_model=PortfolioListResponse)
async def get_portfolios(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PortfolioListResponse:
    return await list_portfolios(db, user)


@router.post(
    "/portfolios",
    response_model=PortfolioItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def post_portfolio(
    payload: PortfolioCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PortfolioItem:
    portfolio = await create_portfolio(db, user, payload)
    return portfolio_to_item(portfolio)


@router.patch(
    "/portfolios/order",
    response_model=PortfolioListResponse,
    dependencies=[Depends(require_csrf)],
)
async def patch_portfolio_order(
    payload: PortfolioOrderPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PortfolioListResponse:
    return await reorder_portfolios(db, user, payload)


@router.get("/portfolios/{portfolio_id}", response_model=PortfolioItem)
async def get_portfolio(
    portfolio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PortfolioItem:
    portfolio = await get_owned_portfolio(db, user, portfolio_id)
    return portfolio_to_item(portfolio, await get_open_holding_count(db, portfolio.id))


@router.patch(
    "/portfolios/{portfolio_id}",
    response_model=PortfolioItem,
    dependencies=[Depends(require_csrf)],
)
async def patch_portfolio(
    portfolio_id: uuid.UUID,
    payload: PortfolioUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PortfolioItem:
    portfolio = await update_portfolio(db, user, portfolio_id, payload)
    return portfolio_to_item(portfolio, await get_open_holding_count(db, portfolio.id))


@router.post(
    "/portfolios/{portfolio_id}/default",
    response_model=PortfolioItem,
    dependencies=[Depends(require_csrf)],
)
async def post_portfolio_default(
    portfolio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PortfolioItem:
    portfolio = await set_default_portfolio(db, user, portfolio_id)
    return portfolio_to_item(portfolio, await get_open_holding_count(db, portfolio.id))


@router.delete(
    "/portfolios/{portfolio_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def remove_portfolio(
    portfolio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    return await delete_portfolio(db, user, portfolio_id)


@router.get("/portfolios/{portfolio_id}/summary", response_model=HoldingSummaryResponse)
async def get_portfolio_summary(
    portfolio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> HoldingSummaryResponse:
    await get_owned_portfolio(db, user, portfolio_id)
    return await get_holding_summary(db, cache, user, settings, portfolio_id=portfolio_id)


@router.get("/portfolios/{portfolio_id}/holdings", response_model=HoldingsListResponse)
async def get_portfolio_holdings(
    portfolio_id: uuid.UUID,
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
    await get_owned_portfolio(db, user, portfolio_id)
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
        portfolio_id=portfolio_id,
    )


@router.patch(
    "/portfolios/{portfolio_id}/holdings/order",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def patch_portfolio_holding_order(
    portfolio_id: uuid.UUID,
    payload: HoldingOrderPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await get_owned_portfolio(db, user, portfolio_id)
    return await reorder_holdings(db, user, portfolio_id, payload)


@router.post(
    "/portfolios/{portfolio_id}/holdings",
    response_model=HoldingItem,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def post_portfolio_holding(
    portfolio_id: uuid.UUID,
    payload: HoldingCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> HoldingItem:
    await get_owned_portfolio(db, user, portfolio_id)
    instrument = await resolve_instrument(db, user, payload.thscode, settings)
    return record_to_item(
        await create_holding(db, user, payload, instrument, portfolio_id=portfolio_id)
    )


@router.patch(
    "/portfolios/{portfolio_id}/holdings/{holding_id}",
    response_model=HoldingItem,
    dependencies=[Depends(require_csrf)],
)
async def patch_portfolio_holding(
    portfolio_id: uuid.UUID,
    holding_id: uuid.UUID,
    payload: HoldingUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HoldingItem:
    await get_owned_portfolio(db, user, portfolio_id)
    return record_to_item(
        await update_holding(db, user, holding_id, payload, portfolio_id=portfolio_id)
    )


@router.delete(
    "/portfolios/{portfolio_id}/holdings/{holding_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def remove_portfolio_holding(
    portfolio_id: uuid.UUID,
    holding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await get_owned_portfolio(db, user, portfolio_id)
    await delete_holding(db, user, holding_id, portfolio_id=portfolio_id)
    return MessageResponse(message="持仓记录已永久删除")
