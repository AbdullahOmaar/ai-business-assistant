"""3A-417 / B1 (3A-703): PUT /settings/{setting_key} writes a business
audit event.

Before this fix the settings upsert committed with no AuditEvent row —
the last named audit gap in docs/SECURITY_ROUTE_INVENTORY.md. The event
names the setting KEY only; the value is never copied into the audit
trail (AuditEvent callers must redact sensitive values).
"""

from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


def _environment():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.session_factory = factory
    subject = {"value": "settings-owner"}

    def resolver(request):
        return AuthenticatedPrincipal(subject["value"])

    app.state.principal_resolver = resolver
    return factory, subject, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def _events(factory, business_id: UUID):
    # No ORDER BY: created_at is a server-side timestamp with one-second
    # resolution on SQLite, so two events from one test can tie and any
    # ordering assertion would be flaky. Callers match events by action.
    with factory() as session:
        return session.scalars(
            select(AuditEvent).where(AuditEvent.business_id == business_id)
        ).all()


def test_setting_create_and_update_write_audit_events_without_the_value():
    factory, _subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business = client.post(
            "/api/v1/businesses", json={"name": "Settings Audit", "currency_code": "EGP"}
        )
        assert business.status_code == 201, business.text
        business_id = UUID(business.json()["id"])
        base = f"/api/v1/businesses/{business_id}"

        created = client.put(f"{base}/settings/audit_probe", json={"setting_value": "first"})
        assert created.status_code == 200, created.text
        events = _events(factory, business_id)
        assert len(events) == 1
        event = events[0]
        assert event.action == "setting.created"
        assert event.target_type == "business_setting"
        assert event.target_id == created.json()["id"]
        assert event.actor_subject == "settings-owner"
        assert event.change_summary == "Setting audit_probe created"
        assert "first" not in (event.change_summary or "")

        updated = client.put(f"{base}/settings/audit_probe", json={"setting_value": "second"})
        assert updated.status_code == 200, updated.text
        events = _events(factory, business_id)
        assert len(events) == 2
        by_action = {event.action: event for event in events}
        assert set(by_action) == {"setting.created", "setting.updated"}
        assert by_action["setting.updated"].change_summary == "Setting audit_probe updated"
        assert "second" not in (by_action["setting.updated"].change_summary or "")
    finally:
        _restore(previous_factory, previous_resolver)


def test_rejected_and_denied_setting_writes_leave_no_audit_event():
    factory, subject, previous_factory, previous_resolver = _environment()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business = client.post(
            "/api/v1/businesses", json={"name": "Settings Denied", "currency_code": "EGP"}
        )
        assert business.status_code == 201, business.text
        business_id = UUID(business.json()["id"])
        base = f"/api/v1/businesses/{business_id}"

        # Secret-like keys are rejected by validation before any write.
        rejected = client.put(f"{base}/settings/api_token", json={"setting_value": "x"})
        assert rejected.status_code == 422, rejected.text
        assert _events(factory, business_id) == []

        # A STAFF member is denied (owner-only route) and writes nothing.
        with factory() as session:
            session.add(
                BusinessMembership(
                    business_id=business_id,
                    user_subject="settings-staff",
                    role=MembershipRole.STAFF,
                )
            )
            session.commit()
        subject["value"] = "settings-staff"
        denied = client.put(f"{base}/settings/locale", json={"setting_value": "ar"})
        assert denied.status_code == 403, denied.text
        assert _events(factory, business_id) == []
    finally:
        _restore(previous_factory, previous_resolver)
