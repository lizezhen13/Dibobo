"""Recreate the user-scoped dividend radar daily snapshot.

Revision ID: 20260818_0017
Revises: 20260817_0016
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20260818_0017"
down_revision: str | None = "20260817_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    json_value = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.create_table(
        "radar_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("data_source_id", sa.Uuid(), nullable=True),
        sa.Column("run_date", sa.Date(), nullable=False),
        sa.Column("filters", json_value, nullable=False),
        sa.Column("items", json_value, nullable=False),
        sa.Column("total", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="success", nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_radar_snapshots_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["data_source_id"],
            ["data_sources.id"],
            name=op.f("fk_radar_snapshots_data_source_id_data_sources"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_radar_snapshots")),
        sa.UniqueConstraint("user_id", name="uq_radar_snapshots_user"),
    )
    op.create_index(
        op.f("ix_radar_snapshots_user_id"),
        "radar_snapshots",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_radar_snapshots_data_source_id"),
        "radar_snapshots",
        ["data_source_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_radar_snapshots_run_date"),
        "radar_snapshots",
        ["run_date"],
        unique=False,
    )
    op.create_index(
        "ix_radar_snapshots_user_generated",
        "radar_snapshots",
        ["user_id", "generated_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_radar_snapshots_user_generated", table_name="radar_snapshots")
    op.drop_index(op.f("ix_radar_snapshots_run_date"), table_name="radar_snapshots")
    op.drop_index(op.f("ix_radar_snapshots_data_source_id"), table_name="radar_snapshots")
    op.drop_index(op.f("ix_radar_snapshots_user_id"), table_name="radar_snapshots")
    op.drop_table("radar_snapshots")
