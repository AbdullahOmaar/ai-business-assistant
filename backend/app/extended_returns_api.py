"""Extended business endpoints: sales returns and credit notes (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
from decimal import Decimal
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from sqlalchemy import (
    func,
    select,
)
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.domain_rules import discounted_return_line_total, money, validate_return_amount
from app.extended_common import (
    ZERO,
    ReturnInput,
    _authorized,
    _commit,
    _dict,
    router,
)
from app.models import (
    AuditEvent,
    CreditNote,
    Invoice,
    InvoiceLine,
    Product,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
)
from app.services import WorkflowError


@router.get("/sales-returns")
def list_sales_returns(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, pattern="^(draft|approved|rejected)$"),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List business-scoped returns; reads never issue a credit note or refund cash."""
    try:
        _authorized(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    statement = select(SalesReturn).where(SalesReturn.business_id == business_id)
    if status is not None:
        statement = statement.where(SalesReturn.status == status)
    returns = session.scalars(
        statement.order_by(SalesReturn.created_at.desc(), SalesReturn.id.desc())
        .limit(limit).offset(offset)
    ).all()
    invoice_currency_by_id = {}
    if returns:
        source_invoices = session.scalars(select(Invoice).where(
            Invoice.id.in_([item.invoice_id for item in returns]),
            Invoice.business_id == business_id,
        )).all()
        invoice_currency_by_id = {
            str(invoice.id): invoice.currency_code for invoice in source_invoices
        }
    return {
        "items": [
            {
                **_dict(item, (
                    "id", "business_id", "invoice_id", "status", "reason", "total", "created_at",
                )),
                "currency_code": invoice_currency_by_id.get(str(item.invoice_id)),
            }
            for item in returns
        ],
        "limit": limit,
        "offset": offset,
    }


@router.post("/sales-returns", status_code=201)
def post_sales_return(business_id: UUID, body: ReturnInput,
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == body.invoice_id, Invoice.business_id == business_id,
            Invoice.status == "issued",
        )).one_or_none()
        if invoice is None:
            raise WorkflowError("Issued invoice not found in this business")
        ret = SalesReturn(business_id=business_id, invoice_id=invoice.id,
                          status="draft", reason=(body.reason.strip() if body.reason else body.reason), total=ZERO)
        session.add(ret)
        session.flush()
        discount_allocation_lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        ).order_by(InvoiceLine.id)).all()
        total = ZERO
        for item in body.lines:
            line = session.scalars(select(InvoiceLine).where(
                InvoiceLine.id == item.invoice_line_id, InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.business_id == business_id,
            )).one_or_none()
            if line is None:
                raise WorkflowError("Return line must reference a line on the original invoice")
            previously_returned = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.quantity), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == line.id, SalesReturn.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            if Decimal(str(previously_returned or 0)) + item.quantity > line.quantity:
                raise WorkflowError("Return quantity exceeds the invoiced quantity remaining")
            discounted_line_total = discounted_return_line_total(
                invoice_subtotal=invoice.subtotal,
                invoice_discount_total=invoice.discount_total,
                invoice_lines=[(str(row.id), row.line_total) for row in discount_allocation_lines],
                target_line_id=str(line.id),
            )
            amount = money(discounted_line_total * item.quantity / line.quantity)
            total += amount
            session.add(SalesReturnLine(business_id=business_id, sales_return_id=ret.id,
                invoice_line_id=line.id, quantity=item.quantity, amount=amount))
        ret.total = total
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="sales_return.created", target_type="sales_return", target_id=str(ret.id)))
        session.flush()
        return ret
    ret = _commit(session, op)
    currency_code = session.scalar(select(Invoice.currency_code).where(
        Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
    ))
    return {
        **_dict(ret, ("id", "business_id", "invoice_id", "status", "reason", "total", "created_at")),
        "currency_code": currency_code,
    }


@router.post("/sales-returns/{return_id}/approve")
def approve_sales_return(business_id: UUID, return_id: UUID,
                         session: Session = Depends(get_session),
                         principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        ret = session.scalars(select(SalesReturn).where(
            SalesReturn.id == return_id, SalesReturn.business_id == business_id,
        ).with_for_update()).one_or_none()
        if ret is None or ret.status != "draft":
            raise WorkflowError("Only draft returns can be approved")
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Sales return must reference an issued invoice")
        if not (ret.reason or "").strip():
            raise WorkflowError("A return reason is required before approval")
        lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id, SalesReturnLine.business_id == business_id,
        ).order_by(SalesReturnLine.id)).all()

        # Group duplicate line entries and lock the invoice header first. Concurrent
        # approvals for the same invoice then serialize before checking approved returns.
        requested_by_line: dict[UUID, dict[str, Decimal]] = {}
        for returned in lines:
            requested = requested_by_line.setdefault(
                returned.invoice_line_id, {"quantity": ZERO}
            )
            requested["quantity"] += returned.quantity

        discount_allocation_lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        ).order_by(InvoiceLine.id)).all()
        invoice_lines = {}
        for invoice_line_id, requested in sorted(
            requested_by_line.items(), key=lambda item: str(item[0])
        ):
            invoice_line = session.scalars(select(InvoiceLine).where(
                InvoiceLine.id == invoice_line_id,
                InvoiceLine.invoice_id == invoice.id,
                InvoiceLine.business_id == business_id,
            ).with_for_update()).one_or_none()
            if invoice_line is None:
                raise WorkflowError("Return line must reference a line on the original invoice")
            previously_returned_quantity = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.quantity), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == invoice_line.id,
                SalesReturnLine.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            if Decimal(str(previously_returned_quantity or 0)) + requested["quantity"] > invoice_line.quantity:
                raise WorkflowError("Return quantity exceeds the invoiced quantity remaining")
            previously_returned_amount = session.scalar(select(func.coalesce(
                func.sum(SalesReturnLine.amount), 0
            )).join(SalesReturn, SalesReturn.id == SalesReturnLine.sales_return_id).where(
                SalesReturnLine.invoice_line_id == invoice_line.id,
                SalesReturnLine.business_id == business_id,
                SalesReturn.status == "approved",
            ))
            invoiced_amount = discounted_return_line_total(
                invoice_subtotal=invoice.subtotal,
                invoice_discount_total=invoice.discount_total,
                invoice_lines=[(str(row.id), row.line_total) for row in discount_allocation_lines],
                target_line_id=str(invoice_line.id),
            )
            previous_quantity = Decimal(str(previously_returned_quantity or 0))
            previous_amount = Decimal(str(previously_returned_amount or 0))
            cumulative_amount = money(
                invoiced_amount * (previous_quantity + requested["quantity"]) / invoice_line.quantity
            )
            allocated_amount = cumulative_amount - previous_amount
            try:
                validate_return_amount(
                    invoiced_amount=invoiced_amount,
                    previously_returned_amount=previous_amount,
                    requested_return_amount=allocated_amount,
                )
            except ValueError as exc:
                raise WorkflowError(str(exc)) from exc

            # Allocate rounded cents against cumulative approved quantity, not each
            # return independently. The final approved return reconciles exactly
            # to the discounted source-line amount even for sub-cent unit shares.
            running_quantity = previous_quantity
            running_amount = previous_amount
            for returned_line in (
                row for row in lines if row.invoice_line_id == invoice_line_id
            ):
                running_quantity += returned_line.quantity
                next_cumulative_amount = money(
                    invoiced_amount * running_quantity / invoice_line.quantity
                )
                returned_line.amount = next_cumulative_amount - running_amount
                running_amount = next_cumulative_amount
            invoice_lines[invoice_line_id] = invoice_line

        for returned in lines:
            invoice_line = invoice_lines[returned.invoice_line_id]
            if invoice_line.product_id:
                product = session.scalars(select(Product).where(
                    Product.id == invoice_line.product_id, Product.business_id == business_id,
                    Product.is_stock_tracked.is_(True),
                ).with_for_update()).one_or_none()
                if product:
                    # 3A-920 step 3: the returned quantity is in the line's
                    # sold unit — convert it with the line's snapshotted
                    # factor so the return is in base units like the sale.
                    base_quantity = returned.quantity * (
                        invoice_line.conversion_factor or Decimal(1)
                    )
                    session.add(StockMovement(business_id=business_id, product_id=product.id,
                        movement_type="return", quantity_delta=base_quantity,
                        reason=f"Approved sales return {ret.id}", reference_type="sales_return",
                        reference_id=ret.id, created_by_subject=principal.subject))
        ret.total = sum((returned.amount for returned in lines), ZERO)
        ret.status = "approved"
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="sales_return.approved", target_type="sales_return", target_id=str(ret.id)))
        session.flush()
        return ret
    ret = _commit(session, op)
    currency_code = session.scalar(select(Invoice.currency_code).where(
        Invoice.id == ret.invoice_id, Invoice.business_id == business_id,
    ))
    return {
        **_dict(ret, ("id", "invoice_id", "status", "total", "created_at")),
        "currency_code": currency_code,
    }


@router.post("/sales-returns/{return_id}/credit-note", status_code=201)
def issue_credit_note_for_return(
    business_id: UUID,
    return_id: UUID,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Issue one immutable credit note for an approved return; no AR or cash posting."""

    def op():
        _authorized(session, principal, business_id, owner_only=True)
        ret = session.scalars(
            select(SalesReturn).where(
                SalesReturn.id == return_id,
                SalesReturn.business_id == business_id,
            ).with_for_update()
        ).one_or_none()
        if ret is None:
            raise WorkflowError("Sales return not found in this business")

        existing = session.scalars(select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.sales_return_id == ret.id,
        ).with_for_update()).one_or_none()
        if existing is not None:
            return existing
        if ret.status != "approved":
            raise WorkflowError("Only an approved sales return can be credited")
        if not (ret.reason or "").strip():
            raise WorkflowError("A return reason is required before credit note issuance")

        invoice = session.scalars(select(Invoice).where(
            Invoice.id == ret.invoice_id,
            Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Credit note must reference an issued invoice")
        if invoice.customer_id is None:
            raise WorkflowError("Credit note requires an invoice linked to a customer")
        if Decimal(str(invoice.tax_total or ZERO)) > ZERO:
            raise WorkflowError(
                "Credit note issuance for tax-bearing invoices is deferred until tax allocation is approved"
            )

        return_lines = session.scalars(select(SalesReturnLine).where(
            SalesReturnLine.sales_return_id == ret.id,
            SalesReturnLine.business_id == business_id,
        ).order_by(SalesReturnLine.id)).all()
        if not return_lines:
            raise WorkflowError("An approved return must contain at least one line")
        source_line_ids = {line.invoice_line_id for line in return_lines}
        source_count = session.scalar(select(func.count(InvoiceLine.id)).where(
            InvoiceLine.business_id == business_id,
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.id.in_(source_line_ids),
        ))
        if int(source_count or 0) != len(source_line_ids):
            raise WorkflowError("Every return line must reference the original invoice")

        total = money(sum((Decimal(str(line.amount)) for line in return_lines), ZERO))
        if total <= ZERO or money(Decimal(str(ret.total))) != total:
            raise WorkflowError("Approved return total must reconcile to its persisted return lines")

        note = CreditNote(
            business_id=business_id,
            sales_return_id=ret.id,
            invoice_id=invoice.id,
            customer_id=invoice.customer_id,
            credit_note_number=f"CN-{ret.id.hex[:24].upper()}",
            currency_code=invoice.currency_code,
            total=total,
            created_by_subject=principal.subject,
        )
        session.add(note)
        session.flush()
        session.add(AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action="credit_note.issued",
            target_type="credit_note",
            target_id=str(note.id),
            change_summary=f"Credit note issued for approved sales return {ret.id}",
        ))
        session.flush()
        return note

    try:
        note = _commit(session, op)
    except HTTPException as exc:
        if exc.status_code != 409:
            raise
        # A concurrent request may win the unique (business, return) constraint.
        session.rollback()
        existing = session.scalars(select(CreditNote).where(
            CreditNote.business_id == business_id,
            CreditNote.sales_return_id == return_id,
        )).one_or_none()
        if existing is None:
            raise
        note = existing

    return _dict(note, (
        "id", "business_id", "sales_return_id", "invoice_id", "customer_id",
        "credit_note_number", "currency_code", "total", "created_by_subject", "created_at",
    ))


@router.get("/credit-notes")
def list_credit_notes(
    business_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    customer_id: UUID | None = Query(default=None),
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """List issued Stage-1 credit-note documents; does not imply applied credit or cash refund."""
    try:
        _authorized(session, principal, business_id)
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    statement = select(CreditNote).where(CreditNote.business_id == business_id)
    if customer_id is not None:
        statement = statement.where(CreditNote.customer_id == customer_id)
    notes = session.scalars(
        statement.order_by(CreditNote.created_at.desc(), CreditNote.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return {
        "items": [_dict(note, (
            "id", "business_id", "sales_return_id", "invoice_id", "customer_id",
            "credit_note_number", "currency_code", "total", "created_by_subject", "created_at",
        )) for note in notes],
        "limit": limit,
        "offset": offset,
    }

