"""Business-local date boundary tests for financial dashboard/report APIs."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from uuid import UUID

from app.main import app
from app.models import Base, Business, Expense, Invoice, InvoiceLine, SalesReturn, SalesReturnLine
from app.security import AuthenticatedPrincipal


def _configured_client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("timezone-owner")
    return engine, TestClient(app), previous_factory, previous_resolver


def _restore_app(engine, previous_factory, previous_resolver):
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


def test_dashboard_and_profit_loss_use_business_local_day_boundaries():
    engine, client, previous_factory, previous_resolver = _configured_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Timezone Shop",
                "currency_code": "EGP",
                "timezone": "America/New_York",
            },
        )
        assert created.status_code == 201, created.text
        business_id = created.json()["id"]

        # New York's 2026-01-01 local day is [05:00 UTC Jan 1, 05:00 UTC Jan 2).
        # The first records are still on the previous local date and must be excluded.
        with Session(engine) as session:
            business = session.get(Business, UUID(business_id))
            assert business is not None
            session.add_all([
                Invoice(
                    business_id=business.id,
                    invoice_number="TZ-OUTSIDE",
                    status="issued",
                    currency_code="EGP",
                    issue_date=datetime(2026, 1, 1, 4, 30, tzinfo=timezone.utc),
                    subtotal=Decimal("10.00"),
                    discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"),
                    total=Decimal("10.00"),
                ),
                Invoice(
                    business_id=business.id,
                    invoice_number="TZ-INSIDE",
                    status="issued",
                    currency_code="EGP",
                    issue_date=datetime(2026, 1, 1, 6, 0, tzinfo=timezone.utc),
                    subtotal=Decimal("20.00"),
                    discount_total=Decimal("0.00"),
                    tax_total=Decimal("0.00"),
                    total=Decimal("20.00"),
                ),
                Expense(
                    business_id=business.id,
                    category="operations",
                    description="Outside local day",
                    amount=Decimal("7.00"),
                    currency_code="EGP",
                    incurred_at=datetime(2026, 1, 1, 4, 30, tzinfo=timezone.utc),
                ),
                Expense(
                    business_id=business.id,
                    category="operations",
                    description="Inside local day",
                    amount=Decimal("5.00"),
                    currency_code="EGP",
                    incurred_at=datetime(2026, 1, 1, 6, 0, tzinfo=timezone.utc),
                ),
            ])
            session.commit()

        dashboard = client.get(
            f"/api/v1/businesses/{business_id}/dashboard",
            params={"start_date": "2026-01-01", "end_date": "2026-01-01"},
        )
        assert dashboard.status_code == 200, dashboard.text
        payload = dashboard.json()
        assert payload["period"]["timezone"] == "America/New_York"
        assert Decimal(payload["invoiced_sales"][0]["total"]) == Decimal("20.00")
        assert Decimal(payload["expenses"][0]["total"]) == Decimal("5.00")

        report = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": "2026-01-01",
                "end_date": "2026-01-01",
            },
        )
        assert report.status_code == 200, report.text
        result = report.json()
        assert any("tax amounts" in item for item in result["limitations"])
        assert any("sales returns" in item for item in result["limitations"])
        assert result["revenue_basis"] == (
            "gross issued invoice totals before sales returns; stored invoice tax is included"
        )
        assert result["period"]["timezone"] == "America/New_York"
        assert Decimal(result["currencies"][0]["revenue"]) == Decimal("20.00")
        assert Decimal(result["currencies"][0]["expenses"]) == Decimal("5.00")
    finally:
        _restore_app(engine, previous_factory, previous_resolver)


def test_profit_loss_explicitly_reports_gross_revenue_when_approved_return_exists():
    engine, client, previous_factory, previous_resolver = _configured_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Gross Revenue Return Shop",
                "currency_code": "EGP",
                "timezone": "UTC",
            },
        )
        assert created.status_code == 201, created.text
        business_id = UUID(created.json()["id"])

        with Session(engine) as session:
            invoice = Invoice(
                business_id=business_id,
                invoice_number="RET-GROSS-001",
                status="issued",
                currency_code="EGP",
                issue_date=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
                subtotal=Decimal("20.00"),
                discount_total=Decimal("0.00"),
                tax_total=Decimal("0.00"),
                total=Decimal("20.00"),
            )
            session.add(invoice)
            session.flush()
            line = InvoiceLine(
                business_id=business_id,
                invoice_id=invoice.id,
                description="Test item",
                quantity=Decimal("1.000"),
                unit_price=Decimal("20.00"),
                line_total=Decimal("20.00"),
            )
            session.add(line)
            session.flush()
            sales_return = SalesReturn(
                business_id=business_id,
                invoice_id=invoice.id,
                status="approved",
                total=Decimal("5.00"),
            )
            session.add(sales_return)
            session.flush()
            session.add(SalesReturnLine(
                business_id=business_id,
                sales_return_id=sales_return.id,
                invoice_line_id=line.id,
                quantity=Decimal("0.250"),
                amount=Decimal("5.00"),
            ))
            session.commit()

        report = client.get(
            f"/api/v1/businesses/{business_id}/profit-loss",
            params={
                "period": "custom",
                "start_date": "2026-01-01",
                "end_date": "2026-01-31",
            },
        )
        assert report.status_code == 200, report.text
        payload = report.json()
        assert payload["revenue_basis"] == (
            "gross issued invoice totals before sales returns; stored invoice tax is included"
        )
        assert Decimal(payload["currencies"][0]["revenue"]) == Decimal("20.00")
        assert Decimal(payload["currencies"][0]["approved_return_total"]) == Decimal("5.00")
        assert payload["currencies"][0]["approved_return_count"] == 1
        assert any("approved sales returns are not netted" in item for item in payload["limitations"])
    finally:
        _restore_app(engine, previous_factory, previous_resolver)


def test_dashboard_defaults_to_business_local_30_day_window(monkeypatch):
    engine, client, previous_factory, previous_resolver = _configured_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Default Period Shop",
                "currency_code": "EGP",
                "timezone": "America/New_York",
            },
        )
        assert created.status_code == 201, created.text
        business_id = created.json()["id"]

        import app.core_features_api as core_features_api
        real_datetime = core_features_api.datetime

        class FrozenDateTime(real_datetime):
            @classmethod
            def now(cls, tz=None):
                if tz is None:
                    return cls(2026, 1, 1, 1, 0)
                return cls(2026, 1, 1, 1, 0, tzinfo=tz)

        monkeypatch.setattr(core_features_api, "datetime", FrozenDateTime)
        response = client.get(f"/api/v1/businesses/{business_id}/dashboard")
        assert response.status_code == 200, response.text
        period = response.json()["period"]
        assert period["timezone"] == "America/New_York"
        assert period["start_date"] == "2025-12-03"
        assert period["end_date"] == "2026-01-01"
    finally:
        _restore_app(engine, previous_factory, previous_resolver)


def test_business_creation_rejects_invalid_timezone_name():
    engine, client, previous_factory, previous_resolver = _configured_client()
    try:
        response = client.post(
            "/api/v1/businesses",
            json={
                "name": "Invalid Timezone Shop",
                "currency_code": "EGP",
                "timezone": "Mars/Olympus",
            },
        )
        assert response.status_code == 422
        assert "valid IANA timezone" in response.json()["detail"]
    finally:
        _restore_app(engine, previous_factory, previous_resolver)


def test_day_bounds_respect_daylight_saving_transitions():
    from datetime import date
    from app.core_features_api import _day_bounds

    spring_start, spring_end = _day_bounds(
        date(2026, 3, 8), date(2026, 3, 8), "America/New_York"
    )
    fall_start, fall_end = _day_bounds(
        date(2026, 11, 1), date(2026, 11, 1), "America/New_York"
    )

    # Local calendar days can be 23 or 25 hours across DST; never assume 24.
    assert (spring_end - spring_start).total_seconds() == 23 * 60 * 60
    assert (fall_end - fall_start).total_seconds() == 25 * 60 * 60


def test_business_update_rejects_invalid_timezone_name():
    engine, client, previous_factory, previous_resolver = _configured_client()
    try:
        created = client.post(
            "/api/v1/businesses",
            json={
                "name": "Timezone Update Shop",
                "currency_code": "EGP",
                "timezone": "Africa/Cairo",
            },
        )
        assert created.status_code == 201, created.text
        business_id = created.json()["id"]

        response = client.patch(
            f"/api/v1/businesses/{business_id}",
            json={"timezone": "Mars/Olympus"},
        )
        assert response.status_code == 422
        assert "valid IANA timezone" in response.json()["detail"]
    finally:
        _restore_app(engine, previous_factory, previous_resolver)
