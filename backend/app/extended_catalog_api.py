"""Extended business endpoints: customers, products, payments, expenses and invoices (3A-921 B1).

Extracted verbatim from extended_api.py; the endpoints register
on the one shared router from extended_common, and extended_api.py
imports this module in the original registration order.
"""
from decimal import Decimal
from uuid import UUID

from fastapi import Depends, HTTPException, Query, Response
from sqlalchemy import (
    func,
    or_,
    select,
)
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.extended_common import (
    ZERO,
    CustomerPatch,
    ProductPatch,
    _authorized,
    _commit,
    _dict,
    router,
)
from app.models import (
    AuditEvent,
    Customer,
    Employee,
    Expense,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    Product,
    StockMovement,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    MembershipRole,
    apply_expense_visibility,
)
from app.services import WorkflowError
from app.transport_settings import transport_enabled


@router.get("/customers")
def list_customers(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                   offset: int = Query(default=0, ge=0), q: str = Query(default="", max_length=120),
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        statement = select(Customer).where(
            Customer.business_id == business_id, Customer.is_active.is_(True)
        )
        if q.strip():
            term = f"%{q.strip()}%"
            statement = statement.where(or_(
                Customer.name.ilike(term),
                Customer.email.ilike(term),
                Customer.phone.ilike(term),
            ))
        items = session.scalars(statement.order_by(Customer.name).offset(offset).limit(limit)).all()
        return [_dict(x, ("id", "name", "email", "phone", "address", "notes", "created_at")) for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/customers/{customer_id}")
def get_customer(business_id: UUID, customer_id: UUID,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        item = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        )).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        return _dict(item, ("id", "name", "email", "phone", "address", "notes", "created_at"))
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.patch("/customers/{customer_id}")
def patch_customer(business_id: UUID, customer_id: UUID, body: CustomerPatch,
                   session: Session = Depends(get_session),
                   principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id)
        item = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        changes = body.model_dump(exclude_unset=True)
        if not changes:
            raise WorkflowError("At least one customer field must be provided")
        for key, value in changes.items():
            if key == "name":
                value = value.strip() if value else ""
                if not value:
                    raise WorkflowError("Customer name is required")
            elif isinstance(value, str):
                value = value.strip() or None
            setattr(item, key, value)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="customer.updated", target_type="customer", target_id=str(item.id)))
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "name", "email", "phone", "address", "notes", "created_at"))


@router.delete("/customers/{customer_id}", status_code=204)
def deactivate_customer(business_id: UUID, customer_id: UUID,
                        session: Session = Depends(get_session),
                        principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        item = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Customer not found")
        item.is_active = False
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="customer.deactivated", target_type="customer", target_id=str(item.id)))
        session.flush()
    _commit(session, op)
    return Response(status_code=204)


@router.get("/products")
def list_products(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Product).where(
            Product.business_id == business_id, Product.is_active.is_(True)
        ).order_by(Product.name).offset(offset).limit(limit)).all()
        result = []
        for item in items:
            stock = session.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
                StockMovement.business_id == business_id, StockMovement.product_id == item.id))
            row = _dict(item, ("id", "name", "sku", "description", "unit",
                               "second_unit_name", "conversion_factor", "unit_price",
                               "is_stock_tracked", "created_at"))
            row["stock_quantity"] = str(stock or ZERO) if item.is_stock_tracked else None
            result.append(row)
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/products/{product_id}")
def get_product(business_id: UUID, product_id: UUID,
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        )).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        stock = session.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.business_id == business_id, StockMovement.product_id == item.id
        ))
        row = _dict(item, ("id", "name", "sku", "description", "unit",
                           "second_unit_name", "conversion_factor", "unit_price",
                           "is_stock_tracked", "created_at"))
        row["stock_quantity"] = str(stock or ZERO) if item.is_stock_tracked else None
        return row
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.patch("/products/{product_id}")
def patch_product(business_id: UUID, product_id: UUID, body: ProductPatch,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        changes = body.model_dump(exclude_unset=True)
        if not changes:
            raise WorkflowError("At least one product field must be provided")
        # Price and stock-tracking changes affect financial/inventory controls.
        # 3A-920 step 3: the second unit is a pricing change too
        # (unit_price x factor), so it is owner-only as well.
        sensitive_fields = {"unit_price", "is_stock_tracked",
                            "second_unit_name", "conversion_factor"}
        _authorized(session, principal, business_id,
                    owner_only=bool(sensitive_fields.intersection(changes)))
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        # 3A-920 step 3: validate the MERGED pair — a PATCH may set only
        # one side when the other is already stored. The gate blocks a
        # NEW second unit while transport is off; keeping, renaming or
        # clearing a stored one stays allowed.
        merged_unit = changes.get("second_unit_name", item.second_unit_name)
        if isinstance(merged_unit, str):
            merged_unit = merged_unit.strip() or None
        merged_factor = changes.get("conversion_factor", item.conversion_factor)
        if (merged_unit is None) != (merged_factor is None):
            raise WorkflowError("Second unit name and conversion factor must be set together")
        if merged_factor is not None and merged_factor <= ZERO:
            raise WorkflowError("Conversion factor must be positive")
        if (merged_unit is not None and item.second_unit_name is None
                and not transport_enabled(session, business_id=business_id)):
            raise WorkflowError("Transport is disabled for this business.")
        if changes.get("is_stock_tracked") is False and item.is_stock_tracked:
            movement_count = session.scalar(select(func.count()).select_from(StockMovement).where(
                StockMovement.business_id == business_id, StockMovement.product_id == item.id
            ))
            if movement_count:
                raise WorkflowError("Stock tracking cannot be disabled after stock movements exist")
        for key, value in changes.items():
            if value is None and key in {"name", "unit", "unit_price", "is_stock_tracked"}:
                raise WorkflowError(f"{key} cannot be null")
            if isinstance(value, str):
                value = value.strip() or None
            if key == "name" and not value:
                raise WorkflowError("Product name is required")
            if key == "unit" and not value:
                raise WorkflowError("Product unit is required")
            setattr(item, key, value)
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="product.updated", target_type="product", target_id=str(item.id)))
        session.flush()
        return item
    item = _commit(session, op)
    return _dict(item, ("id", "name", "sku", "description", "unit",
                        "second_unit_name", "conversion_factor", "unit_price",
                        "is_stock_tracked", "is_active", "created_at"))


@router.delete("/products/{product_id}", status_code=204)
def deactivate_product(business_id: UUID, product_id: UUID,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    def op():
        _authorized(session, principal, business_id, owner_only=True)
        item = session.scalars(select(Product).where(
            Product.id == product_id, Product.business_id == business_id,
            Product.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Product not found")
        item.is_active = False
        session.add(AuditEvent(business_id=business_id, actor_subject=principal.subject,
            action="product.deactivated", target_type="product", target_id=str(item.id)))
        session.flush()
    _commit(session, op)
    return Response(status_code=204)


@router.get("/payments")
def list_payments(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Payment).where(
            Payment.business_id == business_id
        ).order_by(Payment.received_at.desc()).offset(offset).limit(limit)).all()
        result = []
        for item in items:
            allocations = session.scalars(select(PaymentAllocation).where(
                PaymentAllocation.business_id == business_id,
                PaymentAllocation.payment_id == item.id,
            )).all()
            result.append({
                **_dict(item, ("id", "customer_id", "amount", "currency_code", "received_at",
                               "method", "reference", "idempotency_key")),
                "allocations": [_dict(x, ("invoice_id", "amount")) for x in allocations],
            })
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/expenses")
def list_expenses(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        membership = _authorized(session, principal, business_id)
        expense_statement = select(Expense).where(Expense.business_id == business_id)
        expense_statement = apply_expense_visibility(
            expense_statement, business_id=business_id, role=membership.role
        )
        items = session.scalars(
            expense_statement.order_by(Expense.incurred_at.desc(), Expense.id.desc())
            .offset(offset).limit(limit)
        ).all()
        return [_dict(x, ("id", "category", "description", "amount", "currency_code",
                          "incurred_at", "vendor_name", "reference", "created_at")) for x in items]
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/invoices/{invoice_id}")
def get_invoice(business_id: UUID, invoice_id: UUID,
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        membership = _authorized(session, principal, business_id)
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == invoice_id, Invoice.business_id == business_id,
        )).one_or_none()
        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")
        lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id, InvoiceLine.business_id == business_id
        )).all()
        result = {
            **_dict(invoice, ("id", "invoice_number", "customer_id", "status", "currency_code",
                              "subtotal", "discount_total", "tax_total", "total", "issue_date",
                              "due_date", "notes", "created_at")),
            # 3A-920 step 4: the transport block's operational fields
            # are visible to any member who can see the invoice; the
            # wage snapshot + entitlement amount below are payroll data
            # and stay owner-only (the payroll permissions rule).
            **_dict(invoice, ("driver_employee_id", "transport_trips", "transport_from",
                              "transport_to", "transport_entitlement_status")),
            "lines": [_dict(line, ("id", "product_id", "description", "quantity",
                                   "sold_unit", "conversion_factor",
                                   "unit_price", "line_total")) for line in lines],
        }
        if invoice.driver_employee_id is not None:
            result["driver_name"] = session.scalar(select(Employee.name).where(
                Employee.id == invoice.driver_employee_id,
                Employee.business_id == business_id,
            ))
        if membership.role == MembershipRole.OWNER:
            wage = invoice.transport_trip_wage
            result["transport_trip_wage"] = str(wage) if wage is not None else None
            result["transport_entitlement_amount"] = (
                str(wage * invoice.transport_trips)
                if wage is not None and invoice.transport_trips else None
            )
            result["transport_entitlement_payroll_id"] = (
                str(invoice.transport_entitlement_payroll_id)
                if invoice.transport_entitlement_payroll_id else None
            )
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/invoices")
def list_invoices(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                  offset: int = Query(default=0, ge=0),
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    try:
        _authorized(session, principal, business_id)
        items = session.scalars(select(Invoice).where(
            Invoice.business_id == business_id
        ).order_by(Invoice.created_at.desc()).offset(offset).limit(limit)).all()
        allocation_rows = session.execute(
            select(PaymentAllocation.invoice_id, func.coalesce(func.sum(PaymentAllocation.amount), 0))
            .where(PaymentAllocation.business_id == business_id)
            .group_by(PaymentAllocation.invoice_id)
        ).all()
        allocated_by_invoice = {
            invoice_id: Decimal(str(amount or ZERO))
            for invoice_id, amount in allocation_rows
        }
        result = []
        for invoice in items:
            row = _dict(invoice, ("id", "invoice_number", "customer_id", "status", "currency_code",
                                  "subtotal", "discount_total", "tax_total", "total", "issue_date", "created_at"))
            allocated = allocated_by_invoice.get(invoice.id, ZERO)
            outstanding = max(ZERO, Decimal(str(invoice.total)) - allocated) if invoice.status == "issued" else ZERO
            row["allocated_payments"] = str(allocated)
            row["outstanding_amount"] = str(outstanding)
            result.append(row)
        return result
    except AuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


