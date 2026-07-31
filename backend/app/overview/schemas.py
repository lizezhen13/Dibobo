from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.data_sources.domain import MarketStatus

DataSourceState = Literal[
    "ready",
    "not_configured",
    "authentication_failed",
    "rate_limited",
    "unavailable",
]


class DataSourceSummary(BaseModel):
    state: DataSourceState
    name: str | None = None
    message: str | None = None


class IndexCard(BaseModel):
    name: str
    thscode: str
    latest: float | None = None
    change: float | None = None
    change_percent: float | None = None
    turnover: float | None = None
    market_status: MarketStatus
    quoted_at: datetime | None = None


class OverviewIndicesResponse(BaseModel):
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False
    indices: list[IndexCard]

