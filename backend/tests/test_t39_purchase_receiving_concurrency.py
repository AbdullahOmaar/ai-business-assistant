"""PostgreSQL concurrency regressions for T39 purchase-order receiving."""

import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier, local
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session

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
from app.operations import receive_purchase_order
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
