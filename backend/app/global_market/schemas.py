from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.global_market.catalog import GlobalMarketGroup, ValueKind

GlobalMarketState = Literal["ready", "partial", "stale", "unavailable"]
GlobalMarketFreshness = Literal["fresh", "delayed", "interrupted", "stale", "unknown"]
GlobalMarketStatus = Literal["交易中", "已收盘", "休市", "未知", "不适用"]


class GlobalMarketProvider(BaseModel):
    type: str = "akshare"
    version: str = "1.18.84"


class GlobalMarketItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    group: GlobalMarketGroup
    subgroup: str | None = None
    name: str
    display_code: str
    source_symbol: str | None = None
    value_kind: ValueKind
    latest: float | None = None
    change: float | None = None
    change_percent: float | None = None
    change_bp: float | None = None
    unit: str
    quote_direction: str | None = None
    precision: int = Field(ge=0, le=8)
    market_status: GlobalMarketStatus
    freshness: GlobalMarketFreshness
    quoted_at: datetime | None = None
    as_of_date: date | None = None
    fetched_at: datetime | None = None
    mapped_contract: str | None = None
    provider_type: str | None = "akshare"
    adapter_version: str | None = "1.18.84"
    capability: str | None = None
    origin: str | None = None
    missing_reason: str | None = None
    snapshot_id: str | None = None
    quality_profile: str = "global-market-v1"
    source_status: str | None = None


class GlobalMarketGroupResponse(BaseModel):
    state: GlobalMarketState
    updated_at: datetime | None = None
    is_fetching: bool = False
    expected_count: int
    available_count: int
    items: list[GlobalMarketItem]
    message: str | None = None


class GlobalMarketRefreshResponse(BaseModel):
    group: GlobalMarketGroup
    state: GlobalMarketState
    acquired: bool
    message: str | None = None


class GlobalMarketResponse(BaseModel):
    enabled: bool
    provider: GlobalMarketProvider = Field(default_factory=GlobalMarketProvider)
    refresh_seconds: int
    polling_enabled: bool
    groups: dict[GlobalMarketGroup, GlobalMarketGroupResponse]
    message: str | None = None
