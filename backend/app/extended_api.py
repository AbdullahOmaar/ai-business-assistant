"""Additional authorized endpoints for expenses, purchasing, returns, settings and reports.

No endpoint accepts an identity from request data. All business routes fail closed
unless the host has configured a trusted principal resolver and database session.
"""
import csv
import io
import os
import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.data_exchange import CsvValidationError, parse_import_csv
from app.models import (
    AuditEvent, BankAccount, BankReconciliationMatch, BankStatementRow, BusinessSetting, CashRefund, CreditApplication, CreditNote, Customer, Expense, ImportJob, Invoice, InvoiceLine, Notification,
    Payment, PaymentAllocation, PricingRule, Product, PurchaseOrder, PurchaseOrderLine, RecurringInvoiceSchedule,
    SalesReturn, SalesReturnLine, StockMovement, Supplier,
)
from app.security import AuthenticatedPrincipal, AuthorizationError, MembershipRole, authorize_membership
from app.domain_rules import discounted_return_line_total, money, validate_return_amount
from app.services import WorkflowError, create_expense

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["extended workflows"])
ZERO = Decimal("0")


def _validated_schedule_timezone(value: str) -> str:
    """Require an IANA timezone before persisting a recurring schedule."""
    normalized = value.strip()
    try:
        ZoneInfo(normalized)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise WorkflowError("Schedule timezone must be a valid IANA timezone.") from exc
    return normalized


def _validated_setting_key(value: str) -> str:
    """Restrict setting keys to safe identifiers and reject secret-like names."""
    normalized = value.strip()
    if len(normalized) > 100 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", normalized):
        raise WorkflowError("Setting key must be a 1-100 character identifier.")
    compact = re.sub(r"[^a-z0-9]", "", normalized.casefold())
    if any(term in compact for term in (
        "password", "passwd", "pwd", "secret", "apikey", "accesskey",
        "clientkey", "signingkey", "encryptionkey", "token", "privatekey",
        "credential", "authorization", "bearer",
    )):
        raise WorkflowError("Secret values must be stored in a dedicated secret manager.")
    return normalized


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


class SupplierInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)

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
    effective_from: datetime | None = None
    effective_until: datetime | None = None


class SettingInput(BaseModel):
    setting_value: str = Field(max_length=1000)


class BankAccountInput(BaseModel):
    account_key: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=160)
    currency_code: str = Field(min_length=3, max_length=3)


class BankStatementImportInput(BaseModel):
    csv_content: str = Field(min_length=1, max_length=1_000_000)


class BankReconciliationMatchInput(BaseModel):
    statement_row_id: UUID
    payment_id: UUID | None = None
    expense_id: UUID | None = None


class CreditApplicationInput(BaseModel):
    credit_note_id: UUID
    invoice_id: UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    idempotency_key: str = Field(min_length=1, max_length=128)


class CashRefundInput(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    method: str = Field(pattern="^(cash|bank|card|other)$")
    payment_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=128)
    idempotency_key: str = Field(min_length=1, max_length=128)


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


@router.post("/suppliers", status_code=201)
def post_supplier(business_id: UUID, body: SupplierInput,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        name = body.name.strip()
        if not name:
            raise WorkflowError("Supplier name is required")
        item = Supplier(business_id=business_id, name=name,
                        email=body.email.strip() if body.email else None,
                        phone=body.phone.strip() if body.phone else None,
                        address=body.address.strip() if body.address else None,
                        is_active=True)
        session.add(item)
        session.flush()
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="supplier.created", target_type="supplier", target_id=str(item.id)))
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "business_id", "name", "email", "phone", "address", "is_active", "created_at"))

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
        result = []
        for order in orders:
            lines = session.scalars(select(PurchaseOrderLine).where(
                PurchaseOrderLine.business_id == business_id,
                PurchaseOrderLine.purchase_order_id == order.id,
            ).order_by(PurchaseOrderLine.id)).all()
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
        "checked_at": datetime.now(timezone.utc).isoformat(),
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
    invoice_statement = select(
        Invoice.currency_code,
        func.coalesce(func.sum(Invoice.tax_total), 0),
        func.count(Invoice.id),
    ).where(Invoice.business_id == business_id, Invoice.status == "issued")
    if start_date:
        invoice_statement = invoice_statement.where(
            Invoice.issue_date >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        )
    if end_date:
        invoice_statement = invoice_statement.where(
            Invoice.issue_date < datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
        )
    invoice_rows = session.execute(
        invoice_statement.group_by(Invoice.currency_code).order_by(Invoice.currency_code)
    ).all()

    credit_statement = select(
        CreditNote.currency_code,
        func.coalesce(func.sum(CreditNote.tax_total), 0),
        func.count(CreditNote.id),
    ).where(CreditNote.business_id == business_id)
    if start_date:
        credit_statement = credit_statement.where(
            CreditNote.created_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        )
    if end_date:
        credit_statement = credit_statement.where(
            CreditNote.created_at < datetime.combine(end_date + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)
        )
    credit_rows = session.execute(
        credit_statement.group_by(CreditNote.currency_code).order_by(CreditNote.currency_code)
    ).all()

    totals_by_currency: dict[str, dict[str, Decimal | int]] = {}
    for currency, total, count in invoice_rows:
        totals_by_currency[currency] = {
            "invoice_tax_total": money(Decimal(str(total))),
            "credit_note_tax_reversed": ZERO,
            "invoice_count": count,
            "credit_note_count": 0,
        }
    for currency, total, count in credit_rows:
        row = totals_by_currency.setdefault(currency, {
            "invoice_tax_total": ZERO,
            "credit_note_tax_reversed": ZERO,
            "invoice_count": 0,
            "credit_note_count": 0,
        })
        row["credit_note_tax_reversed"] = money(Decimal(str(row["credit_note_tax_reversed"])) + Decimal(str(total)))
        row["credit_note_count"] = int(row["credit_note_count"]) + count

    currencies = []
    for currency in sorted(totals_by_currency):
        row = totals_by_currency[currency]
        invoice_tax = Decimal(str(row["invoice_tax_total"]))
        reversed_tax = Decimal(str(row["credit_note_tax_reversed"]))
        currencies.append({
            "currency_code": currency,
            "invoice_tax_total": str(invoice_tax),
            "credit_note_tax_reversed": str(reversed_tax),
            "tax_total": str(money(invoice_tax - reversed_tax)),
            "invoice_count": int(row["invoice_count"]),
            "credit_note_count": int(row["credit_note_count"]),
        })
    return {
        "period": {"start_date": start_date.isoformat() if start_date else None,
                   "end_date": end_date.isoformat() if end_date else None},
        "source": "issued_invoice_tax_snapshots_minus_issued_credit_note_tax_snapshots",
        "currencies": currencies,
        "limitations": [
            "Uses persisted tax totals from issued invoices and issued credit notes; it does not recalculate historical taxes.",
            "Credit-note tax reversals are dated by credit-note issuance time, not original invoice issue time.",
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
        if not body.lines:
            raise WorkflowError("At least one received quantity is required")
        for item in body.lines:
            if item.quantity <= ZERO:
                raise WorkflowError("Received quantity must be positive")
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


@router.get("/sales-returns")
def list_sales_returns(business_id: UUID, limit: int = Query(default=50, ge=1, le=100),
                       offset: int = Query(default=0, ge=0),
                       status: str | None = Query(default=None, pattern="^(draft|approved|rejected)$"),
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    """List business-scoped sales returns; listing never issues a credit or refunds cash."""
    _authorized(session, principal, business_id)
    statement = select(SalesReturn).where(SalesReturn.business_id == business_id)
    if status is not None:
        statement = statement.where(SalesReturn.status == status)
    returns = session.scalars(
        statement.order_by(SalesReturn.created_at.desc(), SalesReturn.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {
        "items": [_dict(ret, (
            "id", "business_id", "invoice_id", "status", "reason", "total", "tax_total", "created_at",
        )) for ret in returns],
        "limit": limit,
        "offset": offset,
    }


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
            discounted_line_total = discounted_return_line_total(
                invoice_subtotal=invoice.subtotal,
                invoice_discount_total=invoice.discount_total,
                invoice_lines=[(str(row.id), row.line_total) for row in discount_allocation_lines],
                target_line_id=str(line.id),
            )
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
        if invoice.tax_total > ZERO and (
            invoice.tax_rate is None
            or any(line.taxable_amount is None or line.tax_amount is None for line in discount_allocation_lines)
        ):
            raise WorkflowError(
                "This historical tax invoice lacks persisted line-level tax snapshots; its return cannot be approved safely"
            )
        invoice_lines = {}
        previously_returned_quantities: dict[UUID, Decimal] = {}
        previously_returned_taxes: dict[UUID, Decimal] = {}
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
            previously_returned_quantities[invoice_line_id] = Decimal(str(previously_returned_quantity or 0))
            previously_returned_tax = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.tax_amount), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == invoice_line.id,
                SalesReturnLine.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            previously_returned_taxes[invoice_line_id] = Decimal(str(previously_returned_tax or 0))
            previously_returned_amount = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.amount), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == invoice_line.id,
                SalesReturnLine.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            try:
                validate_return_amount(
                    invoiced_amount=discounted_return_line_total(
                        invoice_subtotal=invoice.subtotal,
                        invoice_discount_total=invoice.discount_total,
                        invoice_lines=[(str(row.id), row.line_total) for row in discount_allocation_lines],
                        target_line_id=str(invoice_line.id),
                    ),
                    previously_returned_amount=Decimal(str(previously_returned_amount or 0)),
                    requested_return_amount=requested["amount"],
                )
            except ValueError as exc:
                raise WorkflowError(str(exc)) from exc
            invoice_lines[invoice_line_id] = invoice_line

        # Tax is allocated from immutable source-line tax snapshots. Cumulative
        # rounding ensures partial returns never refund more tax than the sold line.
        current_quantity_by_line: dict[UUID, Decimal] = {}
        current_tax_by_line: dict[UUID, Decimal] = {}
        for returned in sorted(lines, key=lambda item: str(item.id)):
            invoice_line = invoice_lines[returned.invoice_line_id]
            if invoice.tax_total <= ZERO:
                returned.tax_amount = ZERO
                continue
            previous_quantity = previously_returned_quantities.get(returned.invoice_line_id, ZERO)
            previous_tax = previously_returned_taxes.get(returned.invoice_line_id, ZERO)
            quantity_before = current_quantity_by_line.get(returned.invoice_line_id, ZERO)
            tax_before = current_tax_by_line.get(returned.invoice_line_id, ZERO)
            quantity_after = quantity_before + Decimal(str(returned.quantity))
            cumulative_tax = money(
                Decimal(str(invoice_line.tax_amount)) *
                (previous_quantity + quantity_after) / Decimal(str(invoice_line.quantity))
            )
            tax_for_line = money(cumulative_tax - previous_tax - tax_before)
            if tax_for_line < ZERO:
                raise WorkflowError("Calculated return tax cannot be negative")
            returned.tax_amount = tax_for_line
            current_quantity_by_line[returned.invoice_line_id] = quantity_after
            current_tax_by_line[returned.invoice_line_id] = tax_before + tax_for_line

        ret.tax_total = money(sum((Decimal(str(line.tax_amount or ZERO)) for line in lines), ZERO))
        ret.total = money(sum(
            (Decimal(str(line.amount)) + Decimal(str(line.tax_amount or ZERO)) for line in lines),
            ZERO,
        ))

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
    return _dict(ret, ("id", "invoice_id", "status", "total", "tax_total", "created_at"))


@router.post("/sales-returns/{return_id}/credit-note", status_code=201)
def issue_credit_note_for_return(business_id: UUID, return_id: UUID,
                                 session: Session = Depends(get_session),
                                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Issue one immutable credit note for an approved return; this does not refund cash."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        existing = session.scalars(select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.sales_return_id == return_id,
        ).with_for_update()).one_or_none()
        if existing is not None:
            return existing

        ret = session.scalars(select(SalesReturn).where(
            SalesReturn.id == return_id,
            SalesReturn.business_id == business_id,
        ).with_for_update()).one_or_none()
        if ret is None or ret.status != "approved":
            raise WorkflowError("Only an approved sales return can be credited")

        # Re-check after locking the return so concurrent retries observe the first committed note.
        existing = session.scalars(select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.sales_return_id == ret.id,
        ).with_for_update()).one_or_none()
        if existing is not None:
            return existing

        invoice = session.scalars(select(Invoice).where(
            Invoice.id == ret.invoice_id,
            Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Credit note must reference an issued invoice")
        if invoice.customer_id is None:
            raise WorkflowError("Credit note requires an invoice linked to a customer")
        return_lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id,
            SalesReturnLine.business_id == business_id,
        )).all()
        source_line_ids = [line.invoice_line_id for line in return_lines]
        source_lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.id.in_(source_line_ids),
        )).all() if source_line_ids else []
        if invoice.tax_total > ZERO and (
            invoice.tax_rate is None
            or ret.tax_total is None
            or any(line.taxable_amount is None or line.tax_amount is None for line in source_lines)
        ):
            raise WorkflowError(
                "Credit note issuance is blocked because the original tax invoice lacks complete line-level tax snapshots"
            )
        subtotal = money(sum((Decimal(str(line.amount)) for line in return_lines), ZERO))
        tax_total = money(Decimal(str(ret.tax_total or ZERO)))
        total = money(subtotal + tax_total)
        if ret.total <= ZERO or total <= ZERO:
            raise WorkflowError("A credit note requires a positive approved return total")
        if money(Decimal(str(ret.total))) != total:
            raise WorkflowError("Approved return total does not reconcile to its persisted line tax allocation")

        note = CreditNote(
            business_id=business_id,
            sales_return_id=ret.id,
            invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            credit_note_number=f"CN-{ret.id.hex[:24].upper()}",
            currency_code=invoice.currency_code,
            subtotal=subtotal,
            tax_total=tax_total,
            total=total,
            created_by_subject=principal.subject,
        )
        session.add(note)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="credit_note.issued",
            target_type="credit_note",
            target_id=str(note.id),
        ))
        session.flush()
        return note

    note = _commit(session, op)

    return _dict(note, (
        "id", "business_id", "sales_return_id", "invoice_id", "customer_id",
        "credit_note_number", "currency_code", "subtotal", "tax_total", "total", "created_by_subject", "created_at",
    ))


@router.get("/credit-notes")
def list_credit_notes(business_id: UUID, limit: int = Query(default=50, ge=1, le=100),
                      offset: int = Query(default=0, ge=0),
                      customer_id: UUID | None = Query(default=None),
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    """List issued credit notes in this business without implying cash refund or ledger netting."""
    _authorized(session, principal, business_id)
    statement = select(CreditNote).where(CreditNote.business_id == business_id)
    if customer_id is not None:
        statement = statement.where(CreditNote.customer_id == customer_id)
    notes = session.scalars(
        statement.order_by(CreditNote.created_at.desc(), CreditNote.id.desc())
        .limit(limit).offset(offset)
    ).all()
    applied_by_note: dict[UUID, Decimal] = {}
    refunded_by_note: dict[UUID, Decimal] = {}
    if notes:
        note_ids = [note.id for note in notes]
        application_rows = session.execute(
            select(
                CreditApplication.credit_note_id,
                func.coalesce(func.sum(CreditApplication.amount), 0),
            ).where(
                CreditApplication.business_id == business_id,
                CreditApplication.credit_note_id.in_(note_ids),
            ).group_by(CreditApplication.credit_note_id)
        ).all()
        applied_by_note = {
            note_id: Decimal(str(amount or ZERO))
            for note_id, amount in application_rows
        }
        refund_rows = session.execute(
            select(
                CashRefund.credit_note_id,
                func.coalesce(func.sum(CashRefund.amount), 0),
            ).where(
                CashRefund.business_id == business_id,
                CashRefund.credit_note_id.in_(note_ids),
            ).group_by(CashRefund.credit_note_id)
        ).all()
        refunded_by_note = {
            note_id: Decimal(str(amount or ZERO))
            for note_id, amount in refund_rows
        }
    items = []
    for note in notes:
        applied = applied_by_note.get(note.id, ZERO)
        refunded = refunded_by_note.get(note.id, ZERO)
        item = _dict(note, (
            "id", "business_id", "sales_return_id", "invoice_id", "customer_id",
            "credit_note_number", "currency_code", "subtotal", "tax_total", "total", "created_by_subject", "created_at",
        ))
        item["applied_total"] = str(applied)
        item["refunded_total"] = str(refunded)
        item["remaining_credit"] = str(max(ZERO, Decimal(str(note.total)) - applied - refunded))
        items.append(item)
    return {"items": items, "limit": limit, "offset": offset}


@router.post("/bank-accounts", status_code=201)
def create_bank_account(
    business_id: UUID, body: BankAccountInput,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        account_key = body.account_key.strip()
        display_name = body.display_name.strip()
        currency = body.currency_code.strip().upper()
        if not account_key or not display_name or not re.fullmatch(r"[A-Z]{3}", currency):
            raise WorkflowError("Account key, display name and ISO-style currency code are required")
        account = BankAccount(
            business_id=business_id, account_key=account_key,
            display_name=display_name, currency_code=currency, is_active=True,
        )
        session.add(account)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="bank_account.created", target_type="bank_account", target_id=str(account.id),
        ))
        session.flush()
        return account
    account = _commit(session, op)
    return _dict(account, ("id", "business_id", "account_key", "display_name", "currency_code", "is_active", "created_at"))


@router.get("/bank-accounts")
def list_bank_accounts(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _authorized(session, principal, business_id)
    accounts = session.scalars(
        select(BankAccount).where(BankAccount.business_id == business_id)
        .order_by(BankAccount.display_name, BankAccount.id)
    ).all()
    return {"items": [_dict(item, ("id", "business_id", "account_key", "display_name", "currency_code", "is_active", "created_at")) for item in accounts]}


@router.post("/bank-accounts/{account_id}/statement-import", status_code=201)
def import_bank_statement(
    business_id: UUID, account_id: UUID, body: BankStatementImportInput,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        account = session.scalars(select(BankAccount).where(
            BankAccount.id == account_id, BankAccount.business_id == business_id,
            BankAccount.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if account is None:
            raise WorkflowError("Active bank account not found in this business")
        reader = csv.DictReader(io.StringIO(body.csv_content))
        required = {"transaction_id", "transaction_date", "description", "amount", "currency_code"}
        if reader.fieldnames is None or not required.issubset(set(reader.fieldnames)):
            raise WorkflowError("CSV headers must include transaction_id, transaction_date, description, amount, currency_code")
        parsed = []
        seen_ids = set()
        for line_number, row in enumerate(reader, start=2):
            external_id = (row.get("transaction_id") or "").strip()
            description = (row.get("description") or "").strip()
            currency = (row.get("currency_code") or "").strip().upper()
            if not external_id or not description or len(external_id) > 160 or len(description) > 500:
                raise WorkflowError(f"Invalid transaction id or description on CSV line {line_number}")
            if external_id in seen_ids:
                raise WorkflowError(f"Duplicate transaction_id inside CSV on line {line_number}")
            seen_ids.add(external_id)
            if currency != account.currency_code:
                raise WorkflowError(f"Currency mismatch on CSV line {line_number}")
            try:
                amount = money(Decimal((row.get("amount") or "").strip()))
                raw_date = (row.get("transaction_date") or "").strip()
                try:
                    occurred_at = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                except ValueError:
                    occurred_at = datetime.combine(date.fromisoformat(raw_date), datetime.min.time(), tzinfo=timezone.utc)
            except (ValueError, ArithmeticError):
                raise WorkflowError(f"Invalid amount or transaction date on CSV line {line_number}")
            if amount == ZERO:
                raise WorkflowError(f"Statement amount cannot be zero on CSV line {line_number}")
            if occurred_at.tzinfo is None:
                occurred_at = occurred_at.replace(tzinfo=timezone.utc)
            parsed.append((external_id, description, currency, amount, occurred_at))
        if not parsed:
            raise WorkflowError("CSV contains no statement transactions")
        existing_ids = set(session.scalars(select(BankStatementRow.external_transaction_id).where(
            BankStatementRow.business_id == business_id,
            BankStatementRow.account_id == account_id,
            BankStatementRow.external_transaction_id.in_([item[0] for item in parsed]),
        )).all())
        created = []
        for external_id, description, currency, amount, occurred_at in parsed:
            if external_id in existing_ids:
                continue
            row = BankStatementRow(
                business_id=business_id, account_id=account_id,
                external_transaction_id=external_id, transaction_date=occurred_at,
                description=description, amount=amount, currency_code=currency,
                status="unmatched",
            )
            session.add(row)
            created.append(row)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="bank_statement.imported", target_type="bank_account",
            target_id=str(account_id),
        ))
        session.flush()
        return {"created": created, "duplicate_count": len(existing_ids), "skipped": len(existing_ids)}
    result = _commit(session, op)
    return {
        "items": [_dict(item, ("id", "business_id", "account_id", "external_transaction_id", "transaction_date", "description", "amount", "currency_code", "status", "imported_at")) for item in result["created"]],
        "created_count": len(result["created"]), "duplicate_count": result["duplicate_count"],
        "skipped": result["skipped"],
    }


@router.get("/bank-statement-rows")
def list_bank_statement_rows(
    business_id: UUID,
    account_id: UUID | None = None,
    status: str | None = Query(default=None, pattern="^(unmatched|matched|ignored)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _authorized(session, principal, business_id)
    statement = select(BankStatementRow).where(BankStatementRow.business_id == business_id)
    if account_id is not None:
        statement = statement.where(BankStatementRow.account_id == account_id)
    if status is not None:
        statement = statement.where(BankStatementRow.status == status)
    rows = session.scalars(
        statement.order_by(BankStatementRow.transaction_date.desc(), BankStatementRow.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {"items": [_dict(item, ("id", "business_id", "account_id", "external_transaction_id", "transaction_date", "description", "amount", "currency_code", "status", "imported_at")) for item in rows], "limit": limit, "offset": offset}


@router.post("/bank-reconciliation/matches", status_code=201)
def match_bank_statement_row(
    business_id: UUID, body: BankReconciliationMatchInput,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        if (body.payment_id is None) == (body.expense_id is None):
            raise WorkflowError("Choose exactly one payment or expense to match")
        row = session.scalars(select(BankStatementRow).where(
            BankStatementRow.id == body.statement_row_id,
            BankStatementRow.business_id == business_id,
        ).with_for_update()).one_or_none()
        if row is None:
            raise WorkflowError("Statement row not found in this business")
        if row.status != "unmatched":
            raise WorkflowError("Only unmatched statement rows can be reconciled")
        if body.payment_id is not None:
            if row.amount <= ZERO:
                raise WorkflowError("Incoming statement rows can only match recorded payments")
            target = session.scalars(select(Payment).where(
                Payment.id == body.payment_id, Payment.business_id == business_id,
            ).with_for_update()).one_or_none()
            if target is None:
                raise WorkflowError("Payment not found in this business")
            if target.currency_code != row.currency_code or money(target.amount) != money(row.amount):
                raise WorkflowError("Payment amount and currency must exactly match the statement row")
            payment_id, expense_id = target.id, None
        else:
            if row.amount >= ZERO:
                raise WorkflowError("Outgoing statement rows can only match recorded expenses")
            target = session.scalars(select(Expense).where(
                Expense.id == body.expense_id, Expense.business_id == business_id,
            ).with_for_update()).one_or_none()
            if target is None:
                raise WorkflowError("Expense not found in this business")
            if target.currency_code != row.currency_code or money(target.amount) != money(abs(row.amount)):
                raise WorkflowError("Expense amount and currency must exactly match the statement row")
            payment_id, expense_id = None, target.id
        match = BankReconciliationMatch(
            business_id=business_id, statement_row_id=row.id,
            payment_id=payment_id, expense_id=expense_id,
            matched_amount=abs(row.amount), matched_by_subject=principal.subject,
        )
        row.status = "matched"
        session.add(match)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="bank_statement.row_matched", target_type="bank_statement_row",
            target_id=str(row.id),
        ))
        session.flush()
        return match
    match = _commit(session, op)
    return _dict(match, ("id", "business_id", "statement_row_id", "payment_id", "expense_id", "matched_amount", "matched_by_subject", "matched_at"))


@router.post("/credit-applications", status_code=201)
def apply_credit_note(business_id: UUID, body: CreditApplicationInput,
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Apply an issued credit note to an eligible receivable; never records a cash refund."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)

        replay = session.scalars(select(CreditApplication).where(
            CreditApplication.business_id == business_id,
            CreditApplication.idempotency_key == body.idempotency_key,
        ).with_for_update()).one_or_none()
        if replay is not None:
            if (
                replay.credit_note_id != body.credit_note_id
                or replay.invoice_id != body.invoice_id
                or Decimal(str(replay.amount)) != money(body.amount)
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency key was already used for a different credit application",
                )
            return replay

        note = session.scalars(select(CreditNote).where(
            CreditNote.id == body.credit_note_id,
            CreditNote.business_id == business_id,
        ).with_for_update()).one_or_none()
        if note is None:
            raise WorkflowError("Credit note not found in this business")

        # Re-check after acquiring the credit-note lock. Concurrent retries can
        # both observe no idempotency row before either transaction owns the note.
        replay = session.scalars(select(CreditApplication).where(
            CreditApplication.business_id == business_id,
            CreditApplication.idempotency_key == body.idempotency_key,
        ).with_for_update()).one_or_none()
        if replay is not None:
            if (
                replay.credit_note_id != body.credit_note_id
                or replay.invoice_id != body.invoice_id
                or Decimal(str(replay.amount)) != money(body.amount)
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency key was already used for a different credit application",
                )
            return replay

        invoice = session.scalars(select(Invoice).where(
            Invoice.id == body.invoice_id,
            Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Credit can only be applied to an issued invoice")
        if invoice.customer_id is None or invoice.customer_id != note.customer_id:
            raise WorkflowError("Credit note and invoice must belong to the same customer")
        if invoice.currency_code.strip().upper() != note.currency_code.strip().upper():
            raise WorkflowError("Credit note and invoice currencies must match")

        amount = money(body.amount)
        if amount <= ZERO:
            raise WorkflowError("Credit application amount must be positive")

        applied_to_note = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(CreditApplication.amount), 0)).where(
                CreditApplication.business_id == business_id,
                CreditApplication.credit_note_id == note.id,
            )
        ) or ZERO))
        refunded_from_note = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(CashRefund.amount), 0)).where(
                CashRefund.business_id == business_id,
                CashRefund.credit_note_id == note.id,
            )
        ) or ZERO))
        note_remaining = money(Decimal(str(note.total)) - applied_to_note - refunded_from_note)
        if amount > note_remaining:
            raise WorkflowError("Credit application exceeds the remaining credit note balance")

        paid_to_invoice = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .select_from(PaymentAllocation)
            .join(
                Payment,
                (Payment.id == PaymentAllocation.payment_id)
                & (Payment.business_id == PaymentAllocation.business_id),
            )
            .where(
                PaymentAllocation.business_id == business_id,
                Payment.business_id == business_id,
                PaymentAllocation.invoice_id == invoice.id,
                func.upper(func.trim(Payment.currency_code))
                == func.upper(func.trim(invoice.currency_code)),
            )
        ) or ZERO))
        applied_to_invoice = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(CreditApplication.amount), 0)).where(
                CreditApplication.business_id == business_id,
                CreditApplication.invoice_id == invoice.id,
            )
        ) or ZERO))
        invoice_remaining = money(Decimal(str(invoice.total)) - paid_to_invoice - applied_to_invoice)
        if amount > invoice_remaining:
            raise WorkflowError("Credit application exceeds the invoice's outstanding receivable")

        application = CreditApplication(
            business_id=business_id,
            credit_note_id=note.id,
            invoice_id=invoice.id,
            amount=amount,
            idempotency_key=body.idempotency_key,
            applied_by_subject=principal.subject,
        )
        session.add(application)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="credit_note.applied",
            target_type="credit_application",
            target_id=str(application.id),
        ))
        session.flush()
        return application

    application = _commit(session, op)
    return _dict(application, (
        "id", "business_id", "credit_note_id", "invoice_id", "amount",
        "idempotency_key", "applied_by_subject", "created_at",
    ))


@router.get("/credit-applications")
def list_credit_applications(
    business_id: UUID,
    credit_note_id: UUID | None = Query(default=None),
    invoice_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List applied credits inside one business; this is not a cash-refund ledger."""
    _authorized(session, principal, business_id)
    statement = select(CreditApplication).where(
        CreditApplication.business_id == business_id
    )
    if credit_note_id is not None:
        statement = statement.where(CreditApplication.credit_note_id == credit_note_id)
    if invoice_id is not None:
        statement = statement.where(CreditApplication.invoice_id == invoice_id)
    items = session.scalars(
        statement.order_by(CreditApplication.created_at.desc(), CreditApplication.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {
        "items": [_dict(item, (
            "id", "business_id", "credit_note_id", "invoice_id", "amount",
            "idempotency_key", "applied_by_subject", "created_at",
        )) for item in items],
        "limit": limit,
        "offset": offset,
    }


@router.post("/credit-notes/{credit_note_id}/refunds", status_code=201)
def create_cash_refund(
    business_id: UUID,
    credit_note_id: UUID,
    body: CashRefundInput,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Record an explicit cash outflow; this is separate from applying credit to receivables."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        clean_reference = body.reference.strip() if body.reference and body.reference.strip() else None
        replay = session.scalars(select(CashRefund).where(
            CashRefund.business_id == business_id,
            CashRefund.idempotency_key == body.idempotency_key,
        ).with_for_update()).one_or_none()
        if replay is not None:
            if (
                replay.credit_note_id != credit_note_id
                or replay.payment_id != body.payment_id
                or Decimal(str(replay.amount)) != money(body.amount)
                or replay.method != body.method
                or replay.reference != clean_reference
            ):
                raise HTTPException(status_code=409, detail="Idempotency key was already used for a different cash refund")
            return replay

        note = session.scalars(select(CreditNote).where(
            CreditNote.id == credit_note_id,
            CreditNote.business_id == business_id,
        ).with_for_update()).one_or_none()
        if note is None:
            raise WorkflowError("Credit note not found in this business")

        # Serialize refund/application decisions against the same credit-note balance.
        replay = session.scalars(select(CashRefund).where(
            CashRefund.business_id == business_id,
            CashRefund.idempotency_key == body.idempotency_key,
        ).with_for_update()).one_or_none()
        if replay is not None:
            if (
                replay.credit_note_id != credit_note_id
                or replay.payment_id != body.payment_id
                or Decimal(str(replay.amount)) != money(body.amount)
                or replay.method != body.method
                or replay.reference != (body.reference.strip() if body.reference else None)
            ):
                raise HTTPException(status_code=409, detail="Idempotency key was already used for a different cash refund")
            return replay

        invoice = session.scalars(select(Invoice).where(
            Invoice.id == note.invoice_id,
            Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Cash refund requires the original issued invoice")
        paid_to_invoice = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .select_from(PaymentAllocation)
            .join(
                Payment,
                (Payment.id == PaymentAllocation.payment_id)
                & (Payment.business_id == PaymentAllocation.business_id),
            )
            .where(
                PaymentAllocation.business_id == business_id,
                Payment.business_id == business_id,
                PaymentAllocation.invoice_id == invoice.id,
                func.upper(func.trim(Payment.currency_code))
                == func.upper(func.trim(invoice.currency_code)),
            )
        ) or ZERO))
        applied_to_invoice = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(CreditApplication.amount), 0)).where(
                CreditApplication.business_id == business_id,
                CreditApplication.invoice_id == invoice.id,
            )
        ) or ZERO))
        if money(Decimal(str(invoice.total)) - paid_to_invoice - applied_to_invoice) > ZERO:
            raise WorkflowError("Cash refunds require the original invoice receivable to be fully settled; apply credit to open receivables instead")

        amount = money(body.amount)
        applied_to_note = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(CreditApplication.amount), 0)).where(
                CreditApplication.business_id == business_id,
                CreditApplication.credit_note_id == note.id,
            )
        ) or ZERO))
        refunded_from_note = Decimal(str(session.scalar(
            select(func.coalesce(func.sum(CashRefund.amount), 0)).where(
                CashRefund.business_id == business_id,
                CashRefund.credit_note_id == note.id,
            )
        ) or ZERO))
        if amount > money(Decimal(str(note.total)) - applied_to_note - refunded_from_note):
            raise WorkflowError("Cash refund exceeds the remaining credit note balance")

        if body.payment_id is not None:
            payment = session.scalars(select(Payment).where(
                Payment.id == body.payment_id,
                Payment.business_id == business_id,
            ).with_for_update()).one_or_none()
            if payment is None:
                raise WorkflowError("Original payment not found in this business")
            if payment.customer_id != note.customer_id:
                raise WorkflowError("Original payment must belong to the credit note customer")
            if payment.currency_code.strip().upper() != note.currency_code.strip().upper():
                raise WorkflowError("Original payment currency must match the credit note")
            linked_to_original_invoice = session.scalar(
                select(func.count()).select_from(PaymentAllocation)
                .join(
                    Invoice,
                    (Invoice.id == PaymentAllocation.invoice_id)
                    & (Invoice.business_id == PaymentAllocation.business_id),
                )
                .where(
                    PaymentAllocation.business_id == business_id,
                    PaymentAllocation.payment_id == payment.id,
                    PaymentAllocation.invoice_id == note.invoice_id,
                    Invoice.business_id == business_id,
                    func.upper(func.trim(Invoice.currency_code))
                    == func.upper(func.trim(payment.currency_code)),
                )
            ) or 0
            if not linked_to_original_invoice:
                raise WorkflowError("Original payment must be allocated to the credit note's invoice")
            allocated = Decimal(str(session.scalar(
                select(func.coalesce(func.sum(PaymentAllocation.amount), 0))
                .select_from(PaymentAllocation)
                .join(
                    Invoice,
                    (Invoice.id == PaymentAllocation.invoice_id)
                    & (Invoice.business_id == PaymentAllocation.business_id),
                )
                .where(
                    PaymentAllocation.business_id == business_id,
                    PaymentAllocation.payment_id == payment.id,
                    Invoice.business_id == business_id,
                    func.upper(func.trim(Invoice.currency_code))
                    == func.upper(func.trim(payment.currency_code)),
                )
            ) or ZERO))
            previously_refunded = Decimal(str(session.scalar(
                select(func.coalesce(func.sum(CashRefund.amount), 0)).where(
                    CashRefund.business_id == business_id,
                    CashRefund.payment_id == payment.id,
                )
            ) or ZERO))
            unallocated_cash = money(Decimal(str(payment.amount)) - allocated - previously_refunded)
            if amount > unallocated_cash:
                raise WorkflowError("Cash refund exceeds the original payment's unallocated balance")

        refund = CashRefund(
            business_id=business_id,
            credit_note_id=note.id,
            payment_id=body.payment_id,
            amount=amount,
            method=body.method,
            reference=clean_reference,
            idempotency_key=body.idempotency_key,
            refunded_by_subject=principal.subject,
        )
        session.add(refund)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="cash_refund.created", target_type="cash_refund", target_id=str(refund.id),
        ))
        session.flush()
        return refund

    refund = _commit(session, op)
    return _dict(refund, (
        "id", "business_id", "credit_note_id", "payment_id", "amount",
        "method", "reference", "idempotency_key", "refunded_by_subject", "created_at",
    ))


@router.get("/cash-refunds")
def list_cash_refunds(
    business_id: UUID,
    credit_note_id: UUID | None = Query(default=None),
    payment_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List explicit cash outflows within the current business."""
    _authorized(session, principal, business_id)
    statement = select(CashRefund).where(CashRefund.business_id == business_id)
    if credit_note_id is not None:
        statement = statement.where(CashRefund.credit_note_id == credit_note_id)
    if payment_id is not None:
        statement = statement.where(CashRefund.payment_id == payment_id)
    items = session.scalars(
        statement.order_by(CashRefund.created_at.desc(), CashRefund.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {
        "items": [_dict(item, (
            "id", "business_id", "credit_note_id", "payment_id", "amount",
            "method", "reference", "idempotency_key", "refunded_by_subject", "created_at",
        )) for item in items],
        "limit": limit,
        "offset": offset,
    }


@router.post("/recurring-invoices", status_code=201)
def post_recurring_schedule(business_id: UUID, body: ScheduleInput,
                             session: Session = Depends(get_session),
                             principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        # Recurring schedules can trigger future financial documents; OWNER approval is required.
        _authorized(session, principal, business_id, owner_only=True)
        schedule_timezone = _validated_schedule_timezone(body.timezone)
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
            interval_days=body.interval_days, timezone=schedule_timezone,
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
        effective_from = body.effective_from or datetime.now(timezone.utc)
        effective_until = body.effective_until
        if effective_from.tzinfo is None or (effective_until is not None and effective_until.tzinfo is None):
            raise WorkflowError("Pricing rule effective dates must include a timezone")
        if effective_until is not None and effective_until <= effective_from:
            raise WorkflowError("Pricing rule effective_until must be later than effective_from")
        rule = PricingRule(
            business_id=business_id, name=body.name.strip(), rule_type=body.rule_type,
            rate=body.rate, is_active=True, effective_from=effective_from,
            effective_until=effective_until,
        )
        session.add(rule)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="pricing_rule.created", target_type="pricing_rule"))
        session.flush()
        return rule
    item = _commit(session, op)
    return _dict(item, ("id", "business_id", "name", "rule_type", "rate", "is_active", "effective_from", "effective_until", "created_at"))


@router.get("/pricing-rules")
def get_pricing_rules(
    business_id: UUID,
    rule_type: str | None = Query(default=None, pattern="^(tax|discount)$"),
    as_of: datetime | None = None,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _authorized(session, principal, business_id)
    effective_at = as_of or datetime.now(timezone.utc)
    if effective_at.tzinfo is None:
        raise HTTPException(status_code=422, detail="as_of must include a timezone")
    statement = select(PricingRule).where(
        PricingRule.business_id == business_id,
        PricingRule.is_active.is_(True),
        PricingRule.effective_from <= effective_at,
        or_(PricingRule.effective_until.is_(None), PricingRule.effective_until > effective_at),
    )
    if rule_type is not None:
        statement = statement.where(PricingRule.rule_type == rule_type)
    items = session.scalars(statement.order_by(PricingRule.rule_type, PricingRule.name, PricingRule.id)).all()
    return {"items": [_dict(item, (
        "id", "business_id", "name", "rule_type", "rate", "is_active",
        "effective_from", "effective_until", "created_at",
    )) for item in items], "as_of": effective_at}


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
        safe_key = _validated_setting_key(setting_key)
        item = session.scalars(select(BusinessSetting).where(
            BusinessSetting.business_id == business_id,
            BusinessSetting.setting_key == safe_key,
        ).with_for_update()).one_or_none()
        if item is None:
            item = BusinessSetting(business_id=business_id, setting_key=safe_key,
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
    first_customer_email_row: dict[str, int] = {}
    existing_skus: set[str] = set()
    existing_customer_emails: set[str] = set()
    if entity_type == "customers":
        emails = [
            row.get("email", "").strip().casefold()
            for row in rows if row.get("email", "").strip()
        ]
        if emails:
            existing_customer_emails = {
                value.strip().casefold()
                for value in session.scalars(select(Customer.email).where(
                    Customer.business_id == business_id, Customer.email.is_not(None),
                    func.lower(Customer.email).in_(emails),
                )).all() if value
            }
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
            email = row.get("email", "").strip()
            key = email.casefold()
            if key:
                if key in first_customer_email_row:
                    errors.append({"row": index, "field": "email", "code": "duplicate_in_file",
                                   "first_row": first_customer_email_row[key]})
                else:
                    first_customer_email_row[key] = index
                if key in existing_customer_emails:
                    errors.append({"row": index, "field": "email", "code": "already_exists"})
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
            term = f"%{q.strip()}%"
            statement = statement.where(or_(
                Customer.name.ilike(term),
                Customer.email.ilike(term),
                Customer.phone.ilike(term),
            ))
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
                              "subtotal", "discount_total", "tax_total", "tax_rate", "total", "issue_date",
                              "due_date", "notes", "created_at")),
            "lines": [_dict(line, ("id", "product_id", "description", "quantity",
                                   "unit_price", "line_total", "taxable_amount", "tax_amount")) for line in lines],
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
        allocation_rows = session.execute(
            select(PaymentAllocation.invoice_id, func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .select_from(PaymentAllocation)
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
                func.upper(func.trim(Payment.currency_code))
                == func.upper(func.trim(Invoice.currency_code)),
            )
            .group_by(PaymentAllocation.invoice_id)
        ).all()
        allocated_by_invoice = {
            invoice_id: Decimal(str(amount or ZERO))
            for invoice_id, amount in allocation_rows
        }
        credit_rows = session.execute(
            select(CreditApplication.invoice_id, func.coalesce(func.sum(CreditApplication.amount), 0))
            .where(CreditApplication.business_id == business_id)
            .group_by(CreditApplication.invoice_id)
        ).all()
        credits_by_invoice = {
            invoice_id: Decimal(str(amount or ZERO))
            for invoice_id, amount in credit_rows
        }
        result = []
        for invoice in items:
            row = _dict(invoice, ("id", "invoice_number", "customer_id", "status", "currency_code",
                                  "subtotal", "discount_total", "tax_total", "tax_rate", "total", "issue_date", "created_at"))
            allocated = allocated_by_invoice.get(invoice.id, ZERO)
            applied_credits = credits_by_invoice.get(invoice.id, ZERO)
            outstanding = max(
                ZERO, Decimal(str(invoice.total)) - allocated - applied_credits
            ) if invoice.status == "issued" else ZERO
            row["allocated_payments"] = str(allocated)
            row["applied_credits"] = str(applied_credits)
            row["outstanding_amount"] = str(outstanding)
            result.append(row)
        return result
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

        credit_rows = session.execute(
            select(CreditApplication.invoice_id, func.coalesce(func.sum(CreditApplication.amount), 0))
            .where(CreditApplication.business_id == business_id)
            .group_by(CreditApplication.invoice_id)
        ).all()
        credits_by_invoice = {
            invoice_id: Decimal(str(amount or ZERO))
            for invoice_id, amount in credit_rows
        }

        bucket_totals: dict[str, dict[str, Decimal]] = {}
        invoice_rows = []
        data_quality_warnings = []
        for invoice in invoices:
            total = Decimal(str(invoice.total or ZERO))
            paid = allocated_by_invoice.get(invoice.id, ZERO)
            applied_credits = credits_by_invoice.get(invoice.id, ZERO)
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

            outstanding = total - paid - applied_credits
            if outstanding < ZERO:
                data_quality_warnings.append({
                    "invoice_id": str(invoice.id),
                    "invoice_number": invoice.invoice_number,
                    "type": (
                        "allocations_exceed_invoice_total"
                        if paid > total
                        else "credits_and_payments_exceed_invoice_total"
                    ),
                    "invoice_currency": invoice.currency_code,
                    "invoice_total": str(total),
                    "allocated_payments": str(paid),
                    "applied_credits": str(applied_credits),
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
                "applied_credits": str(applied_credits),
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
            "source": "issued invoices minus matching-currency payment allocations and applied credit notes",
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
                "Currency-mismatched payment allocations are listed as warnings and never reduce receivables.",
                "Applied credit notes reduce receivables; they are not cash refunds.",
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
    """Return a currency-separated customer statement with invoice, payment and applied-credit events."""
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
                same_currency = payment.currency_code.strip().upper() == invoice.currency_code.strip().upper()
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

        if invoice_ids:
            credit_rows = session.execute(
                select(CreditApplication, CreditNote, Invoice)
                .join(
                    CreditNote,
                    (CreditNote.id == CreditApplication.credit_note_id)
                    & (CreditNote.business_id == CreditApplication.business_id),
                )
                .join(
                    Invoice,
                    (Invoice.id == CreditApplication.invoice_id)
                    & (Invoice.business_id == CreditApplication.business_id),
                )
                .where(
                    CreditApplication.business_id == business_id,
                    CreditNote.business_id == business_id,
                    Invoice.business_id == business_id,
                    Invoice.customer_id == customer_id,
                    CreditApplication.invoice_id.in_(invoice_ids),
                )
            ).all()
            for application, note, invoice in credit_rows:
                occurred_at = application.created_at
                if occurred_at is None:
                    continue
                occurred_date = occurred_at.date()
                if from_date is not None and occurred_date < from_date:
                    continue
                if to_date is not None and occurred_date > to_date:
                    continue
                events.append({
                    "occurred_at": occurred_at,
                    "event_type": "credit_application",
                    "source_id": str(application.id),
                    "reference": note.credit_note_number,
                    "invoice_id": str(invoice.id),
                    "currency_code": invoice.currency_code,
                    "debit": ZERO,
                    "credit": application.amount,
                    "affects_balance": True,
                })

        if invoice_ids:
            refund_rows = session.execute(
                select(CashRefund, CreditNote)
                .join(
                    CreditNote,
                    (CreditNote.id == CashRefund.credit_note_id)
                    & (CreditNote.business_id == CashRefund.business_id),
                )
                .where(
                    CashRefund.business_id == business_id,
                    CreditNote.business_id == business_id,
                    CreditNote.customer_id == customer_id,
                    CreditNote.invoice_id.in_(invoice_ids),
                )
            ).all()
            for refund, note in refund_rows:
                occurred_at = refund.created_at
                if occurred_at is None:
                    continue
                occurred_date = occurred_at.date()
                if from_date is not None and occurred_date < from_date:
                    continue
                if to_date is not None and occurred_date > to_date:
                    continue
                events.append({
                    "occurred_at": occurred_at,
                    "event_type": "cash_refund",
                    "source_id": str(refund.id),
                    "reference": refund.reference or f"Cash refund ({refund.method})",
                    "invoice_id": str(note.invoice_id),
                    "currency_code": note.currency_code,
                    "debit": ZERO,
                    "credit": ZERO,
                    "affects_balance": False,
                    "refund_amount": str(refund.amount),
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
                "An issued credit note reduces receivables only when an explicit credit application is recorded.",
                "Cash refunds are shown as separate informational events and do not change receivable balances a second time.",
                "Allocations with a currency mismatch are shown but do not change the running balance.",
                "Balances represent issued invoices less matching-currency payments and applied credits, not a double-entry general ledger.",
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

@router.get("/reports/data-integrity")
def report_data_integrity(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Read-only OWNER report for legacy invoice/customer and payment-allocation inconsistencies."""
    try:
        authorize_membership(
            session,
            principal=principal,
            business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
        unlinked = select(Invoice).where(
            Invoice.business_id == business_id,
            Invoice.status == "issued",
            Invoice.customer_id.is_(None),
        )
        unlinked_total = session.scalar(
            select(func.count()).select_from(unlinked.subquery())
        ) or 0
        unlinked_items = session.scalars(
            unlinked.order_by(Invoice.created_at.desc(), Invoice.id.desc())
            .offset(offset).limit(limit)
        ).all()

        allocation_join = (
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
        )
        currency_mismatches = allocation_join.where(
            Payment.currency_code != Invoice.currency_code,
        )
        currency_mismatch_total = session.scalar(
            select(func.count()).select_from(currency_mismatches.subquery())
        ) or 0
        currency_mismatch_rows = session.execute(
            currency_mismatches
            .order_by(Payment.received_at.desc(), PaymentAllocation.id.desc())
            .offset(offset).limit(limit)
        ).all()

        customer_mismatches = allocation_join.where(
            Payment.customer_id.is_not(None),
            Invoice.customer_id.is_not(None),
            Payment.customer_id != Invoice.customer_id,
        )
        customer_mismatch_total = session.scalar(
            select(func.count()).select_from(customer_mismatches.subquery())
        ) or 0
        customer_mismatch_rows = session.execute(
            customer_mismatches
            .order_by(Payment.received_at.desc(), PaymentAllocation.id.desc())
            .offset(offset).limit(limit)
        ).all()

        def allocation_item(allocation, payment, invoice):
            return {
                "allocation_id": str(allocation.id),
                "payment_id": str(payment.id),
                "payment_reference": payment.reference,
                "payment_customer_id": str(payment.customer_id) if payment.customer_id else None,
                "payment_currency": payment.currency_code,
                "invoice_id": str(invoice.id),
                "invoice_number": invoice.invoice_number,
                "invoice_customer_id": str(invoice.customer_id) if invoice.customer_id else None,
                "invoice_currency": invoice.currency_code,
                "allocated_amount": str(allocation.amount),
            }

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "read_only": True,
            "unlinked_issued_invoices": {
                "total": int(unlinked_total),
                "items": [
                    {
                        "invoice_id": str(item.id),
                        "invoice_number": item.invoice_number,
                        "status": item.status,
                        "total": str(item.total),
                        "currency_code": item.currency_code,
                        "created_at": item.created_at.isoformat() if item.created_at else None,
                    }
                    for item in unlinked_items
                ],
            },
            "currency_mismatched_allocations": {
                "total": int(currency_mismatch_total),
                "items": [allocation_item(*row) for row in currency_mismatch_rows],
            },
            "customer_mismatched_allocations": {
                "total": int(customer_mismatch_total),
                "items": [allocation_item(*row) for row in customer_mismatch_rows],
            },
            "limit": limit,
            "offset": offset,
            "warning": (
                "This report identifies records for manual review only. It never guesses "
                "customer links or modifies invoices, payments, or allocations."
            ),
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
