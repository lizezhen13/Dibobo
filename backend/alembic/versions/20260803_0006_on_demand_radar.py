"""Add on-demand radar cache, search jobs, and frozen results.

Revision ID: 20260803_0006
Revises: 20260801_0005
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260803_0006"
down_revision: str | None = "20260801_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    json_value = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

    op.create_table(
        "radar_indicator_cache",
        sa.Column("data_source_id", sa.Uuid(), nullable=False),
        sa.Column("thscode", sa.String(length=20), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("exchange", sa.String(length=8), nullable=False),
        sa.Column("is_active_universe", sa.Boolean(), nullable=False),
        sa.Column("security_status", sa.String(length=32), nullable=True),
        sa.Column("instrument_fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("latest", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("change_percent", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("quoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quote_status", sa.String(length=20), nullable=False),
        sa.Column("quote_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_market_cap", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("market_cap_status", sa.String(length=20), nullable=False),
        sa.Column("market_cap_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pb_mrq", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("pb_status", sa.String(length=20), nullable=False),
        sa.Column("pb_metric_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pb_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("roe_weighted", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("roe_report_period", sa.String(length=16), nullable=True),
        sa.Column("roe_status", sa.String(length=20), nullable=False),
        sa.Column("roe_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dividend_events", json_value, nullable=False),
        sa.Column("dividend_status", sa.String(length=20), nullable=False),
        sa.Column("dividend_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["data_source_id"],
            ["data_sources.id"],
            name=op.f("fk_radar_indicator_cache_data_source_id_data_sources"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "data_source_id", "thscode", name=op.f("pk_radar_indicator_cache")
        ),
    )
    op.create_index(
        "ix_radar_indicator_cache_source_active",
        "radar_indicator_cache",
        ["data_source_id", "is_active_universe"],
        unique=False,
    )
    op.create_index(
        "ix_radar_indicator_cache_source_instrument_fetched",
        "radar_indicator_cache",
        ["data_source_id", "instrument_fetched_at"],
        unique=False,
    )

    op.create_table(
        "radar_search_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("data_source_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("stage", sa.String(length=32), nullable=False),
        sa.Column("stage_message", sa.String(length=240), nullable=True),
        sa.Column("filters", json_value, nullable=False),
        sa.Column("sort_by", sa.String(length=32), nullable=False),
        sa.Column("sort_direction", sa.String(length=4), nullable=False),
        sa.Column("current_page", sa.Integer(), nullable=False),
        sa.Column("page_size", sa.Integer(), nullable=False),
        sa.Column("processed_count", sa.Integer(), nullable=False),
        sa.Column("candidate_count", sa.Integer(), nullable=False),
        sa.Column("total_results", sa.Integer(), nullable=False),
        sa.Column("incomplete_results", sa.Integer(), nullable=False),
        sa.Column("stale_results", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["data_source_id"],
            ["data_sources.id"],
            name=op.f("fk_radar_search_jobs_data_source_id_data_sources"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_radar_search_jobs_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_radar_search_jobs")),
    )
    op.create_index(
        op.f("ix_radar_search_jobs_user_id"),
        "radar_search_jobs",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_radar_search_jobs_state"),
        "radar_search_jobs",
        ["state"],
        unique=False,
    )
    op.create_index(
        op.f("ix_radar_search_jobs_expires_at"),
        "radar_search_jobs",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_radar_search_jobs_user_created",
        "radar_search_jobs",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_radar_search_jobs_state_created",
        "radar_search_jobs",
        ["state", "created_at"],
        unique=False,
    )

    op.create_table(
        "radar_search_results",
        sa.Column("search_id", sa.Uuid(), nullable=False),
        sa.Column("thscode", sa.String(length=20), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("exchange", sa.String(length=8), nullable=False),
        sa.Column("latest", sa.Numeric(precision=20, scale=4), nullable=True),
        sa.Column("change_percent", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("total_market_cap", sa.Numeric(precision=24, scale=4), nullable=True),
        sa.Column("dividend_yield_ttm", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("pb_mrq", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("roe_weighted", sa.Numeric(precision=16, scale=6), nullable=True),
        sa.Column("roe_report_period", sa.String(length=16), nullable=True),
        sa.Column("consecutive_dividend_years", sa.Integer(), nullable=True),
        sa.Column("metric_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quoted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_incomplete", sa.Boolean(), nullable=False),
        sa.Column("data_stale", sa.Boolean(), nullable=False),
        sa.Column("missing_reasons", json_value, nullable=False),
        sa.Column("stale_fields", json_value, nullable=False),
        sa.ForeignKeyConstraint(
            ["search_id"],
            ["radar_search_jobs.id"],
            name=op.f("fk_radar_search_results_search_id_radar_search_jobs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("search_id", "thscode", name=op.f("pk_radar_search_results")),
    )
    op.create_index(
        "ix_radar_search_results_search_dividend",
        "radar_search_results",
        ["search_id", "dividend_yield_ttm"],
        unique=False,
    )
    op.create_index(
        "ix_radar_search_results_search_pb",
        "radar_search_results",
        ["search_id", "pb_mrq"],
        unique=False,
    )
    op.create_index(
        "ix_radar_search_results_search_roe",
        "radar_search_results",
        ["search_id", "roe_weighted"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_radar_search_results_search_roe", table_name="radar_search_results")
    op.drop_index("ix_radar_search_results_search_pb", table_name="radar_search_results")
    op.drop_index(
        "ix_radar_search_results_search_dividend", table_name="radar_search_results"
    )
    op.drop_table("radar_search_results")
    op.drop_index("ix_radar_search_jobs_state_created", table_name="radar_search_jobs")
    op.drop_index("ix_radar_search_jobs_user_created", table_name="radar_search_jobs")
    op.drop_index(op.f("ix_radar_search_jobs_expires_at"), table_name="radar_search_jobs")
    op.drop_index(op.f("ix_radar_search_jobs_state"), table_name="radar_search_jobs")
    op.drop_index(op.f("ix_radar_search_jobs_user_id"), table_name="radar_search_jobs")
    op.drop_table("radar_search_jobs")
    op.drop_index(
        "ix_radar_indicator_cache_source_instrument_fetched",
        table_name="radar_indicator_cache",
    )
    op.drop_index(
        "ix_radar_indicator_cache_source_active", table_name="radar_indicator_cache"
    )
    op.drop_table("radar_indicator_cache")
