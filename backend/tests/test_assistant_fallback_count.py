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


# Inherited fallback limitations: the fallback is keyword matching with no
# phrase understanding. Arabic inflections and spellings outside the listed
# token forms (عدد/أعداد with the prefixes ال, و, ب, ل, وال, بال, لل; كم/وكم)
# are not covered; the tests below pin only the count-vs-money routing, not
# a general Arabic NLP claim.

# --- F1: an invoice count needs an explicit count phrase. -------------------
# Bare entity nouns (customers/products/suppliers, العملاء/المنتجات/الموردين)
# are directory words, not count words for invoices, so a money/profit
# question that merely mentions invoices must not be hijacked into a count.
# "كم" is a count word, so "كم فاتورة" / "كم فاتورة صادرة" are count questions.

def test_count_invoices_short_how_many_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "how many invoices")
    assert "3" in answer
    assert "600" not in answer


def test_count_draft_invoices_short_how_many_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "how many draft invoices")
    assert "2" in answer
    assert "120" not in answer
    assert "600" not in answer


def test_count_invoices_number_of_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "number of invoices")
    assert "3" in answer
    assert "600" not in answer


def test_count_invoices_kam_arabic_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم فاتورة")
    assert "3" in answer
    assert "600" not in answer


def test_count_issued_invoices_kam_arabic_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم فاتورة صادرة")
    assert "3" in answer
    assert "600" not in answer


def test_total_invoices_for_customers_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "total invoices for my customers")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_profit_on_invoices_to_customers_is_profit_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "what is the profit on invoices to customers")
    assert "الفرق المبدئي" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_total_invoices_arabic_customers_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "إجمالي فواتير العملاء")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_sales_invoices_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "sales invoices")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_bare_customers_noun_still_returns_the_directory_summary(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "customers")
    assert "عميل" in answer
    assert "600" not in answer


def test_bare_customers_noun_arabic_still_returns_the_directory_summary(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "العملاء")
    assert "عميل" in answer
    assert "600" not in answer


def test_bare_products_noun_still_returns_the_directory_summary(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "products")
    assert "منتج" in answer
    assert "600" not in answer


def test_bare_suppliers_noun_still_returns_the_directory_summary(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "suppliers")
    assert "مورد" in answer
    assert "600" not in answer


# --- F1 follow-up: count phrases match as whole words only. ---------------
# A plain substring would match "count" inside "account"/"discount"/
# "accounting" and "كم" inside "حكم"/"كمية"/"كمبيوتر", hijacking money
# questions into a count. Each of these must not be hijacked into a count;
# the answer itself is the inherited fallback behavior (these questions do
# not ask for the 600.00 total, so no exact amount is asserted).

def test_discount_on_invoices_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "discount on invoices")
    assert "عدد الفواتير الصادرة" not in answer


def test_invoices_per_account_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "invoices per account")
    assert "عدد الفواتير الصادرة" not in answer


def test_total_invoice_amount_per_account_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "total invoice amount per account")
    assert "عدد الفواتير الصادرة" not in answer


def test_accounting_invoices_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "accounting invoices")
    assert "عدد الفواتير الصادرة" not in answer


def test_arabic_kammiyya_invoices_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "إجمالي كمية الفواتير")
    assert "عدد الفواتير الصادرة" not in answer


def test_arabic_computer_invoices_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "ما إجمالي فواتير الكمبيوتر؟")
    assert "عدد الفواتير الصادرة" not in answer


def test_arabic_hukm_invoices_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "ما هو حكم الفواتير الصادرة؟")
    assert "عدد الفواتير الصادرة" not in answer


# --- F1 v3: "كم" is ambiguous (how many / how much). -----------------------
# It counts a question only when no money word is present; with a money word
# ("كم إجمالي الفواتير") the question is about money, not a count. The other
# count phrases are unambiguous and stay counts even with a money word.
# English "counts" is a whole-word count phrase ("invoice counts").

def test_kam_total_arabic_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم إجمالي الفواتير")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_kam_sum_arabic_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم مجموع فواتير العملاء")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_kam_value_arabic_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم قيمة الفواتير")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_kam_amount_arabic_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم مبلغ الفواتير")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_kam_profit_arabic_is_profit_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم ربح الفواتير")
    assert "الفرق المبدئي" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_kam_sales_arabic_is_money_not_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "كم مبيعات الفواتير")
    assert "600.00" in answer
    assert "عدد الفواتير الصادرة" not in answer


def test_how_many_total_invoices_stays_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "how many total invoices")
    assert "3" in answer
    assert "600" not in answer


def test_invoice_counts_plural_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "invoice counts")
    assert "3" in answer
    assert "600" not in answer


def test_invoice_count_singular_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "invoice count")
    assert "3" in answer
    assert "600" not in answer


def test_counts_of_invoices_returns_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "counts of invoices")
    assert "3" in answer
    assert "600" not in answer


# --- F1 v4: the Arabic count word takes common prefixes and a plural. -----
# عدد / أعداد as a standalone token, optionally prefixed (ال, و, ب, ل, وال,
# بال, لل), is a count even with a money word present: "العدد الإجمالي
# للفواتير" asks for a count. This supersedes the v2 test that locked in the
# ال-less-only rule for that wording. "كم" stays exact (optionally "وكم"):
# "بكم" is a price question ("for how much"), not a count; it must not be
# hijacked into a count, and the answer itself is the inherited fallback
# behavior (it does not ask for the 600.00 total, so no exact amount is
# asserted).

def test_arabic_aladad_total_invoices_is_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "العدد الإجمالي للفواتير")
    assert "3" in answer
    assert "600" not in answer


def test_arabic_ma_aladad_total_invoices_is_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "ما العدد الإجمالي للفواتير")
    assert "3" in answer
    assert "600" not in answer


def test_arabic_wa_adad_invoices_is_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "وعدد الفواتير")
    assert "3" in answer
    assert "600" not in answer


def test_arabic_bi_adad_invoices_is_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "بعدد الفواتير")
    assert "3" in answer
    assert "600" not in answer


def test_arabic_aadad_invoices_plural_is_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "أعداد الفواتير")
    assert "3" in answer
    assert "600" not in answer


def test_arabic_bikam_invoices_is_not_hijacked_into_a_count(assistant_client):
    business_id = _seed_business(assistant_client)
    answer = _ask(assistant_client, business_id, "بكم الفواتير")
    assert "عدد الفواتير الصادرة" not in answer
