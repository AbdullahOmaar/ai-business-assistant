# Accounting Period Close and Lock — Feature 34

## Goal

Provide an OWNER-authorized, auditable close for a business and date window. A close is not a dashboard flag: it must prevent every financial mutation affecting the closed window, including API calls and background jobs.

## Required data model

- `AccountingPeriodClose`: business ID, inclusive start/end dates, status (`closed` / `reopened`), immutable close snapshot, snapshot schema version, closed-by/at, reopened-by/at/reason.
- Unique business + start date + end date. Reopening changes the lifecycle record; it does not delete the close evidence.
- Snapshot is grouped by currency and includes issued invoices, credit notes, payment receipts, allocations, cash refunds, expenses, purchase receipts/stock movements, and unallocated/unmatched activity counts. It is explicitly an operational close snapshot, not a statutory ledger.

## Close preconditions

- OWNER role only.
- Valid inclusive date window and no overlapping active close.
- Warnings surfaced for draft/approved returns, unallocated payments, unmatched bank statement rows, unallocated cash refunds, unresolved data-integrity warnings, and incomplete inventory cost policy.
- Close snapshot is generated server-side in one transaction; client totals are never accepted.
- Close must be idempotent for an exact existing window; conflicting overlapping windows return 409.

## Mandatory write guards

A shared server-side `assert_accounting_period_open(session, business_id, effective_at)` guard must be called from every financial write boundary, not only the UI:

- Invoice creation, edits, issue, void, and invoice imports.
- Payment creation and payment allocations.
- Expense creation and imports.
- Purchase order receipt and stock movements/adjustments.
- Sales return creation, approval, and rejection; credit-note issuance.
- Credit applications and cash refunds.
- Payroll run creation/approval/payment, where payroll dates fall in the locked window.
- Recurring invoice worker/job execution.
- Any future bank reconciliation mutation that posts to the accounting ledger.

Read-only endpoints remain available. Reopening is OWNER-only, requires a non-empty reason, preserves the original snapshot, and is separately audited. Corrections should be posted in an open period with explicit references; historical rows must not be rewritten.

## Acceptance tests

- Staff cannot close or reopen periods.
- OWNER cannot close invalid or overlapping windows.
- Exact duplicate close is idempotent; conflicting overlap returns 409.
- Every listed mutation path is rejected inside a closed window and remains available outside it.
- Unauthorized and rejected attempts create no financial rows or misleading audit events.
- Reopening requires a reason and preserves the original close snapshot.
- Concurrent close-vs-write operations serialize so a write cannot slip through after the close commits.
- Tenant isolation applies to close records and all guarded writes.

## Implementation sequencing

1. Inventory every write path and background worker; maintain a test matrix alongside the guard.
2. Add close model/migration and immutable snapshot generation.
3. Add the shared period guard and wire it into all existing and future mutation boundaries.
4. Add owner-only close/reopen/list APIs and UI.
5. Add concurrency, authorization, tenant-isolation, and regression tests.
6. Verify migration and exact-head CI before considering merge.

## Status

Design only. No close model, migration, API, or mutation guard is claimed as implemented. Implementation should not begin by adding a close button before the full mutation-boundary matrix is covered.
