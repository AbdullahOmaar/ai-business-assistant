"""Add effective date windows to business pricing rules.

Revision ID: 0011_pricing_rule_effective_dates
Revises: 0010_bank_reconciliation
Create Date: 2026-10-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0011_pricing_rule_effective_dates"
down_revision = "0010_bank_reconciliation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "pricing_rules",
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "pricing_rules",
        sa.Column("effective_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "UPDATE pricing_rules SET effective_from = created_at WHERE effective_from IS NULL"
    )
    op.alter_column("pricing_rules", "effective_from", nullable=False)
    op.create_check_constraint(
        "ck_pricing_rule_effective_range", "pricing_rules",
        "effective_until IS NULL OR effective_until > effective_from",
    )


def downgrade() -> None:
    op.drop_constraint("ck_pricing_rule_effective_range", "pricing_rules", type_="check")
    op.drop_column("pricing_rules", "effective_until")
    op.drop_column("pricing_rules", "effective_from")
