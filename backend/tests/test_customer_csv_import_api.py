"""API regression for safe customer CSV duplicate detection."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.main import app
from app.models import AuditEvent, Customer
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture


def test_customer_csv_preview_detects_duplicate_emails_without_writes():
    engine, business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        session.add(Customer(
            business_id=business_id,
            name="Existing email customer",
            email="Existing@Example.com",
        ))
        session.commit()

    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}/imports/customers.csv"
    duplicate_in_file = (
        "name,email\n"
        "First customer,duplicate@example.com\n"
        "Second customer,DUPLICATE@example.com\n"
    )
    duplicate_existing = "name,email\nNew customer,existing@example.com\n"
    try:
        with Session(engine) as session:
            customer_count_before = session.scalar(
                select(func.count()).select_from(Customer).where(
                    Customer.business_id == business_id,
                )
            )
            audit_count_before = session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                )
            )

        in_file = client.post(
            f"{base}/preview", content=duplicate_in_file,
            headers={"Content-Type": "text/csv"},
        )
        assert in_file.status_code == 200, in_file.text
        payload = in_file.json()
        assert payload["valid"] is False
        assert payload["write_performed"] is False
        assert {
            (error["row"], error["field"], error["code"], error.get("first_row"))
            for error in payload["errors"]
        } >= {(3, "email", "duplicate_in_file", 2)}

        existing = client.post(
            f"{base}/preview", content=duplicate_existing,
            headers={"Content-Type": "text/csv"},
        )
        assert existing.status_code == 200, existing.text
        assert existing.json()["valid"] is False
        assert {
            (error["field"], error["code"])
            for error in existing.json()["errors"]
        } >= {("email", "already_exists")}

        denied_import = client.post(
            base, content=duplicate_existing,
            headers={"Content-Type": "text/csv"},
        )
        assert denied_import.status_code == 422, denied_import.text

        with Session(engine) as session:
            assert session.scalar(
                select(func.count()).select_from(Customer).where(
                    Customer.business_id == business_id,
                )
            ) == customer_count_before
            assert session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                )
            ) == audit_count_before
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
