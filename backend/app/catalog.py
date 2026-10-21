"""Business-scoped catalog queries and safe deactivation workflows.

These service functions are not HTTP endpoints. Callers must pass a principal
created by a trusted token verifier and manage the surrounding transaction.
"""
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Customer, Product, Supplier
from app.security import AuthenticatedPrincipal, authorize_membership
from app.services import WorkflowError, _audit


def _validate_page(*, limit: int, offset: int, search: str | None) -> str:
    if not 1 <= limit <= 100:
        raise WorkflowError("Page limit must be between 1 and 100")
    if offset < 0:
        raise WorkflowError("Page offset cannot be negative")
    term = (search or "").strip()
    if len(term) > 100:
        raise WorkflowError("Search text cannot exceed 100 characters")
    return term


def list_customers(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    search: str | None = None, active_only: bool = True,
    limit: int = 50, offset: int = 0,
) -> list[Customer]:
    """List customers only inside the authorized business, with bounded pagination."""
    authorize_membership(session, principal=principal, business_id=business_id)
    term = _validate_page(limit=limit, offset=offset, search=search)
    statement = select(Customer).where(Customer.business_id == business_id)
    if active_only:
        statement = statement.where(Customer.is_active.is_(True))
    if term:
        pattern = f"%{term}%"
        statement = statement.where(or_(
            Customer.name.ilike(pattern),
            Customer.email.ilike(pattern),
            Customer.phone.ilike(pattern),
        ))
    return session.scalars(
        statement.order_by(Customer.name, Customer.id).offset(offset).limit(limit)
    ).all()


def list_products(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    search: str | None = None, active_only: bool = True,
    limit: int = 50, offset: int = 0,
) -> list[Product]:
    """List catalog items without trusting client-provided business filters."""
    authorize_membership(session, principal=principal, business_id=business_id)
    term = _validate_page(limit=limit, offset=offset, search=search)
    statement = select(Product).where(Product.business_id == business_id)
    if active_only:
        statement = statement.where(Product.is_active.is_(True))
    if term:
        pattern = f"%{term}%"
        statement = statement.where(or_(
            Product.name.ilike(pattern),
            Product.sku.ilike(pattern),
            Product.description.ilike(pattern),
        ))
    return session.scalars(
        statement.order_by(Product.name, Product.id).offset(offset).limit(limit)
    ).all()


def list_suppliers(
    session: Session, *, principal: AuthenticatedPrincipal, business_id: UUID,
    search: str | None = None, active_only: bool = True,
    limit: int = 50, offset: int = 0,
) -> list[Supplier]:
    """List suppliers with business scope, optional search, and bounded pagination."""
    authorize_membership(session, principal=principal, business_id=business_id)
    term = _validate_page(limit=limit, offset=offset, search=search)
    statement = select(Supplier).where(Supplier.business_id == business_id)
    if active_only:
        statement = statement.where(Supplier.is_active.is_(True))
    if term:
        pattern = f"%{term}%"
        statement = statement.where(or_(
            Supplier.name.ilike(pattern),
            Supplier.email.ilike(pattern),
            Supplier.phone.ilike(pattern),
        ))
    return session.scalars(
        statement.order_by(Supplier.name, Supplier.id).offset(offset).limit(limit)
    ).all()


def deactivate_customer(
    session: Session, *, principal: AuthenticatedPrincipal,
    business_id: UUID, customer_id: UUID,
) -> Customer:
    """Deactivate a customer within this business; repeat calls are harmless."""
    authorize_membership(session, principal=principal, business_id=business_id)
    customer = session.scalars(select(Customer).where(
        Customer.id == customer_id, Customer.business_id == business_id,
    ).with_for_update()).one_or_none()
    if customer is None:
        raise WorkflowError("Customer not found in this business")
    if customer.is_active:
        customer.is_active = False
        _audit(session, business_id=business_id, principal=principal,
               action="customer.deactivated", target_type="customer", target_id=customer.id)
        session.flush()
    return customer


def deactivate_product(
    session: Session, *, principal: AuthenticatedPrincipal,
    business_id: UUID, product_id: UUID,
) -> Product:
    """Deactivate a catalog item without deleting its historical invoice/stock links."""
    authorize_membership(session, principal=principal, business_id=business_id)
    product = session.scalars(select(Product).where(
        Product.id == product_id, Product.business_id == business_id,
    ).with_for_update()).one_or_none()
    if product is None:
        raise WorkflowError("Product not found in this business")
    if product.is_active:
        product.is_active = False
        _audit(session, business_id=business_id, principal=principal,
               action="product.deactivated", target_type="product", target_id=product.id)
        session.flush()
    return product


def deactivate_supplier(
    session: Session, *, principal: AuthenticatedPrincipal,
    business_id: UUID, supplier_id: UUID,
) -> Supplier:
    """Deactivate a supplier without removing purchasing history."""
    authorize_membership(session, principal=principal, business_id=business_id)
    supplier = session.scalars(select(Supplier).where(
        Supplier.id == supplier_id, Supplier.business_id == business_id,
    ).with_for_update()).one_or_none()
    if supplier is None:
        raise WorkflowError("Supplier not found in this business")
    if supplier.is_active:
        supplier.is_active = False
        _audit(session, business_id=business_id, principal=principal,
               action="supplier.deactivated", target_type="supplier", target_id=supplier.id)
        session.flush()
    return supplier
