from datetime import datetime
from typing import Literal

from pydantic import BaseModel

MarketStatus = Literal["交易中", "午间休市", "已收盘", "休市", "未知"]
AssetType = Literal["a_share", "fund_etf"]
RankTrend = Literal["up", "down", "flat", "unknown"]


class IndexQuote(BaseModel):
    thscode: str
    latest: float | None = None
    high: float | None = None
    low: float | None = None
    change: float | None = None
    change_percent: float | None = None
    turnover: float | None = None
    quoted_at: datetime | None = None


class IndexQuoteBatch(BaseModel):
    quotes: list[IndexQuote]
    request_id: str | None = None
    fetched_at: datetime


class TradingCalendar(BaseModel):
    dates: set[str]
    fetched_at: datetime


class Instrument(BaseModel):
    thscode: str
    ticker: str
    name: str
    asset_type: AssetType
    exchange: Literal["SH", "SZ", "BJ"]
    industry: str | None = None


class InstrumentSearchResult(BaseModel):
    items: list[Instrument]
    fetched_at: datetime


class InstrumentListResult(BaseModel):
    items: list[Instrument]
    fetched_at: datetime


class ValuationSnapshot(BaseModel):
    thscode: str
    pe_ttm: float | None = None
    pe_dynamic: float | None = None
    pb_mrq: float | None = None
    metric_at: datetime | None = None


class ValuationSnapshotBatch(BaseModel):
    items: list[ValuationSnapshot]
    fetched_at: datetime


class RoeIndicator(BaseModel):
    thscode: str
    report: str
    value: float | None = None
    fetched_at: datetime


class DividendEvent(BaseModel):
    ex_date: datetime
    dividend_per_share: float


class DividendEventResult(BaseModel):
    thscode: str
    items: list[DividendEvent]
    fetched_at: datetime


class SecurityQuote(BaseModel):
    thscode: str
    latest: float | None = None
    change: float | None = None
    change_percent: float | None = None
    volume: float | None = None
    turnover: float | None = None
    total_market_cap: float | None = None
    pe_ttm: float | None = None
    pe_dynamic: float | None = None
    pb: float | None = None
    dividend_yield: float | None = None
    concept: str | None = None
    volume_ratio: float | None = None
    turnover_rate: float | None = None
    quoted_at: datetime | None = None


class SecurityQuoteBatch(BaseModel):
    quotes: list[SecurityQuote]
    fetched_at: datetime


class HotStock(BaseModel):
    thscode: str
    ticker: str
    name: str
    rank: int
    heat: str
    rank_change: int | None = None
    rank_trend: RankTrend = "unknown"


class HotStockBatch(BaseModel):
    items: list[HotStock]
    quoted_at: datetime | None = None
    fetched_at: datetime


class IndexCatalogItem(BaseModel):
    thscode: str
    name: str


class IndexCatalogBatch(BaseModel):
    items: list[IndexCatalogItem]
    quoted_at: datetime | None = None
    fetched_at: datetime


class MarketSnapshotQuote(BaseModel):
    thscode: str
    change_percent: float | None = None
    turnover: float | None = None


class MarketSnapshotBatch(BaseModel):
    quotes: list[MarketSnapshotQuote]
    total: int
    quoted_at: datetime | None = None
    fetched_at: datetime
