#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
config_path="${1:-$repo_root/.circleci/config.yml}"

if [[ ! -f "$config_path" ]]; then
  printf 'CircleCI config not found: %s\n' "$config_path" >&2
  exit 2
fi

if ! command -v circleci >/dev/null 2>&1; then
  cat >&2 <<'MESSAGE'
CircleCI CLI is required to validate .circleci/config.yml before pushing config changes.
Install it using the official instructions:
https://circleci.com/docs/guides/toolkit/how-to-install-the-circleci-cli/
Then rerun this preflight.
MESSAGE
  exit 127
fi

circleci config validate "$config_path"
