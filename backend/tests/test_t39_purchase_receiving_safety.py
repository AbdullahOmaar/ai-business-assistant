from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import (
    PurchaseLineInput,
    PurchaseOrderInput,
    SupplierPatch,
    cancel_purchase_order,
    get_purchase_order,
    get_purchase_order_activity,
    get_supplier,
    list_purchase_order_receipts,
    list_purchase_orders,
    patch_supplier,
    purchase_order_summary,
    update_purchase_order,
)

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

def test_staff_cannot_edit_draft_purchase_order_without_side_effects(purchasing_workspace):
    engine, business_id, owner_principal = purchasing_workspace
    staff_principal = AuthenticatedPrincipal(subject="t39-staff-editor")

    with Session(engine) as session:
        session.add(BusinessMembership(
            business_id=business_id,
            user_subject=staff_principal.subject,
            role=MembershipRole.STAFF,
        ))
        supplier = Supplier(business_id=business_id, name="T39 Edit Guard Supplier")
        session.add(supplier)
        session.flush()
        product = create_product(
            session,
            principal=owner_principal,
            business_id=business_id,
            name="T39 Edit Guard Product",
            unit_price=Decimal("10.00"),
            is_stock_tracked=True,
        )
        order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier.id,
            order_number="PO-T39-EDIT-GUARD",
            status="draft",
            currency_code="EGP",
            total=Decimal("10.00"),
        )
        session.add(order)
        session.flush()
        line = PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=product.id,
            quantity=Decimal("1.000"),
            unit_cost=Decimal("10.00"),
            received_quantity=Decimal("0.000"),
        )
        session.add(line)
        session.commit()
        order_id = order.id
        supplier_id = supplier.id
        product_id = product.id

    owner_edit = PurchaseOrderInput(
        supplier_id=supplier_id,
        order_number="PO-T39-OWNER-EDITED",
        currency_code="EGP",
        lines=[PurchaseLineInput(
            product_id=product_id,
            quantity=Decimal("2.000"),
            unit_cost=Decimal("12.00"),
        )],
    )
    with Session(engine) as session:
        owner_result = update_purchase_order(
            business_id=business_id,
            order_id=order_id,
            body=owner_edit,
            session=session,
            principal=owner_principal,
        )
        assert owner_result["order_number"] == "PO-T39-OWNER-EDITED"

    staff_edit = PurchaseOrderInput(
        supplier_id=supplier_id,
        order_number="PO-T39-STAFF-EDITED",
        currency_code="EGP",
        lines=[PurchaseLineInput(
            product_id=product_id,
            quantity=Decimal("3.000"),
            unit_cost=Decimal("13.00"),
        )],
    )
    with Session(engine) as session:
        with pytest.raises(HTTPException) as denied:
            update_purchase_order(
                business_id=business_id,
                order_id=order_id,
                body=staff_edit,
                session=session,
                principal=staff_principal,
            )
        assert denied.value.status_code == 403

    with Session(engine) as session:
        saved_order = session.get(PurchaseOrder, order_id)
        saved_lines = session.scalars(
            select(PurchaseOrderLine).where(
                PurchaseOrderLine.purchase_order_id == order_id
            )
        ).all()
        update_audits = session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.updated",
                AuditEvent.target_id == str(order_id),
            )
        ).all()
        assert saved_order.status == "draft"
        assert saved_order.order_number == "PO-T39-OWNER-EDITED"
        assert saved_order.total == Decimal("24.00")
        assert len(saved_lines) == 1
        assert saved_lines[0].quantity == Decimal("2.000")
        assert saved_lines[0].unit_cost == Decimal("12.00")
        assert len(update_audits) == 1

def test_supplier_and_purchase_order_read_routes_are_member_scoped_and_hide_foreign_ids(purchasing_workspace):
    engine, business_id, owner_principal = purchasing_workspace
    staff_principal = AuthenticatedPrincipal(subject="t39-staff-reader")
    outsider_principal = AuthenticatedPrincipal(subject="t39-non-member")

    with Session(engine) as session:
        session.add(BusinessMembership(
            business_id=business_id,
            user_subject=staff_principal.subject,
            role=MembershipRole.STAFF,
        ))
        session.flush()
        order, line, product = _approved_order(
            session, business_id, owner_principal, quantity=Decimal("10.000")
        )
        supplier_id, order_id = order.supplier_id, order.id
        receive_purchase_order(
            session,
            principal=owner_principal,
            business_id=business_id,
            purchase_order_id=order_id,
            received_quantities={line.id: Decimal("2.000")},
        )
        session.commit()

        foreign_business = Business(name="T39 Foreign Shop", currency_code="EGP")
        session.add(foreign_business)
        session.flush()
        foreign_business_id = foreign_business.id
        foreign_principal = AuthenticatedPrincipal(subject="t39-foreign-owner")
        session.add(BusinessMembership(
            business_id=foreign_business_id,
            user_subject=foreign_principal.subject,
            role=MembershipRole.OWNER,
        ))
        session.flush()
        foreign_supplier = Supplier(
            business_id=foreign_business_id,
            name="T39 Foreign Supplier",
        )
        session.add(foreign_supplier)
        session.flush()
        foreign_product = create_product(
            session,
            principal=foreign_principal,
            business_id=foreign_business_id,
            name="T39 Foreign Product",
            unit_price=Decimal("5.00"),
            is_stock_tracked=True,
        )
        foreign_order = PurchaseOrder(
            business_id=foreign_business_id,
            supplier_id=foreign_supplier.id,
            order_number="PO-T39-FOREIGN",
            status="draft",
            currency_code="EGP",
            total=Decimal("5.00"),
        )
        session.add(foreign_order)
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=foreign_business_id,
            purchase_order_id=foreign_order.id,
            product_id=foreign_product.id,
            quantity=Decimal("1.000"),
            unit_cost=Decimal("5.00"),
            received_quantity=Decimal("0.000"),
        ))
        foreign_supplier_id, foreign_order_id = foreign_supplier.id, foreign_order.id
        session.commit()

    with Session(engine) as session:
        supplier_view = get_supplier(
            business_id=business_id,
            supplier_id=supplier_id,
            session=session,
            principal=staff_principal,
        )
        order_view = get_purchase_order(
            business_id=business_id,
            order_id=order_id,
            session=session,
            principal=staff_principal,
        )
        activity = get_purchase_order_activity(
            business_id=business_id,
            order_id=order_id,
            limit=100,
            offset=0,
            session=session,
            principal=staff_principal,
        )
        receipts = list_purchase_order_receipts(
            business_id=business_id,
            order_id=order_id,
            limit=100,
            offset=0,
            session=session,
            principal=staff_principal,
        )
        summary = purchase_order_summary(
            business_id=business_id,
            session=session,
            principal=staff_principal,
        )
        listing = list_purchase_orders(
            business_id=business_id,
            limit=100,
            offset=0,
            status=None,
            session=session,
            principal=staff_principal,
        )
        assert supplier_view["id"] == str(supplier_id)
        assert order_view["status"] == "partially_received"
        assert order_view["lines"][0]["remaining_quantity"] == "8.000"
        assert any(item["action"] == "purchase_order.received" for item in activity)
        assert len(receipts) == 1
        assert receipts[0]["quantity"] == "2.000"
        assert len(summary["groups"]) == 1
        assert summary["groups"][0]["currency_code"] == "EGP"
        assert summary["groups"][0]["status"] == "partially_received"
        assert len(listing) == 1

    foreign_reads = (
        lambda session: get_supplier(
            business_id=business_id, supplier_id=foreign_supplier_id,
            session=session, principal=owner_principal,
        ),
        lambda session: get_purchase_order(
            business_id=business_id, order_id=foreign_order_id,
            session=session, principal=owner_principal,
        ),
        lambda session: get_purchase_order_activity(
            business_id=business_id, order_id=foreign_order_id, limit=100, offset=0,
            session=session, principal=owner_principal,
        ),
        lambda session: list_purchase_order_receipts(
            business_id=business_id, order_id=foreign_order_id, limit=100, offset=0,
            session=session, principal=owner_principal,
        ),
    )
    for read in foreign_reads:
        with Session(engine) as session:
            with pytest.raises(HTTPException) as denied:
                read(session)
            assert denied.value.status_code == 404

    member_reads = (
        lambda session: get_supplier(
            business_id=business_id, supplier_id=supplier_id,
            session=session, principal=outsider_principal,
        ),
        lambda session: get_purchase_order(
            business_id=business_id, order_id=order_id,
            session=session, principal=outsider_principal,
        ),
        lambda session: get_purchase_order_activity(
            business_id=business_id, order_id=order_id, limit=100, offset=0,
            session=session, principal=outsider_principal,
        ),
        lambda session: list_purchase_order_receipts(
            business_id=business_id, order_id=order_id, limit=100, offset=0,
            session=session, principal=outsider_principal,
        ),
        lambda session: purchase_order_summary(
            business_id=business_id, session=session, principal=outsider_principal,
        ),
    )
    for read in member_reads:
        with Session(engine) as session:
            with pytest.raises(HTTPException) as denied:
                read(session)
            assert denied.value.status_code == 403

    with Session(engine) as session:
        assert list_purchase_orders(
            business_id=business_id,
            limit=100,
            offset=0,
            status=None,
            supplier_id=foreign_supplier_id,
            session=session,
            principal=owner_principal,
        ) == []


def test_supplier_patch_role_split_and_purchase_order_cancel_are_owner_gated(purchasing_workspace):
    engine, business_id, owner_principal = purchasing_workspace
    staff_principal = AuthenticatedPrincipal(subject="t39-staff-supplier-editor")

    with Session(engine) as session:
        session.add(BusinessMembership(
            business_id=business_id,
            user_subject=staff_principal.subject,
            role=MembershipRole.STAFF,
        ))
        supplier = Supplier(business_id=business_id, name="T39 Role Split Supplier")
        product = create_product(
            session,
            principal=owner_principal,
            business_id=business_id,
            name="T39 Role Split Product",
            unit_price=Decimal("10.00"),
            is_stock_tracked=True,
        )
        session.add(supplier)
        session.flush()
        order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier.id,
            order_number="PO-T39-CANCEL-GUARD",
            status="draft",
            currency_code="EGP",
            total=Decimal("10.00"),
        )
        session.add(order)
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=product.id,
            quantity=Decimal("1.000"),
            unit_cost=Decimal("10.00"),
            received_quantity=Decimal("0.000"),
        ))
        supplier_id, order_id = supplier.id, order.id
        session.commit()

    with Session(engine) as session:
        updated_supplier = patch_supplier(
            business_id=business_id,
            supplier_id=supplier_id,
            body=SupplierPatch(email="staff-updated@example.test"),
            session=session,
            principal=staff_principal,
        )
        assert updated_supplier["email"] == "staff-updated@example.test"

    with Session(engine) as session:
        with pytest.raises(HTTPException) as denied:
            patch_supplier(
                business_id=business_id,
                supplier_id=supplier_id,
                body=SupplierPatch(is_active=False),
                session=session,
                principal=staff_principal,
            )
        assert denied.value.status_code == 403

    with Session(engine) as session:
        with pytest.raises(HTTPException) as denied:
            cancel_purchase_order(
                business_id=business_id,
                order_id=order_id,
                session=session,
                principal=staff_principal,
            )
        assert denied.value.status_code == 403

    with Session(engine) as session:
        cancelled = cancel_purchase_order(
            business_id=business_id,
            order_id=order_id,
            session=session,
            principal=owner_principal,
        )
        assert cancelled["status"] == "cancelled"

    with Session(engine) as session:
        saved_supplier = session.get(Supplier, supplier_id)
        saved_order = session.get(PurchaseOrder, order_id)
        supplier_audits = session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "supplier.updated",
                AuditEvent.target_id == str(supplier_id),
            )
        ).all()
        cancel_audits = session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.cancelled",
                AuditEvent.target_id == str(order_id),
            )
        ).all()
        assert saved_supplier.email == "staff-updated@example.test"
        assert saved_supplier.is_active is True
        assert saved_order.status == "cancelled"
        assert len(supplier_audits) == 1
        assert len(cancel_audits) == 1

