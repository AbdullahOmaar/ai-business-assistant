"""3A-920 step 4 — the invoice transport block + proposed entitlement.

The block (driver + trips + from/to) exists only while the master
switch is on, and only for employees carrying the driver tag.
Issuing raises a PROPOSED entitlement — a proposal for payroll
confirmation, never an automatic posting. The trip wage is
snapshotted at issue time, so a later wage change never rewrites
the proposal. Confirmation creates an ordinary DRAFT payroll record
through the owner's explicit action; dismissal and voiding follow
the recorded status machine (proposed -> confirmed / dismissed /
cancelled). Wage data stays owner-only: staff see the operational
block on the invoice, never the wage or the amount.
"""
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "invoice-transport-test-owner"
STAFF = "invoice-transport-test-staff"


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
        created = client.post("/api/v1/businesses", json={"name": "Transport block test", "currency_code": "EGP"})
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


def _issued_invoice_with_block(env, *, trips=3, number="INV-001", code="DRV-01"):
    driver = _make_driver(env, code=code)
    customer_id = _make_customer(env)
    created = _make_invoice(
        env, customer_id, number=number,
        driver_employee_id=driver["id"], transport_trips=trips,
        transport_from="المعادي", transport_to="مدينة نصر",
    )
    assert created.status_code == 201, created.text
    invoice_id = created.json()["id"]
    assert _issue(env, invoice_id).status_code == 200
    return driver, invoice_id


def test_block_rejected_while_switch_off(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver = _make_driver(env)
    customer_id = _make_customer(env)
    _set_transport(env, False)
    blocked = _make_invoice(
        env, customer_id, driver_employee_id=driver["id"], transport_trips=2,
    )
    assert blocked.status_code == 422, blocked.text
    # Even free text alone is a transport write while off.
    text_only = _make_invoice(env, customer_id, number="INV-002", transport_from="A", transport_to="B")
    assert text_only.status_code == 422, text_only.text
    # An ordinary invoice still works exactly as today.
    plain = _make_invoice(env, customer_id, number="INV-003")
    assert plain.status_code == 201, plain.text
    assert plain.json()["driver_employee_id"] is None


def test_block_pair_and_driver_validation(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver = _make_driver(env)
    plain = _create_employee(env, code="EMP-09").json()
    customer_id = _make_customer(env)
    # Trips without a driver, and a driver without trips, are both 422.
    assert _make_invoice(env, customer_id, transport_trips=2).status_code == 422
    assert _make_invoice(env, customer_id, number="INV-002",
                         driver_employee_id=driver["id"]).status_code == 422
    # A non-driver employee and an unknown id are both refused.
    assert _make_invoice(env, customer_id, number="INV-003",
                         driver_employee_id=plain["id"], transport_trips=1).status_code == 422
    assert _make_invoice(env, customer_id, number="INV-004",
                         driver_employee_id=str(uuid4()), transport_trips=1).status_code == 422
    # The valid block stores, and the create response carries it.
    created = _make_invoice(
        env, customer_id, number="INV-005",
        driver_employee_id=driver["id"], transport_trips=2,
        transport_from="المعادي", transport_to="مدينة نصر",
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["driver_employee_id"] == driver["id"]
    assert body["transport_trips"] == 2
    assert body["transport_from"] == "المعادي"
    assert body["transport_to"] == "مدينة نصر"
    assert body["transport_entitlement_status"] is None


def test_issue_raises_proposal_with_wage_snapshot(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver, invoice_id = _issued_invoice_with_block(env, trips=3)
    proposals = _entitlements(env)
    assert len(proposals) == 1
    proposal = proposals[0]
    assert proposal["invoice_id"] == invoice_id
    assert proposal["driver_employee_id"] == driver["id"]
    assert proposal["trips"] == 3
    assert proposal["trip_wage"] == "150.00"
    assert proposal["amount"] == "450.00"
    assert proposal["unit_name"] == "توصيلة"
    # A later wage change never rewrites the proposal (snapshot).
    patched = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/employees/{driver['id']}",
        json={"trip_wage": "200.00"},
    )
    assert patched.status_code == 200, patched.text
    assert _entitlements(env)[0]["amount"] == "450.00"
    detail = _detail(env, invoice_id)
    assert detail["transport_entitlement_status"] == "proposed"
    assert detail["transport_trip_wage"] == "150.00"
    assert detail["transport_entitlement_amount"] == "450.00"
    assert detail["driver_name"] == driver["name"]


def test_confirm_creates_draft_payroll(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver, invoice_id = _issued_invoice_with_block(env, trips=3)
    confirmed = _confirm(env, invoice_id)
    assert confirmed.status_code == 200, confirmed.text
    record = confirmed.json()
    assert record["employee_id"] == driver["id"]
    assert record["trips"] == 3
    assert record["base_salary"] == "450.00"
    assert record["net_pay"] == "450.00"
    assert record["status"] == "draft"
    assert record["invoice_id"] == invoice_id
    # The period defaults to the invoice's issue month.
    issue_month = _detail(env, invoice_id)["issue_date"][:7]
    assert record["period"] == issue_month
    # The invoice now points at the payroll record; the queue is empty.
    detail = _detail(env, invoice_id)
    assert detail["transport_entitlement_status"] == "confirmed"
    assert detail["transport_entitlement_payroll_id"] == record["id"]
    assert _entitlements(env) == []
    assert _confirm(env, invoice_id).status_code == 409
    # And the record is an ordinary payroll draft in the list.
    listing = env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/payroll?period={issue_month}"
    )
    assert [row["id"] for row in listing.json()] == [record["id"]]


def test_confirm_explicit_period_and_period_conflict(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver, first_id = _issued_invoice_with_block(env, trips=2, number="INV-001")
    customer_id = _make_customer(env)
    second = _make_invoice(
        env, customer_id, number="INV-002",
        driver_employee_id=driver["id"], transport_trips=1,
    ).json()
    assert _issue(env, second["id"]).status_code == 200
    assert _confirm(env, first_id, period="2026-11").json()["period"] == "2026-11"
    # Same driver + same period collides with the payroll uniqueness.
    assert _confirm(env, second["id"], period="2026-11").status_code == 409
    # A different period confirms fine.
    assert _confirm(env, second["id"], period="2026-12").status_code == 200


def test_confirm_blocked_when_basis_changed(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver, invoice_id = _issued_invoice_with_block(env, trips=2)
    patched = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/employees/{driver['id']}",
        json={"wage_basis": "monthly"},
    )
    assert patched.status_code == 200, patched.text
    # Honest refusal: the trips no longer match the driver's basis.
    assert _confirm(env, invoice_id).status_code == 422
    assert _entitlements(env)[0]["invoice_id"] == invoice_id  # still proposed


def test_dismiss_flow(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    _driver, invoice_id = _issued_invoice_with_block(env, trips=1)
    dismissed = _dismiss(env, invoice_id)
    assert dismissed.status_code == 200, dismissed.text
    assert dismissed.json()["status"] == "dismissed"
    assert _entitlements(env) == []
    assert _detail(env, invoice_id)["transport_entitlement_status"] == "dismissed"
    assert _confirm(env, invoice_id).status_code == 409
    assert _dismiss(env, invoice_id).status_code == 409


def test_void_cancels_proposal_but_confirmed_payroll_stands(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    _driver, first_id = _issued_invoice_with_block(env, trips=1, number="INV-001")
    assert _void(env, first_id).status_code == 200
    assert _detail(env, first_id)["transport_entitlement_status"] == "cancelled"
    assert _entitlements(env) == []
    # A confirmed entitlement is a payroll record of its own: voiding
    # the invoice afterwards never reaches into payroll.
    _driver2, second_id = _issued_invoice_with_block(env, trips=2, number="INV-002", code="DRV-02")
    record = _confirm(env, second_id).json()
    assert _void(env, second_id).status_code == 200
    assert _detail(env, second_id)["transport_entitlement_status"] == "confirmed"
    listing = env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/payroll?period={record['period']}"
    )
    assert [row["id"] for row in listing.json()] == [record["id"]]


def test_wage_secrecy_for_staff(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    _driver, invoice_id = _issued_invoice_with_block(env, trips=3)
    env["subject"]["value"] = STAFF
    try:
        detail = _detail(env, invoice_id)
        # Staff see the operational block, never the wage or amount.
        assert detail["transport_trips"] == 3
        assert detail["driver_employee_id"] is not None
        assert "transport_trip_wage" not in detail
        assert "transport_entitlement_amount" not in detail
        assert "transport_entitlement_payroll_id" not in detail
        queue = env["client"].get(f"/api/v1/businesses/{env['business_id']}/transport-entitlements")
        assert queue.status_code == 403
        assert _confirm(env, invoice_id).status_code == 403
        assert _dismiss(env, invoice_id).status_code == 403
    finally:
        env["subject"]["value"] = OWNER


def test_switch_off_after_use_preserves_data_and_queue(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    _driver, invoice_id = _issued_invoice_with_block(env, trips=2)
    _set_transport(env, False)
    # Recorded data stays stored + visible on the invoice itself.
    detail = _detail(env, invoice_id)
    assert detail["transport_trips"] == 2
    assert detail["transport_entitlement_status"] == "proposed"
    # The payroll queue keeps working while off (the pay that follows
    # recorded deliveries is not a new enrolment).
    assert len(_entitlements(env)) == 1
    assert _confirm(env, invoice_id).status_code == 200


def test_duplicate_does_not_carry_the_block(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    _driver, invoice_id = _issued_invoice_with_block(env, trips=2)
    duplicated = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}/duplicate", json={}
    )
    assert duplicated.status_code == 201, duplicated.text
    assert duplicated.json()["driver_employee_id"] is None
    detail = _detail(env, duplicated.json()["id"])
    assert detail["driver_employee_id"] is None
    assert detail["transport_trips"] is None


def test_draft_replace_sets_and_clears_the_block(transport_block_environment):
    env = transport_block_environment
    _set_transport(env, True)
    driver = _make_driver(env)
    customer_id = _make_customer(env)
    created = _make_invoice(
        env, customer_id, driver_employee_id=driver["id"], transport_trips=2,
    ).json()
    invoice_id = created["id"]
    # A full draft replacement that omits the block clears it.
    replaced = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}",
        json={
            "invoice_number": "INV-001", "currency_code": "EGP", "customer_id": customer_id,
            "lines": [{"description": "Goods delivery", "quantity": "1", "unit_price": "100.00"}],
        },
    )
    assert replaced.status_code == 200, replaced.text
    detail = _detail(env, invoice_id)
    assert detail["driver_employee_id"] is None
    assert detail["transport_trips"] is None
