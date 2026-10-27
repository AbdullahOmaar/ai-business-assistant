"""Platform-wide administration, isolated from workspace OWNER/STAFF roles.

Platform access is granted only by an explicit server-side allowlist of verified
Firebase principals. There is intentionally no self-service role assignment.
"""
import csv
import io
import json
import logging
import os
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import AuditEvent, Business, BusinessMembership, Invoice, Payment
from app.security import AuthenticatedPrincipal

router = APIRouter(prefix="/api/v1/platform-admin", tags=["platform administration"])
logger = logging.getLogger(__name__)


def _log_security_event(
    event: str,
    request: Request,
    actor_subject: str,
    outcome: str,
    *,
    target_type: str | None = None,
    target_id: str | None = None,
    level: int = logging.INFO,
) -> None:
    """Emit a safe single-line JSON security event without credentials or request payloads."""
    payload = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": getattr(request.state, "request_id", None),
        "actor_subject": actor_subject,
        "outcome": outcome,
        "target_type": target_type,
        "target_id": target_id,
    }
    logger.log(level, json.dumps(payload, separators=(",", ":"), ensure_ascii=True))


def _require_platform_admin(principal: AuthenticatedPrincipal, request: Request) -> None:
    """Fail closed unless the verified identity is explicitly allowlisted by ops."""
    configured = os.getenv("PLATFORM_SUPER_ADMIN_UIDS", "")
    allowed_subjects = {
        item.strip()
        for item in configured.replace(";", ",").split(",")
        if item.strip()
    }
    if not allowed_subjects or principal.subject not in allowed_subjects:
        _log_security_event(
            "platform_admin.access_denied",
            request,
            principal.subject,
            "denied",
            target_type="route",
            target_id=request.url.path,
            level=logging.WARNING,
        )
        raise HTTPException(status_code=403, detail="Platform administrator access is not granted.")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _csv_safe_cell(value: object | None) -> str:
    \"\"\"Neutralize spreadsheet formulas in untrusted CSV text cells.\"\"\"
    text_value = \"\" if value is None else str(value)
    significant = text_value.lstrip(\" \\t\\r\\n\")
    if text_value.startswith((\"\\t\", \"\\r\", \"\\n\")) or significant.startswith((\"=\", \"+\", \"-\", \"@\")):
        return \"'\" + text_value
    return text_value


def _normalize_datetime(value: datetime | None) -> datetime | None:
    """Treat timezone-less query values as UTC and normalize aware values to UTC."""
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


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
    request: Request,
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict[str, bool]:
    """A minimal authorization probe used to decide whether to render admin navigation."""
    _require_platform_admin(principal, request)
    return {"is_platform_admin": True}


@router.get("/system-status")
def platform_admin_system_status(
    request: Request,
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Expose only safe runtime/readiness metadata to an authorized platform admin."""
    _require_platform_admin(principal, request)

    checked_at = datetime.now(timezone.utc).isoformat()
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        database_status = "unconfigured"
    else:
        try:
            with factory() as session:
                session.execute(text("SELECT 1"))
            database_status = "healthy"
        except Exception:
            # Never expose driver messages, DSNs, schema names, or exception text.
            database_status = "unavailable"

    project_configured = bool(os.getenv("FIREBASE_PROJECT_ID", "").strip())
    resolver_configured = getattr(request.app.state, "principal_resolver", None) is not None
    identity_status = (
        "configured" if project_configured and resolver_configured else "unconfigured"
    )
    overall_status = (
        "healthy" if database_status == "healthy" and identity_status == "configured"
        else "degraded"
    )
    commit = (
        os.getenv("VERCEL_GIT_COMMIT_SHA", "").strip()
        or os.getenv("GITHUB_SHA", "").strip()
        or "unknown"
    )
    return {
        "status": overall_status,
        "checked_at": checked_at,
        "release": {
            "version": request.app.version,
            "commit": commit[:12],
            "environment": os.getenv("VERCEL_ENV", "unknown"),
        },
        "dependencies": {
            "database": database_status,
            "identity_verifier": identity_status,
        },
        "limitations": [
            "Identity status reports configuration only; it does not validate a specific Firebase token.",
            "This endpoint does not expose secrets, connection strings, customer data, or exception details.",
        ],
    }


@router.get("/overview")
def platform_admin_overview(
    request: Request,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Return real platform-level counts; financial totals remain separated by currency."""
    _require_platform_admin(principal, request)

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
    request: Request,
    q: str | None = Query(default=None, max_length=160),
    status: Literal["all", "active", "inactive"] = Query(default="all"),
    sort_by: Literal["created_at", "name", "members"] = Query(default="created_at"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000000),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Search platform workspaces with bounded pagination and no destructive operations."""
    _require_platform_admin(principal, request)

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
    sort_columns = {
        "created_at": Business.created_at,
        "name": Business.name,
        "members": member_count,
    }
    sort_column = sort_columns[sort_by]
    sort_expression = sort_column.desc() if sort_order == "desc" else sort_column.asc()
    rows = session.execute(
        statement.order_by(sort_expression, Business.id.asc()).limit(limit).offset(offset)
    ).all()
    return {
        "items": [_business_payload(business, count) for business, count in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "sort_by": sort_by,
        "sort_order": sort_order,
    }


@router.get("/businesses/{business_id}")
def platform_business_details(
    business_id: UUID,
    request: Request,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Read business metadata and membership roles; never returns credentials or tokens."""
    _require_platform_admin(principal, request)
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
    request: Request,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Activate/deactivate workspace access with a required reason and an audit event."""
    _require_platform_admin(principal, request)
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
        _log_security_event(
            "platform_admin.business_status_changed",
            request,
            principal.subject,
            "success",
            target_type="business",
            target_id=str(business.id),
        )
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
    request: Request,
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
    _require_platform_admin(principal, request)
    created_after = _normalize_datetime(created_after)
    created_before = _normalize_datetime(created_before)
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


@router.get("/audit-events/export.csv")
def export_platform_audit_events(
    request: Request,
    action: str | None = Query(default=None, max_length=80),
    actor_subject: str | None = Query(default=None, max_length=128),
    business_id: UUID | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    limit: int = Query(default=1000, ge=1, le=5000),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> Response:
    """Export a bounded, redacted platform audit view; export activity is security-logged."""
    _require_platform_admin(principal, request)
    created_after = _normalize_datetime(created_after)
    created_before = _normalize_datetime(created_before)
    if created_after and created_before and created_after > created_before:
        raise HTTPException(status_code=422, detail="created_after must not be later than created_before.")

    statement = select(AuditEvent, Business.name).join(
        Business, Business.id == AuditEvent.business_id
    )
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

    rows = session.execute(
        statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit + 1)
    ).all()
    truncated = len(rows) > limit
    rows = rows[:limit]

    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\\r\\n")
    writer.writerow(("created_at", "action", "actor_subject", "business_id", "business_name", "target_type", "target_id"))
    for event, business_name in rows:
        writer.writerow((
            _csv_safe_cell(_iso(event.created_at)),
            _csv_safe_cell(event.action),
            _csv_safe_cell(event.actor_subject),
            _csv_safe_cell(str(event.business_id)),
            _csv_safe_cell(business_name),
            _csv_safe_cell(event.target_type),
            _csv_safe_cell(event.target_id),
        ))

    _log_security_event(
        "platform_admin.audit_exported",
        request,
        principal.subject,
        "success",
        target_type="platform_audit",
        target_id=str(business_id) if business_id else "filtered",
    )
    return Response(
        content="\\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="platform-audit-events.csv"',
            "Cache-Control": "no-store",
            "X-Export-Row-Count": str(len(rows)),
            "X-Export-Truncated": "true" if truncated else "false",
        },
    )
