from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.data_sources.domain import MarketStatus, RankTrend

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
    high: float | None = None
    low: float | None = None
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


class OverviewModuleResponse(BaseModel):
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False
    updated_at: datetime | None = None


class HotStockItem(BaseModel):
    thscode: str
    ticker: str
    name: str
    rank: int
    heat: str
    rank_change: int | None = None
    rank_trend: RankTrend = "unknown"


class OverviewHotStocksResponse(OverviewModuleResponse):
    items: list[HotStockItem]


class DragonTigerItem(BaseModel):
    thscode: str
    ticker: str
    name: str
    change: float | None = None
    net_value: float | None = None
    net_rate: float | None = None
    hot_rank: int | None = None
    range_days: int | None = None
    org_net_value: float | None = None
    hot_money_net_value: float | None = None
    limit_reason: str | None = None


class DragonTigerSummary(BaseModel):
    net_value: float = 0
    org_net_value: float = 0
    hot_money_net_value: float = 0


class OverviewDragonTigerResponse(OverviewModuleResponse):
    trade_date: str | None = None
    summary: DragonTigerSummary
    items: list[DragonTigerItem]


class IndustryIndexItem(BaseModel):
    thscode: str
    name: str
    latest: float | None = None
    change: float | None = None
    change_percent: float | None = None
    turnover: float | None = None


class IndustrySnapshot(BaseModel):
    updated_at: datetime | None = None
    items: list[IndustryIndexItem]


class OverviewIndustriesResponse(OverviewModuleResponse):
    total: int
    items: list[IndustryIndexItem]


class DistributionBin(BaseModel):
    key: str
    label: str
    count: int = 0


class MarketBreadthSnapshot(BaseModel):
    updated_at: datetime | None = None
    total_count: int = 0
    valid_count: int = 0
    up_count: int = 0
    down_count: int = 0
    flat_count: int = 0
    strong_up_count: int = 0
    strong_down_count: int = 0
    turnover: float = 0
    bins: list[DistributionBin]


class OverviewMarketBreadthResponse(OverviewModuleResponse):
    total_count: int = 0
    valid_count: int = 0
    up_count: int = 0
    down_count: int = 0
    flat_count: int = 0
    strong_up_count: int = 0
    strong_down_count: int = 0
    turnover: float = 0
    bins: list[DistributionBin]
