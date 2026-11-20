# PostgreSQL Backup and Restore Runbook

**Status:** Recovery readiness is not yet production-verified. This document records the current metadata audit and the safe recovery procedure; it does not claim that a restore drill has passed.

## Provider and observed configuration

Observed through the Neon project metadata on 2026-10-25:

- Provider: Neon PostgreSQL
- Project: `ai-business-assistant-db` (project ID `flat-meadow-20571697`)
- Region: AWS `eu-central-1`
- PostgreSQL major version: 16
- Plan metadata: `free_v3`
- Default branch: `main` (branch ID `br-hidden-surf-b97btfdh`)
- Observed logical size: about 30.6 MiB; project logical-size limit: 1 GiB
- Neon history-retention setting: 21,600 seconds (6 hours)
- Snapshot inventory at audit time: no snapshots returned
- Automatic snapshot schedule for the default branch: no schedule configured
- Default branch protection: disabled
- IP allow-list: empty; public connections are not blocked

These are observations from the provider API, not proof that a recoverable backup exists. The six-hour history-retention setting should not be represented as a tested backup or a completed point-in-time restore.

## Readiness gaps

Do not mark backup/restore as production-ready until an authorized operator has:

1. Confirmed current Neon retention/PITR behavior and limits in the provider console for this exact project.
2. Chosen and configured a suitable automated snapshot schedule/retention policy, considering the free-tier limits and storage cost.
3. Agreed and recorded the business recovery-point objective (RPO) and recovery-time objective (RTO).
4. Completed a restore drill into a **separate non-production branch/database**, without swapping names or modifying the production branch.
5. Captured timestamped evidence of the restored branch, migration state, integrity checks, and elapsed recovery time.

## Safe restore drill

1. Record the incident or drill ID, operator, UTC start time, source branch, selected snapshot/PITR timestamp, and intended recovery point.
2. Confirm that the source snapshot or history window covers the intended recovery point before starting.
3. Restore into a **new branch**. Do not target the production branch, finalize a branch restore, or swap branch names for a drill.
4. Keep the restored connection string in the approved secret manager or CI secret store. Never paste it into an issue, commit it, or print it in logs.
5. From the repository root, explicitly point Alembic at the restored branch URL supplied by the approved secret manager. After setting `RESTORED_DATABASE_URL` in the current shell without printing it, run: `cd backend && DATABASE_URL="$RESTORED_DATABASE_URL" python -m alembic current`. The `cd backend` is intentional because this command starts at the repository root. Verify the output against the expected migration head. Never reuse a production `DATABASE_URL` by accident, and never echo the connection string.
6. Run read-only integrity checks against the restored copy: key table counts, foreign-key/invariant checks, and representative business/invoice/payment/return records. Do not mutate financial rows as part of the drill.
7. Run application health/readiness checks against a non-production configuration pointing only to the restored branch.
8. Record whether the target RPO was met and the elapsed time against the RTO. Note failures and corrective actions.
9. Keep or remove the temporary restore branch only under the approved test cleanup procedure. Never clean up a production branch as part of this drill.

## Operational controls

- Treat `DATABASE_URL` and all provider connection strings as secrets.
- Do not run a destructive restore test against production.
- Do not change production branch protection, IP restrictions, or snapshot schedules without a reviewed change plan and an authorized operator.
- A successful migration check or a healthy production `/readyz` endpoint does not prove backup recoverability.
- Keep this issue open until the separate restore drill and evidence are complete.
