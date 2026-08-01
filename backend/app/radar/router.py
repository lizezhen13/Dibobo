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
    RadarSearchRequest,
    RadarSearchResponse,
    RadarStatusResponse,
    RadarSyncQueuedResponse,
)
from app.radar.service import (
    get_active_source,
    get_radar_quotes,
    get_radar_status,
    search_radar,
)
from app.radar.sync import create_building_snapshot
from app.tasks.celery_app import sync_radar_snapshot

router = APIRouter(prefix="/radar", tags=["红利雷达"])


@router.get("/status", response_model=RadarStatusResponse)
async def radar_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RadarStatusResponse:
    return await get_radar_status(db, user)


@router.post(
    "/sync",
    response_model=RadarSyncQueuedResponse,
    dependencies=[Depends(require_csrf)],
)
async def start_radar_sync(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RadarSyncQueuedResponse:
    source = await get_active_source(db, user)
    if source is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="请先启用数据源")
    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前版本尚不支持该数据源类型",
        )
    snapshot, created = await create_building_snapshot(db, source)
    if created:
        try:
            sync_radar_snapshot.delay(str(snapshot.id))
        except Exception as exc:
            snapshot.status = "failed"
            snapshot.completed_at = datetime.now(UTC)
            snapshot.error_summary = "后台任务队列暂不可用"
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="后台任务队列暂不可用，请稍后重试",
            ) from exc
    return RadarSyncQueuedResponse(
        snapshot_id=snapshot.id,
        message="同步任务已进入后台队列" if created else "已有同步任务正在运行",
    )


@router.post(
    "/search",
    response_model=RadarSearchResponse,
    dependencies=[Depends(require_csrf)],
)
async def radar_search(
    payload: RadarSearchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RadarSearchResponse:
    return await search_radar(db, user, payload)


@router.get("/quotes", response_model=RadarQuotesResponse)
async def radar_quotes(
    search_id: uuid.UUID,
    page: Annotated[int | None, Query(ge=1)] = None,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RadarQuotesResponse:
    return await get_radar_quotes(db, cache, user, search_id, page, settings)
