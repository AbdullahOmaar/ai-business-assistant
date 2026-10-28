"""Transactional business workflows.

All functions require a verified principal and an active business membership.
They flush but never commit: callers must wrap each workflow in one DB transaction.
Do not build AuthenticatedPrincipal from request data; use a trusted token verifier.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain_rules import (
    calculate_invoice_totals,
    money,
    validate_payment_allocation,
)
from app.models import (
    AuditEvent,
    Business,
    BusinessMembership,
    Customer,
    Expense,
    Invoice,
    InvoiceLine,
    MembershipRole,
    Payment,
    PaymentAllocation,
    Product,
    SalesReturn,
    StockMovement,
    Supplier,
)
from app.security import AuthenticatedPrincipal, authorize_membership

ZERO = Decimal("0")


class WorkflowError(ValueError):
    """A business workflow cannot be completed in its current state."""


def _membership(
    session: Session, principal: AuthenticatedPrincipal, business_id: UUID,
    *, owner_only: bool = False,
) -> BusinessMembership:
    return authorize_membership(
        session,
        principal=principal,
        business_id=business_id,
        allowed_roles={MembershipRole.OWNER} if owner_only else None,
    )


def _audit(
    session: Session, *, business_id: UUID, principal: AuthenticatedPrincipal,
    action: str, target_type: str, target_id: UUID | str, summary: str | None = None,
) -> None:
    session.add(AuditEvent(
        business_id=business_id,
        actor_subject=principal.subject,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        change_summary=summary,
    ))


def create_customer(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    name: str, email: str | None = None, phone: str | None = None,
    address: str | None = None, notes: str | None = None,
) -> Customer:
    _membership(session, principal, business_id)
    clean_name = name.strip()
    if not clean_name:
        raise WorkflowError("Customer name is required")
    customer = Customer(
        business_id=business_id, name=clean_name, email=email, phone=phone,
        address=address, notes=notes,
    )
    session.add(customer)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="customer.created", target_type="customer", target_id=customer.id)
    return customer


def create_supplier(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    name: str, email: str | None = None, phone: str | None = None,
    address: str | None = None,
) -> Supplier:
    _membership(session, principal, business_id)
    clean_name = name.strip()
    if not clean_name:
        raise WorkflowError("Supplier name is required")
    supplier = Supplier(
        business_id=business_id, name=clean_name, email=email, phone=phone,
        address=address,
    )
    session.add(supplier)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="supplier.created", target_type="supplier", target_id=supplier.id)
    return supplier


def create_product(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    name: str, unit_price: Decimal, sku: str | None = None,
    description: str | None = None, unit: str = "unit",
    is_stock_tracked: bool = False, opening_quantity: Decimal = ZERO,
) -> Product:
    _membership(session, principal, business_id)
    if not name.strip() or unit_price < ZERO:
        raise WorkflowError("Product name is required and price cannot be negative")
    if opening_quantity < ZERO:
        raise WorkflowError("Opening stock quantity cannot be negative")
    if opening_quantity > ZERO and not is_stock_tracked:
        raise WorkflowError("Opening stock requires stock tracking to be enabled")
    if opening_quantity > ZERO:
        # Authorize before any product/audit/stock writes to prevent STAFF side effects.
        _membership(session, principal, business_id, owner_only=True)
    product = Product(
        business_id=business_id, name=name.strip(), unit_price=unit_price,
        sku=sku.strip() or None if sku else None, description=description,
        unit=unit.strip() or "unit", is_stock_tracked=is_stock_tracked,
    )
    session.add(product)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="product.created", target_type="product", target_id=product.id)
    if opening_quantity > ZERO:
        record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=product.id, movement_type="opening",
            quantity_delta=opening_quantity, reason="Initial stock on product creation",
            reference_type="product_opening", reference_id=product.id,
        )
    return product


def record_stock_movement(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    product_id: UUID, movement_type: str, quantity_delta: Decimal,
    reason: str | None = None, reference_type: str | None = None,
    reference_id: UUID | None = None,
) -> StockMovement:
    _membership(session, principal, business_id, owner_only=True)
    allowed = {"opening", "receipt", "sale", "return", "adjustment"}
    if movement_type not in allowed:
        raise WorkflowError("Unsupported stock movement type")
    if quantity_delta == ZERO:
        raise WorkflowError("Stock movement quantity cannot be zero")
    if movement_type in {"opening", "receipt", "return"} and quantity_delta < ZERO:
        raise WorkflowError(f"{movement_type} movements must add stock")
    if movement_type == "sale" and quantity_delta > ZERO:
        raise WorkflowError("Sale movements must remove stock")
    product = session.scalars(select(Product).where(
        Product.id == product_id, Product.business_id == business_id,
        Product.is_active.is_(True), Product.is_stock_tracked.is_(True),
    ).with_for_update()).one_or_none()
    if product is None:
        raise WorkflowError("Active stock-tracked product not found in this business")
    current = session.scalar(select(func.coalesce(func.sum(StockMovement.quantity_delta), 0))
        .where(StockMovement.business_id == business_id,
               StockMovement.product_id == product_id))
    if Decimal(str(current or 0)) + quantity_delta < ZERO:
        raise WorkflowError("Stock movement would make inventory negative")
    movement = StockMovement(
        business_id=business_id, product_id=product_id, movement_type=movement_type,
        quantity_delta=quantity_delta, reason=reason, reference_type=reference_type,
        reference_id=reference_id, created_by_subject=principal.subject,
    )
    session.add(movement)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="stock.movement_recorded", target_type="stock_movement",
           target_id=movement.id, summary=f"{movement_type}: {quantity_delta}")
    return movement


def create_invoice(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    invoice_number: str, currency_code: str,
    lines: Iterable[dict], customer_id: UUID | None = None,
    discount_rate: Decimal = ZERO, tax_rate: Decimal = ZERO,
    notes: str | None = None,
) -> Invoice:
    _membership(session, principal, business_id)
    if not invoice_number.strip():
        raise WorkflowError("Invoice number is required")
    currency = currency_code.strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise WorkflowError("Currency must be a three-letter code")
    if customer_id is not None:
        customer = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        )).one_or_none()
        if customer is None:
            raise WorkflowError("Active customer not found in this business")

    requested_lines = list(lines)
    if not requested_lines:
        raise WorkflowError("At least one invoice line is required")
    prepared: list[tuple[Decimal, Decimal, str, UUID | None]] = []
    for item in requested_lines:
        quantity = Decimal(str(item["quantity"]))
        product_id = UUID(str(item["product_id"])) if item.get("product_id") else None
        if product_id:
            product = session.scalars(select(Product).where(
                Product.id == product_id, Product.business_id == business_id,
                Product.is_active.is_(True),
            )).one_or_none()
            if product is None:
                raise WorkflowError("Invoice product not found in this business")
            unit_price = product.unit_price
            description = str(item.get("description") or product.name).strip()
        else:
            if "unit_price" not in item:
                raise WorkflowError("Manual invoice lines require a unit price")
            unit_price = Decimal(str(item["unit_price"]))
            description = str(item.get("description") or "").strip()
        if not description:
            raise WorkflowError("Invoice line description is required")
        prepared.append((quantity, unit_price, description, product_id))

    totals = calculate_invoice_totals(
        [(quantity, price) for quantity, price, _, _ in prepared],
        discount_rate=discount_rate, tax_rate=tax_rate,
    )
    invoice = Invoice(
        business_id=business_id, customer_id=customer_id,
        invoice_number=invoice_number.strip(), status="draft", currency_code=currency,
        subtotal=totals.subtotal, discount_total=totals.discount_total,
        tax_total=totals.tax_total, total=totals.total, notes=notes,
    )
    session.add(invoice)
    session.flush()
    for quantity, price, description, product_id in prepared:
        session.add(InvoiceLine(
            business_id=business_id, invoice_id=invoice.id, product_id=product_id,
            description=description, quantity=quantity, unit_price=price,
            line_total=money(quantity * price),
        ))
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="invoice.created", target_type="invoice", target_id=invoice.id,
           summary=f"Draft {invoice.invoice_number}")
    return invoice


def replace_draft_invoice(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    invoice_id: UUID, invoice_number: str, currency_code: str,
    lines: Iterable[dict], customer_id: UUID | None = None,
    discount_rate: Decimal = ZERO, tax_rate: Decimal = ZERO,
    notes: str | None = None,
) -> Invoice:
    """Replace all lines/totals on a draft invoice in the caller's transaction."""
    _membership(session, principal, business_id)
    invoice = session.scalars(select(Invoice).where(
        Invoice.id == invoice_id, Invoice.business_id == business_id,
    ).with_for_update()).one_or_none()
    if invoice is None:
        raise WorkflowError("Invoice not found in this business")
    if invoice.status != "draft":
        raise WorkflowError("Only draft invoices can be edited")
    clean_number = invoice_number.strip()
    if not clean_number:
        raise WorkflowError("Invoice number is required")
    currency = currency_code.strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise WorkflowError("Currency must be a three-letter code")
    if customer_id is not None:
        customer = session.scalars(select(Customer).where(
            Customer.id == customer_id, Customer.business_id == business_id,
            Customer.is_active.is_(True),
        )).one_or_none()
        if customer is None:
            raise WorkflowError("Active customer not found in this business")

    prepared: list[tuple[Decimal, Decimal, str, UUID | None]] = []
    requested_lines = list(lines)
    if not requested_lines:
        raise WorkflowError("At least one invoice line is required")
    for item in requested_lines:
        quantity = Decimal(str(item["quantity"]))
        product_id = UUID(str(item["product_id"])) if item.get("product_id") else None
        if product_id:
            product = session.scalars(select(Product).where(
                Product.id == product_id, Product.business_id == business_id,
                Product.is_active.is_(True),
            )).one_or_none()
            if product is None:
                raise WorkflowError("Invoice product not found in this business")
            unit_price = product.unit_price
            description = str(item.get("description") or product.name).strip()
        else:
            if "unit_price" not in item:
                raise WorkflowError("Manual invoice lines require a unit price")
            unit_price = Decimal(str(item["unit_price"]))
            description = str(item.get("description") or "").strip()
        if not description:
            raise WorkflowError("Invoice line description is required")
        prepared.append((quantity, unit_price, description, product_id))

    totals = calculate_invoice_totals(
        [(quantity, price) for quantity, price, _, _ in prepared],
        discount_rate=discount_rate, tax_rate=tax_rate,
    )
    invoice.invoice_number = clean_number
    invoice.currency_code = currency
    invoice.customer_id = customer_id
    invoice.subtotal = totals.subtotal
    invoice.discount_total = totals.discount_total
    invoice.tax_total = totals.tax_total
    invoice.total = totals.total
    invoice.notes = notes
    session.execute(delete(InvoiceLine).where(
        InvoiceLine.invoice_id == invoice.id,
        InvoiceLine.business_id == business_id,
    ))
    session.flush()
    for quantity, price, description, product_id in prepared:
        session.add(InvoiceLine(
            business_id=business_id, invoice_id=invoice.id, product_id=product_id,
            description=description, quantity=quantity, unit_price=price,
            line_total=money(quantity * price),
        ))
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="invoice.draft_updated", target_type="invoice", target_id=invoice.id,
           summary=f"Draft {invoice.invoice_number} updated")
    return invoice


def void_invoice(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    invoice_id: UUID, reason: str | None = None,
) -> Invoice:
    """Void a draft or unpaid issued invoice; restore tracked stock atomically."""
    _membership(session, principal, business_id, owner_only=True)
    invoice = session.scalars(select(Invoice).where(
        Invoice.id == invoice_id, Invoice.business_id == business_id,
    ).with_for_update()).one_or_none()
    if invoice is None:
        raise WorkflowError("Invoice not found in this business")
    if invoice.status not in {"draft", "issued"}:
        raise WorkflowError("Only draft or issued invoices can be voided")
    if invoice.status == "issued":
        allocated = session.scalar(select(func.coalesce(
            func.sum(PaymentAllocation.amount), 0
        )).where(
            PaymentAllocation.business_id == business_id,
            PaymentAllocation.invoice_id == invoice.id,
        ))
        if Decimal(str(allocated or 0)) > ZERO:
            raise WorkflowError(
                "This invoice has allocated payments; record a refund or credit note before correction"
            )
        approved_returns = session.scalar(select(func.count()).select_from(SalesReturn).where(
            SalesReturn.business_id == business_id,
            SalesReturn.invoice_id == invoice.id,
            SalesReturn.status == "approved",
        ))
        if approved_returns:
            raise WorkflowError(
                "Invoice has approved sales returns; use a credit note instead of voiding"
            )
        lines = session.scalars(select(InvoiceLine).where(
            InvoiceLine.invoice_id == invoice.id,
            InvoiceLine.business_id == business_id,
        )).all()
        product_ids = sorted({line.product_id for line in lines if line.product_id}, key=str)
        products = {}
        for product_id in product_ids:
            product = session.scalars(select(Product).where(
                Product.id == product_id,
                Product.business_id == business_id,
            ).with_for_update()).one_or_none()
            if product is not None:
                products[product_id] = product
        for line in lines:
            product = products.get(line.product_id)
            if product is not None and product.is_stock_tracked:
                session.add(StockMovement(
                    business_id=business_id,
                    product_id=product.id,
                    movement_type="return",
                    quantity_delta=line.quantity,
                    reason=f"Void invoice {invoice.invoice_number}",
                    reference_type="invoice_void",
                    reference_id=invoice.id,
                    created_by_subject=principal.subject,
                ))
    invoice.status = "void"
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="invoice.voided", target_type="invoice", target_id=invoice.id,
           summary=(reason.strip()[:500] if reason and reason.strip() else None))
    return invoice


def issue_invoice(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    invoice_id: UUID,
) -> Invoice:
    """Issue a draft invoice and atomically deduct stock-tracked items.

    Stock is represented only by append-only movements. If any tracked item
    lacks stock, the workflow raises before the caller commits, so the whole
    request transaction can be rolled back without a partial invoice issue.
    """
    _membership(session, principal, business_id, owner_only=True)
    invoice = session.scalars(select(Invoice).where(
        Invoice.id == invoice_id, Invoice.business_id == business_id,
    ).with_for_update()).one_or_none()
    if invoice is None:
        raise WorkflowError("Invoice not found in this business")
    if invoice.status != "draft":
        raise WorkflowError("Only draft invoices can be issued")
    if invoice.customer_id is None:
        raise WorkflowError("Select a customer before issuing an invoice")
    customer = session.scalars(select(Customer).where(
        Customer.id == invoice.customer_id, Customer.business_id == business_id,
    )).one_or_none()
    if customer is None:
        raise WorkflowError("Invoice customer not found in this business")

    lines = session.scalars(select(InvoiceLine).where(
        InvoiceLine.invoice_id == invoice.id,
        InvoiceLine.business_id == business_id,
    )).all()
    if not lines:
        raise WorkflowError("An invoice needs at least one line before issue")

    # Lock tracked products in a stable order to reduce deadlock risk when
    # invoices contain multiple products.
    product_ids = sorted({line.product_id for line in lines if line.product_id}, key=str)
    products = {}
    for product_id in product_ids:
        product = session.scalars(select(Product).where(
            Product.id == product_id,
            Product.business_id == business_id,
            Product.is_active.is_(True),
        ).with_for_update()).one_or_none()
        if product is None:
            raise WorkflowError("Invoice product not found in this business")
        products[product_id] = product

    # Aggregate requested quantity per product before validating stock.
    # Repeated lines for the same SKU must not spend the same available balance.
    required_by_product: dict[UUID, Decimal] = {}
    for line in lines:
        product = products.get(line.product_id)
        if product is not None and product.is_stock_tracked:
            required_by_product[product.id] = (
                required_by_product.get(product.id, ZERO) + line.quantity
            )

    for product_id, required in required_by_product.items():
        product = products[product_id]
        current = session.scalar(select(func.coalesce(
            func.sum(StockMovement.quantity_delta), 0
        )).where(
            StockMovement.business_id == business_id,
            StockMovement.product_id == product_id,
        ))
        available = Decimal(str(current or 0))
        if available < required:
            raise WorkflowError(
                f"Insufficient stock for {product.name}: available {available}, required {required}"
            )

    # Do not write movements until every tracked product passed stock validation.
    for line in lines:
        product = products.get(line.product_id)
        if product is None or not product.is_stock_tracked:
            continue
        session.add(StockMovement(
            business_id=business_id,
            product_id=product.id,
            movement_type="sale",
            quantity_delta=-line.quantity,
            reason=f"Invoice {invoice.invoice_number}",
            reference_type="invoice",
            reference_id=invoice.id,
            created_by_subject=principal.subject,
        ))

    invoice.status = "issued"
    invoice.issue_date = datetime.now(timezone.utc)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="invoice.issued", target_type="invoice", target_id=invoice.id)
    return invoice


def _resolve_payment_replay(
    session: Session,
    existing: Payment,
    *,
    amount: Decimal,
    currency: str,
    customer_id: UUID,
    method: str | None,
    reference: str | None,
    requested_map: dict[UUID, Decimal],
) -> Payment:
    """Return a matching idempotent payment or reject key reuse with new details."""
    prior_allocations = session.scalars(select(PaymentAllocation).where(
        PaymentAllocation.business_id == existing.business_id,
        PaymentAllocation.payment_id == existing.id,
    )).all()
    prior_map = {item.invoice_id: item.amount for item in prior_allocations}
    if (
        existing.amount != amount
        or existing.currency_code != currency
        or existing.customer_id != customer_id
        or existing.method != method
        or existing.reference != reference
        or prior_map != requested_map
    ):
        raise WorkflowError("Idempotency key was already used for different payment details")
    return existing


def record_payment(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    amount: Decimal, currency_code: str, idempotency_key: str,
    allocations: Iterable[tuple[UUID, Decimal]],
    customer_id: UUID | None = None, method: str | None = None,
    reference: str | None = None,
) -> Payment:
    _membership(session, principal, business_id, owner_only=True)
    if amount <= ZERO or not idempotency_key.strip():
        raise WorkflowError("Payment amount and idempotency key are required")
    currency = currency_code.strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise WorkflowError("Currency must be a three-letter code")
    if customer_id is None:
        raise WorkflowError("Select a customer for every recorded payment")
    if session.scalars(select(Customer).where(
        Customer.id == customer_id, Customer.business_id == business_id,
    )).one_or_none() is None:
        raise WorkflowError("Customer not found in this business")
    requested = [(UUID(str(invoice_id)), Decimal(str(allocation_amount)))
                 for invoice_id, allocation_amount in allocations]
    requested_map = {invoice_id: allocation_amount for invoice_id, allocation_amount in requested}
    if len(requested_map) != len(requested):
        raise WorkflowError("Each invoice may appear only once in a payment allocation list")
    existing = session.scalars(select(Payment).where(
        Payment.business_id == business_id,
        Payment.idempotency_key == idempotency_key.strip(),
    ).with_for_update()).one_or_none()
    if existing is not None:
        return _resolve_payment_replay(
            session,
            existing,
            amount=amount,
            currency=currency,
            customer_id=customer_id,
            method=method,
            reference=reference,
            requested_map=requested_map,
        )

    payment = Payment(
        business_id=business_id, customer_id=customer_id, amount=amount,
        currency_code=currency, idempotency_key=idempotency_key.strip(),
        method=method, reference=reference,
    )
    # The initial lookup does not lock a missing key. Two concurrent retries can
    # therefore both attempt the insert. Savepoint isolation lets us recover from
    # the unique-key race without leaving the caller's outer transaction unusable.
    try:
        with session.begin_nested():
            session.add(payment)
            session.flush()
    except IntegrityError:
        existing = session.scalars(select(Payment).where(
            Payment.business_id == business_id,
            Payment.idempotency_key == idempotency_key.strip(),
        ).with_for_update()).one_or_none()
        if existing is None:
            # The integrity error was unrelated to an idempotency-key race.
            raise
        return _resolve_payment_replay(
            session,
            existing,
            amount=amount,
            currency=currency,
            customer_id=customer_id,
            method=method,
            reference=reference,
            requested_map=requested_map,
        )
    allocated_total = ZERO
    for invoice_id, allocation_amount in requested:
        invoice = session.scalars(select(Invoice).where(
            Invoice.id == invoice_id, Invoice.business_id == business_id,
        ).with_for_update()).one_or_none()
        if invoice is None or invoice.status != "issued":
            raise WorkflowError("Payment can only be allocated to an issued invoice in this business")
        if invoice.currency_code != currency:
            raise WorkflowError("Payment and invoice currencies must match")
        if invoice.customer_id != customer_id:
            raise WorkflowError("Payment customer must match the allocated invoice customer")
        already_allocated = session.scalar(select(func.coalesce(
            func.sum(PaymentAllocation.amount), 0
        )).where(PaymentAllocation.invoice_id == invoice.id,
                 PaymentAllocation.business_id == business_id))
        validate_payment_allocation(
            payment_amount=amount, already_allocated=allocated_total,
            requested_allocation=allocation_amount,
            invoice_outstanding=max(ZERO, invoice.total - Decimal(str(already_allocated or 0))),
        )
        allocated_total += allocation_amount
        session.add(PaymentAllocation(
            business_id=business_id, payment_id=payment.id,
            invoice_id=invoice.id, amount=allocation_amount,
        ))
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="payment.recorded", target_type="payment", target_id=payment.id,
           summary=f"{currency} {amount}")
    return payment


def create_expense(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    category: str, description: str, amount: Decimal, currency_code: str,
    incurred_at: datetime, vendor_name: str | None = None,
    reference: str | None = None,
) -> Expense:
    _membership(session, principal, business_id)
    if not category.strip() or not description.strip() or amount <= ZERO:
        raise WorkflowError("Expense category, description and positive amount are required")
    currency = currency_code.strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise WorkflowError("Currency must be a three-letter code")
    expense = Expense(
        business_id=business_id, category=category.strip(), description=description.strip(),
        amount=amount, currency_code=currency, incurred_at=incurred_at,
        vendor_name=vendor_name, reference=reference,
    )
    session.add(expense)
    session.flush()
    _audit(session, business_id=business_id, principal=principal,
           action="expense.created", target_type="expense", target_id=expense.id)
    return expense
