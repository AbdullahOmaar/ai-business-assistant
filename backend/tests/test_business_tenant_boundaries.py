"""API-level regression tests for cross-business isolation."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from uuid import UUID

from app.main import app
from app.models import (\n    AuditEvent,\n    Base,\n    BusinessMembership,\n    MembershipRole,\n    Product,\n    StockMovement,\n)\nfrom app.security import AuthenticatedPrincipal


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

def test_data_integrity_report_is_owner_only_read_only_detects_currency_and_customer_mismatches():
    from datetime import datetime, timezone
    from sqlalchemy import select
    from decimal import Decimal
    from app.models import (
        Business, BusinessMembership, Customer, Invoice, MembershipRole,
        Payment, PaymentAllocation,
    )

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("integrity-owner")
    try:
        with app.state.session_factory() as session:
            business = Business(name="Integrity workspace", currency_code="EGP")
            foreign_business = Business(name="Foreign integrity workspace", currency_code="USD")
            session.add_all([business, foreign_business])
            session.flush()
            payment_customer = Customer(business_id=business.id, name="Payment customer")
            invoice_customer = Customer(business_id=business.id, name="Invoice customer")
            session.add_all([payment_customer, invoice_customer])
            session.flush()
            payment_customer_id = payment_customer.id
            invoice_customer_id = invoice_customer.id
            session.add_all([
                BusinessMembership(
                    business_id=business.id, user_subject="integrity-owner",
                    role=MembershipRole.OWNER,
                ),
                Invoice(
                    business_id=business.id, customer_id=None, invoice_number="LEGACY-1",
                    status="issued", currency_code="EGP",
                    issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                    due_date=None, subtotal=Decimal("100.00"), tax_total=Decimal("0.00"),
                    discount_total=Decimal("0.00"), total=Decimal("100.00"),
                ),
                Invoice(
                    business_id=business.id, customer_id=invoice_customer.id,
                    invoice_number="INV-MISMATCH", status="issued", currency_code="EGP",
                    issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                    due_date=datetime(2026, 10, 1, tzinfo=timezone.utc),
                    subtotal=Decimal("60.00"), tax_total=Decimal("0.00"),
                    discount_total=Decimal("0.00"), total=Decimal("60.00"),
                ),
                Invoice(
                    business_id=foreign_business.id, customer_id=None,
                    invoice_number="FOREIGN-LEGACY", status="issued", currency_code="USD",
                    issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                    due_date=None, subtotal=Decimal("900.00"), tax_total=Decimal("0.00"),
                    discount_total=Decimal("0.00"), total=Decimal("900.00"),
                ),
            ])
            payment = Payment(
                business_id=business.id, customer_id=payment_customer.id,
                amount=Decimal("25.00"), currency_code="USD",
                idempotency_key="integrity-payment-1",
            )
            session.add(payment)
            session.flush()
            mismatch_invoice = session.scalar(select(Invoice).where(
                Invoice.business_id == business.id,
                Invoice.invoice_number == "INV-MISMATCH",
            ))
            session.add(PaymentAllocation(
                business_id=business.id, payment_id=payment.id,
                invoice_id=mismatch_invoice.id, amount=Decimal("25.00"),
            ))
            business_id = business.id
            payment_id = payment.id
            session.commit()

        client = TestClient(app)
        response = client.get(
            f"/api/v1/businesses/{business_id}/reports/data-integrity?limit=10&offset=0"
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["read_only"] is True
        assert payload["unlinked_issued_invoices"]["total"] == 1
        assert [row["invoice_number"] for row in payload["unlinked_issued_invoices"]["items"]] == ["LEGACY-1"]
        assert payload["currency_mismatched_allocations"]["total"] == 1
        currency_row = payload["currency_mismatched_allocations"]["items"][0]
        assert currency_row["invoice_number"] == "INV-MISMATCH"
        assert currency_row["payment_currency"] == "USD"
        assert currency_row["invoice_currency"] == "EGP"
        assert currency_row["allocated_amount"] == "25.00"
        assert payload["customer_mismatched_allocations"]["total"] == 1
        customer_row = payload["customer_mismatched_allocations"]["items"][0]
        assert customer_row["invoice_number"] == "INV-MISMATCH"
        assert customer_row["payment_customer_id"] == str(payment_customer_id)
        assert customer_row["invoice_customer_id"] == str(invoice_customer_id)
        assert customer_row["payment_customer_id"] != customer_row["invoice_customer_id"]

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        denied = client.get(f"/api/v1/businesses/{business_id}/reports/data-integrity")
        assert denied.status_code == 403
        with app.state.session_factory() as session:
            unlinked = session.scalar(select(Invoice).where(
                Invoice.business_id == business_id, Invoice.invoice_number == "LEGACY-1",
            ))
            unchanged_payment = session.get(Payment, payment_id)
            assert unlinked is not None and unlinked.customer_id is None
            assert unchanged_payment is not None and unchanged_payment.amount == Decimal("25.00")
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


def test_tax_summary_keeps_currencies_separate_and_is_workspace_scoped():
    from datetime import datetime, timezone
    from decimal import Decimal
    from uuid import uuid4
    from app.models import Business, BusinessMembership, Invoice, MembershipRole

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("tax-owner")
    try:
        business_id = uuid4()
        with app.state.session_factory() as session:
            session.add(Business(id=business_id, name="Tax workspace", currency_code="EGP"))
            session.flush()
            session.add(BusinessMembership(business_id=business_id, user_subject="tax-owner", role=MembershipRole.OWNER))
            session.add_all([
                Invoice(business_id=business_id, customer_id=None, invoice_number="TAX-EGP-1", status="issued", currency_code="EGP", issue_date=datetime(2026, 10, 5, tzinfo=timezone.utc), subtotal=Decimal("100.00"), tax_total=Decimal("14.00"), discount_total=Decimal("0.00"), total=Decimal("114.00")),
                Invoice(business_id=business_id, customer_id=None, invoice_number="TAX-EGP-2", status="issued", currency_code="EGP", issue_date=datetime(2026, 10, 15, tzinfo=timezone.utc), subtotal=Decimal("50.00"), tax_total=Decimal("7.00"), discount_total=Decimal("0.00"), total=Decimal("57.00")),
                Invoice(business_id=business_id, customer_id=None, invoice_number="TAX-USD-1", status="issued", currency_code="USD", issue_date=datetime(2026, 10, 10, tzinfo=timezone.utc), subtotal=Decimal("20.00"), tax_total=Decimal("3.00"), discount_total=Decimal("0.00"), total=Decimal("23.00")),
            ])
            session.commit()
        client = TestClient(app)
        response = client.get(f"/api/v1/businesses/{business_id}/reports/tax-summary?start_date=2026-10-01&end_date=2026-10-31")
        assert response.status_code == 200, response.text
        payload = response.json()
        totals = {row["currency_code"]: row for row in payload["currencies"]}
        assert totals["EGP"]["tax_total"] == "21.00"
        assert totals["EGP"]["invoice_count"] == 2
        assert totals["USD"]["tax_total"] == "3.00"
        assert totals["USD"]["invoice_count"] == 1
        assert payload["limitations"]
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        denied = client.get(f"/api/v1/businesses/{business_id}/reports/tax-summary")
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


def test_supplier_purchase_order_and_recurring_schedule_lists_are_workspace_scoped():
    from datetime import datetime, timezone
    from decimal import Decimal
    from uuid import uuid4
    from app.models import Business, BusinessMembership, MembershipRole, Product

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("operations-owner")
    try:
        business_id, product_id = uuid4(), uuid4()
        with app.state.session_factory() as session:
            session.add(Business(id=business_id, name="Operations workspace", currency_code="EGP"))
            session.flush()
            session.add(BusinessMembership(business_id=business_id, user_subject="operations-owner", role=MembershipRole.OWNER))
            session.add(Product(id=product_id, business_id=business_id, name="Stock item", unit_price=Decimal("10.00"), is_stock_tracked=True))
            session.commit()
        client = TestClient(app)
        supplier_response = client.post(f"/api/v1/businesses/{business_id}/suppliers", json={"name": "  Supplier One  ", "email": "supplier@example.com"})
        assert supplier_response.status_code == 201, supplier_response.text
        supplier = supplier_response.json()
        assert supplier["name"] == "Supplier One"
        listed_suppliers = client.get(f"/api/v1/businesses/{business_id}/suppliers")
        assert listed_suppliers.status_code == 200
        assert [item["id"] for item in listed_suppliers.json()] == [supplier["id"]]

        foreign_business_id = uuid4()
        with app.state.session_factory() as session:
            session.add(Business(id=foreign_business_id, name="Foreign workspace", currency_code="USD"))
            session.commit()
        for endpoint in ("suppliers", "purchase-orders", "recurring-invoices", "operations/health"):
            denied = client.get(f"/api/v1/businesses/{foreign_business_id}/{endpoint}")
            assert denied.status_code == 403, (endpoint, denied.text)

        order_response = client.post(f"/api/v1/businesses/{business_id}/purchase-orders", json={
            "supplier_id": supplier["id"], "order_number": "PO-OPS-1", "currency_code": "EGP",
            "lines": [{"product_id": str(product_id), "quantity": "2.000", "unit_cost": "5.00"}],
        })
        assert order_response.status_code == 201, order_response.text
        order_id = order_response.json()["id"]
        approved = client.post(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/approve")
        assert approved.status_code == 200, approved.text
        listed_orders = client.get(f"/api/v1/businesses/{business_id}/purchase-orders")
        assert listed_orders.status_code == 200
        order = listed_orders.json()[0]
        assert order["id"] == order_id
        assert order["lines"][0]["remaining_quantity"] == "2.000"
        received = client.post(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive", json={
            "lines": [{"line_id": order["lines"][0]["id"], "quantity": "1.000"}],
        })
        assert received.status_code == 200, received.text
        after_receive = client.get(f"/api/v1/businesses/{business_id}/purchase-orders").json()[0]
        assert after_receive["lines"][0]["remaining_quantity"] == "1.000"

        schedule = client.post(f"/api/v1/businesses/{business_id}/recurring-invoices", json={
            "customer_id": None, "interval_days": 30, "timezone": "UTC",
            "next_run_at": datetime(2026, 10, 26, tzinfo=timezone.utc).isoformat(),
        })
        assert schedule.status_code == 201, schedule.text
        listed_schedules = client.get(f"/api/v1/businesses/{business_id}/recurring-invoices")
        assert listed_schedules.status_code == 200
        assert listed_schedules.json()[0]["id"] == schedule.json()["id"]
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


def test_operational_health_is_owner_only_read_only_and_reports_missing_workers():
    from uuid import uuid4
    from app.models import Business, BusinessMembership, MembershipRole

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("health-owner")
    try:
        business_id = uuid4()
        with app.state.session_factory() as session:
            session.add(Business(id=business_id, name="Health workspace", currency_code="EGP"))
            session.flush()
            session.add(BusinessMembership(business_id=business_id, user_subject="health-owner", role=MembershipRole.OWNER))
            session.commit()
        client = TestClient(app)
        response = client.get(f"/api/v1/businesses/{business_id}/operations/health")
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["database_connected"] is True
        assert payload["status"] == "degraded"
        assert payload["migration_table_available"] is False
        assert payload["notification_delivery_configured"] is False
        assert payload["recurring_invoice_worker_configured"] is False

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-user")
        denied = client.get(f"/api/v1/businesses/{business_id}/operations/health")
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


def test_staff_cannot_seed_opening_stock_during_product_creation():
    """Opening inventory is OWNER-only even when created through the product endpoint."""
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.session_factory = factory
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("opening-stock-owner")

    try:
        client = TestClient(app)
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Opening Stock Boundary", "currency_code": "EGP"},
        )
        assert created.status_code == 201
        business_id = UUID(created.json()["id"])

        with factory() as session:
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject="opening-stock-staff",
                role=MembershipRole.STAFF,
            ))
            session.commit()

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("opening-stock-staff")
        regular_product = client.post(
            f"/api/v1/businesses/{business_id}/products",
            json={
                "name": "Staff Product Without Stock",
                "unit_price": "10.00",
                "is_stock_tracked": True,
                "opening_quantity": "0",
            },
        )
        assert regular_product.status_code == 201

        denied = client.post(
            f"/api/v1/businesses/{business_id}/products",
            json={
                "name": "Staff Seeded Stock",
                "unit_price": "10.00",
                "is_stock_tracked": True,
                "opening_quantity": "3.000",
            },
        )
        assert denied.status_code == 403

        with factory() as session:
            assert session.query(Product).filter_by(
                business_id=business_id,
                name="Staff Seeded Stock",
            ).count() == 0
            assert session.query(StockMovement).filter_by(
                business_id=business_id,
                movement_type="opening",
            ).count() == 0
            assert session.query(AuditEvent).filter_by(
                business_id=business_id,
                action="product.created",
            ).count() == 1

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("opening-stock-owner")
        owner_product = client.post(
            f"/api/v1/businesses/{business_id}/products",
            json={
                "name": "Owner Seeded Stock",
                "unit_price": "10.00",
                "is_stock_tracked": True,
                "opening_quantity": "3.000",
            },
        )
        assert owner_product.status_code == 201

        with factory() as session:
            movement = session.query(StockMovement).filter_by(
                business_id=business_id,
                movement_type="opening",
            ).one()
            assert str(movement.quantity_delta) == "3.000"
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
