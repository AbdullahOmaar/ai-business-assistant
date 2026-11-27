"""Database models: sales domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


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
        # 3A-650 part D: supports the profit-loss / tax-summary aggregations
        # (business + issued status + issue-date range) without scanning
        # every invoice the business ever created.
        Index("ix_invoices_business_status_issue_date", "business_id", "status", "issue_date"),
        CheckConstraint("subtotal >= 0 AND tax_total >= 0 AND discount_total >= 0 AND total >= 0",
                        name="ck_invoice_nonnegative_totals"),
        CheckConstraint("status IN ('draft', 'issued', 'void')", name="ck_invoice_status"),
        # 3A-920 step 4: the optional transport/delivery block — the
        # driver is a business-scoped employee reference, and a
        # confirmed entitlement points at the payroll record it became.
        ForeignKeyConstraint(
            ["driver_employee_id", "business_id"], ["employees.id", "employees.business_id"],
            name="fk_invoices_driver_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["transport_entitlement_payroll_id", "business_id"],
            ["payroll_records.id", "payroll_records.business_id"],
            name="fk_invoices_entitlement_payroll_business", ondelete="RESTRICT",
        ),
        CheckConstraint("transport_trips IS NULL OR transport_trips >= 0",
                        name="ck_invoice_transport_trips_nonnegative"),
        CheckConstraint(
            "transport_entitlement_status IS NULL OR transport_entitlement_status "
            "IN ('proposed', 'confirmed', 'dismissed', 'cancelled')",
            name="ck_invoice_transport_entitlement_status",
        ),
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
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # 3A-920 step 4: the transport/delivery block — all NULL unless the
    # company filled it while the master switch was on. The trip wage
    # is snapshotted at ISSUE time (the delivery moment) as the
    # proposed entitlement's basis; the entitlement is a proposal for
    # payroll confirmation only, never an automatic posting.
    driver_employee_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    transport_trips: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transport_from: Mapped[str | None] = mapped_column(String(200), nullable=True)
    transport_to: Mapped[str | None] = mapped_column(String(200), nullable=True)
    transport_trip_wage: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    transport_entitlement_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
    transport_entitlement_payroll_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), nullable=True
    )
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
        CheckConstraint(
            "conversion_factor IS NULL OR conversion_factor > 0",
            name="ck_invoice_line_conversion_factor_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    invoice_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    product_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    # 3A-920 step 3: the unit the line was sold in + the factor applied,
    # snapshotted at creation so issue / void / return math stays exact
    # even if the product's factor changes later. Null = base unit.
    sold_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    conversion_factor: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True)
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


class SalesReturn(Base):
    """Return request tied to an original invoice."""

    __tablename__ = "sales_returns"
    __table_args__ = (
        ForeignKeyConstraint(
            ["invoice_id", "business_id"], ["invoices.id", "invoices.business_id"],
            name="fk_sales_returns_invoice_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("id", "business_id", name="uq_sales_returns_id_business"),
        # 3A-650 part D: supports the profit-loss approved-returns
        # aggregation (business + status).
        Index("ix_sales_returns_business_status", "business_id", "status"),
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
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
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
    """Immutable credit note issued from one approved sales return.

    Stage 1 only: this document does not apply receivables or record a cash refund.
    """

    __tablename__ = "credit_notes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["sales_return_id", "business_id"],
            ["sales_returns.id", "sales_returns.business_id"],
            name="fk_credit_notes_return_business",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["invoice_id", "business_id"],
            ["invoices.id", "invoices.business_id"],
            name="fk_credit_notes_invoice_business",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["customer_id", "business_id"],
            ["customers.id", "customers.business_id"],
            name="fk_credit_notes_customer_business",
            ondelete="RESTRICT",
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


class CustomerOrder(Base):
    """Customer order header (3A-923 C4); a pre-invoice document.

    An order never moves stock and never posts financially: on
    fulfilment it converts one-to-one into a DRAFT invoice through the
    ordinary invoice service, and stock moves only when that invoice
    is issued. Totals are stored snapshots calculated by trusted
    services, exactly like invoices. The optional delivery fields
    mirror the invoice transport block (3A-920 step 4) and are copied
    into the converted invoice; they are gated by the same master
    switch at write time.
    """

    __tablename__ = "customer_orders"
    __table_args__ = (
        ForeignKeyConstraint(
            ["customer_id", "business_id"], ["customers.id", "customers.business_id"],
            name="fk_customer_orders_customer_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["driver_employee_id", "business_id"], ["employees.id", "employees.business_id"],
            name="fk_customer_orders_driver_business", ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["converted_invoice_id", "business_id"], ["invoices.id", "invoices.business_id"],
            name="fk_customer_orders_converted_invoice_business", ondelete="RESTRICT",
        ),
        UniqueConstraint("business_id", "order_number", name="uq_customer_order_business_number"),
        UniqueConstraint("id", "business_id", name="uq_customer_orders_id_business"),
        UniqueConstraint("converted_invoice_id", name="uq_customer_order_converted_invoice"),
        CheckConstraint(
            "status IN ('draft', 'confirmed', 'fulfilled', 'cancelled')",
            name="ck_customer_order_status",
        ),
        CheckConstraint(
            "subtotal >= 0 AND tax_total >= 0 AND discount_total >= 0 AND total >= 0",
            name="ck_customer_order_nonnegative_totals",
        ),
        CheckConstraint(
            "transport_trips IS NULL OR transport_trips >= 0",
            name="ck_customer_order_transport_trips_nonnegative",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    discount_rate: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal(0))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=Decimal(0))
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    driver_employee_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    transport_trips: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transport_from: Mapped[str | None] = mapped_column(String(200), nullable=True)
    transport_to: Mapped[str | None] = mapped_column(String(200), nullable=True)
    converted_invoice_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    lines: Mapped[list["CustomerOrderLine"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class CustomerOrderLine(Base):
    """Customer order line with immutable price/description snapshots.

    Mirrors InvoiceLine: product lines are priced from the catalogue
    by the server, and the sold unit + conversion factor are
    snapshotted at write time so the conversion into an invoice stays
    exact even if the product configuration changes later.
    """

    __tablename__ = "customer_order_lines"
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_customer_order_lines_id_business"),
        ForeignKeyConstraint(
            ["order_id", "business_id"],
            ["customer_orders.id", "customer_orders.business_id"],
            name="fk_customer_order_lines_order_business",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["product_id", "business_id"], ["products.id", "products.business_id"],
            name="fk_customer_order_lines_product_business", ondelete="RESTRICT",
        ),
        CheckConstraint("quantity > 0", name="ck_customer_order_line_quantity_positive"),
        CheckConstraint(
            "unit_price >= 0 AND line_total >= 0",
            name="ck_customer_order_line_amounts_nonnegative",
        ),
        CheckConstraint(
            "conversion_factor IS NULL OR conversion_factor > 0",
            name="ck_customer_order_line_conversion_factor_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    product_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    sold_unit: Mapped[str | None] = mapped_column(String(32), nullable=True)
    conversion_factor: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    order: Mapped["CustomerOrder"] = relationship(back_populates="lines")
