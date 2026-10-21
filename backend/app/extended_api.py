"""Additional authorized endpoints for expenses, purchasing, returns, settings and reports.

No endpoint accepts an identity from request data. All business routes fail closed
unless the host has configured a trusted principal resolver and database session.
"""
import csv
import io
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import (
    AuditEvent, BusinessSetting, Expense, Invoice, InvoiceLine, Notification,
    PricingRule, Product, PurchaseOrder, PurchaseOrderLine, RecurringInvoiceSchedule,
    SalesReturn, SalesReturnLine, StockMovement, Supplier,
)
from app.security import AuthenticatedPrincipal, AuthorizationError, authorize_membership
from app.services import WorkflowError, create_expense

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["extended workflows"])
ZERO = Decimal("0")


class ExpenseInput(BaseModel):
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=500)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency_code: str = Field(min_length=3, max_length=3)
    incurred_at: datetime
    vendor_name: str | None = Field(default=None, max_length=160)
    reference: str | None = Field(default=None, max_length=128)


class PurchaseLineInput(BaseModel):
    product_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class PurchaseOrderInput(BaseModel):
    supplier_id: UUID
    order_number: str = Field(min_length=1, max_length=64)
    currency_code: str = Field(min_length=3, max_length=3)
    lines: list[PurchaseLineInput] = Field(min_length=1, max_length=300)


class ReceiveLineInput(BaseModel):
    line_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)


class ReceivePurchaseInput(BaseModel):
    lines: list[ReceiveLineInput] = Field(min_length=1, max_length=300)


class ReturnLineInput(BaseModel):
    invoice_line_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)


class ReturnInput(BaseModel):
    invoice_id: UUID
    reason: str | None = Field(default=None, max_length=500)
    lines: list[ReturnLineInput] = Field(min_length=1, max_length=300)


class ScheduleInput(BaseModel):
    customer_id: UUID | None = None
    interval_days: int = Field(gt=0, le=3650)
    timezone: str = Field(default="UTC", min_length=1, max_length=64)
    next_run_at: datetime


class PricingRuleInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    rule_type: str = Field(pattern="^(tax|discount)$")
    rate: Decimal = Field(ge=0, le=100, max_digits=7, decimal_places=4)


class SettingInput(BaseModel):
    setting_value: str = Field(max_length=1000)


class NotificationInput(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=1000)
    deduplication_key: str = Field(min_length=1, max_length=160)
    scheduled_at: datetime | None = None


def _authorized(session: Session, principal: AuthenticatedPrincipal, business_id: UUID) -> None:
    authorize_membership(session, principal=principal, business_id=business_id)


def _commit(session: Session, action):
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


def _dict(obj, fields):
    out = {}
    for key in fields:
        value = getattr(obj, key, None)
        out[key] = value.isoformat() if isinstance(value, datetime) else (
            str(value) if isinstance(value, (UUID, Decimal)) else value
        )
    return out


@router.post("/expenses", status_code=201)
def post_expense(business_id: UUID, body: ExpenseInput,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    item = _commit(session, lambda: create_expense(
        session, principal=principal, business_id=business_id, **body.model_dump()))
    return _dict(item, ("id", "business_id", "category", "description", "amount",
                        "currency_code", "incurred_at", "vendor_name", "reference", "created_at"))


@router.post("/purchase-orders", status_code=201)
def post_purchase_order(business_id: UUID, body: PurchaseOrderInput,
                        session: Session = Depends(get_session),
                        principal: AuthenticatedPrincipal = Depends(get_principal)):
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
                           order_number=body.order_number.strip(), status="approved",
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
            total += (line.quantity * line.unit_cost).quantize(Decimal("0.01"))
            session.add(PurchaseOrderLine(
                business_id=business_id, purchase_order_id=po.id, product_id=product.id,
                quantity=line.quantity, unit_cost=line.unit_cost, received_quantity=ZERO,
            ))
        po.total = total
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="purchase_order.created", target_type="purchase_order",
            target_id=str(po.id), change_summary=f"Approved order {po.order_number}"))
        session.flush()
        return po
    po = _commit(session, op)
    return _dict(po, ("id", "business_id", "supplier_id", "order_number", "status",
                      "currency_code", "total", "created_at"))


@router.post("/purchase-orders/{order_id}/receive")
def receive_purchase_order(business_id: UUID, order_id: UUID, body: ReceivePurchaseInput,
                           session: Session = Depends(get_session),
                           principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        po = session.scalars(select(PurchaseOrder).where(
            PurchaseOrder.id == order_id, PurchaseOrder.business_id == business_id,
        ).with_for_update()).one_or_none()
        if po is None or po.status not in {"approved", "partially_received"}:
            raise WorkflowError("Purchase order is not available for receiving")
        for item in body.lines:
            line = session.scalars(select(PurchaseOrderLine).where(
                PurchaseOrderLine.id == item.line_id,
                PurchaseOrderLine.purchase_order_id == po.id,
                PurchaseOrderLine.business_id == business_id,
            ).with_for_update()).one_or_none()
            if line is None or line.received_quantity + item.quantity > line.quantity:
                raise WorkflowError("Received quantity exceeds ordered quantity or line is invalid")
            product = session.scalars(select(Product).where(
                Product.id == line.product_id, Product.business_id == business_id,
                Product.is_stock_tracked.is_(True),
            ).with_for_update()).one_or_none()
            if product is None:
                raise WorkflowError("Stock-tracked product not found")
            line.received_quantity += item.quantity
            session.add(StockMovement(
                business_id=business_id, product_id=product.id, movement_type="receipt",
                quantity_delta=item.quantity, reason=f"Purchase order {po.order_number}",
                reference_type="purchase_order", reference_id=po.id,
                created_by_subject=principal.subject,
            ))
        lines = session.scalars(select(PurchaseOrderLine).where(
            PurchaseOrderLine.purchase_order_id == po.id,
            PurchaseOrderLine.business_id == business_id,
        )).all()
        po.status = "received" if all(x.received_quantity == x.quantity for x in lines) else "partially_received"
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="purchase_order.received", target_type="purchase_order", target_id=str(po.id)))
        session.flush()
        return po
    po = _commit(session, op)
    return _dict(po, ("id", "order_number", "status", "total", "currency_code"))


@router.post("/sales-returns", status_code=201)
def post_sales_return(business_id: UUID, body: ReturnInput,
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == body.invoice_id, Invoice.business_id == business_id,
            Invoice.status == "issued",
        )).one_or_none()
        if invoice is None:
            raise WorkflowError("Issued invoice not found in this business")
        ret = SalesReturn(business_id=business_id, invoice_id=invoice.id,
                          status="draft", reason=body.reason, total=ZERO)
        session.add(ret)
        session.flush()
        total = ZERO
        for item in body.lines:
            line = session.scalars(select(InvoiceLine).where(
                InvoiceLine.id == item.invoice_line_id, InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.business_id == business_id,
            )).one_or_none()
            if line is None:
                raise WorkflowError("Return line must reference a line on the original invoice")
            previously_returned = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.quantity), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == line.id, SalesReturn.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            if Decimal(str(previously_returned or 0)) + item.quantity > line.quantity:
                raise WorkflowError("Return quantity exceeds the invoiced quantity remaining")
            amount = (line.unit_price * item.quantity).quantize(Decimal("0.01"))
            total += amount
            session.add(SalesReturnLine(business_id=business_id, sales_return_id=ret.id,
                invoice_line_id=line.id, quantity=item.quantity, amount=amount))
        ret.total = total
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="sales_return.created", target_type="sales_return", target_id=str(ret.id)))
        session.flush()
        return ret
    ret = _commit(session, op)
    return _dict(ret, ("id", "business_id", "invoice_id", "status", "reason", "total", "created_at"))


@router.post("/sales-returns/{return_id}/approve")
def approve_sales_return(business_id: UUID, return_id: UUID,
                         session: Session = Depends(get_session),
                         principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        ret = session.scalars(select(SalesReturn).where(
            SalesReturn.id == return_id, SalesReturn.business_id == business_id,
        ).with_for_update()).one_or_none()
        if ret is None or ret.status != "draft":
            raise WorkflowError("Only draft returns can be approved")
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
        )).one_or_none()
        lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id, SalesReturnLine.business_id == business_id,
        )).all()
        for returned in lines:
            invoice_line = session.scalars(select(InvoiceLine).where(
                InvoiceLine.id == returned.invoice_line_id,
                InvoiceLine.business_id == business_id,
            )).one_or_none()
            if invoice_line and invoice_line.product_id:
                product = session.scalars(select(Product).where(
                    Product.id == invoice_line.product_id, Product.business_id == business_id,
                    Product.is_stock_tracked.is_(True),
                ).with_for_update()).one_or_none()
                if product:
                    session.add(StockMovement(business_id=business_id, product_id=product.id,
                        movement_type="return", quantity_delta=returned.quantity,
                        reason=f"Approved sales return {ret.id}", reference_type="sales_return",
                        reference_id=ret.id, created_by_subject=principal.subject))
        ret.status = "approved"
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="sales_return.approved", target_type="sales_return", target_id=str(ret.id)))
        session.flush()
        return ret
    ret = _commit(session, op)
    return _dict(ret, ("id", "invoice_id", "status", "total", "created_at"))


@router.post("/recurring-invoices", status_code=201)
def post_recurring_schedule(business_id: UUID, body: ScheduleInput,
                             session: Session = Depends(get_session),
                             principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        if body.customer_id is not None and session.scalars(select(Invoice).where(
            Invoice.business_id == business_id, Invoice.customer_id == body.customer_id,
        ).limit(1)).first() is None:
            # Customer existence is verified separately; it need not already have an invoice.
            from app.models import Customer
            customer = session.scalars(select(Customer).where(
                Customer.id == body.customer_id, Customer.business_id == business_id,
                Customer.is_active.is_(True),
            )).one_or_none()
            if customer is None:
                raise WorkflowError("Customer not found in this business")
        schedule = RecurringInvoiceSchedule(
            business_id=business_id, customer_id=body.customer_id,
            interval_days=body.interval_days, timezone=body.timezone,
            next_run_at=body.next_run_at, is_active=True,
        )
        session.add(schedule)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="recurring_invoice_schedule.created", target_type="recurring_invoice_schedule"))
        session.flush()
        return schedule
    item = _commit(session, op)
    return _dict(item, ("id", "business_id", "customer_id", "interval_days",
                        "timezone", "next_run_at", "is_active", "created_at"))


@router.post("/pricing-rules", status_code=201)
def post_pricing_rule(business_id: UUID, body: PricingRuleInput,
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        rule = PricingRule(business_id=business_id, name=body.name.strip(),
                           rule_type=body.rule_type, rate=body.rate, is_active=True)
        session.add(rule)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="pricing_rule.created", target_type="pricing_rule"))
        session.flush()
        return rule
    item = _commit(session, op)
    return _dict(item, ("id", "business_id", "name", "rule_type", "rate", "is_active", "created_at"))


@router.post("/notifications", status_code=201)
def post_notification(business_id: UUID, body: NotificationInput,
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        item = Notification(business_id=business_id, kind=body.kind, title=body.title,
            body=body.body, deduplication_key=body.deduplication_key,
            scheduled_at=body.scheduled_at, status="pending")
        session.add(item)
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "business_id", "kind", "title", "body", "status",
                        "deduplication_key", "scheduled_at", "created_at"))


@router.get("/notifications")
def list_notifications(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Notification).where(
            Notification.business_id == business_id).order_by(
            Notification.created_at.desc()).limit(limit)).all()
        return [_dict(x, ("id", "kind", "title", "body", "status", "scheduled_at", "created_at")) for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.put("/settings/{setting_key}")
def put_setting(business_id: UUID, setting_key: str, body: SettingInput,
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        if setting_key.lower() in {"password", "secret", "api_key", "token", "private_key"}:
            raise WorkflowError("Secret values must be stored in a dedicated secret manager")
        item = session.scalars(select(BusinessSetting).where(
            BusinessSetting.business_id == business_id,
            BusinessSetting.setting_key == setting_key,
        ).with_for_update()).one_or_none()
        if item is None:
            item = BusinessSetting(business_id=business_id, setting_key=setting_key,
                                   setting_value=body.setting_value)
            session.add(item)
        else:
            item.setting_value = body.setting_value
            item.updated_at = datetime.now(timezone.utc)
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "setting_key", "setting_value", "updated_at"))


@router.get("/reports/summary")
def report_summary(business_id: UUID,
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        invoices = session.execute(select(Invoice.currency_code, func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.business_id == business_id, Invoice.status == "issued"
        ).group_by(Invoice.currency_code)).all()
        expenses = session.execute(select(Expense.currency_code, func.count(Expense.id),
            func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.business_id == business_id
        ).group_by(Expense.currency_code)).all()
        return {
            "issued_invoices_by_currency": [
                {"currency_code": currency, "count": count, "total": str(total)}
                for currency, count, total in invoices
            ],
            "expenses_by_currency": [
                {"currency_code": currency, "count": count, "total": str(total)}
                for currency, count, total in expenses
            ],
            "note": "Currency totals are intentionally not combined. These figures are totals, not profit or cash balance."
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/exports/{entity_type}.csv")
def export_csv(business_id: UUID, entity_type: str,
               session: Session = Depends(get_session),
               principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        supported = {
            "customers": ("customers", ("id", "name", "email", "phone", "address", "created_at")),
            "products": ("products", ("id", "sku", "name", "unit", "unit_price", "is_stock_tracked", "created_at")),
            "expenses": ("expenses", ("id", "category", "description", "amount", "currency_code", "incurred_at", "vendor_name", "reference")),
        }
        if entity_type not in supported:
            raise HTTPException(status_code=404, detail="Unsupported export entity")
        from app.models import Customer
        model_name, columns = supported[entity_type]
        model = {"customers": Customer, "products": Product, "expenses": Expense}[entity_type]
        rows = session.scalars(select(model).where(model.business_id == business_id)).all()
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow(columns)
        for row in rows:
            values = []
            for col in columns:
                value = getattr(row, col)
                if isinstance(value, datetime):
                    value = value.isoformat()
                elif isinstance(value, UUID):
                    value = str(value)
                elif isinstance(value, Decimal):
                    value = format(value, "f")
                text_value = "" if value is None else str(value)
                if text_value.startswith(("=", "+", "-", "@", "\t", "\r")):
                    text_value = "'" + text_value
                values.append(text_value)
            writer.writerow(values)
        return Response(content=buffer.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="{entity_type}.csv"'})
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
