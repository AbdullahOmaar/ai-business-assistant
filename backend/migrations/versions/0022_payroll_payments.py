"""Add the payroll payments ledger (3A-920 step 5: partial salary payment).

Revision ID: 0022_payroll_payments
Revises: 0021_invoice_transport_block
Create Date: 2026-11-27

One new table, nothing existing changes:

- ``payroll_payments``: one row per payment event against a payroll
  record, each linked to its own Payroll expense (the same expense
  shape the full-pay path has always written). The record's paid
  total is the SUM of its payments; the record flips to 'paid' only
  when the sum reaches the net pay, so a partially paid record stays
  'approved' with a remainder due — the invoice-payments pattern
  applied to salaries. ``payroll_records.expense_id`` keeps its
  meaning: the expense of the payment that COMPLETED the record
  (NULL while partially paid or unpaid).

Rollback/recovery: downgrade drops the table. Applying this
migration remains subject to the repository release gates (exact SQL
review and disposable PostgreSQL CI validation first); the app does
not auto-run migrations at startup.
"""
import sqlalchemy as sa
from alembic import op

revision = "0022_payroll_payments"
down_revision = "0021_invoice_transport_block"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payroll_payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("payroll_record_id", sa.Uuid(), nullable=False),
        sa.Column("expense_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_by_subject", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_payroll_payment_amount_positive"),
        sa.ForeignKeyConstraint(
            ["business_id"], ["businesses.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["payroll_record_id", "business_id"],
            ["payroll_records.id", "payroll_records.business_id"],
            name="fk_payroll_payment_record_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["expense_id", "business_id"],
            ["expenses.id", "expenses.business_id"],
            name="fk_payroll_payment_expense_business", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_payroll_payments_business_record", "payroll_payments",
        ["business_id", "payroll_record_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_payroll_payments_business_record", table_name="payroll_payments")
    op.drop_table("payroll_payments")
