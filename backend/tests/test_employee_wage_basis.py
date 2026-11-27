"""3A-920 step 2 — the wage basis (monthly / daily / per-trip).

The net formula never changes (base + allowances + bonuses -
deductions) and the base is always server-computed. Monthly is
today's behavior; daily derives from the monthly salary (/ the
company's daily divisor, default 30 — manager ruling 2026-11-27);
per-trip multiplies the trip wage by the trip count. Closed
(approved/paid) periods never change: only drafts are editable and
the base is never recomputed on update.
"""
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "employee-wage-basis-test-owner"
APPROVER = "employee-wage-basis-test-approver"
STAFF = "employee-wage-basis-test-staff"


@pytest.fixture
def wage_basis_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Wage basis test", "currency_code": "EGP"})
        assert created.status_code == 201
        business_id = created.json()["id"]
        with app.state.session_factory() as session:
            session.add_all([
                BusinessMembership(
                    business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF
                ),
                BusinessMembership(
                    business_id=UUID(business_id), user_subject=APPROVER, role=MembershipRole.OWNER
                ),
            ])
            session.commit()
        yield {"client": client, "business_id": business_id, "subject": current_subject, "engine": engine}
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


def _set_transport(env, enabled: bool):
    response = env["client"].put(
        f"/api/v1/businesses/{env['business_id']}/settings/transport.enabled",
        json={"setting_value": "true" if enabled else "false"},
    )
    assert response.status_code == 200, response.text


def _create_employee(env, *, code="EMP-01", salary="5000.00", **extra):
    payload = {
        "name": f"Employee {code}", "employee_code": code,
        "email": f"{code.lower()}@example.test", "department": "Sales",
        "job_title": "Associate", "monthly_salary": salary,
    }
    payload.update(extra)
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/employees", json=payload)


def _patch_employee(env, employee_id, payload):
    return env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee_id}", json=payload
    )


def _create_payroll(env, employee_id, *, period="2026-11", **extra):
    payload = {"period": period, "allowances": "0", "bonuses": "0", "deductions": "0"}
    payload.update(extra)
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee_id}/payroll", json=payload
    )


def test_create_defaults_to_monthly(wage_basis_environment):
    env = wage_basis_environment
    created = _create_employee(env)
    assert created.status_code == 201
    assert created.json()["wage_basis"] == "monthly"
    assert created.json()["trip_wage"] is None


def test_per_trip_basis_requires_transport_on(wage_basis_environment):
    env = wage_basis_environment
    rejected = _create_employee(env, wage_basis="per_trip", trip_wage="150.00")
    assert rejected.status_code == 422

    _set_transport(env, True)
    created = _create_employee(env, code="EMP-02", wage_basis="per_trip", trip_wage="150.00")
    assert created.status_code == 201
    assert created.json()["wage_basis"] == "per_trip"
    assert created.json()["trip_wage"] == "150.00"


def test_update_basis_gated_by_switch(wage_basis_environment):
    env = wage_basis_environment
    employee = _create_employee(env).json()
    rejected = _patch_employee(env, employee["id"], {"wage_basis": "per_trip"})
    assert rejected.status_code == 422

    _set_transport(env, True)
    updated = _patch_employee(env, employee["id"], {"wage_basis": "per_trip", "trip_wage": "120.00"})
    assert updated.status_code == 200
    assert updated.json()["wage_basis"] == "per_trip"

    # Clearing the basis back to monthly stays allowed while off.
    _set_transport(env, False)
    cleared = _patch_employee(env, employee["id"], {"wage_basis": "monthly"})
    assert cleared.status_code == 200
    assert cleared.json()["wage_basis"] == "monthly"
    assert _patch_employee(env, employee["id"], {"wage_basis": "per_trip"}).status_code == 422


def test_keeping_stored_basis_while_off_is_allowed(wage_basis_environment):
    # The gate blocks NEW enrolments only — the form re-sends the stored
    # basis on every save, so editing any other field of a stored
    # per-trip employee must stay possible while the switch is off.
    env = wage_basis_environment
    _set_transport(env, True)
    employee = _create_employee(env, wage_basis="per_trip", trip_wage="150.00").json()
    _set_transport(env, False)
    kept = _patch_employee(env, employee["id"], {"name": "Mona Ali 2", "wage_basis": "per_trip"})
    assert kept.status_code == 200
    assert kept.json()["wage_basis"] == "per_trip"
    assert kept.json()["name"] == "Mona Ali 2"


def test_invalid_basis_and_wage_rejected(wage_basis_environment):
    env = wage_basis_environment
    assert _create_employee(env, wage_basis="weekly").status_code == 422
    assert _create_employee(env, code="EMP-02", wage_basis="per_trip", trip_wage="0").status_code == 422
    employee = _create_employee(env, code="EMP-03").json()
    assert _patch_employee(env, employee["id"], {"wage_basis": None}).status_code == 422


def test_per_trip_payroll_math(wage_basis_environment):
    env = wage_basis_environment
    _set_transport(env, True)
    employee = _create_employee(env, wage_basis="per_trip", trip_wage="150.00").json()
    record = _create_payroll(env, employee["id"], trips=20, allowances="100", deductions="50")
    assert record.status_code == 201, record.text
    body = record.json()
    assert body["base_salary"] == "3000.00"  # 20 trips x 150.00
    assert body["net_pay"] == "3050.00"  # 3000 + 100 - 50
    assert body["trips"] == 20
    assert body["work_days"] is None


def test_per_trip_payroll_requires_trips_and_wage(wage_basis_environment):
    env = wage_basis_environment
    _set_transport(env, True)
    employee = _create_employee(env, wage_basis="per_trip").json()
    assert _create_payroll(env, employee["id"], trips=10).status_code == 422  # no trip wage set
    _patch_employee(env, employee["id"], {"trip_wage": "150.00"})
    assert _create_payroll(env, employee["id"]).status_code == 422  # trips required
    assert _create_payroll(env, employee["id"], trips=10, work_days=5).status_code == 422


def test_daily_payroll_math(wage_basis_environment):
    env = wage_basis_environment
    employee = _create_employee(env, salary="6000.00", wage_basis="daily").json()
    record = _create_payroll(env, employee["id"], work_days=15, allowances="200")
    assert record.status_code == 201, record.text
    body = record.json()
    assert body["base_salary"] == "3000.00"  # 6000 / 30 x 15 days
    assert body["net_pay"] == "3200.00"
    assert body["work_days"] == 15
    assert body["trips"] is None
    assert _create_payroll(env, employee["id"], period="2026-10").status_code == 422  # days required
    assert _create_payroll(env, employee["id"], period="2026-09", work_days=10, trips=3).status_code == 422


def test_daily_payroll_uses_company_divisor(wage_basis_environment):
    env = wage_basis_environment
    # Manager ruling 2026-11-27: the divisor is a company setting
    # (default 30), read at creation time only.
    response = env["client"].put(
        f"/api/v1/businesses/{env['business_id']}/settings/payroll.daily_divisor",
        json={"setting_value": "26"},
    )
    assert response.status_code == 200, response.text
    employee = _create_employee(env, salary="6000.00", wage_basis="daily").json()
    record = _create_payroll(env, employee["id"], work_days=13)
    assert record.status_code == 201, record.text
    assert record.json()["base_salary"] == "3000.00"  # 6000 / 26 x 13 days
    # Changing the divisor afterwards never rewrites the stored record:
    # a new period computes with the new divisor, the old one stands.
    env["client"].put(
        f"/api/v1/businesses/{env['business_id']}/settings/payroll.daily_divisor",
        json={"setting_value": "30"},
    )
    later = _create_payroll(env, employee["id"], period="2026-10", work_days=13)
    assert later.json()["base_salary"] == "2600.00"  # 6000 / 30 x 13 days
    listing = env["client"].get(f"/api/v1/businesses/{env['business_id']}/payroll?period=2026-11")
    assert listing.json()[0]["base_salary"] == "3000.00"


def test_monthly_payroll_unchanged_and_rejects_units(wage_basis_environment):
    env = wage_basis_environment
    employee = _create_employee(env).json()
    record = _create_payroll(env, employee["id"], allowances="100")
    assert record.status_code == 201
    assert record.json()["base_salary"] == "5000.00"
    assert record.json()["net_pay"] == "5100.00"
    assert record.json()["trips"] is None and record.json()["work_days"] is None
    assert _create_payroll(env, employee["id"], period="2026-10", trips=5).status_code == 422
    assert _create_payroll(env, employee["id"], period="2026-09", work_days=5).status_code == 422


def test_closed_payroll_period_never_changes(wage_basis_environment):
    env = wage_basis_environment
    _set_transport(env, True)
    employee = _create_employee(env, wage_basis="per_trip", trip_wage="150.00").json()
    record = _create_payroll(env, employee["id"], trips=10).json()
    assert record["base_salary"] == "1500.00"
    # Approval needs a different owner than the creator (four-eyes).
    env["subject"]["value"] = APPROVER
    try:
        approved = env["client"].post(
            f"/api/v1/businesses/{env['business_id']}/payroll/{record['id']}/approve"
        )
    finally:
        env["subject"]["value"] = OWNER
    assert approved.status_code == 200
    # Only drafts are editable — the approved record is immutable.
    assert env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/payroll/{record['id']}",
        json={"allowances": "999"},
    ).status_code == 409
    # Changing the employee's basis afterwards leaves the record alone.
    _patch_employee(env, employee["id"], {"wage_basis": "monthly"})
    listing = env["client"].get(f"/api/v1/businesses/{env['business_id']}/payroll?period=2026-11")
    assert listing.status_code == 200
    assert listing.json()[0]["base_salary"] == "1500.00"
    assert listing.json()[0]["trips"] == 10


def test_trip_wage_number_is_inert_while_off(wage_basis_environment):
    env = wage_basis_environment
    employee = _create_employee(env).json()
    updated = _patch_employee(env, employee["id"], {"trip_wage": "150.00"})
    assert updated.status_code == 200
    assert updated.json()["trip_wage"] == "150.00"
    assert updated.json()["wage_basis"] == "monthly"
    record = _create_payroll(env, employee["id"])
    assert record.status_code == 201
    assert record.json()["base_salary"] == "5000.00"


def test_staff_cannot_change_wage_basis(wage_basis_environment):
    env = wage_basis_environment
    employee = _create_employee(env).json()
    env["subject"]["value"] = STAFF
    try:
        assert _patch_employee(env, employee["id"], {"wage_basis": "daily"}).status_code == 403
    finally:
        env["subject"]["value"] = OWNER
