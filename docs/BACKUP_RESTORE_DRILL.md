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

## Release gate status

This repository now contains a guarded backup/restore drill script, but **the drill is not considered passed until it is run against the actual production source and an isolated restore target and the restored row counts / application smoke checks are recorded**. The current ChatGPT session does not have the production database credentials or an approved isolated restore target, and no backup provider/resource has been created.
