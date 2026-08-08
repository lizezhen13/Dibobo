"""Add investment portfolios and scope holdings to a portfolio.

Revision ID: 20260808_0008
Revises: 20260803_0007
Create Date: 2026-08-08
"""

from collections.abc import Sequence
from datetime import UTC, datetime
import uuid

import sqlalchemy as sa

from alembic import op

revision: str = "20260808_0008"
down_revision: str | None = "20260803_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "portfolios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_portfolios_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_portfolios")),
    )
    op.create_index(op.f("ix_portfolios_user_id"), "portfolios", ["user_id"], unique=False)
    op.create_index(
        "uq_portfolios_default_user",
        "portfolios",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
        sqlite_where=sa.text("is_default = 1"),
    )
    op.create_index(
        "ix_portfolios_user_sort",
        "portfolios",
        ["user_id", "sort_order"],
        unique=False,
    )

    op.add_column("holdings", sa.Column("portfolio_id", sa.Uuid(), nullable=True))

    connection = op.get_bind()
    users = connection.execute(sa.text("SELECT id FROM users")).all()
    now = datetime.now(UTC)
    for (user_id,) in users:
        portfolio_id = uuid.uuid4()
        connection.execute(
            sa.text(
                """
                INSERT INTO portfolios
                    (id, user_id, name, note, is_default, sort_order, created_at, updated_at)
                VALUES
                    (:id, :user_id, :name, :note, :is_default, :sort_order, :created_at, :updated_at)
                """
            ),
            {
                "id": portfolio_id,
                "user_id": user_id,
                "name": "我的投资组合",
                "note": None,
                "is_default": True,
                "sort_order": 0,
                "created_at": now,
                "updated_at": now,
            },
        )
        connection.execute(
            sa.text("UPDATE holdings SET portfolio_id = :portfolio_id WHERE user_id = :user_id"),
            {"portfolio_id": portfolio_id, "user_id": user_id},
        )

    with op.batch_alter_table("holdings") as batch_op:
        batch_op.alter_column("portfolio_id", nullable=False)
        batch_op.create_foreign_key(
            "fk_holdings_portfolio_id_portfolios",
            "portfolios",
            ["portfolio_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.drop_index("uq_holdings_open_user_thscode", table_name="holdings")
    op.create_index(
        "uq_holdings_open_portfolio_thscode",
        "holdings",
        ["portfolio_id", "thscode"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
        sqlite_where=sa.text("status = 'open'"),
    )
    op.create_index(
        op.f("ix_holdings_portfolio_id"),
        "holdings",
        ["portfolio_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("uq_holdings_open_portfolio_thscode", table_name="holdings")
    op.drop_index(op.f("ix_holdings_portfolio_id"), table_name="holdings")
    with op.batch_alter_table("holdings") as batch_op:
        batch_op.drop_constraint("fk_holdings_portfolio_id_portfolios", type_="foreignkey")
        batch_op.drop_column("portfolio_id")

    op.create_index(
        "uq_holdings_open_user_thscode",
        "holdings",
        ["user_id", "thscode"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
        sqlite_where=sa.text("status = 'open'"),
    )
    op.drop_index("ix_portfolios_user_sort", table_name="portfolios")
    op.drop_index("uq_portfolios_default_user", table_name="portfolios")
    op.drop_index(op.f("ix_portfolios_user_id"), table_name="portfolios")
    op.drop_table("portfolios")

