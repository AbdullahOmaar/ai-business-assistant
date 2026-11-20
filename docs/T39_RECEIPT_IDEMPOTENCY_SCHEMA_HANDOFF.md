# T39 receipt idempotency — Chat 2 schema handoff

Status: **schema/model and API receipt idempotency integrated on the November candidate; production migration remains pending exact release rehearsal.**

## Approved contract

This persistence slice implements Master decision D-039-01 (2026-11-03):
- One receipt operation identity is scoped to (business_id, purchase_order_id, idempotency_key).
- idempotency_key stores the opaque UUID supplied by the caller (36-character canonical representation).
- request_hash stores the SHA-256 digest of the canonical normalized receipt payload.
- response_snapshot stores the original successful response for replay.
- There is no expiry/cleanup policy; the identity must live at least as long as receipt/stock history.
- The row must be inserted in the same transaction as received quantities, StockMovement and AuditEvent rows.

## Current implementation

- backend/app/models.py: PurchaseReceiptIdempotency, tenant/business-scoped composite PO FK, unique scope/key, fixed-length key/hash checks, response JSON.
- backend/migrations/versions/0007_purchase_receipt_idempotency.py: additive Alembic draft from 0006_business_invitations. Do not apply or integrate into the shared migration graph without Master review.
- backend/app/extended_api.py: OWNER-authorized receiving validates a canonical `Idempotency-Key`, hashes normalized line quantities, serializes concurrent retries on the purchase-order row, replays the stored response for the same key/hash, and returns 409 when a key is reused with a different payload. Receipt movements, one audit event and the idempotency snapshot commit atomically.
- frontend/src/app/api.service.ts: generates one UUID per receipt intent, stores it in session storage for safe retry after a lost response, and clears it only after a successful response.
- backend/tests/test_t39_purchase_receiving_api.py: endpoint replay, changed-payload conflict, malformed/missing key, concurrent same-key and no-duplicate-side-effect regressions, in addition to model constraints.

## Required owner handoffs

- **MASTER takeover:** the live API route in backend/app/extended_api.py is the sole registered receipt endpoint; atomic lookup/insert, stable lock ordering, replay/conflict behavior and tenant/role checks are implemented there. The legacy helper in backend/app/operations.py is not the registered route and remains unchanged.
- **Master:** reconcile the migration graph and branch integration; do not apply this migration to a live database.
- **Chat 2:** owns this model, additive migration draft and feature-local schema tests. No changes to Chat 3/5/Master-owned paths.

## Explicit non-goals

No supplier bill, AP/payable, supplier payment, cash/expense, supplier return, rejected-goods persistence, stock valuation, landed cost, COGS, FX, tax, GL or financial posting semantics. T37 remains DRAFT / NOT APPROVED. No production migration/write, merge or deployment is performed by this schema slice.

## Verification

Authored on the November integration branch. Exact-head GitHub Actions is pending; no local pytest or migration upgrade/downgrade was run in this environment. Do not mark replay complete until route + service owners integrate and PostgreSQL rollback/concurrency evidence passes.