"""Add close details for holdings.

Revision ID: 20260809_0011
Revises: 20260809_0010
Create Date: 2026-08-09
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260809_0011"
down_revision: str | None = "20260809_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("holdings", sa.Column("closed_quantity", sa.BigInteger(), nullable=True))
    op.add_column("holdings", sa.Column("close_price", sa.Numeric(20, 4), nullable=True))
    op.add_column("holdings", sa.Column("closed_on", sa.Date(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("holdings") as batch_op:
        batch_op.drop_column("closed_on")
        batch_op.drop_column("close_price")
        batch_op.drop_column("closed_quantity")
