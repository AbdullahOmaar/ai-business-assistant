#!/usr/bin/env bash
set -euo pipefail

: "${SOURCE_DATABASE_URL:?Set SOURCE_DATABASE_URL from the secret manager}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL for an isolated, disposable database}"
: "${BACKUP_PATH:?Set BACKUP_PATH to an absolute path outside the repository}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE from the secret manager}"
: "${CONFIRM_ISOLATED_RESTORE_TARGET:?Set to YES only after verifying the restore target is disposable}"

if [[ "$CONFIRM_ISOLATED_RESTORE_TARGET" != "YES" ]]; then
  echo "Refusing to restore without CONFIRM_ISOLATED_RESTORE_TARGET=YES" >&2
  exit 2
fi
if [[ "$SOURCE_DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Source and restore URLs must not be identical." >&2
  exit 2
fi
case "$BACKUP_PATH" in
  /*) ;;
  *) echo "BACKUP_PATH must be absolute." >&2; exit 2 ;;
esac

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd -- "$script_dir/.." && pwd -P)"
canonical_backup_path="$(realpath -m -- "$BACKUP_PATH")"
encrypted_backup="${BACKUP_PATH}.gpg"
canonical_encrypted_backup="$(realpath -m -- "$encrypted_backup")"
for candidate in "$canonical_backup_path" "$canonical_encrypted_backup"; do
  case "$candidate" in
    "$repo_root"|"$repo_root"/*)
      echo "Store backups outside the repository." >&2
      exit 2
      ;;
  esac
done
if [[ -e "$encrypted_backup" || -e "${encrypted_backup}.sha256" ]]; then
  echo "Backup output already exists; refusing to overwrite it: $encrypted_backup" >&2
  exit 2
fi

for command_name in pg_dump pg_restore psql gpg sha256sum realpath; do
  command -v "$command_name" >/dev/null || { echo "Missing required command: $command_name" >&2; exit 127; }
done

umask 077
mkdir -p "$(dirname -- "$BACKUP_PATH")"
temporary_directory="$(mktemp -d)"
trap 'rm -rf -- "$temporary_directory"' EXIT
raw_backup="$temporary_directory/production.dump"
restore_dump="$temporary_directory/restore.dump"

source_identity="$(psql "$SOURCE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local')")"
restore_identity="$(psql "$RESTORE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text, 'local')")"
if [[ "$source_identity" == "$restore_identity" ]]; then
  echo "Source and restore target resolve to the same database identity." >&2
  exit 2
fi

existing_objects="$(psql "$RESTORE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND ascii(c.relkind) IN (114, 112, 118, 109, 83)")"
if [[ "$existing_objects" != "0" ]]; then
  echo "Restore target is not empty; refusing to overwrite existing objects." >&2
  exit 2
fi

pg_dump --format=custom --no-owner --no-acl --dbname="$SOURCE_DATABASE_URL" --file="$raw_backup"
gpg --batch --yes --symmetric --cipher-algo AES256 --pinentry-mode loopback --passphrase-fd 3 --output "$encrypted_backup" "$raw_backup" 3<<<"$BACKUP_PASSPHRASE"
gpg --batch --yes --decrypt --pinentry-mode loopback --passphrase-fd 3 --output "$restore_dump" "$encrypted_backup" 3<<<"$BACKUP_PASSPHRASE"
pg_restore --list "$restore_dump" >/dev/null
pg_restore --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$restore_dump"
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SELECT version_num FROM alembic_version LIMIT 1;" >/dev/null
sha256sum "$encrypted_backup" > "${encrypted_backup}.sha256"

echo "Encrypted backup created: $encrypted_backup"
echo "Restore drill passed for isolated database: $restore_identity"
echo "Checksum file: ${encrypted_backup}.sha256"
