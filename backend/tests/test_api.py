from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import os
from threading import Barrier
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.main import app
from app.models import (
    AuditEvent, Base, Business, BusinessMembership, Customer, Invoice, InvoiceLine, Notification,
    Product, PurchaseOrder, PurchaseOrderLine, RecurringInvoiceSchedule, StockMovement, Supplier,
    MembershipRole, Payment, PaymentAllocation, SalesReturn, SalesReturnLine,
)
from app.security import AuthenticatedPrincipal


def test_health_endpoint_reports_process_liveness():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_business_endpoints_fail_closed_without_database_or_identity():
    response = TestClient(app).post(
        "/api/v1/businesses/00000000-0000-0000-0000-000000000001/customers",
        json={"name": "Not persisted"},
    )
    assert response.status_code == 503
    assert "Database is not configured" in response.json()["detail"]


def test_business_endpoints_fail_closed_without_trusted_identity():
    engine = create_engine("sqlite+pysqlite://")
    app.state.session_factory = sessionmaker(bind=engine)
    try:
        response = TestClient(app).post(
            "/api/v1/businesses/00000000-0000-0000-0000-000000000001/customers",
            json={"name": "Not persisted"},
        )
        assert response.status_code == 503
        assert "Authentication is not configured" in response.json()["detail"]
    finally:
        del app.state.session_factory
        engine.dispose()


def _sales_return_fixture(discount=Decimal("0.00")):
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Return test shop", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Return test customer")
        session.add(customer)
        session.flush()
        invoice = Invoice(
            business_id=business.id,
            customer_id=customer.id,
            invoice_number="RET-INV-1",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("10.00"),
            tax_total=Decimal("0.00"),
            discount_total=discount,
            total=Decimal("10.00") - discount,
        )
        session.add(invoice)
        session.flush()
        line = InvoiceLine(
            business_id=business.id,
            invoice_id=invoice.id,
            product_id=None,
            description="Test item",
            quantity=Decimal("1.000"),
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
        session.add(line)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="test-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        return engine, business.id, invoice.id, line.id


def _configure_test_identity(engine):
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject="test-subject")
    return previous_factory, previous_resolver


def _restore_test_identity(previous_factory, previous_resolver):
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


def test_two_draft_returns_cannot_overreturn_when_approved_sequentially():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [{"invoice_line_id": str(line_id), "quantity": "0.750"}],
    }
    try:
        first = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        second = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        assert first.status_code == 201
        assert second.status_code == 201

        approved_first = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{first.json()['id']}/approve"
        )
        approved_second = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{second.json()['id']}/approve"
        )
        assert approved_first.status_code == 200
        assert approved_second.status_code == 422
        assert "exceeds the invoiced quantity" in approved_second.json()["detail"]
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_sales_return_amount_respects_invoice_level_discount():
    engine, business_id, invoice_id, line_id = _sales_return_fixture(Decimal("5.00"))
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        created = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns",
            json={"invoice_id": str(invoice_id), "lines": [{"invoice_line_id": str(line_id), "quantity": "1.000"}]},
        )
        assert created.status_code == 201
        assert created.json()["total"] == "5.00"
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve"
        )
        assert approved.status_code == 200
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_fully_discounted_invoice_cannot_be_refunded_at_gross_line_value():
    engine, business_id, invoice_id, line_id = _sales_return_fixture(Decimal("10.00"))
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        created = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns",
            json={"invoice_id": str(invoice_id), "lines": [{"invoice_line_id": str(line_id), "quantity": "1.000"}]},
        )
        assert created.status_code == 201
        assert created.json()["total"] == "0.00"
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve"
        )
        assert approved.status_code == 200
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_sales_return_discount_allocation_reconciles_real_invoice_total():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Rounding return shop", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Rounding customer")
        product = Product(
            business_id=business.id, name="Half-cent item", unit_price=Decimal("0.01"),
            is_stock_tracked=False,
        )
        session.add_all([customer, product])
        session.add(BusinessMembership(
            business_id=business.id, user_subject="test-subject", role=MembershipRole.OWNER,
        ))
        session.commit()
        business_id, customer_id, product_id = business.id, customer.id, product.id
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    try:
        created = client.post(
            f"/api/v1/businesses/{business_id}/invoices",
            json={
                "invoice_number": "RET-ROUND-REAL-1", "currency_code": "EGP",
                "customer_id": str(customer_id), "discount_rate": "33.3333", "tax_rate": "0",
                "lines": [{"product_id": str(product_id), "quantity": "0.500"} for _ in range(3)],
            },
        )
        assert created.status_code == 201, created.text
        invoice_id = created.json()["id"]
        issued = client.post(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", json={})
        assert issued.status_code == 200, issued.text
        detail = client.get(f"/api/v1/businesses/{business_id}/invoices/{invoice_id}")
        assert detail.status_code == 200, detail.text
        invoice = detail.json()
        assert invoice["subtotal"] == "0.03"
        assert invoice["discount_total"] == "0.01"
        assert invoice["total"] == "0.02"
        created_return = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns",
            json={"invoice_id": str(invoice_id), "lines": [
                {"invoice_line_id": line["id"], "quantity": "0.500"} for line in invoice["lines"]
            ]},
        )
        assert created_return.status_code == 201, created_return.text
        assert created_return.json()["total"] == invoice["total"]
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created_return.json()['id']}/approve"
        )
        assert approved.status_code == 200, approved.text
        with Session(engine) as session:
            returned_total = session.scalar(select(func.coalesce(func.sum(SalesReturnLine.amount), 0)).where(
                SalesReturnLine.sales_return_id == UUID(created_return.json()["id"])
            ))
            assert Decimal(str(returned_total)) == Decimal("0.02")
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_duplicate_lines_in_one_return_cannot_exceed_invoiced_quantity():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [
            {"invoice_line_id": str(line_id), "quantity": "0.600"},
            {"invoice_line_id": str(line_id), "quantity": "0.600"},
        ],
    }
    try:
        created = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        assert created.status_code == 201
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve"
        )
        assert approved.status_code == 422
        assert "exceeds the invoiced quantity" in approved.json()["detail"]
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()



def test_concurrent_postgres_return_approvals_cannot_overreturn():
    # This test only uses the explicitly configured CI test database. Never fall back
    # to DATABASE_URL, which may point at a developer or production database.
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to run the PostgreSQL concurrency regression test")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    previous_factory = previous_resolver = None
    identity_configured = False
    try:
        suffix = uuid4().hex[:12]
        with Session(engine) as session:
            business = Business(name=f"Concurrent return test {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            customer = Customer(business_id=business.id, name="Concurrency test customer")
            session.add(customer)
            session.flush()
            invoice = Invoice(
                business_id=business.id,
                customer_id=customer.id,
                invoice_number=f"RET-CONCURRENT-{suffix}",
                status="issued",
                currency_code="EGP",
                subtotal=Decimal("10.00"),
                tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"),
                total=Decimal("10.00"),
            )
            session.add(invoice)
            session.flush()
            line = InvoiceLine(
                business_id=business.id,
                invoice_id=invoice.id,
                product_id=None,
                description="Concurrency test item",
                quantity=Decimal("1.000"),
                unit_price=Decimal("10.00"),
                line_total=Decimal("10.00"),
            )
            session.add(line)
            session.add(BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            ))
            session.commit()
            business_id, invoice_id, line_id = business.id, invoice.id, line.id

        previous_factory, previous_resolver = _configure_test_identity(engine)
        identity_configured = True
        client = TestClient(app)
        payload = {
            "invoice_id": str(invoice_id),
            "lines": [{"invoice_line_id": str(line_id), "quantity": "0.750"}],
        }
        first = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        second = client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
        assert first.status_code == 201
        assert second.status_code == 201
        return_ids = [first.json()["id"], second.json()["id"]]

        start_together = Barrier(2)

        def approve(return_id):
            concurrent_client = TestClient(app)
            start_together.wait(timeout=10)
            response = concurrent_client.post(
                f"/api/v1/businesses/{business_id}/sales-returns/{return_id}/approve"
            )
            return response.status_code, response.json()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(approve, return_ids))

        assert sorted(status for status, _ in results) == [200, 422]
        rejected = next(body for status, body in results if status == 422)
        assert "exceeds the invoiced quantity" in rejected["detail"]

        with Session(engine) as session:
            approved_quantity = session.scalar(
                select(func.coalesce(func.sum(SalesReturnLine.quantity), 0))
                .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
                .where(
                    SalesReturn.invoice_id == invoice_id,
                    SalesReturn.business_id == business_id,
                    SalesReturn.status == "approved",
                )
            )
            assert Decimal(str(approved_quantity or 0)) <= Decimal("1.000")
    finally:
        if identity_configured:
            _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def _half_cent_sales_return_fixture():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Half-cent return shop", currency_code="EGP")
        session.add(business)
        session.flush()
        customer = Customer(business_id=business.id, name="Half-cent return customer")
        session.add(customer)
        session.flush()
        invoice = Invoice(
            business_id=business.id,
            customer_id=customer.id,
            invoice_number="RET-HALF-CENT-1",
            status="issued",
            currency_code="EGP",
            subtotal=Decimal("0.02"),
            tax_total=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("0.02"),
        )
        session.add(invoice)
        session.flush()
        line = InvoiceLine(
            business_id=business.id,
            invoice_id=invoice.id,
            product_id=None,
            description="Half-cent test item",
            quantity=Decimal("1.500"),
            unit_price=Decimal("0.01"),
            line_total=Decimal("0.02"),
        )
        session.add(line)
        session.add(BusinessMembership(
            business_id=business.id,
            user_subject="test-subject",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        return engine, business.id, invoice.id, line.id


def test_partial_returns_cannot_refund_more_than_rounded_invoice_line():
    engine, business_id, invoice_id, line_id = _half_cent_sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    payload = {
        "invoice_id": str(invoice_id),
        "lines": [{"invoice_line_id": str(line_id), "quantity": "0.500"}],
    }
    try:
        created = [
            client.post(f"/api/v1/businesses/{business_id}/sales-returns", json=payload)
            for _ in range(3)
        ]
        assert [response.status_code for response in created] == [201, 201, 201]

        approvals = [
            client.post(
                f"/api/v1/businesses/{business_id}/sales-returns/{response.json()['id']}/approve"
            )
            for response in created
        ]
        assert [response.status_code for response in approvals] == [200, 200, 422]
        assert "return amount exceeds" in approvals[2].json()["detail"]

        with Session(engine) as session:
            total_approved = session.scalar(
                select(func.coalesce(func.sum(SalesReturnLine.amount), 0))
                .join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id)
                .where(
                    SalesReturn.business_id == business_id,
                    SalesReturn.invoice_id == invoice_id,
                    SalesReturn.status == "approved",
                )
            )
        assert Decimal(str(total_approved or 0)) == Decimal("0.02")
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def _set_test_membership_role(engine, role):
    with Session(engine) as session:
        membership = session.scalar(
            select(BusinessMembership).where(
                BusinessMembership.user_subject == "test-subject"
            )
        )
        assert membership is not None
        membership.role = role
        session.commit()


def test_staff_cannot_void_invoice():
    engine, business_id, invoice_id, _ = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    _set_test_membership_role(engine, MembershipRole.STAFF)
    try:
        response = TestClient(app).post(
            f"/api/v1/businesses/{business_id}/invoices/{invoice_id}/void",
            json={"reason": "staff must not void posted invoices"},
        )
        assert response.status_code == 403
        with Session(engine) as session:
            invoice = session.get(Invoice, invoice_id)
            assert invoice.status == "issued"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_owner_can_approve_draft_purchase_order():
    engine, business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Owner approval supplier")
        product = Product(
            business_id=business_id, name="Owner approval product",
            unit_price=Decimal("10.00"), is_stock_tracked=True,
        )
        session.add_all([supplier, product])
        session.commit()
        supplier_id, product_id = supplier.id, product.id
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}"
    try:
        created = client.post(
            f"{base}/purchase-orders",
            json={
                "supplier_id": str(supplier_id), "order_number": "PO-OWNER-APPROVE",
                "currency_code": "EGP",
                "lines": [{"product_id": str(product_id), "quantity": "2.000", "unit_cost": "10.00"}],
            },
        )
        assert created.status_code == 201, created.text
        order_id = UUID(created.json()["id"])
        assert created.json()["status"] == "draft"
        approved = client.post(f"{base}/purchase-orders/{order_id}/approve")
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"
        assert approved.json()["total"] == "20.00"
        with Session(engine) as session:
            order = session.get(PurchaseOrder, order_id)
            assert order.status == "approved"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_staff_cannot_approve_purchase_order():
    engine, business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Approval test supplier")
        product = Product(
            business_id=business_id, name="Approval test product",
            unit_price=Decimal("10.00"), is_stock_tracked=True,
        )
        session.add_all([supplier, product])
        session.commit()
        supplier_id, product_id = supplier.id, product.id
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}"
    try:
        _set_test_membership_role(engine, MembershipRole.STAFF)
        created = client.post(
            f"{base}/purchase-orders",
            json={
                "supplier_id": str(supplier_id), "order_number": "PO-STAFF-APPROVE",
                "currency_code": "EGP",
                "lines": [{"product_id": str(product_id), "quantity": "1.000", "unit_cost": "10.00"}],
            },
        )
        assert created.status_code == 201, created.text
        order_id = UUID(created.json()["id"])
        assert created.json()["status"] == "draft"
        response = client.post(f"{base}/purchase-orders/{order_id}/approve")
        assert response.status_code == 403, response.text
        with Session(engine) as session:
            order = session.get(PurchaseOrder, order_id)
            assert order.status == "draft"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_approving_sales_return_does_not_silently_rewrite_invoice_or_payment_balances():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)
        payment = Payment(
            business_id=business_id,
            customer_id=invoice.customer_id,
            amount=Decimal("4.00"),
            currency_code="EGP",
            idempotency_key="return-does-not-refund-payment",
        )
        session.add(payment)
        session.flush()
        allocation = PaymentAllocation(
            business_id=business_id,
            payment_id=payment.id,
            invoice_id=invoice_id,
            amount=Decimal("4.00"),
        )
        session.add(allocation)
        session.commit()
        payment_id, allocation_id = payment.id, allocation.id

    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}"
    try:
        created = client.post(
            f"{base}/sales-returns",
            json={
                "invoice_id": str(invoice_id),
                "reason": "Returned goods; refund requires a separate audited workflow",
                "lines": [{"invoice_line_id": str(line_id), "quantity": "0.500"}],
            },
        )
        assert created.status_code == 201, created.text
        approved = client.post(f"{base}/sales-returns/{created.json()['id']}/approve")
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"

        # Until a credit-note/refund ledger exists, approving physical goods return
        # must not pretend cash was refunded or mutate the historical issued invoice.
        with Session(engine) as session:
            invoice = session.get(Invoice, invoice_id)
            payment = session.get(Payment, payment_id)
            allocation = session.get(PaymentAllocation, allocation_id)
            assert invoice.status == "issued"
            assert invoice.total == Decimal("10.00")
            assert payment.amount == Decimal("4.00")
            assert payment.currency_code == invoice.currency_code == "EGP"
            assert allocation.amount == Decimal("4.00")
            assert allocation.invoice_id == invoice.id
            assert Decimal(str(invoice.total - allocation.amount)) == Decimal("6.00")
            approved_return = session.get(SalesReturn, UUID(created.json()["id"]))
            assert approved_return.total == Decimal("5.00")
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_staff_can_create_but_cannot_approve_sales_return():
    engine, business_id, invoice_id, line_id = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    _set_test_membership_role(engine, MembershipRole.STAFF)
    client = TestClient(app)
    try:
        created = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns",
            json={
                "invoice_id": str(invoice_id),
                "lines": [{"invoice_line_id": str(line_id), "quantity": "0.250"}],
            },
        )
        assert created.status_code == 201
        approved = client.post(
            f"/api/v1/businesses/{business_id}/sales-returns/{created.json()['id']}/approve"
        )
        assert approved.status_code == 403
        with Session(engine) as session:
            item = session.get(SalesReturn, UUID(created.json()["id"]))
            assert item.status == "draft"
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_staff_is_denied_sensitive_business_routes():
    engine, business_id, invoice_id, _ = _sales_return_fixture()
    with Session(engine) as session:
        product = Product(business_id=business_id, name="Role guard test product",
                          unit_price=Decimal("4.00"))
        session.add(product)
        session.commit()
        product_id = product.id
    previous_factory, previous_resolver = _configure_test_identity(engine)
    _set_test_membership_role(engine, MembershipRole.STAFF)
    client = TestClient(app)
    unknown_id = str(uuid4())
    base = f"/api/v1/businesses/{business_id}"
    try:
        ordinary_edit = client.patch(
            f"{base}/products/{product_id}", json={"name": "Staff updated product name"}
        )
        assert ordinary_edit.status_code == 200, ordinary_edit.text

        # The permitted edit above may legitimately emit an audit event; take
        # the baseline only after it so this assertion isolates denied requests.
        with Session(engine) as session:
            audit_count_before = session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )
            )
            protected_models = (
                Customer, Invoice, InvoiceLine, Payment, Supplier, PurchaseOrder,
            )

            def snapshot_protected_records(session):
                return {
                    model.__name__: tuple(sorted(
                        tuple(
                            (column.key, repr(getattr(record, column.key)))
                            for column in model.__table__.columns
                        )
                        for record in session.scalars(
                            select(model).where(model.business_id == business_id)
                        ).all()
                    ))
                    for model in protected_models
                }

            protected_state_before = snapshot_protected_records(session)

        responses = {
            "issue existing invoice": client.post(
                f"{base}/invoices/{invoice_id}/issue"
            ),
            "create and issue invoice": client.post(
                f"{base}/invoices/issue",
                json={
                    "invoice_number": "STAFF-ISSUE-1",
                    "currency_code": "EGP",
                    "lines": [{"quantity": "1.000", "unit_price": "10.00"}],
                },
            ),
            "record payment": client.post(
                f"{base}/payments",
                json={
                    "amount": "10.00",
                    "currency_code": "EGP",
                    "idempotency_key": "staff-payment-test",
                    "customer_id": unknown_id,
                    "allocations": [],
                },
            ),
            "change stock": client.post(
                f"{base}/stock-movements",
                json={
                    "product_id": unknown_id,
                    "movement_type": "adjustment",
                    "quantity_delta": "1.000",
                },
            ),
            "change pricing": client.post(
                f"{base}/pricing-rules",
                json={"name": "Staff rule", "rule_type": "discount", "rate": "5"},
            ),
            "change product price": client.patch(
                f"{base}/products/{product_id}", json={"unit_price": "99.99"}
            ),
            "change stock tracking": client.patch(
                f"{base}/products/{product_id}", json={"is_stock_tracked": True}
            ),
            "create recurring invoice schedule": client.post(
                f"{base}/recurring-invoices",
                json={"interval_days": 30, "timezone": "UTC",
                      "next_run_at": "2027-01-01T00:00:00Z"},
            ),
            "create notification": client.post(
                f"{base}/notifications",
                json={"kind": "test", "title": "Sensitive action",
                      "body": "Staff should not schedule notifications",
                      "deduplication_key": "staff-notification-test"},
            ),
            "receive purchase order": client.post(
                f"{base}/purchase-orders/{unknown_id}/receive",
                json={"lines": [{"line_id": unknown_id, "quantity": "1.000"}]},
            ),
            "change settings": client.put(
                f"{base}/settings/locale", json={"setting_value": "ar"}
            ),
            "export customers": client.get(f"{base}/exports/customers.csv"),
            "preview CSV import": client.post(
                f"{base}/imports/customers.csv/preview",
                content="name\\nAlice\\n",
                headers={"Content-Type": "text/csv"},
            ),
            "execute CSV import": client.post(
                f"{base}/imports/customers.csv",
                content="name\\nAlice\\n",
                headers={"Content-Type": "text/csv"},
            ),
            "delete customer": client.delete(f"{base}/customers/{unknown_id}"),
            "delete product": client.delete(f"{base}/products/{unknown_id}"),
        }
        assert {name: response.status_code for name, response in responses.items()} == {
            name: 403 for name in responses
        }
        with Session(engine) as session:
            invoice = session.get(Invoice, invoice_id)
            assert invoice.status == "issued"
            product = session.get(Product, product_id)
            assert product.name == "Staff updated product name"
            assert product.unit_price == Decimal("4.00")
            assert product.is_stock_tracked is False
            assert session.scalar(select(func.count()).select_from(SalesReturn)) == 0
            assert session.scalar(select(func.count()).select_from(StockMovement)) == 0
            assert session.scalar(select(func.count()).select_from(RecurringInvoiceSchedule)) == 0
            assert session.scalar(select(func.count()).select_from(Notification)) == 0
            audit_count_after = session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )
            )
            # A denied request must not append business audit metadata or persistent audit rows.
            assert audit_count_after == audit_count_before, (
                "denied STAFF mutations must not append audit events"
            )
            protected_state_after = snapshot_protected_records(session)
            assert protected_state_after == protected_state_before, (
                "denied STAFF requests must not create, delete, or mutate protected business records"
            )
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()

def test_owner_can_change_product_price_and_create_schedules_and_notifications():
    engine, business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        product = Product(business_id=business_id, name="Owner guard test product",
                          unit_price=Decimal("4.00"))
        session.add(product)
        session.commit()
        product_id = product.id
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}"
    try:
        price = client.patch(
            f"{base}/products/{product_id}", json={"unit_price": "8.50"}
        )
        assert price.status_code == 200, price.text
        assert price.json()["unit_price"] == "8.50"

        schedule = client.post(
            f"{base}/recurring-invoices",
            json={"interval_days": 30, "timezone": "UTC",
                  "next_run_at": "2027-01-01T00:00:00Z"},
        )
        assert schedule.status_code == 201, schedule.text



        invalid_schedule = client.post(
            f"{base}/recurring-invoices",
            json={"interval_days": 30, "timezone": "Mars/Olympus",
                  "next_run_at": "2027-01-01T00:00:00Z"},
        )
        assert invalid_schedule.status_code == 422, invalid_schedule.text
        assert "valid IANA timezone" in invalid_schedule.json()["detail"]

        for setting_key in ("API-KEY", "pwd", "passwd", "access-key", "encryption_key"):
            invalid_setting = client.put(
                f"{base}/settings/{setting_key}", json={"setting_value": "blocked"}
            )
            assert invalid_setting.status_code == 422, (
                f"{setting_key}: {invalid_setting.status_code} {invalid_setting.text}"
            )

        safe_setting = client.put(
            f"{base}/settings/locale", json={"setting_value": "ar"}
        )
        assert safe_setting.status_code == 200, safe_setting.text
        assert safe_setting.json()["setting_key"] == "locale"

        notification = client.post(
            f"{base}/notifications",
            json={"kind": "test", "title": "Owner approved",
                  "body": "Owner can create a scheduled notification",
                  "deduplication_key": "owner-notification-test"},
        )
        assert notification.status_code == 201, notification.text

        with Session(engine) as session:
            assert session.get(Product, product_id).unit_price == Decimal("8.50")
            assert session.scalar(select(func.count()).select_from(RecurringInvoiceSchedule)) == 1
            assert session.scalar(select(func.count()).select_from(Notification)) == 1
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()

def test_owner_can_receive_purchase_order_and_records_stock_movement():
    engine, business_id, _, _ = _sales_return_fixture()
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="Test supplier")
        product = Product(
            business_id=business_id, name="Receiving test product",
            unit_price=Decimal("6.00"), is_stock_tracked=True,
        )
        session.add_all([supplier, product])
        session.commit()
        supplier_id, product_id = supplier.id, product.id
    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}"
    try:
        created = client.post(
            f"{base}/purchase-orders",
            json={
                "supplier_id": str(supplier_id), "order_number": "PO-ROLE-OWNER-1",
                "currency_code": "EGP",
                "lines": [{"product_id": str(product_id), "quantity": "2.000", "unit_cost": "3.00"}],
            },
        )
        assert created.status_code == 201, created.text
        assert created.json()["status"] == "draft"
        order_id = UUID(created.json()["id"])
        with Session(engine) as session:
            line = session.scalar(select(PurchaseOrderLine).where(
                PurchaseOrderLine.purchase_order_id == order_id
            ))
            assert line is not None
            line_id = line.id

        approved = client.post(f"{base}/purchase-orders/{order_id}/approve")
        assert approved.status_code == 200, approved.text
        assert approved.json()["status"] == "approved"

        invalid_receipt = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={"lines": [{"line_id": str(line_id), "quantity": "0.000"}]},
        )
        assert invalid_receipt.status_code == 422, invalid_receipt.text

        received = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={"lines": [{"line_id": str(line_id), "quantity": "1.000"}]},
        )
        assert received.status_code == 200, received.text
        assert received.json()["status"] == "partially_received"
        with Session(engine) as session:
            line = session.get(PurchaseOrderLine, line_id)
            assert line.received_quantity == Decimal("1.000")
            assert session.scalar(select(func.count()).select_from(StockMovement).where(
                StockMovement.reference_type == "purchase_order",
                StockMovement.reference_id == order_id,
                StockMovement.movement_type == "receipt",
            )) == 1
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()

def test_receivables_aging_is_business_scoped_currency_safe_and_owner_authorized():
    from datetime import datetime, timezone
    from app.models import Customer, Invoice, Payment, PaymentAllocation

    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Aging shop", currency_code="EGP")
        foreign_business = Business(name="Other aging shop", currency_code="USD")
        session.add_all([business, foreign_business])
        session.flush()
        customer = Customer(business_id=business.id, name="Aging customer")
        session.add(customer)
        session.flush()
        invoices = [
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-30",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 9, 25, tzinfo=timezone.utc), subtotal=Decimal("100.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("100.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-USD",
                status="issued", currency_code="USD", issue_date=datetime(2026, 10, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 10, 10, tzinfo=timezone.utc), subtotal=Decimal("50.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("50.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-NODUE",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                due_date=None, subtotal=Decimal("30.00"), tax_total=Decimal("0.00"),
                discount_total=Decimal("0.00"), total=Decimal("30.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=None, invoice_number="AGE-NOLINK",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 10, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 10, 20, tzinfo=timezone.utc), subtotal=Decimal("15.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("15.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-NOTDUE",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 10, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 10, 31, tzinfo=timezone.utc), subtotal=Decimal("25.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("25.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-SETTLED",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 9, 20, tzinfo=timezone.utc), subtotal=Decimal("40.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("40.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-OVER",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 9, 20, tzinfo=timezone.utc), subtotal=Decimal("20.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("20.00"),
            ),
            Invoice(
                business_id=business.id, customer_id=customer.id, invoice_number="AGE-OVER90",
                status="issued", currency_code="EGP", issue_date=datetime(2026, 5, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 6, 1, tzinfo=timezone.utc), subtotal=Decimal("10.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("10.00"),
            ),
            Invoice(
                business_id=foreign_business.id, customer_id=None, invoice_number="FOREIGN",
                status="issued", currency_code="USD", issue_date=datetime(2026, 9, 1, tzinfo=timezone.utc),
                due_date=datetime(2026, 9, 25, tzinfo=timezone.utc), subtotal=Decimal("900.00"),
                tax_total=Decimal("0.00"), discount_total=Decimal("0.00"), total=Decimal("900.00"),
            ),
        ]
        session.add_all([
            BusinessMembership(business_id=business.id, user_subject="test-subject", role=MembershipRole.OWNER),
            *invoices,
        ])
        session.flush()
        partial_payment = Payment(
            business_id=business.id, customer_id=customer.id, amount=Decimal("30.00"),
            currency_code="EGP", idempotency_key="aging-partial-payment",
        )
        settled_payment = Payment(
            business_id=business.id, customer_id=customer.id, amount=Decimal("40.00"),
            currency_code="EGP", idempotency_key="aging-settled-payment",
        )
        over_payment = Payment(
            business_id=business.id, customer_id=customer.id, amount=Decimal("25.00"),
            currency_code="EGP", idempotency_key="aging-overallocated-payment",
        )
        mismatch_usd_payment = Payment(
            business_id=business.id, customer_id=customer.id, amount=Decimal("5.00"),
            currency_code="USD", idempotency_key="aging-currency-mismatch-usd",
        )
        mismatch_eur_payment = Payment(
            business_id=business.id, customer_id=customer.id, amount=Decimal("3.00"),
            currency_code="EUR", idempotency_key="aging-currency-mismatch-eur",
        )
        session.add_all([partial_payment, settled_payment, over_payment, mismatch_usd_payment, mismatch_eur_payment])
        session.flush()
        session.add_all([
            PaymentAllocation(
                business_id=business.id, payment_id=partial_payment.id,
                invoice_id=next(row.id for row in invoices if row.invoice_number == "AGE-30"),
                amount=Decimal("30.00"),
            ),
            PaymentAllocation(
                business_id=business.id, payment_id=settled_payment.id,
                invoice_id=next(row.id for row in invoices if row.invoice_number == "AGE-SETTLED"),
                amount=Decimal("40.00"),
            ),
            PaymentAllocation(
                business_id=business.id, payment_id=over_payment.id,
                invoice_id=next(row.id for row in invoices if row.invoice_number == "AGE-OVER"),
                amount=Decimal("25.00"),
            ),
            PaymentAllocation(
                business_id=business.id, payment_id=mismatch_usd_payment.id,
                invoice_id=next(row.id for row in invoices if row.invoice_number == "AGE-30"),
                amount=Decimal("5.00"),
            ),
            PaymentAllocation(
                business_id=business.id, payment_id=mismatch_eur_payment.id,
                invoice_id=next(row.id for row in invoices if row.invoice_number == "AGE-30"),
                amount=Decimal("3.00"),
            ),
        ])
        session.commit()
        business_id = business.id

    previous_factory, previous_resolver = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        response = client.get(
            f"/api/v1/businesses/{business_id}/reports/receivables-aging?as_of=2026-10-26"
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["as_of_date"] == "2026-10-26"
        assert payload["invoice_count"] == 6
        assert "never combined" in payload["currency_policy"]

        invoices_by_number = {row["invoice_number"]: row for row in payload["invoices"]}
        assert set(invoices_by_number) == {
            "AGE-30", "AGE-USD", "AGE-NODUE", "AGE-NOLINK", "AGE-NOTDUE", "AGE-OVER90",
        }
        assert "FOREIGN" not in invoices_by_number
        assert "AGE-SETTLED" not in invoices_by_number
        assert "AGE-OVER" not in invoices_by_number

        # Mismatched USD/EUR allocations must never reduce the EGP invoice or be added together.
        egp_invoice = invoices_by_number["AGE-30"]
        assert egp_invoice["aging_bucket"] == "31_60_days"
        assert egp_invoice["allocated_payments"] == "30.00"
        assert egp_invoice["outstanding_amount"] == "70.00"

        warnings = {(row["invoice_number"], row["type"]): row for row in payload["data_quality_warnings"]}
        mismatch = warnings[("AGE-30", "payment_currency_mismatch")]
        assert mismatch["invoice_currency"] == "EGP"
        assert mismatch["mismatched_allocations_amount"] == "3.00 EUR; 5.00 USD"
        overallocated = warnings[("AGE-OVER", "allocations_exceed_invoice_total")]
        assert overallocated["invoice_total"] == "20.00"
        assert overallocated["allocated_payments"] == "25.00"
        assert overallocated["excess_allocated"] == "5.00"

        assert invoices_by_number["AGE-USD"]["aging_bucket"] == "1_30_days"
        assert invoices_by_number["AGE-USD"]["outstanding_amount"] == "50.00"
        assert invoices_by_number["AGE-NODUE"]["aging_bucket"] == "no_due_date"
        assert invoices_by_number["AGE-NODUE"]["days_overdue"] is None
        assert invoices_by_number["AGE-NOLINK"]["customer_link_missing"] is True
        assert invoices_by_number["AGE-NOLINK"]["aging_bucket"] == "1_30_days"
        assert invoices_by_number["AGE-NOTDUE"]["aging_bucket"] == "not_due"
        assert invoices_by_number["AGE-OVER90"]["aging_bucket"] == "over_90_days"

        summaries = {row["currency_code"]: row for row in payload["by_currency"]}
        assert set(summaries) == {"EGP", "USD"}
        assert summaries["EGP"]["total_outstanding"] == "150.00"
        assert summaries["USD"]["total_outstanding"] == "50.00"
        egp_buckets = {row["bucket"]: row["outstanding_amount"] for row in summaries["EGP"]["buckets"]}
        usd_buckets = {row["bucket"]: row["outstanding_amount"] for row in summaries["USD"]["buckets"]}
        assert egp_buckets == {
            "not_due": "25.00",
            "1_30_days": "15.00",
            "31_60_days": "70.00",
            "over_90_days": "10.00",
            "no_due_date": "30.00",
        }
        assert usd_buckets == {"1_30_days": "50.00"}

        app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject="unauthorized-subject")
        denied = client.get(
            f"/api/v1/businesses/{business_id}/reports/receivables-aging?as_of=2026-10-26"
        )
        assert denied.status_code == 403
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_nonmember_cannot_create_supplier_without_writes_or_audit_events():
    engine, business_id, _, _ = _sales_return_fixture()
    previous_factory, previous_resolver = _configure_test_identity(engine)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(subject="nonmember-subject")
    client = TestClient(app)
    try:
        with Session(engine) as session:
            suppliers_before = session.scalar(
                select(func.count()).select_from(Supplier).where(Supplier.business_id == business_id)
            )
            audit_before = session.scalar(
                select(func.count()).select_from(AuditEvent).where(AuditEvent.business_id == business_id)
            )

        response = client.post(
            f"/api/v1/businesses/{business_id}/suppliers",
            json={"name": "Unauthorized supplier"},
        )
        assert response.status_code == 403, response.text

        with Session(engine) as session:
            suppliers_after = session.scalar(
                select(func.count()).select_from(Supplier).where(Supplier.business_id == business_id)
            )
            audit_after = session.scalar(
                select(func.count()).select_from(AuditEvent).where(AuditEvent.business_id == business_id)
            )
        assert suppliers_after == suppliers_before
        assert audit_after == audit_before
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()


def test_owner_can_record_and_idempotently_replay_payment_via_api():
    engine, business_id, invoice_id, _ = _sales_return_fixture()
    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)
        assert invoice is not None and invoice.customer_id is not None
        customer_id = invoice.customer_id

    previous_factory, previous_resolver = _configure_test_identity(engine)
    client = TestClient(app)
    base = f"/api/v1/businesses/{business_id}/payments"
    payload = {
        "amount": "5.00",
        "currency_code": "EGP",
        "idempotency_key": "owner-api-payment-replay",
        "customer_id": str(customer_id),
        "allocations": [{"invoice_id": str(invoice_id), "amount": "5.00"}],
        "method": "cash",
        "reference": "API regression",
    }
    try:
        first = client.post(base, json=payload)
        assert first.status_code == 201, first.text
        assert first.json()["amount"] == "5.00"

        replay = client.post(base, json=payload)
        assert replay.status_code == 201, replay.text
        assert replay.json()["id"] == first.json()["id"]

        with Session(engine) as session:
            assert session.scalar(select(func.count()).select_from(Payment)) == 1
            assert session.scalar(select(func.count()).select_from(PaymentAllocation)) == 1
    finally:
        _restore_test_identity(previous_factory, previous_resolver)
        engine.dispose()
