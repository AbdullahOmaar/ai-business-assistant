"""Tenant-scoped purchase-order lifecycle read/edit APIs.

This module deliberately stops at stock receipt and audit visibility. It does not
implement supplier bills, payables, payments, inventory valuation or COGS.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.domain_rules import money
from app.models import (
    AuditEvent,
    MembershipRole,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    StockMovement,
    Supplier,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)
from app.services import WorkflowError

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["purchasing"])
ZERO = Decimal("0")


class PurchaseLineInput(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class PurchaseOrderUpdateInput(BaseModel):
    """Full replacement of a draft order, including all purchase lines."""

    supplier_id: UUID
    order_number: str = Field(min_length=1, max_length=64)
    currency_code: str = Field(min_length=3, max_length=3)
    lines: list[PurchaseLineInput] = Field(min_length=1, max_length=300)


def _authorize(session, principal, business_id, *, owner_only=False):
    return authorize_membership(
        session,
        principal=principal,
        business_id=business_id,
        allowed_roles={MembershipRole.OWNER} if owner_only else None,
    )


def _serialize(obj, fields):
    result = {}
    for field in fields:
        value = getattr(obj, field, None)
        if isinstance(value, (datetime, date)):
            value = value.isoformat()
        elif isinstance(value, (UUID, Decimal)):
            value = str(value)
        result[field] = value
    return result


def _load_order(session, business_id, order_id):
    return session.scalars(select(PurchaseOrder).where(
        PurchaseOrder.id == order_id,
        PurchaseOrder.business_id == business_id,
    )).one_or_none()


def _detail(session, business_id, order):
    supplier = session.scalars(select(Supplier).where(
        Supplier.id == order.supplier_id,
        Supplier.business_id == business_id,
    )).one_or_none()
    if supplier is None:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    lines = session.scalars(select(PurchaseOrderLine).where(
        PurchaseOrderLine.business_id == business_id,
        PurchaseOrderLine.purchase_order_id == order.id,
    ).order_by(PurchaseOrderLine.id)).all()
    product_ids = list({line.product_id for line in lines})
    products = session.scalars(select(Product).where(
        Product.business_id == business_id,
        Product.id.in_(product_ids),
    )).all() if product_ids else []
    by_id = {product.id: product for product in products}
    return {
        **_serialize(order, ("id", "business_id", "supplier_id", "order_number", "status", "currency_code", "total", "created_at")),
        "supplier": _serialize(supplier, ("id", "name", "email", "phone", "address", "is_active")),
        "lines": [
            {
                **_serialize(line, ("id", "product_id", "quantity", "unit_cost", "received_quantity")),
                "remaining_quantity": str(max(ZERO, line.quantity - line.received_quantity)),
                "product": _serialize(by_id[line.product_id], ("id", "name", "sku", "unit", "is_active"))
                if line.product_id in by_id else None,
            }
            for line in lines
        ],
    }


def _commit(session, action):
    try:
        result = action()
        session.commit()
        return result
    except AuthorizationError as exc:
        session.rollback()
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (WorkflowError, ValueError) as exc:
        session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Conflicting business data or duplicate key.") from exc
    except Exception:
        session.rollback()
        raise


def _validated_inputs(session, business_id, body):
    supplier = session.scalars(select(Supplier).where(
        Supplier.id == body.supplier_id,
        Supplier.business_id == business_id,
        Supplier.is_active.is_(True),
    )).one_or_none()
    if supplier is None:
        raise WorkflowError("Active supplier not found in this business")
    currency = body.currency_code.strip().upper()
    if len(currency) != 3 or not currency.isascii() or not currency.isalpha():
        raise WorkflowError("Currency must be a three-letter code")
    order_number = body.order_number.strip()
    if not order_number:
        raise WorkflowError("Order number is required")
    product_ids = list({line.product_id for line in body.lines})
    products = session.scalars(select(Product).where(
        Product.business_id == business_id,
        Product.id.in_(product_ids),
    )).all()
    by_id = {product.id: product for product in products}
    if len(by_id) != len(product_ids):
        raise WorkflowError("Every purchase line must reference a product in this business")
    if any(not product.is_active or not product.is_stock_tracked for product in by_id.values()):
        raise WorkflowError("Every purchase line must reference an active stock-tracked product in this business")
    return supplier, currency, order_number, by_id


@router.get("/purchase-orders/{order_id}")
def get_purchase_order(
    business_id: UUID, order_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    try:
        _authorize(session, principal, business_id)
        order = _load_order(session, business_id, order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        return _detail(session, business_id, order)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.put("/purchase-orders/{order_id}")
def update_draft_purchase_order(
    business_id: UUID, order_id: UUID, body: PurchaseOrderUpdateInput,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Atomically replace draft fields/lines; all other states are immutable."""
    def op():
        _authorize(session, principal, business_id, owner_only=True)
        order = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.business_id == business_id,
        ).with_for_update()).one_or_none()
        if order is None:
            raise WorkflowError("Purchase order not found in this business")
        if order.status != "draft":
            raise WorkflowError("Only draft purchase orders can be edited")
        supplier, currency, order_number, products = _validated_inputs(session, business_id, body)
        old_lines = session.scalars(select(PurchaseOrderLine).where(
            PurchaseOrderLine.business_id == business_id,
            PurchaseOrderLine.purchase_order_id == order.id,
        )).all()
        if any(line.received_quantity != ZERO for line in old_lines):
            raise WorkflowError("A purchase order with received quantities cannot be edited")
        for line in old_lines:
            session.delete(line)
        session.flush()
        order.supplier_id = supplier.id
        order.order_number = order_number
        order.currency_code = currency
        total = ZERO
        for item in body.lines:
            total += money(item.quantity * item.unit_cost)
            session.add(PurchaseOrderLine(
                business_id=business_id,
                purchase_order_id=order.id,
                product_id=products[item.product_id].id,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                received_quantity=ZERO,
            ))
        order.total = money(total)
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="purchase_order.updated",
            target_type="purchase_order",
            target_id=str(order.id),
            change_summary=f"Draft order {order.order_number} updated",
        ))
        session.flush()
        return order
    order = _commit(session, op)
    return _serialize(order, ("id", "business_id", "supplier_id", "order_number", "status", "currency_code", "total", "created_at"))


@router.post("/purchase-orders/{order_id}/cancel")
def cancel_draft_purchase_order(
    business_id: UUID, order_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Cancel only draft orders; this never reverses stock or financial events."""
    def op():
        _authorize(session, principal, business_id, owner_only=True)
        order = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.business_id == business_id,
        ).with_for_update()).one_or_none()
        if order is None:
            raise WorkflowError("Purchase order not found in this business")
        if order.status != "draft":
            raise WorkflowError("Only draft purchase orders can be cancelled")
        receipt = session.scalars(select(StockMovement.id).where(
            StockMovement.business_id == business_id,
            StockMovement.reference_type == "purchase_order",
            StockMovement.reference_id == order.id,
            StockMovement.movement_type == "receipt",
        ).limit(1)).first()
        if receipt is not None:
            raise WorkflowError("A purchase order with receipt history cannot be cancelled")
        order.status = "cancelled"
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="purchase_order.cancelled",
            target_type="purchase_order",
            target_id=str(order.id),
            change_summary=f"Draft order {order.order_number} cancelled",
        ))
        session.flush()
        return order
    order = _commit(session, op)
    return _serialize(order, ("id", "order_number", "status", "currency_code", "total"))


@router.get("/purchase-orders/{order_id}/receipts")
def list_purchase_order_receipts(
    business_id: UUID, order_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    try:
        _authorize(session, principal, business_id, owner_only=True)
        order = _load_order(session, business_id, order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        rows = session.execute(
            select(StockMovement, Product)
            .join(Product, (Product.id == StockMovement.product_id) & (Product.business_id == StockMovement.business_id))
            .where(
                StockMovement.business_id == business_id,
                StockMovement.reference_type == "purchase_order",
                StockMovement.reference_id == order.id,
                StockMovement.movement_type == "receipt",
            )
            .order_by(StockMovement.created_at, StockMovement.id)
            .offset(offset).limit(limit)
        ).all()
        return {
            "items": [
                {
                    **_serialize(movement, ("id", "product_id", "movement_type", "quantity_delta", "reason", "reference_type", "reference_id", "created_by_subject", "created_at")),
                    "product": _serialize(product, ("id", "name", "sku", "unit")),
                }
                for movement, product in rows
            ],
            "limit": limit,
            "offset": offset,
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/purchase-orders/{order_id}/activity")
def list_purchase_order_activity(
    business_id: UUID, order_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    try:
        _authorize(session, principal, business_id, owner_only=True)
        order = _load_order(session, business_id, order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        events = session.scalars(select(AuditEvent).where(
            AuditEvent.business_id == business_id,
            AuditEvent.target_type == "purchase_order",
            AuditEvent.target_id == str(order.id),
        ).order_by(AuditEvent.created_at, AuditEvent.id).offset(offset).limit(limit)).all()
        return {
            "items": [
                _serialize(event, ("id", "actor_subject", "action", "target_type", "target_id", "change_summary", "created_at"))
                for event in events
            ],
            "limit": limit,
            "offset": offset,
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/inventory/movements")
def list_inventory_movements(
    business_id: UUID,
    product_id: UUID | None = None,
    movement_type: str | None = Query(default=None, min_length=1, max_length=16),
    reference_type: str | None = Query(default=None, min_length=1, max_length=32),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Read the immutable, tenant-scoped stock movement ledger."""
    try:
        _authorize(session, principal, business_id)
        allowed_types = {"opening", "receipt", "sale", "return", "adjustment"}
        if movement_type is not None and movement_type not in allowed_types:
            raise HTTPException(status_code=422, detail="Unsupported stock movement type")
        statement = (
            select(StockMovement, Product)
            .join(
                Product,
                (Product.id == StockMovement.product_id)
                & (Product.business_id == StockMovement.business_id),
            )
            .where(StockMovement.business_id == business_id)
        )
        if product_id is not None:
            statement = statement.where(StockMovement.product_id == product_id)
        if movement_type is not None:
            statement = statement.where(StockMovement.movement_type == movement_type)
        if reference_type is not None:
            statement = statement.where(StockMovement.reference_type == reference_type)
        rows = session.execute(
            statement.order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
            .offset(offset).limit(limit + 1)
        ).all()
        page = rows[:limit]
        return {
            "items": [
                {
                    **_serialize(
                        movement,
                        (
                            "id", "product_id", "movement_type", "quantity_delta",
                            "reason", "reference_type", "reference_id",
                            "created_by_subject", "created_at",
                        ),
                    ),
                    "product": _serialize(product, ("id", "name", "sku", "unit")),
                }
                for movement, product in page
            ],
            "limit": limit,
            "offset": offset,
            "has_more": len(rows) > limit,
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
