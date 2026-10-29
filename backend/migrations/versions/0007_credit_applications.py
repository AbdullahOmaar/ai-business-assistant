"""Record immutable applications of credit notes to receivables.

Revision ID: 0007_credit_applications
Revises: 0006_credit_notes
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0007_credit_applications"
down_revision = "0006_credit_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_applications",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("credit_note_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("applied_by_subject", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_credit_application_amount_positive"),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["credit_note_id", "business_id"],
            ["credit_notes.id", "credit_notes.business_id"],
            name="fk_credit_applications_note_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_credit_applications_invoice_business", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_credit_applications_id_business"),
        sa.UniqueConstraint("business_id", "idempotency_key", name="uq_credit_application_idempotency"),
    )
    op.create_index(
        "ix_credit_applications_invoice_business",
        "credit_applications", ["business_id", "invoice_id"],
    )
    op.create_index(
        "ix_credit_applications_note_business",
        "credit_applications", ["business_id", "credit_note_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_credit_applications_note_business", table_name="credit_applications")
    op.drop_index("ix_credit_applications_invoice_business", table_name="credit_applications")
    op.drop_table("credit_applications")
