# Production backup and isolated restore drill

## Safety requirements

- Never commit database dumps, connection strings, or passphrases.
- Obtain source and restore URLs from the approved secret manager; do not paste them into chat or shell history.
- The restore target must be a newly created, empty, disposable database that is not the production database.
- The script refuses identical database URLs, compares database/server identity, checks that the target has no user objects, and requires an explicit confirmation flag.
- It resolves output paths before writing, refuses paths inside the repository, and refuses to overwrite an existing encrypted backup or checksum.
- The script writes an AES-256 encrypted custom-format dump with restrictive permissions, verifies that the dump can be read, restores it into the isolated target, and checks the restored Alembic revision table. The empty-target guard checks user relations, routines, types, non-default schemas, and non-default extensions before any dump or restore operation.
- Store the encrypted backup and checksum in an approved encrypted backup location with access controls and retention. The script does not create cloud storage or incur provider charges.

## Run

Install PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) and `gpg`, then export these variables from the secret manager:

- `SOURCE_DATABASE_URL`
- `RESTORE_DATABASE_URL` — a new empty disposable database, not production
- `BACKUP_PATH` — an absolute path outside this repository; the script appends `.gpg`
- `BACKUP_PASSPHRASE`
- `CONFIRM_ISOLATED_RESTORE_TARGET=YES` — set only after verifying the target database identity in the provider console

Run:

```bash
bash scripts/backup-restore-drill.sh
```

Run the non-destructive output-safety regression checks with:

```bash
bash -n scripts/backup-restore-drill.sh
bash -n scripts/backup-restore-drill.test.sh
bash scripts/backup-restore-drill.test.sh
```

## Drill program (3A-702 — Phase 2 A2)

### Targets — stated to be proven, not claimed achieved

- **RTO 4 hours** — service restored within 4 hours of a declared
  data loss.
- **RPO 24 hours** — no more than 24 hours of data lost, i.e. daily
  encrypted dumps at minimum.

These are the *initial* targets for a pre-release product with
synthetic data. They are proven by measuring the first drills, and
tightened only when the mechanism supports it — a target is never
tightened by editing this document.

### Cadence

- **Monthly** — the script against a disposable source and target,
  measuring dump/restore durations against the RTO.
- **Quarterly** — the script against the actual production source and
  an isolated restore target (manager-side — see prerequisites
  below).
- **Annually** — a full restore into a fresh environment, with the
  production smoke (`scripts/production_smoke.py`) run against the
  restored database.

### Pass criteria

A drill passes only when all of these hold:

1. Dump + restore complete within the RTO target.
2. The restored table count matches the source (`DRILL TABLES`).
3. The restored Alembic revision matches the source.
4. The production smoke passes against the restored database.
5. The evidence is recorded in `docs/RELEASE_EVIDENCE_REGISTER.md`
   (date, durations, table counts, operator).

### Evidence form

The script prints the evidence on every run:

```
DRILL TABLES: source=42 restored=42
DRILL TIMING: dump=12s restore=9s total=23s
```

A drill whose timing line is missing, or whose table counts differ,
is a failed drill — record it as such, do not re-run it until it
passes.

### Production-drill prerequisites (manager-side)

The production source's `DATABASE_URL` is a Vercel **Sensitive**
variable: write-only, never readable — not even by the person who
set it. A production-source drill therefore runs only with the
manager holding the credentials, and only with:

- `SOURCE_DATABASE_URL` from the secret manager;
- a newly created, empty, disposable restore target (verified in
  the provider console — never production);
- `BACKUP_PATH` outside the repository, in the approved encrypted
  backup location;
- `CONFIRM_ISOLATED_RESTORE_TARGET=YES` set only after verifying
  the target database identity in the provider console.

No CI job may run a production-source drill or receive production
secrets (repository rule, and the Owner decision of 2026-11-15).

## Release gate status

This repository now contains a guarded backup/restore drill script, but **the drill is not considered passed until it is run against the actual production source and an isolated restore target and the restored row counts / application smoke checks are recorded**. The current ChatGPT session does not have the production database credentials or an approved isolated restore target, and no backup provider/resource has been created.
