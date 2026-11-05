"""Cross-tenant regression coverage for payroll-linked expense visibility.

This is a T40 report/privacy integration test. It deliberately lives in a
separate file so it does not overwrite Chat 4's employee/payroll feature tests.
"""
import csv
import io
import json
import os
import re
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
import app.assistant_api as assistant_api
from app.security import AuthenticatedPrincipal
from app.models import Base, BusinessMembership, Expense, MembershipRole
from app.operations import financial_summary


OWNER = "t40-report-privacy-owner"
APPROVER = "t40-report-privacy-approver"
STAFF = "t40-report-privacy-staff"
FOREIGN_STAFF = "t40-report-privacy-staff-a-only"


@pytest.fixture(params=("sqlite", "postgresql"), ids=("sqlite", "postgresql"))
def report_privacy_engine(request):
    if request.param == "sqlite":
        engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        try:
            yield engine
        finally:
            engine.dispose()
        return

    configured_url = os.getenv("TEST_DATABASE_URL", "").strip()
    if os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true" or not configured_url:
        pytest.skip("PostgreSQL privacy contract requires the explicitly enabled disposable CI database.")
    url = make_url(configured_url)
    database_name = (url.database or "").lower()
    if not re.search(r"(?:^|[_-])(?:test|ci|disposable|tmp)(?:$|[_-])", database_name):
        pytest.fail("Refusing schema creation: TEST_DATABASE_URL database name must identify a disposable test database.")
    if url.get_backend_name() != "postgresql":
        pytest.skip("Payroll privacy PostgreSQL contract requires PostgreSQL.")
    schema = f"ci_payroll_privacy_{uuid4().hex}"
    admin_engine = create_engine(url, pool_pre_ping=True)
    engine = None
    schema_created = False
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        schema_created = True
        engine = create_engine(
            url,
            connect_args={"options": f"-csearch_path={schema}"},
            pool_pre_ping=True,
        )
        Base.metadata.create_all(engine)
        yield engine
    finally:
        if engine is not None:
            engine.dispose()
        if schema_created:
            with admin_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


@pytest.fixture
def report_privacy_environment(monkeypatch, report_privacy_engine):
    engine = report_privacy_engine
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
    expense_id = paid.json()["expense_id"]
    sensitive_tokens = (
        employee_id,
        payroll["id"],
        expense_id,
        "Cross-Tenant Confidential Payroll Employee",
        "5000.00",
    )
    # The dashboard may legitimately expose the selected reporting month; payroll
    # identity, amount, record ID, linked expense ID and payroll reference remain private.

    def snapshot():
        """Capture every persisted row in the isolated database in stable PK order."""
        with app.state.session_factory() as session:
            state = {}
            for table in Base.metadata.sorted_tables:
                statement = select(table)
                if table.primary_key.columns:
                    statement = statement.order_by(*table.primary_key.columns)
                state[table.name] = tuple(
                    tuple(row) for row in session.execute(statement).all()
                )
            return state

    def read_without_side_effects(request):
        before = snapshot()
        response = request()
        assert snapshot() == before, "read request changed persisted database state"
        return response

    # An A-only staff identity cannot cross the outer tenant authorization boundary.
    env["subject"]["value"] = FOREIGN_STAFF
    for endpoint in ("expenses", "reports/summary", "dashboard", "profit-loss", "assistant/insights"):
        denied = read_without_side_effects(lambda: client.get(f"{base_b}/{endpoint}"))
        assert denied.status_code == 403, (
            f"GET {base_b}/{endpoint}: expected 403 for an A-only member, "
            f"got {denied.status_code}: {denied.text}"
        )
    # A denied cross-tenant request must stop before any configured AI provider call.
    provider_calls = []

    async def unexpected_provider_post(_client, *, headers, payload):
        provider_calls.append(payload)
        raise AssertionError("Denied cross-tenant assistant requests must not call the provider.")

    monkeypatch.setenv("OPENAI_API_KEY", "test-provider-key")
    monkeypatch.setattr(assistant_api, "_provider_post", unexpected_provider_post)
    denied_chat = read_without_side_effects(lambda: client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Show me business B expenses."},
    ))
    assert denied_chat.status_code == 403, denied_chat.text
    assert provider_calls == [], "Denied cross-tenant assistant request reached the AI provider."
    monkeypatch.setenv("OPENAI_API_KEY", "")

    env["subject"]["value"] = STAFF

    # Business A remains unaffected by the payroll link that exists only in B.
    staff_a_expenses = read_without_side_effects(lambda: client.get(f"{base_a}/expenses"))
    assert staff_a_expenses.status_code == 200, staff_a_expenses.text
    assert [row["description"] for row in staff_a_expenses.json()] == [
        "Business A ordinary supplies"
    ]
    staff_a_summary = read_without_side_effects(lambda: client.get(f"{base_a}/reports/summary"))
    assert staff_a_summary.status_code == 200, staff_a_summary.text
    assert staff_a_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 1, "total": "30.00"}
    ]

    # STAFF is also a member of B, so these assertions exercise role filtering
    # inside B rather than merely testing the outer tenant authorization (403).
    staff_b_expenses = read_without_side_effects(lambda: client.get(f"{base_b}/expenses"))
    staff_b_page_one = read_without_side_effects(
        lambda: client.get(f"{base_b}/expenses", params={"limit": 1})
    )
    staff_b_page_two = read_without_side_effects(
        lambda: client.get(f"{base_b}/expenses", params={"limit": 1, "offset": 1})
    )
    staff_export = read_without_side_effects(
        lambda: client.get(f"{base_b}/exports/expenses.csv")
    )
    staff_b_summary = read_without_side_effects(lambda: client.get(f"{base_b}/reports/summary"))
    staff_b_dashboard = read_without_side_effects(lambda: client.get(f"{base_b}/dashboard"))
    staff_b_profit_loss = read_without_side_effects(lambda: client.get(f"{base_b}/profit-loss", params={"period": "all"}))
    staff_b_insights = read_without_side_effects(lambda: client.get(f"{base_b}/assistant/insights"))
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
    assert staff_b_page_one.status_code == 200, staff_b_page_one.text
    assert [row["description"] for row in staff_b_page_one.json()] == [
        "Business B ordinary supplies"
    ]
    assert staff_b_page_two.status_code == 200, staff_b_page_two.text
    assert staff_b_page_two.json() == []
    assert staff_export.status_code == 403
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
    staff_derived_outputs = [
        staff_b_expenses.text, staff_b_page_one.text, staff_b_page_two.text,
        staff_b_summary.text, staff_b_dashboard.text, staff_b_profit_loss.text,
        staff_b_insights.text,
    ]
    for token in sensitive_tokens:
        assert all(token not in output for output in staff_derived_outputs), token

    # The local assistant context must not disclose the linked payroll expense.
    local_chat = read_without_side_effects(lambda: client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Summarize the business expenses."},
    ))
    assert local_chat.status_code == 200, local_chat.text
    for token in sensitive_tokens:
        assert token not in local_chat.text, token

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
    provider_chat = read_without_side_effects(lambda: client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Summarize recent expenses."},
    ))
    assert provider_chat.status_code == 200, provider_chat.text
    outbound = json.dumps(captured["payload"], ensure_ascii=False)
    assert "Business B ordinary supplies" in outbound
    for token in sensitive_tokens:
        assert token not in outbound, token

    # The OWNER of B retains access to the linked expense and report totals.
    env["subject"]["value"] = OWNER
    owner_b_expenses = read_without_side_effects(lambda: client.get(f"{base_b}/expenses"))
    owner_b_csv = read_without_side_effects(lambda: client.get(f"{base_b}/exports/expenses.csv"))
    owner_b_summary = read_without_side_effects(lambda: client.get(f"{base_b}/reports/summary"))
    assert owner_b_csv.status_code == 200, owner_b_csv.text
    csv_rows = list(csv.DictReader(io.StringIO(owner_b_csv.text)))
    assert len(csv_rows) == 2
    payroll_csv_rows = [row for row in csv_rows if row["id"] == expense_id]
    assert len(payroll_csv_rows) == 1
    assert "Cross-Tenant Confidential Payroll Employee" in payroll_csv_rows[0]["vendor_name"]
    with Session(env["engine"]) as session:
        stored_payroll_expense = session.get(Expense, UUID(expense_id))
        assert stored_payroll_expense is not None
        expected_payroll_amount = format(stored_payroll_expense.amount, "f")
    assert payroll_csv_rows[0]["amount"] == expected_payroll_amount
    assert "Cross-Tenant Confidential Payroll Employee" in payroll_csv_rows[0]["description"]
    assert payroll_csv_rows[0]["reference"] == f"payroll:{payroll['id']}"
    owner_b_dashboard = read_without_side_effects(lambda: client.get(f"{base_b}/dashboard"))
    owner_b_profit_loss = read_without_side_effects(lambda: client.get(f"{base_b}/profit-loss", params={"period": "all"}))
    owner_b_insights = read_without_side_effects(lambda: client.get(f"{base_b}/assistant/insights"))
    assert owner_b_expenses.status_code == 200, owner_b_expenses.text
    assert owner_b_summary.status_code == 200, owner_b_summary.text
    assert len(owner_b_expenses.json()) == 2
    assert owner_b_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 2, "total": "5100.00"}
    ]
    assert owner_b_dashboard.json()["expenses"] == [
        {"currency_code": "EGP", "count": 2, "total": "5100.00"}
    ]
    owner_profit = next(row for row in owner_b_profit_loss.json()["currencies"] if row["currency_code"] == "EGP")
    assert owner_profit["expenses"] == "5100.00"
    assert owner_profit["expense_count"] == 2
    assert owner_b_insights.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 2, "total": "5100.00"}
    ]

    # The internal summary helper must enforce the same payroll visibility boundary.
    with app.state.session_factory() as session:
        staff_internal_summary = financial_summary(
            session,
            principal=AuthenticatedPrincipal(STAFF),
            business_id=UUID(business_b),
        )
        owner_internal_summary = financial_summary(
            session,
            principal=AuthenticatedPrincipal(OWNER),
            business_id=UUID(business_b),
        )
    assert staff_internal_summary["expenses"] == {"EGP": Decimal("100.00")}
    assert owner_internal_summary["expenses"] == {"EGP": Decimal("5100.00")}

    # OWNER retains payroll visibility in the assistant provider context as well.
    owner_provider_chat = read_without_side_effects(lambda: client.post(
        f"{base_b}/assistant/chat",
        json={"message": "Summarize recent expenses."},
    ))
    assert owner_provider_chat.status_code == 200, owner_provider_chat.text
    owner_outbound = json.dumps(captured["payload"], ensure_ascii=False)
    assert "Cross-Tenant Confidential Payroll Employee" in owner_outbound
    assert "5000.00" in owner_outbound
