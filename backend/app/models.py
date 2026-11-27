"""SQLAlchemy models for business workspaces and initial business data.

This schema is groundwork only. Authentication and request-level tenant
authorization must be implemented before business-data endpoints are exposed.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy import (
    Enum as SqlEnum,
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
    # Soft-deletion marker (B3, 3A-721): set together with is_active=False
    # by DELETE /businesses/{id}; the retention window for the purge is
    # measured from this timestamp. NULL while the business is live.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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
    # Org assignment (C8): nullable — a member with no assignment is unassigned.
    department_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    team_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    business: Mapped[Business] = relationship(back_populates="memberships")


class BusinessInvitation(Base):
    """Single-use, email-bound invitation to join one workspace as STAFF."""

    __tablename__ = "business_invitations"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_business_invitation_token_hash"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'revoked', 'expired')",
            name="ck_business_invitation_status",
        ),
        Index("ix_business_invitations_business_status", "business_id", "status"),
        Index("ix_business_invitations_business_email", "business_id", "target_email"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    target_email: Mapped[str] = mapped_column(String(254), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    invited_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Department(Base):
    """Business-scoped org unit (C8). Departments may nest via parent_id."""

    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("business_id", "name", name="uq_departments_business_name"),
        Index("ix_departments_business_parent", "business_id", "parent_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Team(Base):
    """Business-scoped team inside exactly one department (C8)."""

    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "department_id", "name",
            name="uq_teams_business_department_name",
        ),
        Index("ix_teams_business_department", "business_id", "department_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


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


class StockMovementIdempotency(Base):
    """Durable replay identity for one intentional manual stock movement.

    Mirrors PurchaseReceiptIdempotency: the unique key is scoped to a
    business, the canonical request hash prevents reuse of a key for a
    different payload, and the response snapshot lets the route replay the
    original result without recording a second movement or audit event.
    """

    __tablename__ = "stock_movement_idempotency"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "idempotency_key",
            name="uq_stock_movement_idempotency_scope_key",
        ),
        UniqueConstraint(
            "id", "business_id",
            name="uq_stock_movement_idempotency_id_business",
        ),
        Index(
            "ix_stock_movement_idempotency_business_created",
            "business_id", "created_at",
        ),
        CheckConstraint(
            "length(idempotency_key) = 36",
            name="ck_stock_movement_idempotency_key_length",
        ),
        CheckConstraint(
            "length(request_hash) = 64",
            name="ck_stock_movement_idempotency_hash_length",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="RESTRICT"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(36), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
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
        # 3A-650 part D: supports the profit-loss / tax-summary aggregations
        # (business + issued status + issue-date range) without scanning
        # every invoice the business ever created.
        Index("ix_invoices_business_status_issue_date", "business_id", "status", "issue_date"),
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
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    discount_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0))
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
        Numeric(14, 3), nullable=False, default=Decimal(0)
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
    # Org assignment (C8): the free-text `department` above stays as legacy
    # display text; the FKs below are the authoritative structure.
    department_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    team_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # 3A-920 step 1: enrolled as a driver/delivery agent. Only this flag
    # (never a free-text job title) puts an employee in the invoice
    # drivers list; settable only while transport.enabled is on.
    is_driver: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
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
    allowances: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0), server_default="0")
    bonuses: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0), server_default="0")
    deductions: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal(0), server_default="0")
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


class DemoRateLimitCounter(Base):
    """Shared fixed-window counters for public demo rate limiting."""

    __tablename__ = "demo_rate_limit_counters"
    __table_args__ = (
        CheckConstraint(
            "request_count > 0",
            name="ck_demo_rate_limit_count_positive",
        ),
    )

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True, nullable=False)
    window_start_epoch: Mapped[int] = mapped_column(BigInteger, nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )


class AssistantProposal(Base):
    """One assistant-proposed write, bound to its exact payload (Slice 1).

    The lifecycle is request -> proposal -> (second approval, when the
    action is in the 19) -> execute -> result. The payload is stored
    server-side and never changes between proposal and execution; the
    approval binds to its hash, so a tampered or re-issued payload can
    never ride an old approval. ``expires_at`` is creation + 5 minutes
    (owner decision 2026-11-25); expiry is derived on read — no lazy
    write mutates the row — so ``status`` stays ``proposed``/``approved``
    in the database and the API reports ``expired`` once the deadline
    passes. ``approved_action`` records the effective action the
    approval was granted for (draft vs issued invoice update), so an
    approval given for a draft edit cannot execute an issued edit if
    the invoice's status changed underneath. ``executing`` is a
    transient claim state: the execute step atomically moves the
    proposal to ``executing`` (committed before dispatch) so a second
    concurrent execute cannot dispatch the same payload again; a
    failed dispatch releases the claim back to the pre-execution
    status, so the approval is not burned.
    """

    __tablename__ = "assistant_proposals"
    __table_args__ = (
        CheckConstraint(
            "status IN ('proposed', 'approved', 'executing', 'executed', 'expired', 'rejected')",
            name="ck_assistant_proposals_status",
        ),
        Index("ix_assistant_proposals_business_created", "business_id", "created_at"),
        Index("ix_assistant_proposals_business_status", "business_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    requester_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="proposed")
    approver_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_action: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_target_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    result_target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AssistantConfirmationOptOut(Base):
    """An owner's explicit per-action waiver of the second-approval question.

    Slice 1 (owner decision 2026-11-25, DESIGN.md §5.3): the owner may
    enable "don't ask again" for any of the 19 sensitive actions. The
    waiver covers only the *question*: role, payload binding and audit
    still apply, and it waives approval only for the owner's own
    requests — a staff member's money action always needs a live owner
    approval. One row per (business, owner, action).
    """

    __tablename__ = "assistant_confirmation_opt_outs"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "user_subject", "action",
            name="uq_assistant_opt_outs_business_user_action",
        ),
        Index("ix_assistant_opt_outs_business_user", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AssistantConversation(Base):
    """One persisted assistant chat thread (Slice 4).

    A conversation belongs to a business and to the user who started
    it, but it is business-visible: any member may list and resume any
    conversation in the business — the cross-owner approval path needs
    the owner to open a staff requester's conversation and click
    approve on the proposal card that lives in it. ``title`` is the
    first user message truncated, never model-generated.
    ``updated_at`` moves on every appended message so the history list
    orders by most recent activity.
    """

    __tablename__ = "assistant_conversations"
    __table_args__ = (
        Index("ix_assistant_conversations_business_updated", "business_id", "updated_at"),
        Index("ix_assistant_conversations_business_subject", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AssistantMessage(Base):
    """One persisted chat turn (Slice 4).

    ``role`` is 'user' or 'assistant'; ``content`` is the exact text
    shown. ``proposal_id`` links the message that carried a proposal
    card to its proposal row — the proposal itself is never copied
    into the message: GET-one re-reads the proposal from its own
    table, so a resumed card shows the proposal's CURRENT state (a
    proposal whose 5 minutes elapsed reads ``expired``, honestly,
    never as still-valid). ON DELETE SET NULL keeps the message even
    if its proposal row is ever removed.
    """

    __tablename__ = "assistant_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_assistant_messages_role",
        ),
        Index("ix_assistant_messages_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    proposal_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppLink(Base):
    """A team member's phone number bound to their account (W-foundation).

    WhatsApp channel (WHATSAPP-CHANNEL-DESIGN.md §3): linking starts
    in the app (a short-lived code) and completes when the code
    arrives from the number being linked. One active link per
    (business, number) and per (business, user) — enforced in
    app.whatsapp_linking, not by a unique constraint, because revoked
    rows are kept as the audit trail. ``status`` is 'linked' or
    'revoked'; a revoked link is never silently resurrected — linking
    again creates a fresh row through a fresh code.
    """

    __tablename__ = "whatsapp_links"
    __table_args__ = (
        CheckConstraint(
            "status IN ('linked', 'revoked')",
            name="ck_whatsapp_links_status",
        ),
        Index("ix_whatsapp_links_business_wa", "business_id", "wa_id"),
        Index("ix_whatsapp_links_business_user", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    phone_e164: Mapped[str] = mapped_column(String(32), nullable=False)
    wa_id: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="linked")
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppMessage(Base):
    """One WhatsApp channel ledger row (W-foundation).

    Every inbound message the webhook accepts and every outbound
    message the channel sends is recorded here. The inbound ``wamid``
    is UNIQUE — that is the dedupe mechanism: a provider redelivery
    of the same message collides on insert and is processed zero
    additional times. Outbound rows carry the provider's message id
    as their ``wamid``. ``conversation_id``/``proposal_id`` tie a
    WhatsApp turn to its Slice 4 conversation and any proposal it
    produced — the ledger rows are how a conversation is marked as a
    WhatsApp-channel conversation (Slice 4 tables stay untouched).
    ``wa_id`` is the counterparty: the sender for inbound rows, the
    recipient for outbound rows. ``body_preview`` is a bounded copy
    for support/debugging, never the channel of record.
    """

    __tablename__ = "whatsapp_messages"
    __table_args__ = (
        CheckConstraint(
            "direction IN ('in', 'out')",
            name="ck_whatsapp_messages_direction",
        ),
        UniqueConstraint("wamid", name="uq_whatsapp_messages_wamid"),
        Index("ix_whatsapp_messages_business_created", "business_id", "created_at"),
        Index("ix_whatsapp_messages_business_wa", "business_id", "wa_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    wamid: Mapped[str] = mapped_column(String(128), nullable=False)
    wa_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    conversation_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_conversations.id", ondelete="SET NULL"),
        nullable=True,
    )
    proposal_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_proposals.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="text")
    body_preview: Mapped[str | None] = mapped_column(String(500), nullable=True)
    template_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class WhatsAppLinkCode(Base):
    """A single-use, 10-minute linking code (W-foundation).

    Created in the app by a signed-in member; only the SHA-256 hash
    of the code is stored, so a database read never reveals a live
    code. The code completes exactly one link (``used_at`` is set on
    completion); creating a new code supersedes the member's earlier
    unused codes in the same business.
    """

    __tablename__ = "whatsapp_link_codes"
    __table_args__ = (
        Index("ix_whatsapp_link_codes_hash", "code_hash"),
        Index("ix_whatsapp_link_codes_business_user", "business_id", "user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
