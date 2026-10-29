"""SQLAlchemy models for business workspaces and initial business data.

This schema is groundwork only. Authentication and request-level tenant
authorization must be implemented before business-data endpoints are exposed.
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for application database models."""


class MembershipRole(str, Enum):
    OWNER = "owner"
    STAFF = "staff"


membership_role_type = SqlEnum(
    MembershipRole,
    name="business_membership_role",
    values_callable=lambda enum_type: [member.value for member in enum_type],
)


class Business(Base):
    """Business workspace and configurable profile."""

    __tablename__ = "businesses"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    contact_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    memberships: Mapped[list["BusinessMembership"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )


class BusinessMembership(Base):
    """Membership between an external identity and a business workspace."""

    __tablename__ = "business_memberships"
    __table_args__ = (
        UniqueConstraint("business_id", "user_subject", name="uq_business_user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    # Provider-neutral external identity reference; never a password.
    # The identity provider and token-verification design remain separate decisions.
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(membership_role_type, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    business: Mapped[Business] = relationship(back_populates="memberships")


class Product(Base):
    """Business-scoped catalog item; stock quantity is not stored on this row."""

    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("business_id", "sku", name="uq_products_business_sku"),
        # Composite target lets stock movements enforce matching business ownership.
        UniqueConstraint("id", "business_id", name="uq_products_id_business"),
        CheckConstraint("unit_price >= 0", name="ck_products_unit_price_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    sku: Mapped[str | None] = mapped_column(String(80), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="unit")
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    is_stock_tracked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class StockMovement(Base):
    """Append-only stock event; current stock is derived from signed quantities."""

    __tablename__ = "stock_movements"
    __table_args__ = (
        ForeignKeyConstraint(
            ["product_id", "business_id"],
            ["products.id", "products.business_id"],
            name="fk_stock_movements_product_business",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "movement_type IN ('opening', 'receipt', 'sale', 'return', 'adjustment')",
            name="ck_stock_movements_type",
        ),
        CheckConstraint("quantity_delta <> 0", name="ck_stock_movements_nonzero_quantity"),
        UniqueConstraint(
            "id", "business_id", name="uq_stock_movements_id_business"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="RESTRICT"), nullable=False
    )
    product_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Positive adds stock; negative removes stock. Use Decimal, never float.
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )



class Customer(Base):
    """Customer directory record scoped to one business."""

    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_customers_id_business"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Supplier(Base):
    """Supplier directory record scoped to one business."""

    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_suppliers_id_business"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Invoice(Base):
    """Invoice header; totals are stored snapshots calculated by trusted services."""

    __tablename__ = "invoices"
    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_id", "business_id"], ["customers.id", "customers.business_id"],
            name="fk_invoices_customer_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("business_id", "invoice_number", name="uq_invoice_business_number"),
        UniqueConstraint("id", "business_id", name="uq_invoices_id_business"),
        CheckConstraint("subtotal >= 0 AND tax_total >= 0 AND discount_total >= 0 AND total >= 0",
                        name="ck_invoice_nonnegative_totals"),
        CheckConstraint("status IN ('draft', 'issued', 'void')", name="ck_invoice_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    issue_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceLine(Base):
    """Invoice line with immutable price/description snapshot fields."""

    __tablename__ = "invoice_lines"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_invoice_lines_id_business"),
        ForeignKeyConstraint(
            ["invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_invoice_lines_invoice_business",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["product_id", "business_id"], ["products.id", "products.business_id"],
            name="fk_invoice_lines_product_business", ondelete="RESTRICT",
        ),
        CheckConstraint("quantity > 0", name="ck_invoice_line_quantity_positive"),
        CheckConstraint("unit_price >= 0 AND line_total >= 0",
                        name="ck_invoice_line_amounts_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    invoice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    product_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class Payment(Base):
    """Recorded money received; allocations are stored separately."""

    __tablename__ = "payments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_id", "business_id"], ["customers.id", "customers.business_id"],
            name="fk_payments_customer_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "business_id", name="uq_payments_id_business"),
        UniqueConstraint("business_id", "idempotency_key", name="uq_payment_idempotency_key"),
        CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)


class PaymentAllocation(Base):
    """Allocation of a payment to an invoice; business match enforced by composite FKs."""

    __tablename__ = "payment_allocations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["payment_id", "business_id"], ["payments.id", "payments.business_id"],
            name="fk_payment_allocations_payment_business", ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["invoice_id", "business_id"], ["invoices.id", "invoices.business_id"],
            name="fk_payment_allocations_invoice_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("payment_id", "invoice_id", name="uq_payment_invoice_allocation"),
        CheckConstraint("amount > 0", name="ck_payment_allocation_positive"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    payment_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    invoice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Expense(Base):
    """Business expense with exact money and explicit currency."""

    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_expense_amount_positive"),
        UniqueConstraint("id", "business_id", name="uq_expenses_id_business"),
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
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
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


class Notification(Base):
    """Queued notification metadata; delivery provider and workers are separate."""

    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("business_id", "deduplication_key", name="uq_notification_deduplication"),
        CheckConstraint("status IN ('pending', 'sent', 'failed', 'cancelled')",
                        name="ck_notification_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    deduplication_key: Mapped[str] = mapped_column(String(160), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuditEvent(Base):
    """Business activity metadata; callers must redact secrets and sensitive values."""

    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    actor_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    change_summary: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ImportJob(Base):
    """CSV import/export job metadata; file processing is implemented separately."""

    __tablename__ = "data_jobs"
    __table_args__ = (
        CheckConstraint("job_type IN ('import', 'export')", name="ck_data_job_type"),
        CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')",
                        name="ck_data_job_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    job_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    row_count: Mapped[int] = mapped_column(nullable=False, default=0)
    error_summary: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BusinessSetting(Base):
    """Typed setting key/value boundary; sensitive integration secrets do not belong here."""

    __tablename__ = "business_settings"
    __table_args__ = (
        UniqueConstraint("business_id", "setting_key", name="uq_business_setting_key"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    setting_key: Mapped[str] = mapped_column(String(100), nullable=False)
    setting_value: Mapped[str] = mapped_column(String(1000), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
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
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )


class SalesReturn(Base):
    """Return request tied to an original invoice."""

    __tablename__ = "sales_returns"
    __table_args__ = (
        ForeignKeyConstraint(
            ["invoice_id", "business_id"], ["invoices.id", "invoices.business_id"],
            name="fk_sales_returns_invoice_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "business_id", name="uq_sales_returns_id_business"),
        CheckConstraint("status IN ('draft', 'approved', 'rejected')", name="ck_sales_return_status"),
        CheckConstraint("total >= 0", name="ck_sales_return_total_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    invoice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class SalesReturnLine(Base):
    """Return quantity for an original invoice line."""

    __tablename__ = "sales_return_lines"
    __table_args__ = (
        ForeignKeyConstraint(
            ["sales_return_id", "business_id"], ["sales_returns.id", "sales_returns.business_id"],
            name="fk_sales_return_lines_return_business", ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["invoice_line_id", "business_id"], ["invoice_lines.id", "invoice_lines.business_id"],
            name="fk_sales_return_lines_invoice_line_business", ondelete="RESTRICT",
        ),
        CheckConstraint("quantity > 0", name="ck_sales_return_line_quantity_positive"),
        CheckConstraint("amount >= 0", name="ck_sales_return_line_amount_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    sales_return_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    invoice_line_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

class CreditNote(Base):
    """Immutable issued credit note derived from one approved sales return."""

    __tablename__ = "credit_notes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["sales_return_id", "business_id"],
            ["sales_returns.id", "sales_returns.business_id"],
            name="fk_credit_notes_return_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_credit_notes_invoice_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["customer_id", "business_id"],
            ["customers.id", "customers.business_id"],
            name="fk_credit_notes_customer_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "business_id", name="uq_credit_notes_id_business"),
        UniqueConstraint("business_id", "sales_return_id", name="uq_credit_note_per_return"),
        UniqueConstraint("business_id", "credit_note_number", name="uq_credit_note_number_business"),
        CheckConstraint("total > 0", name="ck_credit_note_total_positive"),
        CheckConstraint("length(currency_code) = 3", name="ck_credit_note_currency_length"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    sales_return_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    invoice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    customer_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    credit_note_number: Mapped[str] = mapped_column(String(80), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CashRefund(Base):
    """Immutable cash-out record against a credit note; separate from receivable credits."""

    __tablename__ = "cash_refunds"
    __table_args__ = (
        ForeignKeyConstraint(
            ["credit_note_id", "business_id"],
            ["credit_notes.id", "credit_notes.business_id"],
            name="fk_cash_refunds_note_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["payment_id", "business_id"],
            ["payments.id", "payments.business_id"],
            name="fk_cash_refunds_payment_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "business_id", name="uq_cash_refunds_id_business"),
        UniqueConstraint("business_id", "idempotency_key", name="uq_cash_refund_idempotency"),
        CheckConstraint("amount > 0", name="ck_cash_refund_amount_positive"),
        CheckConstraint("method IN ('cash', 'bank', 'card', 'other')", name="ck_cash_refund_method"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    credit_note_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    payment_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(24), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    refunded_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PlatformRoleGrant(Base):
    """A delegated platform role assigned by a bootstrap super administrator.

    Root/super-admin membership remains an out-of-band deployment setting and
    cannot be represented or granted through this table.
    """

    __tablename__ = "platform_role_grants"
    __table_args__ = (
        UniqueConstraint("user_subject", "role", name="uq_platform_role_user_role"),
        CheckConstraint(
            "role IN ('platform_viewer', 'workspace_operator', 'user_manager')",
            name="ck_platform_role_grants_allowed_role",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    granted_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reason: Mapped[str] = mapped_column(String(500), nullable=False)


class PlatformAdminAuditEvent(Base):
    """Append-only audit evidence for platform role grants and revocations."""

    __tablename__ = "platform_admin_audit_events"
    __table_args__ = (Index("ix_platform_admin_audit_events_created_at", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )




class Employee(Base):
    """Business-scoped employee profile; intentionally separate from login membership."""

    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_employees_id_business"),
        UniqueConstraint("business_id", "employee_code", name="uq_employees_business_code"),
        UniqueConstraint("business_id", "email", name="uq_employees_business_email"),
        CheckConstraint("monthly_salary > 0", name="ck_employees_salary_positive"),
        Index("ix_employees_business_active_name", "business_id", "is_active", "name"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    employee_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    monthly_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PayrollRecord(Base):
    """One immutable-period payroll draft with a server-calculated total and expense link."""

    __tablename__ = "payroll_records"
    __table_args__ = (
        ForeignKeyConstraint(
            ["employee_id", "business_id"],
            ["employees.id", "employees.business_id"],
            name="fk_payroll_employee_business",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["expense_id", "business_id"],
            ["expenses.id", "expenses.business_id"],
            name="fk_payroll_expense_business",
            ondelete="RESTRICT",
        ),
        UniqueConstraint("business_id", "employee_id", "period", name="uq_payroll_employee_period"),
        UniqueConstraint("expense_id", name="uq_payroll_expense"),
        CheckConstraint("base_salary > 0", name="ck_payroll_base_salary_positive"),
        CheckConstraint("allowances >= 0", name="ck_payroll_allowances_nonnegative"),
        CheckConstraint("bonuses >= 0", name="ck_payroll_bonuses_nonnegative"),
        CheckConstraint("deductions >= 0", name="ck_payroll_deductions_nonnegative"),
        CheckConstraint("net_pay > 0", name="ck_payroll_net_pay_positive"),
        CheckConstraint("status IN ('draft', 'approved', 'paid')", name="ck_payroll_status"),
        Index("ix_payroll_business_period_status", "business_id", "period", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    employee_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    base_salary: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    allowances: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"), server_default="0")
    bonuses: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"), server_default="0")
    deductions: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"), server_default="0")
    net_pay: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    expense_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    approved_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class CreditApplication(Base):
    """Append-only application of an issued credit note to a customer receivable."""

    __tablename__ = "credit_applications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["credit_note_id", "business_id"],
            ["credit_notes.id", "credit_notes.business_id"],
            name="fk_credit_applications_note_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_credit_applications_invoice_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "business_id", name="uq_credit_applications_id_business"),
        UniqueConstraint("business_id", "idempotency_key", name="uq_credit_application_idempotency"),
        CheckConstraint("amount > 0", name="ck_credit_application_amount_positive"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    credit_note_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    invoice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    applied_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
