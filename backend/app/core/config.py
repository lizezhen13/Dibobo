from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DIBOBO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Dibobo"
    app_env: Literal["development", "test", "production"] = "development"
    app_public_url: str = "http://localhost:8080"
    database_url: str = "postgresql+asyncpg://dibobo:dibobo@localhost:5432/dibobo"
    valkey_url: str = "redis://localhost:6379/0"
    timezone: str = "Asia/Shanghai"
    log_level: str = "INFO"

    session_secret: SecretStr = Field(
        default=SecretStr("development-only-session-secret-change-me"),
        min_length=32,
    )
    api_key_encryption_key: SecretStr = SecretStr(
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )
    session_cookie_name: str = "dibobo_session"
    csrf_cookie_name: str = "dibobo_csrf"
    session_idle_hours: int = Field(default=24, ge=1, le=168)
    session_secure_cookie: bool = False
    login_failure_limit: int = Field(default=5, ge=3, le=20)
    login_lock_seconds: int = Field(default=300, ge=30, le=3600)

    quote_refresh_seconds: int = Field(default=5, ge=3, le=60)
    upstream_timeout_seconds: float = Field(default=8, gt=0, le=60)
    upstream_concurrency: int = Field(default=4, ge=1, le=32)
    worker_concurrency: int = Field(default=2, ge=1, le=16)
    radar_sync_schedule: str = "0 18 * * 1-5"

    initial_username: str | None = None
    initial_password: SecretStr | None = None

    @field_validator("initial_username", mode="before")
    @classmethod
    def empty_username_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("initial_password", mode="before")
    @classmethod
    def empty_password_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value:
            return None
        return value

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.app_env != "production":
            return self

        if "development-only" in self.session_secret.get_secret_value():
            raise ValueError("Production requires a unique DIBOBO_SESSION_SECRET")
        if (
            self.api_key_encryption_key.get_secret_value()
            == "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
        ):
            raise ValueError("Production requires a unique DIBOBO_API_KEY_ENCRYPTION_KEY")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
