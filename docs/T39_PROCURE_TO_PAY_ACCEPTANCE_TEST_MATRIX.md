# T39 — Procure-to-Pay Acceptance Test Matrix

**Status:** specification only; not executable test evidence.  
**Baseline inspected:** `main` / `c464398e0a6ace77eba32aabfbdbd09091f53999` (2026-10-29).  
**Dependency gate:** T37 shared financial contract and T38 stock/payment event boundaries are not approved. This matrix deliberately does not define money rounding, stock valuation/COGS, expense/cash-flow posting, supplier-return accounting, or final lifecycle enums.

## Current baseline and observed gaps

Existing code includes `Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, and `StockMovement` models; scoped supplier/purchase-order routes; owner approval; partial receiving; and tenant-boundary tests. Existing merged evidence includes PRs #204, #215, #271, and #294.

Source review indicates the following still require proof or implementation:
- Supplier bill/payable records, supplier payment allocations, and payable aging.
- Rejected quantity and supplier-return/reversal workflow.
- Idempotency protection for a repeated valid receipt request and concurrency-safe receipt posting.
- Cost/valuation snapshots and approved COGS integration.
- Explicit reconciliation preventing inventory procurement from also being posted as a duplicate operating expense.
- Full role × tenant × lifecycle matrix with protected-state and audit no-side-effect assertions.

These are source-review findings, not runtime test results.

## Test fixtures and invariants

Use isolated deterministic database fixtures with at least two businesses (A and B), OWNER and STAFF principals in A, a non-member, a supplier and products per tenant, and a purchase order with multiple lines. Snapshot all relevant records, stock movements, balances, and audit events before denied or replayed requests.

Do not trust request-provided business identity, totals, prices, currency, or payment state. Exercise only through authorized API/service boundaries and real transaction boundaries. Any denied or invalid operation must leave business records, stock, payable/payment balances, and audit history unchanged unless the approved contract explicitly requires a security audit event.

## Acceptance scenarios

| ID | Scenario | Expected assertion | Gate |
|---|---|---|---|
| T39-01 | OWNER creates supplier and purchase order within own business | Records are scoped to business A; server validates supplier/product ownership and line quantities | Existing behavior regression |
| T39-02 | STAFF attempts owner-only approval | Denied; order, movements, balances and business audit snapshot have no mutation | Existing behavior regression |
| T39-03 | Non-member accesses supplier/order/receipt routes | Denied; no cross-tenant reads or writes | Existing behavior regression |
| T39-04 | Partial receipt across multiple lines | Only accepted quantities create stock effects; remaining quantity and source references reconcile | Contract-independent assertions only; state labels pending |
| T39-05 | Same receipt request replayed with same idempotency identity | One logical receipt and one stock effect only; stable response or documented conflict | Requires T37 idempotency contract |
| T39-06 | Two concurrent receipts for the same remaining quantity | No over-receipt; stock and received quantities reconcile after both transactions | Requires DB-backed concurrency test; SQLite alone may not prove production locking |
| T39-07 | Receipt quantity exceeds remaining order quantity | Rejected atomically; no stock, order, audit, or financial side effects | Contract-independent safety invariant |
| T39-08 | Supplier rejects part of delivered goods | Accepted and rejected quantities remain separately traceable; rejected goods never increase available stock | Requires approved rejection lifecycle |
| T39-09 | Return accepted goods to supplier | Return references original receipt/movement; quantity cannot exceed eligible received quantity; repeated return cannot double-post | Requires T37/T38 return/reversal boundary |
| T39-10 | Supplier bill differs from PO/receipt | Server-side matching exposes mismatch; no silent overwrite of receipt or PO values | Matching policy needs product-owner decision |
| T39-11 | Partial then full supplier payment | Allocations never exceed payable; remaining payable and paid totals reconcile exactly using approved decimal/currency rules | Requires T37 monetary/payment contract |
| T39-12 | Duplicate supplier payment request | One logical payment and one cash effect; no duplicated audit/posting | Requires T37 idempotency contract |
| T39-13 | Supplier payable aging | Open balance is grouped by approved due-date/aging buckets; partial payments reduce outstanding balance | Requires bill/due-date contract |
| T39-14 | Procurement, bill, payment and expense reports reconcile | Stock purchase is not double-counted as operating expense; cash flow reflects actual payments only | Requires T37/T40 posting boundary |
| T39-15 | Stock valuation/COGS on receipt, sale, return and correction | Every value derives from the approved method and source snapshot; reversals are traceable | Blocked pending approved valuation method |
| T39-16 | Invalid currency, negative/zero quantity, foreign supplier/product IDs, stale state | Request rejected before mutation; no stock/payable/payment side effects | Contract-independent input/tenant safety |
| T39-17 | Transaction failure after stock mutation is staged | Rollback leaves no partial order/stock/audit/financial state | Requires integration test using supported database |
| T39-18 | Reconciliation after mixed partial receipts, returns and payments | Source records, movement ledger, supplier balance and cash postings reconcile; discrepancies are explicit | Final contract required |

## Execution plan after contract approval

1. Freeze approved T37/T38 decisions in the task and identify migration/API ownership.
2. Add model/service/API tests for the contract-independent cases first; then add contract-dependent assertions after decisions are approved.
3. Add database-backed concurrency and rollback integration tests; do not treat SQLite-only tests as proof of production transaction semantics.
4. Add tenant/role positive and negative tests with before/after snapshots for records, stock movements, balances and audit events.
5. Run focused backend tests, full backend suite, frontend tests/build where changed, dependency/security checks, and exact PR-head CircleCI. Record each result and environment.
6. Review migration upgrade/downgrade and reconciliation queries; no production migration or deployment without separate authorization.

## Explicitly not decided here

- Currency/rounding and authoritative bill/payment totals.
- Receipt/payment idempotency key shape and replay response.
- Purchase-return and correction/reversal state machine.
- Costing method, landed costs, inventory valuation and COGS timing.
- Whether supplier bills create expenses, and how T40 cash-flow/report metrics consume payment events.
- OWNER/STAFF policy for create, approve, receive, return, bill, and pay actions beyond already verified existing behavior.



## Existing source-to-test map (verified by source inspection)

- `backend/app/operations.py::receive_purchase_order`: requires OWNER; locks the order and its lines; accepts only `approved` / `partially_received`; rejects empty, non-positive, foreign-line, or over-remaining quantities; locks and validates each product; updates received quantity; records a `StockMovement` for stock-tracked products; updates order state and writes an audit event. The operation accepts quantities only and has no receipt-event/idempotency identity, so a retried request cannot be distinguished from a genuinely new partial delivery by this function alone.
- `backend/tests/test_operations.py::test_purchase_receiving_records_stock_and_completes_order`: checks a 4 + 6 partial receipt sequence and final order states; currently only asserts that at least one stock movement exists, not the exact movement count/quantity or replay behavior.
- `backend/tests/test_operations.py::test_purchase_receiving_requires_owner_role`: checks the OWNER-only guard raises for STAFF; this unit test does not itself assert before/after no-side-effect snapshots.
- `backend/tests/test_api.py` and `backend/tests/test_business_tenant_boundaries.py`: contain receiving API and business-scope denial coverage; preserve and extend these rather than duplicate endpoints or replace the existing authorization matrix.
- `backend/app/models.py::StockMovement`: append-only movement records are business-scoped, constrain movement type/quantity, and link product to business. No supplier bill/payable/payment model was found in the inspected model source.

**Safe conclusion:** receiving already has useful quantity bounds, row-lock intent, audit, and movement recording. Replay identity, exact stock-effect assertions, rejected goods/returns, and supplier liability/payment records remain separate gaps. SQLite tests are not evidence that PostgreSQL row-lock/concurrency behavior is correct.

**Validation note:** documentation only. Prior PR head `dffcb7656121eacaa875671ffa1c3f34bc7a6376` reported CircleCI 7/7 SUCCESS. After updating the checkpoint, head `a2b48c47f648d0c139a9fd438cc4165a98aab420` had 2 contexts SUCCESS and 4 PENDING at last poll. Any new commit changes the head again, so exact-head CI must be rechecked. Local backend tests/build/security scan remain NOT RUN; this is not T39 acceptance evidence.
