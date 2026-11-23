"""3A-251 (T42) acceptance: customer/product states on the invoice path.

Cross-tenant references are covered by test_foreign_invoice_references.py
and customer CSV import by test_customer_csv_import_api.py. This file
pins the same-business state rules the T42 acceptance list names:

- a deactivated (soft-deleted) customer of the SAME business cannot be
  invoiced (422, no invoice rows);
- a deactivated product of the SAME business cannot be invoiced
  (422, no invoice rows);
- catalogue use: a product line is priced from the catalogue
  (product.unit_price) and described by the product name — a
  client-sent unit price for a product line is not honoured.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Invoice
from app.security import AuthenticatedPrincipal

OWNER = "invoice-reference-owner"


@pytest.fixture
def shop_env(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(OWNER)
    monkeypatch.delenv("PLATFORM_SUPER_ADMIN_UIDS", raising=False)
    try:
        client = TestClient(app)
        created = client.post("/api/v1/businesses", json={"name": "Reference shop", "currency_code": "EGP"})
        assert created.status_code == 201
        yield {"client": client, "business_id": created.json()["id"]}
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


def _customer(env) -> dict:
    response = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/customers", json={"name": "Ali Hassan"}
    )
    assert response.status_code == 201
    return response.json()


def _product(env) -> dict:
    response = env["client"].post(
        f"/api/v1/businesses/{env['business_id']}/products",
        json={"name": "Tea", "unit_price": "25.00", "is_stock_tracked": False},
    )
    assert response.status_code == 201
    return response.json()


def _invoice_count(env) -> int:
    with app.state.session_factory() as session:
        return session.scalar(select(func.count()).select_from(Invoice)) or 0


def test_deactivated_customer_cannot_be_invoiced(shop_env):
    env = shop_env
    customer = _customer(env)
    product = _product(env)
    base = f"/api/v1/businesses/{env['business_id']}"
    assert env["client"].delete(f"{base}/customers/{customer['id']}").status_code == 204

    response = env["client"].post(f"{base}/invoices", json={
        "invoice_number": "INV-STATE-1", "customer_id": customer["id"], "currency_code": "EGP",
        "lines": [{"product_id": product["id"], "quantity": "1"}],
    })
    assert response.status_code == 422
    assert response.json()["detail"] == "Active customer not found in this business"
    assert _invoice_count(env) == 0


def test_deactivated_product_cannot_be_invoiced(shop_env):
    env = shop_env
    customer = _customer(env)
    product = _product(env)
    base = f"/api/v1/businesses/{env['business_id']}"
    assert env["client"].delete(f"{base}/products/{product['id']}").status_code == 204

    response = env["client"].post(f"{base}/invoices", json={
        "invoice_number": "INV-STATE-2", "customer_id": customer["id"], "currency_code": "EGP",
        "lines": [{"product_id": product["id"], "quantity": "1"}],
    })
    assert response.status_code == 422
    assert response.json()["detail"] == "Invoice product not found in this business"
    assert _invoice_count(env) == 0


def test_product_line_is_priced_from_the_catalogue(shop_env):
    env = shop_env
    customer = _customer(env)
    product = _product(env)
    base = f"/api/v1/businesses/{env['business_id']}"

    response = env["client"].post(f"{base}/invoices", json={
        "invoice_number": "INV-STATE-3", "customer_id": customer["id"], "currency_code": "EGP",
        "lines": [{"product_id": product["id"], "quantity": "2", "unit_price": "0.01"}],
    })
    assert response.status_code == 201
    invoice = response.json()
    assert invoice["subtotal"] == "50.00"
    assert invoice["total"] == "50.00"
    detail = env["client"].get(f"{base}/invoices/{invoice['id']}")
    assert detail.status_code == 200
    line = detail.json()["lines"][0]
    assert line["unit_price"] == "25.00"
    assert line["description"] == "Tea"
