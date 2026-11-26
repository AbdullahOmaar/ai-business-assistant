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
    InvoiceLine,
    MembershipRole,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesReturn,
    SalesReturnLine,
    Supplier,
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
    # ق-3 (phase ق): "Issue invoice X" / "Void invoice X" are no longer
    # blanket-refused — they are 🟡 actions with deterministic producers
    # (see test_assistant_intents3.py). Refund and final delete stay
    # refused exactly as before.
    for message in (
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


# --- batch ق-2: the remaining ALLOW-list producers -------------------------

@pytest.fixture()
def q2_business(intent_client, business):
    """The Slice 3 seed plus ق-2 records: suppliers, stock-tracked
    products, a purchase order, an issued invoice WITH lines (and an
    approved return against one line), and drafts with lines."""
    client, _subject = intent_client
    business_id, base_ids = business
    business_uuid = UUID(business_id)
    with app.state.session_factory() as session:
        layla = session.scalars(select(Customer).where(
            Customer.business_id == business_uuid, Customer.name == "Layla Hassan"
        )).one()
        ahmed_sami = session.scalars(select(Customer).where(
            Customer.business_id == business_uuid, Customer.name == "Ahmed Sami"
        )).one()
        cable = session.scalars(select(Product).where(
            Product.business_id == business_uuid, Product.name == "Cable"
        )).one()
        cable_ar = session.scalars(select(Product).where(
            Product.business_id == business_uuid, Product.name == "كابل"
        )).one()
        notebook = session.scalars(select(Product).where(
            Product.business_id == business_uuid, Product.name == "Notebook"
        )).one()
        dft_1 = session.scalars(select(Invoice).where(
            Invoice.business_id == business_uuid,
            Invoice.invoice_number == "DFT-1",
        )).one()
        nile = Supplier(business_id=business_uuid, name="Nile Trading")
        nile_foods = Supplier(business_id=business_uuid, name="Nile Foods")
        nile_ar = Supplier(business_id=business_uuid, name="مورد النيل")
        widget = Product(
            business_id=business_uuid, name="Widget",
            unit_price=Decimal("99.00"), is_stock_tracked=True,
        )
        gadget = Product(
            business_id=business_uuid, name="Gadget",
            unit_price=Decimal("15.00"), is_stock_tracked=True,
        )
        session.add_all([nile, nile_foods, nile_ar, widget, gadget])
        session.flush()
        iss_9 = Invoice(
            business_id=business_uuid, customer_id=layla.id,
            invoice_number="ISS-9", status="issued", currency_code="EGP",
            subtotal=Decimal("2900.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("2900.00"),
            issue_date=datetime(2026, 11, 2, tzinfo=UTC),
        )
        dft_9 = Invoice(
            business_id=business_uuid, customer_id=ahmed_sami.id,
            invoice_number="DFT-9", status="draft", currency_code="EGP",
            subtotal=Decimal("370.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"), total=Decimal("370.00"),
        )
        dft_10 = Invoice(
            business_id=business_uuid, customer_id=ahmed_sami.id,
            invoice_number="DFT-10", status="draft", currency_code="EGP",
            subtotal=Decimal("200.00"), tax_total=Decimal("0.00"),
            discount_total=Decimal("20.00"), total=Decimal("180.00"),
        )
        session.add_all([iss_9, dft_9, dft_10])
        session.flush()
        iss_9_cable = InvoiceLine(
            business_id=business_uuid, invoice_id=iss_9.id,
            product_id=cable.id, description="Cable",
            quantity=Decimal("10"), unit_price=Decimal("250.00"),
            line_total=Decimal("2500.00"),
        )
        iss_9_cable_ar = InvoiceLine(
            business_id=business_uuid, invoice_id=iss_9.id,
            product_id=cable_ar.id, description="كابل",
            quantity=Decimal("4"), unit_price=Decimal("100.00"),
            line_total=Decimal("400.00"),
        )
        dft_9_notebook = InvoiceLine(
            business_id=business_uuid, invoice_id=dft_9.id,
            product_id=notebook.id, description="Notebook",
            quantity=Decimal("2"), unit_price=Decimal("60.00"),
            line_total=Decimal("120.00"),
        )
        dft_9_cable = InvoiceLine(
            business_id=business_uuid, invoice_id=dft_9.id,
            product_id=cable.id, description="Cable",
            quantity=Decimal("1"), unit_price=Decimal("250.00"),
            line_total=Decimal("250.00"),
        )
        session.add_all([iss_9_cable, iss_9_cable_ar, dft_9_notebook, dft_9_cable])
        session.add(InvoiceLine(
            business_id=business_uuid, invoice_id=dft_10.id,
            product_id=cable.id, description="Cable",
            quantity=Decimal("1"), unit_price=Decimal("200.00"),
            line_total=Decimal("200.00"),
        ))
        po_1 = PurchaseOrder(
            business_id=business_uuid, supplier_id=nile.id,
            order_number="PO-1", status="draft", currency_code="EGP",
            total=Decimal("400.00"),
        )
        session.add(po_1)
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=business_uuid, purchase_order_id=po_1.id,
            product_id=widget.id, quantity=Decimal("10"),
            unit_cost=Decimal("40.00"), received_quantity=Decimal("0"),
        ))
        approved_return = SalesReturn(
            business_id=business_uuid, invoice_id=iss_9.id,
            status="approved", reason="damaged",
            total=Decimal("750.00"),
        )
        session.add(approved_return)
        session.flush()
        session.add(SalesReturnLine(
            business_id=business_uuid, sales_return_id=approved_return.id,
            invoice_line_id=iss_9_cable.id, quantity=Decimal("3"),
            amount=Decimal("750.00"),
        ))
        session.commit()
        ids = dict(base_ids)
        ids.update({
            "cable": str(cable.id),
            "dft_1": str(dft_1.id),
            "nile": str(nile.id),
            "nile_ar": str(nile_ar.id),
            "widget": str(widget.id),
            "gadget": str(gadget.id),
            "po_1": str(po_1.id),
            "iss_9": str(iss_9.id),
            "dft_9": str(dft_9.id),
            "iss_9_cable_line": str(iss_9_cable.id),
            "iss_9_cable_ar_line": str(iss_9_cable_ar.id),
        })
    return business_id, ids


# --- customer.update -------------------------------------------------------

def test_update_customer_en_possessive_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Update customer Layla Hassan's phone to 01001234567",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "customer.update"
    assert proposal["requires_second_approval"] is False
    assert proposal["payload"]["customer_id"] == ids["layla"]
    assert proposal["payload"]["patch"]["phone"] == "01001234567"
    assert proposal["payload"]["patch"]["address"] is None
    # Nothing executed: the stored customer is unchanged.
    with app.state.session_factory() as session:
        row = session.scalars(select(Customer).where(
            Customer.id == UUID(ids["layla"])
        )).one()
        assert row.phone is None


def test_update_customer_en_multiple_fields(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Update customer Layla Hassan: phone to 01001234567, "
        "email to layla@example.com",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "customer.update"
    assert proposal["payload"]["customer_id"] == ids["layla"]
    assert proposal["payload"]["patch"]["phone"] == "01001234567"
    assert proposal["payload"]["patch"]["email"] == "layla@example.com"


def test_update_customer_ar_field_first(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "غيّر عنوان العميل ليلى حسن الى ١٢ شارع النيل",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "customer.update"
    assert proposal["payload"]["customer_id"] == ids["layla_ar"]
    # The value keeps the user's own spelling (Arabic-Indic digits).
    assert proposal["payload"]["patch"]["address"] == "١٢ شارع النيل"


def test_update_customer_ar_general_form(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "حدّث بيانات العميل ليلى حسن: التليفون الى 01009998877",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "customer.update"
    assert proposal["payload"]["customer_id"] == ids["layla_ar"]
    assert proposal["payload"]["patch"]["phone"] == "01009998877"


def test_update_customer_ambiguous_clarifies(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(client, business_id, "Update customer Ahmed's phone to 0100")
    assert "proposal" not in body
    assert "Ahmed Sami" in body["answer"]
    assert "Ahmed Radwan" in body["answer"]
    assert _proposal_count() == 0


def test_update_customer_missing_is_honest(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id, "Update customer Nobody Here phone to 0100"
    )
    assert "proposal" not in body
    assert "couldn't find a customer" in body["answer"]
    assert _proposal_count() == 0


def test_update_customer_no_field_clarifies(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(client, business_id, "Update customer Layla Hassan")
    assert "proposal" not in body
    assert "change" in body["answer"].lower()
    assert _proposal_count() == 0


def test_staff_customer_update_is_allowed(intent_client, q2_business):
    client, subject = intent_client
    business_id, _ids = q2_business
    subject["value"] = STAFF_A
    body = _ask(
        client, business_id,
        "Update customer Layla Hassan's phone to 01005554433",
    )
    assert body["proposal"]["action"] == "customer.update"


# --- invoice.duplicate -------------------------------------------------------

def test_duplicate_invoice_en_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(client, business_id, "Duplicate invoice ISS-9")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.duplicate"
    assert proposal["requires_second_approval"] is False
    assert proposal["payload"] == {"invoice_id": ids["iss_9"]}


def test_duplicate_invoice_ar_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(client, business_id, "انسخ الفاتوره DFT-9")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.duplicate"
    assert proposal["payload"] == {"invoice_id": ids["dft_9"]}


def test_duplicate_invoice_without_lines_is_honest(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    # The seed's ISS-1 is a bare invoice with no lines — nothing to copy.
    body = _ask(client, business_id, "Duplicate invoice ISS-1")
    assert "proposal" not in body
    assert "has no lines" in body["answer"]
    assert _proposal_count() == 0


def test_duplicate_invoice_missing_is_honest(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(client, business_id, "Duplicate invoice NOPE-9")
    assert "proposal" not in body
    assert "couldn't find an invoice" in body["answer"]
    assert _proposal_count() == 0


# --- purchase_order.create ---------------------------------------------------

def test_create_purchase_order_en_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order PO-100 from supplier Nile Trading: "
        "10 Widget at 40, 5 Gadget at 15",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.create"
    assert proposal["requires_second_approval"] is False
    assert proposal["payload"]["supplier_id"] == ids["nile"]
    assert proposal["payload"]["order_number"] == "PO-100"
    assert proposal["payload"]["currency_code"] == "EGP"
    assert proposal["payload"]["lines"] == [
        {"product_id": ids["widget"], "quantity": "10", "unit_cost": "40"},
        {"product_id": ids["gadget"], "quantity": "5", "unit_cost": "15"},
    ]


def test_create_purchase_order_ar_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "اعمل امر شراء رقم PO-101 من المورد مورد النيل: ٣ Widget بسعر ٤٠",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.create"
    assert proposal["payload"]["supplier_id"] == ids["nile_ar"]
    assert proposal["payload"]["order_number"] == "PO-101"
    assert proposal["payload"]["lines"] == [
        {"product_id": ids["widget"], "quantity": "3", "unit_cost": "40"},
    ]


def test_create_purchase_order_no_price_clarifies(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order PO-102 from supplier Nile Trading: 10 Widget",
    )
    assert "proposal" not in body
    assert "Widget" in body["answer"] and "cost" in body["answer"].lower()
    assert _proposal_count() == 0


def test_create_purchase_order_existing_number_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order PO-1 from supplier Nile Trading: "
        "10 Widget at 40",
    )
    assert "proposal" not in body
    assert "already exists" in body["answer"]
    assert _proposal_count() == 0


def test_create_purchase_order_no_number_clarifies(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order from supplier Nile Trading: 10 Widget at 40",
    )
    assert "proposal" not in body
    assert "number" in body["answer"].lower()
    assert _proposal_count() == 0


def test_create_purchase_order_ambiguous_supplier_clarifies(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order PO-103 from supplier Nile: 10 Widget at 40",
    )
    assert "proposal" not in body
    assert "Nile Trading" in body["answer"]
    assert "Nile Foods" in body["answer"]
    assert _proposal_count() == 0


def test_create_purchase_order_missing_supplier_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order PO-104 from supplier Unknown Co: "
        "10 Widget at 40",
    )
    assert "proposal" not in body
    assert "couldn't find a supplier" in body["answer"]
    assert _proposal_count() == 0


def test_create_purchase_order_untracked_product_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create purchase order PO-105 from supplier Nile Trading: "
        "10 Cable at 40",
    )
    assert "proposal" not in body
    assert "stock-tracked" in body["answer"]
    assert _proposal_count() == 0


# --- purchase_order.duplicate --------------------------------------------------

def test_duplicate_purchase_order_en_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(client, business_id, "Duplicate purchase order PO-1")
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.duplicate"
    assert proposal["payload"] == {"order_id": ids["po_1"]}


def test_duplicate_purchase_order_ar_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(client, business_id, "كرر امر شراء PO-1")
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.duplicate"
    assert proposal["payload"] == {"order_id": ids["po_1"]}


def test_duplicate_purchase_order_missing_is_honest(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(client, business_id, "Duplicate purchase order PO-99")
    assert "proposal" not in body
    assert "couldn't find a purchase order" in body["answer"]
    assert _proposal_count() == 0


# --- sales_return.create -------------------------------------------------------

def test_create_sales_return_en_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Create a sales return for invoice ISS-9: 2 Cable",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "sales_return.create"
    assert proposal["requires_second_approval"] is False
    assert proposal["payload"]["invoice_id"] == ids["iss_9"]
    assert proposal["payload"]["reason"] is None
    assert proposal["payload"]["lines"] == [
        {"invoice_line_id": ids["iss_9_cable_line"], "quantity": "2"},
    ]


def test_create_sales_return_ar_returns_proposal(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id, "اعمل مرتجع على الفاتوره ISS-9: ١ كابل"
    )
    proposal = body["proposal"]
    assert proposal["action"] == "sales_return.create"
    assert proposal["payload"]["invoice_id"] == ids["iss_9"]
    assert proposal["payload"]["lines"] == [
        {"invoice_line_id": ids["iss_9_cable_ar_line"], "quantity": "1"},
    ]


def test_create_sales_return_with_reason(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Create a sales return for invoice ISS-9: 2 Cable, "
        "reason: damaged goods",
    )
    proposal = body["proposal"]
    assert proposal["payload"]["reason"] == "damaged goods"
    assert proposal["payload"]["lines"] == [
        {"invoice_line_id": ids["iss_9_cable_line"], "quantity": "2"},
    ]


def test_create_sales_return_exact_remaining_is_proposal(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, ids = q2_business
    # ISS-9's Cable line is 10; an approved return already took 3.
    body = _ask(
        client, business_id,
        "Create a sales return for invoice ISS-9: 7 Cable",
    )
    proposal = body["proposal"]
    assert proposal["payload"]["lines"] == [
        {"invoice_line_id": ids["iss_9_cable_line"], "quantity": "7"},
    ]


def test_create_sales_return_exceeding_remaining_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create a sales return for invoice ISS-9: 8 Cable",
    )
    assert "proposal" not in body
    assert "Only 7 of Cable" in body["answer"]
    assert _proposal_count() == 0


def test_create_sales_return_on_draft_is_honest(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create a sales return for invoice DFT-9: 1 Notebook",
    )
    assert "proposal" not in body
    assert "isn't issued" in body["answer"]
    assert _proposal_count() == 0


def test_create_sales_return_item_not_on_invoice_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Create a sales return for invoice ISS-9: 1 Notebook",
    )
    assert "proposal" not in body
    assert "isn't a line on invoice ISS-9" in body["answer"]
    assert _proposal_count() == 0


# --- invoice.update_draft ------------------------------------------------------

def _update_lines_by_description(proposal):
    return {
        line["description"]: line for line in proposal["payload"]["update"]["lines"]
    }


def test_edit_draft_invoice_en_quantity_returns_merged_proposal(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Edit draft invoice DFT-9: Notebook quantity to 5",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.update_draft"
    assert proposal["requires_second_approval"] is False
    assert proposal["payload"]["invoice_id"] == ids["dft_9"]
    update = proposal["payload"]["update"]
    assert update["invoice_number"] == "DFT-9"
    assert update["currency_code"] == "EGP"
    assert update["customer_id"] == ids["ahmed_sami"]
    assert update["discount_rate"] == "0"
    assert update["tax_rate"] == "0"
    lines = _update_lines_by_description(proposal)
    assert lines["Notebook"]["quantity"] == "5"
    assert lines["Notebook"]["unit_price"] == "60.00"
    # The unstated line carries its stored values into the full payload.
    assert lines["Cable"]["quantity"] == "1.000"
    assert lines["Cable"]["unit_price"] == "250.00"
    assert lines["Cable"]["product_id"] == ids["cable"]


def test_edit_draft_invoice_ar_add_line_uses_catalogue_price(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(client, business_id, "عدّل مسوده الفاتوره DFT-9: ضيف ٢ Cable")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.update_draft"
    lines = proposal["payload"]["update"]["lines"]
    assert len(lines) == 3
    added = [line for line in lines if line["quantity"] == "2"]
    assert len(added) == 1
    assert added[0]["product_id"] == ids["cable"]
    assert added[0]["unit_price"] == "250.00"


def test_edit_draft_invoice_discount_and_price(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Edit draft invoice DFT-9: set discount to 10%, Cable price to 200",
    )
    proposal = body["proposal"]
    assert proposal["payload"]["update"]["discount_rate"] == "10"
    lines = _update_lines_by_description(proposal)
    assert lines["Cable"]["unit_price"] == "200"


def test_edit_draft_invoice_remove_line(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id, "Edit draft invoice DFT-9: remove Notebook"
    )
    proposal = body["proposal"]
    lines = _update_lines_by_description(proposal)
    assert list(lines) == ["Cable"]


def test_edit_draft_invoice_change_customer(intent_client, q2_business):
    client, _subject = intent_client
    business_id, ids = q2_business
    body = _ask(
        client, business_id,
        "Edit draft invoice DFT-9: change customer to Layla Hassan",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.update_draft"
    assert proposal["payload"]["update"]["customer_id"] == ids["layla"]


def test_edit_draft_invoice_issued_is_honest(intent_client, q2_business):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id, "Edit draft invoice ISS-9: Cable quantity to 3"
    )
    assert "proposal" not in body
    assert "issued" in body["answer"]
    assert _proposal_count() == 0


def test_edit_draft_invoice_with_discount_totals_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    # DFT-10's stored totals carry a discount whose rate is not
    # stored — a merged rebuild would change the totals.
    body = _ask(
        client, business_id, "Edit draft invoice DFT-10: Cable quantity to 3"
    )
    assert "proposal" not in body
    assert "totals" in body["answer"]
    assert _proposal_count() == 0


def test_edit_draft_invoice_unparseable_clause_clarifies(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id, "Edit draft invoice DFT-9: blah blah"
    )
    assert "proposal" not in body
    assert "blah blah" in body["answer"]
    assert _proposal_count() == 0


def test_edit_draft_invoice_removing_last_line_is_honest(
    intent_client, q2_business
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    body = _ask(
        client, business_id,
        "Edit draft invoice DFT-9: remove Notebook, remove Cable",
    )
    assert "proposal" not in body
    assert "at least one line" in body["answer"]
    assert _proposal_count() == 0


def test_provider_never_called_for_q2_intents(
    intent_client, q2_business, monkeypatch
):
    client, _subject = intent_client
    business_id, _ids = q2_business
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-that-must-not-be-used")

    async def _exploding_provider(*args, **kwargs):
        raise AssertionError("provider must not be called for a deterministic intent")

    monkeypatch.setattr(assistant_api, "_provider_post", _exploding_provider)
    body = _ask(client, business_id, "Duplicate invoice ISS-9")
    assert body["proposal"]["action"] == "invoice.duplicate"
    body = _ask(
        client, business_id,
        "Create purchase order PO-200 from supplier Nile Trading: "
        "10 Widget at 40",
    )
    assert body["proposal"]["action"] == "purchase_order.create"
