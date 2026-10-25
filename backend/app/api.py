"""HTTP API for core business workflows.

All write endpoints use a server-verified principal, enforce membership in the
service layer, and commit one database transaction per request.
"""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.models import Product
from app.security import AuthenticatedPrincipal, AuthorizationError, authorize_membership
from app.services import (
    WorkflowError,
    create_customer,
    create_invoice,
    create_product,
    create_supplier,
    issue_invoice,
    replace_draft_invoice,
    void_invoice,
    record_payment,
    record_stock_movement,
)

router = APIRouter(prefix="/api/v1", tags=["business"])


class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    address: str | None = Field(default=None, max_length=500)


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    sku: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    unit: str = Field(default="unit", min_length=1, max_length=32)
    is_stock_tracked: bool = False


class ProductImportRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    description: str | None = Field(default=None, max_length=1000)
    unit: str = Field(default="unit", min_length=1, max_length=32)
    is_stock_tracked: bool = False


class ProductImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rows: list[ProductImportRow] = Field(min_length=1, max_length=500)


def _product_import_errors(session: Session, business_id: UUID,
                           rows: list[ProductImportRow]) -> list[dict]:
    """Validate all product rows before any write; SKU is the retry-safe natural key."""
    errors: list[dict] = []
    first_row_by_sku: dict[str, int] = {}
    normalized_skus: list[str] = []
    for index, row in enumerate(rows):
        row_number = index + 2  # CSV header is row 1.
        sku = row.sku.strip()
        name = row.name.strip()
        normalized_skus.append(sku.casefold())
        if not sku:
            errors.append({"row": row_number, "field": "sku", "code": "required"})
        if not name:
            errors.append({"row": row_number, "field": "name", "code": "required"})
        key = sku.casefold()
        if key in first_row_by_sku:
            errors.append({"row": row_number, "field": "sku", "code": "duplicate_in_file",
                           "first_row": first_row_by_sku[key]})
        else:
            first_row_by_sku[key] = row_number

    if normalized_skus:
        existing = set(session.scalars(
            select(func.lower(Product.sku)).where(
                Product.business_id == business_id,
                Product.sku.is_not(None),
                func.lower(Product.sku).in_(normalized_skus),
            )
        ).all())
        for index, sku in enumerate(normalized_skus):
            if sku and sku in existing:
                errors.append({"row": index + 2, "field": "sku", "code": "already_exists"})
    return errors


class InvoiceLineInput(BaseModel):
    description: str | None = Field(default=None, max_length=500)
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    product_id: UUID | None = None


class InvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=80)
    currency_code: str = Field(min_length=3, max_length=3)
    customer_id: UUID | None = None
    lines: list[InvoiceLineInput] = Field(min_length=1, max_length=500)
    discount_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    notes: str | None = Field(default=None, max_length=2000)


class IssueInvoiceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class InvoiceDraftUpdate(InvoiceCreate):
    model_config = ConfigDict(extra="forbid")


class VoidInvoiceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str | None = Field(default=None, max_length=500)


class StockMovementInput(BaseModel):
    product_id: UUID
    movement_type: str = Field(pattern="^(opening|receipt|sale|return|adjustment)$")
    quantity_delta: Decimal = Field(ne=0, max_digits=14, decimal_places=3)
    reason: str | None = Field(default=None, max_length=500)


class PaymentAllocationInput(BaseModel):
    invoice_id: UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class PaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency_code: str = Field(min_length=3, max_length=3)
    idempotency_key: str = Field(min_length=1, max_length=128)
    customer_id: UUID
    allocations: list[PaymentAllocationInput] = Field(default_factory=list, max_length=500)
    method: str | None = Field(default=None, max_length=32)
    reference: str | None = Field(default=None, max_length=128)


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
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except (ValueError, KeyError) as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="The operation conflicts with existing business data.") from exc
    except Exception:
        session.rollback()
        raise


def _record(obj) -> dict:
    """Serialize a domain object without leaking ORM internals."""
    fields = ("id", "business_id", "name", "email", "phone", "address", "notes",
              "sku", "description", "unit", "unit_price", "is_stock_tracked",
              "invoice_number", "status", "currency_code", "subtotal",
              "discount_total", "tax_total", "total", "customer_id",
              "product_id", "movement_type", "quantity_delta", "amount",
              "idempotency_key", "created_at")
    result = {}
    for key in fields:
        if hasattr(obj, key):
            value = getattr(obj, key)
            result[key] = str(value) if isinstance(value, (UUID, Decimal)) else value
    return result


@router.post("/businesses/{business_id}/customers", status_code=201)
def post_customer(business_id: UUID, body: CustomerCreate,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: create_customer(
        session, principal=principal, business_id=business_id, **body.model_dump()))
    return _record(result)


@router.post("/businesses/{business_id}/suppliers", status_code=201)
def post_supplier(business_id: UUID, body: SupplierCreate,
                  session: Session = Depends(get_session),
                  principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: create_supplier(
        session, principal=principal, business_id=business_id, **body.model_dump()))
    return _record(result)


@router.post("/businesses/{business_id}/products", status_code=201)
def post_product(business_id: UUID, body: ProductCreate,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: create_product(
        session, principal=principal, business_id=business_id, **body.model_dump()))
    return _record(result)


@router.post("/businesses/{business_id}/products/import/preview")
def preview_products_import(business_id: UUID, body: ProductImportRequest,
                            session: Session = Depends(get_session),
                            principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Validate a bounded product batch without writing any business data."""
    def preview():
        authorize_membership(session, principal=principal, business_id=business_id)
        errors = _product_import_errors(session, business_id, body.rows)
        return {"valid": not errors, "row_count": len(body.rows), "errors": errors,
                "write_performed": False}
    return _run(session, preview)


@router.post("/businesses/{business_id}/products/import", status_code=201)
def import_products(business_id: UUID, body: ProductImportRequest,
                    session: Session = Depends(get_session),
                    principal: AuthenticatedPrincipal = Depends(get_principal)):
    """Create an all-or-nothing product batch; business-scoped unique SKUs block duplicate retries."""
    def create_batch():
        authorize_membership(session, principal=principal, business_id=business_id)
        errors = _product_import_errors(session, business_id, body.rows)
        if errors:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"message": "Product import validation failed; no rows were imported.",
                        "errors": errors},
            )
        products = []
        for row in body.rows:
            products.append(create_product(
                session, principal=principal, business_id=business_id,
                sku=row.sku.strip(), name=row.name.strip(), unit_price=row.unit_price,
                description=row.description, unit=row.unit.strip(),
                is_stock_tracked=row.is_stock_tracked,
            ))
        return {"created_count": len(products), "products": [_record(item) for item in products],
                "atomic": True}
    return _run(session, create_batch)


@router.post("/businesses/{business_id}/invoices", status_code=201)
def post_invoice(business_id: UUID, body: InvoiceCreate,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    payload = body.model_dump()
    payload["lines"] = [line.model_dump(exclude_none=True) for line in body.lines]
    result = _run(session, lambda: create_invoice(
        session, principal=principal, business_id=business_id, **payload))
    return _record(result)


@router.post("/businesses/{business_id}/invoices/issue", status_code=201)
def post_create_and_issue_invoice(
    business_id: UUID,
    body: InvoiceCreate,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    """Create and issue an invoice in one transaction, linking an optional customer."""
    payload = body.model_dump()
    payload["lines"] = [line.model_dump(exclude_none=True) for line in body.lines]

    def create_and_issue():
        invoice = create_invoice(
            session, principal=principal, business_id=business_id, **payload
        )
        return issue_invoice(
            session, principal=principal, business_id=business_id, invoice_id=invoice.id
        )

    result = _run(session, create_and_issue)
    return _record(result)


@router.post("/businesses/{business_id}/invoices/{invoice_id}/issue")
def post_issue_invoice(business_id: UUID, invoice_id: UUID,
                       session: Session = Depends(get_session),
                       principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: issue_invoice(
        session, principal=principal, business_id=business_id, invoice_id=invoice_id))
    return _record(result)


@router.patch("/businesses/{business_id}/invoices/{invoice_id}")
def patch_draft_invoice(business_id: UUID, invoice_id: UUID, body: InvoiceDraftUpdate,
                        session: Session = Depends(get_session),
                        principal: AuthenticatedPrincipal = Depends(get_principal)):
    payload = body.model_dump()
    payload["lines"] = [line.model_dump(exclude_none=True) for line in body.lines]
    result = _run(session, lambda: replace_draft_invoice(
        session, principal=principal, business_id=business_id,
        invoice_id=invoice_id, **payload))
    return _record(result)


@router.post("/businesses/{business_id}/invoices/{invoice_id}/void")
def post_void_invoice(business_id: UUID, invoice_id: UUID, body: VoidInvoiceInput,
                      session: Session = Depends(get_session),
                      principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: void_invoice(
        session, principal=principal, business_id=business_id,
        invoice_id=invoice_id, reason=body.reason))
    return _record(result)


@router.post("/businesses/{business_id}/stock-movements", status_code=201)
def post_stock_movement(business_id: UUID, body: StockMovementInput,
                        session: Session = Depends(get_session),
                        principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: record_stock_movement(
        session, principal=principal, business_id=business_id, **body.model_dump()))
    return _record(result)


@router.post("/businesses/{business_id}/payments", status_code=201)
def post_payment(business_id: UUID, body: PaymentCreate,
                 session: Session = Depends(get_session),
                 principal: AuthenticatedPrincipal = Depends(get_principal)):
    result = _run(session, lambda: record_payment(
        session, principal=principal, business_id=business_id,
        amount=body.amount, currency_code=body.currency_code,
        idempotency_key=body.idempotency_key,
        customer_id=body.customer_id,
        allocations=[(item.invoice_id, item.amount) for item in body.allocations],
        method=body.method, reference=body.reference))
    return _record(result)
