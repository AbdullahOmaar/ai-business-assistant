"""API-level regression tests for cross-business isolation."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base
from app.security import AuthenticatedPrincipal


def test_non_member_cannot_read_dashboard_or_mutate_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-owner")
    try:
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Private Workspace", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        business_id = created.json()["id"]
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        read_profile = client.get(f"/api/v1/businesses/{business_id}")
        read_dashboard = client.get(f"/api/v1/businesses/{business_id}/dashboard")
        mutate_profile = client.patch(
            f"/api/v1/businesses/{business_id}",
            json={"name": "Unauthorized Rename"},
        )
        assert read_profile.status_code == 403
        assert read_dashboard.status_code == 403
        assert mutate_profile.status_code == 403
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-owner")
        owner_read = client.get(f"/api/v1/businesses/{business_id}")
        assert owner_read.status_code == 200
        assert owner_read.json()["name"] == "Private Workspace"
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


def test_non_member_cannot_access_or_mutate_customers_products_invoices_or_payments():
    """Exercise tenant checks across real resource routes, not only workspace metadata."""
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("resource-owner")

    try:
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Resource Boundary Shop", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        business_id = created.json()["id"]

        customer = client.post(
            f"/api/v1/businesses/{business_id}/customers",
            json={"name": "Private Customer"},
        )
        product = client.post(
            f"/api/v1/businesses/{business_id}/products",
            json={"name": "Private Product", "unit_price": "12.00"},
        )
        assert customer.status_code == 201
        assert product.status_code == 201
        customer_id = customer.json()["id"]
        product_id = product.json()["id"]

        invoice = client.post(
            f"/api/v1/businesses/{business_id}/invoices",
            json={
                "invoice_number": "INV-TENANT-BOUNDARY-1",
                "currency_code": "EGP",
                "customer_id": customer_id,
                "lines": [{"description": "Service", "quantity": "1", "unit_price": "10.00"}],
            },
        )
        assert invoice.status_code == 201
        invoice_id = invoice.json()["id"]

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        protected_reads = [
            f"/api/v1/businesses/{business_id}/customers",
            f"/api/v1/businesses/{business_id}/customers/{customer_id}",
            f"/api/v1/businesses/{business_id}/products",
            f"/api/v1/businesses/{business_id}/products/{product_id}",
            f"/api/v1/businesses/{business_id}/invoices",
            f"/api/v1/businesses/{business_id}/invoices/{invoice_id}",
            f"/api/v1/businesses/{business_id}/payments",
            f"/api/v1/businesses/{business_id}/expenses",
            f"/api/v1/businesses/{business_id}/reports/summary",
            f"/api/v1/businesses/{business_id}/assistant/insights",
        ]
        for path in protected_reads:
            response = client.get(path)
            assert response.status_code == 403, f"Expected 403 for GET {path}, got {response.status_code}"

        protected_writes = [
            ("post", f"/api/v1/businesses/{business_id}/customers", {"name": "Injected Customer"}),
            ("post", f"/api/v1/businesses/{business_id}/products", {"name": "Injected Product", "unit_price": "1.00"}),
            (
                "post",
                f"/api/v1/businesses/{business_id}/invoices",
                {
                    "invoice_number": "INV-UNAUTHORIZED",
                    "currency_code": "EGP",
                    "lines": [{"description": "Unauthorized", "quantity": "1", "unit_price": "1.00"}],
                },
            ),
            (
                "post",
                f"/api/v1/businesses/{business_id}/payments",
                {"amount": "1.00", "currency_code": "EGP", "idempotency_key": "unauthorized-payment"},
            ),
            ("patch", f"/api/v1/businesses/{business_id}/customers/{customer_id}", {"name": "Changed by outsider"}),
            ("patch", f"/api/v1/businesses/{business_id}/products/{product_id}", {"name": "Changed by outsider"}),
            ("delete", f"/api/v1/businesses/{business_id}/customers/{customer_id}", None),
            ("delete", f"/api/v1/businesses/{business_id}/products/{product_id}", None),
        ]
        for method, path, payload in protected_writes:
            response = getattr(client, method)(path, json=payload) if payload is not None else getattr(client, method)(path)
            assert response.status_code == 403, f"Expected 403 for {method.upper()} {path}, got {response.status_code}"

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("resource-owner")
        assert client.get(f"/api/v1/businesses/{business_id}/customers/{customer_id}").json()["name"] == "Private Customer"
        assert client.get(f"/api/v1/businesses/{business_id}/products/{product_id}").json()["name"] == "Private Product"
        assert client.get(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}").status_code == 200
        assert client.get(f"/api/v1/businesses/{business_id}/payments").json() == []
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


def test_invoice_rejects_customer_and_product_ids_from_another_business():
    """Foreign resource IDs must not be usable to construct a tenant's invoice."""
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        client = TestClient(app)
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-a-owner")
        business_a = client.post(
            "/api/v1/businesses",
            json={"name": "Tenant A", "currency_code": "EGP"},
        )
        assert business_a.status_code == 201
        business_a_id = business_a.json()["id"]

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-b-owner")
        business_b = client.post(
            "/api/v1/businesses",
            json={"name": "Tenant B", "currency_code": "EGP"},
        )
        assert business_b.status_code == 201
        business_b_id = business_b.json()["id"]
        customer_b = client.post(
            f"/api/v1/businesses/{business_b_id}/customers",
            json={"name": "Tenant B Customer"},
        )
        product_b = client.post(
            f"/api/v1/businesses/{business_b_id}/products",
            json={"name": "Tenant B Product", "unit_price": "15.00"},
        )
        assert customer_b.status_code == 201
        assert product_b.status_code == 201

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tenant-a-owner")
        foreign_customer_invoice = client.post(
            f"/api/v1/businesses/{business_a_id}/invoices",
            json={
                "invoice_number": "INV-FOREIGN-CUSTOMER",
                "currency_code": "EGP",
                "customer_id": customer_b.json()["id"],
                "lines": [{"description": "Manual service", "quantity": "1", "unit_price": "10.00"}],
            },
        )
        foreign_product_invoice = client.post(
            f"/api/v1/businesses/{business_a_id}/invoices",
            json={
                "invoice_number": "INV-FOREIGN-PRODUCT",
                "currency_code": "EGP",
                "lines": [{"product_id": product_b.json()["id"], "quantity": "1"}],
            },
        )
        assert foreign_customer_invoice.status_code == 422
        assert foreign_product_invoice.status_code == 422
        assert client.get(f"/api/v1/businesses/{business_a_id}/invoices").json() == []
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
