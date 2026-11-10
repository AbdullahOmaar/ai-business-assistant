#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd "$(dirname "$0")/.." && pwd)"
temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT
repo="$temp_root/repo"
fake_bin="$temp_root/fake-bin"
log="$temp_root/circleci.log"
snapshots="$temp_root/config-snapshots.log"

mkdir -p "$repo" "$fake_bin"
git -C "$repo" init -q -b main
git -C "$repo" config user.name "CI preflight test"
git -C "$repo" config user.email "ci-preflight@example.invalid"
mkdir -p "$repo/.circleci" "$repo/.githooks" "$repo/scripts/ci"
cp "$source_root/.githooks/pre-push" "$repo/.githooks/pre-push"
cp "$source_root/scripts/ci/validate_circleci_config.sh" "$repo/scripts/ci/validate_circleci_config.sh"
cp "$source_root/scripts/ci/install_git_hooks.sh" "$repo/scripts/ci/install_git_hooks.sh"
printf 'version: 2.1\n# baseline\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .
git -C "$repo" commit -qm "baseline"
base_sha="$(git -C "$repo" rev-parse HEAD)"

(cd "$repo" && bash scripts/ci/install_git_hooks.sh)
[[ "$(git -C "$repo" config --get core.hooksPath)" == ".githooks" ]]

cat > "$fake_bin/circleci" <<'CIRCLECI'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "config" && "$2" == "validate" ]]
printf '%s\n' "$3" >> "$CIRCLECI_STUB_LOG"
cat "$3" >> "$CIRCLECI_STUB_SNAPSHOTS"
printf '\n---\n' >> "$CIRCLECI_STUB_SNAPSHOTS"
if grep -q 'INVALID_CONFIG' "$3"; then
  exit 42
fi
CIRCLECI
chmod +x "$fake_bin/circleci"
export PATH="$fake_bin:$PATH"
export CIRCLECI_STUB_LOG="$log"
export CIRCLECI_STUB_SNAPSHOTS="$snapshots"

# A valid outgoing commit must be validated from its committed snapshot,
# even when the contributor has an invalid uncommitted working-tree edit.
printf 'version: 2.1\n# committed-valid\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .circleci/config.yml
git -C "$repo" commit -qm "valid config change"
valid_sha="$(git -C "$repo" rev-parse HEAD)"
printf 'INVALID_CONFIG working-tree-only\n' > "$repo/.circleci/config.yml"
printf 'refs/heads/feature %s refs/heads/feature %s\n' "$valid_sha" "$base_sha" \
  | (cd "$repo" && .githooks/pre-push)
grep -Fq '# committed-valid' "$snapshots"
! grep -Fq 'working-tree-only' "$snapshots"

# An invalid outgoing commit must fail even if the working tree was fixed
# after the commit; this catches validation of the wrong file.
printf 'INVALID_CONFIG committed-invalid\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .circleci/config.yml
git -C "$repo" commit -qm "invalid config change"
invalid_sha="$(git -C "$repo" rev-parse HEAD)"
printf 'version: 2.1\n# working-tree-fixed\n' > "$repo/.circleci/config.yml"
if printf 'refs/heads/feature %s refs/heads/feature %s\n' "$invalid_sha" "$valid_sha" \
  | (cd "$repo" && .githooks/pre-push); then
  echo "Expected invalid committed config to block push." >&2
  exit 1
fi
grep -Fq 'committed-invalid' "$snapshots"
! grep -Fq 'working-tree-fixed' "$snapshots"

# Docs-only pushes must not invoke CircleCI validation.
git -C "$repo" checkout -q -- .circleci/config.yml
printf 'docs only\n' > "$repo/docs.txt"
git -C "$repo" add docs.txt
git -C "$repo" commit -qm "docs only"
docs_sha="$(git -C "$repo" rev-parse HEAD)"
printf 'refs/heads/feature %s refs/heads/feature %s\n' "$docs_sha" "$invalid_sha" \
  | (cd "$repo" && .githooks/pre-push)
[[ "$(wc -l < "$log")" -eq 2 ]]

# New branches use main as the base when the remote SHA is all zeroes.
git -C "$repo" checkout -q -b new-feature
printf 'version: 2.1\n# new branch config change\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .circleci/config.yml
git -C "$repo" commit -qm "new branch config change"
new_branch_sha="$(git -C "$repo" rev-parse HEAD)"
zero_sha="0000000000000000000000000000000000000000"
printf 'refs/heads/new-feature %s refs/heads/new-feature %s\n' "$new_branch_sha" "$zero_sha" \
  | (cd "$repo" && .githooks/pre-push)
[[ "$(wc -l < "$log")" -eq 3 ]]

echo "CircleCI config pre-push guard tests passed."
