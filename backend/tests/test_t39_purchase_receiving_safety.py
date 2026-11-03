from decimal import Decimal

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.extended_api import (
    PurchaseLineInput,
    ProductPatch,
    approve_purchase_order,
    PurchaseOrderInput,
    SupplierPatch,
    cancel_purchase_order,
    get_purchase_order,
    get_purchase_order_activity,
    get_supplier,
    list_purchase_order_receipts,
    list_purchase_orders,
    list_suppliers,
    patch_product,
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
    PurchaseReceiptIdempotency,
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
        supplier_id, order_id, product_id = order.supplier_id, order.id, product.id
        receive_purchase_order(
            session,
            principal=owner_principal,
            business_id=business_id,
            purchase_order_id=order_id,
            received_quantities={line.id: Decimal("2.000")},
        )
        receive_purchase_order(
            session,
            principal=owner_principal,
            business_id=business_id,
            purchase_order_id=order_id,
            received_quantities={line.id: Decimal("3.000")},
        )

        usd_order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier_id,
            order_number="PO-T39-USD-SUMMARY",
            status="draft",
            currency_code="USD",
            total=Decimal("5.00"),
        )
        session.add(usd_order)
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=usd_order.id,
            product_id=product_id,
            quantity=Decimal("1.000"),
            unit_cost=Decimal("5.00"),
            received_quantity=Decimal("0.000"),
        ))
        session.commit()

    with Session(engine) as session:
        with pytest.raises(HTTPException) as cancel_denied:
            cancel_purchase_order(
                business_id=business_id,
                order_id=order_id,
                session=session,
                principal=owner_principal,
            )
        assert cancel_denied.value.status_code == 422

    with Session(engine) as session:
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
        assert order_view["lines"][0]["remaining_quantity"] == "5.000"
        assert len(activity) == 2
        assert all(item["action"] == "purchase_order.received" for item in activity)
        assert len(receipts) == 2
        page_one = list_purchase_order_receipts(
            business_id=business_id, order_id=order_id, limit=1, offset=0,
            session=session, principal=staff_principal,
        )
        page_two = list_purchase_order_receipts(
            business_id=business_id, order_id=order_id, limit=1, offset=1,
            session=session, principal=staff_principal,
        )
        assert len(page_one) == len(page_two) == 1
        assert page_one[0]["id"] != page_two[0]["id"]
        assert {page_one[0]["quantity"], page_two[0]["quantity"]} == {"2.000", "3.000"}
        assert len(summary["groups"]) == 2
        groups = {(item["status"], item["currency_code"]): item for item in summary["groups"]}
        assert set(groups) == {("partially_received", "EGP"), ("draft", "USD")}
        assert groups[("partially_received", "EGP")]["total"] == "100.00"
        assert groups[("draft", "USD")]["total"] == "5.00"
        assert len(listing) == 2
        cancel_audits = session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.cancelled",
                AuditEvent.target_id == str(order_id),
            )
        ).all()
        assert cancel_audits == []

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




def test_owner_can_replace_draft_purchase_order_with_multiple_lines_without_stock_side_effects(
    purchasing_workspace,
):
    engine, business_id, owner_principal = purchasing_workspace

    with Session(engine) as session:
        supplier = Supplier(business_id=business_id, name="T39 Multi-line Supplier")
        session.add(supplier)
        session.flush()
        first_product = create_product(
            session,
            principal=owner_principal,
            business_id=business_id,
            name="T39 Multi-line Product A",
            unit_price=Decimal("4.00"),
            is_stock_tracked=True,
        )
        second_product = create_product(
            session,
            principal=owner_principal,
            business_id=business_id,
            name="T39 Multi-line Product B",
            unit_price=Decimal("5.00"),
            is_stock_tracked=True,
        )
        order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier.id,
            order_number="PO-T39-MULTILINE",
            status="draft",
            currency_code="EGP",
            total=Decimal("4.00"),
        )
        session.add(order)
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=first_product.id,
            quantity=Decimal("1.000"),
            unit_cost=Decimal("4.00"),
            received_quantity=Decimal("0.000"),
        ))
        supplier_id = supplier.id
        order_id = order.id
        first_product_id = first_product.id
        second_product_id = second_product.id
        session.commit()

    replacement = PurchaseOrderInput(
        supplier_id=supplier_id,
        order_number="PO-T39-MULTILINE-UPDATED",
        currency_code="EGP",
        lines=[
            PurchaseLineInput(
                product_id=first_product_id,
                quantity=Decimal("2.000"),
                unit_cost=Decimal("4.00"),
            ),
            PurchaseLineInput(
                product_id=second_product_id,
                quantity=Decimal("3.000"),
                unit_cost=Decimal("5.00"),
            ),
        ],
    )

    with Session(engine) as session:
        updated = update_purchase_order(
            business_id=business_id,
            order_id=order_id,
            body=replacement,
            session=session,
            principal=owner_principal,
        )
        assert updated["status"] == "draft"
        assert updated["order_number"] == "PO-T39-MULTILINE-UPDATED"
        assert Decimal(updated["total"]) == Decimal("23.00")

    with Session(engine) as session:
        detail = get_purchase_order(
            business_id=business_id,
            order_id=order_id,
            session=session,
            principal=owner_principal,
        )
        lines_by_product = {line["product_id"]: line for line in detail["lines"]}
        assert set(lines_by_product) == {str(first_product_id), str(second_product_id)}
        assert lines_by_product[str(first_product_id)]["quantity"] == "2.000"
        assert lines_by_product[str(second_product_id)]["quantity"] == "3.000"
        assert all(line["remaining_quantity"] == line["quantity"] for line in detail["lines"])

        update_audits = session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.updated",
                AuditEvent.target_id == str(order_id),
            )
        ).all()
        stock_movements = session.scalars(
            select(StockMovement).where(
                StockMovement.business_id == business_id,
                StockMovement.reference_type == "purchase_order",
                StockMovement.reference_id == order_id,
            )
        ).all()
        assert len(update_audits) == 1
        assert stock_movements == []


def test_purchase_order_approval_is_owner_only_and_has_no_stock_posting_side_effects(
    purchasing_workspace,
):
    engine, business_id, owner_principal = purchasing_workspace
    staff_principal = AuthenticatedPrincipal(subject="t39-staff-approver")

    with Session(engine) as session:
        session.add(BusinessMembership(
            business_id=business_id,
            user_subject=staff_principal.subject,
            role=MembershipRole.STAFF,
        ))
        supplier = Supplier(business_id=business_id, name="T39 Approval Supplier")
        session.add(supplier)
        session.flush()
        product = create_product(
            session,
            principal=owner_principal,
            business_id=business_id,
            name="T39 Approval Product",
            unit_price=Decimal("7.00"),
            is_stock_tracked=True,
        )
        staff_order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier.id,
            order_number="PO-T39-STAFF-APPROVAL",
            status="draft",
            currency_code="EGP",
            total=Decimal("7.00"),
        )
        owner_order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier.id,
            order_number="PO-T39-OWNER-APPROVAL",
            status="draft",
            currency_code="EGP",
            total=Decimal("7.00"),
        )
        session.add_all([staff_order, owner_order])
        session.flush()
        for order in (staff_order, owner_order):
            session.add(PurchaseOrderLine(
                business_id=business_id,
                purchase_order_id=order.id,
                product_id=product.id,
                quantity=Decimal("1.000"),
                unit_cost=Decimal("7.00"),
                received_quantity=Decimal("0.000"),
            ))
        staff_order_id, owner_order_id = staff_order.id, owner_order.id
        session.commit()

    with Session(engine) as session:
        with pytest.raises(HTTPException) as denied:
            approve_purchase_order(
                business_id=business_id,
                order_id=staff_order_id,
                session=session,
                principal=staff_principal,
            )
        assert denied.value.status_code == 403

    with Session(engine) as session:
        approved = approve_purchase_order(
            business_id=business_id,
            order_id=owner_order_id,
            session=session,
            principal=owner_principal,
        )
        assert approved["status"] == "approved"

    with Session(engine) as session:
        saved_staff_order = session.get(PurchaseOrder, staff_order_id)
        saved_owner_order = session.get(PurchaseOrder, owner_order_id)
        approval_audits = session.scalars(
            select(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.approved",
            )
        ).all()
        stock_movements = session.scalars(
            select(StockMovement).where(
                StockMovement.business_id == business_id,
                StockMovement.reference_type == "purchase_order",
            )
        ).all()
        assert saved_staff_order.status == "draft"
        assert saved_owner_order.status == "approved"
        assert len(approval_audits) == 1
        assert stock_movements == []


def test_purchase_order_activity_history_paginates_and_cancel_denials_have_no_side_effects(
    purchasing_workspace,
):
    engine, business_id, owner_principal = purchasing_workspace
    outsider_principal = AuthenticatedPrincipal(subject="t39-cancel-outsider")

    with Session(engine) as session:
        order, line, product = _approved_order(
            session, business_id, owner_principal, quantity=Decimal("4.000")
        )
        order_id = order.id
        session.commit()

        # Two partial receipts create two independent lifecycle events.
        receive_purchase_order(
            session,
            principal=owner_principal,
            business_id=business_id,
            purchase_order_id=order_id,
            received_quantities={line.id: Decimal("1.000")},
        )
        receive_purchase_order(
            session,
            principal=owner_principal,
            business_id=business_id,
            purchase_order_id=order_id,
            received_quantities={line.id: Decimal("1.000")},
        )

    with Session(engine) as session:
        first_page = get_purchase_order_activity(
            business_id=business_id,
            order_id=order_id,
            limit=1,
            offset=0,
            session=session,
            principal=owner_principal,
        )
        second_page = get_purchase_order_activity(
            business_id=business_id,
            order_id=order_id,
            limit=1,
            offset=1,
            session=session,
            principal=owner_principal,
        )
        assert len(first_page) == len(second_page) == 1
        assert first_page[0]["id"] != second_page[0]["id"]
        assert first_page[0]["action"] == second_page[0]["action"] == "purchase_order.received"

    with Session(engine) as session:
        foreign_business = Business(name="T39 Cancel Isolation Shop", currency_code="EGP")
        session.add(foreign_business)
        session.flush()
        foreign_business_id = foreign_business.id
        foreign_principal = AuthenticatedPrincipal(subject="t39-cancel-foreign-owner")
        session.add(BusinessMembership(
            business_id=foreign_business_id,
            user_subject=foreign_principal.subject,
            role=MembershipRole.OWNER,
        ))
        session.commit()
        foreign_order, foreign_line, _ = _approved_order(
            session, foreign_business_id, foreign_principal, quantity=Decimal("2.000")
        )
        foreign_order_id = foreign_order.id
        session.commit()

    with Session(engine) as session:
        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id.in_([business_id, foreign_business_id])
            )
        )
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id.in_([business_id, foreign_business_id])
            )
        )

        with pytest.raises(HTTPException) as received_order_denied:
            cancel_purchase_order(
                business_id=business_id,
                order_id=order_id,
                session=session,
                principal=owner_principal,
            )
        assert received_order_denied.value.status_code == 422
        session.rollback()

        with pytest.raises(HTTPException) as outsider_denied:
            cancel_purchase_order(
                business_id=business_id,
                order_id=order_id,
                session=session,
                principal=outsider_principal,
            )
        assert outsider_denied.value.status_code == 403
        session.rollback()

        with pytest.raises(HTTPException) as foreign_denied:
            cancel_purchase_order(
                business_id=business_id,
                order_id=foreign_order_id,
                session=session,
                principal=owner_principal,
            )
        assert foreign_denied.value.status_code == 422
        session.rollback()
        session.expire_all()

        assert session.get(PurchaseOrder, order_id).status == "partially_received"
        assert session.get(PurchaseOrder, foreign_order_id).status == "approved"
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id.in_([business_id, foreign_business_id])
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id.in_([business_id, foreign_business_id])
            )
        ) == audit_count_before


def test_purchase_order_edit_rejects_approved_and_foreign_orders_without_side_effects(
    purchasing_workspace,
):
    engine, business_id, owner_principal = purchasing_workspace

    with Session(engine) as session:
        approved_order, approved_line, local_product = _approved_order(
            session, business_id, owner_principal, quantity=Decimal("3.000")
        )
        approved_order_id = approved_order.id
        supplier_id = approved_order.supplier_id
        local_product_id = local_product.id
        approve_purchase_order(
            business_id=business_id,
            order_id=approved_order_id,
            session=session,
            principal=owner_principal,
        )

    with Session(engine) as session:
        foreign_business = Business(name="T39 Edit Isolation Shop", currency_code="EGP")
        session.add(foreign_business)
        session.flush()
        foreign_business_id = foreign_business.id
        foreign_principal = AuthenticatedPrincipal(subject="t39-edit-foreign-owner")
        session.add(BusinessMembership(
            business_id=foreign_business_id,
            user_subject=foreign_principal.subject,
            role=MembershipRole.OWNER,
        ))
        session.commit()
        foreign_order, _, _ = _approved_order(
            session, foreign_business_id, foreign_principal, quantity=Decimal("2.000")
        )
        foreign_order_id = foreign_order.id
        session.commit()

    replacement = PurchaseOrderInput(
        supplier_id=supplier_id,
        order_number="PO-T39-EDIT-REJECTED",
        currency_code="EGP",
        lines=[
            PurchaseLineInput(
                product_id=local_product_id,
                quantity=Decimal("5.000"),
                unit_cost=Decimal("10.00"),
            )
        ],
    )

    with Session(engine) as session:
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id.in_([business_id, foreign_business_id])
            )
        )
        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id.in_([business_id, foreign_business_id])
            )
        )
        line_count_before = session.scalar(
            select(func.count()).select_from(PurchaseOrderLine).where(
                PurchaseOrderLine.purchase_order_id == approved_order_id
            )
        )

        with pytest.raises(HTTPException) as immutable_denied:
            update_purchase_order(
                business_id=business_id,
                order_id=approved_order_id,
                body=replacement,
                session=session,
                principal=owner_principal,
            )
        assert immutable_denied.value.status_code == 422
        session.rollback()

        with pytest.raises(HTTPException) as foreign_denied:
            update_purchase_order(
                business_id=business_id,
                order_id=foreign_order_id,
                body=replacement,
                session=session,
                principal=owner_principal,
            )
        assert foreign_denied.value.status_code == 422
        session.rollback()
        session.expire_all()

        assert session.get(PurchaseOrder, approved_order_id).status == "approved"
        assert session.get(PurchaseOrder, foreign_order_id).status == "approved"
        assert session.scalar(
            select(func.count()).select_from(PurchaseOrderLine).where(
                PurchaseOrderLine.purchase_order_id == approved_order_id
            )
        ) == line_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id.in_([business_id, foreign_business_id])
            )
        ) == audit_count_before
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id.in_([business_id, foreign_business_id])
            )
        ) == movement_count_before


@pytest.mark.parametrize("inactive_reference", ["supplier", "product"])
def test_approval_rejects_deactivated_supplier_or_product_without_side_effects(
    purchasing_workspace, inactive_reference
):
    """A draft cannot be approved after a referenced supplier/product is deactivated."""
    engine, business_id, owner_principal = purchasing_workspace

    with Session(engine) as session:
        supplier = Supplier(
            business_id=business_id,
            name="T39 Revalidation Supplier",
        )
        session.add(supplier)
        session.flush()
        product = create_product(
            session,
            principal=owner_principal,
            business_id=business_id,
            name="T39 Revalidation Product",
            unit_price=Decimal("9.00"),
            is_stock_tracked=True,
        )
        order = PurchaseOrder(
            business_id=business_id,
            supplier_id=supplier.id,
            order_number=f"PO-T39-REVALIDATE-{inactive_reference.upper()}",
            status="draft",
            currency_code="EGP",
            total=Decimal("9.00"),
        )
        session.add(order)
        session.flush()
        session.add(PurchaseOrderLine(
            business_id=business_id,
            purchase_order_id=order.id,
            product_id=product.id,
            quantity=Decimal("1.000"),
            unit_cost=Decimal("9.00"),
            received_quantity=Decimal("0.000"),
        ))
        supplier_id, product_id, order_id = supplier.id, product.id, order.id
        session.commit()

    with Session(engine) as session:
        if inactive_reference == "supplier":
            session.get(Supplier, supplier_id).is_active = False
        else:
            session.get(Product, product_id).is_active = False
        session.commit()

    with Session(engine) as session:
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )
        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )

    with Session(engine) as session:
        with pytest.raises(HTTPException) as rejected:
            approve_purchase_order(
                business_id=business_id,
                order_id=order_id,
                session=session,
                principal=owner_principal,
            )
        assert rejected.value.status_code == 422

    with Session(engine) as session:
        saved_order = session.get(PurchaseOrder, order_id)
        assert saved_order.status == "draft"
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id,
                AuditEvent.action == "purchase_order.approved",
                AuditEvent.target_id == str(order_id),
            )
        ) == 0


def test_purchase_order_status_and_supplier_filters_compose_and_paginate(purchasing_workspace):
    """PO filters compose without crossing tenant boundaries or destabilizing pages."""
    engine, business_id, owner_principal = purchasing_workspace
    with Session(engine) as session:
        supplier_a = Supplier(business_id=business_id, name="Filter Supplier A")
        supplier_b = Supplier(business_id=business_id, name="Filter Supplier B")
        foreign_business = Business(name="Foreign Filter Shop", currency_code="EGP")
        session.add_all([supplier_a, supplier_b, foreign_business])
        session.flush()
        foreign_supplier = Supplier(
            business_id=foreign_business.id,
            name="Foreign Filter Supplier",
        )
        session.add(foreign_supplier)
        session.flush()

        orders = [
            PurchaseOrder(
                business_id=business_id,
                supplier_id=supplier_a.id,
                order_number="PO-FILTER-A-DRAFT",
                status="draft",
                currency_code="EGP",
                total=Decimal("10.00"),
            ),
            PurchaseOrder(
                business_id=business_id,
                supplier_id=supplier_a.id,
                order_number="PO-FILTER-A-APPROVED",
                status="approved",
                currency_code="EGP",
                total=Decimal("20.00"),
            ),
            PurchaseOrder(
                business_id=business_id,
                supplier_id=supplier_b.id,
                order_number="PO-FILTER-B-DRAFT",
                status="draft",
                currency_code="USD",
                total=Decimal("30.00"),
            ),
            PurchaseOrder(
                business_id=foreign_business.id,
                supplier_id=foreign_supplier.id,
                order_number="PO-FILTER-FOREIGN",
                status="draft",
                currency_code="EGP",
                total=Decimal("999.00"),
            ),
        ]
        session.add_all(orders)
        session.commit()
        supplier_a_id = supplier_a.id
        local_order_ids = {str(order.id) for order in orders[:3]}
        expected_status_ids = {str(orders[0].id), str(orders[2].id)}
        expected_supplier_ids = {str(orders[0].id), str(orders[1].id)}
        expected_combined_ids = {str(orders[0].id)}
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )
        movement_count_before = session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        )

        all_rows = list_purchase_orders(
            business_id=business_id,
            limit=20,
            offset=0,
            status=None,
            supplier_id=None,
            session=session,
            principal=owner_principal,
        )
        status_rows = list_purchase_orders(
            business_id=business_id,
            limit=20,
            offset=0,
            status="draft",
            supplier_id=None,
            session=session,
            principal=owner_principal,
        )
        supplier_rows = list_purchase_orders(
            business_id=business_id,
            limit=20,
            offset=0,
            status=None,
            supplier_id=supplier_a_id,
            session=session,
            principal=owner_principal,
        )
        combined_rows = list_purchase_orders(
            business_id=business_id,
            limit=20,
            offset=0,
            status="draft",
            supplier_id=supplier_a_id,
            session=session,
            principal=owner_principal,
        )

        all_ids = [row["id"] for row in all_rows]
        paged_ids = []
        for offset in range(len(all_ids)):
            page = list_purchase_orders(
                business_id=business_id,
                limit=1,
                offset=offset,
                status=None,
                supplier_id=None,
                session=session,
                principal=owner_principal,
            )
            paged_ids.extend(row["id"] for row in page)

        assert set(all_ids) == local_order_ids
        assert {row["id"] for row in status_rows} == expected_status_ids
        assert {row["id"] for row in supplier_rows} == expected_supplier_ids
        assert {row["id"] for row in combined_rows} == expected_combined_ids
        assert paged_ids == all_ids
        assert len(paged_ids) == len(set(paged_ids))
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before
        assert session.scalar(
            select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id
            )
        ) == movement_count_before


def test_supplier_search_is_case_insensitive_paginated_and_owner_controls_inactive_visibility(
    purchasing_workspace,
):
    """Supplier search is tenant-scoped; inactive rows remain OWNER-only."""
    engine, business_id, owner_principal = purchasing_workspace
    with Session(engine) as session:
        local_suppliers = [
            Supplier(business_id=business_id, name="Northwind Alpha", is_active=True),
            Supplier(business_id=business_id, name="northwind Beta", is_active=True),
            Supplier(business_id=business_id, name="NORTHWIND Gamma", is_active=True),
            Supplier(business_id=business_id, name="Northwind Archived", is_active=False),
        ]
        foreign_business = Business(name="Foreign Supplier Search Shop", currency_code="EGP")
        session.add_all(local_suppliers + [foreign_business])
        session.flush()
        foreign_supplier = Supplier(
            business_id=foreign_business.id,
            name="Northwind Foreign",
            is_active=True,
        )
        staff_membership = BusinessMembership(
            business_id=business_id,
            user_subject="t39-staff-search",
            role=MembershipRole.STAFF,
        )
        session.add_all([foreign_supplier, staff_membership])
        session.commit()

        staff_principal = AuthenticatedPrincipal(subject="t39-staff-search")
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )

        owner_active = list_suppliers(
            business_id=business_id,
            limit=20,
            offset=0,
            include_inactive=False,
            name="nOrThWiNd",
            session=session,
            principal=owner_principal,
        )
        owner_page_one = list_suppliers(
            business_id=business_id,
            limit=2,
            offset=0,
            include_inactive=False,
            name="nOrThWiNd",
            session=session,
            principal=owner_principal,
        )
        owner_page_two = list_suppliers(
            business_id=business_id,
            limit=2,
            offset=2,
            include_inactive=False,
            name="nOrThWiNd",
            session=session,
            principal=owner_principal,
        )
        owner_including_inactive = list_suppliers(
            business_id=business_id,
            limit=20,
            offset=0,
            include_inactive=True,
            name="nOrThWiNd",
            session=session,
            principal=owner_principal,
        )
        staff_active = list_suppliers(
            business_id=business_id,
            limit=20,
            offset=0,
            include_inactive=False,
            name="nOrThWiNd",
            session=session,
            principal=staff_principal,
        )

        with pytest.raises(HTTPException) as inactive_denied:
            list_suppliers(
                business_id=business_id,
                limit=20,
                offset=0,
                include_inactive=True,
                name="nOrThWiNd",
                session=session,
                principal=staff_principal,
            )

        active_ids = [row["id"] for row in owner_active]
        paged_ids = [row["id"] for row in owner_page_one + owner_page_two]
        assert len(owner_active) == 3
        assert all("northwind" in row["name"].lower() for row in owner_active)
        assert all(row["business_id"] == str(business_id) for row in owner_active)
        assert paged_ids == active_ids
        assert len(paged_ids) == len(set(paged_ids))
        assert len(owner_including_inactive) == 4
        assert any(row["is_active"] is False for row in owner_including_inactive)
        assert len(staff_active) == 3
        assert inactive_denied.value.status_code == 403
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before


def test_owner_cannot_disable_stock_tracking_after_completed_purchase_receipt(
    purchasing_workspace,
):
    """The historical StockMovement guard still applies after the PO is fully received."""
    engine, business_id, owner_principal = purchasing_workspace
    with Session(engine) as session:
        order, line, product = _approved_order(
            session,
            business_id,
            owner_principal,
            quantity=Decimal("5"),
        )
        order_id, line_id, product_id = order.id, line.id, product.id
        received = receive_purchase_order(
            session,
            principal=owner_principal,
            business_id=business_id,
            purchase_order_id=order_id,
            received_quantities={line_id: Decimal("5")},
        )
        assert received.status == "received"
        session.commit()

    with Session(engine) as session:
        audit_count_before = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        )
        movement_ids_before = set(session.scalars(
            select(StockMovement.id).where(
                StockMovement.business_id == business_id,
                StockMovement.product_id == product_id,
            )
        ).all())

        with pytest.raises(HTTPException) as rejected:
            patch_product(
                business_id=business_id,
                product_id=product_id,
                body=ProductPatch(is_stock_tracked=False),
                session=session,
                principal=owner_principal,
            )
        assert rejected.value.status_code == 422
        assert "stock movements" in rejected.value.detail.lower()

    with Session(engine) as session:
        assert session.get(Product, product_id).is_stock_tracked is True
        assert session.get(PurchaseOrder, order_id).status == "received"
        assert session.get(PurchaseOrderLine, line_id).received_quantity == Decimal("5.000")
        movement_ids_after = set(session.scalars(
            select(StockMovement.id).where(
                StockMovement.business_id == business_id,
                StockMovement.product_id == product_id,
            )
        ).all())
        assert movement_ids_after == movement_ids_before
        assert session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_id
            )
        ) == audit_count_before


def test_purchase_order_list_rejects_invalid_status_query_without_side_effects(
    purchasing_workspace,
):
    """FastAPI rejects invalid PO status filters before reaching the route handler."""
    engine, business_id, owner_principal = purchasing_workspace
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal(
        subject=owner_principal.subject
    )
    try:
        with Session(engine) as session:
            audit_count_before = session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )
            )
            movement_count_before = session.scalar(
                select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == business_id
                )
            )

        response = TestClient(app).get(
            f"/api/v1/businesses/{business_id}/purchase-orders?status=unknown"
        )
        assert response.status_code == 422

        with Session(engine) as session:
            assert session.scalar(
                select(func.count()).select_from(AuditEvent).where(
                    AuditEvent.business_id == business_id
                )
            ) == audit_count_before
            assert session.scalar(
                select(func.count()).select_from(StockMovement).where(
                    StockMovement.business_id == business_id
                )
            ) == movement_count_before
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


def test_purchase_receipt_idempotency_record_is_business_scoped_and_unique(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, line, product = _approved_order(session, business_id, principal)
        session.add(
            PurchaseReceiptIdempotency(
                business_id=business_id,
                purchase_order_id=order.id,
                idempotency_key="receipt-key-001",
                request_hash="a" * 64,
                response_status=200,
                response_body={"id": str(order.id), "status": "partially_received"},
            )
        )
        session.commit()

        persisted = session.scalar(
            select(PurchaseReceiptIdempotency).where(
                PurchaseReceiptIdempotency.business_id == business_id,
                PurchaseReceiptIdempotency.idempotency_key == "receipt-key-001",
            )
        )
        assert persisted is not None
        assert persisted.request_hash == "a" * 64
        assert persisted.response_body["status"] == "partially_received"

        second_order = PurchaseOrder(
            business_id=business_id,
            supplier_id=order.supplier_id,
            order_number="PO-T39-SAFETY-SECOND",
            status="approved",
            currency_code="EGP",
            total=Decimal("10"),
        )
        session.add(second_order)
        session.flush()
        session.add(
            PurchaseOrderLine(
                business_id=business_id,
                purchase_order_id=second_order.id,
                product_id=product.id,
                quantity=Decimal("1"),
                unit_cost=Decimal("10"),
                received_quantity=Decimal("0"),
            )
        )
        session.commit()
        session.add(
            PurchaseReceiptIdempotency(
                business_id=business_id,
                purchase_order_id=second_order.id,
                idempotency_key="receipt-key-001",
                request_hash="b" * 64,
                response_status=200,
                response_body={"id": str(second_order.id), "status": "received"},
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        business_b = Business(name='T39 Other Tenant', currency_code='EGP')
        session.add(business_b)
        session.flush()
        session.add(
            BusinessMembership(
                business_id=business_b.id,
                user_subject='t39-owner-b',
                role=MembershipRole.OWNER,
            )
        )
        session.commit()
        principal_b = AuthenticatedPrincipal(subject='t39-owner-b')
        order_b, line_b, product_b = _approved_order(session, business_b.id, principal_b)
        session.add(
            PurchaseReceiptIdempotency(
                business_id=business_b.id,
                purchase_order_id=order_b.id,
                idempotency_key="receipt-key-001",
                request_hash="c" * 64,
                response_status=200,
                response_body={"id": str(order_b.id), "status": "partially_received"},
            )
        )
        session.commit()
        assert session.scalar(
            select(func.count()).select_from(PurchaseReceiptIdempotency).where(
                PurchaseReceiptIdempotency.idempotency_key == "receipt-key-001"
            )
        ) == 2


def test_purchase_receipt_idempotency_rejects_missing_key(purchasing_workspace):
    engine, business_id, principal = purchasing_workspace
    with Session(engine) as session:
        order, line, product = _approved_order(session, business_id, principal)
        session.add(
            PurchaseReceiptIdempotency(
                business_id=business_id,
                purchase_order_id=order.id,
                idempotency_key="",
                request_hash="a" * 64,
                response_status=200,
                response_body={"id": str(order.id)},
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
        assert session.scalar(
            select(func.count()).select_from(PurchaseReceiptIdempotency).where(
                PurchaseReceiptIdempotency.business_id == business_id
            )
        ) == 0
