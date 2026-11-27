"""3A-920 step 3 — selling by the second unit on invoices.

A line sold in the second unit is priced at unit_price x factor (the
server prices product lines from the catalogue, never from the client)
and snapshots the sold unit + factor, so issue / void / sales-return
math stays exact even if the product's factor changes later. The
movements ledger stays base-unit only: issue deducts and void returns
quantity x factor. Selling in the second unit while the switch is off
is rejected; the stored config is never deleted by turning it off.
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

OWNER = "invoice-second-unit-test-owner"
STAFF = "invoice-second-unit-test-staff"


@pytest.fixture
def second_unit_invoice_environment(monkeypatch):
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
        created = client.post("/api/v1/businesses", json={"name": "Invoice second unit test", "currency_code": "EGP"})
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


def _business(env):
    return env["client"], env["business_id"]


def _make_customer(env):
    client, business_id = _business(env)
    created = client.post(f"/api/v1/businesses/{business_id}/customers", json={"name": "Shouna Buyer"})
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _make_product(env, *, opening="100", **overrides):
    client, business_id = _business(env)
    payload = {
        "name": "Sand", "unit": "meter", "unit_price": "10.00",
        "is_stock_tracked": True, "opening_quantity": opening,
        "second_unit_name": "trip", "conversion_factor": "4",
    }
    payload.update(overrides)
    created = client.post(f"/api/v1/businesses/{business_id}/products", json=payload)
    assert created.status_code == 201, created.text
    return created.json()


def _make_invoice(env, customer_id, lines, number="INV-001"):
    client, business_id = _business(env)
    created = client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": number, "currency_code": "EGP",
        "customer_id": customer_id, "lines": lines,
    })
    assert created.status_code == 201, created.text
    return created.json()


def _invoice_detail(env, invoice_id):
    client, business_id = _business(env)
    detail = client.get(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}")
    assert detail.status_code == 200, detail.text
    return detail.json()


def _stock(env, product_id):
    client, business_id = _business(env)
    fetched = client.get(f"/api/v1/businesses/{business_id}/products/{product_id}")
    assert fetched.status_code == 200, fetched.text
    return Decimal(fetched.json()["stock_quantity"])


def _issue(env, invoice_id):
    client, business_id = _business(env)
    return client.post(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", json={})


def _void(env, invoice_id):
    client, business_id = _business(env)
    return client.post(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/void", json={})


def test_second_unit_line_prices_and_deducts_in_base_units(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    invoice = _make_invoice(env, customer_id, [
        {"product_id": product["id"], "quantity": "3", "unit": "trip"},
    ])
    detail = _invoice_detail(env, invoice["id"])
    line = detail["lines"][0]
    assert line["sold_unit"] == "trip"
    assert line["conversion_factor"] == "4.000"
    assert line["unit_price"] == "40.00"
    assert line["line_total"] == "120.00"
    assert detail["total"] == "120.00"

    assert _issue(env, invoice["id"]).status_code == 200
    # 100 meters opening - 3 trips x 4 meters = 88 meters left.
    assert _stock(env, product["id"]) == Decimal(88)
    assert _void(env, invoice["id"]).status_code == 200
    assert _stock(env, product["id"]) == Decimal(100)


def test_second_unit_sale_rejected_while_transport_off(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    _set_transport(env, False)
    client, business_id = _business(env)
    rejected = client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": "INV-OFF", "currency_code": "EGP",
        "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "3", "unit": "trip"}],
    })
    assert rejected.status_code == 422
    # The base unit still sells while off — the switch changes nothing else.
    allowed = _make_invoice(env, customer_id, [
        {"product_id": product["id"], "quantity": "3"},
    ], number="INV-OFF-2")
    line = _invoice_detail(env, allowed["id"])["lines"][0]
    assert line["sold_unit"] is None
    assert line["unit_price"] == "10.00"


def test_unknown_unit_and_manual_line_unit_rejected(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    client, business_id = _business(env)
    unknown = client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": "INV-UNK", "currency_code": "EGP",
        "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "1", "unit": "box"}],
    })
    assert unknown.status_code == 422
    manual = client.post(f"/api/v1/businesses/{business_id}/invoices", json={
        "invoice_number": "INV-MAN", "currency_code": "EGP",
        "customer_id": customer_id,
        "lines": [{"description": "Delivery service", "quantity": "1", "unit_price": "50.00", "unit": "trip"}],
    })
    assert manual.status_code == 422


def test_issue_checks_stock_in_base_units(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    # Only 10 meters in stock; 3 trips need 12.
    product = _make_product(env, opening="10")
    invoice = _make_invoice(env, customer_id, [
        {"product_id": product["id"], "quantity": "3", "unit": "trip"},
    ])
    assert _issue(env, invoice["id"]).status_code == 422
    assert _stock(env, product["id"]) == Decimal(10)


def test_sales_return_converts_with_the_line_factor(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    invoice = _make_invoice(env, customer_id, [
        {"product_id": product["id"], "quantity": "3", "unit": "trip"},
    ])
    assert _issue(env, invoice["id"]).status_code == 200
    assert _stock(env, product["id"]) == Decimal(88)
    line = _invoice_detail(env, invoice["id"])["lines"][0]
    client, business_id = _business(env)
    created = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json={
        "reason": "Damaged trip",
        "invoice_id": invoice["id"],
        "lines": [{"invoice_line_id": line["id"], "quantity": "1"}],
    })
    assert created.status_code == 201, created.text
    approved = client.post(
        f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve", json={}
    )
    assert approved.status_code == 200, approved.text
    # One trip returned = 4 meters back: 88 + 4 = 92.
    assert _stock(env, product["id"]) == Decimal(92)


def test_duplicate_and_draft_replace_carry_the_sold_unit(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    invoice = _make_invoice(env, customer_id, [
        {"product_id": product["id"], "quantity": "3", "unit": "trip"},
    ])
    client, business_id = _business(env)
    copy = client.post(f"/api/v1/businesses/{business_id}/invoices/{invoice['id']}/duplicate", json={})
    assert copy.status_code == 201, copy.text
    copy_line = _invoice_detail(env, copy.json()["id"])["lines"][0]
    assert copy_line["sold_unit"] == "trip"
    assert copy_line["conversion_factor"] == "4.000"
    assert copy_line["unit_price"] == "40.00"

    replaced = client.patch(f"/api/v1/businesses/{business_id}/invoices/{invoice['id']}", json={
        "invoice_number": "INV-001", "currency_code": "EGP",
        "customer_id": customer_id,
        "lines": [{"product_id": product["id"], "quantity": "2", "unit": "trip"}],
    })
    assert replaced.status_code == 200, replaced.text
    line = _invoice_detail(env, invoice["id"])["lines"][0]
    assert line["quantity"] == "2.000"
    assert line["sold_unit"] == "trip"
    assert line["line_total"] == "80.00"


def test_factor_change_does_not_rewrite_old_lines(second_unit_invoice_environment):
    env = second_unit_invoice_environment
    _set_transport(env, True)
    customer_id = _make_customer(env)
    product = _make_product(env)
    invoice = _make_invoice(env, customer_id, [
        {"product_id": product["id"], "quantity": "3", "unit": "trip"},
    ])
    assert _issue(env, invoice["id"]).status_code == 200
    assert _stock(env, product["id"]) == Decimal(88)
    # The company re-prices the trip to 5 meters; the issued invoice was
    # sold at 4, so voiding it must return 12 meters, not 15.
    client, business_id = _business(env)
    patched = client.patch(f"/api/v1/businesses/{business_id}/products/{product['id']}",
                           json={"conversion_factor": "5"})
    assert patched.status_code == 200, patched.text
    assert _void(env, invoice["id"]).status_code == 200
    assert _stock(env, product["id"]) == Decimal(100)
    line = _invoice_detail(env, invoice["id"])["lines"][0]
    assert line["conversion_factor"] == "4.000"
