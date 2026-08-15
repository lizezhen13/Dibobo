from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_cache, get_current_user, require_csrf
from app.calendar.schemas import (
    CalendarCategory,
    CalendarEventsResponse,
    CalendarFiltersResponse,
    CalendarRefreshRequest,
    CalendarScope,
)
from app.calendar.service import filters, get_event, list_events, validate_markets
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User
from app.data_sources.longbridge import LongbridgeError

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _category(value: str) -> CalendarCategory:
    try:
        return CalendarCategory(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="不支持的事件日历分类") from exc


def _csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def _importance(value: str | None) -> list[int]:
    result: list[int] = []
    for item in _csv(value):
        try:
            parsed = int(item)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="重要性筛选项必须是 1、2 或 3") from exc
        if parsed not in {1, 2, 3}:
            raise HTTPException(status_code=400, detail="重要性筛选项必须是 1、2 或 3")
        result.append(parsed)
    return sorted(set(result))


def _scope(value: str) -> CalendarScope:
    try:
        return CalendarScope(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="不支持的事件范围") from exc


async def _list(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
    *,
    category_value: str,
    start: date,
    end: date,
    markets_value: str | None,
    scope_value: str,
    importance_value: str | None,
    refresh: bool,
    limit: int,
) -> CalendarEventsResponse:
    category = _category(category_value)
    if start > end:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    markets = _csv(markets_value)
    try:
        validate_markets(category, markets)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return await list_events(
            db,
            cache,
            user,
            settings,
            category=category,
            start=start,
            end=end,
            markets=markets,
            scope=_scope(scope_value),
            importance=_importance(importance_value),
            refresh=refresh,
            limit=limit,
        )
    except LongbridgeError as exc:
        response_status = (
            status.HTTP_401_UNAUTHORIZED
            if exc.code == 2001
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=response_status, detail=exc.user_message) from exc


@router.get("/events", response_model=CalendarEventsResponse)
async def read_events(
    category: Annotated[str, Query(...)],
    start: Annotated[date, Query(..., alias="from")],
    end: Annotated[date, Query(..., alias="to")],
    markets: Annotated[str | None, Query()] = None,
    scope: Annotated[str, Query()] = CalendarScope.ALL.value,
    importance: Annotated[str | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 500,
    refresh: Annotated[bool, Query()] = False,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> CalendarEventsResponse:
    del cursor  # Cursor pagination is reserved for the next slice; dates are bounded in V1.
    return await _list(
        db,
        cache,
        user,
        settings,
        category_value=category,
        start=start,
        end=end,
        markets_value=markets,
        scope_value=scope,
        importance_value=importance,
        refresh=refresh,
        limit=limit,
    )


@router.get("/events/{event_id}")
async def read_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    _: User = Depends(get_current_user),
) -> object:
    try:
        return await get_event(db, cache, event_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="事件不存在或已过期") from exc


@router.get("/filters", response_model=CalendarFiltersResponse)
async def read_filters(
    category: str = Query(...),
    _: User = Depends(get_current_user),
) -> CalendarFiltersResponse:
    return filters(_category(category))


@router.post(
    "/refresh",
    response_model=CalendarEventsResponse,
    dependencies=[Depends(require_csrf)],
)
async def refresh_events(
    payload: CalendarRefreshRequest,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> CalendarEventsResponse:
    try:
        validate_markets(payload.category, payload.markets)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if payload.from_date > payload.to_date:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    try:
        return await list_events(
            db,
            cache,
            user,
            settings,
            category=payload.category,
            start=payload.from_date,
            end=payload.to_date,
            markets=payload.markets,
            scope=payload.scope,
            importance=payload.importance,
            refresh=True,
        )
    except LongbridgeError as exc:
        response_status = (
            status.HTTP_401_UNAUTHORIZED
            if exc.code == 2001
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(status_code=response_status, detail=exc.user_message) from exc
