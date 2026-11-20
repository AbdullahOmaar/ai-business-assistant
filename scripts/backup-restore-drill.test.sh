#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/.." && pwd -P)"
backup_script="$script_dir/backup-restore-drill.sh"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

run_guard() {
  env SOURCE_DATABASE_URL='postgresql://source/db' \
    RESTORE_DATABASE_URL='postgresql://restore/db' \
    BACKUP_PATH="$1" BACKUP_PASSPHRASE='test-only' \
    CONFIRM_ISOLATED_RESTORE_TARGET=YES \
    FAKE_PSQL_MODE="${FAKE_PSQL_MODE:-distinct}" \
    FAKE_OBJECT_COUNT="${FAKE_OBJECT_COUNT:-0}" \
    PATH="$tmp/bin:$PATH" \
    bash "$backup_script" >"$tmp/stdout" 2>"$tmp/stderr"
}

# Existing encrypted backups and checksums must never be silently overwritten.
existing="$tmp/existing-backup"
printf 'preserve-me\n' > "${existing}.gpg"
if run_guard "$existing"; then
  echo 'FAIL: existing backup was not rejected' >&2
  exit 1
fi
grep -q 'Backup output already exists' "$tmp/stderr"
grep -q '^preserve-me$' "${existing}.gpg"
echo 'PASS: existing encrypted backup is preserved'

# Resolve output paths against the script's repository root, not the caller's cwd.
inside="$repo_root/.test-backup-guard-$$/backup"
if run_guard "$inside"; then
  echo 'FAIL: repository-local backup path was not rejected' >&2
  exit 1
fi
grep -q 'Store backups outside the repository' "$tmp/stderr"
[[ ! -e "${inside}.gpg" ]]
echo 'PASS: repository-local backup path is rejected'

# Stub every database/backup command so these checks cannot contact a real database.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/psql" <<'PSQL_STUB'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_PSQL_MODE:-distinct}" == "same_identity" ]]; then
  printf 'same-db|127.0.0.1\n'
elif [[ "$*" == *"current_database()"* ]]; then
  if [[ "$1" == "$SOURCE_DATABASE_URL" ]]; then
    printf 'source-db|127.0.0.1\n'
  else
    printf 'restore-db|127.0.0.2\n'
  fi
elif [[ "$*" == *"SELECT count(*) FROM ("* ]]; then
  printf '%s\n' "${FAKE_OBJECT_COUNT:-0}"
else
  echo 'FAIL: unexpected psql query' >&2
  exit 98
fi
PSQL_STUB
chmod +x "$tmp/bin/psql"
for command_name in pg_dump pg_restore gpg sha256sum; do
  cat > "$tmp/bin/$command_name" <<'COMMAND_STUB'
#!/usr/bin/env bash
echo "FAIL: unexpected external command: $0" >&2
exit 99
COMMAND_STUB
  chmod +x "$tmp/bin/$command_name"
done

# Identical database identities must be rejected before dump/restore commands run.
same_identity="$tmp/same-identity/backup"
if FAKE_PSQL_MODE=same_identity run_guard "$same_identity"; then
  echo 'FAIL: identical source/restore database identity was accepted' >&2
  exit 1
fi
grep -q 'same database identity' "$tmp/stderr"
[[ ! -e "${same_identity}.gpg" ]]
echo 'PASS: identical database identity is rejected'

# Non-empty target object catalogs must be rejected before pg_dump/pg_restore.
nonempty="$tmp/nonempty-target/backup"
if FAKE_OBJECT_COUNT=1 run_guard "$nonempty"; then
  echo 'FAIL: non-empty restore target was accepted' >&2
  exit 1
fi
grep -q 'Restore target is not empty' "$tmp/stderr"
[[ ! -e "${nonempty}.gpg" ]]
echo 'PASS: non-empty restore target is rejected'
