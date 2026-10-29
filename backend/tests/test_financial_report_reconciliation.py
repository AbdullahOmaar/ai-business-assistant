"""Regression tests for financial report source separation and reconciliation."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Business, Expense, Invoice, Payment, PaymentAllocation, SalesReturn
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
            partial = Invoice(
                business_id=business_id,
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
                    amount=Decimal("25.00"),
                    currency_code="EGP",
                    received_at=recorded_at,
                    method="cash",
                    idempotency_key="fin-egp-partial",
                ),
                Payment(
                    business_id=business_id,
                    amount=Decimal("50.00"),
                    currency_code="EGP",
                    received_at=recorded_at,
                    method="cash",
                    idempotency_key="fin-egp-paid",
                ),
                Payment(
                    business_id=business_id,
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
                    ),
                    PaymentAllocation(
                        business_id=business_id,
                        payment_id=payments[1].id,
                        invoice_id=paid.id,
                        amount=Decimal("50.00"),
                    ),
                    PaymentAllocation(
                        business_id=business_id,
                        payment_id=payments[2].id,
                        invoice_id=usd.id,
                        amount=Decimal("40.00"),
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
