# Rollback runbook (3A-702 — Phase 2 A2)

A rollback undoes a bad deploy. It is not a fix, and it is not a data
restore: the faulty change stays out until it is fixed on a branch and
merged through QA, and lost data is recovered by the backup/restore
drill program (`docs/BACKUP_RESTORE_DRILL.md`), never by rolling back
code.

## When to roll back

Roll back when one of these is true after a deploy, and the deploy is
the cause:

- `scripts/production_smoke.py` exits non-zero against production
  (a flow failed, or the versions diverged);
- Sentry shows a sharp error-rate rise or a new crash in the deployed
  release;
- a wrong release was deployed (the live `/version` is not the
  intended release);
- a security incident requires the release off production now.

Do not roll back on a hunch. The smoke verdict and Sentry are the
evidence; a single transient connection drop is not — the smoke
script retries transport failures before it fails.

## Who decides, who runs it

- **Decision:** the manager. The person on call executes; the manager
  is notified the moment the decision is taken.
- **Notify:** `#ops-room` (coordination floor) and `#ci-alerts`, plus
  the manager directly. One message, this shape:

  > Rollback: <project> <release> → <previous release>. Reason:
  > <smoke FAIL / Sentry spike / wrong release>. Decided by <name>
  > at <time>. Verification after: <smoke result>.

- A rollback is recorded in `docs/RELEASE_EVIDENCE_REGISTER.md` the
  same day, with what was rolled back, why, and the smoke result
  after it.

## Deploy rollback — two paths

**Fast path — Vercel instant rollback.** Revert the deployment to
the previous production deployment in the Vercel dashboard. Use this
when production is broken now. It is the fastest way back to a known
good state, but it leaves main ahead of production — so it must be
followed by the repo path the same day.

**Repo path — revert-merge PR.** `git revert <merge-commit>` of the
faulty merge, opened as a PR and merged through QA like any other
change (PASS + green CI). Grouped deploys roll back as a group: revert
the whole group, never one part of it. After either path, main and
production must agree again — that is what the smoke script verifies.

## Migration rollback — the rule that makes code rollback safe

A code rollback **never** needs a schema rollback: migrations are
additive-only by policy (`docs/MIGRATION_POLICY.md` — expand first,
deploy, contract in a later release). The old code runs correctly
against the new schema.

Downgrade a migration (`alembic downgrade <previous>`) only when the
migration itself is the fault — for example a bad index blocking
writes — and only after confirming no data is lost by the downgrade.
Never downgrade a migration that changed data semantics, and never
downgrade from CI: the downgrade runs from the Vercel build
environment, where `DATABASE_URL` lives. Every migration ships with
its downgrade script and a rollback note saying what breaks if it is
downgraded; a migration without one is not merged.

## Verification after a rollback

1. Run `scripts/production_smoke.py` — exit 0 is required before
   anyone calls the rollback done.
2. `/version` must report the rolled-back release on the affected
   surface, and `/readyz` must be ready.
3. Record the rollback row in the evidence register the same day.

If the smoke still fails after the rollback, the fault is not the
deploy — escalate to the manager with the smoke output; do not roll
back further blindly.
