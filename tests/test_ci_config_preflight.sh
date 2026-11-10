#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd "$(dirname "$0")/.." && pwd)"
temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT
repo="$temp_root/repo"
fake_bin="$temp_root/fake-bin"
log="$temp_root/circleci.log"

mkdir -p "$repo" "$fake_bin"
git -C "$repo" init -q -b main
git -C "$repo" config user.name "CI preflight test"
git -C "$repo" config user.email "ci-preflight@example.invalid"
mkdir -p "$repo/.circleci" "$repo/.githooks" "$repo/scripts/ci"
cp "$source_root/.githooks/pre-push" "$repo/.githooks/pre-push"
cp "$source_root/scripts/ci/validate_circleci_config.sh" "$repo/scripts/ci/validate_circleci_config.sh"
cp "$source_root/scripts/ci/install_git_hooks.sh" "$repo/scripts/ci/install_git_hooks.sh"
printf 'version: 2.1\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .
git -C "$repo" commit -qm "baseline"
base_sha="$(git -C "$repo" rev-parse HEAD)"

bash "$repo/scripts/ci/install_git_hooks.sh"
[[ "$(git -C "$repo" config --get core.hooksPath)" == ".githooks" ]]

cat > "$fake_bin/circleci" <<'CIRCLECI'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CIRCLECI_STUB_LOG"
CIRCLECI
chmod +x "$fake_bin/circleci"
export PATH="$fake_bin:$PATH"
export CIRCLECI_STUB_LOG="$log"

printf 'version: 2.1\n# config changed\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .circleci/config.yml
git -C "$repo" commit -qm "change CircleCI config"
config_sha="$(git -C "$repo" rev-parse HEAD)"
printf 'refs/heads/feature %s refs/heads/feature %s\n' "$config_sha" "$base_sha" \
  | "$repo/.githooks/pre-push"
grep -Fq "config validate $repo/.circleci/config.yml" "$log"

printf 'docs only\n' > "$repo/docs.txt"
git -C "$repo" add docs.txt
git -C "$repo" commit -qm "docs only"
docs_sha="$(git -C "$repo" rev-parse HEAD)"
printf 'refs/heads/feature %s refs/heads/feature %s\n' "$docs_sha" "$config_sha" \
  | "$repo/.githooks/pre-push"
[[ "$(wc -l < "$log")" -eq 1 ]]

git -C "$repo" checkout -q -b new-feature
printf 'version: 2.1\n# new branch config change\n' > "$repo/.circleci/config.yml"
git -C "$repo" add .circleci/config.yml
git -C "$repo" commit -qm "new branch config change"
new_branch_sha="$(git -C "$repo" rev-parse HEAD)"
zero_sha="0000000000000000000000000000000000000000"
printf 'refs/heads/new-feature %s refs/heads/new-feature %s\n' "$new_branch_sha" "$zero_sha" \
  | "$repo/.githooks/pre-push"
[[ "$(wc -l < "$log")" -eq 2 ]]

echo "CircleCI config pre-push guard tests passed."
