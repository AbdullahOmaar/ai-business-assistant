"""Additional authorized endpoints for expenses, purchasing, returns, settings and reports.

No endpoint accepts an identity from request data. All business routes fail closed
unless the host has configured a trusted principal resolver and database session.
"""
import csv
import hashlib
import io
import json
import os
import re
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import (
    Numeric,
    String,
    case,
    cast,
    func,
    literal,
    or_,
    select,
    text,
    union_all,
)
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core_features_api import _day_bounds
from app.data_exchange import CsvValidationError, parse_import_csv, spreadsheet_safe
from app.dependencies import get_principal, get_session
from app.domain_rules import discounted_return_line_total, money, validate_return_amount
from app.models import (
    AuditEvent,
    Business,
    BusinessSetting,
    CashboxClosing,
    CashboxEntry,
    CreditNote,
    Customer,
    Employee,
    Expense,
    ImportJob,
    Invoice,
    InvoiceLine,
    Notification,
    Payment,
    PaymentAllocation,
    PricingRule,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseReceiptIdempotency,
    RecurringInvoiceSchedule,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
    Supplier,
)
from app.rate_limit import rate_limit
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    MembershipRole,
    apply_expense_visibility,
    authorize_membership,
)
from app.services import WorkflowError, create_expense
from app.transport_settings import transport_enabled

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["extended workflows"])
ZERO = Decimal(0)


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

def _payable_classify(status: str) -> tuple[bool, bool]:
    """Classify a purchase order for the payables report: (counts as
    ordered/committed, counts as received). Drafts are neither — they
    commit nothing yet. Cancelled orders are excluded by the query,
    not by this helper."""
    if status in ("approved", "partially_received", "received"):
        return True, status in ("partially_received", "received")
    return False, False


def _payable_outstanding(received: Decimal, paid: Decimal) -> tuple[Decimal, bool]:
    """Outstanding supplier balance: received goods minus supplier
    payments. No supplier-payment records exist yet (see
    docs/FINANCIAL_DEPTH_AUDIT.md), so paid is always zero today;
    the parameter exists so the day payments land the same helper
    still holds. Overpayment is flagged, never hidden."""
    outstanding = received - paid
    return outstanding, paid > received


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


class CashboxEntryInput(BaseModel):
    kind: str = Field(pattern="^(opening|deposit|withdrawal)$")
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency_code: str = Field(min_length=3, max_length=3)
    reason: str = Field(min_length=1, max_length=500)
    reference: str | None = Field(default=None, max_length=128)


class CashboxCloseInput(BaseModel):
    currency_code: str = Field(min_length=3, max_length=3)
    counted_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    handed_by: str = Field(min_length=1, max_length=255)
    received_by: str = Field(min_length=1, max_length=255)
    note: str | None = Field(default=None, max_length=500)
    closed_date: date | None = None


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
    # 3A-920 step 3: the second selling unit + its factor (company data;
    # null clears the pair — the merged validation lives in patch_product).
    second_unit_name: str | None = Field(default=None, max_length=32)
    conversion_factor: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=3)
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
):
    return authorize_membership(
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


def _cashbox_signed_amount(kind: str, amount: Decimal) -> Decimal:
    """Signed contribution of one cashbox entry to the balance."""
    return -amount if kind == "withdrawal" else amount


def _cashbox_balance(entries) -> Decimal:
    """The cashbox balance is computed from signed entries, never stored."""
    total = ZERO
    for entry in entries:
        total += _cashbox_signed_amount(entry.kind, Decimal(str(entry.amount or ZERO)))
    return total


def _cashbox_entries_for(session: Session, business_id: UUID, currency_code: str):
    return session.scalars(select(CashboxEntry).where(
        CashboxEntry.business_id == business_id,
        CashboxEntry.currency_code == currency_code,
    )).all()


@router.post("/cashbox/entries", status_code=201)
def post_cashbox_entry(business_id: UUID, body: CashboxEntryInput,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Record one physical-cash movement (C3, 3A-727).

    Any member may record a movement — the same pattern as
    expenses and payments; the daily close is the owner-only
    control point. A withdrawal larger than the current balance
    is rejected: the drawer cannot pay out cash it does not hold.
    """
    try:
        _authorized(session, principal, business_id)
        if body.kind == "withdrawal":
            balance = _cashbox_balance(
                _cashbox_entries_for(session, business_id, body.currency_code)
            )
            if body.amount > balance:
                raise HTTPException(
                    status_code=422,
                    detail="Withdrawal exceeds the current cashbox balance",
                )
        entry = CashboxEntry(
            business_id=business_id, kind=body.kind, amount=body.amount,
            currency_code=body.currency_code, reason=body.reason,
            reference=body.reference, recorded_by=principal.subject,
        )
        session.add(entry)
        session.flush()
        action = {
            "opening": "cashbox.opened",
            "deposit": "cashbox.deposit",
            "withdrawal": "cashbox.withdrawal",
        }[body.kind]
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action=action, target_type="cashbox_entry", target_id=str(entry.id),
            change_summary=(
                f"Cashbox {body.kind} of {body.amount} {body.currency_code}: "
                f"{body.reason}"
            ),
        ))
        session.commit()
        return _dict(entry, ("id", "business_id", "kind", "amount", "currency_code",
                             "reason", "reference", "recorded_by", "created_at"))
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/cashbox/balance")
def cashbox_balance(business_id: UUID,
                    session: Session = Depends(get_session),
                    principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Current computed balance per currency, with the entry count."""
    try:
        _authorized(session, principal, business_id)
        entries = session.scalars(select(CashboxEntry).where(
            CashboxEntry.business_id == business_id,
        )).all()
        by_currency: dict[str, list] = {}
        for entry in entries:
            by_currency.setdefault(entry.currency_code, []).append(entry)
        return {
            "balances": [
                {
                    "currency_code": currency,
                    "balance": str(_cashbox_balance(rows)),
                    "entry_count": len(rows),
                }
                for currency, rows in sorted(by_currency.items())
            ],
            "note": (
                "The balance is computed from signed cashbox entries "
                "(opening + deposits - withdrawals); it is not a bank "
                "balance and not a ledger balance."
            ),
        }
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/cashbox/entries")
def list_cashbox_entries(business_id: UUID, kind: str | None = Query(default=None),
                         limit: int = Query(default=100, ge=1, le=200),
                         offset: int = Query(default=0, ge=0),
                         session: Session = Depends(get_session),
                         principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        statement = select(CashboxEntry).where(
            CashboxEntry.business_id == business_id,
        )
        if kind is not None:
            statement = statement.where(CashboxEntry.kind == kind)
        items = session.scalars(
            statement.order_by(CashboxEntry.created_at.desc(), CashboxEntry.id.desc())
            .offset(offset).limit(limit)
        ).all()
        return [_dict(item, ("id", "business_id", "kind", "amount", "currency_code",
                             "reason", "reference", "recorded_by", "created_at"))
                for item in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/cashbox/close", status_code=201)
def close_cashbox(business_id: UUID, body: CashboxCloseInput,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Close the cashbox for a day, with a handover receipt (C3).

    Owner-only: the close is the control point. Expected is the
    computed balance; counted is what was physically in the
    drawer; variance is counted minus expected and may be
    negative. One closing per business, currency and day.
    """
    try:
        _authorized(session, principal, business_id, owner_only=True)
        closed_date = body.closed_date or datetime.now(UTC).date()
        existing = session.scalar(select(CashboxClosing).where(
            CashboxClosing.business_id == business_id,
            CashboxClosing.currency_code == body.currency_code,
            CashboxClosing.closed_date == closed_date,
        ))
        if existing is not None:
            raise HTTPException(
                status_code=422,
                detail="The cashbox is already closed for this currency and day",
            )
        expected = _cashbox_balance(
            _cashbox_entries_for(session, business_id, body.currency_code)
        )
        closing = CashboxClosing(
            business_id=business_id, closed_date=closed_date,
            currency_code=body.currency_code, expected_amount=expected,
            counted_amount=body.counted_amount,
            variance=body.counted_amount - expected,
            handed_by=body.handed_by, received_by=body.received_by,
            note=body.note,
        )
        session.add(closing)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id, actor_subject=principal.subject,
            action="cashbox.closed", target_type="cashbox_closing",
            target_id=str(closing.id),
            change_summary=(
                f"Cashbox closed for {closed_date.isoformat()}: expected "
                f"{expected} {body.currency_code}, counted "
                f"{body.counted_amount}, variance {closing.variance}; "
                f"handed by {body.handed_by} to {body.received_by}"
            ),
        ))
        session.commit()
        return _dict(closing, ("id", "business_id", "closed_date", "currency_code",
                               "expected_amount", "counted_amount", "variance",
                               "handed_by", "received_by", "note", "created_at"))
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/cashbox/closings")
def list_cashbox_closings(business_id: UUID,
                          limit: int = Query(default=100, ge=1, le=200),
                          offset: int = Query(default=0, ge=0),
                          session: Session = Depends(get_session),
                          principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(CashboxClosing).where(
            CashboxClosing.business_id == business_id,
        ).order_by(CashboxClosing.closed_date.desc(), CashboxClosing.id.desc())
            .offset(offset).limit(limit)).all()
        return [_dict(item, ("id", "business_id", "closed_date", "currency_code",
                             "expected_amount", "counted_amount", "variance",
                             "handed_by", "received_by", "note", "created_at"))
                for item in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


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


@router.get("/sales-returns")
def list_sales_returns(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, pattern="^(draft|approved|rejected)$"),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List business-scoped returns; reads never issue a credit note or refund cash."""
    try:
        _authorized(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    statement = select(SalesReturn).where(SalesReturn.business_id == business_id)
    if status is not None:
        statement = statement.where(SalesReturn.status == status)
    returns = session.scalars(
        statement.order_by(SalesReturn.created_at.desc(), SalesReturn.id.desc())
        .limit(limit).offset(offset)
    ).all()
    invoice_currency_by_id = {}
    if returns:
        source_invoices = session.scalars(select(Invoice).where(
            Invoice.id.in_([item.invoice_id for item in returns]),
            Invoice.business_id == business_id,
        )).all()
        invoice_currency_by_id = {
            str(invoice.id): invoice.currency_code for invoice in source_invoices
        }
    return {
        "items": [
            {
                **_dict(item, (
                    "id", "business_id", "invoice_id", "status", "reason", "total", "created_at",
                )),
                "currency_code": invoice_currency_by_id.get(str(item.invoice_id)),
            }
            for item in returns
        ],
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
                          status="draft", reason=(body.reason.strip() if body.reason else body.reason), total=ZERO)
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
    currency_code = session.scalar(select(Invoice.currency_code).where(
        Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
    ))
    return {
        **_dict(ret, ("id", "business_id", "invoice_id", "status", "reason", "total", "created_at")),
        "currency_code": currency_code,
    }


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
        if not (ret.reason or "").strip():
            raise WorkflowError("A return reason is required before approval")
        lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id, SalesReturnLine.business_id == business_id,
        ).order_by(SalesReturnLine.id)).all()

        # Group duplicate line entries and lock the invoice header first. Concurrent
        # approvals for the same invoice then serialize before checking approved returns.
        requested_by_line: dict[UUID, dict[str, Decimal]] = {}
        for returned in lines:
            requested = requested_by_line.setdefault(
                returned.invoice_line_id, {"quantity": ZERO}
            )
            requested["quantity"] += returned.quantity

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
            invoiced_amount = discounted_return_line_total(
                invoice_subtotal=invoice.subtotal,
                invoice_discount_total=invoice.discount_total,
                invoice_lines=[(str(row.id), row.line_total) for row in discount_allocation_lines],
                target_line_id=str(invoice_line.id),
            )
            previous_quantity = Decimal(str(previously_returned_quantity or 0))
            previous_amount = Decimal(str(previously_returned_amount or 0))
            cumulative_amount = money(
                invoiced_amount * (previous_quantity + requested["quantity"]) / invoice_line.quantity
            )
            allocated_amount = cumulative_amount - previous_amount
            try:
                validate_return_amount(
                    invoiced_amount=invoiced_amount,
                    previously_returned_amount=previous_amount,
                    requested_return_amount=allocated_amount,
                )
            except ValueError as exc:
                raise WorkflowError(str(exc)) from exc

            # Allocate rounded cents against cumulative approved quantity, not each
            # return independently. The final approved return reconciles exactly
            # to the discounted source-line amount even for sub-cent unit shares.
            running_quantity = previous_quantity
            running_amount = previous_amount
            for returned_line in (
                row for row in lines if row.invoice_line_id == invoice_line_id
            ):
                running_quantity += returned_line.quantity
                next_cumulative_amount = money(
                    invoiced_amount * running_quantity / invoice_line.quantity
                )
                returned_line.amount = next_cumulative_amount - running_amount
                running_amount = next_cumulative_amount
            invoice_lines[invoice_line_id] = invoice_line

        for returned in lines:
            invoice_line = invoice_lines[returned.invoice_line_id]
            if invoice_line.product_id:
                product = session.scalars(select(Product).where(
                    Product.id == invoice_line.product_id, Product.business_id == business_id,
                    Product.is_stock_tracked.is_(True),
                ).with_for_update()).one_or_none()
                if product:
                    # 3A-920 step 3: the returned quantity is in the line's
                    # sold unit — convert it with the line's snapshotted
                    # factor so the return is in base units like the sale.
                    base_quantity = returned.quantity * (
                        invoice_line.conversion_factor or Decimal(1)
                    )
                    session.add(StockMovement(business_id=business_id, product_id=product.id,
                        movement_type="return", quantity_delta=base_quantity,
                        reason=f"Approved sales return {ret.id}", reference_type="sales_return",
                        reference_id=ret.id, created_by_subject=principal.subject))
        ret.total = sum((returned.amount for returned in lines), ZERO)
        ret.status = "approved"
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="sales_return.approved", target_type="sales_return", target_id=str(ret.id)))
        session.flush()
        return ret
    ret = _commit(session, op)
    currency_code = session.scalar(select(Invoice.currency_code).where(
        Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
    ))
    return {
        **_dict(ret, ("id", "invoice_id", "status", "total", "created_at")),
        "currency_code": currency_code,
    }


@router.post("/sales-returns/{return_id}/credit-note", status_code=201)
def issue_credit_note_for_return(
    business_id: UUID,
    return_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Issue one immutable credit note for an approved return; no AR or cash posting."""

    def op():
        _authorized(session, principal, business_id, owner_only=True)
        ret = session.scalars(
            select(SalesReturn).where(
                SalesReturn.id == return_id,
                SalesReturn.business_id == business_id,
            ).with_for_update()
        ).one_or_none()
        if ret is None:
            raise WorkflowError("Sales return not found in this business")

        existing = session.scalars(select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.sales_return_id == ret.id,
        ).with_for_update()).one_or_none()
        if existing is not None:
            return existing
        if ret.status != "approved":
            raise WorkflowError("Only an approved sales return can be credited")
        if not (ret.reason or "").strip():
            raise WorkflowError("A return reason is required before credit note issuance")

        invoice = session.scalars(select(Invoice).where(
            Invoice.id == ret.invoice_id,
            Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Credit note must reference an issued invoice")
        if invoice.customer_id is None:
            raise WorkflowError("Credit note requires an invoice linked to a customer")
        if Decimal(str(invoice.tax_total or ZERO)) > ZERO:
            raise WorkflowError(
                "Credit note issuance for tax-bearing invoices is deferred until tax allocation is approved"
            )

        return_lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id,
            SalesReturnLine.business_id == business_id,
        ).order_by(SalesReturnLine.id)).all()
        if not return_lines:
            raise WorkflowError("An approved return must contain at least one line")
        source_line_ids = {line.invoice_line_id for line in return_lines}
        source_count = session.scalar(select(func.count(InvoiceLine.id)).where(
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.id.in_(source_line_ids),
        ))
        if int(source_count or 0) != len(source_line_ids):
            raise WorkflowError("Every return line must reference the original invoice")

        total = money(sum((Decimal(str(line.amount)) for line in return_lines), ZERO))
        if total <= ZERO or money(Decimal(str(ret.total))) != total:
            raise WorkflowError("Approved return total must reconcile to its persisted return lines")

        note = CreditNote(
            business_id=business_id,
            sales_return_id=ret.id,
            invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            credit_note_number=f"CN-{ret.id.hex[:24].upper()}",
            currency_code=invoice.currency_code,
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
            change_summary=f"Credit note issued for approved sales return {ret.id}",
        ))
        session.flush()
        return note

    try:
        note = _commit(session, op)
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        # A concurrent request may win the unique (business, return) constraint.
        session.rollback()
        existing = session.scalars(select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.sales_return_id == return_id,
        )).one_or_none()
        if existing is None:
            raise
        note = existing

    return _dict(note, (
        "id", "business_id", "sales_return_id", "invoice_id", "customer_id",
        "credit_note_number", "currency_code", "total", "created_by_subject", "created_at",
    ))


@router.get("/credit-notes")
def list_credit_notes(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    customer_id: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List issued Stage-1 credit-note documents; does not imply applied credit or cash refund."""
    try:
        _authorized(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    statement = select(CreditNote).where(CreditNote.business_id == business_id)
    if customer_id is not None:
        statement = statement.where(CreditNote.customer_id == customer_id)
    notes = session.scalars(
        statement.order_by(CreditNote.created_at.desc(), CreditNote.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {
        "items": [_dict(note, (
            "id", "business_id", "sales_return_id", "invoice_id", "customer_id",
            "credit_note_number", "currency_code", "total", "created_by_subject", "created_at",
        )) for note in notes],
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
        if body.customer_id is not None:
            # Customer existence is verified separately; it need not already have an invoice.
            # The active-customer check applies regardless of invoice history:
            # an inactive customer with past invoices must not get a schedule.
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


@router.get("/settings")
def list_settings(business_id: UUID,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    """List the business's settings (Slice 4: the assistant tab reads
    the dialect + morning-brief switch through this). Any member may
    read — setting keys are restricted to safe identifiers and
    secret-like keys are rejected at write time, so nothing sensitive
    lives here; writes stay owner-only (PUT/DELETE below)."""
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(BusinessSetting).where(
            BusinessSetting.business_id == business_id).order_by(
            BusinessSetting.setting_key.asc())).all()
        return [_dict(x, ("id", "setting_key", "setting_value", "updated_at")) for x in items]
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
        created = item is None
        if created:
            item = BusinessSetting(business_id=business_id, setting_key=safe_key,
                                   setting_value=body.setting_value)
            session.add(item)
        else:
            item.setting_value = body.setting_value
            item.updated_at = datetime.now(UTC)
        session.flush()
        # 3A-417: a setting change is a business change — record it in the
        # audit trail like every other mutation. The summary names the key
        # only; setting values are never copied into the audit trail.
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="setting.created" if created else "setting.updated",
            target_type="business_setting", target_id=str(item.id),
            change_summary=f"Setting {safe_key} {'created' if created else 'updated'}"))
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "setting_key", "setting_value", "updated_at"))


@router.delete("/settings/{setting_key}", status_code=204)
def delete_setting(business_id: UUID, setting_key: str,
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Delete one setting (B7 one-tap rollback: remove a key a conversational-setup
    proposal created). Owner-only; the audit event names the key only, never a value."""
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        safe_key = _validated_setting_key(setting_key)
        item = session.scalars(select(BusinessSetting).where(
            BusinessSetting.business_id == business_id,
            BusinessSetting.setting_key == safe_key,
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Setting not found")
        session.delete(item)
        session.flush()
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
                               action="setting.deleted",
                               target_type="business_setting", target_id=str(item.id),
                               change_summary=f"Setting {safe_key} deleted"))
        session.flush()

    _commit(session, op)
    return Response(status_code=204)


@router.get("/reports/summary")
def report_summary(business_id: UUID,
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        membership = _authorized(session, principal, business_id)
        invoices = session.execute(select(Invoice.currency_code, func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.business_id == business_id, Invoice.status == "issued"
        ).group_by(Invoice.currency_code)).all()
        expense_statement = select(Expense.currency_code, func.count(Expense.id),
            func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.business_id == business_id
        )
        expense_statement = apply_expense_visibility(
            expense_statement, business_id=business_id, role=membership.role
        )
        expenses = session.execute(expense_statement.group_by(Expense.currency_code)).all()
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
               ids: str | None = Query(default=None),
               session: Session = Depends(get_session),
               principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id, owner_only=True)
        # Bulk export (C8 Part 2, 3A-686): an optional comma-separated ids
        # filter narrows the export to the caller's multi-selection.
        wanted_ids: set[UUID] | None = None
        if ids:
            try:
                wanted_ids = {
                    UUID(part.strip()) for part in ids.split(",") if part.strip()
                }
            except ValueError:
                raise HTTPException(
                    status_code=422,
                    detail="ids must be comma-separated UUIDs",
                ) from None
        supported = {
            "customers": ("customers", ("id", "name", "email", "phone", "address", "created_at")),
            "products": ("products", ("id", "sku", "name", "unit", "unit_price", "is_stock_tracked", "created_at")),
            "expenses": ("expenses", ("id", "category", "description", "amount", "currency_code", "incurred_at", "vendor_name", "reference")),
        }
        if entity_type not in supported:
            raise HTTPException(status_code=404, detail="Unsupported export entity")
        from app.models import Customer
        _model_name, columns = supported[entity_type]
        model = {"customers": Customer, "products": Product, "expenses": Expense}[entity_type]
        rows = session.scalars(select(model).where(model.business_id == business_id)).all()
        if wanted_ids is not None:
            rows = [row for row in rows if row.id in wanted_ids]
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
                values.append(spreadsheet_safe(text_value))
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
            except (InvalidOperation, TypeError, ValueError):
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
            except (InvalidOperation, TypeError, ValueError):
                errors.append({"row": index, "field": "amount", "code": "invalid_decimal"})
            currency = row.get("currency_code", "").upper()
            if len(currency) != 3 or not currency.isalpha():
                errors.append({"row": index, "field": "currency_code", "code": "invalid_currency"})
            try:
                datetime.fromisoformat(row.get("incurred_at", ""))
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


@router.post("/imports/{entity_type}.csv", status_code=202, dependencies=[Depends(rate_limit("CSV_IMPORT", default_limit=20, per_business=True))])
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
            row = _dict(item, ("id", "name", "sku", "description", "unit",
                               "second_unit_name", "conversion_factor", "unit_price",
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
        row = _dict(item, ("id", "name", "sku", "description", "unit",
                           "second_unit_name", "conversion_factor", "unit_price",
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
        # 3A-920 step 3: the second unit is a pricing change too
        # (unit_price x factor), so it is owner-only as well.
        sensitive_fields = {"unit_price", "is_stock_tracked",
                            "second_unit_name", "conversion_factor"}
        _authorized(session, principal, business_id,
                    owner_only=bool(sensitive_fields.intersection(changes)))
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        # 3A-920 step 3: validate the MERGED pair — a PATCH may set only
        # one side when the other is already stored. The gate blocks a
        # NEW second unit while transport is off; keeping, renaming or
        # clearing a stored one stays allowed.
        merged_unit = changes.get("second_unit_name", item.second_unit_name)
        if isinstance(merged_unit, str):
            merged_unit = merged_unit.strip() or None
        merged_factor = changes.get("conversion_factor", item.conversion_factor)
        if (merged_unit is None) != (merged_factor is None):
            raise WorkflowError("Second unit name and conversion factor must be set together")
        if merged_factor is not None and merged_factor <= ZERO:
            raise WorkflowError("Conversion factor must be positive")
        if (merged_unit is not None and item.second_unit_name is None
                and not transport_enabled(session, business_id=business_id)):
            raise WorkflowError("Transport is disabled for this business.")
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
    return _dict(item, ("id", "name", "sku", "description", "unit",
                        "second_unit_name", "conversion_factor", "unit_price",
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
        membership = _authorized(session, principal, business_id)
        expense_statement = select(Expense).where(Expense.business_id == business_id)
        expense_statement = apply_expense_visibility(
            expense_statement, business_id=business_id, role=membership.role
        )
        items = session.scalars(
            expense_statement.order_by(Expense.incurred_at.desc(), Expense.id.desc())
            .offset(offset).limit(limit)
        ).all()
        return [_dict(x, ("id", "category", "description", "amount", "currency_code",
                          "incurred_at", "vendor_name", "reference", "created_at")) for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/invoices/{invoice_id}")
def get_invoice(business_id: UUID, invoice_id: UUID,
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        membership = _authorized(session, principal, business_id)
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == invoice_id, Invoice.business_id == business_id,
        )).one_or_none()
        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id, InvoiceLine.business_id == business_id
        )).all()
        result = {
            **_dict(invoice, ("id", "invoice_number", "customer_id", "status", "currency_code",
                              "subtotal", "discount_total", "tax_total", "total", "issue_date",
                              "due_date", "notes", "created_at")),
            # 3A-920 step 4: the transport block's operational fields
            # are visible to any member who can see the invoice; the
            # wage snapshot + entitlement amount below are payroll data
            # and stay owner-only (the payroll permissions rule).
            **_dict(invoice, ("driver_employee_id", "transport_trips", "transport_from",
                              "transport_to", "transport_entitlement_status")),
            "lines": [_dict(line, ("id", "product_id", "description", "quantity",
                                   "sold_unit", "conversion_factor",
                                   "unit_price", "line_total")) for line in lines],
        }
        if invoice.driver_employee_id is not None:
            result["driver_name"] = session.scalar(select(Employee.name).where(
                Employee.id == invoice.driver_employee_id,
                Employee.business_id == business_id,
            ))
        if membership.role == MembershipRole.OWNER:
            wage = invoice.transport_trip_wage
            result["transport_trip_wage"] = str(wage) if wage is not None else None
            result["transport_entitlement_amount"] = (
                str(wage * invoice.transport_trips)
                if wage is not None and invoice.transport_trips else None
            )
            result["transport_entitlement_payroll_id"] = (
                str(invoice.transport_entitlement_payroll_id)
                if invoice.transport_entitlement_payroll_id else None
            )
        return result
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
            .where(PaymentAllocation.business_id == business_id)
            .group_by(PaymentAllocation.invoice_id)
        ).all()
        allocated_by_invoice = {
            invoice_id: Decimal(str(amount or ZERO))
            for invoice_id, amount in allocation_rows
        }
        result = []
        for invoice in items:
            row = _dict(invoice, ("id", "invoice_number", "customer_id", "status", "currency_code",
                                  "subtotal", "discount_total", "tax_total", "total", "issue_date", "created_at"))
            allocated = allocated_by_invoice.get(invoice.id, ZERO)
            outstanding = max(ZERO, Decimal(str(invoice.total)) - allocated) if invoice.status == "issued" else ZERO
            row["allocated_payments"] = str(allocated)
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
        report_date = as_of or datetime.now(UTC).date()
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


@router.get("/reports/payables-aging")
def payables_aging(
    business_id: UUID,
    as_of: date | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Return what the business owes suppliers, by supplier and currency.

    The mirror of receivables-aging for the purchase side (C2, 3A-726):
    approved and received purchase orders, summed per supplier without
    cross-currency netting. Outstanding equals received totals because
    no supplier-payment records exist yet — that is stated in the
    response, not hidden: supplier bills and payments are the
    documented gap in docs/FINANCIAL_DEPTH_AUDIT.md.
    """
    try:
        _authorized(session, principal, business_id)
        report_date = as_of or datetime.now(UTC).date()
        orders = session.scalars(
            select(PurchaseOrder).where(
                PurchaseOrder.business_id == business_id,
                PurchaseOrder.status.in_((
                    "draft", "approved", "partially_received", "received",
                )),
            ).order_by(
                PurchaseOrder.currency_code, PurchaseOrder.order_number
            )
        ).all()
        suppliers = {
            row.id: row
            for row in session.scalars(
                select(Supplier).where(Supplier.business_id == business_id)
            ).all()
        }

        order_rows = []
        supplier_totals: dict[tuple[UUID, str], dict[str, Decimal]] = {}
        for order in orders:
            counts_ordered, counts_received = _payable_classify(order.status)
            if not counts_ordered and not counts_received:
                continue
            total = Decimal(str(order.total or ZERO))
            supplier = suppliers.get(order.supplier_id)
            key = (order.supplier_id, order.currency_code)
            bucket = supplier_totals.setdefault(key, {
                "ordered": ZERO, "received": ZERO,
            })
            if counts_ordered:
                bucket["ordered"] += total
            if counts_received:
                bucket["received"] += total
            order_rows.append({
                "order_id": str(order.id),
                "order_number": order.order_number,
                "supplier_id": str(order.supplier_id),
                "supplier_name": supplier.name if supplier else None,
                "supplier_link_missing": supplier is None,
                "currency_code": order.currency_code,
                "status": order.status,
                "order_total": str(total),
                "counts_as_ordered": counts_ordered,
                "counts_as_received": counts_received,
            })

        summaries = []
        for (supplier_id, currency), bucket in sorted(
            supplier_totals.items(), key=lambda item: (str(item[0][0]), item[0][1])
        ):
            outstanding, _overpaid = _payable_outstanding(bucket["received"], ZERO)
            supplier = suppliers.get(supplier_id)
            summaries.append({
                "supplier_id": str(supplier_id),
                "supplier_name": supplier.name if supplier else None,
                "currency_code": currency,
                "ordered_total": str(bucket["ordered"]),
                "received_total": str(bucket["received"]),
                "outstanding_total": str(outstanding),
            })
        return {
            "as_of_date": report_date.isoformat(),
            "source": "approved and received purchase orders, grouped by supplier and currency",
            "currency_policy": (
                "Purchase orders are summed per currency only; different "
                "currencies are never combined."
            ),
            "note": (
                "No supplier-payment records exist yet, so outstanding "
                "equals received totals. Supplier bills and payments are "
                "the documented gap in docs/FINANCIAL_DEPTH_AUDIT.md."
            ),
            "order_count": len(order_rows),
            "by_supplier": summaries,
            "orders": order_rows,
            "limitations": [
                "Draft orders commit nothing and are excluded from totals.",
                "Cancelled orders are excluded from the report.",
                "Received totals are goods received, not a valuation: no inventory valuation or COGS exists yet.",
                "This is a supplier-payables report, not net profit or a full general ledger.",
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
        membership = _authorized(session, principal, business_id)
        invoice_rows = session.execute(select(
            Invoice.currency_code, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)
        ).where(Invoice.business_id == business_id, Invoice.status == "issued")
         .group_by(Invoice.currency_code)).all()
        expense_statement = select(
            Expense.currency_code, func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)
        ).where(Expense.business_id == business_id)
        expense_statement = apply_expense_visibility(
            expense_statement, business_id=business_id, role=membership.role
        )
        expense_rows = session.execute(expense_statement.group_by(Expense.currency_code)).all()
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
            "generated_at": datetime.now(UTC).isoformat(),
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
    """Build a currency-separated customer statement with SQL-side pagination and balances."""
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

        business = session.get(Business, business_id)
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found")
        start_utc, end_utc = _day_bounds(from_date, to_date, business.timezone)

        invoice_occurred_at = func.coalesce(Invoice.issue_date, Invoice.created_at)
        invoice_events = select(
            invoice_occurred_at.label("occurred_at"),
            literal("invoice_issued", type_=String()).label("event_type"),
            cast(Invoice.id, String()).label("source_id"),
            Invoice.invoice_number.label("reference"),
            Invoice.currency_code.label("currency_code"),
            Invoice.total.label("debit"),
            literal(0, type_=Numeric(14, 2)).label("credit"),
            literal(True).label("affects_balance"),
            literal(None, type_=String()).label("invoice_id"),
        ).where(
            Invoice.business_id == business_id,
            Invoice.customer_id == customer_id,
            Invoice.status == "issued",
            invoice_occurred_at.is_not(None),
        )
        if start_utc is not None:
            invoice_events = invoice_events.where(invoice_occurred_at >= start_utc)
        if end_utc is not None:
            invoice_events = invoice_events.where(invoice_occurred_at < end_utc)

        allocation_occurred_at = func.coalesce(Payment.received_at, PaymentAllocation.created_at)
        same_currency = Payment.currency_code == Invoice.currency_code
        allocation_events = select(
            allocation_occurred_at.label("occurred_at"),
            case(
                (same_currency, literal("payment_allocation", type_=String())),
                else_=literal("currency_mismatch_allocation", type_=String()),
            ).label("event_type"),
            cast(PaymentAllocation.id, String()).label("source_id"),
            Payment.reference.label("reference"),
            case(
                (same_currency, Invoice.currency_code),
                else_=Payment.currency_code,
            ).label("currency_code"),
            literal(0, type_=Numeric(14, 2)).label("debit"),
            PaymentAllocation.amount.label("credit"),
            same_currency.label("affects_balance"),
            cast(Invoice.id, String()).label("invoice_id"),
        ).join(
            Payment,
            Payment.id == PaymentAllocation.payment_id,
        ).join(
            Invoice,
            Invoice.id == PaymentAllocation.invoice_id,
        ).where(
            PaymentAllocation.business_id == business_id,
            Payment.business_id == business_id,
            Invoice.business_id == business_id,
            Invoice.customer_id == customer_id,
            Invoice.status == "issued",
            allocation_occurred_at.is_not(None),
        )
        if start_utc is not None:
            allocation_events = allocation_events.where(allocation_occurred_at >= start_utc)
        if end_utc is not None:
            allocation_events = allocation_events.where(allocation_occurred_at < end_utc)

        # UNION ALL keeps the event sources in the database. The window function
        # computes running balances per currency before LIMIT/OFFSET is applied.
        events = union_all(invoice_events, allocation_events).cte("customer_statement_events")
        applicable_credit = case(
            (events.c.affects_balance.is_(True), events.c.credit),
            else_=literal(0, type_=Numeric(14, 2)),
        )
        event_order = (events.c.occurred_at, events.c.event_type, events.c.source_id)
        running_balance = func.sum(events.c.debit - applicable_credit).over(
            partition_by=events.c.currency_code,
            order_by=event_order,
            rows=(None, 0),
        )
        windowed = select(
            events,
            running_balance.label("balance"),
        ).cte("customer_statement_windowed")

        total = session.scalar(select(func.count()).select_from(events)) or 0
        page_rows = session.execute(
            select(windowed)
            .order_by(windowed.c.occurred_at, windowed.c.event_type, windowed.c.source_id)
            .offset(offset)
            .limit(limit)
        ).all()

        latest_rank = func.row_number().over(
            partition_by=windowed.c.currency_code,
            order_by=(
                windowed.c.occurred_at.desc(),
                windowed.c.event_type.desc(),
                windowed.c.source_id.desc(),
            ),
        ).label("latest_rank")
        ranked_balances = select(
            windowed.c.currency_code,
            windowed.c.balance,
            latest_rank,
        ).subquery("customer_statement_ranked_balances")
        balance_rows = session.execute(
            select(ranked_balances.c.currency_code, ranked_balances.c.balance)
            .where(ranked_balances.c.latest_rank == 1)
            .order_by(ranked_balances.c.currency_code)
        ).all()

        def as_utc_timestamp(value: datetime) -> datetime:
            # SQLite may return naive values for timezone-aware columns; treat those as UTC.
            if value.tzinfo is None or value.utcoffset() is None:
                return value.replace(tzinfo=UTC)
            return value.astimezone(UTC)

        def decimal_string(value) -> str:
            amount = Decimal(str(value or ZERO))
            return str(ZERO if amount == ZERO else amount)

        items = []
        for row in page_rows:
            item = dict(row._mapping)
            item["occurred_at"] = as_utc_timestamp(item["occurred_at"]).isoformat()
            for key in ("debit", "credit", "balance"):
                item[key] = decimal_string(item[key])
            items.append(item)

        balances_by_currency = {
            currency: decimal_string(balance)
            for currency, balance in balance_rows
        }
        return {
            "customer": {"id": str(customer.id), "name": customer.name},
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "balances_by_currency": balances_by_currency,
            "limitations": [
                "Issued credit notes are excluded from this statement and do not reduce receivables in Stage 1.",
                "Approved sales returns are not treated as receivable credits until Stage 2 is separately approved and implemented.",
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
            "generated_at": datetime.now(UTC).isoformat(),
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
