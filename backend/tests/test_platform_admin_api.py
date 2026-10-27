import pytest
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base, Business, BusinessMembership, Invoice, Payment, MembershipRole
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
