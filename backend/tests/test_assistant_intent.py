"""Deterministic intent -> proposal draft (Slice 3).

The chat endpoint turns a deterministically extractable action request
into a proposal draft (via the same create_proposal path as every
other proposal) instead of a refusal — while questions stay answered,
refusals stay refused, ambiguity gets ONE clarification question, and
nothing is ever executed by the chat call itself.
"""
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import assistant_api
from app.main import app
from app.models import (
    AssistantProposal,
    Base,
    BusinessMembership,
    Customer,
    Invoice,
    MembershipRole,
    Product,
)
from app.security import AuthenticatedPrincipal

OWNER_A = "intent-owner-a"
OWNER_B = "intent-owner-b"
STAFF_A = "intent-staff-a"


@pytest.fixture()
def intent_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": OWNER_A}
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject["value"])
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(app)
    try:
        yield client, subject
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


@pytest.fixture()
def business(intent_client):
    client, subject = intent_client
    subject["value"] = OWNER_A
    response = client.post(
        "/api/v1/businesses", json={"name": "Intent Test Shop", "currency_code": "EGP"}
    )
    assert response.status_code == 201
    business_id = response.json()["id"]
    business_uuid = UUID(business_id)
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=business_uuid, user_subject=OWNER_B, role=MembershipRole.OWNER,
        ))
        session.add(BusinessMembership(
            business_id=business_uuid, user_subject=STAFF_A, role=MembershipRole.STAFF,
        ))
        ahmed_sami = Customer(business_id=business_uuid, name="Ahmed Sami")
        ahmed_radwan = Customer(business_id=business_uuid, name="Ahmed Radwan")
        layla = Customer(business_id=business_uuid, name="Layla Hassan")
        ahmed_sami_ar = Customer(business_id=business_uuid, name="أحمد سامي")
        ahmed_radwan_ar = Customer(business_id=business_uuid, name="أحمد رضوان")
        layla_ar = Customer(business_id=business_uuid, name="ليلى حسن")
        session.add_all([
            ahmed_sami, ahmed_radwan, layla,
            ahmed_sami_ar, ahmed_radwan_ar, layla_ar,
        ])
        cable = Product(
            business_id=business_uuid, name="Cable", unit_price=Decimal("250.00")
        )
        cable_pro = Product(
            business_id=business_uuid, name="Cable Pro", unit_price=Decimal("400.00")
        )
        notebook = Product(
            business_id=business_uuid, name="Notebook", unit_price=Decimal("60.00")
        )
        cable_ar = Product(
            business_id=business_uuid, name="كابل", unit_price=Decimal("100.00")
        )
        session.add_all([cable, cable_pro, notebook, cable_ar])
        session.flush()
        for number, total, customer in (
            ("ISS-1", "100.00", ahmed_sami),
            ("ISS-2", "200.00", ahmed_radwan),
        ):
            session.add(Invoice(
                business_id=business_uuid, customer_id=customer.id, invoice_number=number,
                status="issued", currency_code="EGP",
                subtotal=Decimal(total), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal(total),
                issue_date=datetime(2026, 11, 1, tzinfo=UTC),
            ))
        session.add(Invoice(
            business_id=business_uuid, customer_id=ahmed_sami.id, invoice_number="DFT-1",
            status="draft", currency_code="EGP",
            subtotal=Decimal("50.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("50.00"),
        ))
        session.add(Invoice(
            business_id=business_uuid, customer_id=ahmed_sami.id, invoice_number="VOID-1",
            status="void", currency_code="EGP",
            subtotal=Decimal("40.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("40.00"),
            issue_date=datetime(2026, 10, 15, tzinfo=UTC),
        ))
        session.commit()
        ids = {
            "layla": str(layla.id),
            "layla_ar": str(layla_ar.id),
            "ahmed_sami": str(ahmed_sami.id),
            "cable_pro": str(cable_pro.id),
            "notebook": str(notebook.id),
            "cable_ar": str(cable_ar.id),
            "iss_1": str(session.scalars(
                select(Invoice).where(
                    Invoice.business_id == business_uuid, Invoice.invoice_number == "ISS-1"
                )
            ).one().id),
            "iss_2": str(session.scalars(
                select(Invoice).where(
                    Invoice.business_id == business_uuid, Invoice.invoice_number == "ISS-2"
                )
            ).one().id),
        }
    return business_id, ids


def _ask(client, business_id, message):
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": message},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _proposal_count():
    with app.state.session_factory() as session:
        return len(session.scalars(select(AssistantProposal)).all())


def _table_counts():
    with app.state.session_factory() as session:
        return (
            len(session.scalars(select(Customer)).all()),
            len(session.scalars(select(Product)).all()),
            len(session.scalars(select(Invoice)).all()),
        )


# --- create customer / supplier / product --------------------------------

def test_create_customer_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    before = _table_counts()
    body = _ask(client, business_id, "Create a customer named Sara Ahmed")
    assert "proposal" in body, body
    proposal = body["proposal"]
    assert proposal["action"] == "customer.create"
    assert proposal["payload"] == {
        "name": "Sara Ahmed", "email": None, "phone": None,
        "address": None, "notes": None,
    }
    assert proposal["status"] == "proposed"
    assert proposal["requires_second_approval"] is False
    assert len(proposal["payload_hash"]) == 64
    assert body["suggestions"] == []
    assert "draft" in body["answer"].lower() or "مسودة" in body["answer"]
    # Nothing was executed: the chat call only drafted the proposal.
    assert _table_counts() == before
    assert _proposal_count() == 1


def test_create_customer_ar_preserves_spelling(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "أنشئ عميل جديد باسم سارة أحمد")
    proposal = body["proposal"]
    assert proposal["action"] == "customer.create"
    assert proposal["payload"]["name"] == "سارة أحمد"
    assert "مسودة" in body["answer"]


def test_create_customer_no_name_clarifies(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a customer")
    assert "proposal" not in body
    assert "name" in body["answer"].lower()
    assert _proposal_count() == 0


def test_create_supplier_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a supplier named Nile Trading")
    proposal = body["proposal"]
    assert proposal["action"] == "supplier.create"
    assert proposal["payload"] == {
        "name": "Nile Trading", "email": None, "phone": None, "address": None,
    }


def test_create_product_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a product Cable Box for 150 EGP")
    proposal = body["proposal"]
    assert proposal["action"] == "product.create"
    assert proposal["payload"]["name"] == "Cable Box"
    assert proposal["payload"]["unit_price"] == "150"
    assert proposal["payload"]["unit"] == "unit"


def test_create_product_ar_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "ضيف منتج شاحن بسعر 75 جنيه")
    proposal = body["proposal"]
    assert proposal["action"] == "product.create"
    assert proposal["payload"]["name"] == "شاحن"
    assert proposal["payload"]["unit_price"] == "75"


def test_create_product_no_price_clarifies(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a product Widget")
    assert "proposal" not in body
    assert "Widget" in body["answer"] and "price" in body["answer"].lower()
    assert _proposal_count() == 0


# --- draft invoice --------------------------------------------------------

def test_create_draft_invoice_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    body = _ask(
        client, business_id,
        "Create a draft invoice INV-104 for Layla Hassan for 250 EGP",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.create"
    # invoice.create is in the allowed list: no second approval needed.
    assert proposal["requires_second_approval"] is False
    assert proposal["payload"]["invoice_number"] == "INV-104"
    assert proposal["payload"]["currency_code"] == "EGP"
    assert proposal["payload"]["customer_id"] == ids["layla"]
    assert proposal["payload"]["lines"] == [
        {
            "description": "Invoice INV-104", "quantity": "1",
            "unit_price": "250", "product_id": None,
        }
    ]
    assert proposal["payload"]["discount_rate"] == "0"
    assert proposal["payload"]["tax_rate"] == "0"


def test_create_draft_invoice_ar_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    body = _ask(
        client, business_id,
        "اعمل فاتوره مسوده رقم 105 للعميل ليلى حسن بمبلغ 500 جنيه",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.create"
    assert proposal["payload"]["invoice_number"] == "105"
    assert proposal["payload"]["customer_id"] == ids["layla_ar"]
    assert proposal["payload"]["lines"] == [
        {
            "description": "فاتورة 105", "quantity": "1",
            "unit_price": "500", "product_id": None,
        }
    ]


def test_invoice_ambiguous_customer_clarifies(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Create a draft invoice INV-106 for Ahmed for 250 EGP",
    )
    assert "proposal" not in body
    assert "Ahmed Sami" in body["answer"]
    assert "Ahmed Radwan" in body["answer"]
    assert _proposal_count() == 0


def test_invoice_missing_customer_is_honest(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Create a draft invoice INV-107 for Ghost Person for 250 EGP",
    )
    assert "proposal" not in body
    assert "couldn't find a customer" in body["answer"]
    assert _proposal_count() == 0


def test_invoice_no_number_clarifies(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Create a draft invoice for Layla Hassan for 250 EGP",
    )
    assert "proposal" not in body
    assert "invoice number" in body["answer"].lower()
    assert _proposal_count() == 0


def test_invoice_no_customer_stays_refused(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a new invoice for 250 EGP")
    assert "proposal" not in body
    assert "can't take actions" in body["answer"]
    assert _proposal_count() == 0


def test_invoice_number_already_exists_is_honest(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Create a draft invoice ISS-1 for Layla Hassan for 250 EGP",
    )
    assert "proposal" not in body
    assert "already exists" in body["answer"]
    assert _proposal_count() == 0


# --- payment ---------------------------------------------------------------

def test_payment_on_invoice_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    before = _table_counts()
    body = _ask(client, business_id, "Record a payment of 100 EGP on invoice ISS-1")
    proposal = body["proposal"]
    assert proposal["action"] == "payment.record"
    assert proposal["requires_second_approval"] is True
    assert "needs the owner's confirmation" in body["answer"]
    payload = proposal["payload"]
    assert payload["amount"] == "100"
    assert payload["currency_code"] == "EGP"
    assert payload["customer_id"] == ids["ahmed_sami"]
    assert payload["allocations"] == [
        {"invoice_id": ids["iss_1"], "amount": "100"}
    ]
    assert payload["idempotency_key"]
    assert _table_counts() == before


def test_payment_on_invoice_ar_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "سدد 200 جنيه على فاتوره ISS-2")
    proposal = body["proposal"]
    assert proposal["action"] == "payment.record"
    assert proposal["payload"]["allocations"] == [
        {"invoice_id": ids["iss_2"], "amount": "200"}
    ]


def test_payment_from_customer_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Record a payment of 50 EGP from Layla Hassan")
    proposal = body["proposal"]
    assert proposal["action"] == "payment.record"
    assert proposal["payload"]["customer_id"] == ids["layla"]
    assert proposal["payload"]["allocations"] == []


def test_payment_ambiguous_customer_clarifies(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Record a payment of 50 EGP from Ahmed")
    assert "proposal" not in body
    assert "Ahmed Sami" in body["answer"]
    assert "Ahmed Radwan" in body["answer"]
    assert _proposal_count() == 0


def test_payment_missing_invoice_is_honest(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Record a payment of 50 EGP on invoice ISS-999")
    assert "proposal" not in body
    assert "couldn't find an invoice" in body["answer"]
    assert _proposal_count() == 0


def test_payment_on_draft_invoice_is_honest(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Record a payment of 50 EGP on invoice DFT-1")
    assert "proposal" not in body
    assert "isn't issued" in body["answer"]
    assert _proposal_count() == 0


def test_payment_on_void_invoice_is_honest(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Record a payment of 50 EGP on invoice VOID-1")
    assert "proposal" not in body
    assert "isn't issued" in body["answer"]
    assert _proposal_count() == 0


# --- expense ----------------------------------------------------------------

def test_expense_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Record an expense of 300 EGP for electricity")
    proposal = body["proposal"]
    assert proposal["action"] == "expense.create"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"]["category"] == "electricity"
    assert proposal["payload"]["description"] == "electricity"
    assert proposal["payload"]["amount"] == "300"
    assert proposal["payload"]["currency_code"] == "EGP"
    assert proposal["payload"]["incurred_at"]


def test_expense_ar_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "سجل مصروف 300 جنيه كهربا")
    proposal = body["proposal"]
    assert proposal["action"] == "expense.create"
    assert proposal["payload"]["category"] == "كهربا"
    assert proposal["payload"]["amount"] == "300"


# --- stock movement ----------------------------------------------------------

def test_stock_add_en_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Add 10 notebooks to stock")
    proposal = body["proposal"]
    assert proposal["action"] == "stock.movement"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"]["product_id"] == ids["notebook"]
    assert proposal["payload"]["movement_type"] == "receipt"
    assert proposal["payload"]["quantity_delta"] == "10"


def test_stock_remove_ar_returns_proposal(intent_client, business):
    client, _subject = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اخصم 3 كابل من المخزون")
    proposal = body["proposal"]
    assert proposal["action"] == "stock.movement"
    assert proposal["payload"]["product_id"] == ids["cable_ar"]
    assert proposal["payload"]["movement_type"] == "adjustment"
    assert proposal["payload"]["quantity_delta"] == "-3"


def test_stock_ambiguous_product_clarifies(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Add 10 cables to stock")
    assert "proposal" not in body
    assert "Cable" in body["answer"] and "Cable Pro" in body["answer"]
    assert _proposal_count() == 0


def test_stock_missing_product_is_honest(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Add 10 widgets to stock")
    assert "proposal" not in body
    assert "couldn't find a product" in body["answer"]
    assert _proposal_count() == 0


# --- guard rails: questions, refusals, roles, provider ----------------------

def test_question_still_answered(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "How many customers are there?")
    assert "proposal" not in body
    assert "6" in body["answer"]
    assert _proposal_count() == 0


def test_refusals_preserved(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    for message in (
        "Void invoice ISS-1",
        "Issue invoice ISS-1",
        "Refund 500 EGP",
        "Delete invoice ISS-1",
    ):
        body = _ask(client, business_id, message)
        assert "proposal" not in body, message
        assert "can't take actions" in body["answer"], message
    assert _proposal_count() == 0


def test_staff_payment_gets_owner_needed_answer(intent_client, business):
    client, subject = intent_client
    business_id, _ids = business
    subject["value"] = STAFF_A
    body = _ask(client, business_id, "Record a payment of 50 EGP from Layla Hassan")
    assert "proposal" not in body
    assert "owner-only" in body["answer"]
    assert _proposal_count() == 0


def test_staff_customer_create_is_allowed(intent_client, business):
    client, subject = intent_client
    business_id, _ids = business
    subject["value"] = STAFF_A
    body = _ask(client, business_id, "Create a customer named Staff Created")
    assert body["proposal"]["action"] == "customer.create"
    assert body["proposal"]["payload"]["name"] == "Staff Created"


def test_provider_never_called_for_deterministic_intent(
    intent_client, business, monkeypatch
):
    client, _subject = intent_client
    business_id, _ids = business
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-that-must-not-be-used")

    async def _exploding_provider(*args, **kwargs):
        raise AssertionError("provider must not be called for a deterministic intent")

    monkeypatch.setattr(assistant_api, "_provider_post", _exploding_provider)
    body = _ask(client, business_id, "Create a customer named No Provider")
    assert body["proposal"]["action"] == "customer.create"


def test_proposal_persists_with_hash_binding(intent_client, business):
    client, _subject = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a customer named Hash Bound")
    proposal = body["proposal"]
    response = client.get(
        f"/api/v1/businesses/{business_id}/assistant/proposals/{proposal['id']}"
    )
    assert response.status_code == 200, response.text
    fetched = response.json()
    assert fetched["payload_hash"] == proposal["payload_hash"]
    assert fetched["payload"] == {
        "name": "Hash Bound", "email": None, "phone": None,
        "address": None, "notes": None,
    }
    assert fetched["status"] == "proposed"
    with app.state.session_factory() as session:
        row = session.scalars(
            select(AssistantProposal).where(
                AssistantProposal.id == UUID(proposal["id"])
            )
        ).one()
        assert row.payload_hash == proposal["payload_hash"]
        assert row.status == "proposed"


def test_fold_light_normalizes_taa_digits_and_alef():
    """Regression (voice gate finding, 2026-11-26): _fold_light must
    actually fold — ة->ه, alef forms -> ا, Arabic-Indic digits ->
    Western. The str.maketrans tables are keyed by ordinal, so a
    .get(char) lookup silently folded NOTHING and natural ة-spelled
    or Arabic-digit messages extracted no intent at all."""
    from app.assistant_intent import _fold_light

    folded, index_map = _fold_light("فاتورة ١٠٥ أ")
    assert folded == "فاتوره 105 ا"
    # Every fold here is 1:1, so the index map stays the identity.
    assert index_map == list(range(len("فاتورة ١٠٥ أ")))
