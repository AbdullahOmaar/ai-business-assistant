from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.models import (
    AuditEvent,
    Base,
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
    StockMovement,
    Supplier,
)
from app.security import AuthenticatedPrincipal


def test_foreign_business_invoice_references_fail_without_writes_or_audit_events():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Invoice tenant", currency_code="EGP")
        foreign_business = Business(name="Foreign invoice tenant", currency_code="USD")
        session.add_all([business, foreign_business])
        session.flush()
        foreign_customer = Customer(
            business_id=foreign_business.id, name="Foreign customer"
        )
        foreign_product = Product(
            business_id=foreign_business.id,
            name="Foreign product",
            unit_price=Decimal("12.00"),
        )
        session.add_all([foreign_customer, foreign_product])
        session.add(
            BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            )
        )
        session.commit()
        business_id = business.id
        foreign_customer_id = foreign_customer.id
        foreign_product_id = foreign_product.id

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject="test-subject"
    )
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}/invoices"

    def invoice_state():
        with Session(engine) as session:
            return (
                session.scalar(
                    select(func.count()).select_from(Invoice).where(
                        Invoice.business_id == business_id
                    )
                ),
                session.scalar(
                    select(func.count()).select_from(InvoiceLine).where(
                        InvoiceLine.business_id == business_id
                    )
                ),
                session.scalar(
                    select(func.count()).select_from(AuditEvent).where(
                        AuditEvent.business_id == business_id
                    )
                ),
            )

    try:
        baseline = invoice_state()
        foreign_customer_response = client.post(
            base,
            json={
                "invoice_number": "FOREIGN-CUSTOMER-1",
                "currency_code": "EGP",
                "customer_id": str(foreign_customer_id),
                "lines": [
                    {
                        "description": "Manual line",
                        "quantity": "1.000",
                        "unit_price": "10.00",
                    }
                ],
            },
        )
        assert foreign_customer_response.status_code == 422, foreign_customer_response.text
        assert foreign_customer_response.json()["detail"] == (
            "Active customer not found in this business"
        )
        assert invoice_state() == baseline

        foreign_product_response = client.post(
            base,
            json={
                "invoice_number": "FOREIGN-PRODUCT-1",
                "currency_code": "EGP",
                "lines": [
                    {
                        "product_id": str(foreign_product_id),
                        "quantity": "1.000",
                    }
                ],
            },
        )
        assert foreign_product_response.status_code == 422, foreign_product_response.text
        assert foreign_product_response.json()["detail"] == (
            "Invoice product not found in this business"
        )
        assert invoice_state() == baseline
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


def test_payment_cannot_allocate_to_foreign_invoice_without_side_effects():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Payment tenant", currency_code="EGP")
        foreign_business = Business(name="Foreign payment tenant", currency_code="EGP")
        session.add_all([business, foreign_business])
        session.flush()
        customer = Customer(business_id=business.id, name="Local customer")
        foreign_customer = Customer(
            business_id=foreign_business.id, name="Foreign customer"
        )
        session.add_all([customer, foreign_customer])
        session.flush()
        foreign_invoice = Invoice(
            business_id=foreign_business.id,
            customer_id=foreign_customer.id,
            invoice_number="FOREIGN-PAYMENT-INV",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        session.add(foreign_invoice)
        session.add(
            BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            )
        )
        session.commit()
        business_id = business.id
        customer_id = customer.id
        foreign_invoice_id = foreign_invoice.id

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject="test-subject"
    )
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}/payments"

    def payment_state():
        with Session(engine) as session:
            return (
                session.scalar(select(func.count()).select_from(Payment).where(
                    Payment.business_id == business_id
                )),
                session.scalar(select(func.count()).select_from(PaymentAllocation).where(
                    PaymentAllocation.business_id == business_id
                )),
                session.scalar(select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )),
            )

    try:
        baseline = payment_state()
        response = client.post(
            base,
            json={
                "amount": "10.00",
                "currency_code": "EGP",
                "idempotency_key": "foreign-invoice-allocation",
                "customer_id": str(customer_id),
                "allocations": [{
                    "invoice_id": str(foreign_invoice_id),
                    "amount": "10.00",
                }],
                "method": "cash",
            },
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"] == (
            "Payment can only be allocated to an issued invoice in this business"
        )
        assert payment_state() == baseline
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


def test_purchase_order_from_another_business_cannot_be_received():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Receiving tenant", currency_code="EGP")
        foreign_business = Business(name="Foreign receiving tenant", currency_code="EGP")
        session.add_all([business, foreign_business])
        session.flush()
        supplier = Supplier(business_id=foreign_business.id, name="Foreign supplier")
        product = Product(
            business_id=foreign_business.id,
            name="Foreign tracked product",
            unit_price=Decimal("8.00"),
            is_stock_tracked=True,
        )
        session.add_all([supplier, product])
        session.flush()
        order = PurchaseOrder(
            business_id=foreign_business.id,
            supplier_id=supplier.id,
            order_number="FOREIGN-PO-1",
            status="approved",
            currency_code="EGP",
            total=Decimal("6.00"),
        )
        session.add(order)
        session.flush()
        line = PurchaseOrderLine(
            business_id=foreign_business.id,
            purchase_order_id=order.id,
            product_id=product.id,
            quantity=Decimal("2.000"),
            unit_cost=Decimal("3.00"),
        )
        session.add(line)
        session.add(
            BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            )
        )
        session.commit()
        business_id = business.id
        foreign_order_id = order.id
        foreign_line_id = line.id

    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject="test-subject"
    )
    client = TestClient(app)
    try:
        with Session(engine) as session:
            foreign_received_before = session.get(
                PurchaseOrderLine, foreign_line_id
            ).received_quantity
            stock_before = session.scalar(
                select(func.count()).select_from(StockMovement)
            )
            audit_before = session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )
            )

        response = client.post(
            f"/api/v1/businesses/{business_id}/purchase-orders/{foreign_order_id}/receive",
            json={"lines": [{"line_id": str(foreign_line_id), "quantity": "1.000"}]},
        )
        assert response.status_code == 422, response.text
        assert response.json()["detail"] == "Purchase order is not available for receiving"

        with Session(engine) as session:
            assert session.get(
                PurchaseOrderLine, foreign_line_id
            ).received_quantity == foreign_received_before
            assert session.scalar(
                select(func.count()).select_from(StockMovement)
            ) == stock_before
            assert session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )
            ) == audit_before
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
