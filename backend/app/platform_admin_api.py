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
from app.firebase_auth import get_firebase_admin_app
from app.models import (
    AuditEvent, Business, BusinessMembership, Invoice, Payment,
    PlatformAdminAuditEvent, PlatformRoleGrant,
)
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


PLATFORM_ROOT_PERMISSIONS = frozenset({
    "view_overview", "view_workspaces", "view_audit", "view_system_status",
    "view_users", "manage_workspace_status", "manage_platform_roles",
})
PLATFORM_ROLE_PERMISSIONS = {
    "platform_viewer": frozenset({
        "view_overview", "view_workspaces", "view_audit", "view_system_status",
    }),
    "workspace_operator": frozenset({
        "view_overview", "view_workspaces", "view_audit", "view_system_status",
        "manage_workspace_status",
    }),
    "user_manager": frozenset({
        "view_overview", "view_workspaces", "view_audit", "view_system_status",
        "view_users",
    }),
}
PLATFORM_ROLE_LABELS = {
    "platform_viewer": "Platform Viewer",
    "workspace_operator": "Workspace Operator",
    "user_manager": "User Manager",
}


def _configured_super_admin_subjects() -> set[str]:
    configured = os.getenv("PLATFORM_SUPER_ADMIN_UIDS", "")
    return {
        item.strip()
        for item in configured.replace(";", ",").split(",")
        if item.strip()
    }


def _platform_roles_and_permissions(
    principal: AuthenticatedPrincipal, session: Session
) -> tuple[list[str], frozenset[str], bool]:
    """Resolve grants only from the server DB or the protected bootstrap allowlist."""
    if principal.subject in _configured_super_admin_subjects():
        return ["platform_super_admin"], PLATFORM_ROOT_PERMISSIONS, True

    grants = session.scalars(
        select(PlatformRoleGrant.role).where(
            PlatformRoleGrant.user_subject == principal.subject,
            PlatformRoleGrant.is_active.is_(True),
        )
    ).all()
    roles = sorted({role for role in grants if role in PLATFORM_ROLE_PERMISSIONS})
    permissions: set[str] = set()
    for role in roles:
        permissions.update(PLATFORM_ROLE_PERMISSIONS[role])
    return roles, frozenset(permissions), False


def _deny_platform_access(principal: AuthenticatedPrincipal, request: Request) -> None:
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


def _require_platform_permission(
    principal: AuthenticatedPrincipal,
    request: Request,
    session: Session,
    permission: str,
) -> tuple[list[str], frozenset[str], bool]:
    roles, permissions, is_super_admin = _platform_roles_and_permissions(principal, session)
    if permission not in permissions:
        _deny_platform_access(principal, request)
    return roles, permissions, is_super_admin


def _require_platform_admin(
    principal: AuthenticatedPrincipal, request: Request, session: Session
) -> tuple[list[str], frozenset[str], bool]:
    """Compatibility guard for read-only platform sections."""
    return _require_platform_permission(principal, request, session, "view_overview")


def _require_platform_super_admin(
    principal: AuthenticatedPrincipal, request: Request
) -> None:
    """Only the out-of-band bootstrap super-admin may assign delegated platform roles."""
    if principal.subject not in _configured_super_admin_subjects():
        _deny_platform_access(principal, request)


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _csv_safe_cell(value: object | None) -> str:
    """Neutralize spreadsheet formulas in untrusted CSV text cells."""
    text_value = "" if value is None else str(value)
    significant = text_value.lstrip(" \t\r\n")
    if text_value.startswith(("\t", "\r", "\n")) or significant.startswith(("=", "+", "-", "@")):
        return "'" + text_value
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
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Return the caller's effective platform role and permission set."""
    roles, permissions, is_super_admin = _platform_roles_and_permissions(principal, session)
    if not permissions:
        _deny_platform_access(principal, request)
    return {
        "is_platform_admin": True,
        "is_platform_super_admin": is_super_admin,
        "subject": principal.subject,
        "roles": roles,
        "permissions": sorted(permissions),
    }



@router.get("/system-status")
def platform_admin_system_status(
    request: Request,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Expose only safe runtime/readiness metadata to an authorized platform admin."""
    _require_platform_permission(principal, request, session, "view_system_status")

    checked_at = datetime.now(timezone.utc).isoformat()
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        database_status = "unconfigured"
    else:
        try:
            with factory() as status_session:
                status_session.execute(text("SELECT 1"))
            database_status = "healthy"
        except Exception:
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
    _require_platform_admin(principal, request, session)

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
    _require_platform_admin(principal, request, session)

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
    _require_platform_admin(principal, request, session)
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
    _require_platform_permission(principal, request, session, "manage_workspace_status")
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
    _require_platform_admin(principal, request, session)
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
    _require_platform_admin(principal, request, session)
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
    writer = csv.writer(output, lineterminator="\r\n")
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
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="platform-audit-events.csv"',
            "Cache-Control": "no-store",
            "X-Export-Row-Count": str(len(rows)),
            "X-Export-Truncated": "true" if truncated else "false",
        },
    )

class PlatformRoleChangeInput(BaseModel):
    role: Literal["platform_viewer", "workspace_operator", "user_manager"]
    active: bool
    reason: str = Field(min_length=3, max_length=500)


def _firebase_timestamp(milliseconds: object) -> str | None:
    if not isinstance(milliseconds, (int, float)) or milliseconds <= 0:
        return None
    try:
        return datetime.fromtimestamp(float(milliseconds) / 1000, tz=timezone.utc).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def _platform_user_subject(project_id: str, uid: str) -> str:
    return f"firebase:{project_id}:{uid}"


def _platform_user_payload(user: object, project_id: str, roles_by_subject: dict[str, list[str]],
                           membership_by_subject: dict[str, list[dict]]) -> dict:
    uid = str(getattr(user, "uid", ""))
    subject = _platform_user_subject(project_id, uid)
    metadata = getattr(user, "user_metadata", None)
    is_super_admin = subject in _configured_super_admin_subjects()
    roles = ["platform_super_admin"] if is_super_admin else roles_by_subject.get(subject, [])
    return {
        "uid": uid,
        "subject": subject,
        "display_name": getattr(user, "display_name", None) or "",
        "email": getattr(user, "email", None) or "",
        "email_verified": bool(getattr(user, "email_verified", False)),
        "disabled": bool(getattr(user, "disabled", False)),
        "created_at": _firebase_timestamp(getattr(metadata, "creation_timestamp", None)),
        "last_sign_in_at": _firebase_timestamp(getattr(metadata, "last_sign_in_timestamp", None)),
        "is_platform_super_admin": is_super_admin,
        "roles": roles,
        "memberships": membership_by_subject.get(subject, []),
    }


def _load_user_role_and_membership_maps(
    session: Session, subjects: list[str]
) -> tuple[dict[str, list[str]], dict[str, list[dict]]]:
    if not subjects:
        return {}, {}
    grants = session.scalars(
        select(PlatformRoleGrant).where(
            PlatformRoleGrant.user_subject.in_(subjects),
            PlatformRoleGrant.is_active.is_(True),
        ).order_by(PlatformRoleGrant.role.asc())
    ).all()
    roles_by_subject: dict[str, list[str]] = {}
    for grant in grants:
        if grant.role in PLATFORM_ROLE_PERMISSIONS:
            roles_by_subject.setdefault(grant.user_subject, []).append(grant.role)

    memberships = session.execute(
        select(BusinessMembership, Business.name)
        .join(Business, Business.id == BusinessMembership.business_id)
        .where(BusinessMembership.user_subject.in_(subjects))
        .order_by(Business.name.asc(), BusinessMembership.role.asc())
    ).all()
    membership_by_subject: dict[str, list[dict]] = {}
    for membership, business_name in memberships:
        membership_by_subject.setdefault(membership.user_subject, []).append({
            "business_id": str(membership.business_id),
            "business_name": business_name,
            "role": membership.role.value,
        })
    return roles_by_subject, membership_by_subject


@router.get("/users")
def list_platform_users(
    request: Request,
    q: str | None = Query(default=None, max_length=254),
    page_token: str | None = Query(default=None, max_length=4096),
    limit: int = Query(default=25, ge=1, le=100),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """List all Firebase Auth accounts, including users with no workspace membership.

    Firebase Auth supports opaque cursor pagination. A non-empty q is an exact
    email or UID lookup, not a misleading server-wide substring search.
    """
    _require_platform_permission(principal, request, session, "view_users")
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise HTTPException(status_code=503, detail="Firebase user directory is not configured.")

    from firebase_admin import auth

    firebase_app = get_firebase_admin_app()
    next_page_token: str | None = None
    try:
        if q and q.strip():
            query = q.strip()
            try:
                user = (
                    auth.get_user_by_email(query, app=firebase_app)
                    if "@" in query else auth.get_user(query, app=firebase_app)
                )
            except Exception as exc:
                if type(exc).__name__ in {"UserNotFoundError", "UserNotFoundException"}:
                    user = None
                else:
                    _log_security_event(
                        "platform_admin.user_directory_failed", request, principal.subject,
                        "error", target_type="user_directory", level=logging.ERROR,
                    )
                    raise HTTPException(status_code=503, detail="Firebase user directory is temporarily unavailable.") from exc
            users = [user] if user is not None else []
        else:
            page = auth.list_users(page_token=page_token or None, max_results=limit, app=firebase_app)
            users = list(page.users)
            next_page_token = page.next_page_token or None
    except HTTPException:
        raise
    except Exception as exc:
        _log_security_event(
            "platform_admin.user_directory_failed", request, principal.subject,
            "error", target_type="user_directory", level=logging.ERROR,
        )
        raise HTTPException(status_code=503, detail="Firebase user directory is temporarily unavailable.") from exc

    subjects = [_platform_user_subject(project_id, str(getattr(user, "uid", ""))) for user in users]
    roles_by_subject, membership_by_subject = _load_user_role_and_membership_maps(session, subjects)
    return {
        "items": [
            _platform_user_payload(user, project_id, roles_by_subject, membership_by_subject)
            for user in users
            if getattr(user, "uid", None)
        ],
        "limit": limit,
        "next_page_token": next_page_token,
        "has_more": bool(next_page_token),
        "search_mode": "exact_email_or_uid" if q and q.strip() else "cursor_pagination",
        "limitations": [
            "Firebase Auth is authoritative for account identity; workspace memberships are shown separately.",
            "A search query matches an exact email or UID. Blank search lists every account in cursor-paginated batches.",
            "Passwords, ID tokens, refresh tokens and provider credentials are never returned.",
        ],
    }


@router.post("/users/{user_uid}/roles")
def change_platform_user_role(
    user_uid: str,
    body: PlatformRoleChangeInput,
    request: Request,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Grant or revoke a bounded delegated role; root admin cannot be granted in-app."""
    _require_platform_super_admin(principal, request)
    reason = body.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=422, detail="A meaningful reason (at least 3 characters) is required.")
    if not user_uid or len(user_uid) > 128 or "/" in user_uid:
        raise HTTPException(status_code=422, detail="A valid Firebase user UID is required.")

    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise HTTPException(status_code=503, detail="Firebase user directory is not configured.")
    target_subject = _platform_user_subject(project_id, user_uid)
    if target_subject == principal.subject:
        raise HTTPException(status_code=409, detail="Administrators cannot change their own platform grants.")
    if target_subject in _configured_super_admin_subjects():
        raise HTTPException(status_code=409, detail="Bootstrap super-admin access is managed outside this screen.")

    if body.active:
        from firebase_admin import auth
        firebase_app = get_firebase_admin_app()
        try:
            auth.get_user(user_uid, app=firebase_app)
        except Exception as exc:
            if type(exc).__name__ in {"UserNotFoundError", "UserNotFoundException"}:
                raise HTTPException(status_code=404, detail="Firebase user not found.") from exc
            _log_security_event(
                "platform_admin.user_role_change_failed", request, principal.subject,
                "error", target_type="user", target_id=user_uid, level=logging.ERROR,
            )
            raise HTTPException(status_code=503, detail="Firebase user directory is temporarily unavailable.") from exc

    try:
        grant = session.scalar(
            select(PlatformRoleGrant).where(
                PlatformRoleGrant.user_subject == target_subject,
                PlatformRoleGrant.role == body.role,
            ).with_for_update()
        )
        changed = grant is None or bool(grant.is_active) != body.active
        if not changed:
            return {
                "changed": False, "active": body.active, "role": body.role,
                "message": "The requested role state is already in effect.",
            }

        now = datetime.now(timezone.utc)
        if grant is None:
            grant = PlatformRoleGrant(
                user_subject=target_subject,
                role=body.role,
                is_active=body.active,
                granted_by_subject=principal.subject,
                granted_at=now,
                revoked_by_subject=None if body.active else principal.subject,
                revoked_at=None if body.active else now,
                last_reason=reason,
            )
            session.add(grant)
        else:
            grant.is_active = body.active
            grant.last_reason = reason
            if body.active:
                grant.granted_by_subject = principal.subject
                grant.granted_at = now
                grant.revoked_by_subject = None
                grant.revoked_at = None
            else:
                grant.revoked_by_subject = principal.subject
                grant.revoked_at = now

        action = "platform.user_role.granted" if body.active else "platform.user_role.revoked"
        session.add(PlatformAdminAuditEvent(
            actor_subject=principal.subject,
            action=action,
            target_subject=target_subject,
            role=body.role,
            reason=reason,
        ))
        session.commit()
    except HTTPException:
        session.rollback()
        raise
    except Exception as exc:
        session.rollback()
        _log_security_event(
            "platform_admin.user_role_change_failed", request, principal.subject,
            "error", target_type="user", target_id=user_uid, level=logging.ERROR,
        )
        raise HTTPException(status_code=500, detail="The platform role change could not be saved.") from exc

    _log_security_event(
        "platform_admin.user_role_changed", request, principal.subject,
        "success", target_type="user", target_id=user_uid,
    )
    return {
        "changed": True, "active": body.active, "role": body.role,
        "message": "Platform access change saved and recorded in the audit log.",
    }


@router.get("/role-audit-events")
def list_platform_role_audit_events(
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000000),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
) -> dict:
    """Read-only, paginated history of delegated platform role changes."""
    _require_platform_admin(principal, request, session)
    total = int(session.scalar(select(func.count(PlatformAdminAuditEvent.id))) or 0)
    events = session.scalars(
        select(PlatformAdminAuditEvent)
        .order_by(PlatformAdminAuditEvent.created_at.desc(), PlatformAdminAuditEvent.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {
        "items": [{
            "id": str(event.id),
            "actor_subject": event.actor_subject,
            "action": event.action,
            "target_subject": event.target_subject,
            "role": event.role,
            "reason": event.reason,
            "created_at": _iso(event.created_at),
        } for event in events],
        "total": total,
        "limit": limit,
        "offset": offset,
    }

