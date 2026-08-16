import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.holdings.schemas import HoldingSummaryResponse


def _normalize_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("组合名称不能为空")
    return normalized


class PortfolioCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=50)
    note: str | None = Field(default=None, max_length=1000)
    is_default: bool = False

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PortfolioUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=50)
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return _normalize_name(value) if value is not None else None

    @field_validator("note")
    @classmethod
    def normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def require_submitted_field(self) -> "PortfolioUpdate":
        if not self.model_fields_set:
            raise ValueError("请至少提交一个需要修改的字段")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name 不能为 null")
        return self


class PortfolioOrderPayload(BaseModel):
    portfolio_ids: list[uuid.UUID] = Field(default_factory=list)


class PortfolioItem(BaseModel):
    id: uuid.UUID
    name: str
    note: str | None
    is_default: bool
    sort_order: int
    open_holding_count: int
    created_at: datetime
    updated_at: datetime


class PortfolioListResponse(BaseModel):
    items: list[PortfolioItem]


class PortfolioSummaryItem(BaseModel):
    portfolio_id: uuid.UUID
    summary: HoldingSummaryResponse


class PortfolioSummaryListResponse(BaseModel):
    items: list[PortfolioSummaryItem]
