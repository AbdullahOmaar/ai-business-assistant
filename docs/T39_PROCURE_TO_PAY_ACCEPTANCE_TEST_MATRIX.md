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
| T39-03 | Non-member accesses supplier/order/receipt routes, and business A owner submits business B order ID under business A context | Denied/not found; no cross-tenant reads or writes or business B side effects | Contract-independent tenant boundary regression |
| T39-04 | Partial receipt across multiple lines | Only accepted quantities create stock effects; remaining quantity and source references reconcile | Contract-independent assertions only; state labels pending |
| T39-05 | Same receipt request replayed with same idempotency identity | One logical receipt and one stock effect only; stable response or documented conflict | Requires T37 idempotency contract |
| T39-06 | Two concurrent receipts for the same remaining quantity | No over-receipt; stock and received quantities reconcile after both transactions | Requires DB-backed concurrency test; SQLite alone may not prove production locking |
| T39-07 | Receipt quantity exceeds remaining order quantity, including an invalid later line after an earlier valid line | Validate all requested lines before writes; reject atomically with no stock, order, audit, or financial side effects | Contract-independent safety invariant |
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
| T39-19 | Receipt request targets draft, received, or cancelled purchase order | Reject stale/invalid lifecycle state; no order-line, stock-ledger, or audit mutation | Contract-independent lifecycle invariant |
| T39-20 | Receipt quantity is NaN, positive/negative infinity, zero, or negative | Reject before arithmetic/write; order, received quantities, stock ledger and audit remain unchanged | Contract-independent numeric input invariant |
| T39-21 | OWNER or STAFF reads/updates a supplier profile, clears optional contact fields, or deactivates a supplier | Tenant-scoped response; blank name/empty patch rejected; audit event written; deactivated supplier cannot be selected for new POs but historical orders remain readable | Contract-independent supplier directory lifecycle |
| T39-22 | Member opens a purchase-order detail view | Tenant-scoped supplier/product labels and ordered/received/remaining quantities are returned; foreign order or supplier/product references are not exposed | Contract-independent read model |
| T39-23 | Member lists purchase orders filtered by status and/or supplier with pagination | Existing list response remains backward compatible; filters compose with tenant scope and stable ordering; invalid lifecycle filter is rejected | Contract-independent query behavior |
| T39-22 | OWNER cancels a draft/approved PO before any receipt; STAFF attempts cancellation; cancellation after receipt is attempted | Only OWNER may cancel an unreceived draft/approved order; cancellation after any receipt is rejected; status/audit transition is traceable | Contract-independent lifecycle and authorization invariant |

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

- `backend/app/extended_api.py::receive_purchase_order` now delegates to `backend/app/operations.py::receive_purchase_order`, so API and service share the OWNER check, row-lock intent, finite-positive and over-remaining quantity validation, product/business validation, stock ledger posting, order-state transition, and audit event. The HTTP adapter rejects duplicate line IDs instead of silently collapsing the list into a mapping. The operation still has no receipt-event/idempotency identity, so a retried request with a new request body cannot be distinguished from a genuinely new partial delivery by this function alone.
- `backend/tests/test_operations.py::test_purchase_receiving_records_stock_and_completes_order` retains the original 4 + 6 flow. `backend/tests/test_t39_purchase_receiving_safety.py::test_partial_receipts_create_exact_stock_ledger_effects` asserts exactly two stock movements with total quantity 10; other safety tests assert no side effects for over-receipt, invalid later lines, role denial, non-finite quantities, and cross-business product references.
- `backend/tests/test_api.py::test_purchase_receipt_duplicate_line_ids_are_rejected_atomically` exercises the HTTP endpoint and checks duplicate line IDs return 422 with no receipt, stock, or audit mutation.
- `backend/tests/test_operations.py::test_purchase_receiving_requires_owner_role`: checks the OWNER-only guard raises for STAFF; this unit test does not itself assert before/after no-side-effect snapshots.
- `backend/tests/test_api.py` and `backend/tests/test_business_tenant_boundaries.py`: contain receiving API and business-scope denial coverage; preserve and extend these rather than duplicate endpoints or replace the existing authorization matrix.
- `backend/app/models.py::StockMovement`: append-only movement records are business-scoped, constrain movement type/quantity, and link product to business. No supplier bill/payable/payment model was found in the inspected model source.

**Safe conclusion:** receiving already has useful quantity bounds, row-lock intent, audit, and movement recording. Replay identity, exact stock-effect assertions, rejected goods/returns, and supplier liability/payment records remain separate gaps. SQLite tests are not evidence that PostgreSQL row-lock/concurrency behavior is correct.

**Validation note (2026-10-29, latest inspected head `a4aac596d4f9b171fb249a4d9114d4188df16389`):** documentation is not executable test evidence. Exact-head GitHub Actions runs for Backend tests, Verify backend container, Verify backend and frontend, and Dependency security scan all concluded FAILURE. The corresponding jobs expose `steps: []`; log retrieval returns `404 BlobNotFound`, so the first failing step and root cause are NOT VERIFIED. CircleCI has six substantive FAILURE contexts on this head (backend accounting, backend container, frontend dependency audit, frontend unit tests, frontend browser smoke, frontend production build); job pages are inaccessible through the available connector. Local backend tests/build/security scan and migration checks remain NOT RUN. Do not treat CI startup/log retrieval failures as proof that application tests passed or failed at a specific test step.

## Additional contract-independent tenant-isolation regression (2026-10-29)

- `backend/tests/test_t39_purchase_receiving_safety.py::test_foreign_business_product_is_rejected_without_receipt_side_effects` builds a PO in business A with one valid local line and one line referencing a product owned by business B. It requests both receipts in one call and asserts the foreign product is rejected before any local received quantity, order status, stock movement, or audit event changes.
- This is source/test coverage added to the existing Draft PR #306; execution remains NOT RUN until CI logs or an execution environment are available. It does not replace the T37/T38 contract approval gate.


## API/domain consistency fix (2026-10-29)

- The API previously had a separate receiving implementation that mutated each line before validating later lines and could diverge from the hardened domain operation. It now calls the shared operation and rejects duplicate line IDs at the HTTP boundary.
- Regression coverage added in `backend/tests/test_api.py` for duplicate line IDs and atomic no-side-effect behavior. Code and test are implemented; runtime validation is still NOT RUN because the available GitHub Actions jobs expose no step data/logs and the current execution environment cannot clone the repository.


## Supplier directory and purchase-order lifecycle additions (2026-10-29)

- Added `PATCH /suppliers/{supplier_id}` for tenant-scoped supplier contact updates. Explicit null/empty contact fields clear optional values; omitted fields remain unchanged; empty patches and blank names are rejected.
- Supplier deactivation/reactivation is OWNER-only. `GET /suppliers?include_inactive=true` is also OWNER-only so inactive suppliers can be reviewed/reactivated without making them available to normal selection. Existing PO creation continues to require an active supplier, preserving historical order records.
- Added `POST /purchase-orders/{order_id}/cancel`: OWNER-only, tenant-scoped, row-lock intent; only draft/approved orders with no received quantities can be cancelled. Partially/fully received orders cannot be cancelled through this endpoint, so it does not reverse stock movements.
- Successful mutations record audit events. No schema migrations, supplier liabilities, payment posting, valuation, or COGS semantics are introduced.
- Per current user instruction, implementation work only; tests/CI were not run in this session because of the existing execution-limit issue. Runtime verification remains pending.
