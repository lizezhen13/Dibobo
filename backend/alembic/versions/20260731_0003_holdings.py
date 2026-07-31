"""Create holdings ledger.

Revision ID: 20260731_0003
Revises: 20260731_0002
Create Date: 2026-07-31
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260731_0003"
down_revision: str | None = "20260731_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "holdings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("thscode", sa.String(length=20), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("asset_type", sa.String(length=20), nullable=False),
        sa.Column("exchange", sa.String(length=8), nullable=False),
        sa.Column("average_cost", sa.Numeric(precision=20, scale=4), nullable=False),
        sa.Column("quantity", sa.BigInteger(), nullable=False),
        sa.Column("opened_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_holdings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_holdings")),
    )
    op.create_index(op.f("ix_holdings_user_id"), "holdings", ["user_id"], unique=False)
    op.create_index(
        "uq_holdings_open_user_thscode",
        "holdings",
        ["user_id", "thscode"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_holdings_open_user_thscode", table_name="holdings")
    op.drop_index(op.f("ix_holdings_user_id"), table_name="holdings")
    op.drop_table("holdings")
