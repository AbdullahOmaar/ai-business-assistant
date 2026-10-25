from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import os
from threading import Barrier
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.main import app
from app.models import (
    Base, Business, BusinessMembership, Customer, Invoice, InvoiceLine,
    MembershipRole, SalesReturn, SalesReturnLine,
)
from app.security import AuthenticatedPrincipal


def test_health_endpoint_reports_process_liveness():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_business_endpoints_fail_closed_without_database_or_identity():
    response = TestClient(app).post(
        "/api/v1/businesses/00000000-0000-0000-0000-000000000001/customers",
        json={"name": "Not persisted"},
    )
    assert response.status_code == 503
    assert "Database is not configured" in response.json()["detail"]


def test_business_endpoints_fail_closed_without_trusted_identity():
    engine = create_engine("sqlite+pysqlite://")
    app.state.session_factory = sessionmaker(bind=engine)
    try:
        response = TestClient(app).post(
            "/api/v1/businesses/00000000-0000-0000-0000-000000000001/customers",
            json={"name": "Not persisted"},
        )
        assert response.status_code == 503
        assert "Authentication is not configured" in response.json()["detail"]
    finally:
        del app.state.session_factory
        engine.dispose()


def _sales_return_fixture():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Return test shop", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Return test customer")
        session.add(customer)
        session.flush()
        invoice = Invoice(
            business_id=business.id,
            customer_id=customer.id,
            invoice_number="RET-INV-1",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        session.add(invoice)
        session.flush()
        line = InvoiceLine(
            business_id=business.id,
            invoice_id=invoice.id,
            product_id=None,
            description="Test item",
            quantity=Decimal("1.000"),
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
        session.add(line)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="test-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        return engine, business.id, invoice.id, line.id


def _configure_test_identity(engine):
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject="test-subject")
    return previous_factory, previous_resolver


def _restore_test_identity(previous_factory, previous_resolver):
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


def test_two_draft_returns_cannot_overreturn_when_approved_sequentially():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [{"invoice_line_id": str(line_id), "quantity": "0.750"}],
    }
    try:
        first = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        second = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        assert first.status_code == 201
        assert second.status_code == 201

        approved_first = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{first.json()['id']}/approve"
        )
        approved_second = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{second.json()['id']}/approve"
        )
        assert approved_first.status_code == 200
        assert approved_second.status_code == 422
        assert "exceeds the invoiced quantity" in approved_second.json()["detail"]
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_duplicate_lines_in_one_return_cannot_exceed_invoiced_quantity():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [
            {"invoice_line_id": str(line_id), "quantity": "0.600"},
            {"invoice_line_id": str(line_id), "quantity": "0.600"},
        ],
    }
    try:
        created = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        assert created.status_code == 201
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve"
        )
        assert approved.status_code == 422
        assert "exceeds the invoiced quantity" in approved.json()["detail"]
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()



def test_concurrent_postgres_return_approvals_cannot_overreturn():
    # This test only uses the explicitly configured CI test database. Never fall back
    # to DATABASE_URL, which may point at a developer or production database.
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to run the PostgreSQL concurrency regression test")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    previous_factory = previous_resolver = None
    identity_configured = False
    try:
        suffix = uuid4().hex[:12]
        with Session(engine) as session:
            business = Business(name=f"Concurrent return test {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            customer = Customer(business_id=business.id, name="Concurrency test customer")
            session.add(customer)
            session.flush()
            invoice = Invoice(
                business_id=business.id,
                customer_id=customer.id,
                invoice_number=f"RET-CONCURRENT-{suffix}",
                status="issued",
                currency_code="EGP",
                subtotal=Decimal("10.00"),
                tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"),
                total=Decimal("10.00"),
            )
            session.add(invoice)
            session.flush()
            line = InvoiceLine(
                business_id=business.id,
                invoice_id=invoice.id,
                product_id=None,
                description="Concurrency test item",
                quantity=Decimal("1.000"),
                unit_price=Decimal("10.00"),
                line_total=Decimal("10.00"),
            )
            session.add(line)
            session.add(BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            ))
            session.commit()
            business_id, invoice_id, line_id = business.id, invoice.id, line.id

        previous_factory, previous_resolver = _configure_test_identity(engine)
        identity_configured = True
        client = TestClient(app)
        payload = {
            "invoice_id": str(invoice_id),
            "lines": [{"invoice_line_id": str(line_id), "quantity": "0.750"}],
        }
        first = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        second = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        assert first.status_code == 201
        assert second.status_code == 201
        return_ids = [first.json()["id"], second.json()["id"]]

        start_together = Barrier(2)

        def approve(return_id):
            concurrent_client = TestClient(app)
            start_together.wait(timeout=10)
            response = concurrent_client.post(
                f"/api/v1/businesses/{business_id}/sales-returns/{return_id}/approve"
            )
            return response.status_code, response.json()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(approve, return_ids))

        assert sorted(status for status, _ in results) == [200, 422]
        rejected = next(body for status, body in results if status == 422)
        assert "exceeds the invoiced quantity" in rejected["detail"]

        with Session(engine) as session:
            approved_quantity = session.scalar(
                select(func.coalesce(func.sum(SalesReturnLine.quantity), 0))
                .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
                .where(
                    SalesReturn.invoice_id == invoice_id,
                    SalesReturn.business_id == business_id,
                    SalesReturn.status == "approved",
                )
            )
            assert Decimal(str(approved_quantity or 0)) <= Decimal("1.000")
    finally:
        if identity_configured:
            _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def _half_cent_sales_return_fixture():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Half-cent return shop", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Half-cent return customer")
        session.add(customer)
        session.flush()
        invoice = Invoice(
            business_id=business.id,
            customer_id=customer.id,
            invoice_number="RET-HALF-CENT-1",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("0.02"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("0.02"),
        )
        session.add(invoice)
        session.flush()
        line = InvoiceLine(
            business_id=business.id,
            invoice_id=invoice.id,
            product_id=None,
            description="Half-cent test item",
            quantity=Decimal("1.500"),
            unit_price=Decimal("0.01"),
            line_total=Decimal("0.02"),
        )
        session.add(line)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="test-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        return engine, business.id, invoice.id, line.id


def test_partial_returns_cannot_refund_more_than_rounded_invoice_line():
    engine, business_id, invoice_id, line_id = _half_cent_sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [{"invoice_line_id": str(line_id), "quantity": "0.500"}],
    }
    try:
        created = [
            client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
            for _ in range(3)
        ]
        assert [response.status_code for response in created] == [201, 201, 201]

        approvals = [
            client.post(
                f"/api/v1/businesses/{business_id}/sales-returns/{response.json()['id']}/approve"
            )
            for response in created
        ]
        assert [response.status_code for response in approvals] == [200, 200, 422]
        assert "return amount exceeds" in approvals[2].json()["detail"]

        with Session(engine) as session:
            total_approved = session.scalar(
                select(func.coalesce(func.sum(SalesReturnLine.amount), 0))
                .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
                .where(
                    SalesReturn.business_id == business_id,
                    SalesReturn.invoice_id == invoice_id,
                    SalesReturn.status == "approved",
                )
            )
        assert Decimal(str(total_approved or 0)) == Decimal("0.02")
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def _set_test_membership_role(engine, role):
    with Session(engine) as session:
        membership = session.scalar(
            select(BusinessMembership).where(
                BusinessMembership.user_subject == "test-subject"
            )
        )
        assert membership is not None
        membership.role = role
        session.commit()


def test_staff_cannot_void_invoice():
    engine, business_id, invoice_id, _ = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    _set_test_membership_role(engine, MembershipRole.STAFF)
    try:
        response = TestClient(app).post(
            f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/void",
            json={"reason": "staff must not void posted invoices"},
        )
        assert response.status_code == 403
        with Session(engine) as session:
            invoice = session.get(Invoice, invoice_id)
            assert invoice.status == "issued"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_staff_can_create_but_cannot_approve_sales_return():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    _set_test_membership_role(engine, MembershipRole.STAFF)
    client = TestClient(app)
    try:
        created = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns",
            json={
                "invoice_id": str(invoice_id),
                "lines": [{"invoice_line_id": str(line_id), "quantity": "0.250"}],
            },
        )
        assert created.status_code == 201
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve"
        )
        assert approved.status_code == 403
        with Session(engine) as session:
            item = session.get(SalesReturn, UUID(created.json()["id"]))
            assert item.status == "draft"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
