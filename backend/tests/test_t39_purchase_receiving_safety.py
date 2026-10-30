from decimal import Decimal

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import (
    AuditEvent,
    Base,
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
from app.security import AuthenticatedPrincipal, AuthorizationError
from app.services import create_product


@pytest.fixture()
def purchasing_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="T39 Purchasing Shop", currency_code="EGP")
        session.add(business)
        session.flush()
        membership = BusinessMembership(
            business_id=business.id,
            user_subject="t39-owner",
            role=MembershipRole.OWNER,
        )
        session.add(membership)
        session.commit()
        yield engine, business.id, AuthenticatedPrincipal(subject="t39-owner")
    engine.dispose()


def _approved_order(session, business_id, principal, *, quantity=Decimal("10")):
    supplier = Supplier(business_id=business_id, name="T39 Supplier")
    product = create_product(
        session,
        principal=principal,
        business_id=business_id,
        name="T39 Stock Item",
        unit_price=Decimal("10"),
        is_stock_tracked=True,
    )
    session.add(supplier)
    session.flush()
    order = PurchaseOrder(
        business_id=business_id,
        supplier_id=supplier.id,
        order_number="PO-T39-SAFETY",
        status="approved",
        currency_code="EGP",
        total=quantity * Decimal("10"),
    )
    session.add(order)
    session.flush()
    line = PurchaseOrderLine(
        business_id=business_id,
        purchase_order_id=order.id,
        product_id=product.id,
        quantity=quantity,
        unit_cost=Decimal("10"),
        received_quantity=Decimal("0"),
    )
    session.add(line)
    session.commit()
    return order, line, product


def test_partial_receipts_create_exact_stock_ledger_effects(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, line, product = _approved_order(session, business_id, principal)

        first = receive_purchase_order(
            session,
            principal=principal,
            business_id=business_id,
            purchase_order_id=order.id,
            received_quantities={line.id: Decimal("4")},
        )
        assert first.status == "partially_received"
        session.commit()

        second = receive_purchase_order(
            session,
            principal=principal,
            business_id=business_id,
            purchase_order_id=order.id,
            received_quantities={line.id: Decimal("6")},
        )
        assert second.status == "received"
        session.commit()

        movements = session.scalars(
            select(StockMovement).where(
                StockMovement.business_id == business_id,
                StockMovement.product_id == product.id,
                StockMovement.reference_type == "purchase_order",
                StockMovement.reference_id == order.id,
                StockMovement.movement_type == "receipt",
            )
        ).all()
        assert len(movements) == 2
        assert sum((movement.quantity_delta for movement in movements), Decimal("0")) == Decimal("10.000")
        session.refresh(line)
        assert line.received_quantity == Decimal("10.000")


def test_non_stock_tracked_po_product_is_rejected_before_any_receipt_mutation(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, tracked_line, tracked_product = _approved_order(session, business_id, principal)
        untracked_product = Product(
            business_id=business_id,
            name="Untracked PO Item",
            unit_price=Decimal("5"),
            is_stock_tracked=False,
        )
        session.add(untracked_product)
        session.flush()
        untracked_line = PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=untracked_product.id,
            quantity=Decimal("3"),
            unit_cost=Decimal("5"),
            received_quantity=Decimal("0"),
        )
        order.total += Decimal("15")
        session.add(untracked_line)
        session.commit()

        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        # The first line is valid. The later untracked product must reject the
        # whole receipt before any line quantity, movement, or audit is staged.
        with pytest.raises(WorkflowError, match="product is not stock-tracked"):
            receive_purchase_order(
                session,
                principal=principal,
                business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={
                    tracked_line.id: Decimal("2"),
                    untracked_line.id: Decimal("1"),
                },
            )

        session.expire_all()
        assert session.get(PurchaseOrder, order.id).status == "approved"
        assert session.get(PurchaseOrderLine, tracked_line.id).received_quantity == Decimal("0.000")
        assert session.get(PurchaseOrderLine, untracked_line.id).received_quantity == Decimal("0.000")
        assert session.get(Product, tracked_product.id).is_stock_tracked is True
        assert session.get(Product, untracked_product.id).is_stock_tracked is False
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before


def test_staff_receipt_denial_has_no_business_side_effects(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, line, product = _approved_order(session, business_id, principal)
        membership = session.scalar(
            select(BusinessMembership).where(
                BusinessMembership.business_id == business_id,
                BusinessMembership.user_subject == principal.subject,
            )
        )
        membership.role = MembershipRole.STAFF
        session.commit()

        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        with pytest.raises(AuthorizationError, match="role is not permitted"):
            receive_purchase_order(
                session,
                principal=principal,
                business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={line.id: Decimal("2")},
            )

        session.rollback()
        session.expire_all()
        persisted_order = session.get(PurchaseOrder, order.id)
        persisted_line = session.get(PurchaseOrderLine, line.id)
        assert persisted_order.status == "approved"
        assert persisted_line.received_quantity == Decimal("0.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before



def test_invalid_later_line_does_not_partially_receive_earlier_lines(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, first_line, product = _approved_order(session, business_id, principal)
        invalid_line = PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=product.id,
            quantity=Decimal("5"),
            unit_cost=Decimal("10"),
            received_quantity=Decimal("0"),
        )
        order.total = Decimal("150")
        session.add(invalid_line)
        session.commit()

        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        # The first line is valid, but the second would over-receive. The entire
        # request must be validated before the first stock/audit write is staged.
        with pytest.raises(WorkflowError, match="Received quantity must be"):
            receive_purchase_order(
                session,
                principal=principal,
                business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={
                    first_line.id: Decimal("2"),
                    invalid_line.id: Decimal("6"),
                },
            )

        session.refresh(order)
        session.refresh(first_line)
        session.refresh(invalid_line)
        assert order.status == "approved"
        assert first_line.received_quantity == Decimal("0.000")
        assert invalid_line.received_quantity == Decimal("0.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before



def test_foreign_business_order_is_not_receivable(purchasing_workspace):
    engine, business_a_id, principal_a = purchasing_workspace
    with Session(engine) as session:
        business_b = Business(name="T39 Foreign Shop", currency_code="EGP")
        session.add(business_b)
        session.flush()
        membership_b = BusinessMembership(
            business_id=business_b.id,
            user_subject="t39-owner-b",
            role=MembershipRole.OWNER,
        )
        session.add(membership_b)
        session.commit()
        business_b_id = business_b.id
        principal_b = AuthenticatedPrincipal(subject="t39-owner-b")

        order_b, line_b, _ = _approved_order(session, business_b_id, principal_b)
        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_b_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_b_id
            )
        )

        # A valid owner from business A must not receive an order belonging to B.
        with pytest.raises(WorkflowError, match="Purchase order not found"):
            receive_purchase_order(
                session,
                principal=principal_a,
                business_id=business_a_id,
                purchase_order_id=order_b.id,
                received_quantities={line_b.id: Decimal("1")},
            )

        session.expire_all()
        persisted_order_b = session.get(PurchaseOrder, order_b.id)
        persisted_line_b = session.get(PurchaseOrderLine, line_b.id)
        assert persisted_order_b.status == "approved"
        assert persisted_line_b.received_quantity == Decimal("0.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_b_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_b_id
            )
        ) == audit_count_before


@pytest.mark.parametrize("invalid_status", ["draft", "received", "cancelled"])
def test_receipt_rejects_order_in_invalid_lifecycle_state_without_side_effects(
    purchasing_workspace, invalid_status
):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, line, _ = _approved_order(session, business_id, principal)
        order.status = invalid_status
        session.commit()

        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        with pytest.raises(WorkflowError, match="Only approved purchase orders"):
            receive_purchase_order(
                session,
                principal=principal,
                business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={line.id: Decimal("1")},
            )

        session.expire_all()
        assert session.get(PurchaseOrder, order.id).status == invalid_status
        assert session.get(PurchaseOrderLine, line.id).received_quantity == Decimal("0.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before

def test_foreign_business_product_is_rejected_without_receipt_side_effects(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, local_line, local_product = _approved_order(session, business_id, principal)

        foreign_business = Business(name="T39 Foreign Shop", currency_code="EGP")
        session.add(foreign_business)
        session.flush()
        session.add(BusinessMembership(
            business_id=foreign_business.id,
            user_subject=principal.subject,
            role=MembershipRole.OWNER,
        ))
        session.flush()
        foreign_product = create_product(
            session,
            principal=principal,
            business_id=foreign_business.id,
            name="Foreign Stock Item",
            unit_price=Decimal("10"),
            is_stock_tracked=True,
        )
        foreign_line = PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=foreign_product.id,
            quantity=Decimal("5"),
            unit_cost=Decimal("10"),
            received_quantity=Decimal("0"),
        )
        order.total = Decimal("150")
        session.add(foreign_line)
        session.commit()

        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        with pytest.raises(WorkflowError, match="product not found in this business"):
            receive_purchase_order(
                session,
                principal=principal,
                business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={
                    local_line.id: Decimal("2"),
                    foreign_line.id: Decimal("2"),
                },
            )

        session.refresh(order)
        session.refresh(local_line)
        session.refresh(foreign_line)
        assert order.status == "approved"
        assert local_line.received_quantity == Decimal("0.000")
        assert foreign_line.received_quantity == Decimal("0.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before


@pytest.mark.parametrize(
    "invalid_quantity",
    [
        Decimal("NaN"),
        Decimal("Infinity"),
        Decimal("-Infinity"),
        Decimal("0"),
        Decimal("-1"),
    ],
)
def test_non_finite_or_non_positive_receipt_quantity_is_rejected_without_side_effects(
    purchasing_workspace, invalid_quantity
):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, line, _ = _approved_order(session, business_id, principal)
        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        with pytest.raises(
            WorkflowError,
            match="Received quantity must be finite, positive",
        ):
            receive_purchase_order(
                session,
                principal=principal,
                business_id=business_id,
                purchase_order_id=order.id,
                received_quantities={line.id: invalid_quantity},
            )

        session.expire_all()
        assert session.get(PurchaseOrder, order.id).status == "approved"
        assert session.get(PurchaseOrderLine, line.id).received_quantity == Decimal("0.000")
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before
