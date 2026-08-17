"""Allow data sources from different modules to be active together.

Revision ID: 20260817_0016
Revises: 20260815_0015
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260817_0016"
down_revision: str | None = "20260815_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_data_sources_one_active_per_user", table_name="data_sources")


def downgrade() -> None:
    op.create_index(
        "uq_data_sources_one_active_per_user",
        "data_sources",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
        sqlite_where=sa.text("is_active = 1"),
    )
