"""Add cashbox entries and closings (C3).

Revision ID: 0013_cashbox
Revises: 0012_business_deleted_at
Create Date: 2026-11-25

3A-727 (Phase 2 C3). The cashbox records physical cash movements
(opening / deposit / withdrawal) and a daily close with a
documented handover receipt. Two new tables, both additive: no
existing table, column or calculation changes. The balance is
computed from signed entries, never stored.

Rollback/recovery: downgrade drops both tables (closings first).
Applying this migration remains subject to the repository release
gates (exact SQL review and disposable PostgreSQL CI validation
first); the app does not auto-run migrations at startup.
"""
from alembic import op
import sqlalchemy as sa

revision = "0013_cashbox"
down_revision = "0012_business_deleted_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cashbox_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("reference", sa.String(length=128), nullable=True),
        sa.Column("recorded_by", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_cashbox_entries_amount_positive"),
        sa.CheckConstraint(
            "kind IN ('opening', 'deposit', 'withdrawal')",
            name="ck_cashbox_entries_kind",
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_cashbox_entries_id_business"),
    )
    op.create_index(
        "ix_cashbox_entries_business_created",
        "cashbox_entries", ["business_id", "created_at"],
    )
    op.create_table(
        "cashbox_closings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("closed_date", sa.Date(), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("expected_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("counted_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("variance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("handed_by", sa.String(length=255), nullable=False),
        sa.Column("received_by", sa.String(length=255), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "business_id", "currency_code", "closed_date",
            name="uq_cashbox_closings_business_currency_date",
        ),
        sa.UniqueConstraint("id", "business_id", name="uq_cashbox_closings_id_business"),
    )


def downgrade() -> None:
    op.drop_table("cashbox_closings")
    op.drop_index("ix_cashbox_entries_business_created", table_name="cashbox_entries")
    op.drop_table("cashbox_entries")
