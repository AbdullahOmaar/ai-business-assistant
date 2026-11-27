"""Business-scoped customer orders (3A-923 C4, T45).

An order is a pre-invoice document: it never moves stock and never
posts financially. On fulfilment it converts one-to-one into a DRAFT
invoice through the ordinary invoice service, and stock moves only
when that invoice is issued. Line pricing reuses the invoice
preparation helper (3A-920 step 3) so product prices, second-unit
pricing and unit snapshots are exactly the invoice rules; the
transport block reuses the same validation (3A-920 step 4).

Roles mirror invoices (route matrix): create / read / replace /
convert are member-level; confirm and cancel are owner-only (the
commercial commitment, like issue / void). Conversion itself is
member-level because its only effect is a DRAFT invoice plus a status
flag — the money-moving gate (issue) stays owner-only, unchanged.
"""
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.domain_rules import calculate_invoice_totals
from app.models import (
    AuditEvent,
    Business,
    Customer,
    CustomerOrder,
    CustomerOrderLine,
)
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)
from app.services import (
    WorkflowError,
    _apply_transport_block,
    _prepare_invoice_lines,
    create_invoice,
)

router = APIRouter(prefix="/api/v1/businesses/{business_id}", tags=["customer orders"])
CENT = Decimal("0.01")


class OrderLineInput(BaseModel):
    description: str | None = Field(default=None, max_length=300)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    product_id: UUID | None = None
    # 3A-920 step 3: the unit the line is ordered in — the product's
    # base unit or its second unit name; absent = base unit. Product
    # lines only; the server prices from the catalogue.
    unit: str | None = Field(default=None, max_length=32)


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_number: str = Field(min_length=1, max_length=64)
    currency_code: str = Field(min_length=3, max_length=3)
    customer_id: UUID | None = None
    lines: list[OrderLineInput] = Field(min_length=1, max_length=500)
    discount_rate: Decimal = Field(default=Decimal(0), ge=0, le=100)
    tax_rate: Decimal = Field(default=Decimal(0), ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)
    # 3A-923 C4: the optional delivery block — driver + trip count +
    # from/to free text, all absent for an ordinary order. The pair
    # rule, the driver-tag check and the master switch gate live in
    # the service (_apply_transport_block).
    driver_employee_id: UUID | None = None
    transport_trips: int | None = Field(default=None, ge=1)
    transport_from: str | None = Field(default=None, max_length=200)
    transport_to: str | None = Field(default=None, max_length=200)


class OrderUpdate(OrderCreate):
    model_config = ConfigDict(extra="forbid")


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def _run(session: Session, operation):
    try:
        result = operation()
        session.commit()
        return result
    except AuthorizationError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except WorkflowError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except (ValueError, KeyError) as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The operation conflicts with existing order data.",
        ) from exc


def _member(session: Session, principal: AuthenticatedPrincipal, business_id: UUID) -> None:
    authorize_membership(session, principal=principal, business_id=business_id)


def _owner(session: Session, principal: AuthenticatedPrincipal, business_id: UUID) -> None:
    from app.models import MembershipRole

    authorize_membership(
        session, principal=principal, business_id=business_id,
        allowed_roles={MembershipRole.OWNER},
    )


def _audit(session: Session, business_id: UUID, actor: str, action: str,
           target_type: str, target_id: UUID, summary: str) -> None:
    session.add(AuditEvent(
        business_id=business_id,
        actor_subject=actor,
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        change_summary=summary,
    ))


def _order_dict(order: CustomerOrder, lines: list[CustomerOrderLine],
                *, customer_name: str | None = None, driver_name: str | None = None) -> dict:
    return {
        "id": str(order.id),
        "business_id": str(order.business_id),
        "customer_id": str(order.customer_id) if order.customer_id else None,
        "customer_name": customer_name,
        "order_number": order.order_number,
        "status": order.status,
        "currency_code": order.currency_code,
        "discount_rate": str(order.discount_rate),
        "tax_rate": str(order.tax_rate),
        "subtotal": str(order.subtotal),
        "discount_total": str(order.discount_total),
        "tax_total": str(order.tax_total),
        "total": str(order.total),
        "notes": order.notes,
        "driver_employee_id": str(order.driver_employee_id) if order.driver_employee_id else None,
        "driver_name": driver_name,
        "transport_trips": order.transport_trips,
        "transport_from": order.transport_from,
        "transport_to": order.transport_to,
        "converted_invoice_id": str(order.converted_invoice_id) if order.converted_invoice_id else None,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "lines": [
            {
                "id": str(line.id),
                "product_id": str(line.product_id) if line.product_id else None,
                "description": line.description,
                "quantity": str(line.quantity),
                "sold_unit": line.sold_unit,
                "conversion_factor": str(line.conversion_factor) if line.conversion_factor is not None else None,
                "unit_price": str(line.unit_price),
                "line_total": str(line.line_total),
            }
            for line in lines
        ],
    }


def _get_order(session: Session, business_id: UUID, order_id: UUID) -> CustomerOrder:
    order = session.scalars(select(CustomerOrder).where(
        CustomerOrder.id == order_id, CustomerOrder.business_id == business_id,
    )).one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Customer order not found")
    return order


def _load_lines(session: Session, order: CustomerOrder) -> list[CustomerOrderLine]:
    return session.scalars(select(CustomerOrderLine).where(
        CustomerOrderLine.order_id == order.id,
        CustomerOrderLine.business_id == order.business_id,
    )).all()


def _names(session: Session, order: CustomerOrder) -> tuple[str | None, str | None]:
    customer_name = None
    if order.customer_id is not None:
        customer = session.scalars(select(Customer).where(
            Customer.id == order.customer_id, Customer.business_id == order.business_id,
        )).one_or_none()
        customer_name = customer.name if customer is not None else None
    driver_name = None
    if order.driver_employee_id is not None:
        from app.models import Employee

        driver = session.scalars(select(Employee).where(
            Employee.id == order.driver_employee_id,
            Employee.business_id == order.business_id,
        )).one_or_none()
        driver_name = driver.name if driver is not None else None
    return customer_name, driver_name


def _check_customer(session: Session, business_id: UUID, customer_id: UUID | None) -> None:
    if customer_id is None:
        return
    customer = session.scalars(select(Customer).where(
        Customer.id == customer_id, Customer.business_id == business_id,
        Customer.is_active.is_(True),
    )).one_or_none()
    if customer is None:
        raise WorkflowError("Active customer not found in this business")


def _build_lines(session: Session, order: CustomerOrder,
                 prepared: list[tuple[Decimal, Decimal, str, UUID | None, str | None, Decimal | None]],
                 ) -> list[CustomerOrderLine]:
    rows = []
    for quantity, unit_price, description, product_id, sold_unit, factor in prepared:
        line = CustomerOrderLine(
            business_id=order.business_id,
            order_id=order.id,
            product_id=product_id,
            description=description,
            quantity=quantity,
            sold_unit=sold_unit,
            conversion_factor=factor,
            unit_price=_money(unit_price),
            line_total=_money(quantity * unit_price),
        )
        session.add(line)
        rows.append(line)
    return rows


def _totals_for(prepared, discount_rate: Decimal, tax_rate: Decimal):
    return calculate_invoice_totals(
        [(quantity, price) for quantity, price, _, _, _, _ in prepared],
        discount_rate=discount_rate, tax_rate=tax_rate,
    )


@router.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(business_id: UUID, body: OrderCreate,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _member(session, principal, business_id)
        business = session.scalars(select(Business).where(
            Business.id == business_id, Business.is_active.is_(True),
        )).one_or_none()
        if business is None:
            raise HTTPException(status_code=404, detail="Business not found")
        if not body.order_number.strip():
            raise WorkflowError("Order number is required")
        _check_customer(session, business_id, body.customer_id)
        prepared = _prepare_invoice_lines(
            session, business_id=business_id,
            lines=[line.model_dump(exclude_none=True) for line in body.lines],
        )
        totals = _totals_for(prepared, body.discount_rate, body.tax_rate)
        order = CustomerOrder(
            business_id=business_id,
            customer_id=body.customer_id,
            order_number=body.order_number.strip(),
            status="draft",
            currency_code=body.currency_code.strip().upper(),
            discount_rate=body.discount_rate,
            tax_rate=body.tax_rate,
            subtotal=totals.subtotal,
            discount_total=totals.discount_total,
            tax_total=totals.tax_total,
            total=totals.total,
            notes=body.notes.strip() if body.notes and body.notes.strip() else None,
        )
        session.add(order)
        session.flush()
        _apply_transport_block(
            session, business_id=business_id, invoice=order,
            driver_employee_id=body.driver_employee_id,
            transport_trips=body.transport_trips,
            transport_from=body.transport_from,
            transport_to=body.transport_to,
        )
        rows = _build_lines(session, order, prepared)
        _audit(session, business_id, principal.subject, "order.created",
               "customer_order", order.id, f"Order {order.order_number} created.")
        customer_name, driver_name = _names(session, order)
        return _order_dict(order, rows, customer_name=customer_name, driver_name=driver_name)

    return _run(session, operation)


@router.get("/orders")
def list_orders(business_id: UUID, limit: int = Query(default=50, ge=1, le=200),
                offset: int = Query(default=0, ge=0),
                session: Session = Depends(get_session),
                principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _member(session, principal, business_id)
        orders = session.scalars(select(CustomerOrder).where(
            CustomerOrder.business_id == business_id,
        ).order_by(CustomerOrder.created_at.desc()).offset(offset).limit(limit)).all()
        result = []
        for order in orders:
            customer_name, driver_name = _names(session, order)
            result.append(_order_dict(order, _load_lines(session, order),
                                      customer_name=customer_name, driver_name=driver_name))
        return result

    return _run(session, operation)


@router.get("/orders/{customer_order_id}")
def get_order(business_id: UUID, customer_order_id: UUID,
              session: Session = Depends(get_session),
              principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _member(session, principal, business_id)
        order = _get_order(session, business_id, customer_order_id)
        customer_name, driver_name = _names(session, order)
        return _order_dict(order, _load_lines(session, order),
                           customer_name=customer_name, driver_name=driver_name)

    return _run(session, operation)


@router.patch("/orders/{customer_order_id}")
def replace_order(business_id: UUID, customer_order_id: UUID, body: OrderUpdate,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _member(session, principal, business_id)
        order = _get_order(session, business_id, customer_order_id)
        if order.status != "draft":
            raise HTTPException(
                status_code=409, detail="Only a draft order can be changed.",
            )
        if not body.order_number.strip():
            raise WorkflowError("Order number is required")
        _check_customer(session, business_id, body.customer_id)
        prepared = _prepare_invoice_lines(
            session, business_id=business_id,
            lines=[line.model_dump(exclude_none=True) for line in body.lines],
        )
        totals = _totals_for(prepared, body.discount_rate, body.tax_rate)
        for old in _load_lines(session, order):
            session.delete(old)
        session.flush()
        order.customer_id = body.customer_id
        order.order_number = body.order_number.strip()
        order.currency_code = body.currency_code.strip().upper()
        order.discount_rate = body.discount_rate
        order.tax_rate = body.tax_rate
        order.subtotal = totals.subtotal
        order.discount_total = totals.discount_total
        order.tax_total = totals.tax_total
        order.total = totals.total
        order.notes = body.notes.strip() if body.notes and body.notes.strip() else None
        _apply_transport_block(
            session, business_id=business_id, invoice=order,
            driver_employee_id=body.driver_employee_id,
            transport_trips=body.transport_trips,
            transport_from=body.transport_from,
            transport_to=body.transport_to,
        )
        rows = _build_lines(session, order, prepared)
        _audit(session, business_id, principal.subject, "order.updated",
               "customer_order", order.id, f"Order {order.order_number} updated.")
        customer_name, driver_name = _names(session, order)
        return _order_dict(order, rows, customer_name=customer_name, driver_name=driver_name)

    return _run(session, operation)


@router.post("/orders/{customer_order_id}/confirm")
def confirm_order(business_id: UUID, customer_order_id: UUID,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _owner(session, principal, business_id)
        order = _get_order(session, business_id, customer_order_id)
        if order.status != "draft":
            raise HTTPException(
                status_code=409, detail="Only a draft order can be confirmed.",
            )
        order.status = "confirmed"
        _audit(session, business_id, principal.subject, "order.confirmed",
               "customer_order", order.id, f"Order {order.order_number} confirmed.")
        customer_name, driver_name = _names(session, order)
        return _order_dict(order, _load_lines(session, order),
                           customer_name=customer_name, driver_name=driver_name)

    return _run(session, operation)


@router.post("/orders/{customer_order_id}/cancel")
def cancel_order(business_id: UUID, customer_order_id: UUID,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _owner(session, principal, business_id)
        order = _get_order(session, business_id, customer_order_id)
        if order.status not in ("draft", "confirmed"):
            raise HTTPException(
                status_code=409, detail="Only a draft or confirmed order can be cancelled.",
            )
        order.status = "cancelled"
        _audit(session, business_id, principal.subject, "order.cancelled",
               "customer_order", order.id, f"Order {order.order_number} cancelled.")
        customer_name, driver_name = _names(session, order)
        return _order_dict(order, _load_lines(session, order),
                           customer_name=customer_name, driver_name=driver_name)

    return _run(session, operation)


@router.post("/orders/{customer_order_id}/convert")
def convert_order(business_id: UUID, customer_order_id: UUID,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    def operation():
        _member(session, principal, business_id)
        order = _get_order(session, business_id, customer_order_id)
        if order.status not in ("draft", "confirmed"):
            raise HTTPException(
                status_code=409, detail="Only a draft or confirmed order can be converted.",
            )
        rows = _load_lines(session, order)
        # Conversion re-prices product lines from the CURRENT catalogue
        # (a conversion is a fresh invoice); manual lines keep their
        # snapshotted price. The order's own totals stay as quoted.
        invoice_lines = [
            {
                "product_id": str(line.product_id) if line.product_id else None,
                "description": line.description,
                "quantity": str(line.quantity),
                "unit": line.sold_unit,
                "unit_price": str(line.unit_price),
            }
            for line in rows
        ]
        invoice_number = ("INV-" + order.order_number.strip())[:64]
        invoice = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number=invoice_number,
            currency_code=order.currency_code,
            lines=invoice_lines,
            customer_id=order.customer_id,
            discount_rate=order.discount_rate,
            tax_rate=order.tax_rate,
            notes=order.notes,
            driver_employee_id=order.driver_employee_id,
            transport_trips=order.transport_trips,
            transport_from=order.transport_from,
            transport_to=order.transport_to,
        )
        order.status = "fulfilled"
        order.converted_invoice_id = invoice.id
        _audit(session, business_id, principal.subject, "order.converted",
               "customer_order", order.id,
               f"Order {order.order_number} converted to invoice {invoice.invoice_number}.")
        customer_name, driver_name = _names(session, order)
        result = _order_dict(order, rows, customer_name=customer_name, driver_name=driver_name)
        result["invoice_id"] = str(invoice.id)
        result["invoice_number"] = invoice.invoice_number
        return result

    return _run(session, operation)
