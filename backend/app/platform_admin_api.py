"""Platform-wide administration, isolated from workspace OWNER/STAFF roles.

Platform access is granted only by an explicit server-side allowlist of verified
Firebase principals. There is intentionally no self-service role assignment.
"""
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import AuditEvent, Business, BusinessMembership, Invoice, Payment
from app.security import AuthenticatedPrincipal

router = APIRouter(prefix="/api/v1/platform-admin", tags=["platform administration"])


def _require_platform_admin(principal: AuthenticatedPrincipal) -> None:
    """Fail closed unless the verified identity is explicitly allowlisted by ops."""
    configured = os.getenv("PLATFORM_SUPER_ADMIN_UIDS", "")
    allowed_subjects = {
        item.strip()
        for item in configured.replace(";", ",").split(",")
        if item.strip()
    }
    if not allowed_subjects or principal.subject not in allowed_subjects:
        raise HTTPException(status_code=403, detail="Platform administrator access is not granted.")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _business_payload(business: Business, member_count: int | None = None) -> dict:
    payload = {
        "id": str(business.id),
        "name": business.name,
        "currency_code": business.currency_code,
        "locale": business.locale,
        "timezone": business.timezone,
        "contact_email": business.contact_email,
        "phone": business.phone,
        "is_active": bool(business.is_active),
        "created_at": _iso(business.created_at),
        "updated_at": _iso(business.updated_at),
    }
    if member_count is not None:
        payload["member_count"] = int(member_count)
    return payload


class BusinessStatusInput(BaseModel):
    is_active: bool
    reason: str = Field(min_length=3, max_length=500)


@router.get("/access")
def platform_admin_access(
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict[str, bool]:
    """A minimal authorization probe used to decide whether to render admin navigation."""
    _require_platform_admin(principal)
    return {"is_platform_admin": True}


@router.get("/overview")
def platform_admin_overview(
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Return real platform-level counts; financial totals remain separated by currency."""
    _require_platform_admin(principal)

    business_total = int(session.scalar(select(func.count(Business.id))) or 0)
    active_businesses = int(session.scalar(
        select(func.count(Business.id)).where(Business.is_active.is_(True))
    ) or 0)
    membership_total = int(session.scalar(select(func.count(BusinessMembership.id))) or 0)
    distinct_users = int(session.scalar(
        select(func.count(func.distinct(BusinessMembership.user_subject)))
    ) or 0)
    invoice_total = int(session.scalar(select(func.count(Invoice.id))) or 0)
    payment_total = int(session.scalar(select(func.count(Payment.id))) or 0)
    audit_total = int(session.scalar(select(func.count(AuditEvent.id))) or 0)

    invoice_rows = session.execute(
        select(
            Invoice.currency_code,
            Invoice.status,
            func.count(Invoice.id),
            func.coalesce(func.sum(Invoice.total), 0),
        )
        .group_by(Invoice.currency_code, Invoice.status)
        .order_by(Invoice.currency_code, Invoice.status)
    ).all()
    payment_rows = session.execute(
        select(
            Payment.currency_code,
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), 0),
        )
        .group_by(Payment.currency_code)
        .order_by(Payment.currency_code)
    ).all()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "businesses": {
            "total": business_total,
            "active": active_businesses,
            "inactive": max(0, business_total - active_businesses),
        },
        "users": {"distinct_subjects": distinct_users, "memberships": membership_total},
        "invoices": {
            "count": invoice_total,
            "by_currency_and_status": [
                {
                    "currency_code": currency,
                    "status": status,
                    "count": int(count),
                    "total": str(total),
                }
                for currency, status, count, total in invoice_rows
            ],
        },
        "payments": {
            "count": payment_total,
            "by_currency": [
                {"currency_code": currency, "count": int(count), "total": str(total)}
                for currency, count, total in payment_rows
            ],
        },
        "audit_events": {"count": audit_total},
        "limitations": [
            "User counts are distinct verified identity subjects with a workspace membership; Firebase Auth accounts without a membership are not enumerable by this API.",
            "Financial metrics are read-only and grouped by currency. This API does not change invoices, payments, allocations, or balances.",
        ],
    }


@router.get("/businesses")
def list_platform_businesses(
    q: str | None = Query(default=None, max_length=160),
    status: Literal["all", "active", "inactive"] = Query(default="all"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000000),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Search platform workspaces with bounded pagination and no destructive operations."""
    _require_platform_admin(principal)

    member_count = (
        select(func.count(BusinessMembership.id))
        .where(BusinessMembership.business_id == Business.id)
        .scalar_subquery()
    )
    statement = select(Business, member_count.label("member_count"))
    count_statement = select(func.count(Business.id))
    if status == "active":
        statement = statement.where(Business.is_active.is_(True))
        count_statement = count_statement.where(Business.is_active.is_(True))
    elif status == "inactive":
        statement = statement.where(Business.is_active.is_(False))
        count_statement = count_statement.where(Business.is_active.is_(False))
    if q and q.strip():
        term = f"%{q.strip()}%"
        predicate = or_(
            Business.name.ilike(term),
            Business.contact_email.ilike(term),
            Business.phone.ilike(term),
        )
        statement = statement.where(predicate)
        count_statement = count_statement.where(predicate)

    total = int(session.scalar(count_statement) or 0)
    rows = session.execute(
        statement.order_by(Business.created_at.desc(), Business.id).limit(limit).offset(offset)
    ).all()
    return {
        "items": [_business_payload(business, count) for business, count in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/businesses/{business_id}")
def platform_business_details(
    business_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Read business metadata and membership roles; never returns credentials or tokens."""
    _require_platform_admin(principal)
    business = session.get(Business, business_id)
    if business is None:
        raise HTTPException(status_code=404, detail="Business not found.")

    memberships = session.scalars(
        select(BusinessMembership)
        .where(BusinessMembership.business_id == business_id)
        .order_by(BusinessMembership.created_at, BusinessMembership.id)
    ).all()
    return {
        "business": _business_payload(business, len(memberships)),
        "memberships": [
            {
                "id": str(item.id),
                "user_subject": item.user_subject,
                "role": item.role.value,
                "created_at": _iso(item.created_at),
            }
            for item in memberships
        ],
        "limitations": [
            "Names and emails are not available because the application has no local user profile table or Firebase Admin user-directory integration.",
            "Memberships are read-only here. Change roles through the existing owner-managed workspace membership workflow.",
        ],
    }


@router.patch("/businesses/{business_id}/status")
def update_platform_business_status(
    business_id: UUID,
    body: BusinessStatusInput,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Activate/deactivate workspace access with a required reason and an audit event."""
    _require_platform_admin(principal)
    reason = body.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=422, detail="A meaningful reason (at least 3 characters) is required.")

    try:
        business = session.scalar(
            select(Business).where(Business.id == business_id).with_for_update()
        )
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found.")
        if bool(business.is_active) == body.is_active:
            return {
                "business": _business_payload(business),
                "changed": False,
                "message": "Business status was already set to the requested value.",
            }

        business.is_active = body.is_active
        session.add(AuditEvent(
            business_id=business.id,
            actor_subject=principal.subject,
            action="platform.business.activated" if body.is_active else "platform.business.deactivated",
            target_type="business",
            target_id=str(business.id),
            change_summary=reason,
        ))
        session.commit()
        session.refresh(business)
        return {
            "business": _business_payload(business),
            "changed": True,
            "message": "Business status updated and recorded in the audit log.",
        }
    except HTTPException:
        session.rollback()
        raise
    except Exception:
        session.rollback()
        raise


@router.get("/audit-events")
def platform_audit_events(
    action: str | None = Query(default=None, max_length=80),
    actor_subject: str | None = Query(default=None, max_length=128),
    business_id: UUID | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000000),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Read-only, paginated platform audit stream; audit mutations are not exposed."""
    _require_platform_admin(principal)
    if created_after and created_before and created_after > created_before:
        raise HTTPException(status_code=422, detail="created_after must not be later than created_before.")

    statement = select(AuditEvent, Business.name).join(
        Business, Business.id == AuditEvent.business_id
    )
    count_statement = select(func.count(AuditEvent.id))
    predicates = []
    if action and action.strip():
        predicates.append(AuditEvent.action.ilike(f"%{action.strip()}%"))
    if actor_subject and actor_subject.strip():
        predicates.append(AuditEvent.actor_subject.ilike(f"%{actor_subject.strip()}%"))
    if business_id:
        predicates.append(AuditEvent.business_id == business_id)
    if created_after:
        predicates.append(AuditEvent.created_at >= created_after)
    if created_before:
        predicates.append(AuditEvent.created_at <= created_before)
    if predicates:
        statement = statement.where(*predicates)
        count_statement = count_statement.where(*predicates)

    total = int(session.scalar(count_statement) or 0)
    rows = session.execute(
        statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit).offset(offset)
    ).all()
    return {
        "items": [
            {
                "id": str(event.id),
                "business_id": str(event.business_id),
                "business_name": business_name,
                "actor_subject": event.actor_subject,
                "action": event.action,
                "target_type": event.target_type,
                "target_id": event.target_id,
                "change_summary": event.change_summary,
                "created_at": _iso(event.created_at),
            }
            for event, business_name in rows
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
