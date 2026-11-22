"""Sensitive-action gating: an action request to /assistant/chat must be
refused, change nothing, and (when a provider key is set) make no provider
call.

P6 acceptance item (5) follow-up. The endpoint is read-only by construction
(zero mutation calls in assistant_api.py), but before this change an action
request such as "void invoice ISS-1" was silently answered with a sales
summary instead of being refused. The refusal is server-side, before both
the local-fallback and the provider paths.
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
        json={"name": "Refusal Test Shop", "currency_code": "EGP"},
    )
    assert response.status_code == 201
    business_id = response.json()["id"]
    business_uuid = UUID(business_id)
    # 3 issued invoices totalling 600.00 EGP, 2 draft invoices totalling
    # 120.00, 1 void invoice, 2 active customers and 1 active product.
    with app.state.session_factory() as session:
        customer = Customer(business_id=business_uuid, name="Refusal customer")
        session.add(customer)
        product = Product(business_id=business_uuid, name="Refusal product", unit_price=Decimal("10.00"))
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
        session.add(Invoice(
            business_id=business_uuid, customer_id=customer.id, invoice_number="VOID-1",
            status="void", currency_code="EGP",
            subtotal=Decimal("40.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("40.00"),
            issue_date=datetime(2026, 10, 15, tzinfo=timezone.utc),
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


def _invoice_snapshot():
    """(issued count, issued total, draft count, draft total, invoice rows)."""
    from sqlalchemy import select

    with app.state.session_factory() as session:
        invoices = session.scalars(select(Invoice)).all()
    issued = [inv for inv in invoices if inv.status == "issued"]
    drafts = [inv for inv in invoices if inv.status == "draft"]
    return (
        len(issued),
        sum((inv.total for inv in issued), Decimal("0")),
        len(drafts),
        sum((inv.total for inv in drafts), Decimal("0")),
        sorted((inv.invoice_number, inv.status) for inv in invoices),
    )


def _ask(client, business_id, message):
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": message},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _assert_refused(payload):
    assert payload["mode"] == "local-fallback"
    assert payload["sources"] == []
    answer = payload["answer"]
    arabic = "لا يمكنني تنفيذ" in answer and "لم يتم إجراء أي تغيير" in answer
    english = "I can't take actions such as" in answer and "no change has been made" in answer
    assert arabic or english


def test_issue_invoice_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "Please issue an invoice for Refusal customer for 500 EGP")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_void_invoice_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "Void invoice ISS-1")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_pay_invoice_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "Pay invoice ISS-2")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_refund_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "Refund the customer for invoice ISS-3")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_create_invoice_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "Create a new invoice for 250 EGP")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_arabic_issue_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "أصدر فاتورة جديدة للعميل")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_arabic_cancel_request_is_refused_and_changes_nothing(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "ألغِ الفاتورة ISS-1")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_provider_is_not_called_for_refused_action(assistant_client, monkeypatch):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-that-must-not-be-used")

    class ExplodingClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("provider must not be called for a refused action")

    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", ExplodingClient)
    payload = _ask(assistant_client, business_id, "Void invoice ISS-1")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


def test_read_questions_are_not_refused(assistant_client):
    business_id = _seed_business(assistant_client)
    # A read about a single invoice is answered from records, not refused.
    payload = _ask(assistant_client, business_id, "Show me invoice ISS-1")
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert "600.00" in payload["answer"]
    # A read about when an invoice was issued ("أُصدرت") is not an action.
    payload = _ask(assistant_client, business_id, "متى أُصدرت الفاتورة ISS-1؟")
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert "600.00" in payload["answer"]
    # The plain sales question still returns the monetary total.
    payload = _ask(assistant_client, business_id, "What are my total sales?")
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert "600.00" in payload["answer"]


# Corrected matcher (2026-11-21): the earlier substring matcher false-positived
# on reporting/counting/how-to questions that merely contain an action verb
# ("How many void invoices do I have?", "How do I create an invoice?",
# "ما سبب إلغاء الفاتورة 5؟"). The matcher now refuses only a request to
# perform an action; questions and reports are answered. These cases pin the
# coordinator's 9+9 list: the answered cases assert the refusal text is
# ABSENT (the fallback answer itself is unchanged behaviour), the refused
# cases assert refusal plus an unchanged snapshot.
COORDINATOR_ANSWERED_CASES = [
    "How many void invoices do I have?",
    "Show void invoices",
    "What is the total of refunded sales?",
    "How many refunds this month?",
    "How do I create an invoice?",
    "Which invoices should I cancel invoice reminders for",
    "How many customers pay invoice late?",
    "ما سبب إلغاء الفاتورة 5؟",
    "كم استرداد فاتورة هذا الشهر؟",
]

COORDINATOR_REFUSED_CASES = [
    "Issue invoice INV-1",
    "Please void the invoice INV-2",
    "Void invoice INV-3",
    "Delete invoice INV-4",
    "Pay invoice INV-5 now",
    "Refund invoice INV-6",
    "ألغِ الفاتورة 5",
    "أصدر فاتورة جديدة",
    "احذف الفاتورة 3",
]


@pytest.mark.parametrize("message", COORDINATOR_ANSWERED_CASES)
def test_coordinator_answered_cases_are_not_refused(assistant_client, message):
    business_id = _seed_business(assistant_client)
    payload = _ask(assistant_client, business_id, message)
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert payload["mode"] == "local-fallback"


@pytest.mark.parametrize("message", COORDINATOR_REFUSED_CASES)
def test_coordinator_refused_cases_are_refused_and_change_nothing(assistant_client, message):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, message)
    _assert_refused(payload)
    assert _invoice_snapshot() == before


# Round 2 (2026-11-21): explain / how-to requests are questions, not
# actions — even when they name the action ("شرح طريقة حذف الفاتورة" was
# refused before this change because "حذف الفاتورة" matched the action
# pattern). These pin the explain guards in both languages.
EXPLAIN_ANSWERED_CASES = [
    "Explain how to void an invoice",
    "Explain void invoice INV-2",
    "Steps to cancel an invoice",
    "Walk me through void invoice INV-2",
    "Show me how to pay an invoice",
    "Explain the steps to delete an invoice",
    "شرح طريقة حذف الفاتورة",
    "اشرح لي كيف ألغي فاتورة",
    "اشرحلي طريقة إصدار فاتورة",
    "خطوات إلغاء فاتورة",
    "ما هي خطوات دفع الفاتورة؟",
    "ازاي ألغي الفاتورة؟",
    "إزاي أحذف فاتورة؟",
    "وضح طريقة دفع الفاتورة",
    "يعني ايه إلغاء الفاتورة؟",
    "شرح حذف الفاتورة",
]


@pytest.mark.parametrize("message", EXPLAIN_ANSWERED_CASES)
def test_explain_howto_cases_are_answered_not_refused(assistant_client, message):
    business_id = _seed_business(assistant_client)
    payload = _ask(assistant_client, business_id, message)
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert "لم أتخذ أي إجراء" not in payload["answer"]
    assert payload["mode"] == "local-fallback"


def _assert_clarified(payload):
    """Arabic bare-plural clarification: capability limit stated, no action
    taken, no execution claimed — and distinct from the refusal (no refusal
    body)."""
    assert payload["mode"] == "local-fallback"
    assert payload["sources"] == []
    answer = payload["answer"]
    arabic = "لا يمكنني تنفيذ" in answer and "لم يتم إجراء أي تغيير" in answer
    english = "I can't take actions such as" in answer and "no change has been made" in answer
    assert arabic or english
    assert "لم أتخذ أي إجراء" in payload["answer"]
    assert "لم يحدد فواتير معينة" in payload["answer"]
    assert "مثل إصدار فاتورة" not in payload["answer"]
    for claim in ("تم إلغاء", "تم حذف", "تم دفع", "تم إصدار", "تم استرداد", "done"):
        assert claim not in payload["answer"]


def _assert_clarified_en(payload):
    """English bare-plural clarification: same facts as the Arabic one
    (read-only assistant, no change made, no specific invoices named,
    summary suggested, or do it in the app), no Arabic text, and no
    execution claimed. "voided" appears only as an invoice category
    ("issued, voided or overdue invoices"), never as a performed fact,
    so performed-fact phrasings — not the bare word — are asserted absent."""
    assert payload["mode"] == "local-fallback"
    assert payload["sources"] == []
    assert "I can't take actions on invoices" in payload["answer"]
    assert "no change has been made" in payload["answer"]
    assert "didn't name specific invoices" in payload["answer"]
    assert "haven't taken any action" in payload["answer"]
    assert "summary of issued, voided or overdue invoices" in payload["answer"]
    for marker in ("لا يمكنني تنفيذ", "لم أتخذ أي إجراء", "تم "):
        assert marker not in payload["answer"]
    for claim in ("done", "has been voided", "was voided", "voided the",
                  "deleted", "paid"):
        assert claim not in payload["answer"].casefold()


# Round 2: a bare plural names no target, so it is ambiguous — it gets the
# capability clarification, not a confident refusal. Amendment (2026-11-21):
# the clarification matches the language of the message — English requests
# get the English text, Arabic requests the Arabic text.
BARE_PLURAL_CLARIFICATION_CASES_EN = [
    "void invoices",
    "Void invoices",
    "void invoices please",
    "Void invoices now",
]

BARE_PLURAL_CLARIFICATION_CASES_AR = [
    "ألغِ الفواتير",
    "احذف الفواتير",
    "ادفع الفواتير",
    "ألغِ الفواتير من فضلك",
]


@pytest.mark.parametrize("message", BARE_PLURAL_CLARIFICATION_CASES_EN)
def test_bare_plural_action_gets_english_capability_clarification(assistant_client, message):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, message)
    _assert_clarified_en(payload)
    assert _invoice_snapshot() == before


@pytest.mark.parametrize("message", BARE_PLURAL_CLARIFICATION_CASES_AR)
def test_bare_plural_action_gets_arabic_capability_clarification(assistant_client, message):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, message)
    _assert_clarified(payload)
    assert _invoice_snapshot() == before


def test_bare_singular_invoice_is_still_refused(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, "Void invoice")
    _assert_refused(payload)
    assert _invoice_snapshot() == before


# Round 2: a scoped plural names a target ("all" / "كل"), so it stays refused.
SCOPED_PLURAL_REFUSED_CASES = [
    "void all invoices",
    "pay for all invoices",
    "ألغِ كل الفواتير",
]


@pytest.mark.parametrize("message", SCOPED_PLURAL_REFUSED_CASES)
def test_scoped_plural_actions_are_still_refused(assistant_client, message):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, message)
    _assert_refused(payload)
    assert _invoice_snapshot() == before


# Amendment (2026-11-21): "هل أقدر/اقدر" + action is a capability
# question, same as "هل يمكنني" — answered, not refused. Only هل + اقدر
# is guarded; bare اقدر (without هل) is not. The English cases pin the
# existing capability guard ("can I" / "could I"), which had probe-only
# coverage before.
CAPABILITY_QUESTION_CASES = [
    "هل أقدر ألغي الفاتورة؟",
    "هل اقدر احذف الفاتورة 3؟",
    "هل أقدر أدفع الفاتورة؟",
    "Can I void invoice INV-2?",
    "Could I refund an invoice?",
]


@pytest.mark.parametrize("message", CAPABILITY_QUESTION_CASES)
def test_capability_questions_are_answered_not_refused(assistant_client, message):
    business_id = _seed_business(assistant_client)
    payload = _ask(assistant_client, business_id, message)
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert "لم أتخذ أي إجراء" not in payload["answer"]
    assert "I can't take actions" not in payload["answer"]
    assert payload["mode"] == "local-fallback"


# Round 2: unmatched action phrases are NOT added to the verb set — they
# fall through to the read-only fallback answers. Each answer must state
# no execution: no refusal text, no clarification text, no "تم " completed
# marker, no "done", and no completed-state claim. The expected substring
# pins which fallback branch answers (sales total for the invoice ones,
# the generic no-key message for the bare "void INV-2").
UNMATCHED_FALLTHROUGH_EXPECTED = [
    ("void INV-2", "المساعد التوليدي غير مفعّل"),
    ("mark invoice INV-2 as paid", "600.00"),
    ("send the invoice INV-4 to the customer", "600.00"),
    ("ارجع فلوس الفاتورة 3", "600.00"),
]


@pytest.mark.parametrize("message,expected", UNMATCHED_FALLTHROUGH_EXPECTED)
def test_unmatched_action_phrases_fall_through_to_read_only_answers(
    assistant_client, message, expected
):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    payload = _ask(assistant_client, business_id, message)
    assert "لا يمكنني تنفيذ" not in payload["answer"]
    assert "لم أتخذ أي إجراء" not in payload["answer"]
    assert "تم " not in payload["answer"]
    assert "done" not in payload["answer"].casefold()
    assert "paid" not in payload["answer"].casefold()
    for claim in ("تم إلغاء", "تم حذف", "تم دفع", "تم إصدار", "تم استرداد"):
        assert claim not in payload["answer"]
    assert expected in payload["answer"]
    assert payload["mode"] == "local-fallback"
    assert _invoice_snapshot() == before


def test_refusal_language_follows_the_request_language(assistant_client):
    business_id = _seed_business(assistant_client)
    before = _invoice_snapshot()
    english = _ask(assistant_client, business_id, "Void invoice ISS-1")
    arabic = _ask(assistant_client, business_id, "ألغِ الفاتورة ISS-1")
    assert "I can't take actions such as" in english["answer"]
    assert "no change has been made" in english["answer"]
    assert not any("\u0600" <= ch <= "\u06ff" for ch in english["answer"])
    assert "لا يمكنني تنفيذ" in arabic["answer"]
    assert "لم يتم إجراء أي تغيير" in arabic["answer"]
    assert "I can't take actions" not in arabic["answer"]
    assert _invoice_snapshot() == before
