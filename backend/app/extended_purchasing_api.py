"""Extended business endpoints: suppliers and purchase orders (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
import hashlib
import json
import os
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Query
from sqlalchemy import (
    func,
    select,
    text,
)
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core_features_api import _day_bounds
from app.dependencies import get_principal, get_session
from app.domain_rules import money
from app.extended_common import (
    ZERO,
    PurchaseOrderInput,
    ReceivePurchaseInput,
    _authorized,
    _commit,
    _dict,
    router,
)
from app.models import (
    AuditEvent,
    Business,
    Invoice,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseReceiptIdempotency,
    RecurringInvoiceSchedule,
    StockMovement,
    Supplier,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
)
from app.services import WorkflowError


@router.get("/suppliers")
def list_suppliers(business_id: UUID, limit: int = Query(default=100, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Supplier).where(
            Supplier.business_id == business_id, Supplier.is_active.is_(True),
        ).order_by(Supplier.name, Supplier.id).offset(offset).limit(limit)).all()
        return [_dict(item, ("id", "business_id", "name", "email", "phone", "address", "is_active", "created_at")) for item in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/purchase-orders")
def list_purchase_orders(business_id: UUID, limit: int = Query(default=100, ge=1, le=200),
                         offset: int = Query(default=0, ge=0),
                         session: Session = Depends(get_session),
                         principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        orders = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.business_id == business_id,
        ).order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc()).offset(offset).limit(limit)).all()

        # Load all lines for the selected page in one tenant-scoped query. Avoid
        # one extra round trip per order while preserving each order's line order.
        lines_by_order: dict[UUID, list[PurchaseOrderLine]] = {}
        order_ids = [order.id for order in orders]
        if order_ids:
            page_lines = session.scalars(select(PurchaseOrderLine).where(
                PurchaseOrderLine.business_id == business_id,
                PurchaseOrderLine.purchase_order_id.in_(order_ids),
            ).order_by(PurchaseOrderLine.purchase_order_id, PurchaseOrderLine.id)).all()
            for line in page_lines:
                lines_by_order.setdefault(line.purchase_order_id, []).append(line)

        result = []
        for order in orders:
            lines = lines_by_order.get(order.id, [])
            item = _dict(order, ("id", "business_id", "supplier_id", "order_number", "status", "currency_code", "total", "created_at"))
            item["lines"] = [
                {**_dict(line, ("id", "product_id", "quantity", "unit_cost", "received_quantity")),
                 "remaining_quantity": str(max(ZERO, line.quantity - line.received_quantity))}
                for line in lines
            ]
            result.append(item)
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

@router.get("/recurring-invoices")
def list_recurring_schedules(business_id: UUID, limit: int = Query(default=100, ge=1, le=200),
                             offset: int = Query(default=0, ge=0),
                             session: Session = Depends(get_session),
                             principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(RecurringInvoiceSchedule).where(
            RecurringInvoiceSchedule.business_id == business_id,
        ).order_by(RecurringInvoiceSchedule.next_run_at, RecurringInvoiceSchedule.id).offset(offset).limit(limit)).all()
        return [_dict(item, ("id", "business_id", "customer_id", "interval_days", "timezone", "next_run_at", "is_active", "created_at")) for item in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/operations/health")
def operations_health(business_id: UUID, session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Owner-only, read-only operational readiness snapshot with no secret values."""
    try:
        _authorized(session, principal, business_id, owner_only=True)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    database_connected = False
    migration_table_available = False
    migration_revision = None
    try:
        session.execute(text("SELECT 1"))
        database_connected = True
        try:
            migration_revision = session.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar_one_or_none()
            migration_table_available = migration_revision is not None
        except SQLAlchemyError:
            session.rollback()
            migration_table_available = False
            migration_revision = None
    except SQLAlchemyError:
        session.rollback()
    notification_delivery_configured = False
    recurring_invoice_worker_configured = False
    healthy = database_connected and migration_table_available
    return {
        "status": "ok" if healthy else "degraded",
        "checked_at": datetime.now(UTC).isoformat(),
        "database_connected": database_connected,
        "migration_table_available": migration_table_available,
        "migration_revision": migration_revision,
        "ai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "notification_delivery_configured": notification_delivery_configured,
        "recurring_invoice_worker_configured": recurring_invoice_worker_configured,
    }


@router.get("/reports/tax-summary")
def report_tax_summary(
    business_id: UUID,
    start_date: date | None = None,
    end_date: date | None = None,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Summarize saved tax totals from issued invoices, separated by currency."""
    try:
        _authorized(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must not be after end_date")
    statement = select(
        Invoice.currency_code,
        func.coalesce(func.sum(Invoice.tax_total), 0),
        func.count(Invoice.id),
    ).where(Invoice.business_id == business_id, Invoice.status == "issued")
    business = session.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    start_utc, end_utc = _day_bounds(start_date, end_date, business.timezone)
    if start_utc is not None:
        statement = statement.where(Invoice.issue_date >= start_utc)
    if end_utc is not None:
        statement = statement.where(Invoice.issue_date < end_utc)
    rows = session.execute(statement.group_by(Invoice.currency_code).order_by(Invoice.currency_code)).all()
    return {
        "period": {"start_date": start_date.isoformat() if start_date else None,
                   "end_date": end_date.isoformat() if end_date else None},
        "source": "issued_invoice_tax_snapshots",
        "currencies": [
            {"currency_code": currency, "tax_total": str(money(Decimal(str(total)))), "invoice_count": count}
            for currency, total, count in rows
        ],
        "limitations": [
            "Uses saved tax totals on issued invoices; it does not recalculate historical taxes.",
            "Currency totals are kept separate and are not converted.",
            "This is an operational summary, not a jurisdiction-specific tax filing.",
        ],
    }

@router.post("/purchase-orders", status_code=201)
def post_purchase_order(business_id: UUID, body: PurchaseOrderInput,
                        session: Session = Depends(get_session),
                        principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Create a draft purchase order; owner approval is a separate privileged step."""
    def op():
        _authorized(session, principal, business_id)
        supplier = session.scalars(select(Supplier).where(
            Supplier.id == body.supplier_id, Supplier.business_id == business_id,
            Supplier.is_active.is_(True),
        )).one_or_none()
        if supplier is None:
            raise WorkflowError("Active supplier not found in this business")
        currency = body.currency_code.upper()
        if len(currency) != 3 or not currency.isalpha():
            raise WorkflowError("Currency must be a three-letter code")
        po = PurchaseOrder(business_id=business_id, supplier_id=supplier.id,
                           order_number=body.order_number.strip(), status="draft",
                           currency_code=currency, total=ZERO)
        total = ZERO
        session.add(po)
        session.flush()
        for line in body.lines:
            product = session.scalars(select(Product).where(
                Product.id == line.product_id, Product.business_id == business_id,
                Product.is_active.is_(True), Product.is_stock_tracked.is_(True),
            )).one_or_none()
            if product is None:
                raise WorkflowError("Every purchase line must reference an active stock-tracked product in this business")
            total += money(line.quantity * line.unit_cost)
            session.add(PurchaseOrderLine(
                business_id=business_id, purchase_order_id=po.id, product_id=product.id,
                quantity=line.quantity, unit_cost=line.unit_cost, received_quantity=ZERO,
            ))
        po.total = total
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="purchase_order.created", target_type="purchase_order",
            target_id=str(po.id), change_summary=f"Draft order {po.order_number}"))
        session.flush()
        return po
    po = _commit(session, op)
    return _dict(po, ("id", "business_id", "supplier_id", "order_number", "status",
                      "currency_code", "total", "created_at"))


@router.post("/purchase-orders/{order_id}/duplicate", status_code=201)
def duplicate_purchase_order(business_id: UUID, order_id: UUID,
                             session: Session = Depends(get_session),
                             principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Re-create a purchase order as a new draft (3A-435 / T39 «إعادة الطلب»).

    Same supplier, currency and lines (unit-cost snapshots kept, so the
    total matches); receipts stay on the source — the copy starts with
    zero received quantities and needs its own owner approval.
    """
    def op():
        _authorized(session, principal, business_id)
        source = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.business_id == business_id,
        )).one_or_none()
        if source is None:
            raise WorkflowError("Purchase order not found in this business")
        source_lines = session.scalars(select(PurchaseOrderLine).where(
            PurchaseOrderLine.purchase_order_id == source.id,
            PurchaseOrderLine.business_id == business_id,
        )).all()
        if not source_lines:
            raise WorkflowError("A purchase order must contain at least one line")
        supplier = session.scalars(select(Supplier).where(
            Supplier.id == source.supplier_id, Supplier.business_id == business_id,
            Supplier.is_active.is_(True),
        )).one_or_none()
        if supplier is None:
            raise WorkflowError("Active supplier not found in this business")
        for line in source_lines:
            product = session.scalars(select(Product).where(
                Product.id == line.product_id, Product.business_id == business_id,
                Product.is_active.is_(True), Product.is_stock_tracked.is_(True),
            )).one_or_none()
            if product is None:
                raise WorkflowError("Every purchase line must reference an active stock-tracked product in this business")
        base_number = source.order_number.strip()
        candidate = f"{base_number}-COPY"[:64]
        suffix = 2
        while session.scalars(select(PurchaseOrder.id).where(
            PurchaseOrder.business_id == business_id,
            PurchaseOrder.order_number == candidate,
        )).first() is not None:
            tail = f"-COPY-{suffix}"
            candidate = f"{base_number[:64 - len(tail)]}{tail}"
            suffix += 1
        po = PurchaseOrder(business_id=business_id, supplier_id=supplier.id,
                           order_number=candidate, status="draft",
                           currency_code=source.currency_code, total=ZERO)
        total = ZERO
        session.add(po)
        session.flush()
        for line in source_lines:
            total += money(line.quantity * line.unit_cost)
            session.add(PurchaseOrderLine(
                business_id=business_id, purchase_order_id=po.id,
                product_id=line.product_id, quantity=line.quantity,
                unit_cost=line.unit_cost, received_quantity=ZERO,
            ))
        po.total = total
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="purchase_order.created", target_type="purchase_order",
            target_id=str(po.id), change_summary=f"Draft order {po.order_number}"))
        session.flush()
        return po
    po = _commit(session, op)
    return _dict(po, ("id", "business_id", "supplier_id", "order_number", "status",
                      "currency_code", "total", "created_at"))


@router.post("/purchase-orders/{order_id}/approve")
def approve_purchase_order(business_id: UUID, order_id: UUID,
                           session: Session = Depends(get_session),
                           principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Approve a draft purchase order; only the business owner may authorize it."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        po = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.business_id == business_id,
        ).with_for_update()).one_or_none()
        if po is None:
            raise WorkflowError("Purchase order not found in this business")
        if po.status != "draft":
            raise WorkflowError("Only draft purchase orders can be approved")
        lines = session.scalars(select(PurchaseOrderLine).where(
            PurchaseOrderLine.purchase_order_id == po.id,
            PurchaseOrderLine.business_id == business_id,
        )).all()
        if not lines:
            raise WorkflowError("A purchase order must contain at least one line")
        po.status = "approved"
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="purchase_order.approved", target_type="purchase_order",
            target_id=str(po.id), change_summary=f"Approved order {po.order_number}",
        ))
        session.flush()
        return po
    po = _commit(session, op)
    return _dict(po, ("id", "business_id", "supplier_id", "order_number", "status",
                      "currency_code", "total", "created_at"))


@router.post("/purchase-orders/{order_id}/receive")
def receive_purchase_order(
    business_id: UUID,
    order_id: UUID,
    body: ReceivePurchaseInput,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Apply one receipt exactly once and replay the original result on safe retries."""
    request_hash: str | None = None

    def op():
        nonlocal request_hash
        _authorized(session, principal, business_id, owner_only=True)
        po = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.id == order_id,
            PurchaseOrder.business_id == business_id,
        ).with_for_update().execution_options(populate_existing=True)).one_or_none()
        if po is None:
            raise WorkflowError("Purchase order not found in this business")
        if not idempotency_key:
            raise HTTPException(status_code=422, detail="A canonical UUID Idempotency-Key header is required.")
        try:
            parsed_key = UUID(idempotency_key)
        except (ValueError, TypeError, AttributeError) as exc:
            raise HTTPException(status_code=422, detail="Idempotency-Key must be a canonical UUID.") from exc
        if str(parsed_key) != idempotency_key:
            raise HTTPException(status_code=422, detail="Idempotency-Key must be a lowercase canonical UUID.")

        requested_by_line: dict[UUID, Decimal] = {}
        for item in body.lines:
            requested_by_line[item.line_id] = requested_by_line.get(item.line_id, ZERO) + item.quantity
        canonical_payload = {
            "lines": [
                {"line_id": str(line_id), "quantity": format(quantity.normalize(), "f")}
                for line_id, quantity in sorted(requested_by_line.items(), key=lambda pair: str(pair[0]))
            ]
        }
        request_hash = hashlib.sha256(
            json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

        previous = session.scalars(select(PurchaseReceiptIdempotency).where(
            PurchaseReceiptIdempotency.business_id == business_id,
            PurchaseReceiptIdempotency.purchase_order_id == order_id,
            PurchaseReceiptIdempotency.idempotency_key == idempotency_key,
        ).with_for_update().execution_options(populate_existing=True)).one_or_none()
        if previous is not None:
            if previous.request_hash != request_hash:
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used with a different receipt payload.")
            return previous.response_snapshot

        if po.status not in {"approved", "partially_received"}:
            raise WorkflowError("Purchase order is not available for receiving")
        if not requested_by_line:
            raise WorkflowError("At least one received quantity is required")

        line_ids = list(requested_by_line)
        lines = session.scalars(select(PurchaseOrderLine).where(
            PurchaseOrderLine.id.in_(line_ids),
            PurchaseOrderLine.purchase_order_id == po.id,
            PurchaseOrderLine.business_id == business_id,
        ).order_by(PurchaseOrderLine.id).with_for_update().execution_options(populate_existing=True)).all()
        by_line_id = {line.id: line for line in lines}
        if len(by_line_id) != len(requested_by_line):
            raise WorkflowError("Every receipt line must belong to this purchase order and business")
        for line_id, quantity in requested_by_line.items():
            line = by_line_id[line_id]
            if quantity <= ZERO or line.received_quantity + quantity > line.quantity:
                raise WorkflowError("Received quantity must be positive and cannot exceed ordered quantity")

        product_ids = sorted({line.product_id for line in lines}, key=str)
        products = session.scalars(select(Product).where(
            Product.id.in_(product_ids),
            Product.business_id == business_id,
            Product.is_stock_tracked.is_(True),
        ).order_by(Product.id).with_for_update().execution_options(populate_existing=True)).all()
        by_product_id = {product.id: product for product in products}
        if len(by_product_id) != len(product_ids):
            raise WorkflowError("Every received purchase line must reference a stock-tracked product in this business")

        # Claim the key before stock/audit side effects. The unique database
        # constraint is the final arbiter for concurrent requests using one key.
        receipt_claim = PurchaseReceiptIdempotency(
            business_id=business_id,
            purchase_order_id=po.id,
            idempotency_key=idempotency_key,
            request_hash=request_hash,
            response_snapshot={},
        )
        session.add(receipt_claim)
        session.flush()

        # Lock all lines and products in stable ID order before writing any receipt effects.
        for line in lines:
            quantity = requested_by_line[line.id]
            product = by_product_id[line.product_id]
            line.received_quantity += quantity
            session.add(StockMovement(
                business_id=business_id,
                product_id=product.id,
                movement_type="receipt",
                quantity_delta=quantity,
                reason=f"Purchase order {po.order_number}",
                reference_type="purchase_order",
                reference_id=po.id,
                created_by_subject=principal.subject,
            ))

        all_lines = session.scalars(select(PurchaseOrderLine).where(
            PurchaseOrderLine.purchase_order_id == po.id,
            PurchaseOrderLine.business_id == business_id,
        ).order_by(PurchaseOrderLine.id)).all()
        po.status = "received" if all(line.received_quantity == line.quantity for line in all_lines) else "partially_received"
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="purchase_order.received",
            target_type="purchase_order",
            target_id=str(po.id),
            change_summary=f"Receipt {idempotency_key} applied; {po.status}",
        ))
        session.flush()
        response_snapshot = _dict(po, ("id", "order_number", "status", "total", "currency_code"))
        receipt_claim.response_snapshot = response_snapshot
        session.flush()
        return response_snapshot

    try:
        return _commit(session, op)
    except HTTPException as exc:
        # A concurrent request with the same key may win the unique insert after
        # both transactions observed no prior receipt. Re-read after rollback and
        # replay only when the committed payload hash matches exactly.
        if exc.status_code != 409 or request_hash is None:
            raise
        session.rollback()
        try:
            _authorized(session, principal, business_id, owner_only=True)
        except AuthorizationError as auth_exc:
            raise HTTPException(status_code=403, detail=str(auth_exc)) from auth_exc
        previous = session.scalars(select(PurchaseReceiptIdempotency).where(
            PurchaseReceiptIdempotency.business_id == business_id,
            PurchaseReceiptIdempotency.purchase_order_id == order_id,
            PurchaseReceiptIdempotency.idempotency_key == idempotency_key,
        ).execution_options(populate_existing=True)).one_or_none()
        if previous is None:
            raise
        if previous.request_hash != request_hash:
            raise HTTPException(
                status_code=409,
                detail="Idempotency-Key was already used with a different receipt payload.",
            ) from exc
        return previous.response_snapshot

