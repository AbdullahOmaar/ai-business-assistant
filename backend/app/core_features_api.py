"""Core first-ten-feature APIs: workspace onboarding, profile and dashboard.

All routes require a host-configured trusted identity resolver and a database
session. This module never trusts caller-provided identity claims.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import (
    Business, BusinessMembership, Expense, Invoice, MembershipRole,
    Payment, PaymentAllocation,
)
from app.security import (
    AuthenticatedPrincipal, AuthorizationError, authorize_membership,
)

router = APIRouter(prefix="/api/v1", tags=["workspace and dashboard"])


class BusinessCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    currency_code: str = Field(min_length=3, max_length=3)
    locale: str = Field(default="en", min_length=2, max_length=16)
    timezone: str = Field(default="UTC", min_length=1, max_length=64)
    contact_email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)


class BusinessPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=160)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    locale: str | None = Field(default=None, min_length=2, max_length=16)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    contact_email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)


def _serialize_business(item: Business) -> dict:
    return {
        "id": str(item.id), "name": item.name, "currency_code": item.currency_code,
        "locale": item.locale, "timezone": item.timezone,
        "contact_email": item.contact_email, "phone": item.phone,
        "address": item.address, "is_active": item.is_active,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _authorize(session: Session, principal: AuthenticatedPrincipal, business_id: UUID,
               *, owner_only: bool = False) -> None:
    authorize_membership(
        session, principal=principal, business_id=business_id,
        allowed_roles={MembershipRole.OWNER} if owner_only else None,
    )


def _currency(value: str) -> str:
    result = value.strip().upper()
    if len(result) != 3 or not result.isalpha():
        raise HTTPException(status_code=422, detail="Currency must be a three-letter code")
    return result


def _timezone_zone(value: str) -> ZoneInfo:
    """Resolve a configured IANA timezone or reject invalid business settings."""
    try:
        return ZoneInfo(value.strip())
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Business timezone must be a valid IANA timezone.",
        ) from exc


def _business_timezone(session: Session, business_id: UUID) -> str:
    business = session.scalars(select(Business).where(
        Business.id == business_id, Business.is_active.is_(True),
    )).one_or_none()
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found")
    _timezone_zone(business.timezone)
    return business.timezone


def _day_bounds(
    start_date: date | None, end_date: date | None, timezone_name: str = "UTC",
):
    """Convert inclusive business-local dates to UTC half-open timestamp bounds."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    zone = _timezone_zone(timezone_name)
    start = (
        datetime.combine(start_date, time.min, tzinfo=zone).astimezone(timezone.utc)
        if start_date else None
    )
    end = (
        datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
        if end_date else None
    )
    return start, end


def _date_filter(column, start, end):
    clauses = []
    if start is not None:
        clauses.append(column >= start)
    if end is not None:
        clauses.append(column < end)
    return clauses


@router.get("/businesses")
def list_businesses(session: Session = Depends(get_session),
                    principal: AuthenticatedPrincipal = Depends(get_principal)):
    """List only active workspaces where the verified user has membership."""
    rows = session.execute(
        select(Business, BusinessMembership.role)
        .join(BusinessMembership, BusinessMembership.business_id == Business.id)
        .where(
            BusinessMembership.user_subject == principal.subject,
            Business.is_active.is_(True),
        )
        .order_by(Business.name)
    ).all()
    return [
        {**_serialize_business(business), "role": role.value}
        for business, role in rows
    ]


@router.post("/businesses", status_code=201)
def create_business(body: BusinessCreate,
                    session: Session = Depends(get_session),
                    principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Create a workspace and assign its verified creator the owner role."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Business name is required")
    if not principal.subject.strip():
        raise HTTPException(status_code=401, detail="Authentication required")
    timezone_name = body.timezone.strip()
    _timezone_zone(timezone_name)
    item = Business(
        name=name, currency_code=_currency(body.currency_code),
        locale=body.locale.strip(), timezone=timezone_name,
        contact_email=body.contact_email, phone=body.phone, address=body.address,
    )
    try:
        session.add(item)
        session.flush()
        session.add(BusinessMembership(
            business_id=item.id, user_subject=principal.subject,
            role=MembershipRole.OWNER,
        ))
        session.commit()
        session.refresh(item)
        return _serialize_business(item)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Workspace could not be created due to a data conflict") from exc
    except Exception:
        session.rollback()
        raise


@router.get("/businesses/{business_id}")
def get_business(business_id: UUID, session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorize(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    item = session.scalars(select(Business).where(
        Business.id == business_id, Business.is_active.is_(True),
    )).one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Business not found")
    return _serialize_business(item)


@router.patch("/businesses/{business_id}")
def patch_business(business_id: UUID, body: BusinessPatch,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorize(session, principal, business_id, owner_only=True)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    item = session.scalars(select(Business).where(
        Business.id == business_id, Business.is_active.is_(True),
    ).with_for_update()).one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Business not found")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if value is None and key in {"name", "currency_code", "locale", "timezone"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null")
        if isinstance(value, str):
            value = value.strip()
        if key == "name" and not value:
            raise HTTPException(status_code=422, detail="Business name is required")
        if key == "currency_code" and value is not None:
            value = _currency(value)
        if key == "timezone" and value is not None:
            _timezone_zone(value)
        setattr(item, key, value)
    try:
        session.commit()
        session.refresh(item)
    except Exception:
        session.rollback()
        raise
    return _serialize_business(item)


@router.get("/businesses/{business_id}/dashboard")
def dashboard(business_id: UUID, start_date: date | None = None, end_date: date | None = None,
              session: Session = Depends(get_session),
              principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Return source-record metrics by currency; never label invoice totals as cash."""
    try:
        _authorize(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    timezone_name = _business_timezone(session, business_id)
    start, end = _day_bounds(start_date, end_date, timezone_name)

    invoice_clauses = [Invoice.business_id == business_id, Invoice.status == "issued"]
    invoice_clauses.extend(_date_filter(Invoice.issue_date, start, end))
    sales = session.execute(select(
        Invoice.currency_code, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)
    ).where(*invoice_clauses).group_by(Invoice.currency_code)).all()

    expense_clauses = [Expense.business_id == business_id]
    expense_clauses.extend(_date_filter(Expense.incurred_at, start, end))
    expenses = session.execute(select(
        Expense.currency_code, func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)
    ).where(*expense_clauses).group_by(Expense.currency_code)).all()

    payment_clauses = [Payment.business_id == business_id]
    payment_clauses.extend(_date_filter(Payment.received_at, start, end))
    collected = session.execute(select(
        Payment.currency_code, func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0)
    ).where(*payment_clauses).group_by(Payment.currency_code)).all()

    allocated = select(
        PaymentAllocation.invoice_id.label("invoice_id"),
        func.coalesce(func.sum(PaymentAllocation.amount), 0).label("allocated_total"),
    ).where(PaymentAllocation.business_id == business_id).group_by(
        PaymentAllocation.invoice_id
    ).subquery()
    outstanding_rows = session.execute(select(
        Invoice.currency_code,
        func.coalesce(func.sum(Invoice.total - func.coalesce(allocated.c.allocated_total, 0)), 0),
    ).outerjoin(allocated, allocated.c.invoice_id == Invoice.id).where(
        *invoice_clauses
    ).group_by(Invoice.currency_code)).all()

    def amounts(rows):
        return [{"currency_code": currency, "count": int(count), "total": str(total)}
                for currency, count, total in rows]

    return {
        "period": {"start_date": start_date.isoformat() if start_date else None,
                   "end_date": end_date.isoformat() if end_date else None,
                   "timezone": timezone_name},
        "invoiced_sales": amounts(sales),
        "collected_payments": amounts(collected),
        "expenses": amounts(expenses),
        "outstanding_balances": [
            {"currency_code": currency, "total": str(max(Decimal("0"), Decimal(str(total))))}
            for currency, total in outstanding_rows
        ],
        "limitations": [
            "Currency totals are kept separate and are never converted.",
            "Outstanding balances are derived from issued invoices less recorded allocations.",
            "This dashboard does not claim net profit; product cost and other cost data may be incomplete.",
        ],
    }


@router.get("/businesses/{business_id}/profit-loss")
def profit_loss(
    business_id: UUID,
    period: str = Query(default="30d", pattern="^(30d|month|all|custom)$"),
    start_date: date | None = None,
    end_date: date | None = None,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Summarize invoiced revenue and recorded expenses without overstating net profit."""
    try:
        _authorize(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    timezone_name = _business_timezone(session, business_id)
    business_zone = _timezone_zone(timezone_name)
    today = datetime.now(business_zone).date()
    if period == "custom":
        if start_date is None or end_date is None:
            raise HTTPException(status_code=422, detail="Custom period requires start_date and end_date.")
        start, end = start_date, end_date
    elif period == "month":
        start, end = today.replace(day=1), today
    elif period == "30d":
        start, end = today - timedelta(days=29), today
    else:
        start, end = None, None

    if start and end and start > end:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")

    start_ts, end_ts = _day_bounds(start, end, timezone_name)

    invoice_query = select(
        Invoice.currency_code,
        func.count(Invoice.id),
        func.coalesce(func.sum(Invoice.total), 0),
    ).where(Invoice.business_id == business_id, Invoice.status == "issued")
    expense_query = select(
        Expense.currency_code,
        func.count(Expense.id),
        func.coalesce(func.sum(Expense.amount), 0),
    ).where(Expense.business_id == business_id)
    if start_ts is not None:
        invoice_query = invoice_query.where(Invoice.issue_date >= start_ts)
        expense_query = expense_query.where(Expense.incurred_at >= start_ts)
    if end_ts is not None:
        invoice_query = invoice_query.where(Invoice.issue_date < end_ts)
        expense_query = expense_query.where(Expense.incurred_at < end_ts)

    revenue_rows = session.execute(invoice_query.group_by(Invoice.currency_code)).all()
    expense_rows = session.execute(expense_query.group_by(Expense.currency_code)).all()
    revenue = {currency: (int(count), Decimal(str(total))) for currency, count, total in revenue_rows}
    expenses = {currency: (int(count), Decimal(str(total))) for currency, count, total in expense_rows}
    currencies = sorted(set(revenue) | set(expenses))
    rows = []
    for currency in currencies:
        revenue_count, revenue_total = revenue.get(currency, (0, Decimal("0")))
        expense_count, expense_total = expenses.get(currency, (0, Decimal("0")))
        rows.append({
            "currency_code": currency,
            "revenue": str(revenue_total),
            "revenue_invoice_count": revenue_count,
            "expenses": str(expense_total),
            "expense_count": expense_count,
            "operating_result_before_cost_of_goods": str(revenue_total - expense_total),
        })
    return {
        "period": {
            "type": period,
            "start_date": start.isoformat() if start else None,
            "end_date": end.isoformat() if end else None,
            "timezone": timezone_name,
        },
        "currencies": rows,
        "limitations": [
            "Revenue is based on issued invoice totals, not cash collected.",
            "Invoice totals include stored tax amounts; approved sales returns are not netted from this figure.",
            "This result subtracts recorded expenses only and excludes cost of goods sold because product purchase costs are not yet linked to sales.",
            "Tax liability treatment and tax allocation to returns are not represented as a complete accounting ledger.",
            "Currencies are kept separate and never converted or combined.",
        ],
    }
