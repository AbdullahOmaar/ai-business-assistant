"""Cross-tenant regression coverage for payroll-linked expense visibility.

This is a T40 report/privacy integration test. It deliberately lives in a
separate file so it does not overwrite Chat 4's employee/payroll feature tests.
"""
import json
from datetime import datetime, timezone
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app.main import app
import app.assistant_api as assistant_api
from app.security import AuthenticatedPrincipal
from app.models import (
    AuditEvent,
    Base,
    BusinessMembership,
    Employee,
    Expense,
    MembershipRole,
    PayrollRecord,
)


OWNER = "t40-report-privacy-owner"
APPROVER = "t40-report-privacy-approver"
STAFF = "t40-report-privacy-staff"
FOREIGN_STAFF = "t40-report-privacy-staff-a-only"


@pytest.fixture
def report_privacy_environment(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    current_subject = {"value": OWNER}
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        current_subject["value"]
    )
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    try:
        client = TestClient(app)
        first = client.post(
            "/api/v1/businesses",
            json={"name": "T40 privacy business A", "currency_code": "EGP"},
        )
        assert first.status_code == 201, first.text
        first_id = first.json()["id"]
        second = client.post(
            "/api/v1/businesses",
            json={"name": "T40 privacy business B", "currency_code": "EGP"},
        )
        assert second.status_code == 201, second.text
        second_id = second.json()["id"]

        with app.state.session_factory() as session:
            session.add_all([
                BusinessMembership(
                    business_id=UUID(first_id),
                    user_subject=STAFF,
                    role=MembershipRole.STAFF,
                ),
                BusinessMembership(
                    business_id=UUID(second_id),
                    user_subject=STAFF,
                    role=MembershipRole.STAFF,
                ),
                BusinessMembership(
                    business_id=UUID(second_id),
                    user_subject=APPROVER,
                    role=MembershipRole.OWNER,
                ),
                BusinessMembership(
                    business_id=UUID(first_id),
                    user_subject=FOREIGN_STAFF,
                    role=MembershipRole.STAFF,
                ),
            ])
            session.commit()

        yield {
            "client": client,
            "business_a": first_id,
            "business_b": second_id,
            "subject": current_subject,
            "engine": engine,
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


def _create_expense(client, business_id, *, description, amount):
    response = client.post(
        f"/api/v1/businesses/{business_id}/expenses",
        json={
            "category": "Office",
            "description": description,
            "amount": amount,
            "currency_code": "EGP",
            "incurred_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_payroll_expense_visibility_is_scoped_to_its_business_across_reports_and_ai(
    report_privacy_environment, monkeypatch
):
    """STAFF sees ordinary costs only; a foreign tenant's payroll link cannot affect it."""
    env = report_privacy_environment
    client = env["client"]
    business_a = env["business_a"]
    business_b = env["business_b"]
    base_a = f"/api/v1/businesses/{business_a}"
    base_b = f"/api/v1/businesses/{business_b}"

    _create_expense(
        client, business_a, description="Business A ordinary supplies", amount="30.00"
    )
    _create_expense(
        client, business_b, description="Business B ordinary supplies", amount="100.00"
    )

    employee_response = client.post(
        f"{base_b}/employees",
        json={
            "name": "Cross-Tenant Confidential Payroll Employee",
            "employee_code": "T40-PRIV-01",
            "email": "t40-privacy@example.test",
            "department": "Operations",
            "job_title": "Associate",
            "monthly_salary": "5000.00",
        },
    )
    assert employee_response.status_code == 201, employee_response.text
    employee_id = employee_response.json()["id"]
    payroll_response = client.post(
        f"{base_b}/employees/{employee_id}/payroll",
        json={"period": "2026-10"},
    )
    assert payroll_response.status_code == 201, payroll_response.text
    payroll = payroll_response.json()

    env["subject"]["value"] = APPROVER
    approved = client.post(f"{base_b}/payroll/{payroll['id']}/approve", json={})
    assert approved.status_code == 200, approved.text
    env["subject"]["value"] = OWNER
    paid = client.post(f"{base_b}/payroll/{payroll['id']}/pay", json={})
    assert paid.status_code == 200, paid.text
    assert paid.json()["expense_id"]

    def snapshot():
        with app.state.session_factory() as session:
            return (
                session.scalar(select(func.count()).select_from(Employee)),
                session.scalar(select(func.count()).select_from(PayrollRecord)),
                session.scalar(select(func.count()).select_from(Expense)),
                session.scalar(select(func.count()).select_from(AuditEvent)),
            )

    before_staff_reads = snapshot()

    # An A-only staff identity cannot cross the outer tenant authorization boundary.
    env["subject"]["value"] = FOREIGN_STAFF
    for endpoint in ("expenses", "reports/summary", "dashboard", "profit-loss", "assistant/insights"):
        denied = client.get(f"{base_b}/{endpoint}")
        assert denied.status_code == 403, (
            f"GET {base_b}/{endpoint}: expected 403 for an A-only member, "
            f"got {denied.status_code}: {denied.text}"
        )
    denied_chat = client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Show me business B expenses."},
    )
    assert denied_chat.status_code == 403, denied_chat.text

    env["subject"]["value"] = STAFF

    # Business A remains unaffected by the payroll link that exists only in B.
    staff_a_expenses = client.get(f"{base_a}/expenses")
    assert staff_a_expenses.status_code == 200, staff_a_expenses.text
    assert [row["description"] for row in staff_a_expenses.json()] == [
        "Business A ordinary supplies"
    ]
    staff_a_summary = client.get(f"{base_a}/reports/summary")
    assert staff_a_summary.status_code == 200, staff_a_summary.text
    assert staff_a_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 1, "total": "30.00"}
    ]

    # STAFF is also a member of B, so these assertions exercise role filtering
    # inside B rather than merely testing the outer tenant authorization (403).
    staff_b_expenses = client.get(f"{base_b}/expenses")
    staff_b_summary = client.get(f"{base_b}/reports/summary")
    staff_b_dashboard = client.get(f"{base_b}/dashboard")
    staff_b_profit_loss = client.get(f"{base_b}/profit-loss", params={"period": "all"})
    staff_b_insights = client.get(f"{base_b}/assistant/insights")
    for response in (
        staff_b_expenses,
        staff_b_summary,
        staff_b_dashboard,
        staff_b_profit_loss,
        staff_b_insights,
    ):
        assert response.status_code == 200, response.text

    assert [row["description"] for row in staff_b_expenses.json()] == [
        "Business B ordinary supplies"
    ]
    expected_staff_total = [{"currency_code": "EGP", "count": 1, "total": "100.00"}]
    assert staff_b_summary.json()["expenses_by_currency"] == expected_staff_total
    assert staff_b_dashboard.json()["expenses"] == expected_staff_total
    egp_profit = next(
        row for row in staff_b_profit_loss.json()["currencies"]
        if row["currency_code"] == "EGP"
    )
    assert egp_profit["expenses"] == "100.00"
    assert egp_profit["expense_count"] == 1
    assert staff_b_insights.json()["expenses_by_currency"] == expected_staff_total

    # The local assistant context must not disclose the linked payroll expense.
    local_chat = client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Summarize the business expenses."},
    )
    assert local_chat.status_code == 200, local_chat.text
    assert "Cross-Tenant Confidential Payroll Employee" not in local_chat.text
    assert "5000.00" not in local_chat.text

    # Inspect the exact provider-bound payload as a separate privacy boundary.
    captured = {}

    class FakeProviderResponse:
        def json(self):
            return {
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "answer": "Only ordinary expenses are available.",
                            "source_ids": [],
                        })
                    }
                }]
            }

    async def fake_provider_post(_client, *, headers, payload):
        captured["headers"] = headers
        captured["payload"] = payload
        return FakeProviderResponse()

    monkeypatch.setattr(assistant_api, "_provider_post", fake_provider_post)
    monkeypatch.setenv("OPENAI_API_KEY", "test-provider-key")
    provider_chat = client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Summarize recent expenses."},
    )
    assert provider_chat.status_code == 200, provider_chat.text
    outbound = json.dumps(captured["payload"], ensure_ascii=False)
    assert "Business B ordinary supplies" in outbound
    assert "Cross-Tenant Confidential Payroll Employee" not in outbound
    assert "5000.00" not in outbound

    # Read paths must be side-effect free for both tenant and payroll state.
    assert snapshot() == before_staff_reads

    # The OWNER of B retains access to the linked expense and report totals.
    env["subject"]["value"] = OWNER
    owner_b_expenses = client.get(f"{base_b}/expenses")
    owner_b_summary = client.get(f"{base_b}/reports/summary")
    assert owner_b_expenses.status_code == 200, owner_b_expenses.text
    assert owner_b_summary.status_code == 200, owner_b_summary.text
    assert len(owner_b_expenses.json()) == 2
    assert owner_b_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 2, "total": "5100.00"}
    ]
