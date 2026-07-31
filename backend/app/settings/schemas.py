from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

ProviderType = Literal["fuyao", "fuyao_compatible"]
CapabilityState = Literal["supported", "unsupported", "partial"]


class DataSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    provider_type: ProviderType
    base_url: HttpUrl
    api_key: str = Field(min_length=1, max_length=2048)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("数据源名称不能为空")
        return normalized

    @field_validator("api_key")
    @classmethod
    def normalize_api_key(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("API Key 不能为空")
        return normalized

    @field_validator("base_url")
    @classmethod
    def reject_embedded_credentials(cls, value: HttpUrl) -> HttpUrl:
        if value.username or value.password:
            raise ValueError("Base URL 不得包含用户名或密码")
        return value


class DataSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    provider_type: ProviderType | None = None
    base_url: HttpUrl | None = None
    api_key: str | None = Field(default=None, max_length=2048)

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("数据源名称不能为空")
        return normalized

    @field_validator("api_key")
    @classmethod
    def blank_api_key_means_unchanged(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("base_url")
    @classmethod
    def reject_optional_embedded_credentials(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is not None and (value.username or value.password):
            raise ValueError("Base URL 不得包含用户名或密码")
        return value

    @model_validator(mode="after")
    def require_at_least_one_change(self) -> "DataSourceUpdate":
        if not self.model_fields_set:
            raise ValueError("至少提交一个需要修改的字段")
        return self


class DataSourceResponse(BaseModel):
    id: str
    name: str
    provider_type: ProviderType
    base_url: str
    api_key_mask: str
    is_active: bool
    last_test_status: Literal["success", "failed"] | None
    last_test_latency_ms: int | None
    last_test_at: datetime | None
    last_test_message: str | None
    capabilities: dict[str, CapabilityState]
    created_at: datetime
    updated_at: datetime


class ConnectionTestResponse(BaseModel):
    status: Literal["success", "failed"]
    latency_ms: int
    tested_at: datetime
    message: str
    capabilities: dict[str, CapabilityState]


class MessageResponse(BaseModel):
    message: str
