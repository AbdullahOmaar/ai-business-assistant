"""Morning brief (Slice 4).

Covers: overdue invoices (only issued, only still outstanding),
low stock (out of stock + running low, threshold stated), recurring
invoices due tomorrow, 7-day sales growth vs the previous 7 days
(per currency, never combined), the dialect setting driving the
greeting, the off switch, and the empty-business brief. Every figure
is seeded as a real record — no synthetic numbers.
Uses the same in-memory SQLite + TestClient harness as the
assistant execution tests.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    Base,
    Business,
    BusinessMembership,
    Customer,
    Invoice,
    MembershipRole,
    Payment,
    PaymentAllocation,
    Product,
    RecurringInvoiceSchedule,
    StockMovement,
)
from app.security import AuthenticatedPrincipal

OWNER_A = "brief-owner-a"
STAFF_A = "brief-staff-a"
CAIRO = ZoneInfo("Africa/Cairo")


@pytest.fixture()
def brief_client(monkeypatch):
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
def seeded_business(brief_client):
    client, subject = brief_client
    subject["value"] = OWNER_A
    now = datetime.now(UTC)
    response = client.post("/api/v1/businesses", json={"name": "Brief Test Shop", "currency_code": "EGP"})
    assert response.status_code == 201
    business_id = response.json()["id"]
    business_uuid = UUID(business_id)
    with app.state.session_factory() as session:
        business = session.get(Business, business_uuid)
        business.timezone = "Africa/Cairo"
        session.add(BusinessMembership(
            business_id=business_uuid, user_subject=STAFF_A, role=MembershipRole.STAFF,
        ))
        customer = Customer(business_id=business_uuid, name="سوبر ماركت النور")
        session.add(customer)
        session.flush()

        def invoice(number, *, status, total, due_days=None, issue_days=None, currency="EGP"):
            row = Invoice(
                business_id=business_uuid, customer_id=customer.id,
                invoice_number=number, status=status, currency_code=currency,
                subtotal=Decimal(str(total)), tax_total=Decimal("0"),
                discount_total=Decimal("0"), total=Decimal(str(total)),
                issue_date=now + timedelta(days=issue_days) if issue_days is not None else None,
                due_date=now + timedelta(days=due_days) if due_days is not None else None,
            )
            session.add(row)
            session.flush()
            return row

        # Overdue set — issue dates outside both sales windows so they
        # cannot pollute the growth figures.
        invoice("INV-OVERDUE-1", status="issued", total="3400", due_days=-23, issue_days=-30)
        invoice("INV-OVERDUE-2", status="issued", total="500", due_days=-5, issue_days=-20)
        paid = invoice("INV-PAID", status="issued", total="200", due_days=-10, issue_days=-25)
        invoice("INV-DRAFT", status="draft", total="900", due_days=-40, issue_days=-40)
        invoice("INV-NOT-DUE", status="issued", total="700", due_days=1, issue_days=-30)
        # Growth set — current window [today-7, today), previous [today-14, today-7).
        invoice("INV-CUR-EGP", status="issued", total="1000", issue_days=-3)
        invoice("INV-PREV-EGP", status="issued", total="500", issue_days=-10)
        invoice("INV-CUR-USD", status="issued", total="200", issue_days=-2, currency="USD")
        # The paid overdue invoice is fully allocated, so nothing is outstanding.
        payment = Payment(
            business_id=business_uuid, customer_id=customer.id,
            amount=Decimal("200"), currency_code="EGP",
            received_at=now - timedelta(days=9), idempotency_key="brief-paid-1",
        )
        session.add(payment)
        session.flush()
        session.add(PaymentAllocation(
            business_id=business_uuid, payment_id=payment.id,
            invoice_id=paid.id, amount=Decimal("200"),
        ))
        # Low stock: ملح out of stock (5 opening - 5 sold), سكر running
        # low (10 opening - 2 sold), أرز well stocked (excluded).
        for name, opening, sold in (("ملح", "5", "5"), ("سكر", "10", "2"), ("أرز", "100", "0")):
            product = Product(
                business_id=business_uuid, name=name, unit_price=Decimal("10"),
                is_stock_tracked=True, is_active=True,
            )
            session.add(product)
            session.flush()
            session.add(StockMovement(
                business_id=business_uuid, product_id=product.id,
                movement_type="opening", quantity_delta=Decimal(opening),
            ))
            if Decimal(sold) > 0:
                session.add(StockMovement(
                    business_id=business_uuid, product_id=product.id,
                    movement_type="sale", quantity_delta=-Decimal(sold),
                ))
        # Recurring: one due tomorrow (active), one in 5 days, one
        # inactive due tomorrow — only the first counts.
        tomorrow = (now.astimezone(CAIRO).date() + timedelta(days=1))
        session.add(RecurringInvoiceSchedule(
            business_id=business_uuid, customer_id=customer.id,
            interval_days=30, timezone="Africa/Cairo",
            next_run_at=datetime.combine(tomorrow, datetime.min.time(), tzinfo=CAIRO),
            is_active=True,
        ))
        session.add(RecurringInvoiceSchedule(
            business_id=business_uuid, customer_id=customer.id,
            interval_days=30, timezone="Africa/Cairo",
            next_run_at=now + timedelta(days=5), is_active=True,
        ))
        session.add(RecurringInvoiceSchedule(
            business_id=business_uuid, customer_id=customer.id,
            interval_days=30, timezone="Africa/Cairo",
            next_run_at=datetime.combine(tomorrow, datetime.min.time(), tzinfo=CAIRO),
            is_active=False,
        ))
        session.commit()
    return {"id": business_id, "uuid": business_uuid, "now": now}


def test_brief_from_real_data(brief_client, seeded_business):
    client, subject = brief_client
    subject["value"] = OWNER_A
    response = client.get(f"/api/v1/businesses/{seeded_business['id']}/assistant/brief")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["enabled"] is True
    assert body["dialect"] == "egyptian"
    assert body["business_timezone"] == "Africa/Cairo"
    assert body["low_stock_threshold"] == 10
    assert body["limitations"], "the brief must state its limits"

    overdue = body["overdue_invoices"]
    assert [row["invoice_number"] for row in overdue] == ["INV-OVERDUE-1", "INV-OVERDUE-2"]
    assert overdue[0]["outstanding"] == "3400.00"
    assert overdue[0]["days_overdue"] == 23
    assert overdue[0]["customer_name"] == "سوبر ماركت النور"
    assert overdue[1]["outstanding"] == "500.00"
    assert overdue[1]["days_overdue"] == 5

    low_stock = body["low_stock"]
    assert [row["name"] for row in low_stock] == ["ملح", "سكر"]
    assert low_stock[0]["state"] == "out_of_stock"
    assert Decimal(low_stock[0]["stock_quantity"]) == 0
    assert low_stock[1]["state"] == "running_low"
    assert Decimal(low_stock[1]["stock_quantity"]) == 8

    recurring = body["recurring_due_tomorrow"]
    assert len(recurring) == 1
    assert recurring[0]["customer_name"] == "سوبر ماركت النور"
    assert recurring[0]["interval_days"] == 30

    growth = {row["currency_code"]: row for row in body["sales_growth"]}
    assert set(growth) == {"EGP", "USD"}
    assert growth["EGP"]["current_total"] == "1000.00"
    assert growth["EGP"]["previous_total"] == "500.00"
    assert growth["EGP"]["change_pct"] == 100.0
    assert growth["USD"]["current_total"] == "200.00"
    assert growth["USD"]["previous_total"] == "0.00"
    assert growth["USD"]["change_pct"] is None

    summary = body["summary"]
    assert "2 فواتير متأخرة" in summary
    assert "ملح" in summary
    assert "☀️" in summary


def test_brief_dialect_and_off_switch(brief_client, seeded_business):
    client, subject = brief_client
    subject["value"] = OWNER_A
    business_id = seeded_business["id"]
    settings_base = f"/api/v1/businesses/{business_id}/settings"
    brief_url = f"/api/v1/businesses/{business_id}/assistant/brief"

    put = client.put(f"{settings_base}/assistant.dialect", json={"setting_value": "formal"})
    assert put.status_code == 200
    formal = client.get(brief_url).json()
    assert formal["dialect"] == "formal"
    assert formal["summary"].startswith("صباح الخير!")
    assert "☀️" not in formal["summary"]

    client.put(f"{settings_base}/assistant.dialect", json={"setting_value": "english"})
    english = client.get(brief_url).json()
    assert english["dialect"] == "english"
    assert english["summary"].startswith("Good morning!")

    # An unknown stored dialect falls back to friendly Egyptian.
    client.put(f"{settings_base}/assistant.dialect", json={"setting_value": "klingon"})
    assert client.get(brief_url).json()["dialect"] == "egyptian"

    # The off switch: no sections, no summary.
    client.put(f"{settings_base}/assistant.morning_brief.enabled", json={"setting_value": "false"})
    off = client.get(brief_url).json()
    assert off["enabled"] is False
    assert off["summary"] is None
    assert off["overdue_invoices"] == [] and off["low_stock"] == []
    assert off["recurring_due_tomorrow"] == [] and off["sales_growth"] == []
    # Switching it back on restores the brief.
    client.put(f"{settings_base}/assistant.morning_brief.enabled", json={"setting_value": "true"})
    assert client.get(brief_url).json()["enabled"] is True


def test_brief_empty_business_and_staff_read(brief_client, seeded_business):
    client, subject = brief_client
    subject["value"] = OWNER_A
    empty = client.post("/api/v1/businesses", json={"name": "Empty Shop", "currency_code": "EGP"})
    assert empty.status_code == 201
    body = client.get(f"/api/v1/businesses/{empty.json()['id']}/assistant/brief").json()
    assert body["enabled"] is True
    assert body["overdue_invoices"] == [] and body["low_stock"] == []
    assert body["recurring_due_tomorrow"] == [] and body["sales_growth"] == []
    assert "مفيش حاجة مستعجلة" in body["summary"]
    # Staff may read the brief; a non-member may not.
    subject["value"] = STAFF_A
    assert client.get(
        f"/api/v1/businesses/{seeded_business['id']}/assistant/brief"
    ).status_code == 200
    subject["value"] = "brief-outsider"
    assert client.get(
        f"/api/v1/businesses/{seeded_business['id']}/assistant/brief"
    ).status_code == 403


if __name__ == "__main__":
    pytest.main([__file__])
