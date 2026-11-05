"""Cross-tenant authorization regressions for sensitive financial and stock workflows."""

from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import (
    AuditEvent,
    Business,
    BusinessMembership,
    Customer,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Payment,
    PaymentAllocation,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    RecurringInvoiceSchedule,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
    Supplier,
)
from test_api import (
    _configure_test_identity,
    _restore_test_identity,
    _sales_return_fixture,
)


def test_owner_cannot_mutate_foreign_business_financial_and_stock_ids():
    engine, business_id, local_invoice_id, _ = _sales_return_fixture()
    with Session(engine) as session:
        local_invoice = session.get(Invoice, local_invoice_id)
        assert local_invoice is not None and local_invoice.customer_id is not None
        local_customer_id = local_invoice.customer_id
        local_supplier = Supplier(business_id=business_id, name="Local supplier")
        local_product = Product(
            business_id=business_id, name="Local stock item",
            unit_price=Decimal("4.00"), is_stock_tracked=True,
        )
        session.add_all([local_supplier, local_product])
        session.flush()
        local_supplier_id = local_supplier.id
        local_product_id = local_product.id

        foreign_business = Business(name="Foreign workspace", currency_code="EGP")
        session.add(foreign_business)
        session.flush()
        foreign_customer = Customer(
            business_id=foreign_business.id, name="Foreign customer"
        )
        foreign_supplier = Supplier(
            business_id=foreign_business.id, name="Foreign supplier"
        )
        foreign_product = Product(
            business_id=foreign_business.id, name="Foreign stock item",
            unit_price=Decimal("6.00"), is_stock_tracked=True,
        )
        session.add_all([foreign_customer, foreign_supplier, foreign_product])
        session.flush()
        foreign_invoice = Invoice(
            business_id=foreign_business.id,
            customer_id=foreign_customer.id,
            invoice_number="FOREIGN-INV-1",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        session.add(foreign_invoice)
        session.flush()
        foreign_invoice_line = InvoiceLine(
            business_id=foreign_business.id,
            invoice_id=foreign_invoice.id,
            product_id=None,
            description="Foreign test item",
            quantity=Decimal("1.000"),
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
        session.add(foreign_invoice_line)
        session.add(BusinessMembership(
            business_id=foreign_business.id,
            user_subject="test-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        foreign_business_id = foreign_business.id
        foreign_supplier_id = foreign_supplier.id
        foreign_product_id = foreign_product.id
        foreign_invoice_id = foreign_invoice.id
        foreign_invoice_line_id = foreign_invoice_line.id

    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    local_base = f"/api/v1/businesses/{business_id}"
    foreign_base = f"/api/v1/businesses/{foreign_business_id}"
    try:
        foreign_order_response = client.post(
            f"{foreign_base}/purchase-orders",
            json={
                "supplier_id": str(foreign_supplier_id),
                "order_number": "PO-FOREIGN-OWNER-1",
                "currency_code": "EGP",
                "lines": [{
                    "product_id": str(foreign_product_id),
                    "quantity": "2.000",
                    "unit_cost": "3.00",
                }],
            },
        )
        assert foreign_order_response.status_code == 201, foreign_order_response.text
        foreign_order_id = UUID(foreign_order_response.json()["id"])
        foreign_order_line_id = UUID(
            foreign_order_response.json()["lines"][0]["id"]
        ) if foreign_order_response.json().get("lines") else None
        if foreign_order_line_id is None:
            with Session(engine) as session:
                foreign_order_line_id = session.scalar(select(PurchaseOrderLine.id).where(
                    PurchaseOrderLine.purchase_order_id == foreign_order_id
                ))
        assert foreign_order_line_id is not None

        approved_order = client.post(
            f"{foreign_base}/purchase-orders/{foreign_order_id}/approve"
        )
        assert approved_order.status_code == 200, approved_order.text

        foreign_return_response = client.post(
            f"{foreign_base}/sales-returns",
            json={
                "invoice_id": str(foreign_invoice_id),
                "lines": [{
                    "invoice_line_id": str(foreign_invoice_line_id),
                    "quantity": "0.250",
                }],
            },
        )
        assert foreign_return_response.status_code == 201, foreign_return_response.text
        foreign_return_id = UUID(foreign_return_response.json()["id"])

        tenant_ids = (business_id, foreign_business_id)
        protected_models = (
            BusinessMembership, Customer, Invoice, InvoiceLine, Payment,
            PaymentAllocation, Product, StockMovement, Supplier, PurchaseOrder,
            PurchaseOrderLine, SalesReturn, SalesReturnLine,
            RecurringInvoiceSchedule, AuditEvent,
        )

        def snapshot():
            with Session(engine) as session:
                state = {}
                for model in protected_models:
                    rows = session.scalars(
                        select(model).where(model.business_id.in_(tenant_ids))
                    ).all()
                    state[model.__name__] = tuple(sorted(
                        tuple(
                            (column.key, repr(getattr(row, column.key)))
                            for column in model.__table__.columns
                        )
                        for row in rows
                    ))
                return state

        denied_attempts = [
            ("issue foreign invoice", lambda: client.post(
                f"{local_base}/invoices/{foreign_invoice_id}/issue"
            )),
            ("void foreign invoice", lambda: client.post(
                f"{local_base}/invoices/{foreign_invoice_id}/void",
                json={"reason": "cross-business denial regression"},
            )),
            ("allocate payment to foreign invoice", lambda: client.post(
                f"{local_base}/payments",
                json={
                    "amount": "5.00",
                    "currency_code": "EGP",
                    "idempotency_key": "foreign-invoice-payment-attempt",
                    "customer_id": str(local_customer_id),
                    "allocations": [{
                        "invoice_id": str(foreign_invoice_id), "amount": "5.00"
                    }],
                },
            )),
            ("move foreign product stock", lambda: client.post(
                f"{local_base}/stock-movements",
                json={
                    "product_id": str(foreign_product_id),
                    "movement_type": "adjustment",
                    "quantity_delta": "1.000",
                },
            )),
            ("create purchase order with foreign supplier ID", lambda: client.post(
                f"{local_base}/purchase-orders",
                json={
                    "supplier_id": str(foreign_supplier_id),
                    "order_number": "PO-CROSS-BUSINESS-SUPPLIER-ATTEMPT",
                    "currency_code": "EGP",
                    "lines": [{
                        "product_id": str(local_product_id),
                        "quantity": "1.000",
                        "unit_cost": "3.00",
                    }],
                },
            )),
            ("create purchase order with foreign product ID", lambda: client.post(
                f"{local_base}/purchase-orders",
                json={
                    "supplier_id": str(local_supplier_id),
                    "order_number": "PO-CROSS-BUSINESS-PRODUCT-ATTEMPT",
                    "currency_code": "EGP",
                    "lines": [{
                        "product_id": str(foreign_product_id),
                        "quantity": "1.000",
                        "unit_cost": "3.00",
                    }],
                },
            )),
            ("receive foreign purchase order", lambda: client.post(
                f"{local_base}/purchase-orders/{foreign_order_id}/receive",
                json={"lines": [{
                    "line_id": str(foreign_order_line_id), "quantity": "1.000"
                }]},
            )),
            ("create return for foreign invoice", lambda: client.post(
                f"{local_base}/sales-returns",
                json={
                    "invoice_id": str(foreign_invoice_id),
                    "lines": [{
                        "invoice_line_id": str(foreign_invoice_line_id),
                        "quantity": "0.250",
                    }],
                },
            )),
            ("create return with foreign invoice line", lambda: client.post(
                f"{local_base}/sales-returns",
                json={
                    "invoice_id": str(local_invoice_id),
                    "lines": [{
                        "invoice_line_id": str(foreign_invoice_line_id),
                        "quantity": "0.250",
                    }],
                },
            )),
            ("approve foreign sales return", lambda: client.post(
                f"{local_base}/sales-returns/{foreign_return_id}/approve"
            )),
        ]

        for name, request in denied_attempts:
            before = snapshot()
            response = request()
            assert response.status_code == 422, (
                f"{name}: expected 422, got {response.status_code}: {response.text}"
            )
            assert snapshot() == before, (
                f"{name}: cross-business request changed records, stock, payments, or audit events"
            )

        before_reads = snapshot()
        invoice_list = client.get(f"{local_base}/invoices")
        assert invoice_list.status_code == 200, invoice_list.text
        assert "FOREIGN-INV-1" not in invoice_list.text
        customer_export = client.get(f"{local_base}/exports/customers.csv")
        assert customer_export.status_code == 200, customer_export.text
        assert "Foreign customer" not in customer_export.text
        assert snapshot() == before_reads, "tenant-scoped reads changed records or audit events"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
