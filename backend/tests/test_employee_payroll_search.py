from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app.main import app
from app.models import AuditEvent, Base, BusinessMembership, Employee, Expense, MembershipRole, PayrollRecord
from app.security import AuthenticatedPrincipal


@pytest.fixture
def employee_search_environment(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    current_subject = {"value": "employee-search-owner"}
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(current_subject["value"])
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)

    try:
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Employee search test", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        yield {
            "client": client,
            "business_id": created.json()["id"],
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


def _create_employee(env, *, name, code, email, department, job_title):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/employees",
        json={
            "name": name,
            "employee_code": code,
            "email": email,
            "department": department,
            "job_title": job_title,
            "monthly_salary": "5000.00",
        },
    )


def test_employee_search_covers_profile_fields_and_paginates_after_filtering(employee_search_environment):
    env = employee_search_environment
    first = _create_employee(
        env,
        name="Alpha Cairo",
        code="EMP-ALPHA",
        email="alpha@example.test",
        department="Sales North",
        job_title="Senior Associate",
    )
    second = _create_employee(
        env,
        name="Alpha Giza",
        code="EMP-BETA",
        email="beta@example.test",
        department="Finance",
        job_title="Payroll Specialist",
    )
    third = _create_employee(
        env,
        name="Beta Alex",
        code="EMP-GAMMA",
        email="gamma@example.test",
        department="Operations",
        job_title="Store Manager",
    )
    assert first.status_code == second.status_code == third.status_code == 201

    base = f"/api/v1/businesses/{env['business_id']}/employees"
    field_queries = {
        "alpha cairo": first.json()["id"],
        "EMP-BETA": second.json()["id"],
        "GAMMA@EXAMPLE.TEST": third.json()["id"],
        "finance": second.json()["id"],
        "payroll specialist": second.json()["id"],
    }
    for term, expected_id in field_queries.items():
        response = env["client"].get(base, params={"search": f"  {term}  "})
        assert response.status_code == 200
        assert [row["id"] for row in response.json()] == [expected_id]

    first_page = env["client"].get(base, params={"search": "alpha", "limit": 1, "offset": 0})
    second_page = env["client"].get(base, params={"search": "alpha", "limit": 1, "offset": 1})
    exhausted_page = env["client"].get(base, params={"search": "alpha", "limit": 1, "offset": 2})
    assert first_page.status_code == second_page.status_code == exhausted_page.status_code == 200
    assert [row["id"] for row in first_page.json()] == [first.json()["id"]]
    assert [row["id"] for row in second_page.json()] == [second.json()["id"]]
    assert exhausted_page.json() == []


def test_employee_search_treats_sql_wildcards_as_literal_characters(employee_search_environment):
    env = employee_search_environment
    percent = _create_employee(
        env,
        name="Percent 50% Sales",
        code="EMP-PERCENT",
        email="percent@example.test",
        department="Sales",
        job_title="Associate",
    )
    underscore = _create_employee(
        env,
        name="Underscore Operations",
        code="EMP-UNDERSCORE_01",
        email="underscore@example.test",
        department="Operations",
        job_title="Store Manager",
    )
    backslash = _create_employee(
        env,
        name="Backslash Operations",
        code="EMP-BACK\\SLASH",
        email="backslash@example.test",
        department="Operations",
        job_title="Technician",
    )
    ordinary = _create_employee(
        env,
        name="Ordinary Finance",
        code="EMP-ORDINARY",
        email="ordinary@example.test",
        department="Finance",
        job_title="Accountant",
    )
    assert percent.status_code == underscore.status_code == backslash.status_code == ordinary.status_code == 201

    base = f"/api/v1/businesses/{env['business_id']}/employees"
    percent_matches = env["client"].get(base, params={"search": "%"})
    underscore_matches = env["client"].get(base, params={"search": "_"})
    backslash_matches = env["client"].get(base, params={"search": "\\"})

    assert percent_matches.status_code == underscore_matches.status_code == backslash_matches.status_code == 200
    assert [row["id"] for row in percent_matches.json()] == [percent.json()["id"]]
    assert [row["id"] for row in underscore_matches.json()] == [underscore.json()["id"]]
    assert [row["id"] for row in backslash_matches.json()] == [backslash.json()["id"]]


def test_rejected_duplicate_and_invalid_employee_creates_have_no_audit_side_effects(employee_search_environment):
    env = employee_search_environment
    created = _create_employee(
        env,
        name="Stable Employee",
        code="EMP-STABLE",
        email="stable@example.test",
        department="Operations",
        job_title="Associate",
    )
    assert created.status_code == 201

    base = f"/api/v1/businesses/{env['business_id']}"
    duplicate_code = env["client"].post(
        f"{base}/employees",
        json={
            "name": "Duplicate Code",
            "employee_code": "emp-stable",
            "email": "other@example.test",
            "monthly_salary": "6000.00",
        },
    )
    duplicate_email = env["client"].post(
        f"{base}/employees",
        json={
            "name": "Duplicate Email",
            "employee_code": "EMP-OTHER",
            "email": "STABLE@example.test",
            "monthly_salary": "6000.00",
        },
    )
    invalid = env["client"].post(
        f"{base}/employees",
        json={"name": "   ", "email": "not-an-email", "monthly_salary": "6000.00"},
    )
    assert duplicate_code.status_code == 409
    assert duplicate_email.status_code == 409
    assert invalid.status_code == 422

    with app.state.session_factory() as session:
        employees = session.scalars(
            select(Employee).where(Employee.business_id == UUID(env["business_id"]))
        ).all()
        audit_actions = session.scalars(
            select(AuditEvent.action).where(
                AuditEvent.business_id == UUID(env["business_id"]),
                AuditEvent.target_type == "employee",
            )
        ).all()
    assert [employee.id for employee in employees] == [UUID(created.json()["id"])]
    assert audit_actions == ["employee.created"]


def test_rejected_duplicate_employee_updates_preserve_profile_and_audit_history(employee_search_environment):
    env = employee_search_environment
    first = _create_employee(
        env,
        name="Update Target",
        code="EMP-TARGET",
        email="target@example.test",
        department="Operations",
        job_title="Associate",
    )
    second = _create_employee(
        env,
        name="Existing Employee",
        code="EMP-EXISTING",
        email="existing@example.test",
        department="Finance",
        job_title="Manager",
    )
    assert first.status_code == second.status_code == 201

    base = f"/api/v1/businesses/{env['business_id']}"
    target_id = first.json()["id"]

    def snapshot():
        with app.state.session_factory() as session:
            employees = session.execute(
                select(
                    Employee.id,
                    Employee.name,
                    Employee.employee_code,
                    Employee.email,
                    Employee.department,
                    Employee.job_title,
                    Employee.monthly_salary,
                    Employee.is_active,
                )
                .where(Employee.business_id == UUID(env["business_id"]))
                .order_by(Employee.id)
            ).all()
            audits = session.execute(
                select(
                    AuditEvent.id,
                    AuditEvent.action,
                    AuditEvent.target_type,
                    AuditEvent.target_id,
                    AuditEvent.change_summary,
                )
                .where(
                    AuditEvent.business_id == UUID(env["business_id"]),
                    AuditEvent.target_type == "employee",
                )
                .order_by(AuditEvent.id)
            ).all()
            return employees, audits

    before_code_conflict = snapshot()
    duplicate_code = env["client"].patch(
        f"{base}/employees/{target_id}",
        json={"employee_code": "emp-existing"},
    )
    assert duplicate_code.status_code == 409
    assert snapshot() == before_code_conflict

    before_email_conflict = snapshot()
    duplicate_email = env["client"].patch(
        f"{base}/employees/{target_id}",
        json={"email": "EXISTING@example.test"},
    )
    assert duplicate_email.status_code == 409
    assert snapshot() == before_email_conflict


def test_payroll_privacy_and_tenant_isolation_hold_across_two_businesses(employee_search_environment, monkeypatch):
    env = employee_search_environment
    client = env["client"]
    owner_a = env["subject"]["value"]
    owner_b = "payroll-tenant-b-owner"
    approver_b = "payroll-tenant-b-approver"
    staff_b = "payroll-tenant-b-staff"

    # Create business B as a distinct owner; owner A must not become a member.
    env["subject"]["value"] = owner_b
    created_business = client.post(
        "/api/v1/businesses",
        json={"name": "Payroll privacy tenant B", "currency_code": "EGP"},
    )
    assert created_business.status_code == 201, created_business.text
    business_b_id = created_business.json()["id"]
    with app.state.session_factory() as session:
        session.add_all([
            BusinessMembership(
                business_id=UUID(business_b_id),
                user_subject=approver_b,
                role=MembershipRole.OWNER,
            ),
            BusinessMembership(
                business_id=UUID(business_b_id),
                user_subject=staff_b,
                role=MembershipRole.STAFF,
            ),
        ])
        session.commit()

    base_b = f"/api/v1/businesses/{business_b_id}"
    employee = client.post(
        f"{base_b}/employees",
        json={
            "name": "Tenant B Confidential Payroll",
            "employee_code": "TENANT-B-001",
            "email": "tenant-b-payroll@example.test",
            "monthly_salary": "5000.00",
        },
    )
    assert employee.status_code == 201, employee.text
    payroll = client.post(
        f"{base_b}/employees/{employee.json()['id']}/payroll",
        json={"period": "2026-10"},
    )
    assert payroll.status_code == 201, payroll.text

    env["subject"]["value"] = approver_b
    approved = client.post(f"{base_b}/payroll/{payroll.json()['id']}/approve", json={})
    assert approved.status_code == 200, approved.text
    env["subject"]["value"] = owner_b
    paid = client.post(f"{base_b}/payroll/{payroll.json()['id']}/pay", json={})
    assert paid.status_code == 200, paid.text

    ordinary = client.post(
        f"{base_b}/expenses",
        json={
            "category": "Office",
            "description": "Tenant B ordinary expense",
            "amount": "125.00",
            "currency_code": "EGP",
            "incurred_at": "2026-10-30T12:00:00+00:00",
        },
    )
    assert ordinary.status_code == 201, ordinary.text
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    def counts():
        with app.state.session_factory() as session:
            return (
                session.scalar(select(func.count(Expense.id)).where(
                    Expense.business_id == UUID(business_b_id)
                )),
                session.scalar(select(func.count(PayrollRecord.id)).where(
                    PayrollRecord.business_id == UUID(business_b_id)
                )),
                session.scalar(select(func.count(AuditEvent.id)).where(
                    AuditEvent.business_id == UUID(business_b_id)
                )),
            )

    before_denied_reads = counts()

    # STAFF B retains ordinary expense access but never sees payroll-linked rows or totals.
    env["subject"]["value"] = staff_b
    staff_expenses = client.get(f"{base_b}/expenses", params={"limit": 1})
    staff_summary = client.get(f"{base_b}/reports/summary")
    staff_dashboard = client.get(f"{base_b}/dashboard")
    staff_profit_loss = client.get(f"{base_b}/profit-loss", params={"period": "all"})
    staff_insights = client.get(f"{base_b}/assistant/insights")
    staff_chat = client.post(f"{base_b}/assistant/chat", json={"message": "Summarize expenses"})
    staff_payroll = client.get(f"{base_b}/payroll")
    for response in (
        staff_expenses, staff_summary, staff_dashboard, staff_profit_loss,
        staff_insights, staff_chat,
    ):
        assert response.status_code == 200, response.text
    assert staff_payroll.status_code == 403
    assert [row["description"] for row in staff_expenses.json()] == [
        "Tenant B ordinary expense"
    ]
    assert staff_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 1, "total": "125.00"}
    ]
    assert staff_dashboard.json()["expenses"] == [
        {"currency_code": "EGP", "count": 1, "total": "125.00"}
    ]
    staff_egp = next(row for row in staff_profit_loss.json()["currencies"] if row["currency_code"] == "EGP")
    assert staff_egp["expenses"] == "125.00"
    assert staff_egp["expense_count"] == 1
    assert staff_insights.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 1, "total": "125.00"}
    ]
    for private_value in ("Tenant B Confidential Payroll", "5000.00", "payroll:"):
        assert private_value not in staff_chat.text
        assert private_value not in str(staff_summary.json())
        assert private_value not in str(staff_dashboard.json())
        assert private_value not in str(staff_profit_loss.json())
        assert private_value not in str(staff_insights.json())

    # OWNER A cannot access B through broad read surfaces or payroll routes.
    env["subject"]["value"] = owner_a
    owner_a_reads = (
        client.get(f"{base_b}/employees"),
        client.get(f"{base_b}/payroll"),
        client.get(f"{base_b}/expenses"),
        client.get(f"{base_b}/reports/summary"),
        client.get(f"{base_b}/dashboard"),
        client.get(f"{base_b}/profit-loss", params={"period": "all"}),
        client.get(f"{base_b}/assistant/insights"),
        client.post(f"{base_b}/assistant/chat", json={"message": "Summarize expenses"}),
    )
    assert all(response.status_code == 403 for response in owner_a_reads), [
        response.status_code for response in owner_a_reads
    ]
    assert counts() == before_denied_reads

    # OWNER B retains the payroll row and full expense aggregate.
    env["subject"]["value"] = owner_b
    owner_b_expenses = client.get(f"{base_b}/expenses")
    owner_b_summary = client.get(f"{base_b}/reports/summary")
    assert owner_b_expenses.status_code == owner_b_summary.status_code == 200
    assert len(owner_b_expenses.json()) == 2
    assert owner_b_summary.json()["expenses_by_currency"] == [
        {"currency_code": "EGP", "count": 2, "total": "5125.00"}
    ]
