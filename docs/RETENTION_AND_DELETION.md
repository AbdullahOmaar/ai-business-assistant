# Retention, deletion and export (B3 — 3A-721)

The owner's two promises, made mechanical: **«بياناتك ليك»** (your
data is yours — take it all, verifiably) and **deletion that really
deletes** (access ends at once; the rows follow after a stated
retention window). Implemented in Phase 2 B3; verified by
`backend/tests/test_business_deletion_export.py`,
`tests/test_purge_deleted_businesses.py`, and the route matrix.

## Business deletion — soft, immediate, audited

`DELETE /api/v1/businesses/{business_id}` (owner only) requires the
caller to type the business name exactly (`confirm_name`); a
mismatch is a 422 and nothing changes. On success, in one
transaction:

- `businesses.is_active` → False and `businesses.deleted_at` → now.
- An AuditEvent `business.deleted` is written to the business's own
  trail.
- The response is 204.

Access ends **immediately** for every member and every surface:
`authorize_membership` (app/security.py) requires an active
business, and it backs the workspace, the API, the extended routes
and the assistant. The business also leaves `GET /businesses`.

## Retention window and restore

A soft-deleted business is retained for **30 days** (the purge's
`PURGE_RETENTION_DAYS`, default 30). Within the window the deletion
is reversible by an operator (manager-side, production database):
set `is_active = true` and `deleted_at = NULL` for the business row.
That restore path is deliberately not an API — un-deleting is a
support decision, not a self-service toggle.

## Purge — the hard delete

`scripts/purge_deleted_businesses.py` (operations step, never runs
from the app or CI):

- Requires `DATABASE_URL` (fails closed without it).
- Selects businesses with `is_active = false` and `deleted_at`
  older than the window.
- Deletes every business-scoped row in foreign-key dependency
  order (derived from the model metadata — several business FKs
  are RESTRICT, so children go first), then the business row.
  One business per transaction.
- `--dry-run` reports counts and deletes nothing.
- Prints one evidence line per business (id, name, deleted_at,
  per-table counts). The operator records the run in
  `docs/RELEASE_EVIDENCE_REGISTER.md` the same day.

After the purge, the business's data is gone, including its audit
trail — the purge evidence line is the surviving record.

## The full export — verifiable

`GET /api/v1/businesses/{business_id}/export` (owner only) returns
one JSON document:

- `data`: the business profile + every business-scoped entity
  (memberships, invitations, settings, customers, suppliers,
  products, stock movements, invoices + lines, payments +
  allocations, expenses, purchase orders + lines, sales returns +
  lines, credit notes, employees, payroll records, recurring
  schedules, pricing rules, notifications, audit events, import
  jobs).
- `manifest`: format version, business id + name, export time,
  exporting user, the **row count of every entity**, and a
  **SHA-256** over the canonical form of `data`
  (`json.dumps(data, sort_keys=True, separators=(",", ":"))`).

Verification recipe: recount each entity list and compare with
`manifest.counts`; re-hash the canonical form and compare with
`manifest.sha256`. The export itself is audited
(`business.exported`).

**Excluded, deliberately:** the idempotency-key tables (operational
internals — a key and a response reference, no business data), the
demo rate-limit counters (not business-scoped), and the platform
tables (role grants and the platform audit are the platform's
records about the platform, not the business's data).

## Account deletion

`DELETE /api/v1/me` (any signed-in user) deletes the caller's own
account:

- **Sole-owner guard (409):** while the caller is the only owner of
  an active business, deletion is refused and the blocking
  businesses are named — delete or transfer them first, so no
  business is left ownerless.
- **Order:** the identity-provider user is deleted FIRST (a
  provider failure is a 502 and nothing in the database changes);
  only then are the caller's memberships removed, each leaving an
  `account.deleted` AuditEvent in that business's trail.
- Businesses with other owners keep their data and their trail —
  the departing member's past audit events stay (they are the
  business's records of what happened, with the actor subject
  preserved).
