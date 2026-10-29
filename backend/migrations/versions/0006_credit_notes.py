"""Add immutable credit notes issued from approved sales returns.

Revision ID: 0006_credit_notes
Revises: 0005_employee_payroll
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_credit_notes"
down_revision = "0005_employee_payroll"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_notes",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("sales_return_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("credit_note_number", sa.String(80), nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_by_subject", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("total > 0", name="ck_credit_note_total_positive"),
        sa.CheckConstraint("length(currency_code) = 3", name="ck_credit_note_currency_length"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["sales_return_id", "business_id"],
            ["sales_returns.id", "sales_returns.business_id"],
            name="fk_credit_notes_return_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_credit_notes_invoice_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["customer_id", "business_id"],
            ["customers.id", "customers.business_id"],
            name="fk_credit_notes_customer_business", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_credit_notes_id_business"),
        sa.UniqueConstraint("business_id", "sales_return_id", name="uq_credit_note_per_return"),
        sa.UniqueConstraint("business_id", "credit_note_number", name="uq_credit_note_number_business"),
    )


def downgrade() -> None:
    op.drop_table("credit_notes")
