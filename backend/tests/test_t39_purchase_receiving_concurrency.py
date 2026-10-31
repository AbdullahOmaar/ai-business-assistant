"""PostgreSQL concurrency regressions for T39 purchase-order receiving."""

import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier, local
from uuid import uuid4

import pytest

import app.operations as purchasing_operations
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session

from fastapi import HTTPException

from app.extended_api import ProductPatch, PurchaseLineInput, PurchaseOrderInput, approve_purchase_order, patch_product, post_purchase_order, update_purchase_order

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
from app.operations import WorkflowError, receive_purchase_order
from app.security import AuthenticatedPrincipal
from app.services import create_product


def test_concurrent_postgres_receipts_with_reversed_product_order_do_not_deadlock():
    """Different POs sharing products must lock those products in one global order."""
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    suffix = uuid4().hex[:12]
    principal = AuthenticatedPrincipal(subject=f"t39-concurrency-owner-{suffix}")
    first_single_product_lock = Barrier(2)
    worker_state = local()
    listener_registered = False

    try:
        with Session(engine) as session:
            business = Business(name=f"T39 concurrency {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            business_id = business.id
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject=principal.subject,
                role=MembershipRole.OWNER,
            ))
            session.flush()

            supplier = Supplier(business_id=business_id, name=f"T39 supplier {suffix}")
            session.add(supplier)
            session.flush()
            products = [
                create_product(
                    session,
                    principal=principal,
                    business_id=business_id,
                    name=f"T39 concurrency product {suffix}-{index}",
                    unit_price=Decimal("10.00"),
                    is_stock_tracked=True,
                )
                for index in range(2)
            ]
            products = sorted(products, key=lambda product: str(product.id))

            orders = []
            for index, ordered_products in enumerate((products, list(reversed(products)))):
                order = PurchaseOrder(
                    business_id=business_id,
                    supplier_id=supplier.id,
                    order_number=f"T39-{suffix}-{index}",
                    status="approved",
                    currency_code="EGP",
                    total=Decimal("20.00"),
                )
                session.add(order)
                session.flush()
                line_ids = []
                for product in ordered_products:
                    line = PurchaseOrderLine(
                        business_id=business_id,
                        purchase_order_id=order.id,
                        product_id=product.id,
                        quantity=Decimal("1.000"),
                        unit_cost=Decimal("10.00"),
                        received_quantity=Decimal("0.000"),
                    )
                    session.add(line)
                    session.flush()
                    line_ids.append(line.id)
                orders.append((order.id, line_ids))
            session.commit()

        def synchronize_opposing_legacy_locks(
            connection, cursor, statement, parameters, context, executemany
        ):
            normalized = " ".join(statement.lower().split())
            if " from products " not in normalized or " for update" not in normalized:
                return
            if " in (" in normalized:
                # A batched lock query must explicitly declare the global order.
                assert " order by products.id" in normalized
                worker_state.synchronized = True
                return
            if getattr(worker_state, "synchronized", False):
                return
            # With the old per-product loop, force both transactions to hold
            # their different first Product lock before either asks for the other.
            worker_state.synchronized = True
            first_single_product_lock.wait(timeout=10)

        event.listen(engine, "after_cursor_execute", synchronize_opposing_legacy_locks)
        listener_registered = True
        start_together = Barrier(2)

        def receive(order_id, line_ids):
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                receive_purchase_order(
                    session,
                    principal=principal,
                    business_id=business_id,
                    purchase_order_id=order_id,
                    received_quantities={
                        line_id: Decimal("1.000") for line_id in line_ids
                    },
                )
                session.commit()
                return order_id

        with ThreadPoolExecutor(max_workers=2) as pool:
            completed = list(pool.map(lambda item: receive(*item), orders))
        assert set(completed) == {order_id for order_id, _ in orders}

        event.remove(engine, "after_cursor_execute", synchronize_opposing_legacy_locks)
        listener_registered = False

        order_ids = [order_id for order_id, _ in orders]
        with Session(engine) as session:
            saved_orders = session.scalars(
                select(PurchaseOrder).where(PurchaseOrder.id.in_(order_ids))
            ).all()
            assert len(saved_orders) == 2
            assert {order.status for order in saved_orders} == {"received"}

            saved_lines = session.scalars(
                select(PurchaseOrderLine).where(
                    PurchaseOrderLine.purchase_order_id.in_(order_ids)
                )
            ).all()
            assert len(saved_lines) == 4
            assert all(line.received_quantity == Decimal("1.000") for line in saved_lines)

            movements = session.scalars(
                select(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.movement_type == "receipt",
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id.in_(order_ids),
                )
            ).all()
            assert len(movements) == 4
            assert all(movement.quantity_delta == Decimal("1.000") for movement in movements)

            receipt_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "purchase_order.received",
                    AuditEvent.target_id.in_([str(order_id) for order_id in order_ids]),
                )
            ).all()
            assert len(receipt_audits) == 2
    finally:
        if listener_registered:
            event.remove(engine, "after_cursor_execute", synchronize_opposing_legacy_locks)
        engine.dispose()

def test_concurrent_postgres_receipts_cannot_overreceive_same_remaining_quantity():
    """Two concurrent receipts for one remaining balance cannot both commit."""
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    suffix = uuid4().hex[:12]
    principal = AuthenticatedPrincipal(subject=f"t39-overreceipt-owner-{suffix}")
    try:
        with Session(engine) as session:
            business = Business(name=f"T39 overreceipt {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            business_id = business.id
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject=principal.subject,
                role=MembershipRole.OWNER,
            ))
            session.flush()
            supplier = Supplier(business_id=business_id, name=f"T39 supplier {suffix}")
            session.add(supplier)
            session.flush()
            product = create_product(
                session,
                principal=principal,
                business_id=business_id,
                name=f"T39 overreceipt product {suffix}",
                unit_price=Decimal("10.00"),
                is_stock_tracked=True,
            )
            product_id = product.id
            order = PurchaseOrder(
                business_id=business_id,
                supplier_id=supplier.id,
                order_number=f"T39-OVER-{suffix}",
                status="approved",
                currency_code="EGP",
                total=Decimal("50.00"),
            )
            session.add(order)
            session.flush()
            line = PurchaseOrderLine(
                business_id=business_id,
                purchase_order_id=order.id,
                product_id=product.id,
                quantity=Decimal("5.000"),
                unit_cost=Decimal("10.00"),
                received_quantity=Decimal("0.000"),
            )
            session.add(line)
            session.commit()
            order_id, line_id = order.id, line.id

        start_together = Barrier(2)

        def receive_four():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                try:
                    receive_purchase_order(
                        session,
                        principal=principal,
                        business_id=business_id,
                        purchase_order_id=order_id,
                        received_quantities={line_id: Decimal("4.000")},
                    )
                    session.commit()
                    return "received"
                except WorkflowError:
                    session.rollback()
                    return "rejected"

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda _: receive_four(), range(2)))
        assert sorted(outcomes) == ["received", "rejected"]

        with Session(engine) as session:
            saved_order = session.get(PurchaseOrder, order_id)
            saved_line = session.get(PurchaseOrderLine, line_id)
            assert saved_order.status == "partially_received"
            assert saved_line.received_quantity == Decimal("4.000")

            movements = session.scalars(
                select(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.movement_type == "receipt",
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id == order_id,
                )
            ).all()
            assert len(movements) == 1
            assert movements[0].product_id == product_id
            assert movements[0].quantity_delta == Decimal("4.000")

            receipt_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "purchase_order.received",
                    AuditEvent.target_id == str(order_id),
                )
            ).all()
            assert len(receipt_audits) == 1
    finally:
        engine.dispose()

def test_postgres_receipt_failure_after_first_stock_write_rolls_back_all_effects(monkeypatch):
    """A later receipt-write failure must roll back earlier staged stock and audit rows."""
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    suffix = uuid4().hex[:12]
    principal = AuthenticatedPrincipal(subject=f"t39-rollback-owner-{suffix}")
    try:
        with Session(engine) as session:
            business = Business(name=f"T39 rollback {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            business_id = business.id
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject=principal.subject,
                role=MembershipRole.OWNER,
            ))
            session.flush()
            supplier = Supplier(business_id=business_id, name=f"T39 supplier {suffix}")
            session.add(supplier)
            session.flush()
            products = [
                create_product(
                    session,
                    principal=principal,
                    business_id=business_id,
                    name=f"T39 rollback product {suffix}-{index}",
                    unit_price=Decimal("10.00"),
                    is_stock_tracked=True,
                )
                for index in range(2)
            ]
            order = PurchaseOrder(
                business_id=business_id,
                supplier_id=supplier.id,
                order_number=f"T39-ROLLBACK-{suffix}",
                status="approved",
                currency_code="EGP",
                total=Decimal("20.00"),
            )
            session.add(order)
            session.flush()
            lines = []
            for product in products:
                line = PurchaseOrderLine(
                    business_id=business_id,
                    purchase_order_id=order.id,
                    product_id=product.id,
                    quantity=Decimal("1.000"),
                    unit_cost=Decimal("10.00"),
                    received_quantity=Decimal("0.000"),
                )
                session.add(line)
                session.flush()
                lines.append(line)
            session.commit()
            order_id = order.id
            line_ids = [line.id for line in lines]

        original_record_stock_movement = purchasing_operations.record_stock_movement
        calls = 0

        def fail_on_second_stock_write(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("injected second stock-write failure")
            return original_record_stock_movement(*args, **kwargs)

        monkeypatch.setattr(
            purchasing_operations,
            "record_stock_movement",
            fail_on_second_stock_write,
        )

        with Session(engine) as session:
            with pytest.raises(RuntimeError, match="injected second stock-write failure"):
                with session.begin():
                    receive_purchase_order(
                        session,
                        principal=principal,
                        business_id=business_id,
                        purchase_order_id=order_id,
                        received_quantities={
                            line_id: Decimal("1.000") for line_id in line_ids
                        },
                    )
        assert calls == 2

        with Session(engine) as session:
            saved_order = session.get(PurchaseOrder, order_id)
            assert saved_order.status == "approved"
            saved_lines = session.scalars(
                select(PurchaseOrderLine).where(
                    PurchaseOrderLine.purchase_order_id == order_id
                )
            ).all()
            assert len(saved_lines) == 2
            assert all(line.received_quantity == Decimal("0.000") for line in saved_lines)

            movements = session.scalars(
                select(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id == order_id,
                )
            ).all()
            assert movements == []

            receipt_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action.in_([
                        "purchase_order.received",
                        "stock.movement_recorded",
                    ]),
                )
            ).all()
            assert receipt_audits == []
    finally:
        engine.dispose()

def test_postgres_po_create_and_stock_tracking_disable_serialize_on_product_lock():
    """A PO create and stock-tracking disable race cannot commit an invalid pair."""
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    suffix = uuid4().hex[:12]
    principal = AuthenticatedPrincipal(subject=f"t39-product-race-owner-{suffix}")
    try:
        with Session(engine) as session:
            business = Business(name=f"T39 product race {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            business_id = business.id
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject=principal.subject,
                role=MembershipRole.OWNER,
            ))
            session.flush()
            supplier = Supplier(business_id=business_id, name=f"T39 supplier {suffix}")
            session.add(supplier)
            session.flush()
            product = create_product(
                session,
                principal=principal,
                business_id=business_id,
                name=f"T39 race product {suffix}",
                unit_price=Decimal("10.00"),
                is_stock_tracked=True,
            )
            product_id, supplier_id = product.id, supplier.id
            session.commit()

        body = PurchaseOrderInput(
            supplier_id=supplier_id,
            order_number=f"T39-RACE-{suffix}",
            currency_code="EGP",
            lines=[
                PurchaseLineInput(
                    product_id=product_id,
                    quantity=Decimal("1.000"),
                    unit_cost=Decimal("10.00"),
                )
            ],
        )
        patch = ProductPatch(is_stock_tracked=False)
        start_together = Barrier(2)

        def create_order():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                try:
                    result = post_purchase_order(
                        business_id=business_id,
                        body=body,
                        session=session,
                        principal=principal,
                    )
                    return "created", result["id"]
                except HTTPException as exc:
                    if exc.status_code != 422:
                        raise
                    session.rollback()
                    return "rejected", None

        def disable_stock_tracking():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                try:
                    result = patch_product(
                        business_id=business_id,
                        product_id=product_id,
                        body=patch,
                        session=session,
                        principal=principal,
                    )
                    return "disabled", result["is_stock_tracked"]
                except HTTPException as exc:
                    if exc.status_code != 422:
                        raise
                    session.rollback()
                    return "rejected", None

        with ThreadPoolExecutor(max_workers=2) as pool:
            create_result, disable_result = list(pool.map(
                lambda fn: fn(), (create_order, disable_stock_tracking)
            ))

        with Session(engine) as session:
            saved_product = session.get(Product, product_id)
            orders = session.scalars(
                select(PurchaseOrder).where(PurchaseOrder.business_id == business_id)
            ).all()
            lines = session.scalars(
                select(PurchaseOrderLine).where(PurchaseOrderLine.business_id == business_id)
            ).all()
            created_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "purchase_order.created",
                )
            ).all()
            product_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "product.updated",
                )
            ).all()

            if create_result[0] == "created":
                assert disable_result[0] == "rejected"
                assert saved_product.is_stock_tracked is True
                assert len(orders) == 1
                assert len(lines) == 1
                assert len(created_audits) == 1
                assert product_audits == []
            else:
                assert create_result[0] == "rejected"
                assert disable_result[0] == "disabled"
                assert disable_result[1] is False
                assert saved_product.is_stock_tracked is False
                assert orders == []
                assert lines == []
                assert created_audits == []
                assert len(product_audits) == 1
    finally:
        engine.dispose()

def test_postgres_draft_po_edit_and_stock_tracking_disable_serialize_on_product_lock():
    """A draft edit cannot race a product into an untracked open-PO reference."""
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    suffix = uuid4().hex[:12]
    principal = AuthenticatedPrincipal(subject=f"t39-edit-race-owner-{suffix}")
    try:
        with Session(engine) as session:
            business = Business(name=f"T39 edit race {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            business_id = business.id
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject=principal.subject,
                role=MembershipRole.OWNER,
            ))
            session.flush()
            supplier = Supplier(business_id=business_id, name=f"T39 supplier {suffix}")
            session.add(supplier)
            session.flush()
            products = [
                create_product(
                    session,
                    principal=principal,
                    business_id=business_id,
                    name=f"T39 edit race product {suffix}-{index}",
                    unit_price=Decimal("10.00"),
                    is_stock_tracked=True,
                )
                for index in range(2)
            ]
            target_product_id, original_product_id = products[0].id, products[1].id
            supplier_id = supplier.id
            session.commit()

        original_body = PurchaseOrderInput(
            supplier_id=supplier_id,
            order_number=f"T39-EDIT-RACE-{suffix}",
            currency_code="EGP",
            lines=[
                PurchaseLineInput(
                    product_id=original_product_id,
                    quantity=Decimal("1.000"),
                    unit_cost=Decimal("10.00"),
                )
            ],
        )
        with Session(engine) as session:
            created = post_purchase_order(
                business_id=business_id,
                body=original_body,
                session=session,
                principal=principal,
            )
            order_id = UUID(created["id"])

        edit_body = PurchaseOrderInput(
            supplier_id=supplier_id,
            order_number=original_body.order_number,
            currency_code="EGP",
            lines=[
                PurchaseLineInput(
                    product_id=target_product_id,
                    quantity=Decimal("1.000"),
                    unit_cost=Decimal("10.00"),
                )
            ],
        )
        patch = ProductPatch(is_stock_tracked=False)
        start_together = Barrier(2)

        def edit_order():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                try:
                    update_purchase_order(
                        business_id=business_id,
                        order_id=order_id,
                        body=edit_body,
                        session=session,
                        principal=principal,
                    )
                    return "edited"
                except HTTPException as exc:
                    if exc.status_code != 422:
                        raise
                    session.rollback()
                    return "rejected"

        def disable_tracking():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                try:
                    result = patch_product(
                        business_id=business_id,
                        product_id=target_product_id,
                        body=patch,
                        session=session,
                        principal=principal,
                    )
                    return "disabled", result["is_stock_tracked"]
                except HTTPException as exc:
                    if exc.status_code != 422:
                        raise
                    session.rollback()
                    return "rejected", None

        with ThreadPoolExecutor(max_workers=2) as pool:
            edit_result, disable_result = list(pool.map(
                lambda fn: fn(), (edit_order, disable_tracking)
            ))

        with Session(engine) as session:
            saved_product = session.get(Product, target_product_id)
            saved_lines = session.scalars(
                select(PurchaseOrderLine).where(
                    PurchaseOrderLine.purchase_order_id == order_id
                )
            ).all()
            edit_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "purchase_order.updated",
                    AuditEvent.target_id == str(order_id),
                )
            ).all()
            product_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action == "product.updated",
                    AuditEvent.target_id == str(target_product_id),
                )
            ).all()
            assert len(saved_lines) == 1

            if edit_result == "edited":
                assert disable_result[0] == "rejected"
                assert saved_product.is_stock_tracked is True
                assert saved_lines[0].product_id == target_product_id
                assert len(edit_audits) == 1
                assert product_audits == []
            else:
                assert edit_result == "rejected"
                assert disable_result == ("disabled", False)
                assert saved_product.is_stock_tracked is False
                assert saved_lines[0].product_id == original_product_id
                assert edit_audits == []
                assert len(product_audits) == 1
    finally:
        engine.dispose()

def test_postgres_po_approval_and_receipt_share_stable_product_lock_order():
    """Approval and receipt on different POs acquire shared Product locks identically."""
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql"):
        pytest.skip("Set TEST_DATABASE_URL to a disposable PostgreSQL database")

    engine = create_engine(database_url, pool_size=5, max_overflow=0)
    suffix = uuid4().hex[:12]
    principal = AuthenticatedPrincipal(subject=f"t39-approval-race-owner-{suffix}")
    listener_registered = False
    try:
        with Session(engine) as session:
            business = Business(name=f"T39 approval race {suffix}", currency_code="EGP")
            session.add(business)
            session.flush()
            business_id = business.id
            session.add(BusinessMembership(
                business_id=business_id,
                user_subject=principal.subject,
                role=MembershipRole.OWNER,
            ))
            session.flush()
            supplier = Supplier(business_id=business_id, name=f"T39 supplier {suffix}")
            session.add(supplier)
            session.flush()
            products = [
                create_product(
                    session,
                    principal=principal,
                    business_id=business_id,
                    name=f"T39 approval product {suffix}-{index}",
                    unit_price=Decimal("10.00"),
                    is_stock_tracked=True,
                )
                for index in range(2)
            ]
            products = sorted(products, key=lambda product: str(product.id))
            order_ids = {}
            receive_line_ids = []
            for key, status, ordered_products in (
                ("approve", "draft", list(reversed(products))),
                ("receive", "approved", products),
            ):
                order = PurchaseOrder(
                    business_id=business_id,
                    supplier_id=supplier.id,
                    order_number=f"T39-{suffix}-{key}",
                    status=status,
                    currency_code="EGP",
                    total=Decimal("20.00"),
                )
                session.add(order)
                session.flush()
                line_ids = []
                for product in ordered_products:
                    line = PurchaseOrderLine(
                        business_id=business_id,
                        purchase_order_id=order.id,
                        product_id=product.id,
                        quantity=Decimal("1.000"),
                        unit_cost=Decimal("10.00"),
                        received_quantity=Decimal("0.000"),
                    )
                    session.add(line)
                    session.flush()
                    line_ids.append(line.id)
                order_ids[key] = order.id
                if key == "receive":
                    receive_line_ids = line_ids
            session.commit()

        checked_lock_queries = []

        def assert_stable_product_lock_order(
            connection, cursor, statement, parameters, context, executemany
        ):
            normalized = " ".join(statement.lower().split())
            if " from products " in normalized and " for update" in normalized and " in (" in normalized:
                assert " order by products.id" in normalized
                worker_state.checked = True

        event.listen(engine, "after_cursor_execute", assert_stable_product_lock_order)
        listener_registered = True
        start_together = Barrier(2)

        def approve():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                approve_purchase_order(
                    business_id=business_id,
                    order_id=order_ids["approve"],
                    session=session,
                    principal=principal,
                )
                return "approved"

        def receive():
            with Session(engine) as session:
                session.execute(text("SET LOCAL lock_timeout = '8s'"))
                start_together.wait(timeout=10)
                receive_purchase_order(
                    session,
                    principal=principal,
                    business_id=business_id,
                    purchase_order_id=order_ids["receive"],
                    received_quantities={
                        line_id: Decimal("1.000") for line_id in receive_line_ids
                    },
                )
                session.commit()
                return "received"

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(lambda fn: fn(), (approve, receive)))
        assert sorted(outcomes) == ["approved", "received"]
        assert len(checked_lock_queries) == 2

        event.remove(engine, "after_cursor_execute", assert_stable_product_lock_order)
        listener_registered = False

        with Session(engine) as session:
            approved_order = session.get(PurchaseOrder, order_ids["approve"])
            received_order = session.get(PurchaseOrder, order_ids["receive"])
            assert approved_order.status == "approved"
            assert received_order.status == "received"
            movements = session.scalars(
                select(StockMovement).where(
                    StockMovement.business_id == business_id,
                    StockMovement.reference_type == "purchase_order",
                    StockMovement.reference_id == order_ids["receive"],
                )
            ).all()
            assert len(movements) == 2
            assert all(movement.quantity_delta == Decimal("1.000") for movement in movements)
            lifecycle_audits = session.scalars(
                select(AuditEvent).where(
                    AuditEvent.business_id == business_id,
                    AuditEvent.action.in_([
                        "purchase_order.approved",
                        "purchase_order.received",
                    ]),
                    AuditEvent.target_id.in_([
                        str(order_ids["approve"]),
                        str(order_ids["receive"]),
                    ]),
                )
            ).all()
            assert len(lifecycle_audits) == 2
    finally:
        if listener_registered:
            event.remove(engine, "after_cursor_execute", assert_stable_product_lock_order)
        engine.dispose()

