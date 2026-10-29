"""Record explicit cash refunds against issued credit notes.

Revision ID: 0008_cash_refunds
Revises: 0007_credit_applications
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_cash_refunds"
down_revision = "0007_credit_applications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cash_refunds",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("credit_note_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("method", sa.String(24), nullable=False),
        sa.Column("reference", sa.String(128), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("refunded_by_subject", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_cash_refund_amount_positive"),
        sa.CheckConstraint("method IN ('cash', 'bank', 'card', 'other')", name="ck_cash_refund_method"),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["credit_note_id", "business_id"],
            ["credit_notes.id", "credit_notes.business_id"],
            name="fk_cash_refunds_note_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id", "business_id"],
            ["payments.id", "payments.business_id"],
            name="fk_cash_refunds_payment_business", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_cash_refunds_id_business"),
        sa.UniqueConstraint("business_id", "idempotency_key", name="uq_cash_refund_idempotency"),
    )
    op.create_index(
        "ix_cash_refunds_note_business", "cash_refunds", ["business_id", "credit_note_id"],
    )
    op.create_index(
        "ix_cash_refunds_payment_business", "cash_refunds", ["business_id", "payment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_cash_refunds_payment_business", table_name="cash_refunds")
    op.drop_index("ix_cash_refunds_note_business", table_name="cash_refunds")
    op.drop_table("cash_refunds")
