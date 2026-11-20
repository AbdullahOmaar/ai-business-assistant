# Purchase-order approval authorization regression — 2026-10-28

## Scope

This change adds an API-level regression for the approved OWNER/STAFF policy in `docs/PRODUCTION_DEPLOYMENT.md`:

- STAFF may create a draft purchase order.
- STAFF may not approve it.
- A denied approval must return HTTP 403 and leave the purchase-order status, lines, stock movements, and audit-event count unchanged.
- OWNER approval changes the order from `draft` to `approved` and records one `purchase_order.approved` audit event.

## Verification status

- Exact-head CircleCI: pending until the branch PR is opened and checks run.
- Production workflow: NOT RUN.
- No production data, role policy, secrets, or deployment were changed.

## Remaining security matrix

This focused regression does not close the full route × role × tenant matrix. Other sensitive routes still require an evidence-based route inventory and OWNER-positive, STAFF-negative/no-side-effect, non-member, and foreign-business-ID tests as applicable.
