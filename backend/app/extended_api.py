"""Additional authorized endpoints for expenses, purchasing, returns, settings and reports.

No endpoint accepts an identity from request data. All business routes fail closed
unless the host has configured a trusted principal resolver and database session.
"""
import csv
import io
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.data_exchange import CsvValidationError, parse_import_csv
from app.models import (
    AuditEvent, BusinessSetting, Customer, Expense, ImportJob, Invoice, InvoiceLine, Notification,
    Payment, PaymentAllocation, PricingRule, Product, PurchaseOrder, PurchaseOrderLine, RecurringInvoiceSchedule,
    SalesReturn, SalesReturnLine, StockMovement, Supplier,
)
from app.security import AuthenticatedPrincipal, AuthorizationError, MembershipRole, authorize_membership
from app.domain_rules import money, validate_return_amount
from app.services import WorkflowError, create_expense

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["extended workflows"])
ZERO = Decimal("0")


def _receivable_aging_bucket(due_date: date | None, as_of: date) -> tuple[str, int | None]:
    """Return an aging bucket without silently treating missing due dates as current."""
    if due_date is None:
        return "no_due_date", None
    days_overdue = (as_of - due_date).days
    if days_overdue <= 0:
        return "not_due", days_overdue
    if days_overdue <= 30:
        return "1_30_days", days_overdue
    if days_overdue <= 60:
        return "31_60_days", days_overdue
    if days_overdue <= 90:
        return "61_90_days", days_overdue
    return "over_90_days", days_overdue

def _receivable_outstanding(total: Decimal, allocated: Decimal) -> tuple[Decimal, bool]:
    """Return the balance and flag allocations that exceed an invoice total."""
    outstanding = total - allocated
    return outstanding, outstanding < ZERO


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


class CustomerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    sku: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    is_stock_tracked: bool | None = None


class NotificationInput(BaseModel):
    kind: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=1000)
    deduplication_key: str = Field(min_length=1, max_length=160)
    scheduled_at: datetime | None = None


def _discounted_return_line_total(
    invoice: Invoice, line: InvoiceLine, invoice_lines: list[InvoiceLine]
) -> Decimal:
    """Allocate the invoice's net subtotal across lines in cents using largest remainder.

    The allocation reconciles exactly to the lesser of the stored invoice net subtotal
    and the sum of rounded line totals, preventing multi-line rounding from authorizing
    a return larger than the customer was invoiced for.
    """
    gross_cents = {str(item.id): max(0, int(money(Decimal(str(item.line_total))) * 100))
                   for item in invoice_lines}
    gross_total_cents = sum(gross_cents.values())
    subtotal_cents = max(0, int(money(Decimal(str(invoice.subtotal or ZERO))) * 100))
    discount_cents = max(0, int(money(Decimal(str(invoice.discount_total or ZERO))) * 100))
    net_cents = min(gross_total_cents, max(0, subtotal_cents - min(discount_cents, subtotal_cents)))
    if gross_total_cents <= 0 or net_cents <= 0:
        return ZERO
    shares: dict[str, int] = {}
    remainders: list[tuple[int, str]] = []
    for item in invoice_lines:
        key = str(item.id)
        numerator = net_cents * gross_cents[key]
        shares[key] = numerator // gross_total_cents
        remainders.append((numerator % gross_total_cents, key))
    cents_left = net_cents - sum(shares.values())
    for _, key in sorted(remainders, key=lambda pair: (-pair[0], pair[1]))[:cents_left]:
        shares[key] += 1
    return Decimal(shares.get(str(line.id), 0)) / 100


def _authorized(
    session: Session, principal: AuthenticatedPrincipal, business_id: UUID,
    *, owner_only: bool = False,
) -> None:
    authorize_membership(
        session, principal=principal, business_id=business_id,
        allowed_roles={MembershipRole.OWNER} if owner_only else None,
    )


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
            total += money(line.quantity * line.unit_cost)
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
        _authorized(session, principal, business_id, owner_only=True)
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
        discount_allocation_lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        ).order_by(InvoiceLine.id)).all()
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
            discounted_line_total = _discounted_return_line_total(invoice, line, discount_allocation_lines)
            amount = money(discounted_line_total * item.quantity / line.quantity)
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
        _authorized(session, principal, business_id, owner_only=True)
        ret = session.scalars(select(SalesReturn).where(
            SalesReturn.id == return_id, SalesReturn.business_id == business_id,
        ).with_for_update()).one_or_none()
        if ret is None or ret.status != "draft":
            raise WorkflowError("Only draft returns can be approved")
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Sales return must reference an issued invoice")
        lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id, SalesReturnLine.business_id == business_id,
        )).all()

        # Group duplicate line entries and lock the invoice header first. Concurrent
        # approvals for the same invoice then serialize before checking approved returns.
        requested_by_line: dict[UUID, dict[str, Decimal]] = {}
        for returned in lines:
            requested = requested_by_line.setdefault(
                returned.invoice_line_id, {"quantity": ZERO, "amount": ZERO}
            )
            requested["quantity"] += returned.quantity
            requested["amount"] += returned.amount

        discount_allocation_lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        ).order_by(InvoiceLine.id)).all()
        invoice_lines = {}
        for invoice_line_id, requested in sorted(
            requested_by_line.items(), key=lambda item: str(item[0])
        ):
            invoice_line = session.scalars(select(InvoiceLine).where(
                InvoiceLine.id == invoice_line_id,
                InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.business_id == business_id,
            ).with_for_update()).one_or_none()
            if invoice_line is None:
                raise WorkflowError("Return line must reference a line on the original invoice")
            previously_returned_quantity = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.quantity), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == invoice_line.id,
                SalesReturnLine.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            if Decimal(str(previously_returned_quantity or 0)) + requested["quantity"] > invoice_line.quantity:
                raise WorkflowError("Return quantity exceeds the invoiced quantity remaining")
            previously_returned_amount = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.amount), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == invoice_line.id,
                SalesReturnLine.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            try:
                validate_return_amount(
                    invoiced_amount=_discounted_return_line_total(invoice, invoice_line, discount_allocation_lines),
                    previously_returned_amount=Decimal(str(previously_returned_amount or 0)),
                    requested_return_amount=requested["amount"],
                )
            except ValueError as exc:
                raise WorkflowError(str(exc)) from exc
            invoice_lines[invoice_line_id] = invoice_line

        for returned in lines:
            invoice_line = invoice_lines[returned.invoice_line_id]
            if invoice_line.product_id:
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
        # Recurring schedules can trigger future financial documents; OWNER approval is required.
        _authorized(session, principal, business_id, owner_only=True)
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
        _authorized(session, principal, business_id, owner_only=True)
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
        # Notifications may trigger downstream delivery; keep creation OWNER-only until roles are explicit.
        _authorized(session, principal, business_id, owner_only=True)
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
        _authorized(session, principal, business_id, owner_only=True)
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
        _authorized(session, principal, business_id, owner_only=True)
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



def _validate_import_rows(session: Session, business_id: UUID, entity_type: str,
                          rows: list[dict[str, str]]) -> list[dict]:
    errors: list[dict] = []
    first_sku_row: dict[str, int] = {}
    existing_skus: set[str] = set()
    if entity_type == "products":
        skus = [row.get("sku", "").strip().casefold() for row in rows if row.get("sku", "").strip()]
        if skus:
            existing_skus = {value.casefold() for value in session.scalars(select(Product.sku).where(
                Product.business_id == business_id, Product.sku.is_not(None),
                func.lower(Product.sku).in_(skus),
            )).all() if value}
    for index, row in enumerate(rows, start=2):
        if entity_type == "customers":
            limits = {"name": 160, "email": 254, "phone": 32, "address": 500, "notes": 1000}
            for field, limit in limits.items():
                if len(row.get(field, "")) > limit:
                    errors.append({"row": index, "field": field, "code": "too_long", "max_length": limit})
            if not row.get("name", "").strip():
                errors.append({"row": index, "field": "name", "code": "required"})
        elif entity_type == "products":
            limits = {"sku": 80, "name": 160, "description": 1000, "unit": 32}
            for field, limit in limits.items():
                if len(row.get(field, "")) > limit:
                    errors.append({"row": index, "field": field, "code": "too_long", "max_length": limit})
            if not row.get("name", "").strip():
                errors.append({"row": index, "field": "name", "code": "required"})
            try:
                price = Decimal(row.get("unit_price", ""))
                if not price.is_finite() or price < ZERO or price.as_tuple().exponent < -2 or price.adjusted() > 11 or len(price.as_tuple().digits) > 14:
                    raise ValueError()
            except Exception:
                errors.append({"row": index, "field": "unit_price", "code": "invalid_decimal"})
            tracked = row.get("is_stock_tracked", "").lower()
            if tracked not in {"true", "false", "1", "0", "yes", "no", ""}:
                errors.append({"row": index, "field": "is_stock_tracked", "code": "invalid_boolean"})
            sku = row.get("sku", "").strip()
            key = sku.casefold()
            if key:
                if key in first_sku_row:
                    errors.append({"row": index, "field": "sku", "code": "duplicate_in_file",
                                   "first_row": first_sku_row[key]})
                else:
                    first_sku_row[key] = index
                if key in existing_skus:
                    errors.append({"row": index, "field": "sku", "code": "already_exists"})
        elif entity_type == "expenses":
            limits = {"category": 80, "description": 500, "currency_code": 3,
                      "vendor_name": 160, "reference": 128}
            for field, limit in limits.items():
                if len(row.get(field, "")) > limit:
                    errors.append({"row": index, "field": field, "code": "too_long", "max_length": limit})
            try:
                amount = Decimal(row.get("amount", ""))
                if not amount.is_finite() or amount <= ZERO or amount.as_tuple().exponent < -2 or amount.adjusted() > 11 or len(amount.as_tuple().digits) > 14:
                    raise ValueError()
            except Exception:
                errors.append({"row": index, "field": "amount", "code": "invalid_decimal"})
            currency = row.get("currency_code", "").upper()
            if len(currency) != 3 or not currency.isalpha():
                errors.append({"row": index, "field": "currency_code", "code": "invalid_currency"})
            try:
                datetime.fromisoformat(row.get("incurred_at", "").replace("Z", "+00:00"))
            except ValueError:
                errors.append({"row": index, "field": "incurred_at", "code": "invalid_datetime"})
    return errors


@router.post("/imports/{entity_type}.csv/preview")
def preview_import_csv(business_id: UUID, entity_type: str,
                       csv_text: str = Body(media_type="text/csv", max_length=5 * 1024 * 1024),
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        if entity_type not in {"customers", "products"}:
            raise WorkflowError("CSV import supports customers and products only")
        try:
            rows = parse_import_csv(csv_text, entity_type=entity_type)
        except CsvValidationError as exc:
            raise WorkflowError(str(exc)) from exc
        if not rows:
            raise WorkflowError("CSV must contain at least one data row")
        errors = _validate_import_rows(session, business_id, entity_type, rows)
        return {"entity_type": entity_type, "row_count": len(rows), "valid": not errors,
                "errors": errors, "write_performed": False}
    return _commit(session, op)


@router.post("/imports/{entity_type}.csv", status_code=202)
def import_csv(business_id: UUID, entity_type: str,
               csv_text: str = Body(media_type="text/csv", max_length=2_000_000),
               session: Session = Depends(get_session),
               principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Atomically import a small CSV batch. Large files belong in a background job."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        schemas = {
            "customers": {"name", "email", "phone", "address", "notes"},
            "products": {"name", "sku", "description", "unit", "unit_price", "is_stock_tracked"},
        }
        if entity_type not in schemas:
            raise WorkflowError("CSV import supports customers and products only")
        allowed = schemas[entity_type]
        try:
            rows = parse_import_csv(csv_text, entity_type=entity_type)
        except CsvValidationError as exc:
            raise WorkflowError(str(exc)) from exc
        if not rows:
            raise WorkflowError("CSV must contain at least one data row")
        errors = _validate_import_rows(session, business_id, entity_type, rows)
        if errors:
            raise WorkflowError("CSV validation failed: " + "; ".join(
                f"row {item['row']} {item['field']} {item['code']}" for item in errors
            ))
        if len(rows) > 2000:
            raise WorkflowError("A single import is limited to 2000 rows")
        job = ImportJob(business_id=business_id, job_type="import",
                        entity_type=entity_type, status="processing", row_count=0)
        session.add(job)
        session.flush()
        for index, row in enumerate(rows, start=2):
            clean = row
            if set(clean) - allowed:
                raise WorkflowError(f"Unsupported column at CSV row {index}")
            if not clean.get("name"):
                raise WorkflowError(f"Name is required at CSV row {index}")
            if entity_type == "customers":
                session.add(Customer(
                    business_id=business_id, name=clean["name"],
                    email=clean.get("email") or None, phone=clean.get("phone") or None,
                    address=clean.get("address") or None, notes=clean.get("notes") or None,
                ))
            else:
                try:
                    price = Decimal(clean.get("unit_price", "0") or "0")
                except Exception as exc:
                    raise WorkflowError(f"Invalid unit_price at CSV row {index}") from exc
                if price < ZERO:
                    raise WorkflowError(f"Negative unit_price at CSV row {index}")
                tracked_text = clean.get("is_stock_tracked", "false").lower()
                if tracked_text not in {"true", "false", "1", "0", "yes", "no", ""}:
                    raise WorkflowError(f"Invalid is_stock_tracked at CSV row {index}")
                session.add(Product(
                    business_id=business_id, name=clean["name"], unit_price=price,
                    sku=clean.get("sku") or None, description=clean.get("description") or None,
                    unit=clean.get("unit") or "unit",
                    is_stock_tracked=tracked_text in {"true", "1", "yes"},
                ))
        job.status = "completed"
        job.row_count = len(rows)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="data_import.completed", target_type="import_job", target_id=str(job.id),
            change_summary=f"{entity_type}: {len(rows)} rows"))
        session.flush()
        return job
    job = _commit(session, op)
    return _dict(job, ("id", "job_type", "entity_type", "status", "row_count", "created_at"))





@router.get("/customers")
def list_customers(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                   offset: int = Query(default=0, ge=0), q: str = Query(default="", max_length=120),
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        statement = select(Customer).where(
            Customer.business_id == business_id, Customer.is_active.is_(True)
        )
        if q.strip():
            statement = statement.where(Customer.name.ilike(f"%{q.strip()}%"))
        items = session.scalars(statement.order_by(Customer.name).offset(offset).limit(limit)).all()
        return [_dict(x, ("id", "name", "email", "phone", "address", "notes", "created_at")) for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/customers/{customer_id}")
def get_customer(business_id: UUID, customer_id: UUID,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        item = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        )).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        return _dict(item, ("id", "name", "email", "phone", "address", "notes", "created_at"))
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.patch("/customers/{customer_id}")
def patch_customer(business_id: UUID, customer_id: UUID, body: CustomerPatch,
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        item = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        changes = body.model_dump(exclude_unset=True)
        if not changes:
            raise WorkflowError("At least one customer field must be provided")
        for key, value in changes.items():
            if key == "name":
                value = value.strip() if value else ""
                if not value:
                    raise WorkflowError("Customer name is required")
            elif isinstance(value, str):
                value = value.strip() or None
            setattr(item, key, value)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="customer.updated", target_type="customer", target_id=str(item.id)))
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "name", "email", "phone", "address", "notes", "created_at"))


@router.delete("/customers/{customer_id}", status_code=204)
def deactivate_customer(business_id: UUID, customer_id: UUID,
                        session: Session = Depends(get_session),
                        principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        item = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        item.is_active = False
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="customer.deactivated", target_type="customer", target_id=str(item.id)))
        session.flush()
    _commit(session, op)
    return Response(status_code=204)


@router.get("/products")
def list_products(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Product).where(
            Product.business_id == business_id, Product.is_active.is_(True)
        ).order_by(Product.name).offset(offset).limit(limit)).all()
        result = []
        for item in items:
            stock = session.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_id, StockMovement.product_id == item.id))
            row = _dict(item, ("id", "name", "sku", "description", "unit", "unit_price",
                               "is_stock_tracked", "created_at"))
            row["stock_quantity"] = str(stock or ZERO) if item.is_stock_tracked else None
            result.append(row)
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/products/{product_id}")
def get_product(business_id: UUID, product_id: UUID,
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        )).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        stock = session.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.business_id == business_id, StockMovement.product_id == item.id
        ))
        row = _dict(item, ("id", "name", "sku", "description", "unit", "unit_price",
                           "is_stock_tracked", "created_at"))
        row["stock_quantity"] = str(stock or ZERO) if item.is_stock_tracked else None
        return row
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.patch("/products/{product_id}")
def patch_product(business_id: UUID, product_id: UUID, body: ProductPatch,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        changes = body.model_dump(exclude_unset=True)
        if not changes:
            raise WorkflowError("At least one product field must be provided")
        # Price and stock-tracking changes affect financial/inventory controls.
        sensitive_fields = {"unit_price", "is_stock_tracked"}
        _authorized(session, principal, business_id,
                    owner_only=bool(sensitive_fields.intersection(changes)))
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        if changes.get("is_stock_tracked") is False and item.is_stock_tracked:
            movement_count = session.scalar(select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id, StockMovement.product_id == item.id
            ))
            if movement_count:
                raise WorkflowError("Stock tracking cannot be disabled after stock movements exist")
        for key, value in changes.items():
            if value is None and key in {"name", "unit", "unit_price", "is_stock_tracked"}:
                raise WorkflowError(f"{key} cannot be null")
            if isinstance(value, str):
                value = value.strip() or None
            if key == "name" and not value:
                raise WorkflowError("Product name is required")
            if key == "unit" and not value:
                raise WorkflowError("Product unit is required")
            setattr(item, key, value)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="product.updated", target_type="product", target_id=str(item.id)))
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "name", "sku", "description", "unit", "unit_price",
                        "is_stock_tracked", "is_active", "created_at"))


@router.delete("/products/{product_id}", status_code=204)
def deactivate_product(business_id: UUID, product_id: UUID,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        item.is_active = False
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="product.deactivated", target_type="product", target_id=str(item.id)))
        session.flush()
    _commit(session, op)
    return Response(status_code=204)


@router.get("/payments")
def list_payments(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Payment).where(
            Payment.business_id == business_id
        ).order_by(Payment.received_at.desc()).offset(offset).limit(limit)).all()
        result = []
        for item in items:
            allocations = session.scalars(select(PaymentAllocation).where(
                PaymentAllocation.business_id == business_id,
                PaymentAllocation.payment_id == item.id,
            )).all()
            result.append({
                **_dict(item, ("id", "customer_id", "amount", "currency_code", "received_at",
                               "method", "reference", "idempotency_key")),
                "allocations": [_dict(x, ("invoice_id", "amount")) for x in allocations],
            })
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/expenses")
def list_expenses(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Expense).where(
            Expense.business_id == business_id
        ).order_by(Expense.incurred_at.desc()).offset(offset).limit(limit)).all()
        return [_dict(x, ("id", "category", "description", "amount", "currency_code",
                          "incurred_at", "vendor_name", "reference", "created_at")) for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/invoices/{invoice_id}")
def get_invoice(business_id: UUID, invoice_id: UUID,
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == invoice_id, Invoice.business_id == business_id,
        )).one_or_none()
        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id, InvoiceLine.business_id == business_id
        )).all()
        return {
            **_dict(invoice, ("id", "invoice_number", "customer_id", "status", "currency_code",
                              "subtotal", "discount_total", "tax_total", "total", "issue_date",
                              "due_date", "notes", "created_at")),
            "lines": [_dict(line, ("id", "product_id", "description", "quantity",
                                   "unit_price", "line_total")) for line in lines],
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/invoices")
def list_invoices(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Invoice).where(
            Invoice.business_id == business_id
        ).order_by(Invoice.created_at.desc()).offset(offset).limit(limit)).all()
        return [_dict(x, ("id", "invoice_number", "customer_id", "status", "currency_code",
                          "subtotal", "discount_total", "tax_total", "total", "issue_date", "created_at"))
                for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc



@router.get("/reports/receivables-aging")
def receivables_aging(
    business_id: UUID,
    as_of: date | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Return open issued-invoice balances by currency without cross-currency netting."""
    try:
        _authorized(session, principal, business_id)
        report_date = as_of or datetime.now(timezone.utc).date()
        invoices = session.scalars(
            select(Invoice).where(
                Invoice.business_id == business_id,
                Invoice.status == "issued",
            ).order_by(
                Invoice.currency_code, Invoice.due_date, Invoice.invoice_number
            )
        ).all()

        # Join on both record IDs and workspace IDs so corrupt cross-workspace links
        # cannot influence this business's balances.
        allocation_rows = session.execute(
            select(PaymentAllocation, Payment, Invoice)
            .join(
                Payment,
                (Payment.id == PaymentAllocation.payment_id)
                & (Payment.business_id == PaymentAllocation.business_id),
            )
            .join(
                Invoice,
                (Invoice.id == PaymentAllocation.invoice_id)
                & (Invoice.business_id == PaymentAllocation.business_id),
            )
            .where(
                PaymentAllocation.business_id == business_id,
                Payment.business_id == business_id,
                Invoice.business_id == business_id,
                Invoice.status == "issued",
            )
        ).all()
        allocated_by_invoice: dict[UUID, Decimal] = {}
        mismatched_by_invoice: dict[UUID, dict[str, Decimal]] = {}
        for allocation, payment, invoice in allocation_rows:
            payment_currency = payment.currency_code.strip().upper()
            invoice_currency = invoice.currency_code.strip().upper()
            amount = Decimal(str(allocation.amount))
            if payment_currency == invoice_currency:
                allocated_by_invoice[invoice.id] = (
                    allocated_by_invoice.get(invoice.id, ZERO) + amount
                )
            else:
                # Never add values in different currencies into one numeric total.
                currency_totals = mismatched_by_invoice.setdefault(invoice.id, {})
                currency_totals[payment_currency] = currency_totals.get(
                    payment_currency, ZERO
                ) + amount

        bucket_totals: dict[str, dict[str, Decimal]] = {}
        invoice_rows = []
        data_quality_warnings = []
        for invoice in invoices:
            total = Decimal(str(invoice.total or ZERO))
            paid = allocated_by_invoice.get(invoice.id, ZERO)
            mismatched = mismatched_by_invoice.get(invoice.id, {})
            if mismatched:
                mismatch_details = "; ".join(
                    f"{amount} {currency}"
                    for currency, amount in sorted(mismatched.items())
                )
                data_quality_warnings.append({
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "type": "payment_currency_mismatch",
                    "invoice_currency": invoice.currency_code,
                    "mismatched_allocations_amount": mismatch_details,
                })

            outstanding, overallocated = _receivable_outstanding(total, paid)
            if overallocated:
                data_quality_warnings.append({
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "type": "allocations_exceed_invoice_total",
                    "invoice_currency": invoice.currency_code,
                    "invoice_total": str(total),
                    "allocated_payments": str(paid),
                    "excess_allocated": str(abs(outstanding)),
                })
                # A credit/excess allocation is a data-quality issue, not a negative
                # receivable. Keep it out of all positive aging-bucket totals.
                continue
            if outstanding <= ZERO:
                # Fully settled invoices do not contribute to open receivables aging.
                continue

            due_day = invoice.due_date.date() if invoice.due_date is not None else None
            bucket, days_overdue = _receivable_aging_bucket(due_day, report_date)
            currency = invoice.currency_code
            bucket_totals.setdefault(currency, {})
            bucket_totals[currency][bucket] = (
                bucket_totals[currency].get(bucket, ZERO) + outstanding
            )
            invoice_rows.append({
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "customer_id": str(invoice.customer_id) if invoice.customer_id else None,
                "currency_code": currency,
                "due_date": due_day.isoformat() if due_day else None,
                "invoice_total": str(total),
                "allocated_payments": str(paid),
                "outstanding_amount": str(outstanding),
                "aging_bucket": bucket,
                "days_overdue": days_overdue,
                "customer_link_missing": invoice.customer_id is None,
            })

        summaries = []
        for currency, buckets in sorted(bucket_totals.items()):
            summaries.append({
                "currency_code": currency,
                "buckets": [
                    {"bucket": name, "outstanding_amount": str(buckets[name])}
                    for name in (
                        "not_due", "1_30_days", "31_60_days", "61_90_days",
                        "over_90_days", "no_due_date",
                    )
                    if buckets.get(name, ZERO) > ZERO
                ],
                "total_outstanding": str(sum(buckets.values(), ZERO)),
            })
        return {
            "as_of_date": report_date.isoformat(),
            "source": "issued invoices minus matching-currency payment allocations",
            "currency_policy": (
                "Payment allocations reduce an invoice only when their currency matches; "
                "different currencies are never combined."
            ),
            "invoice_count": len(invoice_rows),
            "by_currency": summaries,
            "invoices": invoice_rows,
            "data_quality_warnings": data_quality_warnings,
            "limitations": [
                "Only issued invoices with a positive remaining balance appear in aging buckets; drafts and void invoices are excluded.",
                "Fully settled invoices are excluded from open receivables aging.",
                "Overallocated invoices are excluded from receivable balances and shown as positive-excess data-quality warnings.",
                "Invoices without due dates are reported separately and are not assumed current.",
                "Legacy invoices without customer links are flagged for review, not auto-corrected.",
                "Currency-mismatched allocations are listed as warnings and never reduce receivables.",
                "This is an accounts-receivable aging report, not net profit or a full general ledger.",
            ],
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/assistant/insights")
def assistant_insights(business_id: UUID,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Deterministic, read-only insights grounded in stored data; no external AI call."""
    try:
        _authorized(session, principal, business_id)
        invoice_rows = session.execute(select(
            Invoice.currency_code, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)
        ).where(Invoice.business_id == business_id, Invoice.status == "issued")
         .group_by(Invoice.currency_code)).all()
        expense_rows = session.execute(select(
            Expense.currency_code, func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)
        ).where(Expense.business_id == business_id).group_by(Expense.currency_code)).all()
        low_stock = []
        tracked = session.scalars(select(Product).where(
            Product.business_id == business_id, Product.is_active.is_(True),
            Product.is_stock_tracked.is_(True),
        )).all()
        for product in tracked:
            quantity = Decimal(str(session.scalar(select(func.coalesce(
                func.sum(StockMovement.quantity_delta), 0
            )).where(StockMovement.business_id == business_id,
                     StockMovement.product_id == product.id)) or 0))
            if quantity <= ZERO:
                low_stock.append({"product_id": str(product.id), "name": product.name,
                                  "stock_quantity": str(quantity)})
        insights = []
        if not invoice_rows:
            insights.append({"type": "info", "message": "No issued invoices are recorded yet."})
        if low_stock:
            insights.append({"type": "attention", "message": f"{len(low_stock)} tracked products have zero or negative calculated stock; review stock movements."})
        if not expense_rows:
            insights.append({"type": "info", "message": "No expenses are recorded yet."})
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "database-derived deterministic rules",
            "issued_sales_by_currency": [{"currency_code": c, "count": n, "total": str(total)} for c,n,total in invoice_rows],
            "expenses_by_currency": [{"currency_code": c, "count": n, "total": str(total)} for c,n,total in expense_rows],
            "stock_attention": low_stock,
            "insights": insights,
            "limitations": ["This is not an external generative AI response.", "Sales and expenses are not netted into profit.", "Currencies are never combined."]
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/customers/{customer_id}/statement")
def customer_statement(
    business_id: UUID,
    customer_id: UUID,
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Return a currency-separated customer statement from issued invoices and payment allocations.

    Credit notes are not represented by a dedicated ledger model yet, so this endpoint
    explicitly reports that limitation rather than treating sales returns as cash credits.
    """
    try:
        _authorized(session, principal, business_id)
        if from_date is not None and to_date is not None and from_date > to_date:
            raise HTTPException(status_code=422, detail="from_date must be on or before to_date")
        customer = session.scalars(select(Customer).where(
            Customer.id == customer_id,
            Customer.business_id == business_id,
            Customer.is_active.is_(True),
        )).one_or_none()
        if customer is None:
            raise HTTPException(status_code=404, detail="Customer not found")

        invoices = session.scalars(select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.customer_id == customer_id,
            Invoice.status == "issued",
        )).all()
        invoice_ids = [item.id for item in invoices]
        events: list[dict] = []
        for item in invoices:
            occurred_at = item.issue_date or item.created_at
            if occurred_at is None:
                continue
            occurred_date = occurred_at.date()
            if from_date is not None and occurred_date < from_date:
                continue
            if to_date is not None and occurred_date > to_date:
                continue
            events.append({
                "occurred_at": occurred_at,
                "event_type": "invoice_issued",
                "source_id": str(item.id),
                "reference": item.invoice_number,
                "currency_code": item.currency_code,
                "debit": item.total,
                "credit": ZERO,
                "affects_balance": True,
            })

        if invoice_ids:
            allocations = session.execute(
                select(PaymentAllocation, Payment, Invoice)
                .join(Payment, Payment.id == PaymentAllocation.payment_id)
                .join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
                .where(
                    PaymentAllocation.business_id == business_id,
                    Payment.business_id == business_id,
                    Invoice.business_id == business_id,
                    Invoice.customer_id == customer_id,
                    PaymentAllocation.invoice_id.in_(invoice_ids),
                )
            ).all()
            for allocation, payment, invoice in allocations:
                occurred_at = payment.received_at or allocation.created_at
                if occurred_at is None:
                    continue
                occurred_date = occurred_at.date()
                if from_date is not None and occurred_date < from_date:
                    continue
                if to_date is not None and occurred_date > to_date:
                    continue
                same_currency = payment.currency_code == invoice.currency_code
                events.append({
                    "occurred_at": occurred_at,
                    "event_type": "payment_allocation" if same_currency else "currency_mismatch_allocation",
                    "source_id": str(allocation.id),
                    "reference": payment.reference,
                    "invoice_id": str(invoice.id),
                    "currency_code": invoice.currency_code if same_currency else payment.currency_code,
                    "debit": ZERO,
                    "credit": allocation.amount,
                    "affects_balance": same_currency,
                })

        events.sort(key=lambda event: (event["occurred_at"], event["event_type"], event["source_id"]))
        running: dict[str, Decimal] = {}
        for event in events:
            currency = event["currency_code"]
            running.setdefault(currency, ZERO)
            if event["affects_balance"]:
                running[currency] += event["debit"] - event["credit"]
            event["balance"] = running[currency]
            event["occurred_at"] = event["occurred_at"].isoformat()
            for key in ("debit", "credit", "balance"):
                event[key] = str(event[key])

        total = len(events)
        return {
            "customer": {"id": str(customer.id), "name": customer.name},
            "items": events[offset:offset + limit],
            "total": total,
            "limit": limit,
            "offset": offset,
            "balances_by_currency": {currency: str(balance) for currency, balance in running.items()},
            "limitations": [
                "Credit notes are not implemented in the current data model and are excluded.",
                "Approved sales returns are not treated as receivable credits until a credit-note ledger exists.",
                "Allocations with a currency mismatch are shown but do not change the running balance.",
                "Balances represent issued invoices less matching-currency allocations, not a double-entry general ledger.",
            ],
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/audit-events")
def list_audit_events(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None, min_length=1, max_length=80),
    target_type: str | None = Query(default=None, min_length=1, max_length=80),
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Read a paginated business audit trail; only workspace owners may view it."""
    try:
        authorize_membership(
            session,
            principal=principal,
            business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
        if start_at is not None and end_at is not None and start_at > end_at:
            raise HTTPException(status_code=422, detail="start_at must be earlier than or equal to end_at")
        statement = select(AuditEvent).where(AuditEvent.business_id == business_id)
        if action is not None:
            statement = statement.where(AuditEvent.action == action)
        if target_type is not None:
            statement = statement.where(AuditEvent.target_type == target_type)
        if start_at is not None:
            statement = statement.where(AuditEvent.created_at >= start_at)
        if end_at is not None:
            statement = statement.where(AuditEvent.created_at <= end_at)
        total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0
        items = session.scalars(
            statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
            .offset(offset).limit(limit)
        ).all()
        return {
            "items": [
                {
                    "id": str(item.id),
                    "business_id": str(item.business_id),
                    "actor_subject": item.actor_subject,
                    "action": item.action,
                    "target_type": item.target_type,
                    "target_id": item.target_id,
                    "change_summary": item.change_summary,
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                }
                for item in items
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


