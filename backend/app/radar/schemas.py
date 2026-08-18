from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.overview.schemas import DataSourceSummary

RadarResultType = Literal["daily", "manual"]
RadarSnapshotStatus = Literal["success", "failed", "never"]
RadarDataQuality = Literal["complete", "incomplete"]


class RadarFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    market_cap_min: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    market_cap_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    dividend_yield_min: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    dividend_yield_max: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    pb_min: float | None = Field(default=None, allow_inf_nan=False)
    pb_max: float | None = Field(default=None, allow_inf_nan=False)
    pe_min: float | None = Field(default=None, allow_inf_nan=False)
    pe_max: float | None = Field(default=None, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_ranges(self) -> "RadarFilters":
        for label, minimum, maximum in (
            ("市值", self.market_cap_min, self.market_cap_max),
            ("股息率", self.dividend_yield_min, self.dividend_yield_max),
            ("市净率", self.pb_min, self.pb_max),
            ("市盈率", self.pe_min, self.pe_max),
        ):
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(f"{label}最小值不能大于最大值")
        return self


class RadarSearchPayload(BaseModel):
    filters: RadarFilters
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class RadarItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    thscode: str
    ticker: str
    name: str
    exchange: Literal["SH", "SZ"]
    latest: float | None = None
    change_percent: float | None = None
    market_cap: float | None = None
    dividend_yield: float | None = None
    pb: float | None = None
    pe_ttm: float | None = None
    industry: str | None = None
    quoted_at: datetime | None = None
    data_quality: RadarDataQuality = "complete"
    missing_fields: list[str] = Field(default_factory=list)
    in_watchlist: bool = False


class RadarResponse(BaseModel):
    items: list[RadarItem]
    total: int
    page: int
    page_size: int
    filters: RadarFilters
    result_type: RadarResultType
    snapshot_status: RadarSnapshotStatus
    generated_at: datetime | None = None
    daily_snapshot_at: datetime | None = None
    daily_snapshot_error: str | None = None
    data_source: DataSourceSummary
    stale: bool = False
