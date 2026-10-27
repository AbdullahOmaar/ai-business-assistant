import json
import logging
from types import SimpleNamespace

import pytest
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (AuditEvent, Base, Business, BusinessMembership, Invoice, Payment, MembershipRole, PlatformAdminAuditEvent, PlatformRoleGrant)
from app.security import AuthenticatedPrincipal, AuthorizationError, authorize_membership

ADMIN_SUBJECT = "firebase:test-project:platform-admin-uid"
OWNER_SUBJECT = "firebase:test-project:workspace-owner-uid"
STAFF_SUBJECT = "firebase:test-project:workspace-staff-uid"


@pytest.fixture
def platform_admin_environment(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    subject = {"value": ADMIN_SUBJECT}

    with Session(engine) as session:
        alpha = Business(name="Alpha Retail", currency_code="EGP", contact_email="alpha@example.test")
        beta = Business(name="Beta Studio", currency_code="USD", is_active=False)
        session.add_all([alpha, beta])
        session.flush()
        session.add_all([
            BusinessMembership(business_id=alpha.id, user_subject=OWNER_SUBJECT, role=MembershipRole.OWNER),
            BusinessMembership(business_id=alpha.id, user_subject=STAFF_SUBJECT, role=MembershipRole.STAFF),
            BusinessMembership(business_id=beta.id, user_subject=OWNER_SUBJECT, role=MembershipRole.OWNER),
        ])
        session.add_all([
            Invoice(
                business_id=alpha.id, invoice_number="EGP-1", status="issued",
                currency_code="EGP", subtotal=Decimal("100.00"), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal("100.00"),
            ),
            Invoice(
                business_id=beta.id, invoice_number="USD-1", status="draft",
                currency_code="USD", subtotal=Decimal("25.00"), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal("25.00"),
            ),
            Payment(
                business_id=alpha.id, amount=Decimal("60.00"), currency_code="EGP",
                idempotency_key="platform-admin-test-payment-1", method="cash",
            ),
            Payment(
                business_id=beta.id, amount=Decimal("12.00"), currency_code="USD",
                idempotency_key="platform-admin-test-payment-2", method="bank_transfer",
            ),
            AuditEvent(
                business_id=alpha.id, actor_subject=OWNER_SUBJECT, action="invoice.issued",
                target_type="invoice", target_id="EGP-1", change_summary="Test event",
            ),
        ])
        session.commit()
        alpha_id, beta_id = str(alpha.id), str(beta.id)

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject=subject["value"])
    monkeypatch.setenv("PLATFORM_SUPER_ADMIN_UIDS", ADMIN_SUBJECT)

    try:
        yield {
            "client": TestClient(app),
            "engine": engine,
            "subject": subject,
            "alpha_id": alpha_id,
            "beta_id": beta_id,
        }
    finally:
        if previous_factory is None:
            if hasattr(app.state, "session_factory"):
                del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            if hasattr(app.state, "principal_resolver"):
                del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
        engine.dispose()


def test_platform_admin_is_deny_by_default_without_allowlist(platform_admin_environment, monkeypatch):
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)

    response = platform_admin_environment["client"].get("/api/v1/platform-admin/overview")

    assert response.status_code == 403
    assert response.json()["detail"] == "Platform administrator access is not granted."


def test_workspace_owner_and_staff_cannot_escalate_to_platform_admin(platform_admin_environment):
    for subject in (OWNER_SUBJECT, STAFF_SUBJECT):
        platform_admin_environment["subject"]["value"] = subject
        response = platform_admin_environment["client"].get(
            "/api/v1/platform-admin/businesses",
            headers={"X-Role": "platform_super_admin", "X-User-ID": subject},
        )
        assert response.status_code == 403


def test_unconfigured_identity_verifier_fails_closed(platform_admin_environment):
    previous = app.state.principal_resolver
    del app.state.principal_resolver
    try:
        response = platform_admin_environment["client"].get("/api/v1/platform-admin/overview")
        assert response.status_code == 503
        assert "Authentication is not configured" in response.json()["detail"]
    finally:
        app.state.principal_resolver = previous


def test_platform_admin_overview_uses_real_counts_and_keeps_currency_totals_separate(platform_admin_environment):
    response = platform_admin_environment["client"].get("/api/v1/platform-admin/overview")

    assert response.status_code == 200
    data = response.json()
    assert data["businesses"] == {"total": 2, "active": 1, "inactive": 1}
    assert data["users"] == {"distinct_subjects": 2, "memberships": 3}
    assert data["invoices"]["count"] == 2
    assert data["payments"]["count"] == 2
    payment_totals = {row["currency_code"]: Decimal(row["total"]) for row in data["payments"]["by_currency"]}
    assert payment_totals == {"EGP": Decimal("60.00"), "USD": Decimal("12.00")}
    invoice_totals = {(row["currency_code"], row["status"]): Decimal(row["total"]) for row in data["invoices"]["by_currency_and_status"]}
    assert invoice_totals[("EGP", "issued")] == Decimal("100.00")
    assert invoice_totals[("USD", "draft")] == Decimal("25.00")


def test_business_search_status_and_pagination_are_bounded(platform_admin_environment):
    client = platform_admin_environment["client"]
    searched = client.get("/api/v1/platform-admin/businesses", params={"q": "Alpha", "status": "active", "limit": 1})
    inactive = client.get("/api/v1/platform-admin/businesses", params={"status": "inactive", "limit": 1, "offset": 0})
    names_ascending = client.get(
        "/api/v1/platform-admin/businesses",
        params={"sort_by": "name", "sort_order": "asc", "limit": 25},
    )
    member_count_descending = client.get(
        "/api/v1/platform-admin/businesses",
        params={"sort_by": "members", "sort_order": "desc", "limit": 25},
    )
    unsupported_sort = client.get("/api/v1/platform-admin/businesses", params={"sort_by": "secret_column"})
    too_many = client.get("/api/v1/platform-admin/businesses", params={"limit": 1000})

    assert searched.status_code == 200
    assert searched.json()["total"] == 1
    assert searched.json()["items"][0]["name"] == "Alpha Retail"
    assert searched.json()["items"][0]["member_count"] == 2
    assert inactive.status_code == 200
    assert inactive.json()["items"][0]["name"] == "Beta Studio"
    assert names_ascending.status_code == 200
    assert [item["name"] for item in names_ascending.json()["items"]] == ["Alpha Retail", "Beta Studio"]
    assert member_count_descending.status_code == 200
    assert [item["member_count"] for item in member_count_descending.json()["items"]] == [2, 1]
    assert unsupported_sort.status_code == 422
    assert too_many.status_code == 422


def test_business_details_only_exposes_memberships_for_requested_business(platform_admin_environment):
    client = platform_admin_environment["client"]
    alpha = client.get(f"/api/v1/platform-admin/businesses/{platform_admin_environment['alpha_id']}")
    beta = client.get(f"/api/v1/platform-admin/businesses/{platform_admin_environment['beta_id']}")
    unknown = client.get(f"/api/v1/platform-admin/businesses/{uuid4()}")

    assert alpha.status_code == 200
    assert {member["role"] for member in alpha.json()["memberships"]} == {"owner", "staff"}
    assert len(alpha.json()["memberships"]) == 2
    assert beta.status_code == 200
    assert len(beta.json()["memberships"]) == 1
    assert all(member["user_subject"] != STAFF_SUBJECT for member in beta.json()["memberships"])
    assert unknown.status_code == 404


def test_status_change_requires_reason_and_adds_audit_event(platform_admin_environment):
    client = platform_admin_environment["client"]
    business_id = platform_admin_environment["alpha_id"]

    missing_reason = client.patch(
        f"/api/v1/platform-admin/businesses/{business_id}/status",
        json={"is_active": False, "reason": "  "},
    )
    changed = client.patch(
        f"/api/v1/platform-admin/businesses/{business_id}/status",
        json={"is_active": False, "reason": "Compliance review"},
    )
    repeated = client.patch(
        f"/api/v1/platform-admin/businesses/{business_id}/status",
        json={"is_active": False, "reason": "Compliance review"},
    )

    assert missing_reason.status_code == 422
    assert changed.status_code == 200
    assert changed.json()["changed"] is True
    assert changed.json()["business"]["is_active"] is False
    assert repeated.status_code == 200
    assert repeated.json()["changed"] is False

    with Session(platform_admin_environment["engine"]) as session:
        events = session.scalars(
            select(AuditEvent).where(AuditEvent.business_id == UUID(business_id))
        ).all()
    platform_events = [event for event in events if event.action == "platform.business.deactivated"]
    assert len(platform_events) == 1
    assert platform_events[0].actor_subject == ADMIN_SUBJECT
    assert platform_events[0].change_summary == "Compliance review"

    # Suspension must immediately block the ordinary workspace authorization path.
    with Session(platform_admin_environment["engine"]) as session:
        with pytest.raises(AuthorizationError, match="No active membership"):
            authorize_membership(
                session,
                principal=AuthenticatedPrincipal(subject=OWNER_SUBJECT),
                business_id=UUID(business_id),
            )


def test_platform_audit_is_read_only_and_supports_action_filter(platform_admin_environment):
    client = platform_admin_environment["client"]
    listed = client.get("/api/v1/platform-admin/audit-events", params={"action": "invoice.issued"})
    filtered_actor = client.get("/api/v1/platform-admin/audit-events", params={"actor_subject": "workspace-owner-uid"})
    invalid_range = client.get(
        "/api/v1/platform-admin/audit-events",
        params={"created_after": "2026-10-27T12:00:00Z", "created_before": "2026-10-27T11:00:00Z"},
    )
    deleted = client.delete("/api/v1/platform-admin/audit-events")

    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["action"] == "invoice.issued"
    assert filtered_actor.status_code == 200
    assert filtered_actor.json()["total"] == 1
    assert invalid_range.status_code == 422
    assert deleted.status_code == 405

    # Mixed naive/UTC inputs must not cause Python's aware-vs-naive TypeError.
    mixed_timezone_invalid = client.get(
        "/api/v1/platform-admin/audit-events",
        params={"created_after": "2026-10-27T12:00:00", "created_before": "2026-10-27T11:00:00Z"},
    )
    mixed_timezone_valid = client.get(
        "/api/v1/platform-admin/audit-events",
        params={"created_after": "2026-10-27T10:00:00", "created_before": "2026-10-27T11:00:00Z"},
    )
    assert mixed_timezone_invalid.status_code == 422
    assert mixed_timezone_invalid.json()["detail"] == "created_after must not be later than created_before."
    assert mixed_timezone_valid.status_code == 200


def test_platform_system_status_reports_safe_runtime_metadata(platform_admin_environment, monkeypatch):
    client = platform_admin_environment["client"]
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "a" * 40)
    monkeypatch.setenv("VERCEL_ENV", "preview")
    response = client.get("/api/v1/platform-admin/system-status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "healthy"
    assert payload["dependencies"] == {
        "database": "healthy",
        "identity_verifier": "configured",
    }
    assert payload["release"] == {
        "version": app.version,
        "commit": "a" * 12,
        "environment": "preview",
    }
    assert payload["checked_at"].endswith("+00:00")
    serialized = response.text.lower()
    assert "database_url" not in serialized
    assert "service_account" not in serialized
    assert "sensitive-password" not in serialized


def test_platform_system_status_degrades_without_leaking_database_errors(platform_admin_environment, monkeypatch):
    client = platform_admin_environment["client"]
    monkeypatch.delenv("FIREBASE_PROJECT_ID", raising=False)
    original_factory = app.state.session_factory

    def broken_factory():
        raise RuntimeError("postgres://sensitive-user:sensitive-password@db.example/private")

    app.state.session_factory = broken_factory
    try:
        response = client.get("/api/v1/platform-admin/system-status")
    finally:
        app.state.session_factory = original_factory

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["dependencies"] == {
        "database": "unavailable",
        "identity_verifier": "unconfigured",
    }
    assert "sensitive-password" not in response.text
    assert "db.example" not in response.text


def test_platform_system_status_rejects_non_allowlisted_principal(platform_admin_environment):
    client = platform_admin_environment["client"]
    platform_admin_environment["subject"]["value"] = OWNER_SUBJECT
    response = client.get("/api/v1/platform-admin/system-status")
    assert response.status_code == 403


def test_denied_platform_access_emits_redacted_structured_security_event(platform_admin_environment, caplog):
    client = platform_admin_environment["client"]
    platform_admin_environment["subject"]["value"] = OWNER_SUBJECT

    with caplog.at_level(logging.WARNING, logger="app.platform_admin_api"):
        response = client.get("/api/v1/platform-admin/overview")

    assert response.status_code == 403
    records = [record for record in caplog.records if record.name == "app.platform_admin_api"]
    assert records
    event = json.loads(records[-1].getMessage())
    assert event["event"] == "platform_admin.access_denied"
    assert event["outcome"] == "denied"
    assert event["actor_subject"] == OWNER_SUBJECT
    assert event["target_id"] == "/api/v1/platform-admin/overview"
    assert event["request_id"]
    assert event["timestamp"].endswith("+00:00")
    assert "authorization" not in event
    assert "cookie" not in event
    assert "token" not in event


def test_successful_status_change_emits_structured_security_event(platform_admin_environment, caplog):
    client = platform_admin_environment["client"]
    business_id = platform_admin_environment["alpha_id"]

    with caplog.at_level(logging.INFO, logger="app.platform_admin_api"):
        response = client.patch(
            f"/api/v1/platform-admin/businesses/{business_id}/status",
            json={"is_active": False, "reason": "Security review"},
        )

    assert response.status_code == 200
    records = [record for record in caplog.records if record.name == "app.platform_admin_api"]
    events = [json.loads(record.getMessage()) for record in records]
    event = next(item for item in events if item["event"] == "platform_admin.business_status_changed")
    assert event["outcome"] == "success"
    assert event["actor_subject"] == ADMIN_SUBJECT
    assert event["target_type"] == "business"
    assert event["target_id"] == business_id
    assert event["request_id"]
    assert "Security review" not in json.dumps(event)

def test_platform_user_directory_lists_auth_accounts_without_membership(platform_admin_environment, monkeypatch):
    import firebase_admin.auth
    import app.platform_admin_api as platform_admin_api

    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(platform_admin_api, "get_firebase_admin_app", lambda: object())
    user_with_membership = SimpleNamespace(
        uid="workspace-owner-uid",
        display_name="Workspace Owner",
        email="owner@example.test",
        email_verified=True,
        disabled=False,
        user_metadata=SimpleNamespace(creation_timestamp=1_760_000_000_000, last_sign_in_timestamp=1_760_100_000_000),
    )
    user_without_membership = SimpleNamespace(
        uid="never-joined-workspace",
        display_name="Unassigned User",
        email="unassigned@example.test",
        email_verified=False,
        disabled=True,
        user_metadata=SimpleNamespace(creation_timestamp=None, last_sign_in_timestamp=None),
    )
    monkeypatch.setattr(
        firebase_admin.auth,
        "list_users",
        lambda **kwargs: SimpleNamespace(users=[user_with_membership, user_without_membership], next_page_token="cursor-2"),
    )

    response = platform_admin_environment["client"].get("/api/v1/platform-admin/users", params={"limit": 2})

    assert response.status_code == 200
    data = response.json()
    assert data["has_more"] is True
    assert data["next_page_token"] == "cursor-2"
    assert len(data["items"]) == 2
    owner = next(row for row in data["items"] if row["uid"] == "workspace-owner-uid")
    unassigned = next(row for row in data["items"] if row["uid"] == "never-joined-workspace")
    assert owner["email"] == "owner@example.test"
    assert owner["memberships"][0]["business_name"] == "Alpha Retail"
    assert owner["memberships"][0]["role"] == "owner"
    assert unassigned["memberships"] == []
    assert unassigned["disabled"] is True
    for forbidden in ("password", "id_token", "refresh_token", "provider_data"):
        assert forbidden not in response.text.lower()


def test_delegated_user_manager_can_read_directory_but_cannot_change_workspace_status(platform_admin_environment, monkeypatch):
    from app.models import PlatformRoleGrant

    with Session(platform_admin_environment["engine"]) as session:
        session.add(PlatformRoleGrant(
            user_subject=STAFF_SUBJECT,
            role="user_manager",
            is_active=True,
            granted_by_subject=ADMIN_SUBJECT,
            last_reason="Approved user directory access",
        ))
        session.commit()

    platform_admin_environment["subject"]["value"] = STAFF_SUBJECT
    access = platform_admin_environment["client"].get("/api/v1/platform-admin/access")
    overview = platform_admin_environment["client"].get("/api/v1/platform-admin/overview")
    status_change = platform_admin_environment["client"].patch(
        f"/api/v1/platform-admin/businesses/{platform_admin_environment['alpha_id']}/status",
        json={"is_active": False, "reason": "Should be denied"},
    )

    assert access.status_code == 200
    assert access.json()["is_platform_super_admin"] is False
    assert "user_manager" in access.json()["roles"]
    assert "view_users" in access.json()["permissions"]
    assert overview.status_code == 200
    assert status_change.status_code == 403


def test_only_bootstrap_super_admin_can_grant_delegated_roles_and_changes_are_audited(platform_admin_environment, monkeypatch):
    import firebase_admin.auth
    import app.platform_admin_api as platform_admin_api

    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(platform_admin_api, "get_firebase_admin_app", lambda: object())
    monkeypatch.setattr(firebase_admin.auth, "get_user", lambda uid, **kwargs: SimpleNamespace(uid=uid))
    client = platform_admin_environment["client"]

    grant = client.post(
        "/api/v1/platform-admin/users/staff-user/roles",
        json={"role": "workspace_operator", "active": True, "reason": "Support duty approved"},
    )
    repeated = client.post(
        "/api/v1/platform-admin/users/staff-user/roles",
        json={"role": "workspace_operator", "active": True, "reason": "Support duty approved"},
    )
    revoke = client.post(
        "/api/v1/platform-admin/users/staff-user/roles",
        json={"role": "workspace_operator", "active": False, "reason": "Support duty ended"},
    )
    self_grant = client.post(
        "/api/v1/platform-admin/users/platform-admin-uid/roles",
        json={"role": "user_manager", "active": True, "reason": "Self grant"},
    )
    root_grant = client.post(
        "/api/v1/platform-admin/users/platform-admin-uid/roles",
        json={"role": "workspace_operator", "active": True, "reason": "Do not replace root"},
    )
    invalid_root_role = client.post(
        "/api/v1/platform-admin/users/staff-user/roles",
        json={"role": "platform_super_admin", "active": True, "reason": "Must be impossible"},
    )

    assert grant.status_code == 200 and grant.json()["changed"] is True
    assert repeated.status_code == 200 and repeated.json()["changed"] is False
    assert revoke.status_code == 200 and revoke.json()["changed"] is True
    assert self_grant.status_code == 409
    assert root_grant.status_code == 409
    assert invalid_root_role.status_code == 422
    with Session(platform_admin_environment["engine"]) as session:
        grant_record = session.scalar(select(PlatformRoleGrant).where(
            PlatformRoleGrant.user_subject == "firebase:test-project:staff-user",
            PlatformRoleGrant.role == "workspace_operator",
        ))
        audits = session.scalars(select(PlatformAdminAuditEvent).order_by(PlatformAdminAuditEvent.action)).all()
    assert grant_record is not None and grant_record.is_active is False
    assert len(audits) == 2
    assert {event.action for event in audits} == {
        "platform.user_role.granted", "platform.user_role.revoked"
    }
    assert all(event.actor_subject == ADMIN_SUBJECT for event in audits)
    assert all(event.reason.strip() for event in audits)


def test_delegated_role_change_is_rejected_even_when_user_supplies_root_headers(platform_admin_environment):
    platform_admin_environment["subject"]["value"] = STAFF_SUBJECT
    response = platform_admin_environment["client"].post(
        "/api/v1/platform-admin/users/new-user/roles",
        headers={"X-Role": "platform_super_admin", "X-User-ID": ADMIN_SUBJECT},
        json={"role": "platform_viewer", "active": True, "reason": "Attempted grant"},
    )
    assert response.status_code == 403

