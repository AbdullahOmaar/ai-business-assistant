"""Assistant execution foundation (Slice 1) — proposals, approvals, dispatch.

The executing assistant never writes directly. Every write goes through
a proposal:

``request -> proposal -> (second owner approval, when the action is in
the 19) -> execute -> result + audit``

* The proposal binds an action to its exact payload: the payload is
  validated, canonicalized and hashed at creation, stored server-side,
  and never changes afterwards. Approval binds to that hash.
* Approval is a separate action by a different owner than the
  requester, one use, and expires 5 minutes after proposal creation
  (owner decision 2026-11-25, DESIGN.md §5). Expiry is derived on
  read — no lazy write mutates the row.
* Execution runs through ``verdict()`` (B6) with the executor's own
  role, dispatches to the existing service/route functions directly
  (never an HTTP self-call), and writes ``assistant.action_executed``
  naming the requester, the approver and حسو as the channel.
* An owner's stored per-action opt-out ("don't ask again", DESIGN.md
  §5.3) waives the second-approval *question* only for the owner's own
  requests. A staff member's money action always needs a live owner
  approval — an opt-out is never a standing pre-authorization for
  someone else's requests.
* Only the requester or the approver may execute a proposal. That is
  what makes OWNER-min-role actions requested by staff executable at
  all: the owner approves, then the owner executes in their own role.
  The payload binding means the executor cannot change what executes.
* Two concurrent executes cannot double-post: the execute step
  atomically claims the proposal (status ``executing``, committed
  before dispatch, guarded by the previous status) — a second
  claimer gets a 409. A row lock alone would not hold, because
  route-handler dispatch targets commit their own transaction. A
  failed dispatch rolls back partial service writes first, then
  releases the claim back to the pre-execution status, so the
  approval is not burned.

Known honest limit: the invoice PATCH route edits drafts only
(``replace_draft_invoice`` raises for issued invoices), so an
``invoice.update`` proposal on an issued invoice passes the approval
flow and then fails closed at dispatch with that route's own error.
The proposal response carries an ``execution_note`` warning in that
case instead of pretending the edit will succeed.
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from enum import Enum
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import assistant_write_policy as policy
from app.api import (
    CustomerCreate,
    InvoiceCreate,
    InvoiceDraftUpdate,
    PaymentCreate,
    ProductCreate,
    StockMovementInput,
    SupplierCreate,
)
from app.employee_payroll_api import (
    PayrollCreate,
    PayrollUpdate,
    approve_payroll,
    create_payroll,
    pay_payroll,
    update_payroll,
)
from app.extended_api import (
    CustomerPatch,
    ExpenseInput,
    NotificationInput,
    PricingRuleInput,
    PurchaseOrderInput,
    ReceivePurchaseInput,
    ReturnInput,
    ScheduleInput,
    approve_purchase_order,
    approve_sales_return,
    duplicate_purchase_order,
    import_csv,
    issue_credit_note_for_return,
    patch_customer,
    post_notification,
    post_pricing_rule,
    post_purchase_order,
    post_recurring_schedule,
    post_sales_return,
    receive_purchase_order,
)
from app.models import (
    AssistantConfirmationOptOut,
    AssistantProposal,
    BusinessMembership,
    Invoice,
    MembershipRole,
)
from app.purchasing_api import cancel_draft_purchase_order
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)
from app.services import (
    WorkflowError,
    create_customer,
    create_expense,
    create_invoice,
    create_product,
    create_supplier,
    duplicate_invoice,
    issue_invoice,
    record_payment,
    record_stock_movement,
    replace_draft_invoice,
    void_invoice,
)
from app.services import _audit as _service_audit

PROPOSAL_TTL = timedelta(minutes=5)
APPROVAL_TTL = PROPOSAL_TTL  # one deadline: creation + 5 minutes, for both steps.

PROPOSAL_STATUSES = ("proposed", "approved", "executing", "executed", "expired", "rejected")


class ProposalNotFound(Exception):
    """No proposal with that id in this business."""


class ProposalExpired(Exception):
    """The proposal's 5-minute window has passed."""


class ProposalConflict(Exception):
    """The proposal is in the wrong state, or the approval does not bind."""


class ProposalForbidden(Exception):
    """The caller is not a party to this proposal."""


def _role_name(role: MembershipRole | str) -> str:
    """"OWNER"/"STAFF" from a membership role (enum or plain string)."""
    if isinstance(role, Enum):
        return role.name
    return str(role).upper()


def _as_aware(value: datetime) -> datetime:
    """Treat a naive stored timestamp as UTC (SQLite returns naive values)."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Payload models — one strict shape per closed-list action.
# ---------------------------------------------------------------------------

class _IdRef(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _InvoiceRef(_IdRef):
    invoice_id: UUID


class _OrderRef(_IdRef):
    order_id: UUID


class _ReturnRef(_IdRef):
    return_id: UUID


class _PayrollRef(_IdRef):
    payroll_id: UUID


class _CustomerUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    customer_id: UUID
    patch: CustomerPatch


class _InvoiceUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invoice_id: UUID
    update: InvoiceDraftUpdate


class _VoidInvoicePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invoice_id: UUID
    reason: str | None = Field(default=None, max_length=500)


class _ReceivePurchasePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_id: UUID
    receive: ReceivePurchaseInput
    idempotency_key: str = Field(min_length=1, max_length=128)

    @field_validator("idempotency_key")
    @classmethod
    def _canonical_uuid(cls, value: str) -> str:
        """The receive route requires a canonical UUID idempotency key."""
        try:
            parsed = UUID(value)
        except ValueError:
            raise ValueError("idempotency_key must be a canonical UUID") from None
        if str(parsed) != value:
            raise ValueError("idempotency_key must be a canonical UUID")
        return value


class _PayrollCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: UUID
    payroll: PayrollCreate


class _PayrollUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payroll_id: UUID
    update: PayrollUpdate


class _DataImportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entity_type: Literal["customers", "products"]
    csv_text: str = Field(min_length=1, max_length=2_000_000)


#: The closed list, mapped to its payload shape. An action not in this
#: map cannot be proposed — the policy module is the source of truth
#: for which actions exist; this map adds only their payload shape.
PAYLOAD_MODELS: dict[str, type[BaseModel]] = {
    "customer.create": CustomerCreate,
    "supplier.create": SupplierCreate,
    "product.create": ProductCreate,
    "customer.update": _CustomerUpdatePayload,
    "invoice.create": InvoiceCreate,
    "invoice.update": _InvoiceUpdatePayload,
    "invoice.update_draft": _InvoiceUpdatePayload,
    "invoice.duplicate": _InvoiceRef,
    "invoice.issue": _InvoiceRef,
    "invoice.void": _VoidInvoicePayload,
    "payment.record": PaymentCreate,
    "stock.movement": StockMovementInput,
    "expense.create": ExpenseInput,
    "purchase_order.create": PurchaseOrderInput,
    "purchase_order.duplicate": _OrderRef,
    "purchase_order.approve": _OrderRef,
    "purchase_order.receive": _ReceivePurchasePayload,
    "purchase_order.cancel": _OrderRef,
    "sales_return.create": ReturnInput,
    "sales_return.approve": _ReturnRef,
    "credit_note.issue": _ReturnRef,
    "recurring_invoice.create": ScheduleInput,
    "pricing_rule.create": PricingRuleInput,
    "payroll.create": _PayrollCreatePayload,
    "payroll.approve": _PayrollRef,
    "payroll.pay": _PayrollRef,
    "payroll.update": _PayrollUpdatePayload,
    "data_import.create": _DataImportPayload,
    "notification.create": NotificationInput,
}

#: The record each successful execution links to in its result.
ACTION_TARGET_TYPES: dict[str, str] = {
    "customer.create": "customer",
    "supplier.create": "supplier",
    "product.create": "product",
    "customer.update": "customer",
    "invoice.create": "invoice",
    "invoice.update": "invoice",
    "invoice.update_draft": "invoice",
    "invoice.duplicate": "invoice",
    "invoice.issue": "invoice",
    "invoice.void": "invoice",
    "payment.record": "payment",
    "stock.movement": "stock_movement",
    "expense.create": "expense",
    "purchase_order.create": "purchase_order",
    "purchase_order.duplicate": "purchase_order",
    "purchase_order.approve": "purchase_order",
    "purchase_order.receive": "purchase_order",
    "purchase_order.cancel": "purchase_order",
    "sales_return.create": "sales_return",
    "sales_return.approve": "sales_return",
    "credit_note.issue": "credit_note",
    "recurring_invoice.create": "recurring_invoice_schedule",
    "pricing_rule.create": "pricing_rule",
    "payroll.create": "payroll",
    "payroll.approve": "payroll",
    "payroll.pay": "payroll",
    "payroll.update": "payroll",
    "data_import.create": "import_job",
    "notification.create": "notification",
}


def _json_default(value: object) -> str:
    """Canonical JSON encoding for values Pydantic keeps native."""
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def canonical_payload_json(data: dict) -> str:
    """Deterministic JSON for one validated payload (hash input)."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=_json_default)


def canonical_payload_dict(model: BaseModel) -> dict:
    """The JSON-safe dict stored on the proposal (decimals as strings)."""
    return json.loads(canonical_payload_json(model.model_dump(mode="python")))


def payload_hash(data: dict) -> str:
    return hashlib.sha256(canonical_payload_json(data).encode("utf-8")).hexdigest()


def validate_payload(action: str, payload: object) -> tuple[dict, str]:
    """Validate a raw payload against the action's shape.

    Returns the canonical stored dict and its hash. Raises
    WorkflowError (422) on a malformed payload — never a raw
    Pydantic error, so no caller-supplied value leaks into details.
    """
    model_cls = PAYLOAD_MODELS.get(action)
    if model_cls is None:
        raise WorkflowError(f"assistant write action '{action}' has no payload shape")
    if not isinstance(payload, dict):
        raise WorkflowError(f"payload for '{action}' must be an object")
    try:
        validated = model_cls.model_validate(payload)
    except ValidationError as exc:
        raise WorkflowError(
            f"invalid payload for '{action}': "
            + "; ".join(f"{'.'.join(map(str, err['loc']))} {err['msg']}" for err in exc.errors())
        ) from exc
    data = canonical_payload_dict(validated)
    return data, payload_hash(data)


def resolve_effective_action(
    session: Session, business_id: UUID, action: str, payload: dict
) -> str:
    """Map a requested action to the policy entry that governs it.

    ``invoice.update`` becomes ``invoice.update_draft`` only when the
    target invoice is a draft; an issued invoice stays
    ``invoice.update`` in the 19. Every other action maps to itself.
    """
    if action != "invoice.update":
        return action
    invoice = session.scalars(select(Invoice).where(
        Invoice.id == UUID(str(payload["invoice_id"])),
        Invoice.business_id == business_id,
    )).one_or_none()
    if invoice is None:
        raise WorkflowError("Invoice not found in this business")
    return "invoice.update_draft" if invoice.status == "draft" else "invoice.update"


def effective_status(proposal: AssistantProposal, now: datetime | None = None) -> str:
    """The proposal's status with expiry derived, never lazily written."""
    moment = _now() if now is None else now
    if proposal.status in ("proposed", "approved") and moment > _as_aware(proposal.expires_at):
        return "expired"
    return proposal.status


def proposal_view(
    proposal: AssistantProposal,
    *,
    effective_action: str | None = None,
    requires_second_approval: bool | None = None,
    execution_note: str | None = None,
) -> dict:
    """The API shape of a proposal (derived expiry, no ORM leakage)."""
    action = effective_action or proposal.action
    needs_approval = (
        policy.requires_second_approval(action)
        if requires_second_approval is None
        else requires_second_approval
    )
    def _iso(value: datetime | None) -> str | None:
        # SQLite returns naive timestamps; normalize to aware UTC so
        # every timestamp in the API has the same shape.
        return _as_aware(value).isoformat() if value is not None else None

    return {
        "id": str(proposal.id),
        "business_id": str(proposal.business_id),
        "action": proposal.action,
        "effective_action": action,
        "payload": proposal.payload,
        "payload_hash": proposal.payload_hash,
        "status": effective_status(proposal),
        "requires_second_approval": needs_approval,
        "requester_subject": proposal.requester_subject,
        "approver_subject": proposal.approver_subject,
        "approved_at": _iso(proposal.approved_at),
        "executed_at": _iso(proposal.executed_at),
        "expires_at": _iso(proposal.expires_at),
        "created_at": _iso(proposal.created_at),
        "result": (
            {"target_type": proposal.result_target_type, "target_id": proposal.result_target_id}
            if proposal.result_target_type and proposal.result_target_id
            else None
        ),
        "execution_note": execution_note,
    }


# ---------------------------------------------------------------------------
# Dispatch — one existing function per closed-list action.
#
# Service-layer targets (app.services) run inside the caller's
# transaction: the execute step commits them together with the
# assistant audit event and the proposal status. Route-handler targets
# (extended_api / payroll / purchasing) commit their own transaction
# first — that is their existing behaviour, including the idempotency
# replay in record_payment / receive_purchase_order — and the proposal
# + audit commit follows. Either way the assistant audit event is
# written only after the business action succeeded.
# ---------------------------------------------------------------------------

def _invoice_lines(body: InvoiceCreate) -> list[dict]:
    """Lines exactly as the invoice route passes them (None fields omitted).

    ``exclude_none`` matters: a manual line with no ``unit_price`` must
    omit the key, or ``create_invoice`` would try ``Decimal("None")``.
    """
    return [line.model_dump(mode="python", exclude_none=True) for line in body.lines]


def _summarize(result: object) -> dict:
    """A small safe dict for an execution result (no ORM leakage).

    Values are kept native — FastAPI's encoder renders Decimals, UUIDs
    and datetimes, exactly as the existing record endpoints do.
    """
    if isinstance(result, dict):
        return dict(result)
    fields = (
        "id", "business_id", "name", "status", "invoice_number", "order_number",
        "currency_code", "total", "amount", "period", "kind", "title",
        "customer_id", "supplier_id", "employee_id", "entity_type", "row_count",
    )
    out: dict[str, object] = {}
    for key in fields:
        value = getattr(result, key, None)
        if value is not None:
            out[key] = value
    return out


def _target_id(result: object) -> str:
    if isinstance(result, dict):
        value = result.get("id")
        if value is None:
            raise WorkflowError("execution returned no record id")
        return str(value)
    value = getattr(result, "id", None)
    if value is None:
        raise WorkflowError("execution returned no record id")
    return str(value)


def dispatch(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    action: str,
    payload: dict,
) -> tuple[str, str, dict]:
    """Execute one validated proposal payload; returns (type, id, summary).

    The payload is re-validated here — the stored payload was validated
    at creation, but execution never trusts stored data blindly.
    Raises WorkflowError (422) or the target's own HTTPException on a
    business failure; the proposal stays unexecuted so the caller can
    fix the data and retry inside the 5-minute window.
    """
    data, _ = validate_payload(action, payload)
    model_cls = PAYLOAD_MODELS[action]
    body = model_cls.model_validate(data)

    if action == "customer.create":
        result = create_customer(session, principal=principal, business_id=business_id, **body.model_dump())
    elif action == "supplier.create":
        result = create_supplier(session, principal=principal, business_id=business_id, **body.model_dump())
    elif action == "product.create":
        result = create_product(session, principal=principal, business_id=business_id, **body.model_dump(mode="python"))
    elif action == "customer.update":
        result = patch_customer(business_id, body.customer_id, body.patch, session=session, principal=principal)
    elif action == "invoice.create":
        result = create_invoice(
            session, principal=principal, business_id=business_id,
            invoice_number=body.invoice_number, currency_code=body.currency_code,
            lines=_invoice_lines(body), customer_id=body.customer_id,
            discount_rate=body.discount_rate, tax_rate=body.tax_rate, notes=body.notes,
        )
    elif action in ("invoice.update", "invoice.update_draft"):
        # Issued invoices fail closed here: replace_draft_invoice raises
        # "Only draft invoices can be edited" — see the module docstring.
        result = replace_draft_invoice(
            session, principal=principal, business_id=business_id,
            invoice_id=body.invoice_id, invoice_number=body.update.invoice_number,
            currency_code=body.update.currency_code, lines=_invoice_lines(body.update),
            customer_id=body.update.customer_id, discount_rate=body.update.discount_rate,
            tax_rate=body.update.tax_rate, notes=body.update.notes,
        )
    elif action == "invoice.duplicate":
        result = duplicate_invoice(session, principal=principal, business_id=business_id, invoice_id=body.invoice_id)
    elif action == "invoice.issue":
        result = issue_invoice(session, principal=principal, business_id=business_id, invoice_id=body.invoice_id)
    elif action == "invoice.void":
        result = void_invoice(session, principal=principal, business_id=business_id, invoice_id=body.invoice_id, reason=body.reason)
    elif action == "payment.record":
        result = record_payment(
            session, principal=principal, business_id=business_id,
            amount=body.amount, currency_code=body.currency_code,
            idempotency_key=body.idempotency_key,
            allocations=[(item.invoice_id, item.amount) for item in body.allocations],
            customer_id=body.customer_id, method=body.method, reference=body.reference,
        )
    elif action == "stock.movement":
        result = record_stock_movement(
            session, principal=principal, business_id=business_id,
            product_id=body.product_id, movement_type=body.movement_type,
            quantity_delta=body.quantity_delta, reason=body.reason,
        )
    elif action == "expense.create":
        result = create_expense(session, principal=principal, business_id=business_id, **body.model_dump(mode="python"))
    elif action == "purchase_order.create":
        result = post_purchase_order(business_id, body, session=session, principal=principal)
    elif action == "purchase_order.duplicate":
        result = duplicate_purchase_order(business_id, body.order_id, session=session, principal=principal)
    elif action == "purchase_order.approve":
        result = approve_purchase_order(business_id, body.order_id, session=session, principal=principal)
    elif action == "purchase_order.receive":
        result = receive_purchase_order(
            business_id, body.order_id, body.receive,
            idempotency_key=body.idempotency_key, session=session, principal=principal,
        )
    elif action == "purchase_order.cancel":
        result = cancel_draft_purchase_order(business_id, body.order_id, session=session, principal=principal)
    elif action == "sales_return.create":
        result = post_sales_return(business_id, body, session=session, principal=principal)
    elif action == "sales_return.approve":
        result = approve_sales_return(business_id, body.return_id, session=session, principal=principal)
    elif action == "credit_note.issue":
        result = issue_credit_note_for_return(business_id, body.return_id, session=session, principal=principal)
    elif action == "recurring_invoice.create":
        result = post_recurring_schedule(business_id, body, session=session, principal=principal)
    elif action == "pricing_rule.create":
        result = post_pricing_rule(business_id, body, session=session, principal=principal)
    elif action == "payroll.create":
        result = create_payroll(business_id, body.employee_id, body.payroll, session=session, principal=principal)
    elif action == "payroll.approve":
        result = approve_payroll(business_id, body.payroll_id, session=session, principal=principal)
    elif action == "payroll.pay":
        result = pay_payroll(business_id, body.payroll_id, session=session, principal=principal)
    elif action == "payroll.update":
        result = update_payroll(business_id, body.payroll_id, body.update, session=session, principal=principal)
    elif action == "data_import.create":
        result = import_csv(business_id, body.entity_type, csv_text=body.csv_text, session=session, principal=principal)
    elif action == "notification.create":
        result = post_notification(business_id, body, session=session, principal=principal)
    else:  # pragma: no cover - guarded by validate_payload / verdict
        raise WorkflowError(f"assistant write action '{action}' has no dispatch target")

    target_type = ACTION_TARGET_TYPES[action]
    return target_type, _target_id(result), _summarize(result)


# ---------------------------------------------------------------------------
# Proposal lifecycle.
# ---------------------------------------------------------------------------

def _load_proposal(session: Session, business_id: UUID, proposal_id: UUID) -> AssistantProposal:
    proposal = session.scalars(select(AssistantProposal).where(
        AssistantProposal.id == proposal_id,
        AssistantProposal.business_id == business_id,
    )).one_or_none()
    if proposal is None:
        raise ProposalNotFound(f"proposal {proposal_id} not found in this business")
    return proposal


def _commit(session: Session, action):
    """Commit one step; roll back and re-raise on any failure."""
    try:
        result = action()
        session.commit()
        return result
    except Exception:
        session.rollback()
        raise


def _claim_execution(session: Session, proposal: AssistantProposal) -> str:
    """Atomically claim a proposal for execution.

    A row lock alone does not hold: route-handler dispatch targets
    commit their own transaction, which would release the lock before
    the proposal status is written. So the claim is a committed
    status transition guarded by the previous status — only one
    executor can move the row from ``proposed``/``approved`` to
    ``executing``; a second claimer finds zero rows and gets a 409.
    Returns the pre-execution status for the release step.
    """
    previous = proposal.status
    result = session.execute(
        update(AssistantProposal)
        .where(AssistantProposal.id == proposal.id)
        .where(AssistantProposal.status.in_(("proposed", "approved")))
        .values(status="executing")
    )
    session.commit()
    if result.rowcount != 1:
        raise ProposalConflict("proposal is already being executed")
    session.refresh(proposal)
    return previous


def _release_execution(session: Session, proposal: AssistantProposal, previous: str) -> None:
    """Return a claimed proposal to its pre-execution status.

    Called only after a failed dispatch — and only after a rollback,
    so no partial service write can ride along in this commit. The
    approval is not burned: the caller can fix the data and retry.
    """
    session.execute(
        update(AssistantProposal)
        .where(AssistantProposal.id == proposal.id)
        .values(status=previous)
    )
    session.commit()
    session.refresh(proposal)


def _requester_role(session: Session, business_id: UUID, subject: str) -> str | None:
    """The stored role of a proposal's requester, if they are still a member."""
    membership = session.scalars(select(BusinessMembership).where(
        BusinessMembership.business_id == business_id,
        BusinessMembership.user_subject == subject,
    )).one_or_none()
    return _role_name(membership.role) if membership is not None else None


def _opt_out_exists(session: Session, business_id: UUID, subject: str, action: str) -> bool:
    return session.scalars(select(AssistantConfirmationOptOut).where(
        AssistantConfirmationOptOut.business_id == business_id,
        AssistantConfirmationOptOut.user_subject == subject,
        AssistantConfirmationOptOut.action == action,
    )).first() is not None


def create_proposal(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    action: str,
    payload: object,
) -> dict:
    """Validate an action + payload and store it as a proposal.

    The role gate runs through ``verdict()``: a needs-approval verdict
    is the normal outcome for the 19 (recorded, not an error); a
    forbidden action or an insufficient role is a 403.
    """
    membership = authorize_membership(session, principal=principal, business_id=business_id)
    role = _role_name(membership.role)
    if policy.is_forbidden(action):
        raise policy.AssistantWriteForbidden(
            f"assistant write action '{action}' is not in the closed list"
        )
    data, digest = validate_payload(action, payload)
    effective = resolve_effective_action(session, business_id, action, data)
    try:
        policy.verdict(effective, role)
        needs_approval = False
    except policy.AssistantWriteNeedsApproval:
        needs_approval = True

    note = None
    if effective == "invoice.update":
        note = (
            "Issued invoices cannot be edited by the current invoice API — "
            "execution will fail. Void and re-issue, or issue a credit note."
        )

    def _create() -> AssistantProposal:
        proposal = AssistantProposal(
            id=uuid4(),
            business_id=business_id,
            requester_subject=principal.subject,
            action=action,
            payload=data,
            payload_hash=digest,
            status="proposed",
            expires_at=_now() + PROPOSAL_TTL,
        )
        session.add(proposal)
        session.flush()
        return proposal

    proposal = _commit(session, _create)
    return proposal_view(
        proposal, effective_action=effective,
        requires_second_approval=needs_approval, execution_note=note,
    )


def get_proposal(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    proposal_id: UUID,
) -> dict:
    authorize_membership(session, principal=principal, business_id=business_id)
    proposal = _load_proposal(session, business_id, proposal_id)
    effective = resolve_effective_action(session, business_id, proposal.action, proposal.payload)
    note = None
    if effective == "invoice.update":
        note = (
            "Issued invoices cannot be edited by the current invoice API — "
            "execution will fail. Void and re-issue, or issue a credit note."
        )
    return proposal_view(
        proposal, effective_action=effective, execution_note=note,
    )


def approve_proposal(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    proposal_id: UUID,
    payload_hash: str,
) -> dict:
    """Second owner approval: a separate action by a different owner.

    Binds to the exact payload hash; one use; inside the 5-minute
    window. The approval records the effective action it was granted
    for, so it cannot later execute a different action state.
    """
    authorize_membership(
        session, principal=principal, business_id=business_id,
        allowed_roles={MembershipRole.OWNER},
    )
    proposal = _load_proposal(session, business_id, proposal_id)
    if effective_status(proposal) == "expired":
        raise ProposalExpired("this proposal expired — create a new one")
    if proposal.status != "proposed":
        raise ProposalConflict(f"proposal is {proposal.status}, not awaiting approval")
    if principal.subject == proposal.requester_subject:
        raise ProposalConflict("the requester cannot approve their own proposal")
    if payload_hash != proposal.payload_hash:
        raise ProposalConflict("payload hash does not match the proposed payload")
    effective = resolve_effective_action(session, business_id, proposal.action, proposal.payload)

    def _approve() -> AssistantProposal:
        proposal.status = "approved"
        proposal.approver_subject = principal.subject
        proposal.approved_action = effective
        proposal.approved_at = _now()
        session.flush()
        return proposal

    _commit(session, _approve)
    return proposal_view(proposal, effective_action=effective, requires_second_approval=False)


def execute_proposal(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    proposal_id: UUID,
) -> dict:
    """Execute a proposal through verdict() and dispatch.

    Only the requester or the approver may execute, in their own role.
    A failed dispatch leaves the proposal unexecuted, so the caller can
    fix the data and retry inside the window — an approval is consumed
    only by a successful execution.
    """
    membership = authorize_membership(session, principal=principal, business_id=business_id)
    role = _role_name(membership.role)
    proposal = _load_proposal(session, business_id, proposal_id)
    if effective_status(proposal) == "expired":
        raise ProposalExpired("this proposal expired — create a new one")
    if proposal.status not in ("proposed", "approved"):
        raise ProposalConflict(f"proposal is {proposal.status} and cannot execute")
    if principal.subject not in (proposal.requester_subject, proposal.approver_subject):
        raise ProposalForbidden("only the requester or the approver may execute this proposal")
    effective = resolve_effective_action(session, business_id, proposal.action, proposal.payload)

    approval_note: str | None = None
    second_approved = False
    if proposal.status == "approved":
        if proposal.approved_action != effective:
            raise ProposalConflict(
                "approval was granted for a different action state — re-approval required"
            )
        second_approved = True
        approval_note = f"approved by {proposal.approver_subject}"
    elif policy.requires_second_approval(effective):
        # Opt-out waiver: only the owner's own requests, only when that
        # owner recorded the opt-out for this exact action.
        requester_role = _requester_role(session, business_id, proposal.requester_subject)
        if (
            requester_role == "OWNER"
            and _opt_out_exists(session, business_id, proposal.requester_subject, effective)
        ):
            second_approved = True
            approval_note = f"opt-out waived by owner ({proposal.requester_subject})"
        else:
            raise policy.AssistantWriteNeedsApproval(
                f"assistant write action '{effective}' requires a second owner approval"
            )

    # The single governance gate. Raises Forbidden / RoleDenied /
    # NeedsApproval; the API layer maps them to 403 / 403 / 409.
    policy.verdict(effective, role, second_approved=second_approved)

    # Atomic execution claim (see _claim_execution): committed before
    # dispatch, so a second concurrent execute gets a 409 instead of
    # dispatching the same payload again.
    previous_status = _claim_execution(session, proposal)

    try:
        target_type, target_id, summary = dispatch(
            session, principal=principal, business_id=business_id,
            action=proposal.action, payload=proposal.payload,
        )
    except Exception:
        # Roll back partial service writes FIRST (a commit here would
        # persist them), then release the claim so the proposal returns
        # to its pre-execution status and stays retryable.
        session.rollback()
        _release_execution(session, proposal, previous_status)
        raise

    def _finish() -> AssistantProposal:
        approval_text = approval_note or "no second approval required"
        _service_audit(
            session, business_id=business_id, principal=principal,
            action="assistant.action_executed", target_type=target_type,
            target_id=target_id,
            summary=(
                f"حسو executed {effective} (proposal {proposal.id}): "
                f"requested by {proposal.requester_subject}; {approval_text}"
            ),
        )
        proposal.status = "executed"
        proposal.executed_at = _now()
        proposal.result_target_type = target_type
        proposal.result_target_id = target_id
        session.flush()
        return proposal

    _commit(session, _finish)
    view = proposal_view(proposal, effective_action=effective, requires_second_approval=False)
    view["result"] = {"target_type": target_type, "target_id": target_id, **summary}
    return view


def cancel_proposal(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    proposal_id: UUID,
) -> dict:
    """Withdraw a proposal (requester or approver) before it executes."""
    authorize_membership(session, principal=principal, business_id=business_id)
    proposal = _load_proposal(session, business_id, proposal_id)
    if effective_status(proposal) == "expired":
        raise ProposalExpired("this proposal expired — create a new one")
    if proposal.status not in ("proposed", "approved"):
        raise ProposalConflict(f"proposal is {proposal.status} and cannot be cancelled")
    if principal.subject not in (proposal.requester_subject, proposal.approver_subject):
        raise ProposalForbidden("only the requester or the approver may cancel this proposal")

    def _cancel() -> AssistantProposal:
        proposal.status = "rejected"
        session.flush()
        return proposal

    _commit(session, _cancel)
    return proposal_view(proposal, requires_second_approval=False)


# ---------------------------------------------------------------------------
# Confirmation opt-outs ("don't ask again", DESIGN.md §5.3).
# ---------------------------------------------------------------------------

def opt_out_view(row: AssistantConfirmationOptOut) -> dict:
    return {
        "id": str(row.id),
        "business_id": str(row.business_id),
        "user_subject": row.user_subject,
        "action": row.action,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def create_opt_out(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    action: str,
) -> dict:
    """Record an owner's per-action waiver of the second-approval question.

    Only actions in the 19 can be waived; allowed actions need no
    approval already, and forbidden actions can never be waived.
    Idempotent: re-enabling returns the existing row.
    """
    authorize_membership(
        session, principal=principal, business_id=business_id,
        allowed_roles={MembershipRole.OWNER},
    )
    if not policy.requires_second_approval(action):
        raise WorkflowError(
            f"action '{action}' does not require a second approval, so it cannot be opted out of"
        )
    existing = session.scalars(select(AssistantConfirmationOptOut).where(
        AssistantConfirmationOptOut.business_id == business_id,
        AssistantConfirmationOptOut.user_subject == principal.subject,
        AssistantConfirmationOptOut.action == action,
    )).one_or_none()
    if existing is not None:
        return opt_out_view(existing)

    def _create() -> AssistantConfirmationOptOut:
        row = AssistantConfirmationOptOut(
            id=uuid4(), business_id=business_id,
            user_subject=principal.subject, action=action,
        )
        session.add(row)
        session.flush()
        _service_audit(
            session, business_id=business_id, principal=principal,
            action="assistant.opt_out_created",
            target_type="assistant_confirmation_opt_out", target_id=row.id,
            summary=f"Owner enabled 'don't ask again' for {action}",
        )
        return row

    row = _commit(session, _create)
    return opt_out_view(row)


def delete_opt_out(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    action: str,
) -> None:
    """Revoke one of the caller's opt-outs (the waiver ends at once)."""
    authorize_membership(
        session, principal=principal, business_id=business_id,
        allowed_roles={MembershipRole.OWNER},
    )
    row = session.scalars(select(AssistantConfirmationOptOut).where(
        AssistantConfirmationOptOut.business_id == business_id,
        AssistantConfirmationOptOut.user_subject == principal.subject,
        AssistantConfirmationOptOut.action == action,
    )).one_or_none()
    if row is None:
        raise ProposalNotFound(f"no opt-out for action '{action}'")
    row_id = row.id

    def _delete() -> None:
        _service_audit(
            session, business_id=business_id, principal=principal,
            action="assistant.opt_out_deleted",
            target_type="assistant_confirmation_opt_out", target_id=row_id,
            summary=f"Owner revoked 'don't ask again' for {action}",
        )
        session.delete(row)
        session.flush()

    _commit(session, _delete)


def list_opt_outs(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
) -> list[dict]:
    """The caller's own opt-outs in this business, newest first."""
    authorize_membership(session, principal=principal, business_id=business_id)
    rows = session.scalars(select(AssistantConfirmationOptOut).where(
        AssistantConfirmationOptOut.business_id == business_id,
        AssistantConfirmationOptOut.user_subject == principal.subject,
    ).order_by(AssistantConfirmationOptOut.created_at.desc())).all()
    return [opt_out_view(row) for row in rows]
