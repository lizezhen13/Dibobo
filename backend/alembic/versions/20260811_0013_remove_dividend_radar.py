"""Remove dividend radar persistence.

Revision ID: 20260811_0013
Revises: 20260811_0012
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260811_0013"
down_revision: str | None = "20260811_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())
    for table_name in (
        "radar_search_results",
        "radar_search_jobs",
        "radar_indicator_cache",
        "radar_searches",
        "radar_metrics",
        "radar_snapshots",
    ):
        if table_name in existing_tables:
            op.drop_table(table_name)


def downgrade() -> None:
    raise RuntimeError(
        "The dividend radar tables and their data were removed and cannot be restored "
        "without a database backup."
    )
