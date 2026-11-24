"""Add businesses.deleted_at for soft deletion (B3).

Revision ID: 0012_business_deleted_at
Revises: 0011_report_indexes
Create Date: 2026-11-24

3A-721 (Phase 2 B3). Business deletion is a soft delete: the existing
is_active flag flips to False (authorize_membership already requires
an active business, so access ends immediately) and deleted_at stamps
when it happened. The purge (scripts/purge_deleted_businesses.py)
hard-deletes a business only after the retention window measured from
deleted_at. The column is nullable and additive — live businesses are
untouched (NULL), no backfill, no calculation changes.

Rollback/recovery: downgrade drops the column. Applying this migration
remains subject to the repository release gates (exact SQL review and
disposable PostgreSQL CI validation first); the app does not auto-run
migrations at startup.
"""
from alembic import op
import sqlalchemy as sa

revision = "0012_business_deleted_at"
down_revision = "0011_report_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("businesses", "deleted_at")
