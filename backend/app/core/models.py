import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utc_now() -> datetime:
    from datetime import UTC

    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    sessions: Mapped[list["UserSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    data_sources: Mapped[list["DataSource"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    holdings: Mapped[list["Holding"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    journals: Mapped[list["Journal"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="sessions")


JSON_VALUE = JSON().with_variant(JSONB(), "postgresql")


class DataSource(TimestampMixin, Base):
    __tablename__ = "data_sources"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_data_sources_user_name"),
        Index(
            "uq_data_sources_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_active"),
            sqlite_where=text("is_active = 1"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_type: Mapped[str] = mapped_column(String(32), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_last4: Mapped[str] = mapped_column(String(4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_test_status: Mapped[str | None] = mapped_column(String(32))
    last_test_latency_ms: Mapped[int | None] = mapped_column(Integer)
    last_test_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_test_message: Mapped[str | None] = mapped_column(String(500))
    capabilities: Mapped[dict[str, object]] = mapped_column(
        JSON_VALUE, default=dict, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="data_sources")


class Holding(TimestampMixin, Base):
    __tablename__ = "holdings"
    __table_args__ = (
        Index(
            "uq_holdings_open_user_thscode",
            "user_id",
            "thscode",
            unique=True,
            postgresql_where=text("status = 'open'"),
            sqlite_where=text("status = 'open'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    thscode: Mapped[str] = mapped_column(String(20), nullable=False)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    exchange: Mapped[str] = mapped_column(String(8), nullable=False)
    average_cost: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    opened_on: Mapped[date] = mapped_column(nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="holdings")


class Journal(TimestampMixin, Base):
    __tablename__ = "journals"
    __table_args__ = (
        Index(
            "ix_journals_user_date_created",
            "user_id",
            "journal_date",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    journal_date: Mapped[date] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    user: Mapped[User] = relationship(back_populates="journals")


class RadarSnapshot(Base):
    __tablename__ = "radar_snapshots"
    __table_args__ = (
        Index(
            "ix_radar_snapshots_source_status_completed",
            "data_source_id",
            "status",
            "completed_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_sources.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    calculation_version: Mapped[str] = mapped_column(String(32), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_summary: Mapped[str | None] = mapped_column(Text)
    instrument_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    eligible_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incomplete_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    excluded_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RadarMetric(Base):
    __tablename__ = "radar_metrics"
    __table_args__ = (
        Index("ix_radar_metrics_snapshot_dividend", "snapshot_id", "dividend_yield_ttm"),
        Index("ix_radar_metrics_snapshot_pb", "snapshot_id", "pb_mrq"),
        Index("ix_radar_metrics_snapshot_roe", "snapshot_id", "roe_weighted"),
    )

    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("radar_snapshots.id", ondelete="CASCADE"), primary_key=True
    )
    thscode: Mapped[str] = mapped_column(String(20), primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    exchange: Mapped[str] = mapped_column(String(8), nullable=False)
    security_status: Mapped[str | None] = mapped_column(String(32))
    latest: Mapped[Decimal | None] = mapped_column(Numeric(20, 4))
    change_percent: Mapped[Decimal | None] = mapped_column(Numeric(16, 6))
    total_market_cap: Mapped[Decimal | None] = mapped_column(Numeric(24, 4))
    dividend_yield_ttm: Mapped[Decimal | None] = mapped_column(Numeric(16, 6))
    pb_mrq: Mapped[Decimal | None] = mapped_column(Numeric(16, 6))
    roe_weighted: Mapped[Decimal | None] = mapped_column(Numeric(16, 6))
    roe_report_period: Mapped[str | None] = mapped_column(String(16))
    consecutive_dividend_years: Mapped[int | None] = mapped_column(Integer)
    metric_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    missing_reasons: Mapped[list[str]] = mapped_column(JSON_VALUE, default=list, nullable=False)


class RadarSearch(Base):
    __tablename__ = "radar_searches"
    __table_args__ = (
        Index("ix_radar_searches_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    data_source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("radar_snapshots.id", ondelete="CASCADE"), nullable=False
    )
    filters: Mapped[dict[str, object]] = mapped_column(JSON_VALUE, default=dict, nullable=False)
    sort_by: Mapped[str] = mapped_column(String(32), nullable=False)
    sort_direction: Mapped[str] = mapped_column(String(4), nullable=False)
    current_page: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    page_size: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    total_results: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    incomplete_results: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
