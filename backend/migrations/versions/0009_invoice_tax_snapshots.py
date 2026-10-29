"""Persist tax-rate and line-level tax snapshots for safe return credits.

Revision ID: 0009_invoice_tax_snapshots
Revises: 0008_cash_refunds
Create Date: 2026-10-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_invoice_tax_snapshots"
down_revision = "0008_cash_refunds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("tax_rate", sa.Numeric(7, 4), nullable=True))
    op.add_column("invoice_lines", sa.Column("taxable_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("invoice_lines", sa.Column("tax_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("sales_returns", sa.Column("tax_total", sa.Numeric(14, 2), nullable=True))
    op.add_column("sales_return_lines", sa.Column("tax_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("credit_notes", sa.Column("subtotal", sa.Numeric(14, 2), nullable=True))
    op.add_column("credit_notes", sa.Column("tax_total", sa.Numeric(14, 2), nullable=True))

    # Existing credit notes could only be issued for zero-tax invoices, so this
    # backfill is grounded in the prior issuance guard and preserves their totals.
    op.execute("UPDATE credit_notes SET subtotal = total, tax_total = 0 WHERE subtotal IS NULL OR tax_total IS NULL")
    op.alter_column("credit_notes", "subtotal", existing_type=sa.Numeric(14, 2), nullable=False)
    op.alter_column("credit_notes", "tax_total", existing_type=sa.Numeric(14, 2), nullable=False)

    op.create_check_constraint(
        "ck_invoice_tax_rate_range", "invoices",
        "tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)",
    )
    op.create_check_constraint(
        "ck_invoice_line_taxable_amount_nonnegative", "invoice_lines",
        "taxable_amount IS NULL OR taxable_amount >= 0",
    )
    op.create_check_constraint(
        "ck_invoice_line_tax_amount_nonnegative", "invoice_lines",
        "tax_amount IS NULL OR tax_amount >= 0",
    )
    op.create_check_constraint(
        "ck_sales_return_tax_nonnegative", "sales_returns",
        "tax_total IS NULL OR tax_total >= 0",
    )
    op.create_check_constraint(
        "ck_sales_return_line_tax_nonnegative", "sales_return_lines",
        "tax_amount IS NULL OR tax_amount >= 0",
    )
    op.create_check_constraint(
        "ck_credit_note_subtotal_nonnegative", "credit_notes", "subtotal >= 0",
    )
    op.create_check_constraint(
        "ck_credit_note_tax_nonnegative", "credit_notes", "tax_total >= 0",
    )
    op.create_check_constraint(
        "ck_credit_note_total_reconciles", "credit_notes", "total = subtotal + tax_total",
    )


def downgrade() -> None:
    op.drop_constraint("ck_credit_note_total_reconciles", "credit_notes", type_="check")
    op.drop_constraint("ck_credit_note_tax_nonnegative", "credit_notes", type_="check")
    op.drop_constraint("ck_credit_note_subtotal_nonnegative", "credit_notes", type_="check")
    op.drop_constraint("ck_sales_return_line_tax_nonnegative", "sales_return_lines", type_="check")
    op.drop_constraint("ck_sales_return_tax_nonnegative", "sales_returns", type_="check")
    op.drop_constraint("ck_invoice_line_tax_amount_nonnegative", "invoice_lines", type_="check")
    op.drop_constraint("ck_invoice_line_taxable_amount_nonnegative", "invoice_lines", type_="check")
    op.drop_constraint("ck_invoice_tax_rate_range", "invoices", type_="check")
    op.drop_column("credit_notes", "tax_total")
    op.drop_column("credit_notes", "subtotal")
    op.drop_column("sales_return_lines", "tax_amount")
    op.drop_column("sales_returns", "tax_total")
    op.drop_column("invoice_lines", "tax_amount")
    op.drop_column("invoice_lines", "taxable_amount")
    op.drop_column("invoices", "tax_rate")
