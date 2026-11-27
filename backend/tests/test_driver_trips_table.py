"""3A-920 step 6 — the driver trips table in the employee profile.

One row per ISSUED invoice that carried a transport block for the
driver: date, customer, trips, and the money trail — due from the
issue-time wage snapshot, paid from the confirmed payroll record's
payment ledger (step 5), remaining. Drafts never appear. The table
reads stored facts, so it keeps answering while the master switch is
off (the UI hides the section instead); wage data stays owner-only.
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

OWNER = "driver-trips-test-owner"
STAFF = "driver-trips-test-staff"


@pytest.fixture
def transport_block_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Driver trips test", "currency_code": "EGP"})
        assert created.status_code == 201
        business_id = created.json()["id"]
        with app.state.session_factory() as session:
            session.add(BusinessMembership(
                business_id=UUID(business_id),
                user_subject=STAFF, role=MembershipRole.STAFF,
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


def _create_employee(env, *, code="EMP-01", **extra):
    payload = {
        "name": f"Employee {code}", "employee_code": code,
        "email": f"{code.lower()}@example.test", "department": "Ops",
        "job_title": "Associate", "monthly_salary": "5000.00",
    }
    payload.update(extra)
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/employees", json=payload)


def _make_driver(env, *, code="DRV-01", trip_wage="150.00"):
    created = _create_employee(
        env, code=code, is_driver=True, wage_basis="per_trip", trip_wage=trip_wage,
    )
    assert created.status_code == 201, created.text
    return created.json()


def _make_customer(env):
    created = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/customers", json={"name": "Store Customer"}
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _make_invoice(env, customer_id, *, number="INV-001", **transport):
    payload = {
        "invoice_number": number, "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"description": "Goods delivery", "quantity": "1", "unit_price": "100.00"}],
    }
    payload.update(transport)
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/invoices", json=payload)


def _issue(env, invoice_id):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}/issue", json={}
    )


def _void(env, invoice_id):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}/void", json={}
    )


def _detail(env, invoice_id):
    response = env["client"].get(f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}")
    assert response.status_code == 200, response.text
    return response.json()


def _entitlements(env):
    response = env["client"].get(f"/api/v1/businesses/{env['business_id']}/transport-entitlements")
    assert response.status_code == 200, response.text
    return response.json()


def _confirm(env, invoice_id, **body):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/transport-entitlements/{invoice_id}/confirm",
        json=body,
    )


def _dismiss(env, invoice_id):
    return env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/transport-entitlements/{invoice_id}/dismiss",
        json={},
    )




def _issued_invoice_with_block(env, *, trips=3, number="INV-001", code="DRV-01", driver=None):
    driver = driver or _make_driver(env, code=code)
    customer_id = _make_customer(env)
    created = _make_invoice(
        env, customer_id, number=number,
        driver_employee_id=driver["id"], transport_trips=trips,
        transport_from="Warehouse", transport_to="Customer site",
    )
    assert created.status_code == 201, created.text
    invoice_id = created.json()["id"]
    assert _issue(env, invoice_id).status_code == 200
    return driver, invoice_id


def _trips(env, employee_id):
    return env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee_id}/driver-trips"
    )


def test_trips_table_money_trail(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver, invoice_id = _issued_invoice_with_block(env, trips=3)
    # Still proposed: due from the snapshot, nothing paid yet.
    rows = _trips(env, driver["id"])
    assert rows.status_code == 200, rows.text
    rows = rows.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["invoice_id"] == invoice_id
    assert row["invoice_number"] == "INV-001"
    assert row["customer_name"]
    assert row["trips"] == 3
    assert row["trip_wage"] == "150.00"
    assert row["due"] == "450.00"
    assert row["paid"] == "0.00"
    assert row["remaining"] == "450.00"
    assert row["entitlement_status"] == "proposed"
    assert row["payroll_id"] is None
    # Confirm into a draft payroll record, approve it as a second
    # owner (approval is four-eyes), then pay against it in parts.
    confirmed = _confirm(env, invoice_id)
    assert confirmed.status_code == 200, confirmed.text
    payroll_id = confirmed.json()["id"]
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=UUID(env["business_id"]),
            user_subject="driver-trips-test-approver", role=MembershipRole.OWNER,
        ))
        session.commit()
    env["subject"]["value"] = "driver-trips-test-approver"
    approved = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/payroll/{payroll_id}/approve", json={}
    )
    assert approved.status_code == 200, approved.text
    env["subject"]["value"] = OWNER
    part = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/payroll/{payroll_id}/payments",
        json={"amount": "200.00"},
    )
    assert part.status_code == 201, part.text
    row = _trips(env, driver["id"]).json()[0]
    assert row["entitlement_status"] == "confirmed"
    assert row["payroll_id"] == payroll_id
    assert row["paid"] == "200.00"
    assert row["remaining"] == "250.00"
    # Settle the rest through full pay — the row closes out.
    paid = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/payroll/{payroll_id}/pay", json={}
    )
    assert paid.status_code == 200, paid.text
    row = _trips(env, driver["id"]).json()[0]
    assert row["paid"] == "450.00"
    assert row["remaining"] == "0.00"


def test_trips_table_statuses_and_drafts(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver = _make_driver(env)
    customer_id = _make_customer(env)
    # A draft with a block never appears.
    draft = _make_invoice(
        env, customer_id, number="INV-DRAFT",
        driver_employee_id=driver["id"], transport_trips=1,
    )
    assert draft.status_code == 201
    assert _trips(env, driver["id"]).json() == []
    # Dismissed + cancelled rows carry their statuses.
    _, dismissed_id = _issued_invoice_with_block(env, trips=1, number="INV-DIS", driver=driver)
    assert _dismiss(env, dismissed_id).status_code == 200
    _, voided_id = _issued_invoice_with_block(env, trips=2, number="INV-VOID", driver=driver)
    assert _void(env, voided_id).status_code == 200
    rows = _trips(env, driver["id"]).json()
    by_number = {row["invoice_number"]: row for row in rows}
    assert set(by_number) == {"INV-DIS", "INV-VOID"}
    assert by_number["INV-DIS"]["entitlement_status"] == "dismissed"
    assert by_number["INV-DIS"]["due"] == "150.00"
    assert by_number["INV-VOID"]["entitlement_status"] == "cancelled"
    assert by_number["INV-VOID"]["due"] == "300.00"


def test_trips_table_guards(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver, _ = _issued_invoice_with_block(env)
    plain = _create_employee(env, code="EMP-PLAIN")
    assert plain.status_code == 201
    # A non-driver employee simply has no trips.
    assert _trips(env, plain.json()["id"]).json() == []
    # Unknown employee -> 404; staff -> 403.
    assert _trips(env, "00000000-0000-0000-0000-000000000000").status_code == 404
    env["subject"]["value"] = STAFF
    assert _trips(env, driver["id"]).status_code == 403
    env["subject"]["value"] = OWNER
    # Stored facts keep reading while the switch is off.
    _set_transport(env, False)
    rows = _trips(env, driver["id"])
    assert rows.status_code == 200
    assert len(rows.json()) == 1
