"""Add Longbridge authentication metadata.

Revision ID: 20260815_0014
Revises: 20260811_0013
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260815_0014"
down_revision: str | None = "20260811_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "data_sources",
        sa.Column(
            "auth_type",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'api_key'"),
        ),
    )
    op.add_column("data_sources", sa.Column("oauth_client_id", sa.String(length=200)))
    op.add_column("data_sources", sa.Column("oauth_expires_at", sa.DateTime(timezone=True)))
    op.add_column("data_sources", sa.Column("oauth_authorized_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("data_sources", "oauth_authorized_at")
    op.drop_column("data_sources", "oauth_expires_at")
    op.drop_column("data_sources", "oauth_client_id")
    op.drop_column("data_sources", "auth_type")
