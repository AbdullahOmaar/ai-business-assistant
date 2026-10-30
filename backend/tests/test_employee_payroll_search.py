from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
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
