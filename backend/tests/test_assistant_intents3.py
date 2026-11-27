"""Deterministic intent -> proposal draft, ق-3 (phase ق, FULL-PLAN §٩).

The 🟡 second-approval families Slice 3 deliberately left refused —
issue / void an invoice, purchase-order approve / receive / cancel,
return approval and credit notes (resolved through the invoice),
recurring schedules, pricing rules, payroll, notifications — now
convert to proposal drafts through the same create_proposal path.
Status honesty mirrors the service guards, ambiguity gets ONE
clarification, missing targets are stated honestly, and nothing is
ever executed by the chat call itself.
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
    CreditNote,
    Customer,
    Employee,
    Invoice,
    MembershipRole,
    Payment,
    PaymentAllocation,
    PayrollRecord,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesReturn,
    Supplier,
)
from app.security import AuthenticatedPrincipal

OWNER_A = "intents3-owner-a"
OWNER_B = "intents3-owner-b"
STAFF_A = "intents3-staff-a"


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


def _invoice(business_id, customer, number, status, total, **kw):
    return Invoice(
        business_id=business_id, customer_id=customer.id if customer else None,
        invoice_number=number, status=status, currency_code="EGP",
        subtotal=Decimal(total), tax_total=Decimal("0.00"),
        discount_total=Decimal("0.00"), total=Decimal(total), **kw,
    )


@pytest.fixture()
def business(intent_client):
    client, subject = intent_client
    subject["value"] = OWNER_A
    response = client.post(
        "/api/v1/businesses", json={"name": "Intents3 Shop", "currency_code": "EGP"}
    )
    assert response.status_code == 201
    business_id = response.json()["id"]
    biz = UUID(business_id)
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=biz, user_subject=OWNER_B, role=MembershipRole.OWNER,
        ))
        session.add(BusinessMembership(
            business_id=biz, user_subject=STAFF_A, role=MembershipRole.STAFF,
        ))
        layla = Customer(business_id=biz, name="Layla Hassan")
        layla_ar = Customer(business_id=biz, name="ليلى حسن")
        ahmed_sami = Customer(business_id=biz, name="Ahmed Sami")
        ahmed_radwan = Customer(business_id=biz, name="Ahmed Radwan")
        supplier = Supplier(business_id=biz, name="Nile Trading")
        cable = Product(business_id=biz, name="Cable", unit_price=Decimal("250.00"))
        notebook = Product(business_id=biz, name="Notebook", unit_price=Decimal("60.00"))
        session.add_all([layla, layla_ar, ahmed_sami, ahmed_radwan, supplier, cable, notebook])
        session.flush()

        dft1 = _invoice(biz, layla, "DFT-1", "draft", "50.00")
        iss1 = _invoice(biz, layla, "ISS-1", "issued", "100.00",
                        issue_date=datetime(2026, 11, 1, tzinfo=UTC))
        iss2 = _invoice(biz, ahmed_sami, "ISS-2", "issued", "200.00",
                        issue_date=datetime(2026, 11, 2, tzinfo=UTC))
        iss3 = _invoice(biz, layla, "ISS-3", "issued", "300.00",
                        issue_date=datetime(2026, 11, 3, tzinfo=UTC))
        iss4 = _invoice(biz, layla, "ISS-4", "issued", "80.00",
                        issue_date=datetime(2026, 11, 4, tzinfo=UTC))
        void1 = _invoice(biz, layla, "VOID-1", "void", "40.00",
                         issue_date=datetime(2026, 10, 15, tzinfo=UTC))
        session.add_all([dft1, iss1, iss2, iss3, iss4, void1])
        session.flush()

        # ISS-2 carries an allocated payment: voiding it must be refused
        # honestly by the producer (the service guard, mirrored).
        payment = Payment(
            business_id=biz, customer_id=ahmed_sami.id, amount=Decimal("50.00"),
            currency_code="EGP", idempotency_key="intents3-seed-payment",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=biz, payment_id=payment.id, invoice_id=iss2.id,
            amount=Decimal("50.00"),
        ))

        po1 = PurchaseOrder(
            business_id=biz, supplier_id=supplier.id, order_number="PO-1",
            status="draft", currency_code="EGP", total=Decimal("2500.00"),
        )
        po2 = PurchaseOrder(
            business_id=biz, supplier_id=supplier.id, order_number="PO-2",
            status="approved", currency_code="EGP", total=Decimal("2800.00"),
        )
        session.add_all([po1, po2])
        session.flush()
        po1_line = PurchaseOrderLine(
            business_id=biz, purchase_order_id=po1.id, product_id=cable.id,
            quantity=Decimal("10"), unit_cost=Decimal("250.00"),
            received_quantity=Decimal("0"),
        )
        po2_cable = PurchaseOrderLine(
            business_id=biz, purchase_order_id=po2.id, product_id=cable.id,
            quantity=Decimal("10"), unit_cost=Decimal("250.00"),
            received_quantity=Decimal("4"),
        )
        po2_notebook = PurchaseOrderLine(
            business_id=biz, purchase_order_id=po2.id, product_id=notebook.id,
            quantity=Decimal("5"), unit_cost=Decimal("60.00"),
            received_quantity=Decimal("0"),
        )
        session.add_all([po1_line, po2_cable, po2_notebook])
        session.flush()

        ret_draft = SalesReturn(
            business_id=biz, invoice_id=iss1.id, status="draft",
            reason="Damaged goods", total=Decimal("40.00"),
        )
        ret_approved = SalesReturn(
            business_id=biz, invoice_id=iss1.id, status="approved",
            reason="Wrong item", total=Decimal("25.00"),
        )
        ret_no_reason = SalesReturn(
            business_id=biz, invoice_id=iss2.id, status="draft",
            reason=None, total=Decimal("30.00"),
        )
        ret_credited = SalesReturn(
            business_id=biz, invoice_id=iss2.id, status="approved",
            reason="Changed mind", total=Decimal("20.00"),
        )
        ret_amb_1 = SalesReturn(
            business_id=biz, invoice_id=iss3.id, status="draft",
            reason="Late delivery", total=Decimal("10.00"),
            created_at=datetime(2026, 11, 20, 10, 0, tzinfo=UTC),
        )
        ret_amb_2 = SalesReturn(
            business_id=biz, invoice_id=iss3.id, status="draft",
            reason="Broken seal", total=Decimal("15.00"),
            created_at=datetime(2026, 11, 22, 10, 0, tzinfo=UTC),
        )
        session.add_all([
            ret_draft, ret_approved, ret_no_reason, ret_credited,
            ret_amb_1, ret_amb_2,
        ])
        session.flush()
        session.add(CreditNote(
            business_id=biz, sales_return_id=ret_credited.id,
            invoice_id=iss2.id, customer_id=ahmed_sami.id,
            credit_note_number="CN-1", currency_code="EGP",
            total=Decimal("20.00"), created_by_subject=OWNER_A,
        ))

        omar_khalil = Employee(
            business_id=biz, name="Omar Khalil", department="Sales",
            monthly_salary=Decimal("8000.00"),
        )
        omar_adel = Employee(
            business_id=biz, name="Omar Adel", department="Support",
            monthly_salary=Decimal("7000.00"),
        )
        sara = Employee(
            business_id=biz, name="سارة محمود", department="Ops",
            monthly_salary=Decimal("9000.00"),
        )
        session.add_all([omar_khalil, omar_adel, sara])
        session.flush()

        def _payroll(employee, period, status):
            return PayrollRecord(
                business_id=biz, employee_id=employee.id, period=period,
                base_salary=employee.monthly_salary,
                allowances=Decimal("0.00"), bonuses=Decimal("0.00"),
                deductions=Decimal("0.00"), net_pay=employee.monthly_salary,
                status=status, created_by_subject=OWNER_A,
            )

        pay_oct = _payroll(omar_khalil, "2026-10", "draft")
        pay_sep = _payroll(omar_khalil, "2026-09", "approved")
        pay_aug = _payroll(omar_khalil, "2026-08", "paid")
        pay_sara_nov = _payroll(sara, "2026-11", "draft")
        pay_sara_oct = _payroll(sara, "2026-10", "approved")
        session.add_all([pay_oct, pay_sep, pay_aug, pay_sara_nov, pay_sara_oct])
        session.commit()
        ids = {
            "layla": str(layla.id), "layla_ar": str(layla_ar.id),
            "dft1": str(dft1.id), "iss1": str(iss1.id), "iss2": str(iss2.id),
            "po1": str(po1.id), "po2": str(po2.id),
            "po2_cable_line": str(po2_cable.id),
            "po2_notebook_line": str(po2_notebook.id),
            "ret_draft": str(ret_draft.id), "ret_approved": str(ret_approved.id),
            "ret_amb_2": str(ret_amb_2.id),
            "omar_khalil": str(omar_khalil.id), "sara": str(sara.id),
            "pay_oct": str(pay_oct.id), "pay_sep": str(pay_sep.id),
            "pay_sara_nov": str(pay_sara_nov.id),
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


# --- invoice issue / void ---------------------------------------------------

def test_issue_invoice_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Issue invoice DFT-1")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.issue"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"] == {"invoice_id": ids["dft1"]}
    # Nothing executed: DFT-1 is still a draft.
    with app.state.session_factory() as session:
        row = session.scalars(select(Invoice).where(
            Invoice.invoice_number == "DFT-1")).one()
        assert row.status == "draft"


def test_issue_invoice_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اصدر الفاتوره DFT-1")
    assert body["proposal"]["action"] == "invoice.issue"
    assert body["proposal"]["payload"] == {"invoice_id": ids["dft1"]}


def test_issue_already_issued_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Issue invoice ISS-1")
    assert "proposal" not in body
    assert "isn't a draft" in body["answer"]
    assert _proposal_count() == 0


def test_issue_missing_invoice_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Issue invoice NOPE-9")
    assert "proposal" not in body
    assert "couldn't find an invoice" in body["answer"]


def test_void_invoice_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Void invoice ISS-1")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.void"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"] == {
        "invoice_id": ids["iss1"], "reason": None,
    }


def test_void_invoice_with_reason_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Void invoice ISS-1 reason: duplicate entry")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.void"
    assert proposal["payload"] == {
        "invoice_id": ids["iss1"], "reason": "duplicate entry",
    }


def test_void_invoice_ar_with_reason(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "ابطل الفاتوره ISS-1 السبب: خطأ في السعر")
    proposal = body["proposal"]
    assert proposal["action"] == "invoice.void"
    assert proposal["payload"]["invoice_id"] == ids["iss1"]
    assert proposal["payload"]["reason"] == "خطأ في السعر"


def test_void_already_void_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Void invoice VOID-1")
    assert "proposal" not in body
    assert "already void" in body["answer"]


def test_void_with_allocations_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Void invoice ISS-2")
    assert "proposal" not in body
    assert "allocated payments" in body["answer"]
    assert _proposal_count() == 0


# --- purchase orders -----------------------------------------------------------

def test_po_approve_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Approve purchase order PO-1")
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.approve"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"] == {"order_id": ids["po1"]}


def test_po_approve_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اعتمد امر الشراء PO-1")
    assert body["proposal"]["action"] == "purchase_order.approve"
    assert body["proposal"]["payload"] == {"order_id": ids["po1"]}


def test_po_approve_non_draft_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Approve purchase order PO-2")
    assert "proposal" not in body
    assert "isn't a draft" in body["answer"]


def test_po_missing_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Approve purchase order PO-999")
    assert "proposal" not in body
    assert "couldn't find a purchase order" in body["answer"]


def test_po_receive_en_remaining_quantities(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Receive purchase order PO-2")
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.receive"
    assert proposal["payload"]["order_id"] == ids["po2"]
    lines = {
        line["line_id"]: line["quantity"]
        for line in proposal["payload"]["receive"]["lines"]
    }
    # Cable: 10 ordered - 4 received = 6. Notebook: 5 - 0 = 5.
    # (Quantities canonicalize at the receive model's 3 decimal places.)
    assert lines == {
        ids["po2_cable_line"]: "6.000", ids["po2_notebook_line"]: "5.000",
    }
    assert proposal["payload"]["idempotency_key"]


def test_po_receive_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "استلم امر الشراء PO-2 بالكامل")
    assert body["proposal"]["action"] == "purchase_order.receive"
    assert body["proposal"]["payload"]["order_id"] == ids["po2"]


def test_po_receive_draft_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Receive purchase order PO-1")
    assert "proposal" not in body
    assert "must be approved first" in body["answer"]


def test_po_cancel_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Cancel purchase order PO-1")
    proposal = body["proposal"]
    assert proposal["action"] == "purchase_order.cancel"
    assert proposal["payload"] == {"order_id": ids["po1"]}


def test_po_cancel_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "الغي امر الشراء PO-1")
    assert body["proposal"]["action"] == "purchase_order.cancel"
    assert body["proposal"]["payload"] == {"order_id": ids["po1"]}


def test_po_cancel_approved_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Cancel purchase order PO-2")
    assert "proposal" not in body
    assert "isn't a draft" in body["answer"]


# --- sales returns + credit notes ------------------------------------------------

def test_return_approve_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Approve the return for invoice ISS-1")
    proposal = body["proposal"]
    assert proposal["action"] == "sales_return.approve"
    assert proposal["payload"] == {"return_id": ids["ret_draft"]}


def test_return_approve_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اعتمد مرتجع فاتوره ISS-1")
    assert body["proposal"]["action"] == "sales_return.approve"
    assert body["proposal"]["payload"] == {"return_id": ids["ret_draft"]}


def test_return_approve_without_reason_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Approve the return for invoice ISS-2")
    assert "proposal" not in body
    assert "no recorded reason" in body["answer"]


def test_return_approve_ambiguous_clarifies_then_date_resolves(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Approve the return for invoice ISS-3")
    assert "proposal" not in body
    assert "2026-11-20" in body["answer"] and "2026-11-22" in body["answer"]
    assert _proposal_count() == 0
    body = _ask(
        client, business_id, "Approve the return for invoice ISS-3 on 2026-11-22"
    )
    assert body["proposal"]["action"] == "sales_return.approve"
    assert body["proposal"]["payload"] == {"return_id": ids["ret_amb_2"]}


def test_return_approve_none_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Approve the return for invoice ISS-4")
    assert "proposal" not in body
    assert "no sales return" in body["answer"]


def test_credit_note_en_with_caveat(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Issue a credit note for invoice ISS-1")
    proposal = body["proposal"]
    assert proposal["action"] == "credit_note.issue"
    assert proposal["payload"] == {"return_id": ids["ret_approved"]}
    assert "does not reduce the debt" in body["answer"]


def test_credit_note_ar_with_caveat(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اصدر اشعار دائن لفاتوره ISS-1")
    assert body["proposal"]["action"] == "credit_note.issue"
    assert body["proposal"]["payload"] == {"return_id": ids["ret_approved"]}
    assert "لا يقلل الدين" in body["answer"]


def test_credit_note_already_issued_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Issue a credit note for invoice ISS-2")
    assert "proposal" not in body
    assert "already has a credit note" in body["answer"]


def test_credit_note_no_approved_return_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Issue a credit note for invoice ISS-3")
    assert "proposal" not in body
    assert "no approved return" in body["answer"]


# --- recurring schedules -----------------------------------------------------------

def test_recurring_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(
        client, business_id,
        "Create a recurring invoice for Layla Hassan every 30 days",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "recurring_invoice.create"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"]["customer_id"] == ids["layla"]
    assert proposal["payload"]["interval_days"] == 30
    assert proposal["payload"]["next_run_at"]


def test_recurring_en_with_start_date(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Create a recurring invoice for Layla Hassan every 7 days starting 2026-12-01",
    )
    proposal = body["proposal"]
    assert proposal["payload"]["interval_days"] == 7
    assert proposal["payload"]["next_run_at"].startswith("2026-12-01")


def test_recurring_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اعمل فاتوره دوريه لليلى حسن كل 30 يوم")
    proposal = body["proposal"]
    assert proposal["action"] == "recurring_invoice.create"
    assert proposal["payload"]["customer_id"] == ids["layla_ar"]
    assert proposal["payload"]["interval_days"] == 30


def test_recurring_ambiguous_customer_clarifies(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id, "Create a recurring invoice for Ahmed every 30 days"
    )
    assert "proposal" not in body
    assert "Ahmed Sami" in body["answer"] and "Ahmed Radwan" in body["answer"]
    assert _proposal_count() == 0


# --- pricing rules -------------------------------------------------------------------

def test_pricing_tax_en(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create a tax rule named VAT at 14%")
    proposal = body["proposal"]
    assert proposal["action"] == "pricing_rule.create"
    assert proposal["payload"] == {
        "name": "VAT", "rule_type": "tax", "rate": "14",
    }


def test_pricing_discount_en(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id, "Create a discount rule named Wholesale at 10 percent"
    )
    proposal = body["proposal"]
    assert proposal["payload"] == {
        "name": "Wholesale", "rule_type": "discount", "rate": "10",
    }


def test_pricing_ar(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "اعمل قاعده ضريبه اسمها القيمة المضافة 14%")
    proposal = body["proposal"]
    assert proposal["action"] == "pricing_rule.create"
    assert proposal["payload"]["name"] == "القيمة المضافة"
    assert proposal["payload"]["rule_type"] == "tax"
    assert proposal["payload"]["rate"] == "14"


# --- payroll ---------------------------------------------------------------------------

def test_payroll_create_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Create payroll for Omar Khalil for 2026-11")
    proposal = body["proposal"]
    assert proposal["action"] == "payroll.create"
    assert proposal["requires_second_approval"] is True
    assert proposal["payload"]["employee_id"] == ids["omar_khalil"]
    # 3A-920 step 2 (2026-11-27): the payroll schema gained the
    # optional trips / work-days units — a chat-built monthly payroll
    # carries them as None.
    assert proposal["payload"]["payroll"] == {
        "period": "2026-11", "allowances": "0", "bonuses": "0", "deductions": "0",
        "trips": None, "work_days": None,
    }


def test_payroll_create_en_with_components(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Create payroll for Omar Khalil for 2026-12 with allowances 500 and deductions 100",
    )
    payroll = body["proposal"]["payload"]["payroll"]
    assert payroll == {
        "period": "2026-12", "allowances": "500", "bonuses": "0",
        "deductions": "100", "trips": None, "work_days": None,
    }


def test_payroll_create_en_month_name(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id, "Create payroll for Omar Khalil for January 2027"
    )
    assert body["proposal"]["payload"]["payroll"]["period"] == "2027-01"


def test_payroll_create_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "جهز مرتب سارة محمود لشهر 2026-12")
    proposal = body["proposal"]
    assert proposal["action"] == "payroll.create"
    assert proposal["payload"]["employee_id"] == ids["sara"]
    assert proposal["payload"]["payroll"]["period"] == "2026-12"


def test_payroll_create_duplicate_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create payroll for Omar Khalil for 2026-10")
    assert "proposal" not in body
    assert "already exists" in body["answer"]


def test_payroll_create_ambiguous_employee_clarifies(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create payroll for Omar for 2026-11")
    assert "proposal" not in body
    assert "Omar Khalil" in body["answer"] and "Omar Adel" in body["answer"]
    assert _proposal_count() == 0


def test_payroll_create_missing_employee_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Create payroll for Ghost Person for 2026-11")
    assert "proposal" not in body
    assert "couldn't find an employee" in body["answer"]


def test_payroll_approve_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Approve payroll for Omar Khalil for 2026-10")
    proposal = body["proposal"]
    assert proposal["action"] == "payroll.approve"
    assert proposal["payload"] == {"payroll_id": ids["pay_oct"]}


def test_payroll_approve_ar(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "اعتمد مرتب سارة محمود لشهر 2026-11")
    assert body["proposal"]["action"] == "payroll.approve"
    assert body["proposal"]["payload"] == {"payroll_id": ids["pay_sara_nov"]}


def test_payroll_approve_wrong_status_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Approve payroll for Omar Khalil for 2026-09")
    assert "proposal" not in body
    assert "needs a draft record" in body["answer"]


def test_payroll_pay_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(client, business_id, "Pay payroll for Omar Khalil for 2026-09")
    proposal = body["proposal"]
    assert proposal["action"] == "payroll.pay"
    assert proposal["payload"] == {"payroll_id": ids["pay_sep"]}


def test_payroll_pay_ar(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "ادفع مرتب سارة محمود لشهر 2026-10")
    assert body["proposal"]["action"] == "payroll.pay"


def test_payroll_pay_draft_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Pay payroll for Omar Khalil for 2026-10")
    assert "proposal" not in body
    assert "needs an approved record" in body["answer"]


def test_payroll_missing_record_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "Approve payroll for Omar Khalil for 2026-07")
    assert "proposal" not in body
    assert "no payroll record" in body["answer"]


def test_payroll_update_en(intent_client, business):
    client, _s = intent_client
    business_id, ids = business
    body = _ask(
        client, business_id,
        "Update payroll for Omar Khalil for 2026-10: allowances 750",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "payroll.update"
    # The effective update carries all three components: the stated one
    # plus the record's current values for the rest (all 0.00 in seed).
    assert proposal["payload"] == {
        "payroll_id": ids["pay_oct"],
        "update": {"allowances": "750", "bonuses": "0.00", "deductions": "0.00"},
    }


def test_payroll_update_ar(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "عدل مرتب سارة محمود لشهر 2026-11 بدلات 300")
    proposal = body["proposal"]
    assert proposal["action"] == "payroll.update"
    assert proposal["payload"]["update"] == {
        "allowances": "300", "bonuses": "0.00", "deductions": "0.00",
    }


def test_payroll_update_proposal_executes_end_to_end(intent_client, business):
    """The filled effective update must survive approval + execution:
    a partial payload would canonicalize with null components, which
    update_payroll rejects — this test pins the executable shape."""
    client, subject = intent_client
    business_id, ids = business
    body = _ask(
        client, business_id,
        "Update payroll for Omar Khalil for 2026-10: allowances 750",
    )
    proposal_id = body["proposal"]["id"]
    subject["value"] = OWNER_B
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/proposals/{proposal_id}/approve",
        json={"payload_hash": body["proposal"]["payload_hash"]},
    )
    assert response.status_code == 200, response.text
    subject["value"] = OWNER_A
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/proposals/{proposal_id}/execute",
        json={},
    )
    assert response.status_code == 200, response.text
    with app.state.session_factory() as session:
        record = session.scalars(select(PayrollRecord).where(
            PayrollRecord.id == UUID(ids["pay_oct"]))).one()
        assert record.allowances == Decimal("750.00")
        assert record.net_pay == Decimal("8750.00")


def test_payroll_update_no_components_clarifies(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id, "Update payroll for Omar Khalil for 2026-10 please"
    )
    assert "proposal" not in body
    assert "What should change" in body["answer"]
    assert _proposal_count() == 0


def test_payroll_update_paid_is_honest(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Update payroll for Omar Khalil for 2026-08: allowances 100",
    )
    assert "proposal" not in body
    assert "already paid" in body["answer"]


# --- notifications -----------------------------------------------------------------------

def test_notification_en(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(
        client, business_id,
        "Send a notification: Stock alert — The cable stock is running low",
    )
    proposal = body["proposal"]
    assert proposal["action"] == "notification.create"
    assert proposal["requires_second_approval"] is True
    payload = proposal["payload"]
    assert payload["kind"] == "assistant"
    assert payload["title"] == "Stock alert"
    assert payload["body"] == "The cable stock is running low"
    assert payload["deduplication_key"].startswith("assistant-")
    assert payload["scheduled_at"] is None


def test_notification_ar(intent_client, business):
    client, _s = intent_client
    business_id, _ids = business
    body = _ask(client, business_id, "ابعت اشعار: تنبيه مخزون — الكابل قرب يخلص")
    proposal = body["proposal"]
    assert proposal["action"] == "notification.create"
    assert proposal["payload"]["title"] == "تنبيه مخزون"
    assert proposal["payload"]["body"] == "الكابل قرب يخلص"


# --- roles + provider -----------------------------------------------------------------------

def test_staff_owner_only_actions_get_owner_needed(intent_client, business):
    client, subject = intent_client
    business_id, _ids = business
    subject["value"] = STAFF_A
    for message in (
        "Issue invoice DFT-1",
        "Approve purchase order PO-1",
        "Create payroll for Omar Khalil for 2027-01",
        "Send a notification: Hi — There",
    ):
        body = _ask(client, business_id, message)
        assert "proposal" not in body, message
        assert "owner-only" in body["answer"], message
    assert _proposal_count() == 0


def test_provider_never_called_for_intents3(intent_client, business, monkeypatch):
    client, _s = intent_client
    business_id, _ids = business
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-that-must-not-be-used")

    async def _exploding_provider(*args, **kwargs):
        raise AssertionError("provider must not be called for a deterministic intent")

    monkeypatch.setattr(assistant_api, "_provider_post", _exploding_provider)
    body = _ask(client, business_id, "Issue invoice DFT-1")
    assert body["proposal"]["action"] == "invoice.issue"
    body = _ask(client, business_id, "Approve purchase order PO-1")
    assert body["proposal"]["action"] == "purchase_order.approve"
