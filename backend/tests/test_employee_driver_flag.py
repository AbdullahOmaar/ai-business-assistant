"""3A-920 step 1 — the driver/delivery-agent flag on employees.

The flag (not a free-text job title) is what enrolls an employee in
the invoice drivers list (step 4). It is only settable while the
per-business transport switch is on; turning the switch off never
clears a stored flag — the tag is hidden, not deleted.
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

OWNER = "employee-driver-flag-test-owner"
STAFF = "employee-driver-flag-test-staff"


@pytest.fixture
def driver_flag_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Driver flag test", "currency_code": "EGP"})
        assert created.status_code == 201
        business_id = created.json()["id"]
        with app.state.session_factory() as session:
            session.add(BusinessMembership(
                business_id=UUID(business_id), user_subject=STAFF, role=MembershipRole.STAFF
            ))
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
    return response


def _create_employee(env, *, name="Mona Ali", code="EMP-01", is_driver=None, job_title="Associate"):
    payload = {
        "name": name, "employee_code": code, "email": f"{code.lower()}@example.test",
        "department": "Sales", "job_title": job_title, "monthly_salary": "5000.00",
    }
    if is_driver is not None:
        payload["is_driver"] = is_driver
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/employees", json=payload)


def _get_employee(env, employee_id):
    listing = env["client"].get(f"/api/v1/businesses/{env['business_id']}/employees")
    assert listing.status_code == 200
    return next(item for item in listing.json() if item["id"] == employee_id)


def test_create_defaults_to_not_driver(driver_flag_environment):
    env = driver_flag_environment
    created = _create_employee(env)
    assert created.status_code == 201
    assert created.json()["is_driver"] is False


def test_driver_flag_requires_transport_on(driver_flag_environment):
    env = driver_flag_environment
    rejected = _create_employee(env, code="EMP-01", is_driver=True)
    assert rejected.status_code == 422

    _set_transport(env, True)
    created = _create_employee(env, code="EMP-02", is_driver=True)
    assert created.status_code == 201
    assert created.json()["is_driver"] is True
    assert _get_employee(env, created.json()["id"])["is_driver"] is True


def test_update_driver_flag_gated_by_switch(driver_flag_environment):
    env = driver_flag_environment
    employee = _create_employee(env).json()
    business = env["business_id"]
    url = f"/api/v1/businesses/{business}/employees/{employee['id']}"

    rejected = env["client"].patch(url, json={"is_driver": True})
    assert rejected.status_code == 422
    assert _get_employee(env, employee["id"])["is_driver"] is False

    _set_transport(env, True)
    updated = env["client"].patch(url, json={"is_driver": True})
    assert updated.status_code == 200
    assert updated.json()["is_driver"] is True

    # Turning the switch off again: clearing the flag stays allowed,
    # re-enrolling does not.
    _set_transport(env, False)
    cleared = env["client"].patch(url, json={"is_driver": False})
    assert cleared.status_code == 200
    assert cleared.json()["is_driver"] is False
    rejected_again = env["client"].patch(url, json={"is_driver": True})
    assert rejected_again.status_code == 422


def test_job_title_alone_never_enrolls_a_driver(driver_flag_environment):
    env = driver_flag_environment
    created = _create_employee(env, job_title="سائق")
    assert created.status_code == 201
    assert created.json()["is_driver"] is False


def test_switch_off_preserves_the_stored_flag(driver_flag_environment):
    env = driver_flag_environment
    _set_transport(env, True)
    employee = _create_employee(env, is_driver=True).json()
    assert employee["is_driver"] is True
    _set_transport(env, False)
    # Stored + hidden, not deleted: the flag still reads True.
    assert _get_employee(env, employee["id"])["is_driver"] is True


def test_keeping_stored_flag_while_off_is_allowed(driver_flag_environment):
    # The gate blocks NEW enrolments only — the form re-sends the stored
    # flag on every save, so editing any other field of a stored driver
    # must stay possible while the switch is off.
    env = driver_flag_environment
    _set_transport(env, True)
    employee = _create_employee(env, is_driver=True).json()
    _set_transport(env, False)
    url = f"/api/v1/businesses/{env['business_id']}/employees/{employee['id']}"
    kept = env["client"].patch(url, json={"name": "Mona Ali 2", "is_driver": True})
    assert kept.status_code == 200
    assert kept.json()["is_driver"] is True
    assert kept.json()["name"] == "Mona Ali 2"


def test_staff_cannot_set_the_driver_flag(driver_flag_environment):
    env = driver_flag_environment
    _set_transport(env, True)
    employee = _create_employee(env).json()
    env["subject"]["value"] = STAFF
    try:
        response = env["client"].patch(
            f"/api/v1/businesses/{env['business_id']}/employees/{employee['id']}",
            json={"is_driver": True},
        )
        assert response.status_code == 403
    finally:
        env["subject"]["value"] = OWNER
    assert _get_employee(env, employee["id"])["is_driver"] is False


def test_driver_flag_null_is_rejected(driver_flag_environment):
    env = driver_flag_environment
    employee = _create_employee(env).json()
    response = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee['id']}",
        json={"is_driver": None},
    )
    assert response.status_code == 422
