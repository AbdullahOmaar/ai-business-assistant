"""Database models: catalog domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
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


class Product(Base):
    """Business-scoped catalog item; stock quantity is not stored on this row."""

    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("business_id", "sku", name="uq_products_business_sku"),
        # Composite target lets stock movements enforce matching business ownership.
        UniqueConstraint("id", "business_id", name="uq_products_id_business"),
        CheckConstraint("unit_price >= 0", name="ck_products_unit_price_nonnegative"),
        CheckConstraint(
            "(second_unit_name IS NULL) = (conversion_factor IS NULL)",
            name="ck_products_second_unit_pair",
        ),
        CheckConstraint(
            "conversion_factor IS NULL OR conversion_factor > 0",
            name="ck_products_conversion_factor_positive",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    sku: Mapped[str | None] = mapped_column(String(80), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    unit: Mapped[str] = mapped_column(String(32), nullable=False, default="unit")
    # 3A-920 step 3: the second selling unit + how many base units one
    # second unit holds (company data, never a code constant). Both set
    # together or both null; only settable while transport.enabled is on
    # (enforced in app.services / app.extended_api).
    second_unit_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    conversion_factor: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True)
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

