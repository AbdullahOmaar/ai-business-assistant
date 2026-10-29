# Credit notes, refunds, and customer returns — lifecycle contract

Status: PARTIALLY COMPLETE for Feature 31. The API supports immutable credit-note issuance from an approved sales return, paginated credit-note reads, and a business-scoped paginated sales-return listing. The Angular workspace can create return drafts from issued invoice lines, lets owners approve draft returns, lists approved returns and issued notes, supports customer-filtered offset pagination, and provides an OWNER-only credit-application form constrained by remaining credit and invoice receivable. The backend has an OWNER-only idempotent credit-application ledger API, paginated reads, applied/remaining totals, and customer-statement events for applied credits. Cash-refund records are implemented as an explicit OWNER-only ledger with idempotency, remaining-credit limits, and optional original-payment linkage that refuses to consume allocated receipts. The bilingual workspace now exposes an OWNER-only refund form and displays the latest loaded refund records per note. Remaining: full refund-history pagination, line-level tax allocation/reversal, P&L/tax report integration, and exact-head validation.

## Existing behavior confirmed in source

- SalesReturn and SalesReturnLine represent a return request and its invoice-line quantities/amounts.
- Draft return creation checks the original issued invoice and calculates a discounted line amount before tax. Approval is OWNER-only, locks the return and invoice, serializes competing approvals by locking the invoice, checks cumulative returned quantities/amounts, and writes stock-return movements for tracked products.
- An approved return is **not** automatically a receivable credit or a cash refund. Credit-note issuance and a separate explicit credit-application action are now represented as separate records. Neither action records a cash refund. Customer statements and reports must continue disclosing this gap.
- Issued invoice totals are historical records and must not be edited to simulate a credit note.
- Payment allocations are separate records and are currency/customer constrained. Unallocating a payment is not the same as refunding cash.

## Required lifecycle

1. **Draft sales return** — references one issued invoice in the same business; every line references an invoice line on that invoice; amounts are derived server-side from stored invoice snapshots, not client-supplied totals.
2. **Approve return** — OWNER-only, transactionally locks the invoice/return/lines, enforces remaining quantities and amounts, and posts stock restoration exactly once where applicable.
3. **Issue credit note** — OWNER-only, idempotent, immutable after issue, references the approved return and original invoice/customer/currency. Current implementation blocks invoices with non-zero tax until tax can be allocated to return lines; this is deliberate to prevent an under-valued credit note. A unique constraint prevents multiple notes for one return.
4. **Apply credit to receivable** — record a distinct credit allocation against the original customer's receivable. Never create a negative payment or rewrite invoice totals. Enforce same business, customer, and currency, plus a ceiling against the credit-note remainder.
5. **Refund cash** — a separate, auditable cash-out record tied to the credit note and, where applicable, the original payment. Require an idempotency key and server-side amount ceiling; a refund must not silently unallocate/reuse a payment or double-credit receivables.
6. **Read/report** — customer statements, receivables aging, P&L and tax summaries must show credits/refunds distinctly and only net amounts when their accounting meaning is defined. Until tax allocation and revenue treatment are implemented, show gross invoice and approved-return/credit-note figures separately with clear caveats.

## Invariants and release gates

- All reads and writes are scoped by business_id; references to invoice, customer, payment, allocation, return, and product must be validated server-side.
- Currency is copied from the original invoice and cannot be client-overridden.
- Use Decimal arithmetic and explicit rounding; never trust client-supplied totals or statuses.
- Preserve original invoice and payment history. Corrections use compensating records, never destructive edits.
- Approval/issue/refund operations must be atomic, replay-safe, and audited. Failed or replayed requests must not duplicate stock, receivable credit, or cash-out.
- The implementation has migrations `0006_credit_notes`, `0007_credit_applications`, and `0008_cash_refunds`; OWNER-only issuance/application/refund operations; paginated reads; applied/refunded/remaining totals; invoice-list and receivables-aging balances that subtract valid applied credits; and customer-statement events for credit applications and informational cash refunds. Cash refunds require the original issued invoice receivable to be fully settled, share the credit-note balance ceiling with credit applications, and if linked to a payment require that payment to be allocated to the original invoice and have enough unallocated cash after prior refunds. The bilingual Angular workspace supports return drafts, approval, credit issuance, customer filtering/pagination, credit application, and cash refund recording/history. Line-level tax allocation is now supported for invoices created/edited after migration `0009_invoice_tax_snapshots`; legacy tax invoices without persisted line snapshots remain blocked safely. Remaining: P&L/tax report integration, complete refund-history pagination, and exact-head validation.
- Added `backend/tests/test_credit_note_regressions.py` coverage for credit-note issuance/replay, original invoice immutability, unapproved-return rejection, tax guard/no side effects, OWNER-only denial, cross-business isolation, business-scoped listing/customer filtering, credit application replay, credit and receivable ceilings, customer matching, staff denial, and application listing. The idempotency key is rechecked after acquiring the credit-note lock. Tests are authored but **NOT RUN** on the current head; they do not constitute a passing test result.
- Do not expose “refund complete” until a persisted cash-out record is committed. A credit note alone does not prove cash was returned.
- Latest focused backend/frontend regression additions cover credit application idempotency, amount/customer/currency/tenant authorization, invoice outstanding limits, applied-credit statement and aging behavior, and UI retry/pagination guards. These latest tests/build/browser checks are **NOT RUN** while the user-requested runner-limit pause remains active. Older sandbox results do not verify the current head.

## Implementation progress

- Added `CreditNote` schema and migration `0006_credit_notes`.
- Added OWNER-only `POST /api/v1/businesses/{business_id}/sales-returns/{return_id}/credit-note`. It accepts no client-supplied amount/currency/customer, requires an approved return and issued invoice with a linked customer, rejects zero-value returns, uses a deterministic credit-note number, records the actor and an audit event, and re-checks after locking the return so concurrent retries do not create a second note.
- Database uniqueness prevents more than one credit note per sales return and duplicate credit-note numbers within a business.
- Credit application is now a separate OWNER-only, idempotent, audited ledger operation. It reduces the eligible invoice receivable without mutating the invoice total; it does not assert that cash was refunded.

## Safe implementation order

A. Credit-note, credit-application, and cash-refund schemas/migrations are implemented (`0006`–`0008`). Next: implement line-level tax allocation/reversal without deriving tax from unsupported assumptions; keep credit application and cash refund mutually bounded and semantically distinct.
B. Add transactional OWNER-only service operations and append-only audit events.
C. Add read/list endpoints and a UI that distinguishes draft return, approved return, issued credit, applied credit, and refunded cash.
D. Integrate customer statement and reports only after the ledger semantics are represented explicitly.
E. Resume tests and exact-head CI only after the user clears the current testing-limit pause.


## Feature 31 UI/API checkpoint — 2026-10-29

- Added `GET /api/v1/businesses/{business_id}/sales-returns` with membership authorization, status filter, stable newest-first ordering, and bounded pagination.
- Added Angular `salesReturns()` client contract and standalone bilingual credit-note workspace. The component now invalidates stale workspace-refresh and invoice-detail responses to prevent old selections from overwriting current UI state; source-level regression assertions were added.
- UI validates return quantities, lets workspace members create drafts, and exposes approval/issuance controls only to OWNER. The API's authorization and quantity checks remain authoritative. The component is deferred into a lazy chunk (21.23 kB).
- UI explicitly states that a credit note is not a cash refund and does not mutate the original invoice. Tax-bearing invoices remain blocked until line-level tax allocation is implemented.
- Focused backend tests: 8 passed in an assembled sandbox with selected branch source files refreshed; not a full checkout. Frontend unit tests: 58 passed. Angular production build: PASS; measured initial bundle 709.13 kB (9.13 kB above the 700 kB target), with existing optional-chain warnings. `prebuild` could not determine a commit SHA because the sandbox had no `.git`.
- Exact-head CircleCI and authenticated browser smoke remain NOT RUN / BLOCKED. No merge, deployment, or version change was performed.

- Remaining Feature 31 gaps: line-level tax allocation/reversal, P&L/tax report integration, complete refund-history pagination, and exact-head validation. Credit applications and cash refunds are separate audited records; the cash-refund endpoint rejects an unsettled original receivable and refuses to reuse credit already applied or refunded.


- Frontend follow-up: added a customer selector for the issued credit-note list; the selected customer is sent to the business-scoped API filter and the list now displays customer names instead of abbreviated IDs. On a failed filtered refresh, stale credit-note rows are cleared so a previous customer's results cannot be mistaken for the selected filter. Added source-level regression assertions for the filter and stale-result guard. These latest UI/test edits are **NOT RUN**; prior sandbox results above predate this head and do not verify them.

- Frontend pagination follow-up: the credit-note list now loads additional pages in batches of 100, preserves the active customer filter, ignores responses for a changed workspace/filter, and deduplicates rows by note ID. Source-level assertions were added. This pagination change and its assertions are **NOT RUN**.
- Credit-application UI follow-up: OWNERs can choose an issued receivable for the same customer/currency, apply an amount bounded by the displayed remaining credit and invoice outstanding amount, and see applied/remaining totals. Exact retries retain the same idempotency key for the same note/invoice/amount tuple; source-level tests cover this behavior and amount/customer/currency guards. Latest UI/test changes are **NOT RUN**.
- Cash-refund follow-up: added migration `0008_cash_refunds`, an append-only refund model, OWNER-only idempotent create endpoint and business-scoped paginated read endpoint. Refunds share the credit-note ceiling with applications; when tied to an original payment, refunds cannot exceed the receipt balance left after allocations and earlier refunds. Credit-note list responses now include refunded totals and subtract both applications and refunds from remaining credit. Tests cover replay/audit, credit ceiling, allocated-payment protection, and staff denial; latest tests are **NOT RUN**.
- Cash-refund UI follow-up: added bilingual OWNER-only amount/method/reference entry, explicit separation from receivable credit, recent refund history per note, and stable idempotency-key reuse for exact retries. Source-level tests assert owner-only UI wiring and retry behavior; these tests are **NOT RUN**.

- Frontend credit-application follow-up: added a workspace form for owners to apply a credit note to an issued invoice belonging to the same customer and currency, with client-side amount caps, a stable idempotency key across retries, applied/remaining balance display, and explicit no-cash-refund messaging. Added source-level regression assertions. These latest API-client/UI/test changes are **NOT RUN**; earlier test/build results do not verify this head.


## Cash-refund safety follow-up — 2026-10-29

- Cash refunds are only accepted when the original issued invoice receivable is fully settled by matching-currency payments and explicit credit applications. For open receivables, apply the credit instead of paying cash out.
- When a refund references a payment, that payment must belong to the credit-note customer, match currency, be allocated to the original invoice, and have enough unallocated cash after prior refunds. Mismatched-currency allocations do not count as settlement.
- Customer statements show cash refunds as informational events with no additional receivable-balance effect; the credit note's remaining balance is reduced by both applications and refunds.
- Regression tests were added/updated for settled-invoice requirements, linked-payment allocation ceilings, refund idempotency, and statement disclosure. These latest tests/build/CI/browser checks remain **NOT RUN / BLOCKED** on the current head due the runner-limit pause and failing/inaccessible CI; do not claim verified completion.


## Tax snapshot follow-up — 2026-10-29

- Migration `0009_invoice_tax_snapshots` persists the invoice tax-rate snapshot, per-line taxable base/tax, return-line tax, return tax total, and credit-note subtotal/tax total. Existing credit notes are backfilled with subtotal=total and tax_total=0 because the previous issuance guard only permitted zero-tax notes.
- New and edited draft invoices allocate the persisted header tax total across discounted taxable line bases with deterministic largest-remainder cent allocation. Approved partial returns allocate each line's tax cumulatively so repeated returns cannot exceed the source line's tax snapshot.
- Historical tax invoices with missing line-level snapshots remain blocked; the implementation does not infer tax rates or backfill tax from an aggregate header total.
- Regression coverage was added for exact allocation, taxed credit-note issuance, legacy tax invoice blocking, and cumulative partial-return rounding. These latest tests/build/CI/browser checks remain **NOT RUN / BLOCKED**; do not infer a pass from source changes.
