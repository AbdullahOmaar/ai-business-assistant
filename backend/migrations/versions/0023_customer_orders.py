"""Add customer orders (3A-923 C4: customer orders & delivery, T45).

Revision ID: 0023_customer_orders
Revises: 0022_payroll_payments
Create Date: 2026-11-27

Two new tables, nothing existing changes:

- ``customer_orders``: a pre-invoice document header. An order never
  moves stock and never posts financially; on fulfilment it converts
  one-to-one into a DRAFT invoice through the ordinary invoice
  service, and stock moves only when that invoice is issued. The
  header mirrors the invoice's commercial shape (client-supplied
  number, currency, discount/tax rates, snapshot totals) plus the
  optional delivery fields of the invoice transport block (3A-920
  step 4), copied into the converted invoice. ``converted_invoice_id``
  is unique so an order can become at most one invoice.
- ``customer_order_lines``: mirrors ``invoice_lines`` — server-priced
  snapshots with the sold unit + conversion factor frozen at write
  time, so conversion stays exact if the product changes later.

Rollback/recovery: downgrade drops both tables. Applying this
migration remains subject to the repository release gates (exact SQL
review and disposable PostgreSQL CI validation first); the app does
not auto-run migrations at startup.
"""
import sqlalchemy as sa
from alembic import op

revision = "0023_customer_orders"
down_revision = "0022_payroll_payments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_orders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("order_number", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("discount_rate", sa.Numeric(14, 4), nullable=False),
        sa.Column("tax_rate", sa.Numeric(14, 4), nullable=False),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("discount_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("driver_employee_id", sa.Uuid(), nullable=True),
        sa.Column("transport_trips", sa.Integer(), nullable=True),
        sa.Column("transport_from", sa.String(length=200), nullable=True),
        sa.Column("transport_to", sa.String(length=200), nullable=True),
        sa.Column("converted_invoice_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'confirmed', 'fulfilled', 'cancelled')",
            name="ck_customer_order_status",
        ),
        sa.CheckConstraint(
            "subtotal >= 0 AND tax_total >= 0 AND discount_total >= 0 AND total >= 0",
            name="ck_customer_order_nonnegative_totals",
        ),
        sa.CheckConstraint(
            "transport_trips IS NULL OR transport_trips >= 0",
            name="ck_customer_order_transport_trips_nonnegative",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["customer_id", "business_id"],
            ["customers.id", "customers.business_id"],
            name="fk_customer_orders_customer_business",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["driver_employee_id", "business_id"],
            ["employees.id", "employees.business_id"],
            name="fk_customer_orders_driver_business",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["converted_invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_customer_orders_converted_invoice_business",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "order_number", name="uq_customer_order_business_number"),
        sa.UniqueConstraint("id", "business_id", name="uq_customer_orders_id_business"),
        sa.UniqueConstraint("converted_invoice_id", name="uq_customer_order_converted_invoice"),
    )
    op.create_table(
        "customer_order_lines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("business_id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=True),
        sa.Column("description", sa.String(length=300), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("sold_unit", sa.String(length=32), nullable=True),
        sa.Column("conversion_factor", sa.Numeric(14, 3), nullable=True),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_customer_order_line_quantity_positive"),
        sa.CheckConstraint(
            "unit_price >= 0 AND line_total >= 0",
            name="ck_customer_order_line_amounts_nonnegative",
        ),
        sa.CheckConstraint(
            "conversion_factor IS NULL OR conversion_factor > 0",
            name="ck_customer_order_line_conversion_factor_positive",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["order_id", "business_id"],
            ["customer_orders.id", "customer_orders.business_id"],
            name="fk_customer_order_lines_order_business",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["product_id", "business_id"],
            ["products.id", "products.business_id"],
            name="fk_customer_order_lines_product_business",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "business_id", name="uq_customer_order_lines_id_business"),
    )


def downgrade() -> None:
    op.drop_table("customer_order_lines")
    op.drop_table("customer_orders")
