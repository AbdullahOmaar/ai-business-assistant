"""Cross-tenant resource-ID rejection with full persisted-row snapshots."""

from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import Base, InvoiceLine
from app.security import AuthenticatedPrincipal


def test_foreign_resource_ids_cannot_cross_workflow_boundaries_or_write_rows():
    """Stock, returns, recurring schedules, POs and payments reject foreign IDs atomically."""
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    subject = {"value": "foreign-id-tenant-a-owner"}
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject["value"])

    try:
        client = TestClient(app)

        def use_subject(value: str) -> None:
            subject["value"] = value

        def create_tenant(owner: str, suffix: str):
            use_subject(owner)
            created = client.post(
                "/api/v1/businesses",
                json={"name": f"Foreign ID Tenant {suffix}", "currency_code": "EGP"},
            )
            assert created.status_code == 201, created.text
            business_id = created.json()["id"]
            base = f"/api/v1/businesses/{business_id}"

            customer = client.post(f"{base}/customers", json={"name": f"Customer {suffix}"})
            supplier = client.post(f"{base}/suppliers", json={"name": f"Supplier {suffix}"})
            product = client.post(
                f"{base}/products",
                json={
                    "name": f"Stock Product {suffix}",
                    "unit_price": "10.00",
                    "is_stock_tracked": True,
                },
            )
            assert customer.status_code == 201, customer.text
            assert supplier.status_code == 201, supplier.text
            assert product.status_code == 201, product.text

            invoice = client.post(
                f"{base}/invoices",
                json={
                    "invoice_number": f"INV-FOREIGN-{suffix}",
                    "currency_code": "EGP",
                    "customer_id": customer.json()["id"],
                    "lines": [{
                        "description": f"Service {suffix}",
                        "quantity": "1",
                        "unit_price": "10.00",
                    }],
                },
            )
            assert invoice.status_code == 201, invoice.text
            invoice_id = invoice.json()["id"]
            issued = client.post(f"{base}/invoices/{invoice_id}/issue", json={})
            assert issued.status_code == 200, issued.text
            with app.state.session_factory() as session:
                invoice_line_id = session.scalar(select(InvoiceLine.id).where(
                    InvoiceLine.invoice_id == UUID(invoice_id),
                    InvoiceLine.business_id == UUID(business_id),
                ))
            assert invoice_line_id is not None

            sales_return = client.post(
                f"{base}/sales-returns",
                json={
                    "invoice_id": invoice_id,
                    "lines": [{
                        "invoice_line_id": str(invoice_line_id),
                        "quantity": "0.250",
                    }],
                },
            )
            assert sales_return.status_code == 201, sales_return.text

            return {
                "business_id": business_id,
                "base": base,
                "customer_id": customer.json()["id"],
                "supplier_id": supplier.json()["id"],
                "product_id": product.json()["id"],
                "invoice_id": invoice_id,
                "invoice_line_id": str(invoice_line_id),
                "sales_return_id": sales_return.json()["id"],
            }

        tenant_a = create_tenant("foreign-id-tenant-a-owner", "A")
        tenant_b = create_tenant("foreign-id-tenant-b-owner", "B")
        business_ids = (UUID(tenant_a["business_id"]), UUID(tenant_b["business_id"]))

        def all_business_rows():
            """Include every business-scoped table, both Business rows and audit trails."""
            with app.state.session_factory() as session:
                result = []
                for table in Base.metadata.sorted_tables:
                    if "business_id" in table.c:
                        statement = table.select().where(
                            table.c.business_id.in_(business_ids)
                        )
                    elif table.name == "businesses":
                        statement = table.select().where(
                            table.c.id.in_(business_ids)
                        )
                    else:
                        continue
                    primary_key = list(table.primary_key.columns)
                    if primary_key:
                        statement = statement.order_by(*primary_key)
                    result.append((
                        table.name,
                        tuple(tuple(row) for row in session.execute(statement).all()),
                    ))
                return tuple(result)

        use_subject("foreign-id-tenant-a-owner")
        base = tenant_a["base"]

        attempts = [
            (
                "foreign stock product",
                lambda: client.post(
                    f"{base}/stock-movements",
                    json={
                        "product_id": tenant_b["product_id"],
                        "movement_type": "adjustment",
                        "quantity_delta": "1.000",
                    },
                ),
                "Active stock-tracked product not found in this business",
            ),
            (
                "foreign sales-return invoice",
                lambda: client.post(
                    f"{base}/sales-returns",
                    json={
                        "invoice_id": tenant_b["invoice_id"],
                        "lines": [{
                            "invoice_line_id": tenant_b["invoice_line_id"],
                            "quantity": "0.250",
                        }],
                    },
                ),
                "Issued invoice not found in this business",
            ),
            (
                "foreign invoice line on local sales return",
                lambda: client.post(
                    f"{base}/sales-returns",
                    json={
                        "invoice_id": tenant_a["invoice_id"],
                        "lines": [{
                            "invoice_line_id": tenant_b["invoice_line_id"],
                            "quantity": "0.250",
                        }],
                    },
                ),
                "Return line must reference a line on the original invoice",
            ),
            (
                "foreign sales-return approval",
                lambda: client.post(
                    f"{base}/sales-returns/{tenant_b['sales_return_id']}/approve"
                ),
                "Only draft returns can be approved",
            ),
            (
                "foreign recurring-invoice customer",
                lambda: client.post(
                    f"{base}/recurring-invoices",
                    json={
                        "customer_id": tenant_b["customer_id"],
                        "interval_days": 30,
                        "timezone": "UTC",
                        "next_run_at": "2026-11-30T00:00:00Z",
                    },
                ),
                "Customer not found in this business",
            ),
            (
                "foreign purchase-order supplier",
                lambda: client.post(
                    f"{base}/purchase-orders",
                    json={
                        "supplier_id": tenant_b["supplier_id"],
                        "order_number": "PO-FOREIGN-SUPPLIER",
                        "currency_code": "EGP",
                        "lines": [{
                            "product_id": tenant_a["product_id"],
                            "quantity": "1.000",
                            "unit_cost": "5.00",
                        }],
                    },
                ),
                "Active supplier not found in this business",
            ),
            (
                "foreign purchase-order product",
                lambda: client.post(
                    f"{base}/purchase-orders",
                    json={
                        "supplier_id": tenant_a["supplier_id"],
                        "order_number": "PO-FOREIGN-PRODUCT",
                        "currency_code": "EGP",
                        "lines": [{
                            "product_id": tenant_b["product_id"],
                            "quantity": "1.000",
                            "unit_cost": "5.00",
                        }],
                    },
                ),
                "Every purchase line must reference an active stock-tracked product in this business",
            ),
            (
                "foreign payment allocation invoice",
                lambda: client.post(
                    f"{base}/payments",
                    json={
                        "amount": "1.00",
                        "currency_code": "EGP",
                        "idempotency_key": "foreign-tenant-invoice-allocation",
                        "customer_id": tenant_a["customer_id"],
                        "allocations": [{
                            "invoice_id": tenant_b["invoice_id"],
                            "amount": "1.00",
                        }],
                    },
                ),
                "Payment can only be allocated to an issued invoice in this business",
            ),
        ]

        for label, request, expected_detail in attempts:
            before = all_business_rows()
            response = request()
            assert response.status_code == 422, (
                f"{label}: expected HTTP 422, got {response.status_code}: {response.text}"
            )
            assert response.json()["detail"] == expected_detail
            assert all_business_rows() == before, (
                f"{label}: rejected foreign resource ID changed tenant rows or AuditEvent"
            )

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
