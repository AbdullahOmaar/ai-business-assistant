"""Focused API and persistence safety regressions for idempotent purchase receiving.

Every ordinary receive request supplies a canonical Idempotency-Key; the dedicated
missing/malformed-key case intentionally omits or corrupts that header.
"""

from decimal import Decimal
import os
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
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
    PurchaseReceiptIdempotency,
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


def _receipt_headers(key=None):
    return {"Idempotency-Key": key or str(uuid4())}


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
            headers=_receipt_headers(),
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
            headers=_receipt_headers(),
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
            headers=_receipt_headers(),
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
            headers=_receipt_headers(),
            json={"lines": [{"line_id": str(foreign_line_id), "quantity": "1.000"}]},
        )
        assert foreign_business_denied.status_code == 403, foreign_business_denied.text

        # A foreign PO or line ID must not resolve under the caller's own business scope.
        foreign_order_denied = client.post(
            f"/api/v1/businesses/{member_business_id}/purchase-orders/{foreign_order_id}/receive",
            headers=_receipt_headers(),
            json={"lines": [{"line_id": str(foreign_line_id), "quantity": "1.000"}]},
        )
        assert foreign_order_denied.status_code == 422, foreign_order_denied.text

        foreign_line_denied = client.post(
            f"/api/v1/businesses/{member_business_id}/purchase-orders/{own_order_id}/receive",
            headers=_receipt_headers(),
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
            headers=_receipt_headers(),
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
            headers=_receipt_headers(),
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
                headers=_receipt_headers(),
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
                headers=_receipt_headers(),
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
            headers=_receipt_headers(),
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
        order_id, line_ids, product_ids = _create_approved_order(
            engine, client, business_id, [("2.000", True)], "PO-T39-NON-STOCK"
        )
        # The PO API itself only admits stock-tracked products. Simulate a legacy
        # or subsequently changed catalog row without changing the PO schema.
        with Session(engine) as session:
            product = session.get(Product, product_ids[0])
            assert product is not None
            product.is_stock_tracked = False
            session.commit()

        before = _receiving_snapshot(engine, business_id, order_id)
        response = client.post(
            f"{base}/purchase-orders/{order_id}/receive",
            headers=_receipt_headers(),
            json={"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]},
        )
        assert response.status_code == 422, response.text
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_receipt_idempotency_persists_canonical_request_and_original_response():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    try:
        order_id, _, _ = _create_approved_order(
            engine, client, business_id, [("2.000", True)], "PO-T39-IDEMPOTENCY-STORE"
        )
        with Session(engine) as session:
            row = PurchaseReceiptIdempotency(
                business_id=business_id,
                purchase_order_id=order_id,
                idempotency_key="2b2b2b2b-2b2b-42b2-82b2-2b2b2b2b2b2b",
                request_hash="a" * 64,
                response_snapshot={"id": str(order_id), "status": "partially_received"},
            )
            session.add(row)
            session.commit()
            persisted = session.scalar(
                select(PurchaseReceiptIdempotency).where(
                    PurchaseReceiptIdempotency.business_id == business_id,
                    PurchaseReceiptIdempotency.purchase_order_id == order_id,
                    PurchaseReceiptIdempotency.idempotency_key == row.idempotency_key,
                )
            )
            assert persisted is not None
            assert persisted.request_hash == "a" * 64
            assert persisted.response_snapshot == {
                "id": str(order_id), "status": "partially_received"
            }
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_receipt_idempotency_key_is_unique_per_business_purchase_order():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    try:
        order_a, _, _ = _create_approved_order(
            engine, client, business_id, [("2.000", True)], "PO-T39-IDEMPOTENCY-A"
        )
        order_b, _, _ = _create_approved_order(
            engine, client, business_id, [("2.000", True)], "PO-T39-IDEMPOTENCY-B"
        )
        key = "3c3c3c3c-3c3c-43c3-83c3-3c3c3c3c3c3c"
        with Session(engine) as session:
            session.add_all([
                PurchaseReceiptIdempotency(
                    business_id=business_id, purchase_order_id=order_a,
                    idempotency_key=key, request_hash="b" * 64,
                    response_snapshot={"order": str(order_a)},
                ),
                PurchaseReceiptIdempotency(
                    business_id=business_id, purchase_order_id=order_a,
                    idempotency_key=key, request_hash="b" * 64,
                    response_snapshot={"order": str(order_a)},
                ),
            ])
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()
            session.add_all([
                PurchaseReceiptIdempotency(
                    business_id=business_id, purchase_order_id=order_a,
                    idempotency_key=key, request_hash="b" * 64,
                    response_snapshot={"order": str(order_a)},
                ),
                PurchaseReceiptIdempotency(
                    business_id=business_id, purchase_order_id=order_b,
                    idempotency_key=key, request_hash="b" * 64,
                    response_snapshot={"order": str(order_b)},
                ),
            ])
            session.commit()

            foreign_business = Business(name="T39 idempotency foreign tenant", currency_code="EGP")
            session.add(foreign_business)
            session.flush()
            foreign_supplier = Supplier(business_id=foreign_business.id, name="Foreign supplier")
            foreign_product = Product(
                business_id=foreign_business.id, name="Foreign stock",
                unit_price=Decimal("10.00"), is_stock_tracked=True,
            )
            session.add_all([foreign_supplier, foreign_product])
            session.flush()
            foreign_order = PurchaseOrder(
                business_id=foreign_business.id, supplier_id=foreign_supplier.id,
                order_number="PO-T39-IDEMPOTENCY-FOREIGN", status="approved",
                currency_code="EGP", total=Decimal("2.00"),
            )
            session.add(foreign_order)
            session.flush()
            session.add(PurchaseReceiptIdempotency(
                business_id=foreign_business.id, purchase_order_id=foreign_order.id,
                idempotency_key=key, request_hash="c" * 64,
                response_snapshot={"order": str(foreign_order.id)},
            ))
            session.commit()
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_receipt_api_replays_same_key_and_rejects_changed_payload_without_duplicate_effects():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    try:
        order_id, line_ids, _ = _create_approved_order(
            engine, client, business_id, [("3.000", True)], "PO-T39-API-IDEMPOTENCY"
        )
        key = str(uuid4())
        url = f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive"
        payload = {"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]}
        first = client.post(url, headers=_receipt_headers(key), json=payload)
        assert first.status_code == 200, first.text
        after_first = _receiving_snapshot(engine, business_id, order_id)

        replay = client.post(url, headers=_receipt_headers(key), json=payload)
        assert replay.status_code == 200, replay.text
        assert replay.json() == first.json()
        assert _receiving_snapshot(engine, business_id, order_id) == after_first

        conflict = client.post(
            url,
            headers=_receipt_headers(key),
            json={"lines": [{"line_id": str(line_ids[0]), "quantity": "0.500"}]},
        )
        assert conflict.status_code == 409, conflict.text
        assert _receiving_snapshot(engine, business_id, order_id) == after_first
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_receipt_api_requires_canonical_idempotency_key_without_side_effects():
    engine, business_id, _, _ = _sales_return_fixture()
    client, previous = _configure(engine)
    try:
        order_id, line_ids, _ = _create_approved_order(
            engine, client, business_id, [("2.000", True)], "PO-T39-IDEMPOTENCY-HEADER"
        )
        url = f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive"
        payload = {"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]}
        before = _receiving_snapshot(engine, business_id, order_id)
        missing = client.post(url, json=payload)
        malformed = client.post(url, headers={"Idempotency-Key": "not-a-uuid"}, json=payload)
        uppercase = client.post(url, headers={"Idempotency-Key": str(uuid4()).upper()}, json=payload)
        assert missing.status_code == 422
        assert malformed.status_code == 422
        assert uppercase.status_code == 422
        assert _receiving_snapshot(engine, business_id, order_id) == before
    finally:
        _restore_test_identity(*previous)
        engine.dispose()


def test_concurrent_same_key_receipt_requests_apply_stock_once():
    """Exercise row-lock and unique-key replay against the disposable PostgreSQL service."""
    from concurrent.futures import ThreadPoolExecutor

    if os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true":
        pytest.skip("requires the isolated PostgreSQL CI service")
    database_url = os.getenv("TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    engine = create_engine(database_url, pool_size=5, max_overflow=5, pool_pre_ping=True)
    if engine.dialect.name != "postgresql" or not (engine.url.database or "").endswith("_test"):
        engine.dispose()
        pytest.skip("concurrency regression requires a disposable PostgreSQL *_test database")

    previous = None
    try:
        with Session(engine) as session:
            business = Business(name="T39 concurrent receipt tenant", currency_code="EGP")
            session.add(business)
            session.flush()
            session.add(BusinessMembership(
                business_id=business.id,
                user_subject="test-subject",
                role=MembershipRole.OWNER,
            ))
            session.commit()
            business_id = business.id

        client, previous = _configure(engine)
        order_id, line_ids, _ = _create_approved_order(
            engine, client, business_id, [("2.000", True)],
            "PO-T39-IDEMPOTENCY-CONCURRENT-" + uuid4().hex[:8],
        )
        url = f"/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive"
        headers = _receipt_headers(str(uuid4()))
        payload = {"lines": [{"line_id": str(line_ids[0]), "quantity": "1.000"}]}
        clients = [TestClient(app), TestClient(app)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(
                lambda request_client: request_client.post(url, headers=headers, json=payload),
                clients,
            ))
        assert [response.status_code for response in responses] == [200, 200]
        assert responses[0].json() == responses[1].json()
        snapshot = _receiving_snapshot(engine, business_id, order_id)
        assert snapshot[1] == ((line_ids[0], Decimal("1.000")),)
        assert len(snapshot[2]) == 1
        assert len(snapshot[3]) == 2  # creation + exactly one receipt audit event
        with Session(engine) as session:
            replay_rows = session.scalars(select(PurchaseReceiptIdempotency).where(
                PurchaseReceiptIdempotency.business_id == business_id,
                PurchaseReceiptIdempotency.purchase_order_id == order_id,
                PurchaseReceiptIdempotency.idempotency_key == headers["Idempotency-Key"],
            )).all()
        assert len(replay_rows) == 1
    finally:
        if previous is not None:
            _restore_test_identity(*previous)
        engine.dispose()
