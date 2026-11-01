from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine

from app.main import app
from app.models import AuditEvent, Base, Employee
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


def test_employee_search_and_pagination_reach_records_beyond_first_200(employee_search_environment):
    env = employee_search_environment
    business_id = UUID(env["business_id"])

    # Seed more than the API's maximum single-page limit without making
    # hundreds of setup HTTP requests.
    with app.state.session_factory() as session:
        session.add_all([
            Employee(
                business_id=business_id,
                employee_code=f"DIR-{index:03d}",
                name=f"Directory Employee {index:03d}",
                monthly_salary=Decimal("5000.00"),
                is_active=True,
            )
            for index in range(205)
        ])
        session.commit()

    base = f"/api/v1/businesses/{env['business_id']}/employees"
    final_page = env["client"].get(
        base,
        params={
            "search": "Directory Employee",
            "active_only": "true",
            "limit": 200,
            "offset": 200,
        },
    )
    assert final_page.status_code == 200, final_page.text
    rows = final_page.json()
    assert len(rows) == 5
    assert [row["name"] for row in rows] == [
        f"Directory Employee {index:03d}" for index in range(200, 205)
    ]

    picker_search = env["client"].get(
        base,
        params={
            "search": "Directory Employee 204",
            "active_only": "true",
            "limit": 25,
            "offset": 0,
        },
    )
    assert picker_search.status_code == 200, picker_search.text
    assert [row["id"] for row in picker_search.json()] == [rows[-1]["id"]]



def test_employee_search_and_pagination_reject_out_of_range_parameters_without_side_effects(employee_search_environment):
    env = employee_search_environment
    created = _create_employee(
        env,
        name="Validation Boundary",
        code="EMP-VALIDATION",
        email="validation@example.test",
        department="Operations",
        job_title="Associate",
    )
    assert created.status_code == 201

    base = f"/api/v1/businesses/{env['business_id']}/employees"

    def snapshot():
        with app.state.session_factory() as session:
            employees = session.scalars(
                select(Employee).where(Employee.business_id == UUID(env["business_id"]))
            ).all()
            audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == UUID(env["business_id"]),
                    AuditEvent.target_type == "employee",
                )
            ).all()
            return (
                tuple(sorted(str(employee.id) for employee in employees)),
                tuple(sorted((event.action, event.target_id, event.change_summary) for event in audits)),
            )

    before = snapshot()
    invalid_queries = [
        {"search": "x" * 101},
        {"limit": 0},
        {"limit": 201},
        {"offset": -1},
    ]
    for params in invalid_queries:
        response = env["client"].get(base, params=params)
        assert response.status_code == 422, (
            f"Out-of-range employee query {params} was not rejected: "
            f"{response.status_code} {response.text}"
        )
        assert snapshot() == before, (
            f"Rejected employee query {params} changed employee or audit state"
        )


def test_employee_directory_is_workspace_scoped_and_active_only_excludes_deactivated(employee_search_environment):
    env = employee_search_environment
    first_workspace_employee = _create_employee(
        env,
        name="Workspace One Employee",
        code="WS1-EMP",
        email="workspace-one@example.test",
        department="Operations",
        job_title="Associate",
    )
    assert first_workspace_employee.status_code == 201

    second_business = env["client"].post(
        "/api/v1/businesses",
        json={"name": "Second employee workspace", "currency_code": "EGP"},
    )
    assert second_business.status_code == 201
    second_env = {**env, "business_id": second_business.json()["id"]}
    second_workspace_employee = _create_employee(
        second_env,
        name="Workspace Two Employee",
        code="WS2-EMP",
        email="workspace-two@example.test",
        department="Finance",
        job_title="Manager",
    )
    assert second_workspace_employee.status_code == 201

    first_base = f"/api/v1/businesses/{env['business_id']}/employees"
    second_base = f"/api/v1/businesses/{second_env['business_id']}/employees"

    deactivated = env["client"].patch(
        f"{first_base}/{first_workspace_employee.json()['id']}",
        json={"is_active": False},
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    first_active = env["client"].get(first_base, params={"active_only": "true"})
    first_all = env["client"].get(first_base)
    second_active = env["client"].get(second_base, params={"active_only": "true"})

    assert first_active.status_code == first_all.status_code == second_active.status_code == 200
    assert first_active.json() == []
    assert [row["id"] for row in first_all.json()] == [first_workspace_employee.json()["id"]]
    assert [row["id"] for row in second_active.json()] == [second_workspace_employee.json()["id"]]
