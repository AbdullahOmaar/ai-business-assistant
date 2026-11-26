"""§٩ inventory coverage (FULL-PLAN §١٢, phase ق).

The capability inventory is enumerated from the policy module itself
(``ASSISTANT_WRITABLE`` + ``NEEDS_SECOND_APPROVAL``) — never from a
hand-copied list. Every action in the inventory must be accounted for
in exactly one of two ways:

(a) ``PHRASINGS``: a canonical chat phrasing produces a proposal draft
    with that action through the real chat endpoint, or
(b) ``EXECUTION_LAYER_ONLY``: an explicit disposition with a written
    reason — the action is covered by the Slice 1 execution layer
    (proposal creatable app-side, policy-gated, dispatched in the
    caller's role) but deliberately has no chat producer here.

If a future change adds an action to the policy without a producer or
a disposition, ``test_inventory_is_fully_accounted_for`` FAILS — that
is the purpose of this file. Forbidden-by-design families (final
deletes, role/membership changes, treasury writes, supplier/product
updates, payment/expense edits) must stay proposal-free.
"""
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.assistant_write_policy import ASSISTANT_WRITABLE, NEEDS_SECOND_APPROVAL
from app.main import app
from app.models import (
    AssistantProposal,
    Base,
    Customer,
    Employee,
    Invoice,
    InvoiceLine,
    PayrollRecord,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    SalesReturn,
    Supplier,
)
from app.security import AuthenticatedPrincipal

OWNER = "coverage-owner"

# Canonical phrasing per action — one per action, driven through the
# real chat endpoint against the seeded business below.
PHRASINGS: dict[str, str] = {
    # Slice 3 (merged, PR #489).
    "customer.create": "Add a customer named Nour Adel",
    "supplier.create": "Add a supplier named Delta Supplies",
    "product.create": "Add a product named Mouse for 150",
    "invoice.create": "Create invoice DFT-9 for Layla Hassan with 2 Cable at 250",
    "expense.create": "Record an expense of 200 for office rent",
    "payment.record": "Record a payment of 50 on invoice ISS-1",
    "stock.movement": "Add 5 Cable to stock",
    # ق-3 (this batch).
    "invoice.issue": "Issue invoice DFT-1",
    "invoice.void": "Void invoice ISS-1",
    "purchase_order.approve": "Approve purchase order PO-1",
    "purchase_order.receive": "Receive purchase order PO-2",
    "purchase_order.cancel": "Cancel purchase order PO-1",
    "sales_return.approve": "Approve the return for invoice ISS-1",
    "credit_note.issue": "Issue a credit note for invoice ISS-1",
    "recurring_invoice.create": (
        "Create a recurring invoice for Layla Hassan every 30 days"
    ),
    "pricing_rule.create": "Create a tax rule named VAT at 14%",
    "payroll.create": "Create payroll for Omar Khalil for 2026-11",
    "payroll.approve": "Approve payroll for Omar Khalil for 2026-10",
    "payroll.pay": "Pay payroll for Omar Khalil for 2026-09",
    "payroll.update": "Update payroll for Omar Khalil for 2026-10: allowances 750",
    "notification.create": (
        "Send a notification: Stock alert — The cable stock is running low"
    ),
    # ق-2 (merged, PR #495) — moved here from EXECUTION_LAYER_ONLY when
    # ق-2 landed on main (coordinator update at the ق-3 rebase).
    "customer.update": "Update customer Layla Hassan's phone to 01001234567",
    "invoice.duplicate": "Duplicate invoice ISS-1",
    "invoice.update_draft": "Edit draft invoice DFT-1: Cable quantity to 5",
    "purchase_order.create": (
        "Create purchase order PO-100 from supplier Nile Trading: 3 Cable at 250"
    ),
    "purchase_order.duplicate": "Duplicate purchase order PO-2",
    "sales_return.create": "Create a sales return for invoice ISS-1: 1 Cable",
}

# Actions with NO chat producer, each with its written reason. The
# Slice 1 execution layer covers all of them app-side.
EXECUTION_LAYER_ONLY: dict[str, str] = {
    "invoice.update": (
        "No chat producer by design: an honest full-replacement payload "
        "needs the draft-edit clause grammar delivered for "
        "invoice.update_draft in ق-2, and for issued invoices Slice 1's "
        "dispatch fails closed with an honest execution_note because "
        "only a draft edit route exists. The proposal remains creatable "
        "app-side and policy-gated."
    ),
    "data_import.create": (
        "No chat producer by design: the payload is an uploaded CSV "
        "file (csv_text, up to 2,000,000 chars) — there is no honest "
        "text-only build. Covered by the Slice 1 execution layer from "
        "the app's import screen."
    ),
}

# Forbidden-by-design families: a representative phrasing each. None
# may ever produce a proposal.
FORBIDDEN_PHRASINGS: tuple[str, ...] = (
    "Delete invoice ISS-1",                      # final delete
    "Delete customer Layla Hassan",               # final delete
    "Make Layla Hassan an admin",                 # role / membership change
    "Move 1000 EGP to the cashbox",               # treasury write
    "Rename supplier Nile Trading to Nile Co",    # supplier.update
    "Change the price of Cable to 300",           # product.update
    "Edit the payment for invoice ISS-1",         # payment edit
    "Delete the expense for office rent",         # expense delete
)


@pytest.fixture()
def coverage_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(OWNER)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = TestClient(app)
    try:
        yield client
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
def business(coverage_client):
    client = coverage_client
    response = client.post(
        "/api/v1/businesses", json={"name": "Coverage Shop", "currency_code": "EGP"}
    )
    assert response.status_code == 201
    business_id = response.json()["id"]
    biz = UUID(business_id)
    with app.state.session_factory() as session:
        layla = Customer(business_id=biz, name="Layla Hassan")
        supplier = Supplier(business_id=biz, name="Nile Trading")
        cable = Product(business_id=biz, name="Cable", unit_price=Decimal("250.00"), is_stock_tracked=True)
        session.add_all([layla, supplier, cable])
        session.flush()

        def _invoice(number, status):
            return Invoice(
                business_id=biz, customer_id=layla.id, invoice_number=number,
                status=status, currency_code="EGP", subtotal=Decimal("100.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"),
                total=Decimal("100.00"),
                issue_date=(
                    datetime(2026, 11, 1, tzinfo=UTC) if status == "issued" else None
                ),
            )

        dft1 = _invoice("DFT-1", "draft")
        iss1 = _invoice("ISS-1", "issued")
        session.add_all([dft1, iss1])
        session.flush()
        # Lines so the ق-2 producers have something honest to work on:
        # duplicate / sales-return need an issued line; update_draft
        # edits the draft's Cable line. Totals follow the lines.
        dft1.subtotal = dft1.total = Decimal("250.00")
        iss1.subtotal = iss1.total = Decimal("500.00")
        session.add_all([
            InvoiceLine(
                business_id=biz, invoice_id=dft1.id, product_id=cable.id,
                description="Cable", quantity=Decimal("1"),
                unit_price=Decimal("250.00"), line_total=Decimal("250.00"),
            ),
            InvoiceLine(
                business_id=biz, invoice_id=iss1.id, product_id=cable.id,
                description="Cable", quantity=Decimal("2"),
                unit_price=Decimal("250.00"), line_total=Decimal("500.00"),
            ),
        ])
        session.flush()
        session.add_all([
            SalesReturn(
                business_id=biz, invoice_id=iss1.id, status="draft",
                reason="Damaged goods", total=Decimal("40.00"),
            ),
            SalesReturn(
                business_id=biz, invoice_id=iss1.id, status="approved",
                reason="Wrong item", total=Decimal("25.00"),
            ),
        ])
        po1 = PurchaseOrder(
            business_id=biz, supplier_id=supplier.id, order_number="PO-1",
            status="draft", currency_code="EGP", total=Decimal("750.00"),
        )
        po2 = PurchaseOrder(
            business_id=biz, supplier_id=supplier.id, order_number="PO-2",
            status="approved", currency_code="EGP", total=Decimal("750.00"),
        )
        session.add_all([po1, po2])
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=biz, purchase_order_id=po2.id, product_id=cable.id,
            quantity=Decimal("3"), unit_cost=Decimal("250.00"),
            received_quantity=Decimal("0"),
        ))
        omar = Employee(
            business_id=biz, name="Omar Khalil", monthly_salary=Decimal("8000.00"),
        )
        session.add(omar)
        session.flush()
        for period, status in (("2026-10", "draft"), ("2026-09", "approved")):
            session.add(PayrollRecord(
                business_id=biz, employee_id=omar.id, period=period,
                base_salary=Decimal("8000.00"), allowances=Decimal("0.00"),
                bonuses=Decimal("0.00"), deductions=Decimal("0.00"),
                net_pay=Decimal("8000.00"), status=status,
                created_by_subject=OWNER,
            ))
        session.commit()
    return business_id


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


def test_inventory_is_fully_accounted_for():
    inventory = (
        {entry.action for entry in ASSISTANT_WRITABLE}
        | {entry.action for entry in NEEDS_SECOND_APPROVAL}
    )
    assert inventory, "policy inventory must not be empty"
    assert not (set(PHRASINGS) & set(EXECUTION_LAYER_ONLY)), (
        "an action is both phrased and dispositioned"
    )
    assert set(PHRASINGS) | set(EXECUTION_LAYER_ONLY) == inventory, (
        "every policy action needs a chat producer (PHRASINGS) or an "
        "explicit disposition (EXECUTION_LAYER_ONLY)"
    )
    for action, reason in EXECUTION_LAYER_ONLY.items():
        assert len(reason.strip()) >= 40, f"{action}: disposition reason too thin"


@pytest.mark.parametrize("action", sorted(PHRASINGS))
def test_phrasing_produces_proposal(coverage_client, business, action):
    body = _ask(coverage_client, business, PHRASINGS[action])
    assert "proposal" in body, f"{action}: {body.get('answer')}"
    assert body["proposal"]["action"] == action


@pytest.mark.parametrize("message", FORBIDDEN_PHRASINGS)
def test_forbidden_families_stay_proposal_free(coverage_client, business, message):
    body = _ask(coverage_client, business, message)
    assert "proposal" not in body, message
    assert _proposal_count() == 0, message
