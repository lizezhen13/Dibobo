"""Add radar search deduplication metadata and recover interrupted jobs.

Revision ID: 20260803_0007
Revises: 20260803_0006
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260803_0007"
down_revision: str | None = "20260803_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "radar_search_jobs",
        sa.Column("request_fingerprint", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_radar_search_jobs_user_fingerprint_created",
        "radar_search_jobs",
        ["user_id", "request_fingerprint", "created_at"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            UPDATE radar_search_jobs
            SET state = 'failed',
                stage = 'failed',
                stage_message = '服务重启，原检索任务已终止',
                error_summary = '服务升级期间检索被中断，请重新搜索',
                completed_at = CURRENT_TIMESTAMP
            WHERE state IN ('queued', 'running')
            """
        )
    )


def downgrade() -> None:
    op.drop_index(
        "ix_radar_search_jobs_user_fingerprint_created",
        table_name="radar_search_jobs",
    )
    op.drop_column("radar_search_jobs", "request_fingerprint")
