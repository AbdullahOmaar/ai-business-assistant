"""3A-920 acceptance — the registered package scenarios end to end.

(a) Shouna scenario: building material sold by a second unit (a
"trip" of 4 meters) with the driver's transport block on the same
invoice; (b) the same machinery is activity-neutral (the block,
wage and queue carry general labels only); (c) switch OFF = zero
effect on invoices/employees/payroll; (d) switching off AFTER real
use preserves everything — data stored, past payroll untouched —
and re-enabling restores it exactly.
"""
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "transport-acceptance-owner"
STAFF = "transport-acceptance-staff"


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
        created = client.post("/api/v1/businesses", json={"name": "Transport acceptance test", "currency_code": "EGP"})
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




def _trips(env, employee_id):
    return env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/employees/{employee_id}/driver-trips"
    )


def test_full_cycle_use_off_on(transport_block_environment):
    env = transport_block_environment
    client, base = env["client"], f"/api/v1/businesses/{env['business_id']}"
    _set_transport(env, True)
    driver = _make_driver(env)  # per-trip, wage 150.00
    customer_id = _make_customer(env)
    product = client.post(f"{base}/products", json={
        "name": "Sand", "unit": "meter", "unit_price": "10.00",
        "is_stock_tracked": True, "opening_quantity": "100",
        "second_unit_name": "trip", "conversion_factor": "4",
    })
    assert product.status_code == 201, product.text
    product_id = product.json()["id"]

    # (a) Shouna scenario: 3 trips of sand on one invoice that also
    # carries the driver's block — issue deducts 12 base meters and
    # raises the 450.00 proposal.
    invoice = client.post(f"{base}/invoices", json={
        "invoice_number": "INV-ACC-1", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product_id, "quantity": "3", "unit": "trip"}],
        "driver_employee_id": driver["id"], "transport_trips": 3,
        "transport_from": "Warehouse", "transport_to": "Site",
    })
    assert invoice.status_code == 201, invoice.text
    invoice_id = invoice.json()["id"]
    assert _issue(env, invoice_id).status_code == 200
    stock = client.get(f"{base}/products/{product_id}")
    assert Decimal(stock.json()["stock_quantity"]) == Decimal(88)
    detail = _detail(env, invoice_id)
    assert detail["transport_entitlement_status"] == "proposed"
    assert Decimal(detail["transport_entitlement_amount"]) == Decimal("450.00")

    # Confirm -> approve (four-eyes) -> partial pay 200.00 (step 5).
    confirmed = _confirm(env, invoice_id)
    assert confirmed.status_code == 200, confirmed.text
    payroll_id = confirmed.json()["id"]
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=UUID(env["business_id"]),
            user_subject="transport-acceptance-approver", role=MembershipRole.OWNER,
        ))
        session.commit()
    env["subject"]["value"] = "transport-acceptance-approver"
    assert client.post(f"{base}/payroll/{payroll_id}/approve", json={}).status_code == 200
    env["subject"]["value"] = OWNER
    part = client.post(f"{base}/payroll/{payroll_id}/payments", json={"amount": "200.00"})
    assert part.status_code == 201, part.text
    row = _trips(env, driver["id"]).json()[0]
    assert (row["due"], row["paid"], row["remaining"]) == ("450.00", "200.00", "250.00")

    # (d) Switch OFF after real use: everything is preserved.
    _set_transport(env, False)
    detail_off = _detail(env, invoice_id)
    assert detail_off["driver_employee_id"] == driver["id"]
    assert detail_off["transport_trips"] == 3
    assert detail_off["transport_entitlement_status"] == "confirmed"
    row_off = _trips(env, driver["id"]).json()[0]
    assert (row_off["due"], row_off["paid"], row_off["remaining"]) == ("450.00", "200.00", "250.00")
    payroll_rows = client.get(f"{base}/payroll").json()
    record = next(r for r in payroll_rows if r["id"] == payroll_id)
    assert record["paid_amount"] == "200.00"
    assert record["remaining_amount"] == "250.00"
    assert record["status"] == "approved"
    # (c) While off, NEW transport enrolments are refused...
    blocked = client.post(f"{base}/invoices", json={
        "invoice_number": "INV-ACC-2", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"description": "x", "quantity": "1", "unit_price": "1.00"}],
        "driver_employee_id": driver["id"], "transport_trips": 1,
    })
    assert blocked.status_code == 422, blocked.text
    # ...but plain work continues exactly as today.
    plain = client.post(f"{base}/invoices", json={
        "invoice_number": "INV-ACC-3", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"description": "x", "quantity": "1", "unit_price": "1.00"}],
    })
    assert plain.status_code == 201, plain.text

    # Re-enable: everything restores exactly, no duplicate proposal.
    _set_transport(env, True)
    assert _entitlements(env) == []
    row_on = _trips(env, driver["id"]).json()[0]
    assert (row_on["due"], row_on["paid"], row_on["remaining"]) == ("450.00", "200.00", "250.00")
    # And the remainder can still be settled.
    settled = client.post(f"{base}/payroll/{payroll_id}/pay", json={})
    assert settled.status_code == 200, settled.text
    row_final = _trips(env, driver["id"]).json()[0]
    assert (row_final["paid"], row_final["remaining"]) == ("450.00", "0.00")
