"""Regression tests for financial report source separation and reconciliation."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    Base, Business, BusinessMembership, Customer, Employee, Expense, Invoice,
    MembershipRole, Payment, PaymentAllocation, PayrollRecord, SalesReturn,
)
from app.security import AuthenticatedPrincipal


def _reporting_client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("financial-report-owner")
    return engine, TestClient(app), previous_factory, previous_resolver


def _restore_reporting_client(engine, previous_factory, previous_resolver):
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


def test_invoice_only_report_does_not_count_drafts_or_infer_cash():
    """Issued invoices are receivables, not cash; drafts are not reportable sales."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        response = client.post(
            "/api/v1/businesses",
            json={
                "name": "Invoice Only Report Shop",
                "currency_code": "EGP",
                "timezone": "Africa/Cairo",
            },
        )
        assert response.status_code == 201, response.text
        business_id = UUID(response.json()["id"])
        recorded_at = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            session.add_all(
                [
                    Invoice(
                        business_id=business_id,
                        invoice_number="FIN-INVOICE-ONLY-ISSUED",
                        status="issued",
                        currency_code="EGP",
                        issue_date=recorded_at,
                        subtotal=Decimal("120.00"),
                        discount_total=Decimal("0.00"),
                        tax_total=Decimal("0.00"),
                        total=Decimal("120.00"),
                    ),
                    Invoice(
                        business_id=business_id,
                        invoice_number="FIN-INVOICE-ONLY-DRAFT",
                        status="draft",
                        currency_code="EGP",
                        issue_date=recorded_at,
                        subtotal=Decimal("900.00"),
                        discount_total=Decimal("0.00"),
                        tax_total=Decimal("0.00"),
                        total=Decimal("900.00"),
                    ),
                ]
            )
            session.commit()

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert dashboard.status_code == 200, dashboard.text
        payload = dashboard.json()
        assert payload["invoiced_sales"] == [
            {"currency_code": "EGP", "count": 1, "total": "120.00"}
        ]
        assert payload["collected_payments"] == []
        assert payload["outstanding_balances"] == [
            {"currency_code": "EGP", "total": "120.00"}
        ]

        report = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": "2026-01-15",
                "end_date": "2026-01-15",
            },
        )
        assert report.status_code == 200, report.text
        result = report.json()
        assert len(result["currencies"]) == 1
        assert result["currencies"][0]["currency_code"] == "EGP"
        assert Decimal(result["currencies"][0]["revenue"]) == Decimal("120.00")
        assert Decimal(result["currencies"][0]["expenses"]) == Decimal("0")
        assert Decimal(
            result["currencies"][0]["operating_result_before_cost_of_goods"]
        ) == Decimal("120.00")
        assert any("not cash collected" in item for item in result["limitations"])
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)


def test_partial_full_payments_and_expenses_remain_currency_separated():
    """Dashboard totals must distinguish invoicing, collection, expenses and balance."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        response = client.post(
            "/api/v1/businesses",
            json={
                "name": "Financial Reconciliation Shop",
                "currency_code": "EGP",
                "timezone": "Africa/Cairo",
            },
        )
        assert response.status_code == 201, response.text
        business_id = UUID(response.json()["id"])
        recorded_at = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            customer = Customer(business_id=business_id, name="Report Customer")
            session.add(customer)
            session.flush()
            partial = Invoice(
                business_id=business_id,
                customer_id=customer.id,
                invoice_number="FIN-EGP-PARTIAL",
                status="issued",
                currency_code="EGP",
                issue_date=recorded_at,
                subtotal=Decimal("100.00"),
                discount_total=Decimal("0.00"),
                tax_total=Decimal("0.00"),
                total=Decimal("100.00"),
            )
            paid = Invoice(
                business_id=business_id,
                customer_id=customer.id,
                invoice_number="FIN-EGP-PAID",
                status="issued",
                currency_code="EGP",
                issue_date=recorded_at,
                subtotal=Decimal("50.00"),
                discount_total=Decimal("0.00"),
                tax_total=Decimal("0.00"),
                total=Decimal("50.00"),
            )
            usd = Invoice(
                business_id=business_id,
                customer_id=customer.id,
                invoice_number="FIN-USD-PAID",
                status="issued",
                currency_code="USD",
                issue_date=recorded_at,
                subtotal=Decimal("40.00"),
                discount_total=Decimal("0.00"),
                tax_total=Decimal("0.00"),
                total=Decimal("40.00"),
            )
            session.add_all([partial, paid, usd])
            session.flush()
            payments = [
                Payment(
                    business_id=business_id,
                    customer_id=customer.id,
                    amount=Decimal("25.00"),
                    currency_code="EGP",
                    received_at=recorded_at,
                    method="cash",
                    idempotency_key="fin-egp-partial",
                ),
                Payment(
                    business_id=business_id,
                    customer_id=customer.id,
                    amount=Decimal("50.00"),
                    currency_code="EGP",
                    received_at=recorded_at,
                    method="cash",
                    idempotency_key="fin-egp-paid",
                ),
                Payment(
                    business_id=business_id,
                    customer_id=customer.id,
                    amount=Decimal("40.00"),
                    currency_code="USD",
                    received_at=recorded_at,
                    method="bank",
                    idempotency_key="fin-usd-paid",
                ),
            ]
            session.add_all(payments)
            session.flush()
            session.add_all(
                [
                    PaymentAllocation(
                        business_id=business_id,
                        payment_id=payments[0].id,
                        invoice_id=partial.id,
                        amount=Decimal("25.00"),
                        created_at=recorded_at,
                    ),
                    PaymentAllocation(
                        business_id=business_id,
                        payment_id=payments[1].id,
                        invoice_id=paid.id,
                        amount=Decimal("50.00"),
                        created_at=recorded_at,
                    ),
                    PaymentAllocation(
                        business_id=business_id,
                        payment_id=payments[2].id,
                        invoice_id=usd.id,
                        amount=Decimal("40.00"),
                        created_at=recorded_at,
                    ),
                    Expense(
                        business_id=business_id,
                        category="operations",
                        description="EGP operating expense",
                        amount=Decimal("7.00"),
                        currency_code="EGP",
                        incurred_at=recorded_at,
                    ),
                    Expense(
                        business_id=business_id,
                        category="operations",
                        description="USD operating expense",
                        amount=Decimal("3.00"),
                        currency_code="USD",
                        incurred_at=recorded_at,
                    ),
                ]
            )
            session.commit()

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert dashboard.status_code == 200, dashboard.text
        data = dashboard.json()

        def totals(items):
            return {item["currency_code"]: Decimal(item["total"]) for item in items}

        assert totals(data["invoiced_sales"]) == {
            "EGP": Decimal("150.00"),
            "USD": Decimal("40.00"),
        }
        assert totals(data["collected_payments"]) == {
            "EGP": Decimal("75.00"),
            "USD": Decimal("40.00"),
        }
        assert totals(data["expenses"]) == {
            "EGP": Decimal("7.00"),
            "USD": Decimal("3.00"),
        }
        assert totals(data["outstanding_balances"]) == {
            "EGP": Decimal("75.00"),
            "USD": Decimal("0"),
        }
        assert any("never converted" in item for item in data["limitations"])
        assert any("does not claim net profit" in item for item in data["limitations"])
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)


def test_non_member_cannot_read_profit_loss_report():
    """Financial reports must enforce the same business membership boundary as dashboard."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Private Financial Report Shop", "currency_code": "EGP"},
        )
        assert created.status_code == 201, created.text
        business_id = created.json()["id"]

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-financial-user")
        response = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={"period": "all"},
        )
        assert response.status_code == 403, response.text
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)


def test_dashboard_date_filter_uses_half_open_utc_interval():
    """Include the exact start, include pre-end, and exclude the exact next-day boundary."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Half Open UTC Report Shop", "currency_code": "EGP", "timezone": "UTC"},
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])

        with Session(engine) as session:
            session.add_all([
                Invoice(
                    business_id=business_id,
                    invoice_number="UTC-START-INCLUSIVE",
                    status="issued",
                    currency_code="EGP",
                    issue_date=datetime(2026, 1, 15, 0, 0, tzinfo=timezone.utc),
                    subtotal=Decimal("10.00"), discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"), total=Decimal("10.00"),
                ),
                Invoice(
                    business_id=business_id,
                    invoice_number="UTC-END-EXCLUSIVE",
                    status="issued",
                    currency_code="EGP",
                    issue_date=datetime(2026, 1, 15, 23, 59, 59, 999999, tzinfo=timezone.utc),
                    subtotal=Decimal("20.00"), discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"), total=Decimal("20.00"),
                ),
                Invoice(
                    business_id=business_id,
                    invoice_number="UTC-NEXT-DAY-EXCLUDED",
                    status="issued",
                    currency_code="EGP",
                    issue_date=datetime(2026, 1, 16, 0, 0, tzinfo=timezone.utc),
                    subtotal=Decimal("900.00"), discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"), total=Decimal("900.00"),
                ),
            ])
            session.commit()

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert dashboard.status_code == 200, dashboard.text
        payload = dashboard.json()
        assert payload["invoiced_sales"] == [
            {"currency_code": "EGP", "count": 2, "total": "30.00"}
        ]
        assert payload["outstanding_balances"] == [
            {"currency_code": "EGP", "total": "30.00"}
        ]
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)

def test_profit_loss_rejects_reversed_custom_date_range():
    """Custom profit/loss periods must reject reversed date ranges."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Invalid Financial Period Shop",
                "currency_code": "EGP",
                "timezone": "UTC",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])

        response = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": "2026-01-16",
                "end_date": "2026-01-15",
            },
        )
        assert response.status_code == 422, response.text
        assert "start_date must be on or before end_date" in response.json()["detail"]
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)


def test_expense_date_filter_respects_dst_transition_in_business_timezone():
    """A New York spring-forward day is a 23-hour local day, not a fixed 24-hour UTC window."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "DST Expense Boundary Shop",
                "currency_code": "USD",
                "timezone": "America/New_York",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])

        with Session(engine) as session:
            session.add_all([
                Expense(
                    business_id=business_id,
                    category="operations",
                    description="before-local-day",
                    amount=Decimal("1.00"),
                    currency_code="USD",
                    incurred_at=datetime(2026, 3, 8, 4, 59, tzinfo=timezone.utc),
                ),
                Expense(
                    business_id=business_id,
                    category="operations",
                    description="start-inclusive",
                    amount=Decimal("2.00"),
                    currency_code="USD",
                    incurred_at=datetime(2026, 3, 8, 5, 0, tzinfo=timezone.utc),
                ),
                Expense(
                    business_id=business_id,
                    category="operations",
                    description="end-exclusive-local-day",
                    amount=Decimal("3.00"),
                    currency_code="USD",
                    incurred_at=datetime(2026, 3, 9, 3, 59, tzinfo=timezone.utc),
                ),
                Expense(
                    business_id=business_id,
                    category="operations",
                    description="next-local-day",
                    amount=Decimal("900.00"),
                    currency_code="USD",
                    incurred_at=datetime(2026, 3, 9, 4, 0, tzinfo=timezone.utc),
                ),
            ])
            session.commit()

        response = client.get(
            f"/api/v1/businesses/{business_id}/expenses",
            params={"start_date": "2026-03-08", "end_date": "2026-03-08"},
        )
        assert response.status_code == 200, response.text
        descriptions = {item["description"] for item in response.json()}
        assert descriptions == {"start-inclusive", "end-exclusive-local-day"}
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)



def test_profit_loss_rejects_unrepresentable_custom_date_bounds():
    """Calendar extremes must return a controlled 422 rather than an API 500."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Profit Loss Date Boundary Shop",
                "currency_code": "EGP",
                "timezone": "Etc/GMT-12",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])

        start_underflow = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": date.min.isoformat(),
                "end_date": date.min.isoformat(),
            },
        )
        end_overflow = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": date.max.isoformat(),
                "end_date": date.max.isoformat(),
            },
        )

        assert start_underflow.status_code == 422, start_underflow.text
        assert end_overflow.status_code == 422, end_overflow.text
        expected_detail = "Date is outside the supported business-timezone range."
        assert start_underflow.json()["detail"] == expected_detail
        assert end_overflow.json()["detail"] == expected_detail
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)



def test_dashboard_surfaces_invalid_allocations_and_overallocation():
    """Invalid customer/currency allocations never reduce AR and overallocations are warnings."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Allocation Integrity Shop", "currency_code": "EGP", "timezone": "Africa/Cairo"},
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])
        recorded_at = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            customer_a = Customer(business_id=business_id, name="Customer A")
            customer_b = Customer(business_id=business_id, name="Customer B")
            session.add_all([customer_a, customer_b])
            session.flush()
            invoice_a = Invoice(
                business_id=business_id, customer_id=customer_a.id,
                invoice_number="INTEGRITY-EGP-100", status="issued", currency_code="EGP",
                issue_date=recorded_at, subtotal=Decimal("100.00"),
                discount_total=Decimal("0.00"), tax_total=Decimal("0.00"),
                total=Decimal("100.00"),
            )
            invoice_over = Invoice(
                business_id=business_id, customer_id=customer_a.id,
                invoice_number="INTEGRITY-EGP-50", status="issued", currency_code="EGP",
                issue_date=recorded_at, subtotal=Decimal("50.00"),
                discount_total=Decimal("0.00"), tax_total=Decimal("0.00"),
                total=Decimal("50.00"),
            )
            session.add_all([invoice_a, invoice_over])
            session.flush()
            payments = [
                Payment(
                    business_id=business_id, customer_id=customer_a.id,
                    amount=Decimal("20.00"), currency_code="USD", received_at=recorded_at,
                    method="bank", idempotency_key="integrity-currency-mismatch",
                ),
                Payment(
                    business_id=business_id, customer_id=customer_b.id,
                    amount=Decimal("25.00"), currency_code="EGP", received_at=recorded_at,
                    method="cash", idempotency_key="integrity-customer-mismatch",
                ),
                Payment(
                    business_id=business_id, customer_id=customer_a.id,
                    amount=Decimal("60.00"), currency_code="EGP", received_at=recorded_at,
                    method="cash", idempotency_key="integrity-overallocation",
                ),
            ]
            session.add_all(payments)
            session.flush()
            session.add_all([
                PaymentAllocation(
                    business_id=business_id, payment_id=payments[0].id,
                    invoice_id=invoice_a.id, amount=Decimal("20.00"), created_at=recorded_at,
                ),
                PaymentAllocation(
                    business_id=business_id, payment_id=payments[1].id,
                    invoice_id=invoice_a.id, amount=Decimal("25.00"), created_at=recorded_at,
                ),
                PaymentAllocation(
                    business_id=business_id, payment_id=payments[2].id,
                    invoice_id=invoice_over.id, amount=Decimal("60.00"), created_at=recorded_at,
                ),
            ])
            session.commit()

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert dashboard.status_code == 200, dashboard.text
        payload = dashboard.json()
        assert payload["outstanding_balances"] == [
            {"currency_code": "EGP", "total": "100.00"}
        ]
        warnings = payload["data_quality_warnings"]
        assert any(
            item["type"] == "invalid_payment_allocation"
            and "currency_mismatch" in item["reasons"]
            for item in warnings
        )
        assert any(
            item["type"] == "invalid_payment_allocation"
            and "customer_mismatch_or_missing" in item["reasons"]
            for item in warnings
        )
        assert any(item["type"] == "allocations_exceed_invoice_total" for item in warnings)
        assert payload["outstanding_as_of_date"] == "2026-01-15"
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)


def test_receivables_aging_uses_persisted_event_timestamps_for_historical_as_of():
    """Allocations recorded after the cutoff must not rewrite historical receivables."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Historical Receivables Shop", "currency_code": "EGP", "timezone": "Africa/Cairo"},
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])
        invoice_issued_at = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)
        allocation_created_at = datetime(2026, 1, 20, 12, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            customer = Customer(business_id=business_id, name="Historical Customer")
            session.add(customer)
            session.flush()
            invoice = Invoice(
                business_id=business_id, customer_id=customer.id,
                invoice_number="HISTORICAL-AR-001", status="issued", currency_code="EGP",
                issue_date=invoice_issued_at,
                due_date=datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc),
                subtotal=Decimal("100.00"), discount_total=Decimal("0.00"),
                tax_total=Decimal("0.00"), total=Decimal("100.00"),
            )
            session.add(invoice)
            session.flush()
            payment = Payment(
                business_id=business_id, customer_id=customer.id,
                amount=Decimal("40.00"), currency_code="EGP",
                received_at=allocation_created_at, method="cash",
                idempotency_key="historical-ar-payment",
            )
            session.add(payment)
            session.flush()
            session.add(PaymentAllocation(
                business_id=business_id, payment_id=payment.id, invoice_id=invoice.id,
                amount=Decimal("40.00"), created_at=allocation_created_at,
            ))
            session.commit()

        before_allocation = client.get(
            f"/api/v1/businesses/{business_id}/reports/receivables-aging",
            params={"as_of": "2026-01-15"},
        )
        assert before_allocation.status_code == 200, before_allocation.text
        assert before_allocation.json()["basis"] == "historical_as_of"
        assert before_allocation.json()["invoices"][0]["allocated_payments"] == "0"
        assert before_allocation.json()["by_currency"][0]["total_outstanding"] == "100.00"

        after_allocation = client.get(
            f"/api/v1/businesses/{business_id}/reports/receivables-aging",
            params={"as_of": "2026-01-25"},
        )
        assert after_allocation.status_code == 200, after_allocation.text
        assert after_allocation.json()["invoices"][0]["allocated_payments"] == "40.00"
        assert after_allocation.json()["by_currency"][0]["total_outstanding"] == "60.00"
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)


def test_payment_overallocation_is_reported_and_never_reduces_receivables():
    """Allocations exceeding a payment amount are all excluded from historical AR."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={"name": "Payment Overallocation Shop", "currency_code": "EGP", "timezone": "Africa/Cairo"},
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])
        recorded_at = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            customer = Customer(business_id=business_id, name="Payment Customer")
            session.add(customer)
            session.flush()
            invoices = [
                Invoice(
                    business_id=business_id, customer_id=customer.id,
                    invoice_number=f"PAYMENT-OVERALLOC-{index}", status="issued",
                    currency_code="EGP", issue_date=recorded_at,
                    due_date=datetime(2026, 2, 10, 12, 0, tzinfo=timezone.utc),
                    subtotal=Decimal("100.00"), discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"), total=Decimal("100.00"),
                )
                for index in (1, 2)
            ]
            session.add_all(invoices)
            session.flush()
            payment = Payment(
                business_id=business_id, customer_id=customer.id,
                amount=Decimal("30.00"), currency_code="EGP",
                received_at=recorded_at, method="cash",
                idempotency_key="payment-overallocated-across-invoices",
            )
            session.add(payment)
            session.flush()
            session.add_all([
                PaymentAllocation(
                    business_id=business_id, payment_id=payment.id, invoice_id=invoice.id,
                    amount=Decimal("20.00"), created_at=recorded_at,
                )
                for invoice in invoices
            ])
            session.commit()

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert dashboard.status_code == 200, dashboard.text
        assert dashboard.json()["outstanding_balances"] == [
            {"currency_code": "EGP", "total": "200.00"}
        ]
        assert any(
            item["type"] == "allocations_exceed_payment_amount"
            for item in dashboard.json()["data_quality_warnings"]
        )

        aging = client.get(
            f"/api/v1/businesses/{business_id}/reports/receivables-aging",
            params={"as_of": "2026-01-15"},
        )
        assert aging.status_code == 200, aging.text
        assert aging.json()["by_currency"][0]["total_outstanding"] == "200.00"
        assert any(
            item["type"] == "allocations_exceed_payment_amount"
            for item in aging.json()["data_quality_warnings"]
        )
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)

def test_dashboard_and_profit_loss_are_isolated_from_another_business():
    """Report aggregates must never include rows from an unrelated tenant."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Primary Reporting Tenant",
                "currency_code": "EGP",
                "timezone": "Africa/Cairo",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])
        recorded_at = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            unrelated_business = Business(
                name="Unrelated Reporting Tenant",
                currency_code="EGP",
                timezone="Africa/Cairo",
            )
            session.add(unrelated_business)
            session.flush()
            session.add_all([
                Invoice(
                    business_id=business_id,
                    invoice_number="TENANT-A-ISSUED",
                    status="issued",
                    currency_code="EGP",
                    issue_date=recorded_at,
                    subtotal=Decimal("100.00"),
                    discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"),
                    total=Decimal("100.00"),
                ),
                Invoice(
                    business_id=unrelated_business.id,
                    invoice_number="TENANT-B-ISSUED",
                    status="issued",
                    currency_code="EGP",
                    issue_date=recorded_at,
                    subtotal=Decimal("900.00"),
                    discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"),
                    total=Decimal("900.00"),
                ),
                Expense(
                    business_id=business_id,
                    category="operations",
                    description="Primary tenant expense",
                    amount=Decimal("10.00"),
                    currency_code="EGP",
                    incurred_at=recorded_at,
                ),
                Expense(
                    business_id=unrelated_business.id,
                    category="operations",
                    description="Unrelated tenant expense",
                    amount=Decimal("90.00"),
                    currency_code="EGP",
                    incurred_at=recorded_at,
                ),
            ])
            session.commit()
            unrelated_business_id = unrelated_business.id

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert dashboard.status_code == 200, dashboard.text
        dashboard_payload = dashboard.json()
        assert dashboard_payload["invoiced_sales"] == [
            {"currency_code": "EGP", "count": 1, "total": "100.00"}
        ]
        assert dashboard_payload["expenses"] == [
            {"currency_code": "EGP", "count": 1, "total": "10.00"}
        ]

        summary = client.get(f"/api/v1/businesses/{business_id}/reports/summary")
        assert summary.status_code == 200, summary.text
        assert summary.json()["issued_invoices_by_currency"] == [
            {"currency_code": "EGP", "count": 1, "total": "100.00"}
        ]
        assert summary.json()["expenses_by_currency"] == [
            {"currency_code": "EGP", "count": 1, "total": "10.00"}
        ]

        report = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": "2026-01-15",
                "end_date": "2026-01-15",
            },
        )
        assert report.status_code == 200, report.text
        assert report.json()["currencies"] == [{
            "currency_code": "EGP",
            "revenue": "100.00",
            "revenue_invoice_count": 1,
            "approved_return_total": "0",
            "approved_return_count": 0,
            "expenses": "10.00",
            "expense_count": 1,
            "operating_result_before_cost_of_goods": "90.00",
        }]

        denied = client.get(
            f"/api/v1/businesses/{unrelated_business_id}/dashboard",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert denied.status_code == 403
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)

def test_expense_csv_export_is_owner_only_tenant_scoped_and_formula_safe():
    """The existing CSV export must not leak other tenants or spreadsheet formulas."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "CSV Export Primary Tenant",
                "currency_code": "EGP",
                "timezone": "Africa/Cairo",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])
        with Session(engine) as session:
            unrelated_business = Business(
                name="CSV Export Unrelated Tenant",
                currency_code="EGP",
                timezone="Africa/Cairo",
            )
            session.add(unrelated_business)
            session.flush()
            session.add_all([
                Expense(
                    business_id=business_id,
                    category="operations",
                    description='=HYPERLINK("https://example.invalid","open")',
                    amount=Decimal("12.50"),
                    currency_code="EGP",
                    incurred_at=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
                ),
                Expense(
                    business_id=unrelated_business.id,
                    category="operations",
                    description="Must not leak into primary export",
                    amount=Decimal("999.00"),
                    currency_code="EGP",
                    incurred_at=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
                ),
                BusinessMembership(
                    business_id=business_id,
                    user_subject="financial-report-staff",
                    role=MembershipRole.STAFF,
                ),
            ])
            session.commit()

        owner_export = client.get(
            f"/api/v1/businesses/{business_id}/exports/expenses.csv"
        )
        assert owner_export.status_code == 200, owner_export.text
        assert owner_export.headers["content-type"].startswith("text/csv")
        assert "'=HYPERLINK(" in owner_export.text
        assert "Must not leak into primary export" not in owner_export.text
        assert "999.00" not in owner_export.text

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
            "financial-report-staff"
        )
        staff_export = client.get(
            f"/api/v1/businesses/{business_id}/exports/expenses.csv"
        )
        assert staff_export.status_code == 403
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)



@pytest.mark.parametrize(
    ("date_filters", "outside_dates"),
    [
        ({"start_date": "2026-01-15"}, [datetime(2026, 1, 14, 12, tzinfo=timezone.utc)]),
        ({"end_date": "2026-01-16"}, [datetime(2026, 1, 17, 12, tzinfo=timezone.utc)]),
        (
            {"start_date": "2026-01-15", "end_date": "2026-01-16"},
            [
                datetime(2026, 1, 14, 12, tzinfo=timezone.utc),
                datetime(2026, 1, 17, 12, tzinfo=timezone.utc),
            ],
        ),
    ],
    ids=["start-only", "end-only", "combined"],
)
def test_expense_date_filters_hide_payroll_before_pagination(date_filters, outside_dates):
    """STAFF date-filtered pages omit payroll rows before LIMIT/OFFSET; OWNER retains access."""
    engine, client, previous_factory, previous_resolver = _reporting_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Payroll Date Filter Privacy Shop",
                "currency_code": "EGP",
                "timezone": "UTC",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])
        payroll_time = datetime(2026, 1, 16, 12, 0, tzinfo=timezone.utc)
        ordinary_time = datetime(2026, 1, 16, 11, 0, tzinfo=timezone.utc)

        with Session(engine) as session:
            employee = Employee(
                business_id=business_id,
                name="Private Payroll Employee",
                monthly_salary=Decimal("5000.00"),
            )
            payroll_expense = Expense(
                business_id=business_id,
                category="Payroll",
                description="Confidential salary payment",
                amount=Decimal("5000.00"),
                currency_code="EGP",
                incurred_at=payroll_time,
                vendor_name="Private Payroll Employee",
                reference="PAYROLL-PRIVATE-2026-01",
            )
            ordinary_expense = Expense(
                business_id=business_id,
                category="Office",
                description="Office supplies",
                amount=Decimal("100.00"),
                currency_code="EGP",
                incurred_at=ordinary_time,
                vendor_name="Office vendor",
            )
            session.add_all([employee, payroll_expense, ordinary_expense])
            session.flush()
            payroll = PayrollRecord(
                business_id=business_id,
                employee_id=employee.id,
                period="2026-01",
                base_salary=Decimal("5000.00"),
                allowances=Decimal("0.00"),
                bonuses=Decimal("0.00"),
                deductions=Decimal("0.00"),
                net_pay=Decimal("5000.00"),
                status="paid",
                expense_id=payroll_expense.id,
                created_by_subject="financial-report-owner",
                approved_by_subject="financial-report-owner",
                approved_at=payroll_time,
                paid_by_subject="financial-report-owner",
                paid_at=payroll_time,
            )
            session.add(payroll)
            for index, outside_at in enumerate(outside_dates):
                session.add(
                    Expense(
                        business_id=business_id,
                        category="Office",
                        description=f"Out of range {index}",
                        amount=Decimal("1.00"),
                        currency_code="EGP",
                        incurred_at=outside_at,
                    )
                )
            session.add(
                BusinessMembership(
                    business_id=business_id,
                    user_subject="financial-report-staff",
                    role=MembershipRole.STAFF,
                )
            )
            session.commit()

        endpoint = f"/api/v1/businesses/{business_id}/expenses"
        owner_page = client.get(endpoint, params={**date_filters, "limit": 1})
        owner_all = client.get(endpoint, params={**date_filters, "limit": 10})
        assert owner_page.status_code == 200, owner_page.text
        assert owner_all.status_code == 200, owner_all.text
        assert owner_page.json()[0]["description"] == "Confidential salary payment"
        owner_rows = owner_all.json()
        assert {row["description"] for row in owner_rows} == {
            "Confidential salary payment",
            "Office supplies",
        }

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
            "financial-report-staff"
        )
        staff_page = client.get(endpoint, params={**date_filters, "limit": 1})
        staff_all = client.get(endpoint, params={**date_filters, "limit": 10})
        staff_second_page = client.get(
            endpoint, params={**date_filters, "limit": 1, "offset": 1}
        )
        assert staff_page.status_code == 200, staff_page.text
        assert staff_all.status_code == 200, staff_all.text
        assert staff_second_page.status_code == 200, staff_second_page.text
        assert len(staff_page.json()) == 1
        assert staff_page.json()[0]["description"] == "Office supplies"
        assert [row["description"] for row in staff_all.json()] == ["Office supplies"]
        assert staff_second_page.json() == []
        assert "Private Payroll Employee" not in staff_page.text
        assert "5000.00" not in staff_page.text
        assert "PAYROLL-PRIVATE-2026-01" not in staff_page.text
    finally:
        _restore_reporting_client(engine, previous_factory, previous_resolver)
