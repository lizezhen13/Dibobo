from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.overview.schemas import OverviewIndicesResponse
from app.overview.service import get_overview_indices

router = APIRouter(prefix="/overview", tags=["总览"])


@router.get("/indices", response_model=OverviewIndicesResponse)
async def indices(
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> OverviewIndicesResponse:
    return await get_overview_indices(db, cache, user, settings)

