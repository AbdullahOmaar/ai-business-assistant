# Tax and Discount Rules — Feature 27

Status: PARTIALLY COMPLETE. This increment exposes a read-only, OWNER-only listing API for existing pricing-rule records. It does **not** change invoice calculations or imply that a stored rule is automatically applied.

## API slice

`GET /api/v1/businesses/{business_id}/pricing-rules`

- OWNER-only and business-scoped.
- Optional filters: `rule_type=tax|discount`, `is_active=true|false`.
- Pagination: `limit` (1–100, default 50) and `offset` (default 0).
- Stable newest-first ordering with ID tie-breaker.
- Read-only: no audit events or financial records are written by listing.

## Current model gap

The existing `PricingRule` stores name, type, percentage rate, active flag, and creation time. It has no `effective_from` or `effective_to`, and current invoice calculation still uses the rate supplied at invoice creation. This endpoint intentionally does not pretend that the rules are effective-dated or applied to invoices.

## Remaining work

1. Add effective-date columns and migration with a backfill for existing rules.
2. Define and test overlap handling for active rules of the same type; do not silently choose between conflicting rates.
3. Add a read/write OWNER UI with validation and visible effective dates.
4. Define whether effective rules auto-populate new invoices or only provide suggestions. Existing issued invoice snapshots must remain immutable.
5. Add deterministic boundary/rounding tests and prove workspace isolation, role denial, invalid dates/rates, and duplicate/overlapping periods.
6. Reconcile migration ordering with the open Feature 31 credit-note branch before merging either migration.

## Validation evidence — 2026-10-29

- `backend/tests/test_pricing_rule_management.py`: 2 passed.
- Focused run with `tests/test_api.py`: 2 passed, 24 deselected, 6 warnings.
- Tests ran in an assembled sandbox with selected branch source refreshed, not a full exact checkout.
- CI checks and browser smoke: NOT RUN for this branch yet. No merge or deployment.
