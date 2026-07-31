import uuid

from fastapi import APIRouter, Depends, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user, require_csrf
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.overview.service import invalidate_data_source_cache
from app.settings.schemas import (
    ConnectionTestResponse,
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
    MessageResponse,
)
from app.settings.service import (
    activate_source,
    create_source,
    delete_source,
    list_sources,
    test_source_connection,
    to_response,
    update_source,
)

router = APIRouter(prefix="/settings/data-sources", tags=["系统设置"])


@router.get("", response_model=list[DataSourceResponse])
async def get_data_sources(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DataSourceResponse]:
    return await list_sources(db, user)


@router.post(
    "",
    response_model=DataSourceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
async def post_data_source(
    payload: DataSourceCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> DataSourceResponse:
    return to_response(await create_source(db, user, payload, settings))


@router.patch(
    "/{source_id}",
    response_model=DataSourceResponse,
    dependencies=[Depends(require_csrf)],
)
async def patch_data_source(
    source_id: uuid.UUID,
    payload: DataSourceUpdate,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> DataSourceResponse:
    source = await update_source(db, user, source_id, payload, settings)
    await invalidate_data_source_cache(cache, source.id)
    return to_response(source)


@router.delete(
    "/{source_id}",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def remove_data_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
) -> MessageResponse:
    await delete_source(db, user, source_id)
    await invalidate_data_source_cache(cache, source_id)
    return MessageResponse(message="数据源已永久删除")


@router.post(
    "/{source_id}/test",
    response_model=ConnectionTestResponse,
    dependencies=[Depends(require_csrf)],
)
async def test_data_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ConnectionTestResponse:
    return await test_source_connection(db, user, source_id, settings)


@router.post(
    "/{source_id}/activate",
    response_model=DataSourceResponse,
    dependencies=[Depends(require_csrf)],
)
async def enable_data_source(
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
) -> DataSourceResponse:
    source = await activate_source(db, user, source_id)
    await invalidate_data_source_cache(cache, source.id)
    return to_response(source)

