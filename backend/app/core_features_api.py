"""Core first-ten-feature APIs: workspace onboarding, profile and dashboard.

All routes require a host-configured trusted identity resolver and a database
session. This module never trusts caller-provided identity claims.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import (
    AuditEvent, Business, BusinessMembership, Expense, Invoice, MembershipRole,
    Payment, PaymentAllocation, SalesReturn,
)
from app.security import (
    AuthenticatedPrincipal, AuthorizationError, apply_expense_visibility, authorize_membership,
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


class MembershipRolePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: MembershipRole


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
               *, owner_only: bool = False):
    return authorize_membership(
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
    try:
        start = (
            datetime.combine(start_date, time.min, tzinfo=zone).astimezone(timezone.utc)
            if start_date else None
        )
        end = (
            datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc)
            if end_date else None
        )
    except (OverflowError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Date is outside the supported business-timezone range.",
        ) from exc
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


@router.get("/businesses/{business_id}/memberships")
def list_business_memberships(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List membership identities and roles for workspace owners only."""
    try:
        _authorize(session, principal, business_id, owner_only=True)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    rows = session.scalars(
        select(BusinessMembership)
        .where(BusinessMembership.business_id == business_id)
        .order_by(BusinessMembership.created_at, BusinessMembership.id)
    ).all()
    return [
        {
            "id": str(row.id),
            "user_subject": row.user_subject,
            "role": row.role.value,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.patch("/businesses/{business_id}/memberships/{membership_id}")
def update_business_membership_role(
    business_id: UUID,
    membership_id: UUID,
    body: MembershipRolePatch,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Allow owners to change existing member roles without accepting caller identity claims."""
    try:
        _authorize(session, principal, business_id, owner_only=True)
        # Serialize membership mutations per workspace to prevent concurrent
        # requests from accidentally removing/demoting the last owner.
        business = session.scalars(
            select(Business).where(
                Business.id == business_id, Business.is_active.is_(True)
            ).with_for_update()
        ).one_or_none()
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found")
        membership = session.scalars(
            select(BusinessMembership).where(
                BusinessMembership.id == membership_id,
                BusinessMembership.business_id == business_id,
            ).with_for_update()
        ).one_or_none()
        if membership is None:
            raise HTTPException(status_code=404, detail="Membership not found")
        if membership.role is MembershipRole.OWNER and body.role is not MembershipRole.OWNER:
            owner_count = session.scalar(
                select(func.count()).select_from(BusinessMembership).where(
                    BusinessMembership.business_id == business_id,
                    BusinessMembership.role == MembershipRole.OWNER,
                )
            ) or 0
            if owner_count <= 1:
                raise HTTPException(status_code=422, detail="A workspace must retain at least one owner")
        old_role = membership.role
        membership.role = body.role
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="membership.role_changed",
            target_type="business_membership",
            target_id=str(membership.id),
            change_summary=f"Role changed from {old_role.value} to {body.role.value}",
        ))
        session.commit()
        session.refresh(membership)
        return {
            "id": str(membership.id),
            "user_subject": membership.user_subject,
            "role": membership.role.value,
            "created_at": membership.created_at.isoformat() if membership.created_at else None,
        }
    except AuthorizationError as exc:
        session.rollback()
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise


@router.delete("/businesses/{business_id}/memberships/{membership_id}", status_code=204)
def remove_business_membership(
    business_id: UUID,
    membership_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Remove an existing member while preserving at least one workspace owner."""
    try:
        _authorize(session, principal, business_id, owner_only=True)
        session.scalars(
            select(Business).where(
                Business.id == business_id, Business.is_active.is_(True)
            ).with_for_update()
        ).one_or_none()
        membership = session.scalars(
            select(BusinessMembership).where(
                BusinessMembership.id == membership_id,
                BusinessMembership.business_id == business_id,
            ).with_for_update()
        ).one_or_none()
        if membership is None:
            raise HTTPException(status_code=404, detail="Membership not found")
        if membership.role is MembershipRole.OWNER:
            owner_count = session.scalar(
                select(func.count()).select_from(BusinessMembership).where(
                    BusinessMembership.business_id == business_id,
                    BusinessMembership.role == MembershipRole.OWNER,
                )
            ) or 0
            if owner_count <= 1:
                raise HTTPException(status_code=422, detail="A workspace must retain at least one owner")
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="membership.removed",
            target_type="business_membership",
            target_id=str(membership.id),
        ))
        session.delete(membership)
        session.commit()
        return Response(status_code=204)
    except AuthorizationError as exc:
        session.rollback()
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise


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
        membership = _authorize(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    timezone_name = _business_timezone(session, business_id)
    if start_date is None and end_date is None:
        business_today = datetime.now(_timezone_zone(timezone_name)).date()
        start_date = business_today - timedelta(days=29)
        end_date = business_today
    start, end = _day_bounds(start_date, end_date, timezone_name)

    invoice_clauses = [Invoice.business_id == business_id, Invoice.status == "issued"]
    invoice_clauses.extend(_date_filter(Invoice.issue_date, start, end))
    sales = session.execute(select(
        Invoice.currency_code, func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)
    ).where(*invoice_clauses).group_by(Invoice.currency_code)).all()

    expense_clauses = [Expense.business_id == business_id]
    expense_clauses.extend(_date_filter(Expense.incurred_at, start, end))
    expense_statement = select(
        Expense.currency_code, func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0)
    ).where(*expense_clauses)
    expense_statement = apply_expense_visibility(
        expense_statement, business_id=business_id, role=membership.role
    )
    expenses = session.execute(
        expense_statement.group_by(Expense.currency_code)
    ).all()

    payment_clauses = [Payment.business_id == business_id]
    payment_clauses.extend(_date_filter(Payment.received_at, start, end))
    collected = session.execute(select(
        Payment.currency_code, func.count(Payment.id), func.coalesce(func.sum(Payment.amount), 0)
    ).where(*payment_clauses).group_by(Payment.currency_code)).all()

    outstanding_as_of_date = end_date or datetime.now(
        _timezone_zone(timezone_name)
    ).date()
    _, outstanding_cutoff_end = _day_bounds(
        outstanding_as_of_date, outstanding_as_of_date, timezone_name
    )
    payment_allocation_totals = (
        select(
            PaymentAllocation.payment_id.label("payment_id"),
            func.coalesce(func.sum(PaymentAllocation.amount), 0).label("allocated_total"),
        )
        .where(
            PaymentAllocation.business_id == business_id,
            PaymentAllocation.created_at < outstanding_cutoff_end,
        )
        .group_by(PaymentAllocation.payment_id)
        .subquery()
    )
    overallocated_payment_ids = select(Payment.id).join(
        payment_allocation_totals,
        payment_allocation_totals.c.payment_id == Payment.id,
    ).where(
        Payment.business_id == business_id,
        payment_allocation_totals.c.allocated_total > Payment.amount,
    )
    overallocated_payment_rows = session.execute(select(
        Payment.id, Payment.amount, payment_allocation_totals.c.allocated_total
    ).join(
        payment_allocation_totals,
        payment_allocation_totals.c.payment_id == Payment.id,
    ).where(
        Payment.business_id == business_id,
        payment_allocation_totals.c.allocated_total > Payment.amount,
    )).all()

    allocation_joins = (
        select(
            PaymentAllocation.invoice_id.label("invoice_id"),
            func.coalesce(func.sum(PaymentAllocation.amount), 0).label("allocated_total"),
        )
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
            Invoice.issue_date < outstanding_cutoff_end,
            PaymentAllocation.created_at < outstanding_cutoff_end,
            ~Payment.id.in_(overallocated_payment_ids),
            func.upper(Payment.currency_code) == func.upper(Invoice.currency_code),
            Payment.customer_id.is_not(None),
            Invoice.customer_id.is_not(None),
            Payment.customer_id == Invoice.customer_id,
        )
        .group_by(PaymentAllocation.invoice_id)
        .subquery()
    )
    # The dashboard balance is historical as-of the selected period end (or
    # business-local today when no end date is supplied), not a period-only cohort.
    outstanding_invoice_rows = session.execute(select(
        Invoice.id,
        Invoice.invoice_number,
        Invoice.currency_code,
        Invoice.total,
        func.coalesce(allocation_joins.c.allocated_total, 0),
    ).outerjoin(
        allocation_joins, allocation_joins.c.invoice_id == Invoice.id
    ).where(
        Invoice.business_id == business_id,
        Invoice.status == "issued",
        Invoice.issue_date < outstanding_cutoff_end,
    )).all()

    missing_issue_date_rows = session.execute(select(
        Invoice.id, Invoice.invoice_number
    ).where(
        Invoice.business_id == business_id,
        Invoice.status == "issued",
        Invoice.issue_date.is_(None),
    )).all()
    invalid_allocation_rows = session.execute(select(
        PaymentAllocation.invoice_id,
        Invoice.invoice_number,
        Invoice.currency_code,
        Payment.currency_code,
        Payment.customer_id,
        Invoice.customer_id,
        func.coalesce(func.sum(PaymentAllocation.amount), 0),
    ).join(
        Payment,
        (Payment.id == PaymentAllocation.payment_id)
        & (Payment.business_id == PaymentAllocation.business_id),
    ).join(
        Invoice,
        (Invoice.id == PaymentAllocation.invoice_id)
        & (Invoice.business_id == PaymentAllocation.business_id),
    ).where(
        PaymentAllocation.business_id == business_id,
        Payment.business_id == business_id,
        Invoice.business_id == business_id,
        Invoice.status == "issued",
        Invoice.issue_date < outstanding_cutoff_end,
        PaymentAllocation.created_at < outstanding_cutoff_end,
        or_(
            func.upper(Payment.currency_code) != func.upper(Invoice.currency_code),
            Payment.customer_id.is_(None),
            Invoice.customer_id.is_(None),
            Payment.customer_id != Invoice.customer_id,
        ),
    ).group_by(
        PaymentAllocation.invoice_id,
        Invoice.invoice_number,
        Invoice.currency_code,
        Payment.currency_code,
        Payment.customer_id,
        Invoice.customer_id,
    )).all()

    outstanding_totals: dict[str, Decimal] = {}
    data_quality_warnings = [
        {
            "invoice_id": str(invoice_id),
            "invoice_number": invoice_number,
            "type": "missing_invoice_issue_date",
            "message": "Historical as-of inclusion cannot be determined without an issue timestamp.",
        }
        for invoice_id, invoice_number in missing_issue_date_rows
    ]
    data_quality_warnings.extend({
        "payment_id": str(payment_id),
        "type": "allocations_exceed_payment_amount",
        "payment_amount": str(payment_amount),
        "allocated_amount": str(allocated_amount),
        "excess_allocated": str(Decimal(str(allocated_amount)) - Decimal(str(payment_amount))),
    } for payment_id, payment_amount, allocated_amount in overallocated_payment_rows)
    for invoice_id, invoice_number, currency, invoice_total, allocated_total in outstanding_invoice_rows:
        currency = currency.strip().upper()
        total = Decimal(str(invoice_total or 0))
        allocated_amount = Decimal(str(allocated_total or 0))
        outstanding_totals.setdefault(currency, ZERO)
        outstanding = total - allocated_amount
        if outstanding < ZERO:
            data_quality_warnings.append({
                "invoice_id": str(invoice_id),
                "invoice_number": invoice_number,
                "type": "allocations_exceed_invoice_total",
                "currency_code": currency,
                "invoice_total": str(total),
                "valid_allocated_amount": str(allocated_amount),
                "excess_allocated": str(abs(outstanding)),
            })
            continue
        outstanding_totals[currency] += outstanding

    for (invoice_id, invoice_number, invoice_currency, payment_currency,
         payment_customer_id, invoice_customer_id, allocated_amount) in invalid_allocation_rows:
        reasons = []
        if payment_currency.strip().upper() != invoice_currency.strip().upper():
            reasons.append("currency_mismatch")
        if (
            payment_customer_id is None
            or invoice_customer_id is None
            or payment_customer_id != invoice_customer_id
        ):
            reasons.append("customer_mismatch_or_missing")
        data_quality_warnings.append({
            "invoice_id": str(invoice_id),
            "invoice_number": invoice_number,
            "type": "invalid_payment_allocation",
            "reasons": reasons,
            "payment_currency": payment_currency,
            "invoice_currency": invoice_currency,
            "allocated_amount": str(allocated_amount),
        })

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
        "outstanding_as_of_date": outstanding_as_of_date.isoformat(),
        "outstanding_balances": [
            {"currency_code": currency, "total": str(total)}
            for currency, total in sorted(outstanding_totals.items())
        ],
        "data_quality_warnings": data_quality_warnings,
        "limitations": [
            "Currency totals are kept separate and are never converted.",
            "Current outstanding uses only allocations matching the invoice business, customer and currency.",
            "Invalid allocations and over-allocated invoices are surfaced in data_quality_warnings and are not silently clamped.",
            "Outstanding balances are current balances; use the receivables-aging as-of date for a historical cutoff.",
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
        membership = _authorize(session, principal, business_id)
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
    expense_query = apply_expense_visibility(
        expense_query, business_id=business_id, role=membership.role
    )
    if start_ts is not None:
        invoice_query = invoice_query.where(Invoice.issue_date >= start_ts)
        expense_query = expense_query.where(Expense.incurred_at >= start_ts)
    if end_ts is not None:
        invoice_query = invoice_query.where(Invoice.issue_date < end_ts)
        expense_query = expense_query.where(Expense.incurred_at < end_ts)

    revenue_rows = session.execute(invoice_query.group_by(Invoice.currency_code)).all()
    expense_rows = session.execute(expense_query.group_by(Expense.currency_code)).all()

    # Returns are shown separately and are deliberately not netted from revenue:
    # the schema does not yet allocate tax/discounts or link credit notes/refunds.
    # Period membership follows the original invoice issue date, not return creation
    # time, because the model does not persist an approval timestamp.
    return_query = select(
        Invoice.currency_code,
        func.count(SalesReturn.id),
        func.coalesce(func.sum(SalesReturn.total), 0),
    ).join(
        Invoice,
        (Invoice.id == SalesReturn.invoice_id) & (Invoice.business_id == SalesReturn.business_id),
    ).where(
        SalesReturn.business_id == business_id,
        SalesReturn.status == "approved",
        Invoice.status == "issued",
    )
    if start_ts is not None:
        return_query = return_query.where(Invoice.issue_date >= start_ts)
    if end_ts is not None:
        return_query = return_query.where(Invoice.issue_date < end_ts)
    return_rows = session.execute(return_query.group_by(Invoice.currency_code)).all()

    revenue = {currency: (int(count), Decimal(str(total))) for currency, count, total in revenue_rows}
    expenses = {currency: (int(count), Decimal(str(total))) for currency, count, total in expense_rows}
    approved_returns = {
        currency: (int(count), Decimal(str(total))) for currency, count, total in return_rows
    }
    currencies = sorted(set(revenue) | set(expenses) | set(approved_returns))
    rows = []
    for currency in currencies:
        revenue_count, revenue_total = revenue.get(currency, (0, Decimal("0")))
        expense_count, expense_total = expenses.get(currency, (0, Decimal("0")))
        return_count, return_total = approved_returns.get(currency, (0, Decimal("0")))
        rows.append({
            "currency_code": currency,
            "revenue": str(revenue_total),
            "revenue_invoice_count": revenue_count,
            "approved_return_total": str(return_total),
            "approved_return_count": return_count,
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
        "revenue_basis": "gross issued invoice totals before sales returns; stored invoice tax is included",
        "limitations": [
            "Revenue is based on issued invoice totals, not cash collected.",
            "Invoice totals include stored tax amounts; approved sales returns are not netted from this figure.",
            "This result subtracts recorded expenses only and excludes cost of goods sold because product purchase costs are not yet linked to sales.",
            "Tax liability treatment and tax allocation to returns are not represented as a complete accounting ledger.",
            "Currencies are kept separate and never converted or combined.",
        ],
    }
