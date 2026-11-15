"""Focused API safety regressions for purchase-order receiving.

These tests exercise the existing receiving contract only. They intentionally do
not introduce receipt idempotency, financial posting, or schema behavior.
"""

from decimal import Decimal
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import app
from app.models import (
    AuditEvent,
    Business,
    BusinessMembership,
    MembershipRole,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    StockMovement,
    Supplier,
)
from test_api import (
    _configure_test_identity,
    _restore_test_identity,
    _sales_return_fixture,
)


def _create_approved_order(engine, client, business_id, line_specs, order_number):
    """Create products/PO through the existing API and return persisted IDs."""
    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name=f"Supplier {order_number}")
        products = [
            Product(
                business_id=business_id,
                name=f"{order_number} item {index}",
                unit_price=Decimal("10.00"),
                is_stock_tracked=stock_tracked,
            )
            for index, (_, stock_tracked) in enumerate(line_specs)
        ]
        session.add_all([supplier, *products])
        session.commit()
        supplier_id = supplier.id
        product_ids = [product.id for product in products]

    base = f"/api/v1/businesses/{business_id}"
    created = client.post(
        f"{base}/purchase-orders",
        json={
            "supplier_id": str(supplier_id),
            "order_number": order_number,
            "currency_code": "EGP",
            "lines": [
                {
                    "product_id": str(product_id),
                    "quantity": str(quantity),
                    "unit_cost": "7.50",
                }
                for (quantity, _), product_id in zip(line_specs, product_ids)
            ],
        },
    )
    assert created.status_code == 201, created.text
    order_id = UUID(created.json()["id"])

    approved = client.post(f"{base}/purchase-orders/{order_id}/approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    with Session(engine) as session:
        lines = session.scalars(
            select(PurchaseOrderLine)
            .where(
                PurchaseOrderLine.business_id == business_id,
                PurchaseOrderLine.purchase_order_id == order_id,
            )
            .order_by(PurchaseOrderLine.id)
        ).all()
        line_ids_by_product = {line.product_id: line.id for line in lines}
        line_ids = [line_ids_by_product[product_id] for product_id in product_ids]

    assert len(line_ids) == len(line_specs)
    return order_id, line_ids, product_ids


def _receiving_snapshot(engine, business_id, order_id):
    """Capture every persisted receiving side effect for one scoped PO."""
    with Session(engine) as session:
        order = session.scalar(
            select(PurchaseOrder).where(
                PurchaseOrder.id == order_id,
                PurchaseOrder.business_id == business_id,
            )
        )
        lines = session.scalars(
            select(PurchaseOrderLine)
            .where(
                PurchaseOrderLine.business_id == business_id,
                PurchaseOrderLine.purchase_order_id == order_id,
            )
            .order_by(PurchaseOrderLine.id)
        ).all()
        movements = session.scalars(
            select(StockMovement)
            .where(
                StockMovement.business_id == business_id,
                StockMovement.reference_type == "purchase_order",
                StockMovement.reference_id == order_id,
            )
            .order_by(StockMovement.id)
        ).all()
        events = session.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.business_id == business_id,
                AuditEvent.target_type == "purchase_order",
                AuditEvent.target_id == str(order_id),
            )
            .order_by(AuditEvent.id)
        ).all()

        return (
            None if order is None else order.status,
            tuple((line.id, line.received_quantity) for line in lines),
            tuple(
                (
                    movement.id,
                    movement.product_id,
                    movement.movement_type,
                    movement.quantity_delta,
                    movement.reference_type,
                    movement.reference_id,
                    movement.created_by_subject,
                )
                for movement in movements
            ),
            tuple(
                (
                    event.id,
                    event.action,
                    event.target_type,
                    event.target_id,
                    event.actor_subject,
                )
                for event in events
            ),
        )


def _configure(engine):
    previous = _configure_test_identity(engine)
    return TestClient(app), previous


def test_owner_can_partially_then_fully_receive_and_audit_each_operation():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    base = f"/api/v1/businesses/{business_id}"
    try:
        order_id, line_ids, product_ids = _create_approved_order(
            engine,
            client,
            business_id,
            [("4.000", True), ("2.000", True)],
            "PO-T39-PARTIAL-FULL",
        )

        partial = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={
                "lines": [
                    {"line_id": str(line_ids[0]), "quantity": "1.000"},
                    {"line_id": str(line_ids[1]), "quantity": "1.000"},
                ]
            },
        )
        assert partial.status_code == 200, partial.text
        assert partial.json()["status"] == "partially_received"

        with Session(engine) as session:
            persisted = {
                line.id: line.received_quantity
                for line in session.scalars(
                    select(PurchaseOrderLine).where(
                        PurchaseOrderLine.purchase_order_id == order_id,
                        PurchaseOrderLine.business_id == business_id,
                    )
                )
            }
            first_movements = session.scalars(
                select(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id == order_id,
                )
            ).all()
            first_receipts = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "purchase_order.received",
                    AuditEvent.target_id == str(order_id),
                )
            ).all()

        assert persisted == {line_ids[0]: Decimal("1.000"), line_ids[1]: Decimal("1.000")}
        assert len(first_movements) == 2
        assert all(row.movement_type == "receipt" and row.quantity_delta > 0 for row in first_movements)
        assert {row.product_id for row in first_movements} == set(product_ids)
        assert len(first_receipts) == 1

        completed = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={
                "lines": [
                    {"line_id": str(line_ids[0]), "quantity": "3.000"},
                    {"line_id": str(line_ids[1]), "quantity": "1.000"},
                ]
            },
        )
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "received"

        with Session(engine) as session:
            persisted = {
                line.id: line.received_quantity
                for line in session.scalars(
                    select(PurchaseOrderLine).where(
                        PurchaseOrderLine.purchase_order_id == order_id,
                        PurchaseOrderLine.business_id == business_id,
                    )
                )
            }
            movements = session.scalars(
                select(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id == order_id,
                )
            ).all()
            receipts = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "purchase_order.received",
                    AuditEvent.target_id == str(order_id),
                )
            ).all()

        assert persisted == {line_ids[0]: Decimal("4.000"), line_ids[1]: Decimal("2.000")}
        assert len(movements) == 4
        totals_by_product = {
            product_id: sum(
                (row.quantity_delta for row in movements if row.product_id == product_id),
                Decimal("0"),
            )
            for product_id in product_ids
        }
        assert totals_by_product == {
            product_ids[0]: Decimal("4.000"),
            product_ids[1]: Decimal("2.000"),
        }
        assert all(row.movement_type == "receipt" and row.quantity_delta > 0 for row in movements)
        assert len(receipts) == 2
        assert all(row.target_type == "purchase_order" for row in receipts)
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_staff_cannot_receive_and_denial_has_no_persisted_side_effects():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    base = f"/api/v1/businesses/{business_id}"
    try:
        order_id, line_ids, _ = _create_approved_order(
            engine, client, business_id, [("3.000", True)], "PO-T39-STAFF-DENY"
        )
        with Session(engine) as session:
            membership = session.scalar(
                select(BusinessMembership).where(
                    BusinessMembership.business_id == business_id,
                    BusinessMembership.user_subject == "test-subject",
                )
            )
            assert membership is not None
            membership.role = MembershipRole.STAFF
            session.commit()

        before = _receiving_snapshot(engine, business_id, order_id)
        denied = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]},
        )
        assert denied.status_code == 403, denied.text
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_foreign_business_order_and_foreign_line_ids_are_denied_without_writes():
    engine, member_business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    try:
        own_order_id, own_line_ids, _ = _create_approved_order(
            engine, client, member_business_id, [("3.000", True)], "PO-T39-OWN-TENANT"
        )

        with Session(engine) as session:
            foreign_business = Business(name="T39 foreign receiving tenant", currency_code="EGP")
            session.add(foreign_business)
            session.flush()
            supplier = Supplier(business_id=foreign_business.id, name="Foreign receiving supplier")
            product = Product(
                business_id=foreign_business.id,
                name="Foreign receiving stock",
                unit_price=Decimal("10.00"),
                is_stock_tracked=True,
            )
            session.add_all([supplier, product])
            session.flush()
            foreign_order = PurchaseOrder(
                business_id=foreign_business.id,
                supplier_id=supplier.id,
                order_number="PO-T39-FOREIGN-TENANT",
                status="approved",
                currency_code="EGP",
                total=Decimal("7.50"),
            )
            session.add(foreign_order)
            session.flush()
            foreign_line = PurchaseOrderLine(
                business_id=foreign_business.id,
                purchase_order_id=foreign_order.id,
                product_id=product.id,
                quantity=Decimal("1.000"),
                unit_cost=Decimal("7.50"),
                received_quantity=Decimal("0.000"),
            )
            session.add(foreign_line)
            session.commit()
            foreign_business_id = foreign_business.id
            foreign_order_id = foreign_order.id
            foreign_line_id = foreign_line.id

        own_before = _receiving_snapshot(engine, member_business_id, own_order_id)
        foreign_before = _receiving_snapshot(engine, foreign_business_id, foreign_order_id)

        # The caller is an OWNER only in member_business_id, not in the foreign tenant.
        foreign_business_denied = client.post(
            f"/api/v1/businesses/{foreign_business_id}/purchase-orders/{foreign_order_id}/receive",
            json={"lines": [{"line_id": str(foreign_line_id), "quantity": "1.000"}]},
        )
        assert foreign_business_denied.status_code == 403, foreign_business_denied.text

        # A foreign PO or line ID must not resolve under the caller's own business scope.
        foreign_order_denied = client.post(
            f"/api/v1/businesses/{member_business_id}/purchase-orders/{foreign_order_id}/receive",
            json={"lines": [{"line_id": str(foreign_line_id), "quantity": "1.000"}]},
        )
        assert foreign_order_denied.status_code == 422, foreign_order_denied.text

        foreign_line_denied = client.post(
            f"/api/v1/businesses/{member_business_id}/purchase-orders/{own_order_id}/receive",
            json={"lines": [{"line_id": str(foreign_line_id), "quantity": "1.000"}]},
        )
        assert foreign_line_denied.status_code == 422, foreign_line_denied.text

        assert _receiving_snapshot(engine, member_business_id, own_order_id) == own_before
        assert _receiving_snapshot(engine, foreign_business_id, foreign_order_id) == foreign_before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_invalid_later_line_rolls_back_earlier_line_and_all_side_effects():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    base = f"/api/v1/businesses/{business_id}"
    try:
        order_id, line_ids, _ = _create_approved_order(
            engine,
            client,
            business_id,
            [("3.000", True), ("2.000", True)],
            "PO-T39-ROLLBACK-LATER-LINE",
        )
        before = _receiving_snapshot(engine, business_id, order_id)

        response = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={
                "lines": [
                    {"line_id": str(line_ids[0]), "quantity": "1.000"},
                    {"line_id": str(uuid4()), "quantity": "1.000"},
                ]
            },
        )
        assert response.status_code == 422, response.text
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_duplicate_line_entries_cannot_cumulatively_overreceive_or_partially_write():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    base = f"/api/v1/businesses/{business_id}"
    try:
        order_id, line_ids, _ = _create_approved_order(
            engine, client, business_id, [("3.000", True)], "PO-T39-DUPLICATE-LINE"
        )
        before = _receiving_snapshot(engine, business_id, order_id)

        response = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={
                "lines": [
                    {"line_id": str(line_ids[0]), "quantity": "2.000"},
                    {"line_id": str(line_ids[0]), "quantity": "2.000"},
                ]
            },
        )
        assert response.status_code == 422, response.text
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_invalid_order_states_empty_payload_and_nonpositive_quantities_have_no_writes():
    for status in ("draft", "cancelled", "received"):
        engine, business_id, _, _ = _sales_return_fixture()
        client, previous = _configure(engine)
        base = f"/api/v1/businesses/{business_id}"
        try:
            order_id, line_ids, _ = _create_approved_order(
                engine, client, business_id, [("2.000", True)], f"PO-T39-STATE-{status.upper()}"
            )
            with Session(engine) as session:
                order = session.get(PurchaseOrder, order_id)
                assert order is not None
                order.status = status
                session.commit()

            before = _receiving_snapshot(engine, business_id, order_id)
            response = client.post(
                f"{base}/purchase-orders/{order_id}/receive",
                json={"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]},
            )
            assert response.status_code == 422, response.text
            assert _receiving_snapshot(engine, business_id, order_id) == before
        finally:
            _restore_test_identity(*previous)
            engine.dispose()

    for quantity in ("0", "-1"):
        engine, business_id, _, _ = _sales_return_fixture()
        client, previous = _configure(engine)
        base = f"/api/v1/businesses/{business_id}"
        try:
            order_id, line_ids, _ = _create_approved_order(
                engine, client, business_id, [("2.000", True)], f"PO-T39-QUANTITY-{quantity.replace('-', 'NEG')}"
            )
            before = _receiving_snapshot(engine, business_id, order_id)
            response = client.post(
                f"{base}/purchase-orders/{order_id}/receive",
                json={"lines": [{"line_id": str(line_ids[0]), "quantity": quantity}]},
            )
            assert response.status_code == 422, response.text
            assert _receiving_snapshot(engine, business_id, order_id) == before
        finally:
            _restore_test_identity(*previous)
            engine.dispose()

    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    base = f"/api/v1/businesses/{business_id}"
    try:
        order_id, _, _ = _create_approved_order(
            engine, client, business_id, [("2.000", True)], "PO-T39-EMPTY-PAYLOAD"
        )
        before = _receiving_snapshot(engine, business_id, order_id)
        response = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={"lines": []},
        )
        assert response.status_code == 422, response.text
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_non_stock_tracked_purchase_line_cannot_be_received():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    base = f"/api/v1/businesses/{business_id}"
    try:
        order_id, line_ids, _ = _create_approved_order(
            engine, client, business_id, [("2.000", False)], "PO-T39-NON-STOCK"
        )
        before = _receiving_snapshot(engine, business_id, order_id)
        response = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            json={"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]},
        )
        assert response.status_code == 422, response.text
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()
