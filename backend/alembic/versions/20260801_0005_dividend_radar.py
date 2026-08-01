"""Create dividend radar snapshots, metrics, and searches.

Revision ID: 20260801_0005
Revises: 20260731_0004
Create Date: 2026-08-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260801_0005"
down_revision: str | None = "20260731_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    json_value = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "radar_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("data_source_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("as_of", sa.DateTime(timezone=True), nullable=False),
        sa.Column("calculation_version", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("instrument_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("eligible_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("incomplete_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("excluded_count", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["data_source_id"],
            ["data_sources.id"],
            name=op.f("fk_radar_snapshots_data_source_id_data_sources"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_radar_snapshots")),
    )
    op.create_index(
        op.f("ix_radar_snapshots_data_source_id"),
        "radar_snapshots",
        ["data_source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_radar_snapshots_status"),
        "radar_snapshots",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_radar_snapshots_source_status_completed",
        "radar_snapshots",
        ["data_source_id", "status", "completed_at"],
        unique=False,
    )

    op.create_table(
        "radar_metrics",
        sa.Column("snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("thscode", sa.String(length=20), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("exchange", sa.String(length=8), nullable=False),
        sa.Column("security_status", sa.String(length=32), nullable=True),
        sa.Column("latest", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("change_percent", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("total_market_cap", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("dividend_yield_ttm", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("pb_mrq", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("roe_weighted", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("roe_report_period", sa.String(length=16), nullable=True),
        sa.Column("consecutive_dividend_years", sa.Integer(), nullable=True),
        sa.Column("metric_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("missing_reasons", json_value, nullable=False),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["radar_snapshots.id"],
            name=op.f("fk_radar_metrics_snapshot_id_radar_snapshots"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("snapshot_id", "thscode", name=op.f("pk_radar_metrics")),
    )
    op.create_index(
        "ix_radar_metrics_snapshot_dividend",
        "radar_metrics",
        ["snapshot_id", "dividend_yield_ttm"],
        unique=False,
    )
    op.create_index(
        "ix_radar_metrics_snapshot_pb",
        "radar_metrics",
        ["snapshot_id", "pb_mrq"],
        unique=False,
    )
    op.create_index(
        "ix_radar_metrics_snapshot_roe",
        "radar_metrics",
        ["snapshot_id", "roe_weighted"],
        unique=False,
    )

    op.create_table(
        "radar_searches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("data_source_id", sa.Uuid(), nullable=False),
        sa.Column("snapshot_id", sa.Uuid(), nullable=False),
        sa.Column("filters", json_value, nullable=False),
        sa.Column("sort_by", sa.String(length=32), nullable=False),
        sa.Column("sort_direction", sa.String(length=4), nullable=False),
        sa.Column("current_page", sa.Integer(), server_default="1", nullable=False),
        sa.Column("page_size", sa.Integer(), server_default="20", nullable=False),
        sa.Column("total_results", sa.Integer(), server_default="0", nullable=False),
        sa.Column("incomplete_results", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["data_source_id"],
            ["data_sources.id"],
            name=op.f("fk_radar_searches_data_source_id_data_sources"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["radar_snapshots.id"],
            name=op.f("fk_radar_searches_snapshot_id_radar_snapshots"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_radar_searches_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_radar_searches")),
    )
    op.create_index(
        op.f("ix_radar_searches_user_id"), "radar_searches", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_radar_searches_expires_at"),
        "radar_searches",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_radar_searches_user_created",
        "radar_searches",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_radar_searches_user_created", table_name="radar_searches")
    op.drop_index(op.f("ix_radar_searches_expires_at"), table_name="radar_searches")
    op.drop_index(op.f("ix_radar_searches_user_id"), table_name="radar_searches")
    op.drop_table("radar_searches")
    op.drop_index("ix_radar_metrics_snapshot_roe", table_name="radar_metrics")
    op.drop_index("ix_radar_metrics_snapshot_pb", table_name="radar_metrics")
    op.drop_index("ix_radar_metrics_snapshot_dividend", table_name="radar_metrics")
    op.drop_table("radar_metrics")
    op.drop_index(
        "ix_radar_snapshots_source_status_completed", table_name="radar_snapshots"
    )
    op.drop_index(op.f("ix_radar_snapshots_status"), table_name="radar_snapshots")
    op.drop_index(op.f("ix_radar_snapshots_data_source_id"), table_name="radar_snapshots")
    op.drop_table("radar_snapshots")
