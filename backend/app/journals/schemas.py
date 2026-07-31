import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _normalize_required_text(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("内容不能为空")
    return normalized


class JournalCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=False)

    journal_date: date
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=20_000)

    @field_validator("title", "content")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return _normalize_required_text(value)


class JournalUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=False)

    journal_date: date | None = None
    title: str | None = Field(default=None, min_length=1, max_length=100)
    content: str | None = Field(default=None, min_length=1, max_length=20_000)

    @field_validator("title", "content")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        return _normalize_required_text(value) if value is not None else None

    @model_validator(mode="after")
    def require_submitted_field(self) -> "JournalUpdate":
        if not self.model_fields_set:
            raise ValueError("请至少提交一个需要修改的字段")
        for field_name in self.model_fields_set:
            if getattr(self, field_name) is None:
                raise ValueError(f"{field_name} 不能为 null")
        return self


class JournalItem(BaseModel):
    id: uuid.UUID
    journal_date: date
    title: str
    content: str
    created_at: datetime
    updated_at: datetime


class JournalListResponse(BaseModel):
    items: list[JournalItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class MessageResponse(BaseModel):
    message: str
