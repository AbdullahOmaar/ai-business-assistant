"""Additional workflow operations for purchasing, returns, notifications, and reports.

Run each operation inside the request layer's database transaction. All queries are
business-scoped and require a principal supplied by a trusted authentication adapter.
"""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain_rules import (
    money,
    discounted_return_line_total,
    summarize_money_by_currency,
    validate_return_amount,
    validate_return_quantity,
)
from app.models import (
    AuditEvent, Expense, Invoice, InvoiceLine, MembershipRole, Notification,
    Payment, PaymentAllocation, Product, PurchaseOrder, PurchaseOrderLine,
    SalesReturn, SalesReturnLine, StockMovement,
)
from app.security import AuthenticatedPrincipal, authorize_membership
from app.services import WorkflowError, _audit, record_stock_movement

ZERO = Decimal("0")


def _authorize(
    session: Session, principal: AuthenticatedPrincipal, business_id: UUID,
    *, owner_only: bool = False,
) -> None:
    authorize_membership(
        session,
        principal=principal,
        business_id=business_id,
        allowed_roles={MembershipRole.OWNER} if owner_only else None,
    )


def receive_purchase_order(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    purchase_order_id: UUID, received_quantities: dict[UUID, Decimal],
) -> PurchaseOrder:
    """Receive quantities against an approved order and record stock ledger events."""
    _authorize(session, principal, business_id, owner_only=True)
    order = session.scalars(select(PurchaseOrder).where(
        PurchaseOrder.id == purchase_order_id,
        PurchaseOrder.business_id == business_id,
    ).with_for_update()).one_or_none()
    if order is None:
        raise WorkflowError("Purchase order not found in this business")
    if order.status not in {"approved", "partially_received"}:
        raise WorkflowError("Only approved purchase orders can be received")
    lines = session.scalars(select(PurchaseOrderLine).where(
        PurchaseOrderLine.purchase_order_id == order.id,
        PurchaseOrderLine.business_id == business_id,
    ).with_for_update()).all()
    by_id = {line.id: line for line in lines}
    if not received_quantities:
        raise WorkflowError("At least one received quantity is required")
    # Validate every line and lock its product before writing anything. A later
    # invalid line must not leave earlier lines, stock movements, or audit events
    # partially staged if the caller catches WorkflowError in the same transaction.
    prepared_receipts: list[tuple[PurchaseOrderLine, Product, Decimal]] = []
    for line_id, quantity in received_quantities.items():
        line = by_id.get(line_id)
        if line is None:
            raise WorkflowError("Purchase order line not found on this order")
        if (
            not quantity.is_finite()
            or quantity <= ZERO
            or line.received_quantity + quantity > line.quantity
        ):
            raise WorkflowError("Received quantity must be finite, positive and cannot exceed ordered quantity")
        product = session.scalars(select(Product).where(
            Product.id == line.product_id, Product.business_id == business_id,
        ).with_for_update()).one_or_none()
        if product is None:
            raise WorkflowError("Purchase order product not found in this business")
        prepared_receipts.append((line, product, quantity))

    for line, product, quantity in prepared_receipts:
        line.received_quantity += quantity
        if product.is_stock_tracked:
            record_stock_movement(
                session, principal=principal, business_id=business_id,
                product_id=product.id, movement_type="receipt",
                quantity_delta=quantity, reason=f"Received on {order.order_number}",
                reference_type="purchase_order", reference_id=order.id,
            )
    session.flush()
    order.status = (
        "received" if all(line.received_quantity == line.quantity for line in lines)
        else "partially_received"
    )
    _audit(session, business_id=business_id, principal=principal,
           action="purchase_order.received", target_type="purchase_order",
           target_id=order.id, summary=order.status)
    return order


def approve_sales_return(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    sales_return_id: UUID,
) -> SalesReturn:
    """Approve a draft return only if cumulative returned quantities remain valid."""
    _authorize(session, principal, business_id, owner_only=True)
    sales_return = session.scalars(select(SalesReturn).where(
        SalesReturn.id == sales_return_id,
        SalesReturn.business_id == business_id,
    ).with_for_update()).one_or_none()
    if sales_return is None:
        raise WorkflowError("Sales return not found in this business")
    if sales_return.status != "draft":
        raise WorkflowError("Only draft returns can be approved")
    invoice = session.scalars(select(Invoice).where(
        Invoice.id == sales_return.invoice_id,
        Invoice.business_id == business_id,
    ).with_for_update()).one_or_none()
    if invoice is None or invoice.status != "issued":
        raise WorkflowError("A return requires an issued invoice")
    return_lines = session.scalars(select(SalesReturnLine).where(
        SalesReturnLine.sales_return_id == sales_return.id,
        SalesReturnLine.business_id == business_id,
    ).with_for_update()).all()
    if not return_lines:
        raise WorkflowError("A return must contain at least one line")
    total = ZERO
    invoice_lines_for_allocation = session.scalars(select(InvoiceLine).where(
        InvoiceLine.invoice_id == invoice.id,
        InvoiceLine.business_id == business_id,
    ).order_by(InvoiceLine.id)).all()
    discount_allocation_values = [
        (str(row.id), row.line_total) for row in invoice_lines_for_allocation
    ]

    # Validate aggregate quantity and amount per source line, including duplicate
    # rows within this draft return, before recording any stock movements.
    requested_by_line: dict[UUID, dict[str, Decimal]] = {}
    for returned in return_lines:
        requested = requested_by_line.setdefault(
            returned.invoice_line_id, {"quantity": ZERO, "amount": ZERO}
        )
        requested["quantity"] += returned.quantity
        requested["amount"] += returned.amount

    invoice_lines: dict[UUID, InvoiceLine] = {}
    for invoice_line_id, requested in sorted(
        requested_by_line.items(), key=lambda item: str(item[0])
    ):
        original_line = session.scalars(select(InvoiceLine).where(
            InvoiceLine.id == invoice_line_id,
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
        ).with_for_update()).one_or_none()
        if original_line is None:
            raise WorkflowError("Return line must reference a line from its original invoice")
        previously_returned = session.scalar(select(func.coalesce(
            func.sum(SalesReturnLine.quantity), 0
        )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
            SalesReturnLine.invoice_line_id == original_line.id,
            SalesReturnLine.business_id == business_id,
            SalesReturn.status == "approved",
        ))
        previously_returned_amount = session.scalar(select(func.coalesce(
            func.sum(SalesReturnLine.amount), 0
        )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
            SalesReturnLine.invoice_line_id == original_line.id,
            SalesReturnLine.business_id == business_id,
            SalesReturn.status == "approved",
        ))
        validate_return_quantity(
            sold_quantity=original_line.quantity,
            previously_returned=Decimal(str(previously_returned or 0)),
            requested_quantity=requested["quantity"],
        )
        validate_return_amount(
            invoiced_amount=discounted_return_line_total(
                invoice_subtotal=invoice.subtotal,
                invoice_discount_total=invoice.discount_total,
                invoice_lines=discount_allocation_values,
                target_line_id=str(original_line.id),
            ),
            previously_returned_amount=Decimal(str(previously_returned_amount or 0)),
            requested_return_amount=requested["amount"],
        )
        invoice_lines[invoice_line_id] = original_line
        total += requested["amount"]

    for returned in return_lines:
        original_line = invoice_lines[returned.invoice_line_id]
        if original_line.product_id is not None:
            product = session.scalars(select(Product).where(
                Product.id == original_line.product_id,
                Product.business_id == business_id,
            )).one_or_none()
            if product is not None and product.is_stock_tracked:
                record_stock_movement(
                    session, principal=principal, business_id=business_id,
                    product_id=product.id, movement_type="return",
                    quantity_delta=returned.quantity,
                    reason=f"Approved sales return {sales_return.id}",
                    reference_type="sales_return", reference_id=sales_return.id,
                )
    sales_return.total = money(total)
    sales_return.status = "approved"
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="sales_return.approved", target_type="sales_return",
           target_id=sales_return.id, summary=f"{sales_return.total} {invoice.currency_code}")
    return sales_return


def queue_notification(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    kind: str, title: str, body: str, deduplication_key: str,
) -> Notification:
    """Create a pending notification; delivery is intentionally a separate worker."""
    _authorize(session, principal, business_id)
    if not all(value.strip() for value in (kind, title, body, deduplication_key)):
        raise WorkflowError("Notification kind, title, body and deduplication key are required")
    existing = session.scalars(select(Notification).where(
        Notification.business_id == business_id,
        Notification.deduplication_key == deduplication_key.strip(),
    )).one_or_none()
    if existing is not None:
        return existing
    notification = Notification(
        business_id=business_id, kind=kind.strip(), title=title.strip(),
        body=body.strip(), deduplication_key=deduplication_key.strip(),
        status="pending",
    )
    session.add(notification)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="notification.queued", target_type="notification",
           target_id=notification.id)
    return notification


def financial_summary(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
) -> dict[str, dict[str, Decimal]]:
    """Return issued invoice totals, allocated payments and expenses per currency."""
    _authorize(session, principal, business_id)
    invoice_rows = session.execute(select(
        Invoice.currency_code, func.sum(Invoice.total),
    ).where(
        Invoice.business_id == business_id, Invoice.status == "issued",
    ).group_by(Invoice.currency_code)).all()
    payment_rows = session.execute(select(
        Payment.currency_code, func.sum(PaymentAllocation.amount),
    ).join(PaymentAllocation, PaymentAllocation.payment_id == Payment.id).where(
        Payment.business_id == business_id,
        PaymentAllocation.business_id == business_id,
    ).group_by(Payment.currency_code)).all()
    expense_rows = session.execute(select(
        Expense.currency_code, func.sum(Expense.amount),
    ).where(Expense.business_id == business_id).group_by(Expense.currency_code)).all()
    return {
        "issued_invoices": summarize_money_by_currency(
            (currency, Decimal(str(amount))) for currency, amount in invoice_rows
        ),
        "allocated_payments": summarize_money_by_currency(
            (currency, Decimal(str(amount))) for currency, amount in payment_rows
        ),
        "expenses": summarize_money_by_currency(
            (currency, Decimal(str(amount))) for currency, amount in expense_rows
        ),
    }
