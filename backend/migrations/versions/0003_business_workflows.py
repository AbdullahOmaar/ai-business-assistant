"""Add business workflow domain tables.

Revision ID: 0003_business_workflows
Revises: 0002_inventory
Create Date: 2026-10-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_business_workflows"
down_revision = "0002_inventory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_customers_id_business"),
    )
    op.create_table(
        "suppliers",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_suppliers_id_business"),
    )
    op.create_table(
        "invoices",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("invoice_number", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("issue_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("subtotal", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("tax_total", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("discount_total", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("notes", sa.String(2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("subtotal >= 0 AND tax_total >= 0 AND discount_total >= 0 AND total >= 0", name="ck_invoice_nonnegative_totals"),
        sa.CheckConstraint("status IN ('draft', 'issued', 'void')", name="ck_invoice_status"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id", "business_id"], ["customers.id", "customers.business_id"], name="fk_invoices_customer_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "invoice_number", name="uq_invoice_business_number"),
        sa.UniqueConstraint("id", "business_id", name="uq_invoices_id_business"),
    )
    op.create_table(
        "invoice_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("description", sa.String(300), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_invoice_line_quantity_positive"),
        sa.CheckConstraint("unit_price >= 0 AND line_total >= 0", name="ck_invoice_line_amounts_nonnegative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id", "business_id"], ["invoices.id", "invoices.business_id"], name="fk_invoice_lines_invoice_business", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id", "business_id"], ["products.id", "products.business_id"], name="fk_invoice_lines_product_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("method", sa.String(32), nullable=True),
        sa.Column("reference", sa.String(128), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id", "business_id"], ["customers.id", "customers.business_id"], name="fk_payments_customer_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_payments_id_business"),
        sa.UniqueConstraint("business_id", "idempotency_key", name="uq_payment_idempotency_key"),
    )
    op.create_table(
        "payment_allocations",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("payment_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_payment_allocation_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_id", "business_id"], ["payments.id", "payments.business_id"], name="fk_payment_allocations_payment_business", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id", "business_id"], ["invoices.id", "invoices.business_id"], name="fk_payment_allocations_invoice_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_id", "invoice_id", name="uq_payment_invoice_allocation"),
    )
    op.create_table(
        "expenses",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(80), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("incurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("vendor_name", sa.String(160), nullable=True),
        sa.Column("reference", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_expense_amount_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("supplier_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("order_number", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), server_default="draft", nullable=False),
        sa.Column("currency_code", sa.String(3), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')", name="ck_purchase_order_status"),
        sa.CheckConstraint("total >= 0", name="ck_purchase_order_total_nonnegative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_id", "business_id"], ["suppliers.id", "suppliers.business_id"], name="fk_purchase_orders_supplier_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "order_number", name="uq_purchase_order_business_number"),
        sa.UniqueConstraint("id", "business_id", name="uq_purchase_orders_id_business"),
    )
    op.create_table(
        "purchase_order_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("purchase_order_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("received_quantity", sa.Numeric(14, 3), server_default=sa.text("0"), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_purchase_order_line_quantity_positive"),
        sa.CheckConstraint("unit_cost >= 0", name="ck_purchase_order_line_cost_nonnegative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchase_order_id", "business_id"], ["purchase_orders.id", "purchase_orders.business_id"], name="fk_purchase_order_lines_order_business", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id", "business_id"], ["products.id", "products.business_id"], name="fk_purchase_order_lines_product_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sales_returns",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("reason", sa.String(500), nullable=True),
        sa.Column("total", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('draft', 'approved', 'rejected')", name="ck_sales_return_status"),
        sa.CheckConstraint("total >= 0", name="ck_sales_return_total_nonnegative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id", "business_id"], ["invoices.id", "invoices.business_id"], name="fk_sales_returns_invoice_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_sales_returns_id_business"),
    )
    op.create_table(
        "sales_return_lines",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("sales_return_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("invoice_line_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_sales_return_line_quantity_positive"),
        sa.CheckConstraint("amount >= 0", name="ck_sales_return_line_amount_nonnegative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sales_return_id", "business_id"], ["sales_returns.id", "sales_returns.business_id"], name="fk_sales_return_lines_return_business", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_line_id", "business_id"], ["invoice_lines.id", "invoice_lines.business_id"], name="fk_sales_return_lines_invoice_line_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "recurring_invoice_schedules",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("customer_id", sa.Uuid(as_uuid=True), nullable=True),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("timezone", sa.String(64), server_default="UTC", nullable=False),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("interval_days > 0", name="ck_recurring_interval_positive"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id", "business_id"], ["customers.id", "customers.business_id"], name="fk_recurring_schedules_customer_business", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "pricing_rules",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("rule_type", sa.String(16), nullable=False),
        sa.Column("rate", sa.Numeric(7, 4), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("rule_type IN ('tax', 'discount')", name="ck_pricing_rule_type"),
        sa.CheckConstraint("rate >= 0 AND rate <= 100", name="ck_pricing_rule_rate_range"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.String(1000), nullable=False),
        sa.Column("status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("deduplication_key", sa.String(160), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("status IN ('pending', 'sent', 'failed', 'cancelled')", name="ck_notification_status"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "deduplication_key", name="uq_notification_deduplication"),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("actor_subject", sa.String(128), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(80), nullable=False),
        sa.Column("target_id", sa.String(128), nullable=True),
        sa.Column("change_summary", sa.String(2000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "data_jobs",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("job_type", sa.String(16), nullable=False),
        sa.Column("entity_type", sa.String(40), nullable=False),
        sa.Column("status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("row_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("error_summary", sa.String(4000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("job_type IN ('import', 'export')", name="ck_data_job_type"),
        sa.CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')", name="ck_data_job_status"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "business_settings",
        sa.Column("id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("business_id", sa.Uuid(as_uuid=True), nullable=False),
        sa.Column("setting_key", sa.String(100), nullable=False),
        sa.Column("setting_value", sa.String(1000), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "setting_key", name="uq_business_setting_key"),
    )


def downgrade() -> None:
    op.drop_table("business_settings")
    op.drop_table("data_jobs")
    op.drop_table("audit_events")
    op.drop_table("notifications")
    op.drop_table("pricing_rules")
    op.drop_table("sales_return_lines")
    op.drop_table("sales_returns")
    op.drop_table("purchase_order_lines")
    op.drop_table("recurring_invoice_schedules")
    op.drop_table("purchase_orders")
    op.drop_table("expenses")
    op.drop_table("payment_allocations")
    op.drop_table("payments")
    op.drop_table("invoice_lines")
    op.drop_table("invoices")
    op.drop_table("suppliers")
    op.drop_table("customers")
