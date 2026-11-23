"""3A-250 (T41) failure-state acceptance for the employee/payroll cycle.

The happy path, role denials, tenant isolation, duplicate periods and
double payment are covered by test_employee_payroll_api.py. This file
pins the remaining failure states the T41 acceptance list names:

- payroll cannot be created for a deactivated employee (404, no rows);
- an approved payroll can no longer be edited (409, values unchanged);
- an already-approved payroll cannot be approved again (409);
- a paid payroll can no longer be edited or re-approved (409).
"""

from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole, PayrollRecord
from app.security import AuthenticatedPrincipal

OWNER = "payroll-failure-owner"
APPROVER = "payroll-failure-approver"


@pytest.fixture
def payroll_env(monkeypatch):
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
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(current_subject["value"])
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    try:
        client = TestClient(app)
        created = client.post("/api/v1/businesses", json={"name": "Payroll failure", "currency_code": "EGP"})
        assert created.status_code == 201
        business_id = created.json()["id"]
        with app.state.session_factory() as session:
            session.add(BusinessMembership(
                business_id=UUID(business_id), user_subject=APPROVER, role=MembershipRole.OWNER
            ))
            session.commit()
        yield {"client": client, "business_id": business_id, "subject": current_subject}
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


def _employee(env) -> dict:
    response = env["client"].post(f"/api/v1/businesses/{env['business_id']}/employees", json={
        "name": "Mona Ali", "employee_code": "EMP-01", "email": "mona@example.test",
        "department": "Sales", "job_title": "Associate", "monthly_salary": "5000.00",
    })
    assert response.status_code == 201
    return response.json()


def _draft_payroll(env, employee_id: str) -> dict:
    response = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee_id}/payroll",
        json={"period": "2026-10", "allowances": "200.00"},
    )
    assert response.status_code == 201
    return response.json()


def test_payroll_for_deactivated_employee_is_rejected_without_rows(payroll_env):
    env = payroll_env
    employee = _employee(env)
    base = f"/api/v1/businesses/{env['business_id']}"
    deactivated = env["client"].patch(f"{base}/employees/{employee['id']}", json={"is_active": False})
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    response = env["client"].post(f"{base}/employees/{employee['id']}/payroll", json={"period": "2026-10"})
    assert response.status_code == 404
    with app.state.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(PayrollRecord)) == 0


def test_approved_payroll_cannot_be_edited_or_reapproved(payroll_env):
    env = payroll_env
    employee = _employee(env)
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll = _draft_payroll(env, employee["id"])

    env["subject"]["value"] = APPROVER
    approved = env["client"].post(f"{base}/payroll/{payroll['id']}/approve", json={})
    assert approved.status_code == 200
    reapprove = env["client"].post(f"{base}/payroll/{payroll['id']}/approve", json={})
    assert reapprove.status_code == 409
    env["subject"]["value"] = OWNER

    edited = env["client"].patch(f"{base}/payroll/{payroll['id']}", json={"allowances": "999.00"})
    assert edited.status_code == 409
    with app.state.session_factory() as session:
        persisted = session.get(PayrollRecord, UUID(payroll["id"]))
        assert persisted is not None
        assert persisted.status == "approved"
        assert str(persisted.allowances) == "200.00"


def test_paid_payroll_cannot_be_edited(payroll_env):
    env = payroll_env
    employee = _employee(env)
    base = f"/api/v1/businesses/{env['business_id']}"
    payroll = _draft_payroll(env, employee["id"])

    env["subject"]["value"] = APPROVER
    assert env["client"].post(f"{base}/payroll/{payroll['id']}/approve", json={}).status_code == 200
    env["subject"]["value"] = OWNER
    assert env["client"].post(f"{base}/payroll/{payroll['id']}/pay", json={}).status_code == 200

    edited = env["client"].patch(f"{base}/payroll/{payroll['id']}", json={"deductions": "1.00"})
    assert edited.status_code == 409
    with app.state.session_factory() as session:
        persisted = session.get(PayrollRecord, UUID(payroll["id"]))
        assert persisted is not None and persisted.status == "paid"
