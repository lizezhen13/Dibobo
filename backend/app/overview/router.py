from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.overview.schemas import (
    OverviewDragonTigerResponse,
    OverviewHotStocksResponse,
    OverviewIndicesResponse,
    OverviewIndustriesResponse,
    OverviewMarketBreadthResponse,
)
from app.overview.service import (
    get_overview_dragon_tiger,
    get_overview_hot_stocks,
    get_overview_indices,
    get_overview_industries,
    get_overview_market_breadth,
)

router = APIRouter(prefix="/overview", tags=["总览"])


@router.get("/indices", response_model=OverviewIndicesResponse)
async def indices(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> OverviewIndicesResponse:
    return await get_overview_indices(db, cache, user, settings)


@router.get("/hot-stocks", response_model=OverviewHotStocksResponse)
async def hot_stocks(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> OverviewHotStocksResponse:
    return await get_overview_hot_stocks(db, cache, user, settings)


@router.get("/dragon-tiger", response_model=OverviewDragonTigerResponse)
async def dragon_tiger(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> OverviewDragonTigerResponse:
    return await get_overview_dragon_tiger(db, cache, user, settings)


@router.get("/industries", response_model=OverviewIndustriesResponse)
async def industries(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> OverviewIndustriesResponse:
    return await get_overview_industries(db, cache, user, settings)


@router.get("/market-breadth", response_model=OverviewMarketBreadthResponse)
async def market_breadth(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> OverviewMarketBreadthResponse:
    return await get_overview_market_breadth(db, cache, user, settings)
