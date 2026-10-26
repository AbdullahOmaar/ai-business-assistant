"""API-level regression tests for cross-business isolation."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from uuid import UUID

from app.main import app
from app.models import AuditEvent, Base
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
                {
                    "amount": "1.00",
                    "currency_code": "EGP",
                    "idempotency_key": "unauthorized-payment",
                    "customer_id": customer_id,
                },
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
        invoice_b = client.post(
            f"/api/v1/businesses/{business_b_id}/invoices",
            json={
                "invoice_number": "INV-TENANT-B-1",
                "currency_code": "EGP",
                "customer_id": customer_b.json()["id"],
                "lines": [{"description": "Tenant B service", "quantity": "1", "unit_price": "10.00"}],
            },
        )
        assert invoice_b.status_code == 201
        issued_b = client.post(
            f"/api/v1/businesses/{business_b_id}/invoices/{invoice_b.json()['id']}/issue",
            json={},
        )
        assert issued_b.status_code == 200

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
        foreign_payment_allocation = client.post(
            f"/api/v1/businesses/{business_a_id}/payments",
            json={
                "amount": "1.00",
                "currency_code": "EGP",
                "idempotency_key": "foreign-invoice-allocation",
                "allocations": [{"invoice_id": invoice_b.json()["id"], "amount": "1.00"}],
            },
        )
        assert foreign_customer_invoice.status_code == 422
        assert foreign_product_invoice.status_code == 422
        assert foreign_payment_allocation.status_code == 422
        assert client.get(f"/api/v1/businesses/{business_a_id}/invoices").json() == []
        assert client.get(f"/api/v1/businesses/{business_a_id}/payments").json() == []
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


def test_audit_events_are_owner_only_paginated_and_workspace_scoped():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("audit-owner")
    try:
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Audit Workspace", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        business_id = UUID(created.json()["id"])
        with app.state.session_factory() as session:
            session.add_all([
                AuditEvent(
                    business_id=business_id, actor_subject="audit-owner",
                    action="invoice.issued", target_type="invoice", target_id="inv-1",
                    change_summary="Invoice issued",
                ),
                AuditEvent(
                    business_id=business_id, actor_subject="audit-owner",
                    action="product.updated", target_type="product", target_id="prod-1",
                    change_summary="Product updated",
                ),
            ])
            session.commit()

        response = client.get(f"/api/v1/businesses/{business_id}/audit-events?limit=1&offset=0")
        assert response.status_code == 200
        assert response.json()["total"] == 2
        assert len(response.json()["items"]) == 1
        assert response.json()["items"][0]["business_id"] == str(business_id)

        filtered = client.get(
            f"/api/v1/businesses/{business_id}/audit-events?action=invoice.issued"
        )
        assert filtered.status_code == 200
        assert filtered.json()["total"] == 1
        assert filtered.json()["items"][0]["target_id"] == "inv-1"

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        denied = client.get(f"/api/v1/businesses/{business_id}/audit-events")
        assert denied.status_code == 403
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


def test_customer_statement_is_scoped_currency_safe_and_paginated():
    from datetime import datetime, timezone
    from decimal import Decimal
    from uuid import uuid4
    from app.models import Business, BusinessMembership, Customer, Invoice, Payment, PaymentAllocation, MembershipRole

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("statement-owner")
    try:
        business_id, customer_id = uuid4(), uuid4()
        invoice_id, payment_id, allocation_id = uuid4(), uuid4(), uuid4()
        occurred = datetime(2026, 10, 1, tzinfo=timezone.utc)
        with app.state.session_factory() as session:
            session.add(Business(id=business_id, name="Statement workspace", currency_code="EGP"))
            session.flush()
            session.add(BusinessMembership(
                business_id=business_id, user_subject="statement-owner", role=MembershipRole.OWNER
            ))
            session.add(Customer(id=customer_id, business_id=business_id, name="Statement customer"))
            session.add(Invoice(
                id=invoice_id, business_id=business_id, customer_id=customer_id,
                invoice_number="INV-ST-1", status="issued", currency_code="EGP",
                issue_date=occurred, subtotal=Decimal("100.00"), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal("100.00"),
            ))
            session.add(Payment(
                id=payment_id, business_id=business_id, customer_id=customer_id,
                amount=Decimal("30.00"), currency_code="EGP", received_at=occurred,
                idempotency_key="statement-payment-1",
            ))
            session.flush()
            session.add(PaymentAllocation(
                id=allocation_id, business_id=business_id, payment_id=payment_id,
                invoice_id=invoice_id, amount=Decimal("30.00"),
            ))
            session.commit()

        client = TestClient(app)
        response = client.get(f"/api/v1/businesses/{business_id}/customers/{customer_id}/statement")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["total"] == 2
        assert payload["balances_by_currency"]["EGP"] == "70.00"
        assert payload["items"][-1]["balance"] == "70.00"
        assert payload["limitations"]
        page = client.get(
            f"/api/v1/businesses/{business_id}/customers/{customer_id}/statement?limit=1&offset=1"
        )
        assert page.status_code == 200
        assert len(page.json()["items"]) == 1
        assert page.json()["total"] == 2

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        denied = client.get(f"/api/v1/businesses/{business_id}/customers/{customer_id}/statement")
        assert denied.status_code == 403
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
