from datetime import datetime
from typing import Literal

from pydantic import BaseModel

MarketStatus = Literal["交易中", "午间休市", "已收盘", "休市", "未知"]
AssetType = Literal["a_share", "fund_etf"]


class IndexQuote(BaseModel):
    thscode: str
    latest: float | None = None
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


class InstrumentSearchResult(BaseModel):
    items: list[Instrument]
    fetched_at: datetime


class SecurityQuote(BaseModel):
    thscode: str
    latest: float | None = None
    change_percent: float | None = None
    quoted_at: datetime | None = None


class SecurityQuoteBatch(BaseModel):
    quotes: list[SecurityQuote]
    fetched_at: datetime
