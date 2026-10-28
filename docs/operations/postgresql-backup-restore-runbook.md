# PostgreSQL Backup and Restore Drill Runbook

**Status:** Procedure prepared; restore drill **NOT RUN**. This document does not prove backups or PITR are configured.

## Required evidence (record in the approved operations ticket)

- Provider/project: TBD; verify from trusted provider metadata.
- Backup frequency, retention, last success, failure alerts: TBD.
- PITR availability and supported timestamp range: TBD.
- Approved isolated non-production target: TBD.
- Operator and approver: TBD.
- Owner-approved RPO and RTO targets: TBD.

Never place database URLs, passwords, tokens, service-account keys, or other secrets in source control, shell output, CI logs, screenshots, or tickets.

## Safety gates

1. Obtain owner approval for the source backup timestamp and the isolated target.
2. Verify the target project, host, and database name using trusted provider metadata.
3. Ensure the target is separate from production and cannot write to production.
4. Disable scheduled workers and external integrations on the restored copy.
5. Confirm a cleanup/retention plan for the temporary copy.

If provider or target identity is uncertain, stop and mark the drill **BLOCKED**. Do not use a production database as the restore target.

## Procedure

1. **Inspect configuration:** Verify backup frequency, retention, latest successful backup, alerting, and PITR settings in the provider console. Save redacted evidence and timestamps.
2. **Prepare target:** Use an approved dedicated non-production database. Keep credentials in the approved secret manager; never paste them into commands or logs.
3. **Restore:** Use the provider's documented restore/PITR workflow to restore the approved backup into the isolated target. Record operation ID and start/end timestamps. Stop if the source or target differs from the approval.
4. **Check schema:** Run the repository's documented Alembic current/head and migration-state checks against the restored target. Do not run schema changes against production.
5. **Check data:** Run read-only checks for orphaned references, duplicate business-scoped identifiers, invoice/payment currency consistency, and tenant ownership. Compare safe aggregate counts with available backup metadata.
6. **Check application:** Run supported backend tests and safe read/health checks against the isolated copy. Keep outbound integrations and scheduled workers disabled.
7. **Measure recovery:** Calculate achieved RPO from the restore point and last known committed timestamp; calculate RTO from restore start until integrity checks pass. Compare both to the approved targets.
8. **Close out:** Attach redacted evidence, migration results, integrity results, RPO/RTO measurements, and owner review to the approved ticket. Document the temporary target's retention or cleanup.

## Acceptance checklist

- [ ] Provider and backup/PITR settings verified.
- [ ] Backup timestamp and separate target approved.
- [ ] Restore completed in non-production.
- [ ] Alembic state and data-integrity checks passed.
- [ ] Safe application checks passed with external side effects disabled.
- [ ] RPO/RTO measured against approved targets.
- [ ] Redacted evidence reviewed and temporary target disposition documented.

Until all applicable items have evidence, report **BLOCKED** or **PARTIALLY COMPLETE**, not VERIFIED COMPLETE.
