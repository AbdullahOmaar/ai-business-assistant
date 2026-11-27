"""3A-923 C4 acceptance — the registered scenarios end to end.

(a) Store delivery: an order with a second-unit line (3 trips of 4
meters) + delivery data -> confirm -> convert -> issue: stock drops
in the BASE unit (100 -> 88) only at issue, and the driver's
entitlement proposal (3 x 150.00 = 450.00) appears in the queue
exactly like 3A-920. (b) A cancelled order moves nothing — no stock,
no entitlement, no invoice. (c) Switch OFF = no orders-delivery
effect: delivery fields and second-unit lines are refused, while a
plain order still works end to end. (d) A plain order without
delivery works with the switch on: convert -> issue deducts stock
and no entitlement is proposed.
"""
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "customer-orders-acceptance-owner"
STAFF = "customer-orders-acceptance-staff"


@pytest.fixture
def orders_acceptance_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Orders acceptance test", "currency_code": "EGP"})
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


def _make_customer(env):
    created = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/customers", json={"name": "Store Customer"}
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _make_product(env, *, name="Sand", unit_price="10.00", opening="100"):
    created = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/products",
        json={"name": name, "unit_price": unit_price, "is_stock_tracked": True,
              "opening_quantity": opening},
    )
    assert created.status_code == 201, created.text
    return created.json()


def _add_second_unit(env, product_id):
    patched = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/products/{product_id}",
        json={"second_unit_name": "trip", "conversion_factor": "4"},
    )
    assert patched.status_code == 200, patched.text


def _make_driver(env, *, code="DRV-01", trip_wage="150.00"):
    created = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/employees",
        json={"name": f"Driver {code}", "employee_code": code,
              "monthly_salary": "5000.00", "is_driver": True,
              "wage_basis": "per_trip", "trip_wage": trip_wage},
    )
    assert created.status_code == 201, created.text
    return created.json()


def _create_order(env, payload):
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/orders", json=payload)


def _stock(env, product_id):
    detail = env["client"].get(f"/api/v1/businesses/{env['business_id']}/products/{product_id}")
    assert detail.status_code == 200, detail.text
    return Decimal(detail.json()["stock_quantity"])


def _entitlements(env):
    queue = env["client"].get(f"/api/v1/businesses/{env['business_id']}/transport-entitlements")
    assert queue.status_code == 200, queue.text
    return queue.json()


def _audit_actions(env):
    with app.state.session_factory() as session:
        return [row.action for row in session.query(AuditEvent).where(
            AuditEvent.business_id == UUID(env["business_id"]),
        ).order_by(AuditEvent.created_at).all()]


def test_store_delivery_cycle(orders_acceptance_environment):
    """(a) Second-unit line + delivery -> confirm -> convert -> issue:
    stock drops in the base unit only at issue, and the driver's
    entitlement proposal (450.00) appears exactly like 3A-920."""
    env = orders_acceptance_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    _add_second_unit(env, product["id"])
    driver = _make_driver(env)

    created = _create_order(env, {
        "order_number": "ORD-DEL-001", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "3", "unit": "trip"}],
        "driver_employee_id": driver["id"], "transport_trips": 3,
        "transport_from": "Warehouse", "transport_to": "Store",
    })
    assert created.status_code == 201, created.text
    order = created.json()
    assert order["status"] == "draft"
    assert order["lines"][0]["unit_price"] == "40.00"
    assert order["lines"][0]["line_total"] == "120.00"
    assert order["total"] == "120.00"
    # An order never moves stock.
    assert _stock(env, product["id"]) == Decimal(100)

    confirmed = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/orders/{order['id']}/confirm", json={})
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "confirmed"
    assert _stock(env, product["id"]) == Decimal(100)

    converted = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/orders/{order['id']}/convert", json={})
    assert converted.status_code == 200, converted.text
    body = converted.json()
    assert body["status"] == "fulfilled"
    assert body["invoice_number"] == "INV-ORD-DEL-001"
    invoice_id = body["invoice_id"]
    invoice = env["client"].get(f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}")
    assert invoice.status_code == 200, invoice.text
    detail = invoice.json()
    assert detail["status"] == "draft"
    assert detail["lines"][0]["sold_unit"] == "trip"
    assert detail["lines"][0]["conversion_factor"] == "4.000"
    assert detail["driver_employee_id"] == driver["id"]
    assert detail["transport_trips"] == 3
    assert detail["transport_from"] == "Warehouse"
    assert detail["transport_to"] == "Store"
    assert _stock(env, product["id"]) == Decimal(100)

    issued = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}/issue", json={})
    assert issued.status_code == 200, issued.text
    # 3 trips x factor 4 = 12 base meters deducted at issue, not before.
    assert _stock(env, product["id"]) == Decimal(88)

    queue = _entitlements(env)
    assert len(queue) == 1
    assert queue[0]["amount"] == "450.00"
    assert queue[0]["driver_name"] == driver["name"]
    assert queue[0]["trips"] == 3

    actions = _audit_actions(env)
    for expected in ("order.created", "order.confirmed", "order.converted"):
        assert expected in actions


def test_cancelled_order_moves_nothing(orders_acceptance_environment):
    """(b) A cancelled order leaves no stock movement, no entitlement,
    no invoice — and cannot be converted afterwards."""
    env = orders_acceptance_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    created = _create_order(env, {
        "order_number": "ORD-CXL-001", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "3"}],
    })
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    cancelled = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/cancel", json={})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    converted = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/convert", json={})
    assert converted.status_code == 409, converted.text
    assert _stock(env, product["id"]) == Decimal(100)
    assert _entitlements(env) == []
    invoices = env["client"].get(f"/api/v1/businesses/{env['business_id']}/invoices")
    assert invoices.status_code == 200, invoices.text
    assert invoices.json() == []


def test_switch_off_no_delivery_effect(orders_acceptance_environment):
    """(c) Switch OFF: delivery fields and second-unit lines are
    refused (422), while a plain order still works end to end."""
    env = orders_acceptance_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    # The second unit is configured while the switch is on (setting a
    # new second unit while off is itself refused); the refusals below
    # run with the switch off.
    _set_transport(env, True)
    _add_second_unit(env, product["id"])
    driver = _make_driver(env)
    _set_transport(env, False)

    refused = _create_order(env, {
        "order_number": "ORD-OFF-001", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "3", "unit": "trip"}],
    })
    assert refused.status_code == 422, refused.text
    refused = _create_order(env, {
        "order_number": "ORD-OFF-002", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "3"}],
        "driver_employee_id": driver["id"], "transport_trips": 2,
    })
    assert refused.status_code == 422, refused.text

    created = _create_order(env, {
        "order_number": "ORD-OFF-003", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "3"}],
    })
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    converted = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/convert", json={})
    assert converted.status_code == 200, converted.text
    issued = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{converted.json()['invoice_id']}/issue", json={})
    assert issued.status_code == 200, issued.text
    assert _stock(env, product["id"]) == Decimal(97)
    assert _entitlements(env) == []


def test_plain_order_without_delivery(orders_acceptance_environment):
    """(d) Switch ON, plain order: convert -> issue deducts stock and
    proposes no entitlement."""
    env = orders_acceptance_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    created = _create_order(env, {
        "order_number": "ORD-PLAIN-001", "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "2"}],
    })
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    assert _stock(env, product["id"]) == Decimal(100)
    converted = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/convert", json={})
    assert converted.status_code == 200, converted.text
    invoice = env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/invoices/{converted.json()['invoice_id']}")
    assert invoice.json()["driver_employee_id"] is None
    issued = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{converted.json()['invoice_id']}/issue", json={})
    assert issued.status_code == 200, issued.text
    assert _stock(env, product["id"]) == Decimal(98)
    assert _entitlements(env) == []
