# Credit notes, refunds, and customer returns — lifecycle contract

Status: PARTIALLY COMPLETE for Feature 31. The API supports immutable credit-note issuance from an approved sales return, paginated credit-note reads, and a business-scoped paginated sales-return listing. The Angular workspace can create return drafts from issued invoice lines, lets owners approve draft returns, lists approved returns and issued notes, supports customer-filtered offset pagination, and provides an OWNER-only credit-application form constrained by remaining credit and invoice receivable. The backend has an OWNER-only idempotent credit-application ledger API, paginated reads, applied/remaining totals, and customer-statement events for applied credits. Cash-refund records, line-level tax allocation/reversal, P&L/tax report integration, and exact-head validation remain incomplete.

## Existing behavior confirmed in source

- SalesReturn and SalesReturnLine represent a return request and its invoice-line quantities/amounts.
- Draft return creation checks the original issued invoice and calculates a discounted line amount before tax. Approval is OWNER-only, locks the return and invoice, serializes competing approvals by locking the invoice, checks cumulative returned quantities/amounts, and writes stock-return movements for tracked products.
- An approved return is **not** automatically a receivable credit or a cash refund. The current branch adds issuance of an immutable credit-note record, but that note is not yet applied to receivables or cash. Customer statements and reports must continue disclosing this gap.
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
- The implementation now has migrations `0006_credit_notes` and `0007_credit_applications`, relationship/uniqueness constraints, OWNER-only issuance/application endpoints, paginated reads, applied/remaining credit totals, customer-statement credit-application events, and a bilingual Angular workflow for return drafts, owner approval, credit-note issuance, customer filtering/pagination, and applying credit to a same-customer/same-currency receivable. Remaining: cash-refund records, line-level tax allocation/reversal, P&L/tax report integration, and exact-head validation.
- Added `backend/tests/test_credit_note_regressions.py` coverage for credit-note issuance/replay, original invoice immutability, unapproved-return rejection, tax guard/no side effects, OWNER-only denial, cross-business isolation, business-scoped listing/customer filtering, credit application replay, credit and receivable ceilings, customer matching, staff denial, and application listing. The idempotency key is rechecked after acquiring the credit-note lock. Tests are authored but **NOT RUN** on the current head; they do not constitute a passing test result.
- Do not expose “refund complete” until a persisted cash-out record is committed. A credit note alone does not prove cash was returned.
- Tests/build/CI/browser checks are intentionally **NOT RUN** in this batch while the user-requested runner-limit pause remains active. The focused credit-note regression tests have been added to source but still require execution.

## Implementation progress

- Added `CreditNote` schema and migration `0006_credit_notes`.
- Added OWNER-only `POST /api/v1/businesses/{business_id}/sales-returns/{return_id}/credit-note`. It accepts no client-supplied amount/currency/customer, requires an approved return and issued invoice with a linked customer, rejects zero-value returns, uses a deterministic credit-note number, records the actor and an audit event, and re-checks after locking the return so concurrent retries do not create a second note.
- Database uniqueness prevents more than one credit note per sales return and duplicate credit-note numbers within a business.
- This endpoint only issues the credit note; it does not yet apply credit to receivables or assert that cash was refunded.

## Safe implementation order

A. Credit-note and credit-application schemas/migrations are implemented (`0006`, `0007`). Next: add an immutable cash-refund ledger with relationship and idempotency constraints; do not equate credit application with cash returned.
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

- Remaining Feature 31 gaps: cash-refund records, line-level tax allocation/reversal, P&L/tax report integration, and exact-head validation. Credit applications are recorded separately from cash refunds; no cash refund is implied.


- Frontend follow-up: added a customer selector for the issued credit-note list; the selected customer is sent to the business-scoped API filter and the list now displays customer names instead of abbreviated IDs. On a failed filtered refresh, stale credit-note rows are cleared so a previous customer's results cannot be mistaken for the selected filter. Added source-level regression assertions for the filter and stale-result guard. These latest UI/test edits are **NOT RUN**; prior sandbox results above predate this head and do not verify them.

- Frontend pagination follow-up: the credit-note list now loads additional pages in batches of 100, preserves the active customer filter, ignores responses for a changed workspace/filter, and deduplicates rows by note ID. Source-level assertions were added. This pagination change and its assertions are **NOT RUN**.
- Credit-application UI follow-up: OWNERs can choose an issued receivable for the same customer/currency, apply an amount bounded by the displayed remaining credit and invoice outstanding amount, and see applied/remaining totals. Exact retries retain the same idempotency key for the same note/invoice/amount tuple; source-level tests cover this behavior and amount/customer/currency guards. Latest UI/test changes are **NOT RUN**.
