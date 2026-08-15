from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class CalendarCategory(StrEnum):
    MACRO = "macro"
    EARNINGS = "earnings"
    DIVIDEND = "dividend"
    SPLIT = "split"
    CLOSED = "closed"


class CalendarScope(StrEnum):
    ALL = "all"
    WATCHLIST = "watchlist"
    HOLDING = "holding"


class CalendarDataSource(BaseModel):
    name: str
    state: Literal["ready", "stale", "error", "missing"]
    message: str | None = None


class CalendarEvent(BaseModel):
    id: str
    provider: str = "longbridge"
    provider_event_id: str | None = None
    category: CalendarCategory
    event_type: str | None = None
    title: str
    market: str | None = None
    country_or_region: str | None = None
    symbol: str | None = None
    security_name: str | None = None
    event_date: date
    event_datetime: datetime | None = None
    timezone: str = "Asia/Shanghai"
    all_day: bool = True
    financial_market_time: str | None = None
    importance: int | None = None
    period: str | None = None
    actual_value: str | None = None
    forecast_value: str | None = None
    previous_value: str | None = None
    revised_value: str | None = None
    unit: str | None = None
    currency: str | None = None
    content: str | None = None
    scope_tags: list[Literal["watchlist", "holding"]] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
    extra_data: dict[str, Any] = Field(default_factory=dict)
    source_name: str = "Longbridge"
    last_synced_at: datetime


class CalendarEventGroup(BaseModel):
    event_date: date
    items: list[CalendarEvent]


class CalendarEventsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    category: CalendarCategory
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    timezone: str = "Asia/Shanghai"
    items: list[CalendarEvent]
    groups: list[CalendarEventGroup]
    next_cursor: str | None = None
    last_synced_at: datetime | None = None
    data_source: CalendarDataSource


class CalendarFiltersResponse(BaseModel):
    category: CalendarCategory
    markets: list[str]
    importance: list[int]
    scopes: list[CalendarScope]


class CalendarRefreshRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    category: CalendarCategory
    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    markets: list[str] = Field(default_factory=list)
    scope: CalendarScope = CalendarScope.ALL
    importance: list[int] = Field(default_factory=list)
