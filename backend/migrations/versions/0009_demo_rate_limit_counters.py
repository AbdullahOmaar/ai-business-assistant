"""Add shared fixed-window counters for the public demo session limiter.

Revision ID: 0009_demo_rate_limit_counters
Revises: 0008_credit_notes
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_demo_rate_limit_counters"
down_revision = "0008_credit_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_rate_limit_counters",
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("window_start_epoch", sa.BigInteger(), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("request_count > 0", name="ck_demo_rate_limit_count_positive"),
        sa.PrimaryKeyConstraint("key_hash"),
    )


def downgrade() -> None:
    op.drop_table("demo_rate_limit_counters")
