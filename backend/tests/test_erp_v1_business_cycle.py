"""Production V1 ERP scenario regression.

This is an API + persistence scenario using isolated synthetic SQLite data.
PostgreSQL-specific locking/concurrency remains covered by the separate
PostgreSQL test module and must run in disposable CI PostgreSQL.
"""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AuditEvent,
    Base,
    Payment,
    InvoiceLine,
    PaymentAllocation,
    PurchaseOrderLine,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
)
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def erp_environment():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        "production-v1-erp-owner"
    )
    try:
        yield {"client": TestClient(app), "engine": engine}
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


def test_erp_v1_customer_sale_partial_collection_and_report_reconcile(erp_environment):
    """Exercise a real business flow and compare expected amounts to stored results."""
    client = erp_environment["client"]
    engine = erp_environment["engine"]

    # 1. Create the business and customer as a real OWNER workflow.
    business_response = client.post(
        "/api/v1/businesses",
        json={"name": "Production V1 Synthetic Shop", "currency_code": "EGP"},
    )
    assert business_response.status_code == 201, business_response.text
    business_id = business_response.json()["id"]

    customer_response = client.post(
        f"/api/v1/businesses/{business_id}/customers",
        json={"name": "Synthetic ERP Customer", "email": "erp-customer@example.test"},
    )
    assert customer_response.status_code == 201, customer_response.text
    customer_id = customer_response.json()["id"]
    business_uuid = UUID(business_id)
    customer_uuid = UUID(customer_id)

    # 2. Create an inventory-tracked product with 10 units of opening stock.
    product_response = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={
            "name": "Synthetic ERP Item",
            "sku": "ERP-V1-ITEM-001",
            "unit_price": "200.00",
            "is_stock_tracked": True,
            "opening_quantity": "10.000",
        },
    )
    assert product_response.status_code == 201, product_response.text
    product_id = product_response.json()["id"]
    product_uuid = UUID(product_id)

    # 3. Draft invoice: 3 × EGP 200 = 600; 10% discount = 60;
    #    tax 14% on 540 = 75.60; total = EGP 615.60.
    invoice_response = client.post(
        f"/api/v1/businesses/{business_id}/invoices",
        json={
            "invoice_number": "ERP-V1-INV-001",
            "currency_code": "EGP",
            "customer_id": customer_id,
            "discount_rate": "10",
            "tax_rate": "14",
            "lines": [{"product_id": product_id, "quantity": "3.000"}],
        },
    )
    assert invoice_response.status_code == 201, invoice_response.text
    invoice = invoice_response.json()
    invoice_id = invoice["id"]
    assert Decimal(invoice["subtotal"]) == Decimal("600.00")
    assert Decimal(invoice["discount_total"]) == Decimal("60.00")
    assert Decimal(invoice["tax_total"]) == Decimal("75.60")
    assert Decimal(invoice["total"]) == Decimal("615.60")
    assert invoice["status"] == "draft"

    # 4. Issue invoice and verify the stock movement was persisted.
    issued_response = client.post(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue",
        json={},
    )
    assert issued_response.status_code == 200, issued_response.text
    assert issued_response.json()["status"] == "issued"

    with Session(engine) as session:
        stock_balance = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
            )
        )
        assert Decimal(str(stock_balance)) == Decimal("7.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
                StockMovement.movement_type == "sale",
            )
        ) == 1

    # 5. Collect EGP 400 against the invoice; the receivable must be EGP 215.60.
    payment_payload = {
        "amount": "400.00",
        "currency_code": "EGP",
        "idempotency_key": "erp-v1-payment-001",
        "customer_id": customer_id,
        "method": "cash",
        "allocations": [{"invoice_id": invoice_id, "amount": "400.00"}],
    }
    payment_response = client.post(
        f"/api/v1/businesses/{business_id}/payments",
        json=payment_payload,
    )
    assert payment_response.status_code == 201, payment_response.text
    payment_id = payment_response.json()["id"]
    assert Decimal(payment_response.json()["amount"]) == Decimal("400.00")

    # Exact replay returns the same payment and must not duplicate financial rows.
    replay_response = client.post(
        f"/api/v1/businesses/{business_id}/payments",
        json=payment_payload,
    )
    assert replay_response.status_code == 201, replay_response.text
    assert replay_response.json()["id"] == payment_id

    # Reusing the idempotency key with changed data is rejected.
    changed_replay = {**payment_payload, "amount": "401.00"}
    changed_response = client.post(
        f"/api/v1/businesses/{business_id}/payments",
        json=changed_replay,
    )
    assert changed_response.status_code == 422, changed_response.text

    with Session(engine) as session:
        assert session.scalar(
            select(func.count()).select_from(Payment).where(
                Payment.business_id == business_uuid
            )
        ) == 1
        assert session.scalar(
            select(func.count()).select_from(PaymentAllocation).where(
                PaymentAllocation.business_id == business_uuid
            )
        ) == 1
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_uuid,
                AuditEvent.action == "payment.recorded",
            )
        ) == 1

    # 6. Dashboard must distinguish invoiced sales, collected cash, and receivable.
    dashboard_response = client.get(
        f"/api/v1/businesses/{business_id}/dashboard"
    )
    assert dashboard_response.status_code == 200, dashboard_response.text
    dashboard = dashboard_response.json()
    assert Decimal(dashboard["invoiced_sales"][0]["total"]) == Decimal("615.60")
    assert Decimal(dashboard["collected_payments"][0]["total"]) == Decimal("400.00")
    assert Decimal(dashboard["outstanding_balances"][0]["total"]) == Decimal("215.60")
    assert any("does not claim net profit" in item for item in dashboard["limitations"])

    # 7. Record a synthetic operating expense and reconcile the preliminary report.
    expense_response = client.post(
        f"/api/v1/businesses/{business_id}/expenses",
        json={
            "category": "operations",
            "description": "Synthetic operating expense",
            "amount": "100.00",
            "currency_code": "EGP",
            "incurred_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert expense_response.status_code == 201, expense_response.text

    report_response = client.get(
        f"/api/v1/businesses/{business_id}/profit-loss",
        params={"period": "all"},
    )
    assert report_response.status_code == 200, report_response.text
    report = report_response.json()
    assert report["revenue_basis"] == (
        "gross issued invoice totals before sales returns; stored invoice tax is included"
    )
    assert len(report["currencies"]) == 1
    egp = report["currencies"][0]
    assert egp["currency_code"] == "EGP"
    assert Decimal(egp["revenue"]) == Decimal("615.60")
    assert Decimal(egp["expenses"]) == Decimal("100.00")
    assert Decimal(egp["operating_result_before_cost_of_goods"]) == Decimal("515.60")
    assert any("tax amounts" in item for item in report["limitations"])
    assert any("excludes cost of goods sold" in item for item in report["limitations"])


def test_erp_v1_purchase_receiving_reconciles_order_and_stock(erp_environment):
    """Exercise supplier PO approval and partial/final receiving without over-receipt."""
    client = erp_environment["client"]
    engine = erp_environment["engine"]

    business_response = client.post(
        "/api/v1/businesses",
        json={"name": "Production V1 Purchasing Shop", "currency_code": "EGP"},
    )
    assert business_response.status_code == 201, business_response.text
    business_id = business_response.json()["id"]
    business_uuid = UUID(business_id)

    supplier_response = client.post(
        f"/api/v1/businesses/{business_id}/suppliers",
        json={"name": "Synthetic Supplier"},
    )
    assert supplier_response.status_code == 201, supplier_response.text
    supplier_id = supplier_response.json()["id"]

    product_response = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={
            "name": "Synthetic Purchased Item",
            "sku": "ERP-V1-PURCHASE-001",
            "unit_price": "200.00",
            "is_stock_tracked": True,
            "opening_quantity": "10.000",
        },
    )
    assert product_response.status_code == 201, product_response.text
    product_id = product_response.json()["id"]
    product_uuid = UUID(product_id)

    order_response = client.post(
        f"/api/v1/businesses/{business_id}/purchase-orders",
        json={
            "supplier_id": supplier_id,
            "order_number": "ERP-V1-PO-001",
            "currency_code": "EGP",
            "lines": [{
                "product_id": product_id,
                "quantity": "5.000",
                "unit_cost": "100.00",
            }],
        },
    )
    assert order_response.status_code == 201, order_response.text
    order = order_response.json()
    order_id = order["id"]
    order_uuid = UUID(order_id)
    assert Decimal(order["total"]) == Decimal("500.00")
    assert order["status"] == "draft"

    approved = client.post(
        f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/approve"
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    listed_orders = client.get(
        f"/api/v1/businesses/{business_id}/purchase-orders"
    )
    assert listed_orders.status_code == 200, listed_orders.text
    line_id = listed_orders.json()[0]["lines"][0]["id"]

    partial = client.post(
        f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive",
        json={"lines": [{"line_id": line_id, "quantity": "3.000"}]},
    )
    assert partial.status_code == 200, partial.text
    assert partial.json()["status"] == "partially_received"

    with Session(engine) as session:
        partial_stock = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
            )
        )
        received = session.scalar(
            select(PurchaseOrderLine.received_quantity).where(
                PurchaseOrderLine.business_id == business_uuid,
                PurchaseOrderLine.purchase_order_id == order_uuid,
            )
        )
        assert Decimal(str(partial_stock)) == Decimal("13.000")
        assert Decimal(str(received)) == Decimal("3.000")

    # A request above the remaining 2 units must fail without changing stock.
    over_receipt = client.post(
        f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive",
        json={"lines": [{"line_id": line_id, "quantity": "3.000"}]},
    )
    assert over_receipt.status_code == 422, over_receipt.text
    with Session(engine) as session:
        unchanged_stock = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
            )
        )
        unchanged_received = session.scalar(
            select(PurchaseOrderLine.received_quantity).where(
                PurchaseOrderLine.business_id == business_uuid,
                PurchaseOrderLine.purchase_order_id == order_uuid,
            )
        )
        assert Decimal(str(unchanged_stock)) == Decimal("13.000")
        assert Decimal(str(unchanged_received)) == Decimal("3.000")

    final = client.post(
        f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive",
        json={"lines": [{"line_id": line_id, "quantity": "2.000"}]},
    )
    assert final.status_code == 200, final.text
    assert final.json()["status"] == "received"

    with Session(engine) as session:
        final_stock = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
            )
        )
        final_received = session.scalar(
            select(PurchaseOrderLine.received_quantity).where(
                PurchaseOrderLine.business_id == business_uuid,
                PurchaseOrderLine.purchase_order_id == order_uuid,
            )
        )
        assert Decimal(str(final_stock)) == Decimal("15.000")
        assert Decimal(str(final_received)) == Decimal("5.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
                StockMovement.movement_type == "receipt",
            )
        ) == 2
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_uuid,
                AuditEvent.action == "purchase_order.received",
            )
        ) == 2



def test_erp_v1_approved_sales_return_restores_stock_and_discloses_report_gap(erp_environment):
    """Verify the implemented return quantity/discount path without claiming a refund."""
    client = erp_environment["client"]
    engine = erp_environment["engine"]

    business_response = client.post(
        "/api/v1/businesses",
        json={"name": "Production V1 Returns Shop", "currency_code": "EGP"},
    )
    assert business_response.status_code == 201, business_response.text
    business_id = business_response.json()["id"]
    business_uuid = UUID(business_id)

    customer_response = client.post(
        f"/api/v1/businesses/{business_id}/customers",
        json={"name": "Synthetic Return Customer"},
    )
    assert customer_response.status_code == 201, customer_response.text

    product_response = client.post(
        f"/api/v1/businesses/{business_id}/products",
        json={
            "name": "Synthetic Return Item",
            "unit_price": "200.00",
            "is_stock_tracked": True,
            "opening_quantity": "10.000",
        },
    )
    assert product_response.status_code == 201, product_response.text
    product_id = product_response.json()["id"]
    product_uuid = UUID(product_id)

    invoice_response = client.post(
        f"/api/v1/businesses/{business_id}/invoices",
        json={
            "invoice_number": "ERP-V1-RETURN-001",
            "currency_code": "EGP",
            "customer_id": customer_response.json()["id"],
            "discount_rate": "10",
            "tax_rate": "14",
            "lines": [{"product_id": product_id, "quantity": "3.000"}],
        },
    )
    assert invoice_response.status_code == 201, invoice_response.text
    invoice_id = invoice_response.json()["id"]
    assert Decimal(invoice_response.json()["total"]) == Decimal("615.60")

    issued = client.post(
        f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue",
        json={},
    )
    assert issued.status_code == 200, issued.text

    with Session(engine) as session:
        invoice_line_id = session.scalar(
            select(InvoiceLine.id).where(
                InvoiceLine.business_id == business_uuid,
                InvoiceLine.invoice_id == UUID(invoice_id),
            )
        )
        stock_after_sale = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
            )
        )
        assert Decimal(str(stock_after_sale)) == Decimal("7.000")

    return_response = client.post(
        f"/api/v1/businesses/{business_id}/sales-returns",
        json={
            "invoice_id": invoice_id,
            "reason": "Synthetic one-unit return",
            "lines": [{"invoice_line_id": str(invoice_line_id), "quantity": "1.000"}],
        },
    )
    assert return_response.status_code == 201, return_response.text
    return_id = return_response.json()["id"]
    assert return_response.json()["status"] == "draft"
    # Discounted line value is EGP 540; one of three units returns EGP 180
    # before any tax allocation (which is not implemented in the current return model).
    assert Decimal(return_response.json()["total"]) == Decimal("180.00")

    approved = client.post(
        f"/api/v1/businesses/{business_id}/sales-returns/{return_id}/approve"
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    with Session(engine) as session:
        stock_after_return = session.scalar(
            select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_uuid,
                StockMovement.product_id == product_uuid,
            )
        )
        approved_returns = session.scalar(
            select(func.count()).select_from(SalesReturn).where(
                SalesReturn.business_id == business_uuid,
                SalesReturn.status == "approved",
            )
        )
        return_line_amount = session.scalar(
            select(SalesReturnLine.amount).where(
                SalesReturnLine.business_id == business_uuid,
                SalesReturnLine.sales_return_id == UUID(return_id),
            )
        )
        payment_count = session.scalar(
            select(func.count()).select_from(Payment).where(
                Payment.business_id == business_uuid
            )
        )
        assert Decimal(str(stock_after_return)) == Decimal("8.000")
        assert approved_returns == 1
        assert Decimal(str(return_line_amount)) == Decimal("180.00")
        assert payment_count == 0

    report_response = client.get(
        f"/api/v1/businesses/{business_id}/profit-loss",
        params={"period": "all"},
    )
    assert report_response.status_code == 200, report_response.text
    report = report_response.json()
    egp = report["currencies"][0]
    assert Decimal(egp["revenue"]) == Decimal("615.60")
    assert Decimal(egp["approved_return_total"]) == Decimal("180.00")
    assert any("approved sales returns are not netted" in item for item in report["limitations"])
    assert any("tax allocation to returns" in item for item in report["limitations"])
