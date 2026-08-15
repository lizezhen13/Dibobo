"""Reconcile the legacy data source priority column.

Some existing installations contain a ``data_sources.priority`` column from
an older schema. It was non-nullable without a default, which prevented new
data source rows (including OAuth staging rows) from being inserted. Add the
column to clean installations as well and make its default explicit without
changing existing priority values.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260815_0015"
down_revision: str | None = "20260815_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("data_sources")}
    if "priority" not in columns:
        op.add_column(
            "data_sources",
            sa.Column(
                "priority",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
        return

    op.alter_column(
        "data_sources",
        "priority",
        existing_type=sa.Integer(),
        nullable=False,
        server_default=sa.text("0"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("data_sources")}
    if "priority" in columns:
        op.alter_column(
            "data_sources",
            "priority",
            existing_type=sa.Integer(),
            server_default=None,
        )
