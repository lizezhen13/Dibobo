import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

RadarSyncState = Literal[
    "not_configured",
    "not_synced",
    "syncing",
    "ready",
    "partial_failed",
    "failed",
    "unsupported",
]
RadarSortField = Literal[
    "latest",
    "change_percent",
    "total_market_cap",
    "dividend_yield_ttm",
    "pb_mrq",
    "roe_weighted",
    "consecutive_dividend_years",
]
SortDirection = Literal["asc", "desc"]


class NumberRange(BaseModel):
    minimum: float | None = None
    maximum: float | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "NumberRange":
        if self.minimum is not None and self.maximum is not None and self.minimum > self.maximum:
            raise ValueError("区间最小值不能大于最大值")
        return self


class RadarFilters(BaseModel):
    total_market_cap: NumberRange = Field(default_factory=NumberRange)
    dividend_yield_ttm: NumberRange = Field(default_factory=NumberRange)
    pb_mrq: NumberRange = Field(default_factory=NumberRange)
    roe_weighted: NumberRange = Field(default_factory=NumberRange)


class RadarStatusResponse(BaseModel):
    state: RadarSyncState
    data_source_name: str | None = None
    message: str | None = None
    snapshot_id: uuid.UUID | None = None
    snapshot_time: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    instrument_count: int = 0
    eligible_count: int = 0
    incomplete_count: int = 0
    excluded_count: int = 0
    total_market_cap_supported: bool = False
    can_search: bool = False


class RadarSearchRequest(BaseModel):
    search_id: uuid.UUID | None = None
    filters: RadarFilters = Field(default_factory=RadarFilters)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: RadarSortField = "dividend_yield_ttm"
    sort_direction: SortDirection = "desc"


class RadarResultItem(BaseModel):
    thscode: str
    ticker: str
    name: str
    exchange: str
    latest: float | None = None
    change_percent: float | None = None
    total_market_cap: float | None = None
    dividend_yield_ttm: float | None = None
    pb_mrq: float | None = None
    roe_weighted: float | None = None
    roe_report_period: str | None = None
    consecutive_dividend_years: int | None = None
    metric_time: datetime | None = None
    quoted_at: datetime | None = None
    data_incomplete: bool = False
    missing_reasons: list[str] = Field(default_factory=list)


class RadarSearchResponse(BaseModel):
    search_id: uuid.UUID
    snapshot_id: uuid.UUID
    snapshot_time: datetime
    page: int
    page_size: int
    total: int
    pages: int
    incomplete_total: int
    sort_by: RadarSortField
    sort_direction: SortDirection
    items: list[RadarResultItem]


class RadarQuoteItem(BaseModel):
    thscode: str
    latest: float | None = None
    change_percent: float | None = None
    quoted_at: datetime | None = None


class RadarQuotesResponse(BaseModel):
    search_id: uuid.UUID
    page: int
    market_status: str
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False
    items: list[RadarQuoteItem]


class RadarSyncQueuedResponse(BaseModel):
    snapshot_id: uuid.UUID
    state: Literal["syncing"] = "syncing"
    message: str
