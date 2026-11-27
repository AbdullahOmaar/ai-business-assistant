"""Extended business endpoints: recurring invoices, pricing rules, notifications and settings (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy import (
    select,
)
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.extended_common import (
    NotificationInput,
    PricingRuleInput,
    ScheduleInput,
    SettingInput,
    _authorized,
    _commit,
    _dict,
    _validated_schedule_timezone,
    _validated_setting_key,
    router,
)
from app.models import (
    AuditEvent,
    BusinessSetting,
    Notification,
    PricingRule,
    RecurringInvoiceSchedule,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
)
from app.services import WorkflowError


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

