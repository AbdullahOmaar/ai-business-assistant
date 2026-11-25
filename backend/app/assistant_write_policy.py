"""Assistant write governance (B6, 3A-724) — the closed list.

The assistant executes only through the proposal flow
(``app.assistant_execution``): a proposal binds an action to its
exact payload, sensitive actions need a second owner approval (or
the owner's stored per-action opt-out), and every execution runs
through ``verdict()`` below with the caller's own role. The chat
endpoint itself stays read-only; its system prompt forbids
claiming an execution. It is a closed list: an action not named
here is forbidden by default.

Three classes:
- ALLOWED: reversible, low-value writes the assistant may execute
  with the caller's own role and no second approval (drafts and
  directory records only — nothing that posts money).
- NEEDS_APPROVAL: writes that post money, commit a business, or
  carry a large blast radius. They may execute ONLY after a second
  approval by the business owner, through the proposal flow
  (``app.assistant_execution``), or the owner's stored per-action
  opt-out for their own requests.
- FORBIDDEN: never executable by the assistant, even with approval
  — deletes, membership/role/platform changes, settings, payroll,
  employees, and anything outside the business.

The assistant always executes with the caller's role (role-bounded
execution): a STAFF caller can never execute an OWNER-only write,
even one in the ALLOWED class. The role column below is the minimal
role the underlying route already requires (from the route matrix).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WriteAction:
    """One assistant-executable write: the API route it maps to."""

    action: str
    method: str
    route: str
    min_role: str  # "OWNER" or "STAFF" — the role the route requires
    second_approval: bool


# The closed list. Deliberately small: drafts and directory records.
ASSISTANT_WRITABLE: tuple[WriteAction, ...] = (
    WriteAction("customer.create", "POST", "/api/v1/businesses/{business_id}/customers", "STAFF", False),
    WriteAction("supplier.create", "POST", "/api/v1/businesses/{business_id}/suppliers", "STAFF", False),
    WriteAction("product.create", "POST", "/api/v1/businesses/{business_id}/products", "STAFF", False),
    WriteAction("customer.update", "PATCH", "/api/v1/businesses/{business_id}/customers/{customer_id}", "STAFF", False),
    WriteAction("invoice.create", "POST", "/api/v1/businesses/{business_id}/invoices", "STAFF", False),
    # Formal B6 amendment (owner decision 2026-11-25, DESIGN.md §7.3):
    # editing an invoice while it is a DRAFT joins the allowed list.
    # The execution path maps "invoice.update" to this entry ONLY when
    # the target invoice's status is "draft"; an issued invoice stays
    # "invoice.update" in NEEDS_SECOND_APPROVAL below. Same PATCH route.
    WriteAction("invoice.update_draft", "PATCH", "/api/v1/businesses/{business_id}/invoices/{invoice_id}", "STAFF", False),
    WriteAction("invoice.duplicate", "POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/duplicate", "STAFF", False),
    WriteAction("purchase_order.create", "POST", "/api/v1/businesses/{business_id}/purchase-orders", "STAFF", False),
    WriteAction("purchase_order.duplicate", "POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/duplicate", "STAFF", False),
    WriteAction("sales_return.create", "POST", "/api/v1/businesses/{business_id}/sales-returns", "STAFF", False),
)

# Writes that post money, commit the business, or carry a large blast
# radius. Second approval by the owner is required — via the proposal
# flow (app.assistant_execution), or the owner's stored per-action
# opt-out for their own requests (DESIGN.md §5.3).
NEEDS_SECOND_APPROVAL: tuple[WriteAction, ...] = (
    WriteAction("expense.create", "POST", "/api/v1/businesses/{business_id}/expenses", "STAFF", True),
    WriteAction("invoice.update", "PATCH", "/api/v1/businesses/{business_id}/invoices/{invoice_id}", "STAFF", True),
    WriteAction("invoice.issue", "POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/issue", "OWNER", True),
    WriteAction("invoice.void", "POST", "/api/v1/businesses/{business_id}/invoices/{invoice_id}/void", "OWNER", True),
    WriteAction("payment.record", "POST", "/api/v1/businesses/{business_id}/payments", "OWNER", True),
    WriteAction("stock.movement", "POST", "/api/v1/businesses/{business_id}/stock-movements", "OWNER", True),
    WriteAction("purchase_order.approve", "POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/approve", "OWNER", True),
    WriteAction("purchase_order.receive", "POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive", "OWNER", True),
    WriteAction("purchase_order.cancel", "POST", "/api/v1/businesses/{business_id}/purchase-orders/{order_id}/cancel", "OWNER", True),
    WriteAction("sales_return.approve", "POST", "/api/v1/businesses/{business_id}/sales-returns/{return_id}/approve", "OWNER", True),
    WriteAction("credit_note.issue", "POST", "/api/v1/businesses/{business_id}/sales-returns/{return_id}/credit-note", "OWNER", True),
    WriteAction("recurring_invoice.create", "POST", "/api/v1/businesses/{business_id}/recurring-invoices", "OWNER", True),
    WriteAction("pricing_rule.create", "POST", "/api/v1/businesses/{business_id}/pricing-rules", "OWNER", True),
    WriteAction("payroll.create", "POST", "/api/v1/businesses/{business_id}/employees/{employee_id}/payroll", "OWNER", True),
    WriteAction("payroll.approve", "POST", "/api/v1/businesses/{business_id}/payroll/{payroll_id}/approve", "OWNER", True),
    WriteAction("payroll.pay", "POST", "/api/v1/businesses/{business_id}/payroll/{payroll_id}/pay", "OWNER", True),
    WriteAction("payroll.update", "PATCH", "/api/v1/businesses/{business_id}/payroll/{payroll_id}", "OWNER", True),
    WriteAction("data_import.create", "POST", "/api/v1/businesses/{business_id}/imports/{entity_type}.csv", "OWNER", True),
    WriteAction("notification.create", "POST", "/api/v1/businesses/{business_id}/notifications", "OWNER", True),
)

# Everything else is FORBIDDEN for the assistant, always: every
# DELETE, every membership/invitation/role change, every platform
# action, settings, business/account deletion, and employee records.
# They are not listed here on purpose — the closed list is the whole
# policy, and anything outside it is forbidden by default.

_BY_ACTION = {item.action: item for item in ASSISTANT_WRITABLE + NEEDS_SECOND_APPROVAL}


class AssistantWriteForbidden(Exception):
    """Raised when the assistant is asked to execute a forbidden write."""


class AssistantWriteNeedsApproval(Exception):
    """Raised when a write needs a second owner approval first."""


class AssistantWriteRoleDenied(Exception):
    """Raised when the caller's role cannot execute the write."""


_ROLE_RANK = {"STAFF": 1, "OWNER": 2}


def verdict(action: str, caller_role: str, *, second_approved: bool = False) -> WriteAction:
    """The governance verdict for an assistant write request.

    Returns the WriteAction when the execution may proceed, else
    raises the matching exception. The caller is the assistant's
    execution path; it must pass the role of the user who asked.
    """
    item = _BY_ACTION.get(action)
    if item is None:
        raise AssistantWriteForbidden(
            f"assistant write action '{action}' is not in the closed list"
        )
    if _ROLE_RANK.get(caller_role, 0) < _ROLE_RANK[item.min_role]:
        raise AssistantWriteRoleDenied(
            f"assistant write action '{action}' requires {item.min_role}"
        )
    if item.second_approval and not second_approved:
        raise AssistantWriteNeedsApproval(
            f"assistant write action '{action}' requires a second owner approval"
        )
    return item


def is_forbidden(action: str) -> bool:
    return action not in _BY_ACTION


def requires_second_approval(action: str) -> bool:
    item = _BY_ACTION.get(action)
    return bool(item and item.second_approval)
