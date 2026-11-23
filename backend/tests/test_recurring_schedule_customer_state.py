"""3A-407 part 2 / P2.1 (Linear 3A-271): recurring schedules reject inactive customers.

The fix itself already lives in `extended_api.post_recurring_schedule` (the
active-customer check applies regardless of invoice history). This is the
regression evidence the issue asked for: an inactive customer WITH invoice
history is rejected and no schedule row is created, while an active
customer with the same history is accepted.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, RecurringInvoiceSchedule
from app.security import AuthenticatedPrincipal


def test_recurring_schedule_rejects_inactive_customer_with_invoice_history():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("p21-owner")
    try:
        client = TestClient(app, raise_server_exceptions=False)
        business = client.post(
            "/api/v1/businesses", json={"name": "P21 Workspace", "currency_code": "EGP"}
        )
        assert business.status_code == 201, business.text
        business_id = business.json()["id"]
        base = f"/api/v1/businesses/{business_id}"

        def make_customer_with_history(name: str) -> str:
            customer = client.post(f"{base}/customers", json={"name": name})
            assert customer.status_code == 201, customer.text
            customer_id = customer.json()["id"]
            invoice = client.post(
                f"{base}/invoices",
                json={
                    "invoice_number": f"INV-{name}",
                    "currency_code": "EGP",
                    "customer_id": customer_id,
                    "lines": [
                        {
                            "description": "P2.1 history line",
                            "quantity": "1",
                            "unit_price": "10.00",
                        }
                    ],
                },
            )
            assert invoice.status_code == 201, invoice.text
            return customer_id

        def schedule_count() -> int:
            with app.state.session_factory() as session:
                return session.query(RecurringInvoiceSchedule).count()

        def try_schedule(customer_id: str):
            return client.post(
                f"{base}/recurring-invoices",
                json={
                    "customer_id": customer_id,
                    "interval_days": 30,
                    "next_run_at": "2026-02-01T00:00:00Z",
                },
            )

        # Inactive customer WITH invoice history: rejected, nothing created.
        inactive_id = make_customer_with_history("Inactive With History")
        deleted = client.delete(f"{base}/customers/{inactive_id}")
        assert deleted.status_code == 204, deleted.text
        before = schedule_count()
        rejected = try_schedule(inactive_id)
        assert rejected.status_code == 422, rejected.text
        assert "Customer not found in this business" in rejected.text
        assert schedule_count() == before

        # Active customer with the same history: accepted.
        active_id = make_customer_with_history("Active With History")
        accepted = try_schedule(active_id)
        assert accepted.status_code == 201, accepted.text
        assert schedule_count() == before + 1
    finally:
        if previous_factory is None:
            del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
