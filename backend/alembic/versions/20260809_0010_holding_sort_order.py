"""Add custom ordering for holdings inside a portfolio.

Revision ID: 20260809_0010
Revises: 20260809_0009
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260809_0010"
down_revision: str | None = "20260809_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "holdings",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, portfolio_id
            FROM holdings
            WHERE status = 'open'
            ORDER BY portfolio_id, created_at, id
            """
        )
    ).all()
    next_sort_order: dict[object, int] = {}
    for holding_id, portfolio_id in rows:
        sort_order = next_sort_order.get(portfolio_id, 0)
        connection.execute(
            sa.text("UPDATE holdings SET sort_order = :sort_order WHERE id = :holding_id"),
            {"sort_order": sort_order, "holding_id": holding_id},
        )
        next_sort_order[portfolio_id] = sort_order + 1

    op.create_index(
        "ix_holdings_portfolio_status_sort",
        "holdings",
        ["portfolio_id", "status", "sort_order"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_holdings_portfolio_status_sort", table_name="holdings")
    with op.batch_alter_table("holdings") as batch_op:
        batch_op.drop_column("sort_order")
