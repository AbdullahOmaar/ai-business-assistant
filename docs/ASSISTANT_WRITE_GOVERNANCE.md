# Assistant write governance (B6 — 3A-724)

## 0. The state today (the honest starting point)

The assistant executes **nothing**. Its only endpoint is
`POST /api/v1/businesses/{business_id}/assistant/chat`, a
question-answering endpoint; it has no tool calls, no function
calling, and no write path, and its system prompt forbids claiming
an execution. The API as a whole exposes 50 write endpoints
(34 POST + 8 PATCH + 2 PUT + 6 DELETE) — the matrix below classifies
all of them for the day execution is built (plan tasks D2/B7).

This task ships the governance **as code**
(`backend/app/assistant_write_policy.py`, enforced by
`backend/tests/test_assistant_write_policy.py`) plus this policy —
not a promise that execution exists.

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
| invoice.duplicate | POST …/invoices/{id}/duplicate | STAFF |
| purchase_order.create (draft) | POST …/purchase-orders | STAFF |
| purchase_order.duplicate | POST …/purchase-orders/{id}/duplicate | STAFF |
| sales_return.create | POST …/sales-returns | STAFF |

### NEEDS_SECOND_APPROVAL — owner confirms before execution

Money-posting, commitment, or large-blast-radius writes. The
approval flow does not exist yet, so today these cannot execute
either — the class exists so the flow is built to this list, not
invented later.

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

Note on `invoice.update`: the route does not distinguish a draft
from an issued invoice, so the whole action sits behind second
approval. When the approval flow is built, draft edits may move to
ALLOWED — by a policy change with a test, not silently.

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

## 3. Second approval — the design (to be built in D2/B7)

1. The assistant **proposes**: it shows the exact action and
   payload (the draft invoice, the payment amount, the stock
   movement) and executes nothing.
2. The business **owner confirms** with a second, separate action
   (an approval token bound to that exact proposal — the payload
   cannot change between proposal and execution).
3. Execution runs through `verdict()` with `second_approved=True`
   and writes an audit event naming the assistant as the actor
   (`assistant.action_executed`, with the approving owner in the
   record) — so every assistant write is attributable to both the
   asker and the approver.
4. An approval expires (one use, short lifetime) and never covers
   a different action. Precedent in the code: payroll approval
   already requires a *different* owner than the creator (409) —
   separation of duties is the established shape; the approval
   flow follows it.

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
  single gate the future execution path must call; `is_forbidden()`
  and `requires_second_approval()` classify any action.
- **Tripwire test:** `test_assistant_write_policy.py` asserts the
  assistant router exposes only `POST /chat` — adding an execution
  endpoint fails the suite until it is routed through the policy.
- **Review rule:** any new assistant write action needs a policy
  entry + a test + QA review. A policy change is a governance
  change, not a code tweak.
