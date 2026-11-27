"""Shared building blocks for the extended business endpoints (3A-921 B1).

The domain routers in extended_*_api.py all hang off the same
"/api/v1/businesses/{business_id}" prefix and share the helpers,
input models and authorization plumbing that used to sit at the top
of extended_api.py. extended_api.py itself is now the aggregator
that includes those routers in the original registration order.
"""
import re
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    MembershipRole,
    authorize_membership,
)
from app.services import WorkflowError

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

