# Credit notes, refunds, and customer returns — lifecycle contract

Status: PARTIALLY COMPLETE for Feature 31. The first slice implements immutable credit-note issuance from an approved sales return; credit application, cash refunds, report/statement integration, and frontend workflow are not implemented yet.

## Existing behavior confirmed in source

- SalesReturn and SalesReturnLine represent a return request and its invoice-line quantities/amounts.
- Draft return creation checks the original issued invoice and calculates a discounted line amount. Approval is OWNER-only, locks the return and invoice, serializes competing approvals by locking the invoice, checks cumulative returned quantities/amounts, and writes stock-return movements for tracked products.
- An approved return is **not** automatically a receivable credit or a cash refund. The current branch adds issuance of an immutable credit-note record, but that note is not yet applied to receivables or cash. Customer statements and reports must continue disclosing this gap.
- Issued invoice totals are historical records and must not be edited to simulate a credit note.
- Payment allocations are separate records and are currency/customer constrained. Unallocating a payment is not the same as refunding cash.

## Required lifecycle

1. **Draft sales return** — references one issued invoice in the same business; every line references an invoice line on that invoice; amounts are derived server-side from stored invoice snapshots, not client-supplied totals.
2. **Approve return** — OWNER-only, transactionally locks the invoice/return/lines, enforces remaining quantities and amounts, and posts stock restoration exactly once where applicable.
3. **Issue credit note** — OWNER-only, idempotent, immutable after issue, references the approved return and original invoice/customer/currency. A unique constraint must prevent multiple active credit notes from crediting the same approved return unless an explicit partial-credit allocation model is introduced.
4. **Apply credit to receivable** — record a distinct credit allocation against the original customer's receivable. Never create a negative payment or rewrite invoice totals. Enforce same business, customer, and currency, plus a ceiling against the credit-note remainder.
5. **Refund cash** — a separate, auditable cash-out record tied to the credit note and, where applicable, the original payment. Require an idempotency key and server-side amount ceiling; a refund must not silently unallocate/reuse a payment or double-credit receivables.
6. **Read/report** — customer statements, receivables aging, P&L and tax summaries must show credits/refunds distinctly and only net amounts when their accounting meaning is defined. Until tax allocation and revenue treatment are implemented, show gross invoice and approved-return/credit-note figures separately with clear caveats.

## Invariants and release gates

- All reads and writes are scoped by business_id; references to invoice, customer, payment, allocation, return, and product must be validated server-side.
- Currency is copied from the original invoice and cannot be client-overridden.
- Use Decimal arithmetic and explicit rounding; never trust client-supplied totals or statuses.
- Preserve original invoice and payment history. Corrections use compensating records, never destructive edits.
- Approval/issue/refund operations must be atomic, replay-safe, and audited. Failed or replayed requests must not duplicate stock, receivable credit, or cash-out.
- The implementation needs a database migration with constraints/indexes, owner-only authorization at route and service boundaries, API schemas/routes, frontend owner workflows, statement/report integration, and regression coverage for partial credit/refund, duplicate replay, currency/customer mismatch, concurrent approvals, already allocated payments, and no-side-effect denials.
- Do not expose “refund complete” until a persisted cash-out record is committed. A credit note alone does not prove cash was returned.
- Tests/build/CI/browser checks are intentionally **NOT RUN** in this batch while the user-requested runner-limit pause remains active.

## Implementation progress

- Added `CreditNote` schema and migration `0006_credit_notes`.
- Added OWNER-only `POST /api/v1/businesses/{business_id}/sales-returns/{return_id}/credit-note`. It accepts no client-supplied amount/currency/customer, requires an approved return and issued invoice with a linked customer, rejects zero-value returns, uses a deterministic credit-note number, records the actor and an audit event, and re-checks after locking the return so concurrent retries do not create a second note.
- Database uniqueness prevents more than one credit note per sales return and duplicate credit-note numbers within a business.
- This endpoint only issues the credit note; it does not yet apply credit to receivables or assert that cash was refunded.

## Safe implementation order

A. Add schema and migration for immutable credit notes, credit applications, and refund records with unique idempotency/relationship constraints. (Credit-note table and issuance are the first slice; application/refund tables remain.)
B. Add transactional OWNER-only service operations and append-only audit events.
C. Add read/list endpoints and a UI that distinguishes draft return, approved return, issued credit, applied credit, and refunded cash.
D. Integrate customer statement and reports only after the ledger semantics are represented explicitly.
E. Resume tests and exact-head CI only after the user clears the current testing-limit pause.
