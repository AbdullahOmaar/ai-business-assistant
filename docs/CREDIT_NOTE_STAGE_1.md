# Credit Notes — Stage 1 issuance-only contract

**Policy status:** Stage 1 approved to implement by the Product Owner on 2026-11-19. Stages 2 and 3 remain deferred. T37 overall remains partially complete; this is not blanket accounting approval.

## Scope

Stage 1 provides a separate immutable credit-note document issued only by an OWNER from an OWNER-approved sales return. It links to the same business, original issued invoice, customer, sales return, and source currency. The server derives the amount from the persisted return lines and requires the return header total to reconcile. A business-scoped unique constraint permits one credit note per approved return and makes an exact repeat idempotent.

API:
- `GET /api/v1/businesses/{business_id}/sales-returns` — business-scoped, paginated read; optional status filter.
- `POST /api/v1/businesses/{business_id}/sales-returns` — existing return-draft creation contract.
- `POST /api/v1/businesses/{business_id}/sales-returns/{return_id}/approve` — existing OWNER-only approval contract.
- `POST /api/v1/businesses/{business_id}/sales-returns/{return_id}/credit-note` — new OWNER-only Stage 1 issuance.
- `GET /api/v1/businesses/{business_id}/credit-notes` — business-scoped, paginated read.

## Invariants

- Only an approved return for an issued invoice in the same business may be credited.
- The invoice must have a customer; customer and currency are copied from the invoice, never supplied by the client.
- All source return lines must belong to the original invoice and business; the sum of persisted return-line amounts must equal the approved return total and be positive.
- An invoice with non-zero persisted tax is rejected. No tax allocation is guessed or silently omitted.
- Issuance writes one CreditNote and one audit event in the same transaction. Duplicate requests return the existing note; a unique constraint protects concurrent requests.
- The original invoice total, payment rows, payment allocations, receivable balance, cash balance, stock ledger and financial reports are not rewritten by issuance.
- There is no endpoint or UI for editing/deleting issued credit notes, applying credit to receivables, or recording a cash refund in Stage 1.

## Migration

- Revision: `0008_credit_notes`
- Parent: `0007_receipt_idem` (which follows `0006_business_invitations`).
- Additive table only; downgrade drops only `credit_notes`. Review generated SQL and rollback/recovery plan before applying outside disposable CI.

## Explicitly deferred

- **Stage 2 — receivable application:** separate append-only allocation ledger, outstanding ceilings, concurrency/idempotency, statement/aging/report integration and acceptance tests require a separate approval gate.
- **Stage 3 — cash refund:** separate cash-out record, payment provenance, unallocated receipt checks, refund failure/reversal and reconciliation require a separate approval gate.
- Tax-bearing credit notes, tax-report/tax-filing integration, GL/double-entry posting, FX, COGS/valuation, AP/payables and all other unapproved financial semantics remain out of scope.

## Validation and release

Required before merge: focused issuance tests, full backend/PostgreSQL migration checks, frontend tests/build, dependency audits, backend container/import, exact-head aggregate CI, diff/security review, migration/rollback review, and relevant UI acceptance. No production writes, live migration, merge, deployment, or version bump is authorized by the policy decision alone. Record unavailable checks as NOT RUN/BLOCKED; never infer a PASS.
