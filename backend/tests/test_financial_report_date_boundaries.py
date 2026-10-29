"""Regression coverage for business-local financial report date filters.

These tests are authored for the candidate branch but are intentionally NOT run
while the owner has asked to pause test execution due to the current CI/usage issue.
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Expense, Invoice
from app.security import AuthenticatedPrincipal


def _date_filter_client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("financial-date-filter-owner")
    return engine, TestClient(app), previous_factory, previous_resolver


def _restore_date_filter_client(engine, previous_factory, previous_resolver):
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


def _create_business(client):
    response = client.post(
        "/api/v1/businesses",
        json={
            "name": "Financial Date Filter Shop",
            "currency_code": "EGP",
            "timezone": "Africa/Cairo",
        },
    )
    assert response.status_code == 201, response.text
    return UUID(response.json()["id"])


def test_expense_date_filters_use_inclusive_business_local_dates_and_keep_currency_separate():
    """Cairo's Jan 15 starts at 22:00 UTC on Jan 14 and ends at 22:00 UTC on Jan 15."""
    engine, client, previous_factory, previous_resolver = _date_filter_client()
    try:
        business_id = _create_business(client)
        with Session(engine) as session:
            session.add_all(
                [
                    Expense(
                        business_id=business_id,
                        category="ops",
                        description="Before local start",
                        amount=Decimal("99.00"),
                        currency_code="EGP",
                        incurred_at=datetime(2026, 1, 14, 21, 59, 59, tzinfo=timezone.utc),
                    ),
                    Expense(
                        business_id=business_id,
                        category="ops",
                        description="At local start",
                        amount=Decimal("10.00"),
                        currency_code="EGP",
                        incurred_at=datetime(2026, 1, 14, 22, 0, tzinfo=timezone.utc),
                    ),
                    Expense(
                        business_id=business_id,
                        category="ops",
                        description="Inside local day",
                        amount=Decimal("20.00"),
                        currency_code="EGP",
                        incurred_at=datetime(2026, 1, 15, 21, 59, 59, 999999, tzinfo=timezone.utc),
                    ),
                    Expense(
                        business_id=business_id,
                        category="ops",
                        description="Another currency inside local day",
                        amount=Decimal("5.00"),
                        currency_code="USD",
                        incurred_at=datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc),
                    ),
                    Expense(
                        business_id=business_id,
                        category="ops",
                        description="At next local day",
                        amount=Decimal("80.00"),
                        currency_code="USD",
                        incurred_at=datetime(2026, 1, 15, 22, 0, tzinfo=timezone.utc),
                    ),
                ]
            )
            session.commit()

        filtered = client.get(
            f"/api/v1/businesses/{business_id}/expenses",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert filtered.status_code == 200, filtered.text
        rows = filtered.json()
        assert len(rows) == 3
        assert {row["description"] for row in rows} == {
            "At local start",
            "Inside local day",
            "Another currency inside local day",
        }
        totals = {}
        for row in rows:
            totals[row["currency_code"]] = totals.get(row["currency_code"], Decimal("0")) + Decimal(row["amount"])
        assert totals == {"EGP": Decimal("30.00"), "USD": Decimal("5.00")}

        unfiltered = client.get(f"/api/v1/businesses/{business_id}/expenses")
        assert unfiltered.status_code == 200, unfiltered.text
        assert len(unfiltered.json()) == 5
    finally:
        _restore_date_filter_client(engine, previous_factory, previous_resolver)


def test_expense_date_filters_reject_reversed_range():
    engine, client, previous_factory, previous_resolver = _date_filter_client()
    try:
        business_id = _create_business(client)
        response = client.get(
            f"/api/v1/businesses/{business_id}/expenses",
            params={"start_date": "2026-01-16", "end_date": "2026-01-15"},
        )
        assert response.status_code == 422, response.text
        assert "start_date must not be after end_date" in response.json()["detail"]
    finally:
        _restore_date_filter_client(engine, previous_factory, previous_resolver)


def test_expense_pagination_has_stable_id_tiebreak_for_equal_timestamps():
    """Equal incurred_at values have deterministic ordering across paginated reads."""
    engine, client, previous_factory, previous_resolver = _date_filter_client()
    try:
        business_id = _create_business(client)
        timestamp = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
        low_id = UUID("00000000-0000-0000-0000-000000000001")
        high_id = UUID("00000000-0000-0000-0000-000000000002")
        with Session(engine) as session:
            session.add_all(
                [
                    Expense(
                        id=low_id,
                        business_id=business_id,
                        category="ops",
                        description="Lower ID",
                        amount=Decimal("1.00"),
                        currency_code="EGP",
                        incurred_at=timestamp,
                    ),
                    Expense(
                        id=high_id,
                        business_id=business_id,
                        category="ops",
                        description="Higher ID",
                        amount=Decimal("2.00"),
                        currency_code="EGP",
                        incurred_at=timestamp,
                    ),
                ]
            )
            session.commit()

        first = client.get(
            f"/api/v1/businesses/{business_id}/expenses",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15", "limit": 1, "offset": 0},
        )
        second = client.get(
            f"/api/v1/businesses/{business_id}/expenses",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15", "limit": 1, "offset": 1},
        )
        assert first.status_code == second.status_code == 200
        assert UUID(first.json()[0]["id"]) == high_id
        assert UUID(second.json()[0]["id"]) == low_id
    finally:
        _restore_date_filter_client(engine, previous_factory, previous_resolver)


def test_tax_summary_uses_business_local_half_open_dates_and_separate_currencies():
    """The local end date is inclusive, but the following local midnight is exclusive."""
    engine, client, previous_factory, previous_resolver = _date_filter_client()
    try:
        business_id = _create_business(client)
        with Session(engine) as session:
            session.add_all(
                [
                    Invoice(
                        business_id=business_id,
                        invoice_number="TAX-LOCAL-PRE-START",
                        status="issued",
                        currency_code="EGP",
                        issue_date=datetime(2026, 1, 14, 21, 59, 59, tzinfo=timezone.utc),
                        subtotal=Decimal("99.00"),
                        discount_total=Decimal("0.00"),
                        tax_total=Decimal("99.00"),
                        total=Decimal("198.00"),
                    ),
                    Invoice(
                        business_id=business_id,
                        invoice_number="TAX-LOCAL-START",
                        status="issued",
                        currency_code="EGP",
                        issue_date=datetime(2026, 1, 14, 22, 0, tzinfo=timezone.utc),
                        subtotal=Decimal("10.00"),
                        discount_total=Decimal("0.00"),
                        tax_total=Decimal("5.00"),
                        total=Decimal("15.00"),
                    ),
                    Invoice(
                        business_id=business_id,
                        invoice_number="TAX-LOCAL-END",
                        status="issued",
                        currency_code="USD",
                        issue_date=datetime(2026, 1, 15, 21, 59, 59, 999999, tzinfo=timezone.utc),
                        subtotal=Decimal("4.00"),
                        discount_total=Decimal("0.00"),
                        tax_total=Decimal("2.00"),
                        total=Decimal("6.00"),
                    ),
                    Invoice(
                        business_id=business_id,
                        invoice_number="TAX-LOCAL-NEXT-DAY",
                        status="issued",
                        currency_code="USD",
                        issue_date=datetime(2026, 1, 15, 22, 0, tzinfo=timezone.utc),
                        subtotal=Decimal("80.00"),
                        discount_total=Decimal("0.00"),
                        tax_total=Decimal("80.00"),
                        total=Decimal("160.00"),
                    ),
                ]
            )
            session.commit()

        response = client.get(
            f"/api/v1/businesses/{business_id}/reports/tax-summary",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        totals = {row["currency_code"]: Decimal(row["tax_total"]) for row in payload["currencies"]}
        assert totals == {"EGP": Decimal("5.00"), "USD": Decimal("2.00")}
    finally:
        _restore_date_filter_client(engine, previous_factory, previous_resolver)


def test_non_member_cannot_read_expenses_or_tax_summary_with_date_filters():
    engine, client, previous_factory, previous_resolver = _date_filter_client()
    try:
        business_id = _create_business(client)
        app.state.principal_resolver = lambda request: AuthenticatedPrincipal("unrelated-financial-date-user")

        expenses = client.get(
            f"/api/v1/businesses/{business_id}/expenses",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        tax_summary = client.get(
            f"/api/v1/businesses/{business_id}/reports/tax-summary",
            params={"start_date": "2026-01-15", "end_date": "2026-01-15"},
        )
        assert expenses.status_code == 403
        assert tax_summary.status_code == 403
    finally:
        _restore_date_filter_client(engine, previous_factory, previous_resolver)
