# Bulk operations (C8 Part 2, design 3A-686)

Multi-select operations for lists that reach 100 records with no batch
tool: an owner can act on a selection in one call instead of opening
every record. Shipped as a backend API; the multi-select UI follows
coordination with the assistant-execution chat (2026-11-25
redistribution), the same pattern as B3's deferred settings screen.

## Endpoints (all owner-only, prefix `/api/v1/businesses/{business_id}`)

| Endpoint | Body | Per-item operation |
| --- | --- | --- |
| `POST /invoices/bulk-void` | `{ids, reason?}` | the single invoice void (draft/issued, stock restored) |
| `POST /purchase-orders/bulk-cancel` | `{ids}` | the single draft-order cancel (receipt history blocks it) |
| `POST /customers/bulk-deactivate` | `{ids}` | the single customer deactivate (`is_active = false`) |
| `POST /products/bulk-deactivate` | `{ids}` | the single product deactivate (`is_active = false`) |
| `GET /exports/{entity_type}.csv?ids=<uuid>,<uuid>` | — | the existing CSV export, narrowed to the selection |

## Semantics

- **Orchestration, not reimplementation.** Each bulk endpoint calls the
  existing single-item operation per id, so every guard (allocated
  payments block a void, receipts block a cancel, already-inactive rows
  refuse deactivation) applies identically. There is no second copy of
  any financial or lifecycle rule.
- **Per-item results, not one transaction.** The response is
  `{succeeded: [ids], failed: [{id, reason}], total}` with HTTP 200
  whenever the call itself was authorized and well-formed. One bad id
  never rolls back the rest. Confirmation happens client-side before
  the call (3A-686); the result map is the rollback guide — each
  succeeded item names the inverse single operation.
- **Limits.** At most 100 ids per call (the lists page size); an empty
  list is a 422; duplicate ids are de-duplicated before processing.
- **No bulk financial deletion.** 3A-686's explicit limit holds: the
  destructive-looking operations resolve to the reversible single-item
  paths (void, cancel-draft, deactivate). There is no bulk delete.
- **Audit.** The single-item operations keep writing their per-item
  events (`invoice.voided`, `purchase_order.cancelled`,
  `customer.deactivated`, `product.deactivated`); each bulk call adds
  ONE summary event (`invoice.bulk_voided`,
  `purchase_order.bulk_cancelled`, `customer.bulk_deactivated`,
  `product.bulk_deactivated`) with the succeeded/failed counts, so the
  log shows the batch and its items without drowning in either.

## Verification

`backend/tests/test_bulk_operations.py`: partial-failure void (one
unknown id among valid ones), cancel of a draft vs an approved order,
bulk deactivation state + audit counts, the 100-id cap and empty-list
422, staff 403 on all four endpoints, and the export ids filter
(including a malformed-ids 422). The route matrix carries the four
routes (102 on this branch; the positive pass fires them on dedicated
seeds).
