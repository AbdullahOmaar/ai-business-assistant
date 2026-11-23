"""Add the indexes backing the report aggregations.

Revision ID: 0011_report_indexes
Revises: 0010_stock_movement_idem
Create Date: 2026-11-23

3A-650 part D (from the 3A-445 round-2 review's operating-result
performance finding). The profit-loss and tax-summary endpoints already
aggregate in SQL, but the tables they aggregate had no supporting
indexes: expenses had no business index at all (every aggregation scanned
all tenants' expenses), invoices were only reachable through the
(business_id, invoice_number) unique index, and sales returns had no
business/status index. This migration adds exactly those three indexes.
No table, column, or row is touched, and no calculation changes.

Rollback/recovery: downgrade drops the three indexes; report results are
identical with or without them (they only change how the database finds
the rows). Applying this migration to the synthetic pre-release
environment remains subject to the repository release gates (exact SQL
review and disposable PostgreSQL CI validation first). Note the app does
not auto-run migrations at startup; this ships with the 1.13.0 API
release and is applied by the release process.
"""
from alembic import op

revision = "0011_report_indexes"
down_revision = "0010_stock_movement_idem"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_invoices_business_status_issue_date",
        "invoices",
        ["business_id", "status", "issue_date"],
    )
    op.create_index(
        "ix_expenses_business_incurred_at",
        "expenses",
        ["business_id", "incurred_at"],
    )
    op.create_index(
        "ix_sales_returns_business_status",
        "sales_returns",
        ["business_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_sales_returns_business_status", table_name="sales_returns")
    op.drop_index("ix_expenses_business_incurred_at", table_name="expenses")
    op.drop_index("ix_invoices_business_status_issue_date", table_name="invoices")
