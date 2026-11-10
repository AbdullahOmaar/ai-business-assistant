#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
git config core.hooksPath .githooks
printf 'Git hooks enabled for this clone: %s/.githooks\n' "$repo_root"
printf 'CircleCI config changes will be validated before push.\n'
