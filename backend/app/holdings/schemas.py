import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.data_sources.domain import AssetType, MarketStatus
from app.overview.schemas import DataSourceSummary

HoldingStatus = Literal["open", "closed"]


class InstrumentResponse(BaseModel):
    thscode: str
    ticker: str
    name: str
    asset_type: AssetType
    exchange: Literal["SH", "SZ", "BJ"]


class InstrumentSearchResponse(BaseModel):
    items: list[InstrumentResponse]


class HoldingCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    thscode: str = Field(min_length=4, max_length=20)
    average_cost: Decimal = Field(ge=0, max_digits=20, decimal_places=4)
    quantity: int = Field(gt=0)
    opened_on: date
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("thscode")
    @classmethod
    def normalize_thscode(cls, value: str) -> str:
        return value.upper()

    @field_validator("opened_on")
    @classmethod
    def opened_on_cannot_be_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("建仓日期不得晚于今天")
        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class HoldingUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    average_cost: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=20,
        decimal_places=4,
    )
    quantity: int | None = Field(default=None, ge=0)
    opened_on: date | None = None
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("opened_on")
    @classmethod
    def opened_on_cannot_be_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("建仓日期不得晚于今天")
        return value

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def require_submitted_field(self) -> "HoldingUpdate":
        if not self.model_fields_set:
            raise ValueError("请至少提交一个需要修改的字段")
        for field_name in ("average_cost", "quantity", "opened_on"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} 不能为 null")
        return self


class HoldingItem(BaseModel):
    id: uuid.UUID
    thscode: str
    ticker: str
    name: str
    asset_type: AssetType
    exchange: str
    average_cost: float
    quantity: int
    opened_on: date
    note: str | None
    status: HoldingStatus
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    cost_amount: float
    latest: float | None = None
    market_value: float | None = None
    floating_gain: float | None = None
    floating_gain_percent: float | None = None
    change_percent: float | None = None
    weight_percent: float | None = None
    quoted_at: datetime | None = None


class HoldingsListResponse(BaseModel):
    status: HoldingStatus
    items: list[HoldingItem]
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False


class HoldingSummaryResponse(BaseModel):
    total_cost: float
    priced_cost: float
    total_market_value: float | None
    floating_gain: float | None
    floating_gain_percent: float | None
    incomplete: bool
    holding_count: int
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False


class MessageResponse(BaseModel):
    message: str
