"""Recurring-invoice schedules must only target active customers.

Regression tests for the Copilot finding in extended_api.py post_recurring_schedule:
the active-customer check was skipped whenever the customer already had a
same-business invoice, so an inactive customer with invoice history could get
a schedule. The active check must apply regardless of invoice history.
"""
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AuditEvent, Base, Business, BusinessMembership, Customer, Invoice, InvoiceLine,
    MembershipRole, RecurringInvoiceSchedule,
)
from app.security import AuthenticatedPrincipal


def _fixture():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Recurring schedule shop", currency_code="EGP")
        session.add(business)
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="test-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        return engine, business.id


def _add_customer(engine, business_id, name, is_active=True):
    with Session(engine) as session:
        customer = Customer(business_id=business_id, name=name, is_active=is_active)
        session.add(customer)
        session.commit()
        return customer.id


def _add_invoice(engine, business_id, customer_id, number):
    with Session(engine) as session:
        invoice = Invoice(
            business_id=business_id,
            customer_id=customer_id,
            invoice_number=number,
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        session.add(invoice)
        session.flush()
        session.add(InvoiceLine(
            business_id=business_id,
            invoice_id=invoice.id,
            product_id=None,
            description="Test item",
            quantity=Decimal("1.000"),
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        ))
        session.commit()
        return invoice.id


def _post_schedule(client, business_id, customer_id):
    return client.post(
        f"/api/v1/businesses/{business_id}/recurring-invoices",
        json={
            "customer_id": str(customer_id),
            "interval_days": 30,
            "timezone": "UTC",
            "next_run_at": "2027-01-01T00:00:00Z",
        },
    )


def _schedule_count(engine, business_id):
    with Session(engine) as session:
        return session.scalar(
            select(func.count()).select_from(RecurringInvoiceSchedule).where(
                RecurringInvoiceSchedule.business_id == business_id
            )
        )


def _run(engine):
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject="test-subject")
    return previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
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


def test_inactive_customer_with_invoice_history_is_rejected():
    engine, business_id = _fixture()
    customer_id = _add_customer(engine, business_id, "Inactive with history", is_active=False)
    _add_invoice(engine, business_id, customer_id, "HIST-1")
    previous_factory, previous_resolver = _run(engine)
    client = TestClient(app)
    try:
        response = _post_schedule(client, business_id, customer_id)
        assert response.status_code == 422, response.text
        assert "Customer not found in this business" in response.json()["detail"]
        assert _schedule_count(engine, business_id) == 0
    finally:
        _restore(previous_factory, previous_resolver)
        engine.dispose()


def test_inactive_customer_without_invoice_history_is_rejected():
    engine, business_id = _fixture()
    customer_id = _add_customer(engine, business_id, "Inactive no history", is_active=False)
    previous_factory, previous_resolver = _run(engine)
    client = TestClient(app)
    try:
        response = _post_schedule(client, business_id, customer_id)
        assert response.status_code == 422, response.text
        assert "Customer not found in this business" in response.json()["detail"]
        assert _schedule_count(engine, business_id) == 0
    finally:
        _restore(previous_factory, previous_resolver)
        engine.dispose()


def test_active_customer_with_no_invoice_history_is_accepted():
    engine, business_id = _fixture()
    customer_id = _add_customer(engine, business_id, "Active no history", is_active=True)
    previous_factory, previous_resolver = _run(engine)
    client = TestClient(app)
    try:
        response = _post_schedule(client, business_id, customer_id)
        assert response.status_code == 201, response.text
        assert response.json()["customer_id"] == str(customer_id)
        assert _schedule_count(engine, business_id) == 1
    finally:
        _restore(previous_factory, previous_resolver)
        engine.dispose()


def test_active_customer_with_invoice_history_is_accepted():
    engine, business_id = _fixture()
    customer_id = _add_customer(engine, business_id, "Active with history", is_active=True)
    _add_invoice(engine, business_id, customer_id, "HIST-2")
    previous_factory, previous_resolver = _run(engine)
    client = TestClient(app)
    try:
        response = _post_schedule(client, business_id, customer_id)
        assert response.status_code == 201, response.text
        assert response.json()["customer_id"] == str(customer_id)
        assert _schedule_count(engine, business_id) == 1
    finally:
        _restore(previous_factory, previous_resolver)
        engine.dispose()


def test_unknown_customer_is_rejected():
    from uuid import uuid4

    engine, business_id = _fixture()
    previous_factory, previous_resolver = _run(engine)
    client = TestClient(app)
    try:
        response = _post_schedule(client, business_id, uuid4())
        assert response.status_code == 422, response.text
        assert "Customer not found in this business" in response.json()["detail"]
        assert _schedule_count(engine, business_id) == 0
    finally:
        _restore(previous_factory, previous_resolver)
        engine.dispose()
