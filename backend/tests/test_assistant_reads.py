"""Phase ق-1: deterministic READ/REPORT tools (assistant_reads).

Every figure below is hand-computed from the seed and asserted
exactly. The seed business ("Reads Test Shop", EGP, Africa/Cairo)
is pinned to NOW = 2026-06-15 10:00 UTC (12:00 Cairo):

Invoices (issued unless noted):
- INV-1 Ahmed Sami, 1000 EGP (tax 140), issued Jun 10, due Jun 5
  (10 days overdue), 400 paid via TRX-1 -> outstanding 600.
- INV-2 Ahmed Sami, 500 EGP, issued May 1, due Apr 20 (56 days
  overdue), unpaid -> outstanding 500.
- INV-3 Mona Adel, 2000 EGP (tax 280), issued Jun 14, due Jul 1,
  fully paid via TRX-2 -> outstanding 0.
- INV-4 Mona Adel, 300 USD, issued Jun 1, due May 10 (36 days
  overdue), unpaid -> outstanding 300 USD.
- INV-5 draft 999 EGP (excluded everywhere).
- INV-6 Ahmed Sami, 700 EGP, issued May 20, due Jun 20 (not due),
  unpaid -> outstanding 700.

Derived expectations:
- Outstanding: EGP 1800 (600+500+700), USD 300; 4 open invoices.
  Overdue: EGP 1100, USD 300. Buckets: not-due EGP 700;
  1-30 EGP 600; 31-60 EGP 500 + USD 300.
- Paid ratio: EGP paid 2400 of 4200 = 57.1%; USD 0 of 300 = 0.0%.
- Sales compare: June EGP 3000 / USD 300 (3 invoices) vs May
  EGP 1200 (2 invoices) -> EGP +150.0%, USD has no previous sales.
- Sales June: EGP 3000 + USD 300 from 3 invoices; approved returns
  250 EGP shown separately, never netted.
- Ahmed's statement: issued 2200, paid 400, outstanding 1800,
  3 open invoices; credit note CN-2 of 150 EGP NOT deducted.
- Collections: today 2000 EGP (1 payment); June 2400 EGP (2).
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import assistant_api
from app.assistant_reads import answer_read_question
from app.main import app
from app.models import (
    AuditEvent,
    Base,
    Business,
    BusinessMembership,
    CashboxEntry,
    CreditNote,
    Customer,
    Employee,
    Expense,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Notification,
    Payment,
    PaymentAllocation,
    PayrollRecord,
    Product,
    PurchaseOrder,
    RecurringInvoiceSchedule,
    SalesReturn,
    StockMovement,
    Supplier,
)
from app.security import AuthenticatedPrincipal

OWNER = "reads-owner"
STAFF = "reads-staff"
NOW = datetime(2026, 6, 15, 10, 0, tzinfo=UTC)


def _dt(month: int, day: int, hour: int = 10) -> datetime:
    return datetime(2026, month, day, hour, 0, tzinfo=UTC)


@pytest.fixture()
def reads_client(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": OWNER}
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


def _make_business(client, name: str) -> UUID:
    response = client.post(
        "/api/v1/businesses", json={"name": name, "currency_code": "EGP"}
    )
    assert response.status_code == 201, response.text
    business_id = UUID(response.json()["id"])
    with app.state.session_factory() as session:
        business = session.get(Business, business_id)
        business.timezone = "Africa/Cairo"
        session.commit()
    return business_id


@pytest.fixture()
def seeded(reads_client):
    client, _subject = reads_client
    business_id = _make_business(client, "Reads Test Shop")
    with app.state.session_factory() as session:
        ahmed = Customer(business_id=business_id, name="Ahmed Sami", phone="0100")
        mona = Customer(business_id=business_id, name="Mona Adel", phone="0101")
        omar_a = Customer(business_id=business_id, name="Omar Adel")
        omar_s = Customer(business_id=business_id, name="Omar Samy")
        session.add_all([ahmed, mona, omar_a, omar_s])
        session.flush()

        def invoice(number, customer, *, status, total, tax="0", currency="EGP",
                    issue=None, due=None):
            row = Invoice(
                business_id=business_id,
                customer_id=customer.id if customer is not None else None,
                invoice_number=number, status=status, currency_code=currency,
                subtotal=Decimal(str(total)), tax_total=Decimal(tax),
                discount_total=Decimal("0"), total=Decimal(str(total)),
                issue_date=issue, due_date=due,
            )
            session.add(row)
            session.flush()
            return row

        inv1 = invoice("INV-1", ahmed, status="issued", total="1000", tax="140",
                       issue=_dt(6, 10), due=_dt(6, 5))
        session.add(InvoiceLine(
            business_id=business_id, invoice_id=inv1.id,
            description="Consulting hours", quantity=Decimal("2"),
            unit_price=Decimal("500"), line_total=Decimal("1000"),
        ))
        inv2 = invoice("INV-2", ahmed, status="issued", total="500",
                       issue=_dt(5, 1), due=_dt(4, 20))
        inv3 = invoice("INV-3", mona, status="issued", total="2000", tax="280",
                       issue=_dt(6, 14), due=_dt(7, 1))
        inv4 = invoice("INV-4", mona, status="issued", total="300", currency="USD",
                       issue=_dt(6, 1), due=_dt(5, 10))
        invoice("INV-5", ahmed, status="draft", total="999", issue=_dt(6, 12))
        inv6 = invoice("INV-6", ahmed, status="issued", total="700",
                       issue=_dt(5, 20), due=_dt(6, 20))

        p1 = Payment(
            business_id=business_id, customer_id=ahmed.id, amount=Decimal("400"),
            currency_code="EGP", received_at=_dt(6, 12), method="cash",
            reference="TRX-1", idempotency_key="reads-p1",
        )
        p2 = Payment(
            business_id=business_id, customer_id=mona.id, amount=Decimal("2000"),
            currency_code="EGP", received_at=_dt(6, 15, 7), method="cash",
            reference="TRX-2", idempotency_key="reads-p2",
        )
        session.add_all([p1, p2])
        session.flush()
        session.add_all([
            PaymentAllocation(business_id=business_id, payment_id=p1.id,
                              invoice_id=inv1.id, amount=Decimal("400")),
            PaymentAllocation(business_id=business_id, payment_id=p2.id,
                              invoice_id=inv3.id, amount=Decimal("2000")),
        ])

        nile = Supplier(business_id=business_id, name="Nile Supplies")
        delta = Supplier(business_id=business_id, name="Delta Parts")
        session.add_all([nile, delta])
        session.flush()
        session.add_all([
            PurchaseOrder(business_id=business_id, supplier_id=nile.id,
                          order_number="PO-1", status="approved",
                          currency_code="EGP", total=Decimal("5000")),
            PurchaseOrder(business_id=business_id, supplier_id=nile.id,
                          order_number="PO-2", status="received",
                          currency_code="EGP", total=Decimal("2500")),
            PurchaseOrder(business_id=business_id, supplier_id=nile.id,
                          order_number="PO-3", status="draft",
                          currency_code="EGP", total=Decimal("1000")),
            PurchaseOrder(business_id=business_id, supplier_id=delta.id,
                          order_number="PO-4", status="received",
                          currency_code="EGP", total=Decimal("800")),
        ])

        cable = Product(business_id=business_id, name="Cable HDMI",
                        unit_price=Decimal("150"), is_stock_tracked=True)
        mouse = Product(business_id=business_id, name="Mouse",
                        unit_price=Decimal("250"), is_stock_tracked=True)
        keyboard = Product(business_id=business_id, name="Keyboard",
                           unit_price=Decimal("700"), is_stock_tracked=True)
        service = Product(business_id=business_id, name="Support Service",
                          unit_price=Decimal("1000"), is_stock_tracked=False)
        session.add_all([cable, mouse, keyboard, service])
        session.flush()

        def movement(product, kind, delta_value, when):
            session.add(StockMovement(
                business_id=business_id, product_id=product.id,
                movement_type=kind, quantity_delta=Decimal(str(delta_value)),
                created_at=when,
            ))

        movement(cable, "opening", "100", _dt(6, 1))
        movement(cable, "sale", "-30", _dt(6, 10))
        movement(cable, "sale", "-10", _dt(6, 14))
        movement(mouse, "opening", "5", _dt(6, 1))
        movement(keyboard, "opening", "50", _dt(6, 1))

        session.add_all([
            CashboxEntry(business_id=business_id, kind="opening",
                         amount=Decimal("1000"), currency_code="EGP",
                         reason="Opening", recorded_by=OWNER, created_at=_dt(6, 1)),
            CashboxEntry(business_id=business_id, kind="deposit",
                         amount=Decimal("500"), currency_code="EGP",
                         reason="Daily takings", recorded_by=OWNER, created_at=_dt(6, 15, 8)),
            CashboxEntry(business_id=business_id, kind="withdrawal",
                         amount=Decimal("200"), currency_code="EGP",
                         reason="Supplies", recorded_by=OWNER, created_at=_dt(6, 15, 9)),
        ])

        session.add_all([
            Expense(business_id=business_id, category="rent", description="June rent",
                    amount=Decimal("3000"), currency_code="EGP", incurred_at=_dt(6, 5)),
            Expense(business_id=business_id, category="transport", description="Delivery",
                    amount=Decimal("200"), currency_code="EGP", incurred_at=_dt(6, 14)),
            Expense(business_id=business_id, category="transport", description="May delivery",
                    amount=Decimal("100"), currency_code="EGP", incurred_at=_dt(5, 20)),
        ])

        e1 = Employee(business_id=business_id, name="Sara Adel",
                      monthly_salary=Decimal("8000"))
        e2 = Employee(business_id=business_id, name="Khaled Samy",
                      monthly_salary=Decimal("7500"))
        session.add_all([e1, e2])
        session.flush()
        session.add_all([
            PayrollRecord(business_id=business_id, employee_id=e1.id, period="2026-05",
                          base_salary=Decimal("8000"), net_pay=Decimal("8000"),
                          status="approved", created_by_subject=OWNER),
            PayrollRecord(business_id=business_id, employee_id=e2.id, period="2026-05",
                          base_salary=Decimal("7500"), net_pay=Decimal("7500"),
                          status="paid", created_by_subject=OWNER),
        ])

        sr1 = SalesReturn(business_id=business_id, invoice_id=inv3.id,
                          status="approved", total=Decimal("250"), created_at=_dt(6, 10))
        sr2 = SalesReturn(business_id=business_id, invoice_id=inv1.id,
                          status="draft", total=Decimal("100"), created_at=_dt(6, 11))
        session.add_all([sr1, sr2])
        session.flush()
        session.add_all([
            CreditNote(business_id=business_id, sales_return_id=sr1.id,
                       invoice_id=inv3.id, customer_id=mona.id,
                       credit_note_number="CN-1", currency_code="EGP",
                       total=Decimal("250"), created_by_subject=OWNER),
            CreditNote(business_id=business_id, sales_return_id=sr2.id,
                       invoice_id=inv2.id, customer_id=ahmed.id,
                       credit_note_number="CN-2", currency_code="EGP",
                       total=Decimal("150"), created_by_subject=OWNER),
        ])

        session.add_all([
            RecurringInvoiceSchedule(
                business_id=business_id, customer_id=mona.id, interval_days=30,
                next_run_at=_dt(6, 16, 8), is_active=True,
            ),
            RecurringInvoiceSchedule(
                business_id=business_id, customer_id=ahmed.id, interval_days=7,
                next_run_at=_dt(6, 10, 8), is_active=False,
            ),
        ])

        session.add_all([
            Notification(business_id=business_id, kind="invoice_reminder",
                         title="Invoice INV-1 reminder", body="Reminder",
                         status="pending", deduplication_key="reads-n1"),
            Notification(business_id=business_id, kind="low_stock",
                         title="Low stock alert", body="Mouse is low",
                         status="pending", deduplication_key="reads-n2"),
            Notification(business_id=business_id, kind="report",
                         title="Weekly report", body="Report",
                         status="sent", deduplication_key="reads-n3"),
        ])

        session.add_all([
            AuditEvent(business_id=business_id, actor_subject="owner@example.com",
                       action="invoice.created", target_type="invoice",
                       target_id="inv-1", change_summary="Invoice created",
                       created_at=_dt(6, 14, 9)),
            AuditEvent(business_id=business_id, actor_subject="owner@example.com",
                       action="expense.recorded", target_type="expense",
                       target_id="exp-1", change_summary="Expense recorded",
                       created_at=_dt(6, 15, 8)),
        ])
        session.commit()
    return business_id


def _ask_module(business_id, message, *, role=MembershipRole.OWNER):
    with app.state.session_factory() as session:
        return answer_read_question(
            session,
            business_id=business_id,
            message=message,
            role=role,
            business_currency="EGP",
            now=NOW,
        )


# ---------------------------------------------------------------------------
# §٩.١ Invoices.
# ---------------------------------------------------------------------------


def test_invoice_detail_by_number(seeded):
    result = _ask_module(seeded, "Show me invoice INV-1")
    assert result is not None
    assert "INV-1" in result.answer
    assert "1,000.00" not in result.answer  # money renders without separators
    assert "1000.00 EGP" in result.answer
    assert "600.00" in result.answer  # outstanding after the 400 payment
    assert "Consulting hours" in result.answer
    assert any(source.get("invoice_number") == "INV-1" for source in result.sources)


def test_invoice_detail_missing_number_is_honest(seeded):
    result = _ask_module(seeded, "Show me invoice INV-99")
    assert result is not None
    assert "INV-99" in result.answer
    assert "can't find" in result.answer


def test_outstanding_and_overdue_with_aging(seeded):
    result = _ask_module(seeded, "What invoices are overdue?")
    assert result is not None
    assert "1800.00 EGP" in result.answer  # total open
    assert "300.00 USD" in result.answer
    assert "1100.00 EGP" in result.answer  # overdue subset
    assert "700.00 EGP" in result.answer  # not-due bucket (INV-6)
    assert "600.00 EGP" in result.answer  # 1-30 bucket (INV-1)
    assert "500.00 EGP" in result.answer  # 31-60 bucket (INV-2)
    assert "INV-1" in result.answer and "INV-2" in result.answer


def test_outstanding_arabic_flagship_question(seeded):
    result = _ask_module(seeded, "مين عليه فلوس متأخرة؟")
    assert result is not None
    assert "1800.00" in result.answer
    assert "1100.00" in result.answer


def test_paid_ratio(seeded):
    result = _ask_module(seeded, "What is the collection rate?")
    assert result is not None
    assert "2400.00" in result.answer
    assert "4200.00" in result.answer
    assert "57.1%" in result.answer or "57.1٪" in result.answer
    assert "0.0" in result.answer  # USD ratio


def test_sales_period_comparison(seeded):
    result = _ask_module(seeded, "Compare sales this month vs last month")
    assert result is not None
    assert "3000.00" in result.answer
    assert "1200.00" in result.answer
    assert "+150.0" in result.answer
    assert "no sales in this currency last month" in result.answer  # USD


def test_sales_summary_this_month_with_returns_shown_separately(seeded):
    result = _ask_module(seeded, "What are my sales this month?")
    assert result is not None
    assert "3000.00 EGP" in result.answer
    assert "300.00 USD" in result.answer
    assert "250.00" in result.answer  # approved returns, not netted
    assert "never netted" in result.answer


# ---------------------------------------------------------------------------
# §٩.٢ Customers / suppliers.
# ---------------------------------------------------------------------------


def test_customer_statement_with_credit_note_caveat(seeded):
    result = _ask_module(seeded, "What is the statement of Ahmed Sami?")
    assert result is not None
    assert "2200.00" in result.answer  # issued
    assert "400.00" in result.answer  # paid
    assert "1800.00" in result.answer  # outstanding — CN-2's 150 NOT deducted
    assert "150.00" in result.answer  # credit note mentioned separately
    assert "never reduce" in result.answer  # standing caveat


def test_customer_statement_arabic(seeded):
    result = _ask_module(seeded, "كشف حساب أحمد سامي")
    # The Arabic name is not seeded; the seeded name is "Ahmed Sami".
    # The honest miss must not invent figures.
    assert result is not None
    assert "2200.00" not in result.answer


def test_customer_statement_ambiguous_name_clarifies(seeded):
    result = _ask_module(seeded, "What is the balance of Omar?")
    assert result is not None
    assert "Omar Adel" in result.answer
    assert "Omar Samy" in result.answer
    assert "Which one" in result.answer


def test_customer_search(seeded):
    result = _ask_module(seeded, "Search for customer Mona")
    assert result is not None
    assert "Mona Adel" in result.answer
    assert "300.00 USD" in result.answer  # her open USD balance


def test_supplier_purchases_named(seeded):
    result = _ask_module(seeded, "What are the purchases from Nile Supplies?")
    assert result is not None
    assert "8500.00" in result.answer
    assert "3 purchase orders" in result.answer


def test_supplier_purchases_generic(seeded):
    result = _ask_module(seeded, "Give me the supplier purchases report")
    assert result is not None
    assert "Nile Supplies" in result.answer
    assert "Delta Parts" in result.answer


# ---------------------------------------------------------------------------
# §٩.٣ Products / stock.
# ---------------------------------------------------------------------------


def test_low_stock_states_threshold(seeded):
    result = _ask_module(seeded, "Which products are low stock?")
    assert result is not None
    assert "(10)" in result.answer  # the threshold is stated
    assert "Mouse" in result.answer
    assert "Keyboard" not in result.answer


def test_product_stock_with_coverage_days(seeded):
    result = _ask_module(seeded, "What is the stock of Cable HDMI?")
    assert result is not None
    assert "60 units" in result.answer
    assert "45.0 days" in result.answer  # 60 / (40 sold / 30 days)
    assert "sale" in result.answer  # movement history present


def test_product_stock_untracked_is_honest(seeded):
    result = _ask_module(seeded, "What is the stock of Support Service?")
    assert result is not None
    assert "not stock-tracked" in result.answer


# ---------------------------------------------------------------------------
# §٩.٤–§٩.٦ Purchases, payments/expenses, treasury.
# ---------------------------------------------------------------------------


def test_purchase_order_status_summary(seeded):
    result = _ask_module(seeded, "Show me the purchase orders status")
    assert result is not None
    assert "4 orders" in result.answer
    assert "9300.00" in result.answer
    assert "PO-1" in result.answer


def test_collections_today_and_month(seeded):
    today = _ask_module(seeded, "How much did we collect today?")
    assert today is not None
    assert "2000.00 EGP" in today.answer
    assert "1 payments" in today.answer or "1 payment" in today.answer
    month = _ask_module(seeded, "How much did we collect this month?")
    assert month is not None
    assert "2400.00 EGP" in month.answer
    assert "2 payments" in month.answer


def test_payment_allocations_by_reference(seeded):
    result = _ask_module(seeded, "Show the allocations of payment TRX-1")
    assert result is not None
    assert "INV-1" in result.answer
    assert "400.00" in result.answer


def test_expense_summary_by_category(seeded):
    result = _ask_module(seeded, "Summarize expenses this month by category")
    assert result is not None
    assert "3200.00 EGP" in result.answer
    assert "rent" in result.answer
    assert "3000.00" in result.answer
    assert "200.00" in result.answer  # June transport only; May's 100 excluded


def test_treasury_balance_and_today_movements(seeded):
    result = _ask_module(seeded, "What is the cashbox balance?")
    assert result is not None
    assert "1300.00 EGP" in result.answer
    assert "500.00" in result.answer  # in today
    assert "200.00" in result.answer  # out today
    assert "not a bank balance" in result.answer


def test_treasury_arabic(seeded):
    result = _ask_module(seeded, "رصيد الخزنة كام؟")
    assert result is not None
    assert "1300.00" in result.answer


# ---------------------------------------------------------------------------
# §٩.٧–§٩.٩ Payroll (owner-only), returns, reports.
# ---------------------------------------------------------------------------


def test_payroll_report_owner(seeded):
    result = _ask_module(seeded, "Show me the payroll report")
    assert result is not None
    assert "2026-05" in result.answer
    assert "15500.00" in result.answer
    assert "approved: 1" in result.answer
    assert "paid: 1" in result.answer


def test_payroll_report_staff_is_refused(seeded):
    result = _ask_module(seeded, "Show me the payroll report",
                         role=MembershipRole.STAFF)
    assert result is not None
    assert "owner-only" in result.answer
    assert "15500.00" not in result.answer  # no figures leak to staff


def test_returns_status_with_caveat(seeded):
    result = _ask_module(seeded, "What is the status of sales returns?")
    assert result is not None
    assert "approved: 1" in result.answer
    assert "draft: 1" in result.answer
    assert "250.00" in result.answer  # approved returns total
    assert "400.00" in result.answer  # credit notes 250 + 150
    assert "never reduce" in result.answer


def test_recurring_status_states_worker_caveat(seeded):
    result = _ask_module(seeded, "Show the recurring invoices")
    assert result is not None
    assert "1 active" in result.answer
    assert "1 paused" in result.answer
    assert "scheduler" in result.answer
    assert "not deployed" in result.answer


def test_notifications_queue_status(seeded):
    result = _ask_module(seeded, "Show my notifications")
    assert result is not None
    assert "pending: 2" in result.answer
    assert "sent: 1" in result.answer
    assert "stored queue only" in result.answer


def test_operating_result_with_cogs_caveat(seeded):
    result = _ask_module(seeded, "What is the operating result this month?")
    assert result is not None
    assert "3000.00" in result.answer  # revenue EGP
    assert "3200.00" in result.answer  # expenses EGP
    assert "-200.00" in result.answer  # result EGP
    assert "before cost of goods sold" in result.answer  # standing caveat
    assert "250.00" in result.answer  # returns shown separately


def test_tax_summary_with_return_caveat(seeded):
    result = _ask_module(seeded, "Give me the tax summary for this month")
    assert result is not None
    assert "420.00" in result.answer  # 140 + 280
    assert "does not replace the official tax return" in result.answer


def test_audit_query_owner(seeded):
    result = _ask_module(seeded, "Show me the audit log")
    assert result is not None
    assert "invoice.created" in result.answer  # stored code, shown verbatim
    assert "expense.recorded" in result.answer
    assert "Latest 2 of 2" in result.answer


def test_audit_query_staff_is_refused(seeded):
    result = _ask_module(seeded, "Show me the audit log",
                         role=MembershipRole.STAFF)
    assert result is not None
    assert "owner-only" in result.answer
    assert "invoice.created" not in result.answer


def test_integrity_clean_business(seeded):
    result = _ask_module(seeded, "Run a data integrity check")
    assert result is not None
    assert "no known inconsistencies" in result.answer


def test_system_status_summary(seeded):
    result = _ask_module(seeded, "What is the system status?")
    assert result is not None
    assert "database connected" in result.answer
    assert "not configured" in result.answer  # no provider key in tests


# ---------------------------------------------------------------------------
# Honesty: empty data, and the currency-mismatch integrity case.
# ---------------------------------------------------------------------------


def test_empty_business_answers_are_honest(reads_client):
    client, _subject = reads_client
    business_id = _make_business(client, "Empty Shop")
    overdue = _ask_module(business_id, "What invoices are overdue?")
    assert overdue is not None
    assert "No open receivables" in overdue.answer
    payroll = _ask_module(business_id, "Show me the payroll report")
    assert payroll is not None
    assert "No payroll records" in payroll.answer
    treasury = _ask_module(business_id, "رصيد الخزنة كام؟")
    assert treasury is not None
    assert "مفيش فيها حركات" in treasury.answer
    unmatched = _ask_module(business_id, "What is the meaning of this report?")
    assert unmatched is None  # falls through to the existing flow


def test_integrity_reports_mismatch_and_unlinked(reads_client):
    client, _subject = reads_client
    business_id = _make_business(client, "Mismatch Shop")
    with app.state.session_factory() as session:
        invoice = Invoice(
            business_id=business_id, customer_id=None,
            invoice_number="MIS-1", status="issued", currency_code="EGP",
            subtotal=Decimal("100"), tax_total=Decimal("0"),
            discount_total=Decimal("0"), total=Decimal("100"),
            issue_date=_dt(6, 10), due_date=_dt(6, 20),
        )
        session.add(invoice)
        session.flush()
        payment = Payment(
            business_id=business_id, customer_id=None, amount=Decimal("25"),
            currency_code="USD", received_at=_dt(6, 11), method="cash",
            reference="MIS-P1", idempotency_key="reads-mis-p1",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=payment.id,
            invoice_id=invoice.id, amount=Decimal("25"),
        ))
        session.commit()
    result = _ask_module(business_id, "Run a data integrity check")
    assert result is not None
    assert "1 issued invoices with no linked customer" in result.answer
    assert "1 payment allocations in a different currency" in result.answer
    assert "never repairs" in result.answer
    # The mismatched allocation never reduces the balance (aging rule).
    outstanding = _ask_module(business_id, "What is outstanding?")
    assert outstanding is not None
    assert "100.00 EGP" in outstanding.answer


# ---------------------------------------------------------------------------
# Wiring: the chat endpoint serves reads on the question path, never
# calls the provider for them, and leaves unmatched questions to the
# existing flow.
# ---------------------------------------------------------------------------


def _ask_chat(client, business_id, message):
    response = client.post(
        f"/api/v1/businesses/{business_id}/assistant/chat",
        json={"message": message},
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture()
def chat_business(reads_client):
    client, subject = reads_client
    business_id = _make_business(client, "Reads Chat Shop")
    now = datetime.now(UTC)
    with app.state.session_factory() as session:
        session.add(BusinessMembership(
            business_id=business_id, user_subject=STAFF, role=MembershipRole.STAFF,
        ))
        session.add_all([
            Customer(business_id=business_id, name="Omar Adel"),
            Customer(business_id=business_id, name="Omar Samy"),
        ])
        for number, total in (("ISS-1", "100"), ("ISS-2", "200"), ("ISS-3", "300")):
            session.add(Invoice(
                business_id=business_id, customer_id=None,
                invoice_number=number, status="issued", currency_code="EGP",
                subtotal=Decimal(total), tax_total=Decimal("0"),
                discount_total=Decimal("0"), total=Decimal(total),
                issue_date=now - timedelta(days=2),
                due_date=now - timedelta(days=1),
            ))
        session.commit()
    return client, subject, business_id


def test_chat_invoice_detail_is_served_by_reads(chat_business):
    client, _subject, business_id = chat_business
    payload = _ask_chat(client, business_id, "Show me invoice ISS-1")
    assert payload["mode"] == "local-fallback"
    assert "100.00" in payload["answer"]  # ISS-1's own total, not the 600 aggregate
    assert "600.00" not in payload["answer"]
    assert any(source.get("invoice_number") == "ISS-1" for source in payload["sources"])


def test_chat_arabic_overdue_flagship(chat_business):
    client, _subject, business_id = chat_business
    payload = _ask_chat(client, business_id, "مين عليه فلوس متأخرة؟")
    assert payload["mode"] == "local-fallback"
    assert "600.00" in payload["answer"]  # all three invoices overdue + unpaid


def test_chat_read_never_calls_provider(chat_business, monkeypatch):
    client, _subject, business_id = chat_business

    async def _exploding_provider(*args, **kwargs):
        raise AssertionError("provider must not be called for a deterministic read")

    monkeypatch.setenv("OPENAI_API_KEY", "test-key-that-must-not-be-used")
    monkeypatch.setattr(assistant_api, "_provider_post", _exploding_provider)
    payload = _ask_chat(client, business_id, "Show me invoice ISS-1")
    assert "100.00" in payload["answer"]


def test_chat_unmatched_question_falls_through(chat_business):
    client, _subject, business_id = chat_business
    # No window cue and no read pattern: the existing local fallback
    # keeps answering with its aggregate, exactly as before ق-1.
    payload = _ask_chat(client, business_id, "What are my total sales?")
    assert "600.00" in payload["answer"]


def test_chat_payroll_staff_refused_owner_served(chat_business):
    client, subject, business_id = chat_business
    subject["value"] = STAFF
    payload = _ask_chat(client, business_id, "Show me the payroll report")
    assert "owner-only" in payload["answer"]
    subject["value"] = OWNER
    payload = _ask_chat(client, business_id, "Show me the payroll report")
    assert "No payroll records" in payload["answer"]


def test_chat_ambiguous_customer_name_clarifies(chat_business):
    client, _subject, business_id = chat_business
    payload = _ask_chat(client, business_id, "What is the balance of Omar?")
    assert "Omar Adel" in payload["answer"]
    assert "Omar Samy" in payload["answer"]
    assert "Which one" in payload["answer"]
