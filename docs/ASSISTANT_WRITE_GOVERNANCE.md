# Assistant write governance (B6 — 3A-724)

## 0. The state today (the honest starting point)

The assistant executes **only through the proposal flow**
(`backend/app/assistant_execution.py`, Slice 1): a proposal binds
an action to its exact payload, a sensitive action needs a second
owner approval (or the owner's stored per-action opt-out, §3.5),
execution runs through `verdict()` in the caller's own role, and
every execution writes `assistant.action_executed`. The chat
endpoint itself stays read-only: it has no tool calls, no function
calling, and its system prompt forbids claiming an execution. The
API as a whole exposes 50 write endpoints (34 POST + 8 PATCH +
2 PUT + 6 DELETE) — the matrix below classifies all of them.

This governance ships **as code**
(`backend/app/assistant_write_policy.py`, enforced by
`backend/tests/test_assistant_write_policy.py` and the proposal
lifecycle tests in `backend/tests/test_assistant_execution.py`).

## 1. The closed list (the whole policy)

An action not named here is **forbidden by default**. The list is
deliberately small: drafts and directory records only.

### ALLOWED — no second approval (caller's role, reversible)

| Action | Route | Min. role |
|---|---|---|
| customer.create | POST …/customers | STAFF |
| supplier.create | POST …/suppliers | STAFF |
| product.create | POST …/products | STAFF |
| customer.update | PATCH …/customers/{id} | STAFF |
| invoice.create (draft) | POST …/invoices | STAFF |
| invoice.update_draft | PATCH …/invoices/{id} | STAFF |
| invoice.duplicate | POST …/invoices/{id}/duplicate | STAFF |
| purchase_order.create (draft) | POST …/purchase-orders | STAFF |
| purchase_order.duplicate | POST …/purchase-orders/{id}/duplicate | STAFF |
| sales_return.create | POST …/sales-returns | STAFF |

### NEEDS_SECOND_APPROVAL — owner confirms before execution

Money-posting, commitment, or large-blast-radius writes. They
execute only after a second owner approval through the proposal
flow (§3), or the owner's stored per-action opt-out (§3.5).

| Action | Route | Min. role |
|---|---|---|
| expense.create | POST …/expenses | STAFF |
| invoice.update | PATCH …/invoices/{id} | STAFF |
| invoice.issue / invoice.void | POST …/invoices/{id}/issue, /void | OWNER |
| payment.record | POST …/payments | OWNER |
| stock.movement | POST …/stock-movements | OWNER |
| purchase_order.approve / .receive / .cancel | POST …/purchase-orders/{id}/… | OWNER |
| sales_return.approve / credit_note.issue | POST …/sales-returns/{id}/… | OWNER |
| recurring_invoice.create / pricing_rule.create | POST … | OWNER |
| payroll.create / .approve / .pay / .update | POST/PATCH …/payroll/… | OWNER |
| data_import.create | POST …/imports/{entity}.csv | OWNER |
| notification.create | POST …/notifications | OWNER |

Note on `invoice.update` (formal B6 amendment, owner decision
2026-11-25, DESIGN.md §7.3): the execution path maps the action to
`invoice.update_draft` (ALLOWED, above) **only when the target
invoice is a draft**; an issued invoice stays `invoice.update` in
this table. The amendment was made by a policy change with a test
(`test_draft_invoice_edit_is_allowed_without_second_approval`),
not silently. Honest limit: the invoice PATCH route edits drafts
only, so an approved issued-invoice edit fails closed at dispatch
with the route's own error — the proposal response warns about
this instead of pretending the edit will succeed.

### FORBIDDEN — never, even with approval

Every DELETE; every membership / invitation / role change; every
platform-admin action; settings changes; business and account
deletion; employee records. They are not listed in the policy
module on purpose — the closed list is the whole policy.

## 2. Role-bounded execution

The assistant executes **only with the role of the user who
asked** — never more. A STAFF caller can never execute an
OWNER-only write, even one in the ALLOWED class; the verdict
function (`verdict(action, caller_role, second_approved=…)`)
enforces the same minimal role the underlying route already
requires (from the route × role × tenant matrix). The assistant
has no service identity of its own and no way to act as the
platform, an owner, or another business.

## 3. Second approval — the flow (built in Slice 1)

1. The assistant **proposes**: it shows the exact action and
   payload (the draft invoice, the payment amount, the stock
   movement) and executes nothing. The payload is validated,
   canonicalized and hashed at creation, stored server-side, and
   never changes afterwards.
2. The business **owner confirms** with a second, separate action:
   a different owner than the requester approves, bound to the
   exact payload hash (a mismatched hash is a 409). Only the
   requester or the approver may then execute, in their own role.
3. Execution runs through `verdict()` with `second_approved=True`
   and writes an audit event naming the assistant as the actor
   (`assistant.action_executed`, with the approving owner in the
   record) — so every assistant write is attributable to both the
   asker and the approver.
4. An approval is one use and expires 5 minutes after proposal
   creation (owner decision 2026-11-25): the whole proposal
   lifecycle shares that one deadline, and expiry is derived on
   read, never lazily written. A failed execution does not burn
   the approval — the proposal stays approved and retryable
   inside the window. An approval never covers a different
   action: it records the effective action it was granted for
   (draft vs issued invoice update), and execution re-resolves
   and requires a match. Precedent in the code: payroll approval
   already requires a *different* owner than the creator (409) —
   separation of duties is the established shape; the approval
   flow follows it.

### 3.5 "Don't ask again" — the owner's per-action opt-out

Formal B6 amendment (owner decision 2026-11-25, DESIGN.md §5.3):
an owner may record an explicit, stored waiver of the
second-approval **question** for any of the 19 actions
(`POST /assistant/confirmation-opt-outs`; revocable at any time,
`DELETE /assistant/confirmation-opt-outs/{action}`; listed by
`GET /assistant/confirmation-opt-outs`). The waiver covers only
the question:

- It applies **only to the owner's own requests**: a staff
  member's money action always needs a live owner approval.
  An opt-out is never a standing pre-authorization for someone
  else's requests.
- Role, payload binding and audit still apply. Opt-out changes
  are themselves audited (`assistant.opt_out_created` /
  `assistant.opt_out_deleted`).

## 4. Computer-use policy — NOT permitted

حسو has **no computer-use capability and must not gain one
without an owner decision**:

- No browser control, no screenshots, no screen reading, no
  mouse/keyboard automation, no OS access, no credential access.
- The assistant's only tools are the API routes in the closed
  list (§1). It cannot open a page, download a file, or touch
  anything outside the API.
- The codebase contains no computer-use footprint today (no
  Playwright/Selenium/automation in the backend; the only grep
  hits are an unrelated skeleton component).
- Any future computer-use proposal is an owner-reserved decision
  and must arrive with its own policy — it is not covered by this
  document.

## 5. Enforcement points

- **Code:** `app/assistant_write_policy.py` — `verdict()` is the
  single gate the execution path calls; `is_forbidden()` and
  `requires_second_approval()` classify any action. The execution
  path itself is `app/assistant_execution.py` (proposals, approvals,
  dispatch, opt-outs), exposed by the 8 execution endpoints on the
  assistant router.
- **Tripwire test:** `test_assistant_write_policy.py` asserts the
  assistant router exposes exactly `POST /chat` plus the 8 execution
  routes, each delegating to `app.assistant_execution` — adding a
  direct-write endpoint fails the suite until it is routed through
  the policy.
- **Review rule:** any new assistant write action needs a policy
  entry + a test + QA review. A policy change is a governance
  change, not a code tweak.
