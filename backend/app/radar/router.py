from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, require_csrf
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.data_sources.longbridge import LongbridgeError
from app.radar.schemas import RadarResponse, RadarSearchPayload
from app.radar.service import (
    RadarNotConfiguredError,
    read_daily_radar,
    search_radar,
)

router = APIRouter(tags=["红利雷达"])


def _raise_radar_http_error(exc: Exception) -> None:
    if isinstance(exc, RadarNotConfiguredError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    if isinstance(exc, LongbridgeError):
        if exc.code == 2001:
            http_status = status.HTTP_401_UNAUTHORIZED
        elif exc.code == 4001:
            http_status = status.HTTP_429_TOO_MANY_REQUESTS
        elif exc.code == 3001:
            http_status = status.HTTP_400_BAD_REQUEST
        else:
            http_status = status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=http_status, detail=exc.user_message) from exc
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="红利雷达暂时无法获取 Longbridge 数据，请稍后重试",
    ) from exc


@router.get("/radar", response_model=RadarResponse)
async def get_radar(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RadarResponse:
    return await read_daily_radar(
        db,
        user,
        settings,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/radar/search",
    response_model=RadarResponse,
    dependencies=[Depends(require_csrf)],
)
async def post_radar_search(
    payload: RadarSearchPayload,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RadarResponse:
    try:
        return await search_radar(db, user, payload, settings)
    except Exception as exc:  # noqa: BLE001 - normalize provider errors for the API contract
        _raise_radar_http_error(exc)
    raise AssertionError("unreachable")
