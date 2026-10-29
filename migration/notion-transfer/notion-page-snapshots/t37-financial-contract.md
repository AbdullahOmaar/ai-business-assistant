# Notion source snapshot: T37 — MASTER: Shared financial contracts & integration boundaries

- Source: https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd?pvs=204
- Page ID: 407bbf2b-c2c5-8173-b263-eb8c4deeedfd
- Last edited reported by Notion: 2026-10-29T00:28:03.516Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd as of 2026-10-29T00:28:03.516Z:
<page url="https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd">
<page-discussions discussion-count="1" url="pageDiscussions://407bbf2b-c2c5-8173-b263-eb8c4deeedfd">

</page-discussions>

<ancestor-path>
<parent-data-source url="collection://6d386e1d-2db9-49e7-82c1-abe0029d033d" name="AI Business Assistant — Master Task Plan"/>
<ancestor-2-database url="https://app.notion.com/p/fa973d231ebc4c3da23b1eeeb53ae95f" title="AI Business Assistant — Master Task Plan"/>
<ancestor-3-page url="https://app.notion.com/p/407bbf2bc2c581aeae3cdd3282cd3366" title="06 — Delivery / QA / Release"/>
<ancestor-4-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-5-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"Acceptance Criteria":"Publish and approve the shared financial contract for money/currency/rounding, source transactions, lifecycle states, audit/idempotency, stock movement and expense/payroll posting, tenant/role authorization, migrations/rollback and reconciliation. An evidence-based draft was appended 2026-10-29; remaining decisions are explicitly listed. Do not mark approved until Master review and required owner decisions are recorded.","Dependencies":"Reconcile live main, [TASKS.md](http://TASKS.md), open PRs/issues, current invoices/payments, purchasing/receiving, expenses/reports and employee/payroll code before locking interfaces.","Execution Order":37,"Feature Owner / Chat":"Master — Product & Release","GitHub / Evidence":"https://github.com/AbdullahOmaar/ai-business-assistant/commit/c464398e0a6ace77eba32aabfbdbd09091f53999","Phase":"Phase 1 - Security & release safety","Priority":"P0 - Release blocker","Status":"In progress","Task name":"T37 — MASTER: Shared financial contracts & integration boundaries","User Action Required":"__NO__","Workstream":"Operations","date:Due:is_datetime":0,"url":"https://app.notion.com/p/407bbf2bc2c58173b263eb8c4deeedfd"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
## Objective

Define and approve the shared contract that prevents the four feature chats from creating incompatible financial records, migrations, APIs, status machines or reporting formulas.

## Required outputs

- [ ] Current baseline verified: main SHA, existing task queue, PRs/branches/issues, routes/models/migrations and CI evidence.
- [ ] Monetary contract: currency per record, decimal-safe amounts, rounding, server-side totals, and explicit policy for discount/tax fields without inventing jurisdiction rules.
- [ ] Source-record contract: invoice/payment/allocation, credit-note/refund, stock movement, supplier bill/payable/payment, expense, payroll run/payment, and reversal/correction relationships.
- [ ] State-transition convention and distinction between recorded/approved/issued/paid/reversed states.
- [ ] Common audit metadata and idempotency/transaction boundaries for financial writes.
- [ ] Tenant isolation and OWNER/STAFF permission map for every new or changed endpoint.
- [ ] Inventory stock side-effect contract across invoice issue/return and purchase receiving/return.
- [ ] Expenses/report integration contract so supplier costs and payroll are posted once and cash-flow metrics derive from actual payments.
- [ ] Migration ownership, ordering, downgrade/rollback considerations, and deterministic test database requirements.
- [ ] Document unresolved decisions and obtain product-owner input only where material business policy is genuinely ambiguous.

## Guardrails

No production data changes, no live migration, no secret access or exposure, no production deployment, and no bypass of repository review/check requirements. Inspect before changing. Keep exactly one active branch for this coherent master contract/coordination work if code/docs must change; reuse a suitable existing branch/PR when possible. Do not create branches just for individual subtasks.

## Acceptance

The four feature owners can implement against stable and reviewed interfaces; representative financial scenarios are written as executable tests or clear test cases; security and financial semantics are documented; every dependent feature has an explicit go/no-go gate and owner. This task does not itself imply any feature or production release is complete.

## Master contract draft — evidence-based baseline (29 Oct 2026)

<b>Status: PARTIALLY COMPLETE — proposed interfaces and invariants recorded for review; not yet marked approved.</b> Source inspected at <code>main</code> SHA <code>c464398e0a6ace77eba32aabfbdbd09091f53999</code>: <code>backend/app/models.py</code>, <code>backend/app/services.py</code>, <code>backend/app/domain_rules.py</code>, <code>backend/app/api.py</code>, <code>backend/app/extended_api.py</code>, <code>backend/app/employee_payroll_api.py</code>, and migration <code>0005_employee_payroll.py</code>.

### 1. Money, currency and rounding

- Monetary amounts are <code>Decimal</code> / <code>NUMERIC(14,2)</code>; quantity is <code>NUMERIC(14,3)</code>. Never use binary float for monetary arithmetic. Use the existing <code>money()</code> helper's explicit <code>ROUND_HALF_UP</code> to cents.
- Normalize currency codes to uppercase three-letter codes. Every invoice, payment, expense, purchase order, payroll posting, and reporting aggregate must carry or inherit a clearly defined currency. Never sum different currencies; no implicit FX conversion. FX conversion requires a separately approved rate source, timestamp, and rounding policy.
- Existing invoice calculation rounds each line first, sums the rounded lines into subtotal, calculates discount on subtotal, then tax on the discounted subtotal, rounding each monetary result to cents. Keep this deterministic and test it. Do not infer jurisdiction-specific tax/legal rules; the current <code>tax_rate</code> is a supplied percentage and policy remains configurable/explicit.
- Client totals, payment state, payroll net pay, stock balances, and report metrics are untrusted. Recalculate/validate server-side.

### 2. Source events and authoritative reporting

- <b>Invoice issued ≠ cash received.</b> Invoice totals and statuses describe the sale/receivable source. A <code>Payment</code> is a recorded receipt; <code>PaymentAllocation</code> links that receipt to invoices. Cash collected comes from valid recorded payments, not invoice totals.
- Outstanding receivable per issued invoice is <code>invoice total - valid allocations</code>, grouped by invoice currency. Negative balances are integrity errors to flag, not silently clamp away.
- An <code>Expense</code> currently records an incurred cost (<code>amount</code>, <code>currency_code</code>, <code>incurred_at</code>) but has no approved/settled/payment lifecycle. Do not label all expenses as cash paid until a separate settlement event/state is approved and implemented.
- A <code>PurchaseOrder</code>/receipt is not a supplier bill or supplier payment. Stock receiving and supplier liability/payment must be distinct source events. Do not double-count a purchase as both an expense and COGS without an approved accounting policy.
- Payroll approved ≠ paid. Current payroll has draft/approved/paid and a unique <code>expense_id</code>; the paid transition must create/link its expense once, within the same transaction. Failed, reversed and corrected states are not currently represented by migration <code>0005</code> and require an explicit lifecycle/migration design before implementation.
- Current invoice statuses are draft/issued/void; current PO statuses are draft/approved/partially\_received/received/cancelled. Sales returns exist, but a full credit-note/refund/payment-reversal lifecycle is not established by the inspected source. Do not invent routes or report those events as complete.

### 3. State transitions, idempotency and transaction boundary

- Keep state changes explicit and server-validated; reject invalid transitions and preserve audit evidence. Corrections to issued/paid records must use an approved compensating event (return/credit/refund/reversal), not silently rewrite historical money events.
- Each money-moving workflow must validate all references, tenant/customer/currency matches, available/outstanding amounts, and duplicate requests before commit. A failure must roll back both business rows and audit rows; retries must not double-post.
- <code>record_payment</code> currently has a business-scoped idempotency key and replay validation. Extend equivalent idempotency/uniqueness to any new refund, supplier payment, payroll payout, and settlement operation before exposing it.
- Use one database transaction for each state transition and its dependent stock/expense/allocation/audit writes. Add concurrency tests for simultaneous allocation, return, receive and payroll-paid retries. Existing database uniqueness is defense-in-depth, not a replacement for authorization or workflow validation.

### 4. Stock, tenant and audit invariants

- <code>StockMovement</code> is append-only; stock is derived from signed <code>quantity_delta</code> (positive adds, negative removes). Current movement types: opening, receipt, sale, return, adjustment. Invoice issue atomically deducts tracked stock; voiding an issued invoice is disallowed when allocations or approved returns exist and must restore stock only under the validated workflow.
- All reads/writes are scoped to authenticated principal + business membership on the server. Composite foreign keys enforce business consistency for invoice lines, payments/allocations, purchase orders/lines, stock movements, and payroll/expense links. Never trust a client-supplied <code>business_id</code>, actor, role, or owner identity.
- Financial writes record a redacted <code>AuditEvent</code> with actor, action, target type/id, summary and timestamp. Never log salary/payslip content, secrets, tokens, or unnecessary personal data. Denied or invalid requests must not leave business-state or audit side effects unless a separate security-event policy explicitly says otherwise.

### 5. Required go/no-go tests

- Decimal rounding at half-cent boundaries; multi-line discounts/tax; negative/oversized/invalid currency inputs; EGP/USD separation.
- Invoice draft/issue/void transitions; stock deduction/restore atomicity; issued invoice with allocation/approved return cannot be voided.
- Payment exact replay succeeds without duplicate rows; same key with changed payload rejects; wrong tenant/customer/currency, overpayment, duplicate invoice allocation, and concurrent allocation reject without partial writes.
- Return quantities/discount allocation cannot exceed original invoiced line; duplicate/concurrent returns do not over-return or double-restore stock.
- Expense incurred vs paid distinction; supplier PO/receipt vs payable/payment distinction; payroll approval vs payment, exactly-once expense link, duplicate paid retries, and reversal semantics.
- OWNER/STAFF and cross-tenant tests for every changed endpoint; no-write/no-audit assertions on rejected requests; migration upgrade/downgrade or documented irreversible migration handling.

### 6. Decisions still required before dependent schema/API changes

1. Whether to adopt a minimal explicit payment/refund/credit-note model or extend existing payment/allocation records; define whether unallocated receipts are allowed and how they are represented.
2. Supplier liability/payment lifecycle and whether purchase receiving creates inventory cost only, a payable, or both (must avoid double-counting).
3. Expense approval/settlement semantics needed to distinguish incurred expense from actual cash outflow.
4. Payroll payout failure/reversal/correction and immutable salary snapshot rules; no legal/tax compliance claims without separately verified requirements.
5. Whether any FX conversion is in scope; default is <b>no conversion</b>.
6. Repository release gate: <code>main</code> currently reports <code>protected: false</code> and required-check enforcement off; configure protection only after authorized repository-settings approval.

<b>Next action:</b> Master reviews this draft against current tests and the remaining route/model inventory, records owner decisions only for the six open points above, then marks T37 approved and releases dependent feature work. Until then, T38/T39/T40/T41 may perform independent inventories/tests but must not lock conflicting shared contracts. Local tests/build/security were NOT RUN in this Notion sync.
</content>
</page>

<parent-data-source-schema url="collection://6d386e1d-2db9-49e7-82c1-abe0029d033d">
The SQLite table definition for this page's parent data source. Use these column names and option values to set this page's properties, create sibling pages, or query the data source.
<sqlite-table>
CREATE TABLE IF NOT EXISTS "collection://6d386e1d-2db9-49e7-82c1-abe0029d033d" (
	url TEXT UNIQUE,
	createdTime TEXT, -- ISO-8601 datetime string, automatically set. This is the canonical time for when the page was created.
	"Execution Order" FLOAT,
	"Priority" TEXT, -- one of ["P0 - Release blocker", "P1 - MVP required", "P2 - Operational hardening", "P3 - Future enhancement"]
	"Dependencies" TEXT,
	"Workstream" TEXT, -- one of ["Security & tenancy", "CI & release", "Invoices & payments", "AI assistant", "Mobile UX", "Operations", "Product expansion", "Inventory & purchasing", "Expenses & reports", "Employees & payroll"]
	"User Action Required" TEXT, -- "__YES__" = true, "__NO__" = false, NULL defaults to false
	"Phase" TEXT, -- one of ["Phase 0 - Verify baseline", "Phase 1 - Security & release safety", "Phase 2 - Core workflows", "Phase 3 - Mobile & AI", "Phase 4 - Production readiness", "Phase 5 - Future roadmap"]
	"Acceptance Criteria" TEXT,
	"Feature Owner / Chat" TEXT, -- one of ["Master — Product & Release", "Chat 1 — Sales & Payments", "Chat 2 — Inventory & Purchasing", "Chat 3 — Expenses & Reports", "Chat 4 — Employees & Payroll"]
	"GitHub / Evidence" TEXT,
	"Task name" TEXT,
	"Assignee" TEXT, -- JSON array of zero or more user IDs
	"Status" TEXT, -- one of ["Not started", "Blocked", "In progress", "Ready for verification", "Done", "Archived"] Default: "Not started".
	"date:Due:start" TEXT, -- ISO-8601 date or datetime string. Use the expanded property (date:<column_name>:start) to set this value.
	"date:Due:end" TEXT, -- ISO-8601 date or datetime string, can be empty. Must be NULL if the date is a single date, and must be present if the date is a range. Use the expanded property (date:<column_name>:end) to set this value.
	"date:Due:is_datetime" INTEGER -- 1 if the date is a datetime, 0 if it is a date, NULL defaults to 0. Use the expanded property (date:<column_name>:is_datetime) to set this value.
)
</sqlite-table>
</parent-data-source-schema>
