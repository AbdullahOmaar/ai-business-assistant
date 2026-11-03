# T39 Purchasing UI/API Integration Handoff

Status: source-reviewed contract handoff for Master integration. This document describes the existing **PR #306 feature-branch candidate**, not current production/main behavior. It does not authorize changes to Master-owned Angular files.

Repository: `AbdullahOmaar/ai-business-assistant`  
Branch: `docs/t39-procure-to-pay-test-matrix-20261029`  
Existing PR: #306  
Issue: #321 — Purchase Order Lifecycle & Multi-line UI

## 1. API base and payload contracts

All routes below use the branch router prefix:

`/api/v1/businesses/{business_id}`

The server derives the authenticated principal from the trusted auth dependency. Do not send or trust a client role/actor identity.

### Purchase-order endpoints

| Method + path | Contract |
|---|---|
| GET `/purchase-orders` | Optional query: `limit` (1–200, default 100), `offset` (>=0), `status` (draft/approved/partially_received/received/cancelled), `supplier_id`. Returns a tenant-scoped PO list with line summaries. |
| GET `/purchase-orders/summary` | Returns `{ business_id, groups: [{ status, currency_code, order_count, total }], currency_note }`. Totals are grouped by status AND currency; never add different currencies together. |
| POST `/purchase-orders` | Creates a draft. Body: `{ supplier_id, order_number, currency_code, lines: [{ product_id, quantity, unit_cost }] }`. Lines: 1–300; quantity positive, 3 decimal places; unit_cost non-negative, 2 decimal places. Response is the PO header summary (id, business_id, supplier_id, order_number, status, currency_code, total, created_at); reload detail for lines. |
| PUT `/purchase-orders/{order_id}` | Replaces supplier, order number, currency and all lines on a draft only. Uses the same body/response shape as POST. OWNER-only. Existing lines are replaced, not patched individually. |
| GET `/purchase-orders/{order_id}` | Tenant-scoped detail: PO header, nested supplier `{ id, name, is_active }`, and lines with `id, product_id, quantity, unit_cost, received_quantity, product_name, sku, unit, remaining_quantity`. |
| POST `/purchase-orders/{order_id}/approve` | No request body. OWNER-only. Draft only; revalidates active same-business supplier and active stock-tracked same-business products. Returns PO header summary. Approval does not post stock movements. |
| POST `/purchase-orders/{order_id}/cancel` | No request body. OWNER-only. Draft/approved only and only if no quantity has been received. Never reverses stock. Returns PO header summary. |
| POST `/purchase-orders/{order_id}/receive` | Body: `{ lines: [{ line_id, quantity }] }`. OWNER-only through the receiving domain operation. Each line ID must appear once; quantity must be finite, positive and not exceed remaining quantity. Returns PO header summary; reload detail and receipt history. |
| GET `/purchase-orders/{order_id}/receipts` | Read-only receipt ledger; query `limit` (1–200, default 100), `offset` (>=0). Returns an array ordered by created_at/id with movement id, product id/name/SKU, quantity, reason and created_at. |
| GET `/purchase-orders/{order_id}/activity` | Read-only PO audit timeline; same limit/offset. Returns an array ordered by created_at/id with event id, action, summary and created_at. |

### Supplier endpoints relevant to the current Purchasing UI

- GET `/suppliers`: query `name`, `include_inactive`, `limit`, `offset`. Inactive records are only returned when explicitly requested by an OWNER.
- GET `/suppliers/{supplier_id}`: tenant-scoped supplier detail.
- PATCH `/suppliers/{supplier_id}`: body supports `name`, `email`, `phone`, `address`, `is_active`. OWNER/STAFF may update contact/profile fields; only OWNER may include `is_active`. Omitted fields remain unchanged; optional contact values may be cleared.
- POST `/suppliers`: supplier create route is provided by the canonical service-backed route. Do not reintroduce the removed duplicate route.

### Error mapping

- 403: caller is not an authorized member/role.
- 404: PO/supplier/product reference is not found within the requested business; do not reveal foreign-tenant IDs.
- 422: invalid input or unsupported lifecycle transition (including stale inactive supplier/product on approval).
- 409: integrity/duplicate-key conflict.
- Treat unknown/network failures as retry-unsafe until the UI has reloaded authoritative state; do not optimistically advance lifecycle status.

## 2. Permission matrix

| Capability | OWNER | STAFF |
|---|---:|---:|
| List/read own-business POs, detail, summary, receipt history, activity | Yes | Yes |
| Create a draft PO (backend currently authorizes business members) | Yes | Yes |
| Edit a draft PO | Yes | No |
| Approve a draft PO | Yes | No |
| Cancel an unreceived draft/approved PO | Yes | No |
| Receive an approved/partially_received PO | Yes | No |
| Read active suppliers / search suppliers | Yes | Yes |
| Include inactive suppliers in directory | Yes | No |
| Read supplier detail | Yes | Yes |
| Edit supplier contact/profile fields | Yes | Yes |
| Change supplier active state | Yes | No |
| Download supplier / PO CSV | Yes | No |

UI role gating is for usability only. Backend authorization remains authoritative. Every ID-bearing request must remain scoped to the active `business_id`; never use a business ID, role, total or price supplied by the UI as authorization evidence.

## 3. UI workflow for Master-owned Angular integration

1. **List:** show order number, supplier, status, currency, total and per-line ordered/received/remaining quantities. Keep summary totals grouped by currency.
2. **Create:** OWNER and STAFF may create a draft. Support 1–300 lines with add/remove controls; each line selects a product and accepts quantity/unit cost. Validate finite positive quantity and finite non-negative unit cost; show line-level errors. Send the full `lines[]` payload; do not calculate or trust a client-authoritative total.
3. **Draft lifecycle:** OWNER sees Edit and Approve for draft orders. Edit is a full replacement of supplier/order number/currency/lines and is unavailable after approval. Approve refreshes detail after server success.
4. **Cancellation:** OWNER sees Cancel only for draft/approved orders with no received quantity. Backend remains authoritative; a 422 must leave the UI state unchanged and reload the detail.
5. **Receiving:** OWNER sees Receive only for approved/partially_received orders with remaining quantities. Submit only line IDs and quantities. On success reload detail, receipt history and activity; do not create a bill/payment/expense.
6. **Detail/history:** detail, receipts and activity are read-only. Each view needs loading, empty, error and retry states; history pagination uses limit/offset.
7. **Workspace fencing:** capture the active business ID plus a monotonically increasing request generation before each async call. Apply a response only if both still match; clear PO/supplier/detail/history state on workspace switch. Fence each independent request and its finally/loading cleanup.

## 4. Frontend API client methods to add (Master-owned file)

Current branch `frontend/src/app/api.service.ts` has typed supplier list/update/create, CSV, PO list/create/receive methods only. It has no typed approve/cancel/update/detail/receipts/activity methods.

Suggested method names (adapt to existing local naming conventions):

- `approvePurchaseOrder(businessId, orderId): Promise<PurchaseOrder>`
- `cancelPurchaseOrder(businessId, orderId): Promise<PurchaseOrder>`
- `updatePurchaseOrder(businessId, orderId, body: PurchaseOrderInput): Promise<PurchaseOrder>`
- `getPurchaseOrder(businessId, orderId): Promise<PurchaseOrderDetail>`
- `getPurchaseOrderReceipts(businessId, orderId, limit, offset): Promise<PurchaseOrderReceipt[]>`
- `getPurchaseOrderActivity(businessId, orderId, limit, offset): Promise<PurchaseOrderActivity[]>`

POST/PUT mutation responses are header summaries, not full detail objects. Reload `getPurchaseOrder` after mutation rather than assuming line data is returned.

## 5. Acceptance tests to preserve/add

- OWNER happy path: create multi-line draft → approve → partial receive → full receive; assert each returned state and exact stock movement quantities.
- STAFF: may read and create draft per current API contract; must not see edit/approve/cancel/receive controls; direct mutation calls return 403 and do not change PO/line/audit/stock snapshots.
- Tenant isolation: foreign PO/supplier/product IDs return 404 or empty tenant-scoped filter results; no foreign labels/history are exposed.
- Invalid transitions: edit approved/received/cancelled; approve non-draft or with deactivated supplier/product; cancel partial/full received; receive draft/cancelled; assert no state/audit/stock side effects.
- Multi-line: all submitted lines survive create/edit; invalid later line rejects the whole operation without partial header/line/audit writes.
- UI state: loading/empty/HTTP failure, retry, duplicate-submit prevention, stale response after workspace switch, stale finally/loading cleanup, role-based control visibility.
- Detail/history: tenant-scoped content, stable pagination, empty states and server failure states.
- Exact final SHA frontend/API tests and builds remain required; authored tests are not execution evidence.

## 6. Scope and release boundaries

This handoff is limited to the existing supplier/PO/stock-receipt contract. A PO receipt is stock receipt only. Do not add supplier bills, AP/payables, supplier payments, expense/cash outflow, returns/reversals, valuation, landed cost, COGS, FX, tax, GL/posting, schema or migration behavior. T37 remains DRAFT / NOT APPROVED.

Master owns `frontend/src/app/api.service.ts`, `frontend/src/app/app.component.ts`, root `TASKS.md`, and cross-feature integration. Chat 2 has not edited those shared paths. Chat 3 owns `backend/app/operations.py` and its PostgreSQL lock-order regression; Chat 5 owns `backend/app/extended_api.py` and CSV export route-level QA. Keep this handoff on the existing PR #306 branch; do not create a duplicate branch/PR.

Validation state at authoring: pytest, py_compile, Angular tests/build, PostgreSQL concurrency, security scans and browser E2E are NOT RUN.

## 7. Approved receipt replay idempotency contract — 2026-11-03

Master reopened this narrow P1 stock-ledger integrity slice on 2026-11-03. It is separate from T37 and does not approve any financial/AP/payment/return/valuation/COGS semantics.

- Required request header: `Idempotency-Key`; missing or blank values must be rejected before receipt writes.
- Key scope: unique per business for the purchase-receipt operation: `(business_id, idempotency_key)`. The canonical SHA-256 request fingerprint includes business ID, purchase-order ID and normalized receipt lines sorted by line ID.
- Same key + same fingerprint returns the stored response snapshot with no additional received-quantity, StockMovement or AuditEvent effect.
- Same key + different fingerprint (including another PO) returns HTTP 409 with no new side effects.
- A distinct key is a distinct intentional operation and may perform a later partial receipt if remaining quantities permit.
- The idempotency row, PO line updates, StockMovement rows and receipt AuditEvent must commit or roll back together. A failed validation or transaction must not leave a key reservation behind.
- Concurrent same-key requests must converge on one committed result; the losing request reads the winner's response after the unique-key conflict and must never reapply stock effects.

### Ownership / implementation split

- Chat 2: SQLAlchemy persistence model, Alembic migration draft, model/constraint regressions and this contract documentation on the existing PR #306 branch.
- Chat 3: atomic service transaction, replay/race handling inside `backend/app/operations.py`, and PostgreSQL concurrent receipt tests.
- Chat 5: required `Idempotency-Key` header parsing, missing-key rejection, changed-payload 409 and route-level no-side-effect tests in `backend/app/extended_api.py`.
- Master: migration graph integration, shared API/UI files, and cross-workstream verification.

The migration is a draft on the feature branch only. Do not run it, apply it to Neon/production, or merge/deploy without the separate approvals and release gates.

## 8. Chat 2 receipt replay regression handoff — 2026-11-03

Chat 2 added six service-level regression specifications to
`backend/tests/test_t39_purchase_receiving_safety.py` on this existing branch:

1. `test_same_receipt_key_and_normalized_payload_replays_without_duplicate_effects`
2. `test_same_receipt_key_with_changed_payload_conflicts_without_side_effects`
3. `test_same_receipt_key_reused_for_another_order_conflicts_in_same_business`
4. `test_missing_or_blank_receipt_key_is_rejected_without_side_effects`
5. `test_distinct_receipt_keys_allow_intentional_later_partial_receipt`
6. `test_receipt_idempotency_record_rolls_back_with_receipt_and_key_can_retry`

The tests assume the service accepts `idempotency_key` as a keyword argument and
raises `WorkflowError` for missing/blank keys and payload conflicts. The
successful service result remains the PurchaseOrder result; the persisted
idempotency record must contain the original successful response snapshot
(`response_status=200`, non-null `response_body`). These are contract tests,
not evidence that the service is implemented or that tests pass.

### Required Chat 3 implementation contract

- Add the `idempotency_key` argument to
  `operations.receive_purchase_order()`; authenticate OWNER and tenant scope
  before disclosing any stored result.
- Canonicalize business ID, PO ID, sorted line IDs and normalized finite Decimal
  quantities. Equivalent Decimal scales and request line ordering must hash
  identically.
- Resolve a stored same-key record before re-running lifecycle/remaining-
  quantity validation, so a successful request can replay after the PO has
  advanced to partially/fully received.
- Same key + same fingerprint returns the original result without another
  PO-line, StockMovement or AuditEvent write. Same key + different fingerprint
  raises a domain conflict for Chat 5 to map to HTTP 409.
- Missing/blank key raises a domain validation error before any side effect;
  Chat 5 maps it to HTTP 422.
- Insert the idempotency row, update PO lines, append StockMovement and
  AuditEvent, and persist the response snapshot in one transaction. Rollback
  must remove all of them. A concurrent unique-key loser reads the committed
  winner response and never repeats stock effects.

### Contract wording conflict — Master decision required

The 2026-11-03 Master decision item 1 states uniqueness scope as
`(business_id, purchase_order_id, idempotency_key)`, but item 4 requires reuse
of the same key for a different PO in the same business to return HTTP 409.
The current model and this handoff use a unique `(business_id, idempotency_key)`
constraint, which enforces that cross-PO conflict. Chat 2 has added a regression
for the explicit cross-PO 409 behavior but has not changed the model/migration
constraint. Master must confirm the intended uniqueness rule before schema
reconciliation.

**Validation:** the six new tests, all existing backend tests, PostgreSQL
concurrency, migration upgrade/downgrade, frontend tests/build, security scans
and browser/runtime checks remain NOT RUN. The migration remains draft-only
and has not been applied.
