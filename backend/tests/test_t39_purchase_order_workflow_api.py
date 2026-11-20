"""Integration coverage for purchase-order lifecycle API extensions."""
from decimal import Decimal
from uuid import UUID

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.extended_api import list_purchase_orders
from app.main import app
from app.models import AuditEvent, Business, BusinessMembership, MembershipRole, Product, PurchaseOrder, PurchaseOrderLine, StockMovement, Supplier
from app.security import AuthenticatedPrincipal
from test_api import _configure_test_identity, _restore_test_identity, _sales_return_fixture
from test_t39_purchase_receiving_api import _create_approved_order, _receipt_headers


def _draft_order(engine, client, business_id, number="PO-T39-DRAFT"):
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name=f"Supplier {number}")
        product = Product(business_id=business_id, name=f"Product {number}",
                          unit_price=Decimal("10.00"), is_stock_tracked=True)
        session.add_all([supplier, product])
        session.commit()
        supplier_id, product_id = supplier.id, product.id
    response = client.post(f"/api/v1/businesses/{business_id}/purchase-orders", json={
        "supplier_id": str(supplier_id), "order_number": number, "currency_code": "EGP",
        "lines": [{"product_id": str(product_id), "quantity": "2.000", "unit_cost": "3.00"}],
    })
    assert response.status_code == 201, response.text
    return UUID(response.json()["id"]), supplier_id, product_id


def test_purchase_order_detail_is_member_scoped_and_contains_product_supplier_and_remaining():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, _, product_ids = _create_approved_order(engine, client, business_id, [("4.000", True)], "PO-T39-DETAIL")
        response = client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["supplier"]["name"]
        assert body["lines"][0]["product"]["id"] == str(product_ids[0])
        assert body["lines"][0]["remaining_quantity"] == "4.000"
        with Session(engine) as session:
            other = Business(name="T39 foreign detail tenant", currency_code="EGP")
            session.add(other)
            session.commit()
            foreign_id = other.id
        assert client.get(f"/api/v1/businesses/{foreign_id}/purchase-orders/{order_id}").status_code == 403
        assert client.get(f"/api/v1/businesses/{business_id}/purchase-orders/00000000-0000-0000-0000-000000000001").status_code == 404
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_owner_can_replace_and_cancel_draft_with_audit_and_state_guards():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, supplier_id, _ = _draft_order(engine, client, business_id, "PO-T39-EDIT")
        with Session(engine) as session:
            product = Product(business_id=business_id, name="Replacement stock",
                              unit_price=Decimal("8.00"), is_stock_tracked=True)
            session.add(product)
            session.commit()
            product_id = product.id
        update = client.put(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}", json={
            "supplier_id": str(supplier_id), "order_number": "PO-T39-EDITED", "currency_code": "egp",
            "lines": [{"product_id": str(product_id), "quantity": "5.000", "unit_cost": "2.50"}],
        })
        assert update.status_code == 200, update.text
        assert update.json()["total"] == "12.50"
        detail = client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}").json()
        assert len(detail["lines"]) == 1 and detail["lines"][0]["product"]["id"] == str(product_id)
        cancel = client.post(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/cancel")
        assert cancel.status_code == 200 and cancel.json()["status"] == "cancelled"
        rejected = client.put(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}", json={
            "supplier_id": str(supplier_id), "order_number": "PO-T39-LATE", "currency_code": "EGP",
            "lines": [{"product_id": str(product_id), "quantity": "1.000", "unit_cost": "1.00"}],
        })
        assert rejected.status_code == 422
        with Session(engine) as session:
            actions = set(session.scalars(select(AuditEvent.action).where(
                AuditEvent.business_id == business_id, AuditEvent.target_type == "purchase_order",
                AuditEvent.target_id == str(order_id),
            )).all())
        assert {"purchase_order.created", "purchase_order.updated", "purchase_order.cancelled"} <= actions
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_staff_cannot_edit_cancel_or_read_owner_only_purchase_order_history():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, supplier_id, _ = _draft_order(engine, client, business_id, "PO-T39-STAFF")
        with Session(engine) as session:
            membership = session.scalar(select(BusinessMembership).where(
                BusinessMembership.business_id == business_id,
                BusinessMembership.user_subject == "test-subject",
            ))
            membership.role = MembershipRole.STAFF
            session.commit()

        def persisted_state():
            with Session(engine) as session:
                order = session.get(PurchaseOrder, order_id)
                lines = session.scalars(select(PurchaseOrderLine).where(
                    PurchaseOrderLine.business_id == business_id,
                    PurchaseOrderLine.purchase_order_id == order_id,
                ).order_by(PurchaseOrderLine.id)).all()
                movements = session.scalars(select(StockMovement.id).where(
                    StockMovement.business_id == business_id,
                ).order_by(StockMovement.id)).all()
                audit_ids = session.scalars(select(AuditEvent.id).where(
                    AuditEvent.business_id == business_id,
                ).order_by(AuditEvent.id)).all()
                return (
                    (order.status, order.order_number, str(order.total)),
                    tuple((str(line.id), str(line.product_id), str(line.quantity),
                           str(line.unit_cost), str(line.received_quantity)) for line in lines),
                    tuple(str(item) for item in movements),
                    tuple(str(item) for item in audit_ids),
                )

        payload = {"supplier_id": str(supplier_id), "order_number": "PO-T39-STAFF-EDIT",
                   "currency_code": "EGP", "lines": [{"product_id": "00000000-0000-0000-0000-000000000001",
                   "quantity": "1.000", "unit_cost": "1.00"}]}
        before = persisted_state()
        denied_requests = [
            lambda: client.put(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}", json=payload),
            lambda: client.post(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/cancel"),
            lambda: client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receipts"),
            lambda: client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/activity"),
        ]
        for request in denied_requests:
            response = request()
            assert response.status_code == 403, response.text
            assert persisted_state() == before

        assert client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}").status_code == 200
        assert persisted_state() == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_receipt_history_and_activity_are_read_only_and_tenant_scoped():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, line_ids, product_ids = _create_approved_order(engine, client, business_id, [("3.000", True)], "PO-T39-HISTORY")
        received = client.post(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive",
                               headers=_receipt_headers(),
                               json={"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]})
        assert received.status_code == 200, received.text
        receipts = client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receipts")
        assert receipts.status_code == 200, receipts.text
        assert len(receipts.json()["items"]) == 1
        assert receipts.json()["items"][0]["product"]["id"] == str(product_ids[0])
        assert receipts.json()["items"][0]["quantity_delta"] == "1.000"
        activity = client.get(f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/activity")
        assert activity.status_code == 200, activity.text
        actions = {row["action"] for row in activity.json()["items"]}
        assert {"purchase_order.created", "purchase_order.approved", "purchase_order.received"} <= actions
        with Session(engine) as session:
            movement_count = len(session.scalars(select(StockMovement).where(
                StockMovement.business_id == business_id, StockMovement.reference_type == "purchase_order",
                StockMovement.reference_id == order_id,
            )).all())
        assert movement_count == len(receipts.json()["items"]) == 1
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_owner_cannot_update_draft_with_foreign_or_inactive_references_without_writes():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        order_id, supplier_id, product_id = _draft_order(
            engine, client, business_id, "PO-T39-REFERENCE-GUARDS"
        )
        with Session(engine) as session:
            foreign_business = Business(name="T39 foreign update tenant", currency_code="EGP")
            session.add(foreign_business)
            session.flush()
            foreign_supplier = Supplier(business_id=foreign_business.id, name="Foreign update supplier")
            foreign_product = Product(
                business_id=foreign_business.id, name="Foreign update product",
                unit_price=Decimal("9.00"), is_stock_tracked=True,
            )
            inactive_supplier = Supplier(
                business_id=business_id, name="Inactive update supplier", is_active=False
            )
            inactive_product = Product(
                business_id=business_id, name="Inactive update product",
                unit_price=Decimal("9.00"), is_stock_tracked=True, is_active=False,
            )
            session.add_all([foreign_supplier, foreign_product, inactive_supplier, inactive_product])
            session.commit()
            foreign_supplier_id, foreign_product_id = foreign_supplier.id, foreign_product.id
            inactive_supplier_id, inactive_product_id = inactive_supplier.id, inactive_product.id

        def persisted_state():
            with Session(engine) as session:
                order = session.get(PurchaseOrder, order_id)
                lines = session.scalars(select(PurchaseOrderLine).where(
                    PurchaseOrderLine.business_id == business_id,
                    PurchaseOrderLine.purchase_order_id == order_id,
                ).order_by(PurchaseOrderLine.id)).all()
                movements = session.scalars(select(StockMovement.id).where(
                    StockMovement.business_id == business_id,
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id == order_id,
                ).order_by(StockMovement.id)).all()
                events = session.scalars(select(AuditEvent.id).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.target_type == "purchase_order",
                    AuditEvent.target_id == str(order_id),
                ).order_by(AuditEvent.id)).all()
                return (
                    (order.status, order.supplier_id, order.order_number,
                     order.currency_code, str(order.total)),
                    tuple((str(line.id), str(line.product_id), str(line.quantity),
                           str(line.unit_cost), str(line.received_quantity)) for line in lines),
                    tuple(str(item) for item in movements),
                    tuple(str(item) for item in events),
                )

        cases = [
            (foreign_supplier_id, product_id, "PO-T39-FOREIGN-SUPPLIER"),
            (supplier_id, foreign_product_id, "PO-T39-FOREIGN-PRODUCT"),
            (inactive_supplier_id, product_id, "PO-T39-INACTIVE-SUPPLIER"),
            (supplier_id, inactive_product_id, "PO-T39-INACTIVE-PRODUCT"),
        ]
        url = f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}"
        for requested_supplier_id, requested_product_id, order_number in cases:
            before = persisted_state()
            response = client.put(url, json={
                "supplier_id": str(requested_supplier_id),
                "order_number": order_number,
                "currency_code": "EGP",
                "lines": [{
                    "product_id": str(requested_product_id),
                    "quantity": "1.000",
                    "unit_cost": "1.00",
                }],
            })
            assert response.status_code == 422, response.text
            assert persisted_state() == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_purchase_order_list_batches_lines_in_one_tenant_scoped_query():
    engine, business_id, _, _ = _sales_return_fixture()
    previous = _configure_test_identity(engine)
    try:
        client = TestClient(app)
        for index in range(3):
            _draft_order(engine, client, business_id, f"PO-T39-BATCH-{index}")

        line_selects = []

        def count_line_selects(connection, cursor, statement, parameters, context, executemany):
            normalized = statement.lstrip().upper()
            if normalized.startswith("SELECT") and "purchase_order_lines" in statement.lower():
                line_selects.append(statement)

        event.listen(engine, "before_cursor_execute", count_line_selects)
        try:
            with Session(engine) as session:
                result = list_purchase_orders(
                    business_id=business_id,
                    limit=100,
                    offset=0,
                    session=session,
                    principal=AuthenticatedPrincipal(subject="test-subject"),
                )
        finally:
            event.remove(engine, "before_cursor_execute", count_line_selects)

        assert len(result) == 3
        assert all(len(order["lines"]) == 1 for order in result)
        assert all(order["lines"][0]["remaining_quantity"] == "2.000" for order in result)
        assert len(line_selects) == 1, f"Expected one batched line query, observed {len(line_selects)}"
        assert "purchase_order_id IN" in line_selects[0]
        assert "business_id" in line_selects[0]
    finally:
        _restore_test_identity(*previous)
        engine.dispose()
