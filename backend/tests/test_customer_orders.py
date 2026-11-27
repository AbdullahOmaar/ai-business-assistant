"""3A-923 C4 — customer orders (T45).

An order is a pre-invoice document: it never moves stock and never
posts financially. On fulfilment it converts one-to-one into a DRAFT
invoice through the ordinary invoice service, and stock moves only
when that invoice is issued. Line pricing reuses the invoice rules
(server-priced from the catalogue, second-unit snapshots), and the
delivery block reuses the invoice transport validation.
"""
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import AuditEvent, Base, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal

OWNER = "customer-orders-test-owner"
STAFF = "customer-orders-test-staff"


@pytest.fixture
def customer_orders_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Orders test", "currency_code": "EGP"})
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


def _as(env, subject: str):
    env["subject"]["value"] = subject


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


def _make_driver(env, *, code="DRV-01", trip_wage="150.00"):
    created = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/employees",
        json={"name": f"Driver {code}", "employee_code": code,
              "monthly_salary": "5000.00", "is_driver": True,
              "wage_basis": "per_trip", "trip_wage": trip_wage},
    )
    assert created.status_code == 201, created.text
    return created.json()


def _order_payload(customer_id, product_id, *, number="ORD-001", **extra):
    payload = {
        "order_number": number, "currency_code": "EGP", "customer_id": customer_id,
        "lines": [{"product_id": product_id, "quantity": "3"}],
    }
    payload.update(extra)
    return payload


def _create_order(env, payload):
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/orders", json=payload)


def _get_order(env, order_id):
    return env["client"].get(f"/api/v1/businesses/{env['business_id']}/orders/{order_id}")


def _confirm(env, order_id):
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/confirm", json={})


def _cancel(env, order_id):
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/cancel", json={})


def _convert(env, order_id):
    return env["client"].post(f"/api/v1/businesses/{env['business_id']}/orders/{order_id}/convert", json={})


def _audit_actions(env, business_id):
    with app.state.session_factory() as session:
        return [row.action for row in session.query(AuditEvent).where(
            AuditEvent.business_id == UUID(business_id),
        ).order_by(AuditEvent.created_at).all()]


def test_create_order_computes_totals(customer_orders_environment):
    env = customer_orders_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    payload = _order_payload(customer_id, product["id"], discount_rate="10", tax_rate="14")
    payload["lines"].append({"description": "Delivery fee", "quantity": "2", "unit_price": "5.00"})
    created = _create_order(env, payload)
    assert created.status_code == 201, created.text
    body = created.json()
    # 3 x 10.00 + 2 x 5.00 = 40.00; discount 10% = 4.00; tax 14% on 36.00 = 5.04.
    assert body["status"] == "draft"
    assert body["subtotal"] == "40.00"
    assert body["discount_total"] == "4.00"
    assert body["tax_total"] == "5.04"
    assert body["total"] == "41.04"
    assert body["lines"][0]["sold_unit"] is None
    assert body["lines"][0]["unit_price"] == "10.00"


def test_second_unit_line_priced_from_catalogue(customer_orders_environment):
    env = customer_orders_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    patched = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/products/{product['id']}",
        json={"second_unit_name": "trip", "conversion_factor": "4"},
    )
    assert patched.status_code == 200, patched.text
    payload = _order_payload(customer_id, product["id"])
    payload["lines"][0]["unit"] = "trip"
    created = _create_order(env, payload)
    assert created.status_code == 201, created.text
    line = created.json()["lines"][0]
    assert line["unit_price"] == "40.00"
    assert line["line_total"] == "120.00"
    assert line["sold_unit"] == "trip"
    detail = _get_order(env, created.json()["id"]).json()
    assert detail["lines"][0]["conversion_factor"] == "4.000"


def test_transport_gates_on_create(customer_orders_environment):
    env = customer_orders_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    # Second-unit sale while the switch is off.
    payload = _order_payload(customer_id, product["id"])
    payload["lines"][0]["unit"] = "trip"
    assert _create_order(env, payload).status_code == 422
    # Delivery block while the switch is off.
    _set_transport(env, True)
    driver = _make_driver(env)
    _set_transport(env, False)
    payload = _order_payload(
        customer_id, product["id"],
        driver_employee_id=driver["id"], transport_trips=2,
    )
    assert _create_order(env, payload).status_code == 422
    # A plain order still works while the switch is off.
    assert _create_order(env, _order_payload(customer_id, product["id"])).status_code == 201


def test_delivery_block_converts_and_proposes(customer_orders_environment):
    env = customer_orders_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    driver = _make_driver(env)
    payload = _order_payload(
        customer_id, product["id"],
        driver_employee_id=driver["id"], transport_trips=3,
        transport_from="Warehouse", transport_to="Store",
    )
    created = _create_order(env, payload)
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    assert _confirm(env, order_id).status_code == 200
    converted = _convert(env, order_id)
    assert converted.status_code == 200, converted.text
    body = converted.json()
    assert body["status"] == "fulfilled"
    assert body["invoice_number"] == "INV-ORD-001"
    invoice_id = body["invoice_id"]
    invoice = env["client"].get(f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}")
    assert invoice.status_code == 200, invoice.text
    assert invoice.json()["status"] == "draft"
    assert invoice.json()["driver_employee_id"] == driver["id"]
    assert invoice.json()["transport_trips"] == 3
    issued = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{invoice_id}/issue", json={},
    )
    assert issued.status_code == 200, issued.text
    queue = env["client"].get(f"/api/v1/businesses/{env['business_id']}/transport-entitlements")
    assert queue.status_code == 200, queue.text
    assert len(queue.json()) == 1
    assert queue.json()[0]["amount"] == "450.00"


def test_replace_draft_recomputes_and_clears_block(customer_orders_environment):
    env = customer_orders_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    driver = _make_driver(env)
    created = _create_order(env, _order_payload(
        customer_id, product["id"],
        driver_employee_id=driver["id"], transport_trips=2,
    ))
    assert created.status_code == 201, created.text
    order_id = created.json()["id"]
    # Full replacement with no block fields clears the block.
    replaced = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/orders/{order_id}",
        json=_order_payload(customer_id, product["id"], number="ORD-001"),
    )
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["driver_employee_id"] is None
    assert replaced.json()["transport_trips"] is None
    # A confirmed order can no longer be replaced.
    assert _confirm(env, order_id).status_code == 200
    assert env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/orders/{order_id}",
        json=_order_payload(customer_id, product["id"], number="ORD-001"),
    ).status_code == 409


def test_confirm_cancel_state_machine(customer_orders_environment):
    env = customer_orders_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    created = _create_order(env, _order_payload(customer_id, product["id"]))
    order_id = created.json()["id"]
    _as(env, STAFF)
    assert _confirm(env, order_id).status_code == 403
    assert _cancel(env, order_id).status_code == 403
    assert _convert(env, order_id).status_code == 200
    _as(env, OWNER)
    # Converted (fulfilled) orders can no longer be confirmed or cancelled.
    assert _confirm(env, order_id).status_code == 409
    assert _cancel(env, order_id).status_code == 409
    assert _convert(env, order_id).status_code == 409
    # A fresh order confirms then cancels; a cancelled order is terminal.
    second = _create_order(env, _order_payload(customer_id, product["id"], number="ORD-002"))
    second_id = second.json()["id"]
    assert _confirm(env, second_id).status_code == 200
    assert _cancel(env, second_id).status_code == 200
    assert _confirm(env, second_id).status_code == 409
    assert _convert(env, second_id).status_code == 409


def test_convert_creates_draft_invoice_without_moving_stock(customer_orders_environment):
    env = customer_orders_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env, opening="100")
    patched = env["client"].patch(
        f"/api/v1/businesses/{env['business_id']}/products/{product['id']}",
        json={"second_unit_name": "trip", "conversion_factor": "4"},
    )
    assert patched.status_code == 200, patched.text
    payload = _order_payload(customer_id, product["id"])
    payload["lines"][0]["unit"] = "trip"
    created = _create_order(env, payload)
    order_id = created.json()["id"]
    converted = _convert(env, order_id)
    assert converted.status_code == 200, converted.text
    detail = env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/products/{product['id']}",
    ).json()
    assert Decimal(detail["stock_quantity"]) == Decimal(100)
    issued = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/invoices/{converted.json()['invoice_id']}/issue",
        json={},
    )
    assert issued.status_code == 200, issued.text
    detail = env["client"].get(
        f"/api/v1/businesses/{env['business_id']}/products/{product['id']}",
    ).json()
    # 3 trips x factor 4 = 12 base meters deducted at issue, not at order time.
    assert Decimal(detail["stock_quantity"]) == Decimal(88)


def test_duplicate_order_number_conflicts_per_business(customer_orders_environment):
    env = customer_orders_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    assert _create_order(env, _order_payload(customer_id, product["id"])).status_code == 201
    assert _create_order(env, _order_payload(customer_id, product["id"])).status_code == 409
    other = env["client"].post(
        "/api/v1/businesses", json={"name": "Orders test B", "currency_code": "EGP"},
    )
    assert other.status_code == 201
    assert _create_order(env, _order_payload(customer_id, product["id"])) .status_code == 409
    # Same number in another business is fine (its own customer/product).
    other_id = other.json()["id"]
    other_customer = env["client"].post(
        f"/api/v1/businesses/{other_id}/customers", json={"name": "Other Customer"},
    ).json()["id"]
    other_product = env["client"].post(
        f"/api/v1/businesses/{other_id}/products",
        json={"name": "Sand", "unit_price": "10.00"},
    ).json()["id"]
    created = env["client"].post(
        f"/api/v1/businesses/{other_id}/orders",
        json=_order_payload(other_customer, other_product),
    )
    assert created.status_code == 201, created.text


def test_tenant_isolation(customer_orders_environment):
    env = customer_orders_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    created = _create_order(env, _order_payload(customer_id, product["id"]))
    order_id = created.json()["id"]
    assert _get_order(env, str(uuid4())).status_code == 404
    other = env["client"].post(
        "/api/v1/businesses", json={"name": "Orders test B", "currency_code": "EGP"},
    ).json()["id"]
    # Another business's order id does not resolve here.
    assert env["client"].get(
        f"/api/v1/businesses/{other}/orders/{order_id}",
    ).status_code == 404
    # Another business's customer cannot be used on this order.
    other_customer = env["client"].post(
        f"/api/v1/businesses/{other}/customers", json={"name": "Other Customer"},
    ).json()["id"]
    payload = _order_payload(other_customer, product["id"], number="ORD-009")
    assert _create_order(env, payload).status_code == 422


def test_audit_events_recorded(customer_orders_environment):
    env = customer_orders_environment
    customer_id = _make_customer(env)
    product = _make_product(env)
    created = _create_order(env, _order_payload(customer_id, product["id"]))
    order_id = created.json()["id"]
    assert _confirm(env, order_id).status_code == 200
    assert _convert(env, order_id).status_code == 200
    actions = _audit_actions(env, env["business_id"])
    assert "order.created" in actions
    assert "order.confirmed" in actions
    assert "order.converted" in actions
