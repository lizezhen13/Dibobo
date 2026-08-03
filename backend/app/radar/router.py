import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user, require_csrf
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.radar.schemas import (
    RadarQuotesResponse,
    RadarSearchQueuedResponse,
    RadarSearchRequest,
    RadarSearchResponse,
    RadarSearchStatusResponse,
    RadarSortField,
    RadarStatusResponse,
    SortDirection,
)
from app.radar.service import (
    create_search_job,
    get_radar_quotes,
    get_radar_status,
    get_search_results,
    get_search_status,
)
from app.tasks.celery_app import run_radar_search

router = APIRouter(prefix="/radar", tags=["红利雷达"])


@router.get("/status", response_model=RadarStatusResponse)
async def radar_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RadarStatusResponse:
    return await get_radar_status(db, user)


@router.post(
    "/search",
    response_model=RadarSearchQueuedResponse,
    dependencies=[Depends(require_csrf)],
    status_code=status.HTTP_202_ACCEPTED,
)
async def radar_search(
    payload: RadarSearchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RadarSearchQueuedResponse:
    job, response, should_enqueue = await create_search_job(db, user, payload, settings)
    if not should_enqueue:
        return response
    try:
        run_radar_search.delay(str(job.id), str(job.data_source_id))
    except Exception as exc:
        job.state = "failed"
        job.stage = "failed"
        job.stage_message = "后台任务队列暂不可用"
        job.error_summary = "后台任务队列暂不可用，请稍后重试"
        job.completed_at = datetime.now(UTC)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="后台任务队列暂不可用，请稍后重试",
        ) from exc
    return response


@router.get("/search/{search_id}/status", response_model=RadarSearchStatusResponse)
async def radar_search_status(
    search_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RadarSearchStatusResponse:
    return await get_search_status(db, user, search_id)


@router.get("/results", response_model=RadarSearchResponse)
async def radar_results(
    search_id: uuid.UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    sort_by: RadarSortField = "dividend_yield_ttm",
    sort_direction: SortDirection = "desc",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RadarSearchResponse:
    return await get_search_results(
        db,
        user,
        search_id,
        page,
        sort_by,
        sort_direction,
    )


@router.get("/quotes", response_model=RadarQuotesResponse)
async def radar_quotes(
    search_id: uuid.UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    sort_by: RadarSortField = "dividend_yield_ttm",
    sort_direction: SortDirection = "desc",
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RadarQuotesResponse:
    return await get_radar_quotes(
        db,
        cache,
        user,
        search_id,
        page,
        sort_by,
        sort_direction,
        settings,
    )
