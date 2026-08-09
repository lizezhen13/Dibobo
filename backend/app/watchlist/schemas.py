import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.data_sources.domain import AssetType, MarketStatus
from app.overview.schemas import DataSourceSummary


class WatchlistItemCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    thscode: str = Field(min_length=4, max_length=20)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("thscode")
    @classmethod
    def normalize_thscode(cls, value: str) -> str:
        return value.upper()

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class WatchlistItemUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    note: str | None = Field(default=None, max_length=1000)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def require_submitted_field(self) -> "WatchlistItemUpdate":
        if not self.model_fields_set:
            raise ValueError("请至少提交一个需要修改的字段")
        return self


class WatchlistOrderPayload(BaseModel):
    item_ids: list[uuid.UUID] = Field(min_length=1)


class WatchlistBatchDeletePayload(BaseModel):
    item_ids: list[uuid.UUID] = Field(min_length=1)


class WatchlistItemResponse(BaseModel):
    id: uuid.UUID
    thscode: str
    ticker: str
    name: str
    asset_type: AssetType
    exchange: str
    industry: str | None
    note: str | None
    sort_order: int
    added_at: datetime
    created_at: datetime
    updated_at: datetime
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


class WatchlistListResponse(BaseModel):
    items: list[WatchlistItemResponse]
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False


class MessageResponse(BaseModel):
    message: str
