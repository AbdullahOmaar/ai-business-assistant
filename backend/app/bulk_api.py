"""Bulk operations (C8 Part 2, design 3A-686).

Multi-select operations over invoices, purchase orders, customers and
products. Every bulk endpoint orchestrates the EXISTING single-item
operation per id -- no financial or lifecycle logic is duplicated here --
and collects a per-item result instead of failing the whole batch on the
first bad id. Each call also writes one summary audit event; the
single-item operations keep writing their own per-item audit events.

Limits (3A-686): at most MAX_BULK_IDS ids per call, and no bulk financial
deletion exists -- invoices are voided (the reversible correction path)
and customers/products are deactivated, exactly like the single-item
operations. Confirmation happens client-side before the call; the
per-item result is the rollback map (the inverse operation per item).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.dependencies import get_principal, get_session
from app.extended_api import deactivate_customer, deactivate_product
from app.models import AuditEvent, MembershipRole
from app.purchasing_api import cancel_draft_purchase_order
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)
from app.services import WorkflowError, void_invoice

router = APIRouter(
    prefix="/api/v1/businesses/{business_id}", tags=["bulk operations"]
)

MAX_BULK_IDS = 100


class BulkIds(BaseModel):
    ids: list[UUID]


class BulkVoid(BaseModel):
    ids: list[UUID]
    reason: str | None = Field(default=None, max_length=500)


def _owner(
    session: Session, principal: AuthenticatedPrincipal, business_id: UUID
) -> None:
    try:
        authorize_membership(
            session,
            principal=principal,
            business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )
    except AuthorizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc


def _validated_ids(raw: list[UUID]) -> list[UUID]:
    ids = list(dict.fromkeys(raw))
    if not ids:
        raise HTTPException(
            status_code=422, detail="At least one id is required"
        )
    if len(ids) > MAX_BULK_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"At most {MAX_BULK_IDS} ids per bulk operation",
        )
    return ids


def _run(session: Session, ids: list[UUID], operation) -> dict:
    succeeded: list[str] = []
    failed: list[dict[str, str]] = []
    for item_id in ids:
        try:
            operation(item_id)
            succeeded.append(str(item_id))
        except HTTPException as exc:
            session.rollback()
            failed.append({"id": str(item_id), "reason": str(exc.detail)})
        except WorkflowError as exc:
            session.rollback()
            failed.append({"id": str(item_id), "reason": str(exc)})
    return {"succeeded": succeeded, "failed": failed, "total": len(ids)}


def _summary(
    session: Session,
    business_id: UUID,
    principal: AuthenticatedPrincipal,
    action: str,
    target_type: str,
    result: dict,
) -> None:
    session.add(
        AuditEvent(
            business_id=business_id,
            actor_subject=principal.subject,
            action=action,
            target_type=target_type,
            target_id=None,
            change_summary=(
                f"Bulk operation: {len(result['succeeded'])} succeeded, "
                f"{len(result['failed'])} failed of {result['total']}"
            ),
        )
    )
    session.commit()


@router.post("/invoices/bulk-void")
def bulk_void_invoices(
    business_id: UUID,
    body: BulkVoid,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    ids = _validated_ids(body.ids)

    def void_one(invoice_id: UUID) -> None:
        void_invoice(
            session,
            principal=principal,
            business_id=business_id,
            invoice_id=invoice_id,
            reason=body.reason,
        )
        session.commit()

    result = _run(session, ids, void_one)
    _summary(
        session, business_id, principal,
        "invoice.bulk_voided", "invoice", result,
    )
    return result


@router.post("/purchase-orders/bulk-cancel")
def bulk_cancel_purchase_orders(
    business_id: UUID,
    body: BulkIds,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    ids = _validated_ids(body.ids)

    def cancel_one(order_id: UUID) -> None:
        cancel_draft_purchase_order(business_id, order_id, session, principal)

    result = _run(session, ids, cancel_one)
    _summary(
        session, business_id, principal,
        "purchase_order.bulk_cancelled", "purchase_order", result,
    )
    return result


@router.post("/customers/bulk-deactivate")
def bulk_deactivate_customers(
    business_id: UUID,
    body: BulkIds,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    ids = _validated_ids(body.ids)

    def deactivate_one(customer_id: UUID) -> None:
        deactivate_customer(business_id, customer_id, session, principal)

    result = _run(session, ids, deactivate_one)
    _summary(
        session, business_id, principal,
        "customer.bulk_deactivated", "customer", result,
    )
    return result


@router.post("/products/bulk-deactivate")
def bulk_deactivate_products(
    business_id: UUID,
    body: BulkIds,
    session: Session = Depends(get_session),
    principal: AuthenticatedPrincipal = Depends(get_principal),
):
    _owner(session, principal, business_id)
    ids = _validated_ids(body.ids)

    def deactivate_one(product_id: UUID) -> None:
        deactivate_product(business_id, product_id, session, principal)

    result = _run(session, ids, deactivate_one)
    _summary(
        session, business_id, principal,
        "product.bulk_deactivated", "product", result,
    )
    return result
