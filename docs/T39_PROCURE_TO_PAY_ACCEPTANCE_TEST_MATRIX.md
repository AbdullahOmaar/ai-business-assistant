# T39 — Procure-to-Pay Acceptance Test Matrix

**Status:** specification plus authored regression references; all new/related test execution remains NOT RUN.  
**Baseline inspected:** `main` / `dcb0853ab06dc9271b1109db03eb84ab2e3360c8` (2026-11-01); feature source reviewed at PR #306 head `5ec7979e81dd62adc5d114dc5ec70338585b0269` before the latest test-only commit.  
**Authority state:** T37 is Draft / NOT APPROVED for shared financial semantics pending Master reconciliation. The specific 2026-10-30 17:52 Master handoff authorized only narrow OWNER-controlled PO/receiving/stock-movement source-safety fixes on PR #306. A PO receipt is stock receipt only; it does not create supplier bills, payables, expenses, supplier payments, cash outflow or COGS. This narrow authorization is not a T37 approval.

## Current baseline and observed gaps

Existing code includes `Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, and `StockMovement` models; scoped supplier/purchase-order routes; owner approval; partial receiving; and tenant-boundary tests. Existing merged evidence includes PRs #204, #215, #271, and #294.

Source review indicates the following still require proof or implementation:
- Supplier bill/payable records, supplier payment allocations, and payable aging.
- Rejected quantity and supplier-return/reversal workflow.
- Idempotency protection for a repeated valid receipt request and concurrency-safe receipt posting.
- Cost/valuation snapshots and approved COGS integration.
- Explicit reconciliation preventing inventory procurement from also being posted as a duplicate operating expense.
- Full role × tenant × lifecycle matrix with protected-state and audit no-side-effect assertions.

Explicitly deferred while T37 remains Draft / NOT APPROVED: supplier bills/AP/payables/payments, supplier returns/reversals, inventory valuation, landed cost, COGS, FX, tax, GL/posting and production financial mutations. Receipt idempotency semantics remain deferred until a separate source-event contract is approved.

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
| T39-06 | Two concurrent receipts for the same remaining quantity | No over-receipt; exactly one request succeeds when the combined quantity exceeds the remainder; order, line, stock movement and receipt-audit snapshots reconcile | PostgreSQL regression authored in `backend/tests/test_t39_purchase_receiving_concurrency.py`; execution pending |
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
| T39-17 | Transaction failure after the first receipt stock movement is flushed but before later lines complete | Transaction rollback restores PO status and every line quantity; no receipt StockMovement or stock/PO audit event persists | PostgreSQL rollback regression authored in `backend/tests/test_t39_purchase_receiving_concurrency.py`; execution pending |
| T39-18 | Reconciliation after mixed partial receipts, returns and payments | Source records, movement ledger, supplier balance and cash postings reconcile; discrepancies are explicit | Final contract required |
| T39-19 | Receipt request targets draft, received, or cancelled purchase order | Reject stale/invalid lifecycle state; no order-line, stock-ledger, or audit mutation | Contract-independent lifecycle invariant |
| T39-20 | Receipt quantity is NaN, positive/negative infinity, zero, or negative | Reject before arithmetic/write; order, received quantities, stock ledger and audit remain unchanged | Contract-independent numeric input invariant |
| T39-21 | OWNER or STAFF reads/updates a supplier profile, clears optional contact fields, or deactivates a supplier | STAFF may update profile/contact fields; only OWNER may change `is_active`; tenant scope and audit behavior are preserved; inactive supplier cannot be selected for new POs while historical orders remain readable | Supplier profile role-split and OWNER lifecycle regression authored in `backend/tests/test_t39_purchase_receiving_safety.py`; execution pending |
| T39-22 | Member opens a purchase-order detail view | Tenant-scoped supplier/product labels and ordered/received/remaining quantities are returned; foreign order or supplier/product references are not exposed | STAFF/member positive and foreign/non-member denial route regression authored; execution pending |
| T39-23 | Member filters purchase orders by status and/or supplier in the Purchasing UI | UI filters call the API; filters compose with tenant scope and stable ordering; clear restores all orders; invalid lifecycle filter is rejected | Direct-handler regression covers positive status/supplier composition, tenant scope and pagination; invalid-status HTTP 422 route validation has no dedicated test yet. Execution NOT RUN |
| T39-24 | OWNER cancels a draft/approved PO before any receipt; STAFF attempts cancellation; cancellation after receipt is attempted | OWNER may cancel an unreceived draft/approved order; STAFF denial and post-receipt cancellation rejection have no state/audit effect | OWNER-positive, STAFF-denial and received-order rejection regressions authored; execution pending |
| T39-25 | Member searches suppliers by partial name in the Suppliers UI, including owner-only inactive listing | UI submits the search to the API; results are case-insensitive, tenant-scoped and paginated; inactive records are included only when explicitly requested by an owner | Regression authored: `test_supplier_search_is_case_insensitive_paginated_and_owner_controls_inactive_visibility`; execution NOT RUN |
| T39-26 | Create a purchase order with whitespace-only number, non-ASCII currency code, or foreign/inactive/non-stock-tracked product | Request is rejected before order/line/audit writes; valid multi-line orders resolve products in a tenant-scoped batch query | Contract-independent input and tenant safety |
| T39-27 | OWNER edits a draft PO; STAFF attempts draft edit; edits are attempted on approved/received/cancelled POs; foreign/inactive supplier or product is supplied | OWNER draft edit succeeds; STAFF receives 403 with order/line/audit snapshots unchanged; non-draft edits and invalid references are rejected before writes | Draft lifecycle, OWNER authorization and tenant-integrity invariant |
| T39-28 | OWNER approves a draft after its supplier or product was deactivated | Approval rejects stale inactive supplier/product references; status remains draft and no approval audit event is written | Parameterized feature-local regression `test_approval_rejects_deactivated_supplier_or_product_without_side_effects` covers both supplier and stock-tracked product deactivation after draft creation; asserts HTTP 422, draft status, unchanged audit count, no approval audit and unchanged stock-movement count. Authored/read back at `444af25b297eada8fa0fd6f1d8f8ce1d0dbde5a8`; execution NOT RUN. |
| T39-29 | Member reads PO receipt history for own and foreign-business order IDs | Own order returns paginated receipt ledger rows with product labels and stable ordering; foreign order returns not-found without exposing ledger rows | STAFF/member positive, two-page pagination, foreign and non-member denial route regression authored; execution pending |
| T39-30 | Member reads PO summary across multiple currencies and statuses | Counts and totals are grouped by status AND currency; no cross-currency aggregate is returned; tenant scope is enforced | STAFF/member, multi-status/multi-currency grouping and non-member denial regression authored; execution pending |
| T39-31 | Member reads PO activity timeline for own and foreign-business order IDs | Timeline returns only that PO's tenant-scoped audit events in stable chronological order; foreign order returns not-found | STAFF/member positive and foreign/non-member denial route regression authored; execution pending |
| T39-32 | Create or edit a PO using an order number already used by another PO in the same business; reuse a number used only by another business | Same-business duplicate is rejected with a clear validation error before writes; cross-business identical numbers remain isolated; database uniqueness remains the concurrency backstop | Tenant-scoped identifier integrity |
| T39-33 | API regression for duplicate PO number on create and draft edit | Same-business duplicate create/edit returns validation error with order/line/audit snapshots unchanged; another business may use the same number | Regression exists: `test_purchase_order_number_is_unique_per_business_on_create_and_draft_edit` in `backend/tests/test_api.py`; execution NOT RUN |
| T39-34 | OWNER downloads purchase-order CSV from the Purchasing UI; workbook opens rows containing formula-like supplier/product names | Export contains one row per PO line with supplier/product labels, currency, ordered/received/remaining quantities; tenant scope and owner-only authorization hold; formula-like cells (including leading tab/carriage-return characters) are escaped | Data portability and spreadsheet injection safety |
| T39-35 | OWNER downloads supplier-directory CSV from the Suppliers UI including inactive suppliers | Export contains supplier contact fields and active state, remains business-scoped and owner-only, and uses the shared CSV formula-injection escaping | Supplier directory portability and access control |
| T39-36 | OWNER attempts to disable stock tracking for products referenced by draft/approved/partially received POs or by historical stock movements after full receipt | Reject before product mutation/audit; retain tracking, PO/line state and stock movements. Positive control remains covered separately for products with no open PO or movements | Regression authored: `test_owner_cannot_disable_stock_tracking_after_completed_purchase_receipt`; execution NOT RUN |
| T39-37 | Receipt includes a legacy/non-stock-tracked product after a valid line | Reject the entire receipt during prevalidation; no received quantity, StockMovement, PO status, or audit changes | Master-authorized stock-only receiving invariant (not a T37 financial approval) |
| T39-38 | PO create/edit races with stock-tracking disable for the same product | Product row locks serialize both operations; committed state cannot contain a non-terminal PO line referencing a product whose stock tracking was disabled | PostgreSQL create-vs-disable and draft-edit-vs-disable regressions authored in `backend/tests/test_t39_purchase_receiving_concurrency.py`; execution pending |
| T39-39 | Two different POs receive the same Product set with line IDs submitted in reverse Product-ID order concurrently | Both PostgreSQL transactions complete without deadlock; both POs reach received; every line quantity, four receipt movements and two PO receipt audit events reconcile exactly | PostgreSQL regression authored in `backend/tests/test_t39_purchase_receiving_concurrency.py`; execution pending |
| T39-40 | OWNER approval and receipt execute concurrently on different POs sharing the same products | Both transactions acquire Product rows in Product-ID order, complete without deadlock, and preserve approved/received states with exact receipt movements and lifecycle audits | PostgreSQL concurrency regression authored in `backend/tests/test_t39_purchase_receiving_concurrency.py`; execution pending |
| T39-41 | STAFF calls the draft PO update endpoint directly despite OWNER-only UI gating | Server returns 403; PO header, all lines and AuditEvent snapshots remain unchanged; OWNER-positive control succeeds | OWNER-only draft edit authorization regression authored in `backend/tests/test_t39_purchase_receiving_safety.py`; execution pending |

## Stock-tracking / receiving integrity follow-up — 2026-10-30

- Added a fail-closed guard preventing OWNER from disabling stock tracking while a draft, approved, or partially received PO references the product; the existing stock-movement guard remains.
- PO create and draft-edit paths now lock referenced products in stable ID order before accepting PO lines. The product PATCH path already locks the product row, so the shared row lock serializes both operations on PostgreSQL.
- Receiving now rejects a product that is not stock-tracked during the all-lines prevalidation phase. Once validation succeeds, every accepted receipt unconditionally appends its stock movement; the former silent skip is removed.
- Regression tests were added for draft/approved PO tracking-disable rejection, the no-open-PO positive control, and an invalid later untracked line causing no earlier receipt mutation.
- Source changes are committed on existing PR #306. Tests, PostgreSQL concurrency, builds and CI remain NOT RUN; authored tests are not execution evidence.

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


## Draft editing, approval revalidation, and purchasing visibility additions (2026-10-29)

- Added draft-only `PUT /purchase-orders/{order_id}`: validates the active same-business supplier and all active stock-tracked products before replacing existing lines, recalculates the order total, and records an audit event. Approved/received/cancelled orders cannot be edited.
- Approval now locks and revalidates the supplier and product references. A draft that became invalid after creation cannot be approved until corrected.
- Added paginated `GET /purchase-orders/{order_id}/receipts` over append-only stock receipt movements and `GET /purchase-orders/{order_id}/activity` over audit events; both first confirm the PO belongs to the requested business.
- Added `GET /purchase-orders/summary`, grouped by lifecycle status and currency so different currencies are never summed together.
- Tests/build/security/CI intentionally **NOT RUN** in this feature-only pass due to the current usage-limit issue. These scenarios are acceptance requirements, not evidence of runtime success.


## Purchase-order CSV export (2026-10-29)

- Extended the existing owner-only `GET /api/v1/businesses/{business_id}/exports/purchase_orders.csv` route to include purchase-order line details with supplier and product labels, order status/currency/total, ordered/received/remaining quantities and unit cost.
- The query is business-scoped and joins supplier, line and product using both record IDs and business IDs. Export is flattened to one row per PO line so spreadsheet users can filter/sort individual items.
- Formula-like values are escaped consistently with the existing CSV export behavior. The endpoint is read-only; no purchasing or financial records are mutated.
- Automated checks were intentionally not run in this feature-only pass due to the usage-limit blocker; runtime verification remains pending.


## T39 duplicate order-number API regression — 2026-10-29

- Added `backend/tests/test_api.py::test_purchase_order_number_is_unique_per_business_on_create_and_draft_edit` (acceptance scenario T39-33; T39-34 is reserved for PO CSV export).
- The API regression checks same-business duplicate creation is rejected without changing purchase-order or audit counts; identical numbers are accepted in a second business; and draft editing to another same-business order's number is rejected without changing the original order number, line count, or audit count.
- Existing `UniqueConstraint("business_id", "order_number")` remains the database concurrency backstop; the route preflight supplies a clear validation response but is not a substitute for that constraint.
- The test was authored but **NOT RUN** per owner instruction. No passing test claim is made.


## Supplier directory CSV export (2026-10-29)

- Added `suppliers` to the existing owner-only `GET /exports/{entity_type}.csv` entity allowlist. The export includes supplier ID, name, email, phone, address, active state and creation timestamp.
- It uses the same tenant-filtered generic export query and CSV formula-injection escaping as the existing customer/product/expense exports. No data mutation or migration is involved.
- Validation intentionally not run during this feature-only pass due to the usage-limit blocker.


## T39 purchase-order CSV formula-safety correction — 2026-10-29

- Source review found the purchase-order-specific CSV path checked literal backslash-plus-letter sequences for tab/carriage-return prefixes, unlike the shared export path which checks actual control characters.
- Updated the PO export guard to detect actual leading tab and carriage-return characters as well as `=`, `+`, `-`, and `@`. This is a source-level security correction; tests were not run.
- Matrix scenario T39-34 now explicitly calls out tab/carriage-return prefixes. Runtime verification remains pending.


## T39 purchasing CSV UI integration — 2026-10-29

- Added `ApiService.exportBusinessCsv` using the existing authenticated blob request path for `suppliers` and `purchase_orders`.
- Added OWNER-only CSV download actions to the Supplier Directory and Purchase Orders section headers. The shared handler prevents overlapping exports, reports API errors through the existing operations error region, and ignores a response if the user has switched workspaces while it was pending.
- Backend authorization remains authoritative; hiding the buttons for STAFF is a UI affordance, not a security boundary.
- Frontend build/tests were not run per owner instruction. Source inspection only; runtime verification pending.


## T39 supplier search UI integration — 2026-10-29

- Added a supplier-name search form with Search and Show all actions in the Supplier Directory UI.
- `ApiService.suppliers` now passes an optional trimmed `name` query parameter to the existing business-scoped API. The server retains case-insensitive matching, pagination and active-only default behavior.
- No test/build was run per instruction; source inspection only and runtime verification pending.


## T39 supplier search workspace reset — 2026-10-29

- Supplier search text and the CSV-export loading flag are cleared when workspace-scoped UI state is reset. This prevents a prior business's search term from unexpectedly filtering another business's directory.
- Tests/build were not run; source inspection only.


## T39 purchase-order filter UI integration — 2026-10-29

- Added status and supplier filters to the Purchasing UI, with Filter and Clear actions.
- `ApiService.purchaseOrders` now serializes optional status/supplier filters. Initial load and post-create/receive refreshes preserve active filter selections; workspace reset clears them.
- Backend remains responsible for validating status values and applying tenant-scoped query predicates. Tests/build were not run per owner instruction.


## T39 supplier activation UI — 2026-10-29

- Connected the existing supplier PATCH endpoint to `ApiService.updateSupplier`.
- Added OWNER-only Show/Hide inactive and Deactivate/Reactivate controls in the Supplier Directory. Inactive listing is requested only when the OWNER opts in; backend membership checks remain authoritative.
- Supplier status is shown in each row, and the list refreshes after state changes. Workspace reset clears the inactive-list toggle.
- Tests/build were not run per user instruction; source inspection only.
