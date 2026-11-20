"""Local-fallback intent tests: a count question must return a count, not money.

Regression tests for the Copilot finding in assistant_api.py: the fallback
checked sales_intent before count_intent, and "invoice"/"invoices" (and
"فاتورة"/"فواتير") are sales terms, so "count invoices" / "عدد الفواتير"
answered with the monetary total of recent issued invoices instead of a count.
"""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Customer, Invoice, Product
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def assistant_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("assistant-owner")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    try:
        yield TestClient(app)
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


def _seed_business(client):
    response = client.post(
        "/api/v1/businesses",
        json={"name": "Count Test Shop", "currency_code": "EGP"},
    )
    assert response.status_code == 201
    business_id = response.json()["id"]
    business_uuid = UUID(business_id)
    # 3 issued invoices totalling 600.00 EGP, 2 draft invoices totalling 120.00,
    # 2 active customers and 1 active product.
    with app.state.session_factory() as session:
        customer = Customer(business_id=business_uuid, name="Count customer")
        session.add(customer)
        product = Product(business_id=business_uuid, name="Count product", unit_price=Decimal("10.00"))
        session.add(product)
        session.flush()
        for number, total in (("ISS-1", "100.00"), ("ISS-2", "200.00"), ("ISS-3", "300.00")):
            session.add(Invoice(
                business_id=business_uuid, customer_id=customer.id, invoice_number=number,
                status="issued", currency_code="EGP",
                subtotal=Decimal(total), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal(total),
                issue_date=datetime(2026, 11, 1, tzinfo=timezone.utc),
            ))
        for number, total in (("DFT-1", "50.00"), ("DFT-2", "70.00")):
            session.add(Invoice(
                business_id=business_uuid, customer_id=customer.id, invoice_number=number,
                status="draft", currency_code="EGP",
                subtotal=Decimal(total), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal(total),
            ))
        session.add(Customer(business_id=business_uuid, name="Second customer"))
        session.commit()
    return business_id


def _ask(client, business_id, message):
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": message},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mode"] == "local-fallback"
    return payload["answer"]


def test_count_invoices_english_returns_a_count_not_a_total(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "How many invoices are there?")
    assert "3" in answer
    assert "600" not in answer
    assert "600.00" not in answer


def test_count_invoices_short_english_returns_a_count_not_a_total(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "Count invoices")
    assert "3" in answer
    assert "600" not in answer


def test_count_invoices_arabic_returns_a_count_not_a_total(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "عدد الفواتير")
    assert "3" in answer
    assert "600" not in answer


def test_count_issued_invoices_arabic_returns_a_count_not_a_total(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "عدد الفواتير الصادرة")
    assert "3" in answer
    assert "600" not in answer


def test_count_draft_invoices_english_is_status_filtered(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "How many draft invoices are there?")
    assert "2" in answer
    assert "120" not in answer
    assert "600" not in answer


def test_count_draft_invoices_arabic_is_status_filtered(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "عدد الفواتير المسودة")
    assert "2" in answer
    assert "120" not in answer
    assert "600" not in answer


def test_total_sales_still_returns_the_monetary_total(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "What are my total sales?")
    assert "600.00" in answer


def test_count_customers_still_returns_the_directory_summary(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "How many customers are there?")
    assert "عميل" in answer
    assert "600" not in answer
