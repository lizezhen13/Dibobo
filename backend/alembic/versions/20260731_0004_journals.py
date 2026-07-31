"""Create investment journals.

Revision ID: 20260731_0004
Revises: 20260731_0003
Create Date: 2026-07-31
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260731_0004"
down_revision: str | None = "20260731_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "journals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("journal_date", sa.Date(), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_journals_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_journals")),
    )
    op.create_index(op.f("ix_journals_user_id"), "journals", ["user_id"], unique=False)
    op.create_index(
        "ix_journals_user_date_created",
        "journals",
        ["user_id", "journal_date", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_journals_user_date_created", table_name="journals")
    op.drop_index(op.f("ix_journals_user_id"), table_name="journals")
    op.drop_table("journals")
