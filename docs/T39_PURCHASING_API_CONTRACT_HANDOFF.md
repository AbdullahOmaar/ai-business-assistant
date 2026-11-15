# T39 Purchasing and inventory API handoff

Branch: master/nov-2026-phase-1-ux-foundation
Owner: Chat 2 — Inventory, Purchasing & Suppliers

## Existing purchase-order write flow

- GET /api/v1/businesses/{business_id}/purchase-orders — list purchase orders.
- POST /api/v1/businesses/{business_id}/purchase-orders — create a Draft PO with one or more lines.
- POST /api/v1/businesses/{business_id}/purchase-orders/{order_id}/approve — OWNER-only approval.
- POST /api/v1/businesses/{business_id}/purchase-orders/{order_id}/receive — OWNER-only partial/full receipt; existing route remains the only receipt write path.

## Added lifecycle/read routes

- GET /api/v1/businesses/{business_id}/purchase-orders/{order_id} — active member detail with supplier, lines, product details, received_quantity and remaining_quantity.
- PUT same path — OWNER-only full replacement of Draft header and lines. Body: supplier_id, order_number, currency_code, lines[]. Server recalculates total; all products/supplier must be active and business-scoped; products must be stock-tracked.
- POST /api/v1/businesses/{business_id}/purchase-orders/{order_id}/cancel — OWNER-only Draft cancellation. No stock or financial reversal.
- GET /api/v1/businesses/{business_id}/purchase-orders/{order_id}/receipts — OWNER-only paginated read-only StockMovement receipt history.
- GET /api/v1/businesses/{business_id}/purchase-orders/{order_id}/activity — OWNER-only paginated read-only AuditEvent timeline.

## Inventory movement ledger

- GET /api/v1/businesses/{business_id}/inventory/movements — active member, read-only StockMovement ledger.
- Optional filters: product_id, movement_type (opening/receipt/sale/return/adjustment), reference_type.
- Pagination: limit 1..200 (default 50), offset >= 0; response includes has_more.
- Stable newest-first order: created_at DESC, id DESC. Product details are joined using both product_id and business_id.
- No mutation route is introduced. Current stock remains derived from signed StockMovement.quantity_delta.

## Authorization summary

| Operation | Minimum role |
|---|---|
| PO list/detail | Active business member |
| PO create Draft | Active business member |
| PO approve/receive | OWNER |
| PO edit/cancel | OWNER; Draft state only |
| Receipt/activity history | OWNER |
| Inventory movement history | Active business member |

UI role controls are presentation only; backend authorization is authoritative. Every route scopes reads/writes by business_id.

## T37 and data boundaries

These routes do not create supplier bills, payables, supplier payments, cash outflows, expenses, purchase returns, rejected-quantity persistence, valuation, landed cost, COGS, FX, tax, GL or financial postings. T37 remains DRAFT / NOT APPROVED. PO receiving remains stock receipt only.

## Validation status

New route regressions are in backend/tests/test_t39_purchase_order_workflow_api.py and backend/tests/test_t39_inventory_movements_api.py. Exact-head CI must pass before acceptance. Local pytest is NOT RUN. Receipt idempotency remains incomplete until Chat 3/5 integrate the D-039-01 contract and PostgreSQL replay/concurrency/rollback evidence passes.