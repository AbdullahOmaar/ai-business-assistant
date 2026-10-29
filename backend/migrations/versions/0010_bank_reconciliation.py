"""Add tenant-scoped bank statement imports and exact reconciliation links.

Revision ID: 0010_bank_reconciliation
Revises: 0009_invoice_tax_snapshots
Create Date: 2026-10-30
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_bank_reconciliation"
down_revision = "0009_invoice_tax_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("account_key", sa.String(80), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("length(currency_code) = 3", name="ck_bank_account_currency_length"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_bank_accounts_id_business"),
        sa.UniqueConstraint("business_id", "account_key", name="uq_bank_account_business_key"),
    )
    op.create_table(
        "bank_statement_rows",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("account_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("external_transaction_id", sa.String(160), nullable=False),
        sa.Column("transaction_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="unmatched"),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount <> 0", name="ck_bank_statement_amount_nonzero"),
        sa.CheckConstraint("length(currency_code) = 3", name="ck_bank_statement_currency_length"),
        sa.CheckConstraint("status IN ('unmatched', 'matched', 'ignored')", name="ck_bank_statement_status"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["account_id", "business_id"], ["bank_accounts.id", "bank_accounts.business_id"],
            name="fk_bank_statement_rows_account_business", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_bank_statement_rows_id_business"),
        sa.UniqueConstraint(
            "business_id", "account_id", "external_transaction_id",
            name="uq_bank_statement_external_transaction",
        ),
    )
    op.create_index(
        "ix_bank_statement_rows_account_status_date",
        "bank_statement_rows", ["business_id", "account_id", "status", "transaction_date"],
    )
    op.create_table(
        "bank_reconciliation_matches",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("statement_row_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("expense_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("matched_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("matched_by_subject", sa.String(128), nullable=False),
        sa.Column("matched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(payment_id IS NOT NULL AND expense_id IS NULL) OR "
            "(payment_id IS NULL AND expense_id IS NOT NULL)",
            name="ck_bank_match_exactly_one_target",
        ),
        sa.CheckConstraint("matched_amount > 0", name="ck_bank_match_amount_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["statement_row_id", "business_id"],
            ["bank_statement_rows.id", "bank_statement_rows.business_id"],
            name="fk_bank_match_statement_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id", "business_id"], ["payments.id", "payments.business_id"],
            name="fk_bank_match_payment_business", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["expense_id", "business_id"], ["expenses.id", "expenses.business_id"],
            name="fk_bank_match_expense_business", ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "statement_row_id", name="uq_bank_match_statement_row"),
    )
    op.create_index(
        "ix_bank_reconciliation_matches_business_payment",
        "bank_reconciliation_matches", ["business_id", "payment_id"],
    )
    op.create_index(
        "ix_bank_reconciliation_matches_business_expense",
        "bank_reconciliation_matches", ["business_id", "expense_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_bank_reconciliation_matches_business_expense", table_name="bank_reconciliation_matches")
    op.drop_index("ix_bank_reconciliation_matches_business_payment", table_name="bank_reconciliation_matches")
    op.drop_table("bank_reconciliation_matches")
    op.drop_index("ix_bank_statement_rows_account_status_date", table_name="bank_statement_rows")
    op.drop_table("bank_statement_rows")
    op.drop_table("bank_accounts")
