from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.dependencies import get_cache, get_current_user, require_csrf
from app.core.config import Settings, get_settings
from app.core.models import User
from app.global_market.catalog import GlobalMarketGroup
from app.global_market.schemas import GlobalMarketRefreshResponse, GlobalMarketResponse
from app.global_market.service import read_global_market, refresh_global_market_group

router = APIRouter(prefix="/overview", tags=["总览"])


@router.get("/global-market", response_model=GlobalMarketResponse)
async def global_market(
    cache: Redis = Depends(get_cache),
    _: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> GlobalMarketResponse:
    """Read the system-level published snapshot; never calls AKShare from HTTP."""
    return await read_global_market(cache, settings)


@router.post(
    "/global-market/{group}/refresh",
    response_model=GlobalMarketRefreshResponse,
    dependencies=[Depends(require_csrf)],
)
async def refresh_global_market_group_route(
    group: GlobalMarketGroup,
    cache: Redis = Depends(get_cache),
    settings: Settings = Depends(get_settings),
) -> GlobalMarketRefreshResponse:
    """Fetch one group immediately and publish its Valkey snapshot."""
    result = await refresh_global_market_group(cache, settings, group)
    return GlobalMarketRefreshResponse(
        group=result.group,
        state=result.state,
        acquired=result.acquired,
        message=result.message,
    )
