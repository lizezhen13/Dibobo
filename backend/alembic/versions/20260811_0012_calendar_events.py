"""创建财经日历相关表（calendar_events / calendar_event_sources / calendar_sync_runs）。

说明：该迁移对应的历史版本曾从仓库中丢失，但数据库已应用过此版本，
导致 alembic 版本链断裂、api 启动失败。现补回迁移文件以对齐版本链，
upgrade() 仅在对应表不存在时才创建，避免对已有表重复建表报错。

Revision ID: 20260811_0012
Revises: 20260809_0011
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260811_0012"
down_revision: str | None = "20260809_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(table_name: str) -> bool:
    # 查询 information_schema 判断表是否已存在，避免重复建表报错
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = :name"
        ).bindparams(name=table_name)
    )
    return result.first() is not None


def upgrade() -> None:
    if not _table_exists("calendar_events"):
        op.create_table(
            "calendar_events",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("canonical_key", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("country_code", sa.String(), nullable=False),
            sa.Column("country_name", sa.String(), nullable=False),
            sa.Column("market", sa.String(), nullable=True),
            sa.Column("security_id", sa.String(), nullable=True),
            sa.Column("security_name", sa.String(), nullable=True),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("timezone", sa.String(), nullable=False),
            sa.Column("all_day", sa.Boolean(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("importance", sa.String(), nullable=False),
            sa.Column("period", sa.String(), nullable=True),
            sa.Column("actual_value", sa.String(), nullable=True),
            sa.Column("forecast_value", sa.String(), nullable=True),
            sa.Column("previous_value", sa.String(), nullable=True),
            sa.Column("revised_value", sa.String(), nullable=True),
            sa.Column("unit", sa.String(), nullable=True),
            sa.Column("issuer", sa.String(), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("source_name", sa.String(), nullable=False),
            sa.Column("source_url", sa.String(), nullable=True),
            sa.Column("source_timezone_label", sa.String(), nullable=True),
            sa.Column("extra_data", sa.JSON(), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("canonical_key"),
        )
        op.create_index(
            "ix_calendar_events_country_scheduled",
            "calendar_events",
            ["country_code", "scheduled_at"],
        )
        op.create_index(
            "ix_calendar_events_scheduled_category",
            "calendar_events",
            ["scheduled_at", "category"],
        )
        op.create_index(
            "ix_calendar_events_security_scheduled",
            "calendar_events",
            ["security_id", "scheduled_at"],
        )
        op.create_index(
            "ix_calendar_events_status_scheduled",
            "calendar_events",
            ["status", "scheduled_at"],
        )

    if not _table_exists("calendar_event_sources"):
        op.create_table(
            "calendar_event_sources",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("event_id", sa.Uuid(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("provider_event_id", sa.String(), nullable=False),
            sa.Column("source_url", sa.String(), nullable=True),
            sa.Column("provider_importance", sa.String(), nullable=True),
            sa.Column("is_authoritative", sa.Boolean(), nullable=False),
            sa.Column("raw_payload", sa.JSON(), nullable=False),
            sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["event_id"],
                ["calendar_events.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("provider", "provider_event_id"),
        )
        op.create_index(
            "ix_calendar_event_sources_event",
            "calendar_event_sources",
            ["event_id"],
        )

    if not _table_exists("calendar_sync_runs"):
        op.create_table(
            "calendar_sync_runs",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("source_name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("fetched_count", sa.Integer(), nullable=False),
            sa.Column("created_count", sa.Integer(), nullable=False),
            sa.Column("updated_count", sa.Integer(), nullable=False),
            sa.Column("merged_count", sa.Integer(), nullable=False),
            sa.Column("cancelled_count", sa.Integer(), nullable=False),
            sa.Column("used_cache", sa.Boolean(), nullable=False),
            sa.Column("error_type", sa.String(), nullable=True),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_calendar_sync_runs_provider_started",
            "calendar_sync_runs",
            ["provider", "started_at"],
        )
        op.create_index(
            "ix_calendar_sync_runs_status_started",
            "calendar_sync_runs",
            ["status", "started_at"],
        )


def downgrade() -> None:
    # 历史迁移文件曾丢失，表已由实际数据占用，downgrade 不物理删除数据，
    # 仅断开版本链语义，避免误删线上财经日历数据。
    pass
