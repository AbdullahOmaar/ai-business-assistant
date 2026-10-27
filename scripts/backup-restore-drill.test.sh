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
