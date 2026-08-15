import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

ProviderType = Literal["fuyao", "fuyao_compatible", "longbridge"]
AuthType = Literal["api_key", "oauth"]
CapabilityState = Literal["supported", "unsupported", "partial"]


def _normalize_optional_secret(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class DataSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    provider_type: ProviderType
    base_url: HttpUrl | None = None
    auth_type: AuthType = "api_key"
    api_key: str | None = Field(default=None, max_length=2048)
    app_key: str | None = Field(default=None, max_length=512)
    app_secret: str | None = Field(default=None, max_length=2048)
    access_token: str | None = Field(default=None, max_length=4096)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("数据源名称不能为空")
        return normalized

    @field_validator("api_key", "app_key", "app_secret", "access_token", mode="before")
    @classmethod
    def normalize_secrets(cls, value: str | None) -> str | None:
        return _normalize_optional_secret(value)

    @field_validator("base_url")
    @classmethod
    def reject_embedded_credentials(cls, value: HttpUrl) -> HttpUrl:
        if value.username or value.password:
            raise ValueError("Base URL 不得包含用户名或密码")
        return value

    @model_validator(mode="after")
    def validate_credentials(self) -> "DataSourceCreate":
        if self.provider_type in {"fuyao", "fuyao_compatible"}:
            if self.auth_type != "api_key":
                raise ValueError("该数据源仅支持 API Key 鉴权")
            if self.base_url is None:
                raise ValueError("Base URL 不能为空")
            if not self.api_key:
                raise ValueError("API Key 不能为空")
            return self

        if self.auth_type == "oauth":
            raise ValueError("Longbridge OAuth 请通过 OAuth 授权按钮开始")
        if not self.app_key or not self.app_secret or not self.access_token:
            raise ValueError("Longbridge API 模式需要填写 App Key、App Secret 和 Access Token")
        return self


class DataSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    provider_type: ProviderType | None = None
    base_url: HttpUrl | None = None
    auth_type: AuthType | None = None
    api_key: str | None = Field(default=None, max_length=2048)
    app_key: str | None = Field(default=None, max_length=512)
    app_secret: str | None = Field(default=None, max_length=2048)
    access_token: str | None = Field(default=None, max_length=4096)

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("数据源名称不能为空")
        return normalized

    @field_validator("api_key", "app_key", "app_secret", "access_token", mode="before")
    @classmethod
    def blank_secret_means_unchanged(cls, value: str | None) -> str | None:
        return _normalize_optional_secret(value)

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
    auth_type: AuthType
    api_key_mask: str
    credential_mask: str
    oauth_client_id: str | None
    oauth_expires_at: datetime | None
    oauth_authorized_at: datetime | None
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


class OAuthStartRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    source_id: uuid.UUID | None = None
    base_url: HttpUrl | None = None

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("数据源名称不能为空")
        return normalized

    @field_validator("base_url")
    @classmethod
    def reject_embedded_credentials(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is not None and (value.username or value.password):
            raise ValueError("Base URL 不得包含用户名或密码")
        return value


class OAuthStartResponse(BaseModel):
    authorization_url: str
    source_id: str
