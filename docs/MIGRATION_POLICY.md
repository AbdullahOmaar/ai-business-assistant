# Migration policy (3A-702 — Phase 2 A2)

Migrations change the database every business depends on. The policy
is one rule with teeth: **expand-only, then contract later** — so a
code rollback never needs a schema rollback, and a deploy can always
be undone by reverting code alone.

## The expand-only rule

Every schema change goes in three steps, across two releases:

1. **Expand** — add the new shape without removing the old one: new
   tables, new columns (nullable, or with a default), new indexes,
   new constraints that do not block writes.
2. **Deploy** — ship the expansion, let the new code write the new
   shape while the old shape still exists.
3. **Contract (a later release)** — only after the code no longer
   reads the old shape, remove it. Never in the same release as the
   expansion.

## What a migration may and may not contain

**May:** additive schema (tables, columns, indexes, constraints that
do not block writes).

**May not, in the same migration as a schema change:**

- `DROP COLUMN` / `DROP TABLE`, or narrowing `ALTER COLUMN` — these
  are the contract step, in a later release, in their own migration;
- `DELETE` / `UPDATE` of existing data — a data backfill is a
  separate migration, with its own review, and it must be idempotent
  (safe to run twice);
- any change to calculation, tax, discount, allocation, payroll, or
  permission semantics — those are product decisions, not schema
  steps, and they never ride inside a migration.

## What every migration ships with

- **Exact-SQL review** — the generated SQL is read before the
  migration is merged (migration `0011_report_indexes` is the model:
  three `CREATE INDEX` statements, one transaction, additive-only).
- **A downgrade script** — `alembic downgrade <previous>` must work
  from the migration's own file.
- **A rollback note** — what breaks if this migration is downgraded
  (for an index: nothing, reports are only slower; for anything
  else: say so explicitly). A migration without a rollback note is
  not merged.
- **Disposable-PostgreSQL CI validation** — the migration runs
  against a disposable database in CI before it merges.

## Where migrations run

- **At build time, in Vercel** — `backend/scripts/apply_migrations.py`
  runs `alembic upgrade head` from the API project's Build Command
  (manager-applied dashboard setting; see
  `docs/RELEASE_MIGRATION.md`). Fail-closed: a failed migration
  fails the build and blocks the deploy.
- **Never at app startup** — the app deliberately does not auto-run
  Alembic (repository rule; a startup migration would run
  concurrently across serverless instances).
- **Never from CI** — CI must never receive production secrets
  (repository rule, and the Owner decision of 2026-11-15).
- **Never by hand against production** — direct live-database
  mutation is Owner-gated.

## Applied-state recording

The applied revision is recorded in
`docs/RELEASE_EVIDENCE_REGISTER.md` with the deploy, in the same
change. The smoke script proves `/readyz` only; the register row is
the record of which migration head is live.
