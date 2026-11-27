"""Database models: finance domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Expense(Base):
    """Business expense with exact money and explicit currency."""

    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expense_amount_positive"),
        UniqueConstraint("id", "business_id", name="uq_expenses_id_business"),
        # 3A-650 part D: expenses had no business index at all, so every
        # report aggregation scanned all tenants' expenses. This supports
        # the profit-loss expense aggregation (business + incurred range).
        Index("ix_expenses_business_incurred_at", "business_id", "incurred_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    incurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    vendor_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CashboxEntry(Base):
    """One physical-cash movement in a business's cashbox (C3, 3A-727).

    The balance is computed from signed entries, never stored:
    opening and deposit add, withdrawal subtracts. Every entry is
    recorded by a named member and mirrored by an audit event.
    """

    __tablename__ = "cashbox_entries"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_cashbox_entries_amount_positive"),
        CheckConstraint(
            "kind IN ('opening', 'deposit', 'withdrawal')",
            name="ck_cashbox_entries_kind",
        ),
        UniqueConstraint("id", "business_id", name="uq_cashbox_entries_id_business"),
        Index("ix_cashbox_entries_business_created", "business_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    recorded_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CashboxClosing(Base):
    """A daily cashbox close with a documented handover receipt (C3).

    Expected is the computed balance at close time; counted is what
    was physically in the drawer; variance is counted minus
    expected and may be negative. One closing per business,
    currency and day.
    """

    __tablename__ = "cashbox_closings"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "currency_code", "closed_date",
            name="uq_cashbox_closings_business_currency_date",
        ),
        UniqueConstraint("id", "business_id", name="uq_cashbox_closings_id_business"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    closed_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    expected_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    counted_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    variance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    handed_by: Mapped[str] = mapped_column(String(255), nullable=False)
    received_by: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PurchaseOrder(Base):
    """Supplier purchase order; receiving is recorded separately as stock movements."""

    __tablename__ = "purchase_orders"
    __table_args__ = (
        ForeignKeyConstraint(
            ["supplier_id", "business_id"], ["suppliers.id", "suppliers.business_id"],
            name="fk_purchase_orders_supplier_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("business_id", "order_number", name="uq_purchase_order_business_number"),
        UniqueConstraint("id", "business_id", name="uq_purchase_orders_id_business"),
        CheckConstraint("status IN ('draft', 'approved', 'partially_received', 'received', 'cancelled')",
                        name="ck_purchase_order_status"),
        CheckConstraint("total >= 0", name="ck_purchase_order_total_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    supplier_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PurchaseReceiptIdempotency(Base):
    """Durable replay identity for one intentional purchase receipt operation.

    The unique key is scoped to a business and purchase order. The canonical
    request hash prevents accidental reuse of a key for a different payload;
    the response snapshot lets the route replay the original result without
    creating additional stock movements or audit events.
    """

    __tablename__ = "purchase_receipt_idempotency"
    __table_args__ = (
        ForeignKeyConstraint(
            ["purchase_order_id", "business_id"],
            ["purchase_orders.id", "purchase_orders.business_id"],
            name="fk_purchase_receipt_idempotency_order_business",
            ondelete="RESTRICT",
        ),
        UniqueConstraint(
            "business_id", "purchase_order_id", "idempotency_key",
            name="uq_purchase_receipt_idempotency_scope_key",
        ),
        UniqueConstraint(
            "id", "business_id",
            name="uq_purchase_receipt_idempotency_id_business",
        ),
        Index(
            "ix_purchase_receipt_idempotency_order_created",
            "business_id", "purchase_order_id", "created_at",
        ),
        CheckConstraint(
            "length(idempotency_key) = 36",
            name="ck_purchase_receipt_idempotency_key_length",
        ),
        CheckConstraint(
            "length(request_hash) = 64",
            name="ck_purchase_receipt_idempotency_hash_length",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="RESTRICT"), nullable=False
    )
    purchase_order_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(36), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class RecurringInvoiceSchedule(Base):
    """Schedule configuration; scheduler execution is implemented separately."""

    __tablename__ = "recurring_invoice_schedules"
    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_id", "business_id"], ["customers.id", "customers.business_id"],
            name="fk_recurring_schedules_customer_business", ondelete="RESTRICT",
        ),
        CheckConstraint("interval_days > 0", name="ck_recurring_interval_positive"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    interval_days: Mapped[int] = mapped_column(nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    next_run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PricingRule(Base):
    """Tax/discount rule configuration; calculation and snapshotting live in services."""

    __tablename__ = "pricing_rules"
    __table_args__ = (
        CheckConstraint("rule_type IN ('tax', 'discount')", name="ck_pricing_rule_type"),
        CheckConstraint("rate >= 0 AND rate <= 100", name="ck_pricing_rule_rate_range"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(16), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PurchaseOrderLine(Base):
    """Ordered quantity and unit-cost snapshot for a supplier purchase."""

    __tablename__ = "purchase_order_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["purchase_order_id", "business_id"],
            ["purchase_orders.id", "purchase_orders.business_id"],
            name="fk_purchase_order_lines_order_business", ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["product_id", "business_id"], ["products.id", "products.business_id"],
            name="fk_purchase_order_lines_product_business", ondelete="RESTRICT",
        ),
        CheckConstraint("quantity > 0", name="ck_purchase_order_line_quantity_positive"),
        CheckConstraint("unit_cost >= 0", name="ck_purchase_order_line_cost_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    purchase_order_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    product_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    received_quantity: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal(0)
    )

