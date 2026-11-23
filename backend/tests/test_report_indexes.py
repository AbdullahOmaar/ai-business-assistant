"""3A-650 part D: the report aggregations get supporting indexes.

The profit-loss endpoint already aggregates in SQL; what was missing was
any index behind it — expenses had no business index at all, so every
report scanned all tenants' expenses. These tests pin the three indexes
in the model metadata (which is also what migration 0011 creates) and
prove the aggregation stays exact at volume across two businesses.
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, Expense, Invoice
from app.security import AuthenticatedPrincipal

EXPECTED_INDEXES = {
    "invoices": ("ix_invoices_business_status_issue_date", ["business_id", "status", "issue_date"]),
    "expenses": ("ix_expenses_business_incurred_at", ["business_id", "incurred_at"]),
    "sales_returns": ("ix_sales_returns_business_status", ["business_id", "status"]),
}


def test_report_aggregation_indexes_exist_in_model_metadata():
    for table_name, (index_name, columns) in EXPECTED_INDEXES.items():
        table = Base.metadata.tables[table_name]
        matches = [index for index in table.indexes if index.name == index_name]
        assert len(matches) == 1, f"{table_name} is missing {index_name}"
        assert [column.name for column in matches[0].columns] == columns


def _client():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.session_factory = factory
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("report-owner")
    client = TestClient(app, raise_server_exceptions=False)
    return client, factory, previous_factory, previous_resolver


def _restore(previous_factory, previous_resolver):
    if previous_factory is None:
        del app.state.session_factory
    else:
        app.state.session_factory = previous_factory
    if previous_resolver is None:
        del app.state.principal_resolver
    else:
        app.state.principal_resolver = previous_resolver


def test_profit_loss_stays_exact_at_volume_across_businesses():
    client, factory, previous_factory, previous_resolver = _client()
    try:
        first = client.post(
            "/api/v1/businesses",
            json={"name": "Volume One", "currency_code": "EGP", "timezone": "Africa/Cairo"},
        ).json()
        second = client.post(
            "/api/v1/businesses",
            json={"name": "Volume Two", "currency_code": "EGP", "timezone": "Africa/Cairo"},
        ).json()
        now = datetime.now(UTC)
        with factory() as session:
            for index in range(300):
                session.add(Expense(
                    business_id=UUID(first["id"]), category="ops", description=f"e{index}",
                    amount=Decimal("2.00"), currency_code="EGP",
                    incurred_at=now - timedelta(days=1),
                ))
                session.add(Expense(
                    business_id=UUID(second["id"]), category="ops", description=f"x{index}",
                    amount=Decimal("5.00"), currency_code="EGP",
                    incurred_at=now - timedelta(days=1),
                ))
            for index in range(150):
                session.add(Invoice(
                    business_id=UUID(first["id"]), invoice_number=f"INV-{index}",
                    status="issued", currency_code="EGP",
                    issue_date=now - timedelta(days=1),
                    subtotal=Decimal("10.00"), tax_total=Decimal("0.00"),
                    discount_total=Decimal("0.00"), total=Decimal("10.00"),
                ))
            session.commit()
        report = client.get(f"/api/v1/businesses/{first['id']}/profit-loss?period=all")
        assert report.status_code == 200
        rows = report.json()["currencies"]
        assert len(rows) == 1
        row = rows[0]
        assert row["revenue"] == "1500.00"
        assert row["revenue_invoice_count"] == 150
        assert row["expenses"] == "600.00"
        assert row["expense_count"] == 300
        assert row["operating_result_before_cost_of_goods"] == "900.00"
    finally:
        _restore(previous_factory, previous_resolver)
