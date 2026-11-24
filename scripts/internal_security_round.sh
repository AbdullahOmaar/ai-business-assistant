#!/usr/bin/env bash
# Internal security round (docs/PENTEST_PROGRAM.md) — the repeatable
# checks of one internal penetration-test round. Run from the repo root:
#   bash scripts/internal_security_round.sh [--live]
# --live also runs the full production smoke; without it only the
# repo-only version-chain check runs (no live calls).
#
# Each check prints PASS, FAIL or SKIP. A SKIP is an environment limit
# (tool missing, registry policy), never a pass. Exit 0 only when no
# check FAILED; the CI jobs (secrets-scan, dependency audits) remain
# the hard enforcement on every PR.
set -uo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root" || exit 2
live=0
[[ "${1:-}" == "--live" ]] && live=1
# PYTHON_BIN: the Python that has pytest + pip-audit (a venv python in
# local runs; the CI environment's python in CI).
python_bin="${PYTHON_BIN:-python3}"

failures=0
skips=0

report() { # report <status> <name> <detail>
  printf '%s %s — %s\n' "$1" "$2" "$3"
  [[ "$1" == "FAIL" ]] && failures=$((failures + 1))
  [[ "$1" == "SKIP" ]] && skips=$((skips + 1))
}

# 1. Secret scan — working tree + full history, with the repo config.
# NOTE: run on a clean tree — stale build output (frontend/dist) and
# compiled test bytecode (__pycache__) carry the same allowlisted
# strings as their sources and trip the working-tree scan. CI scans
# history, where those artifacts never exist.
gitleaks_bin="${GITLEAKS_BIN:-$(command -v gitleaks || true)}"
if [[ -z "$gitleaks_bin" ]]; then
  report SKIP "gitleaks" "binary not found; install gitleaks 8.30.1 and set GITLEAKS_BIN (CI secrets-scan is the enforcement)"
else
  if "$gitleaks_bin" detect --config .gitleaks.toml --no-git >/dev/null 2>&1 \
     && "$gitleaks_bin" git . --config .gitleaks.toml >/dev/null 2>&1; then
    report PASS "gitleaks" "working tree + full history, 0 unallowlisted findings"
  else
    report FAIL "gitleaks" "scan reported findings or failed — inspect the output above"
  fi
fi

# 2. Backend dependency audit.
if "$python_bin" -m pip_audit -r backend/requirements.txt >/dev/null 2>&1; then
  report PASS "pip-audit" "no known vulnerabilities in backend/requirements.txt"
elif command -v pip-audit >/dev/null 2>&1; then
  if pip-audit -r backend/requirements.txt >/dev/null 2>&1; then
    report PASS "pip-audit" "no known vulnerabilities in backend/requirements.txt"
  else
    report FAIL "pip-audit" "vulnerabilities reported — inspect the output above"
  fi
else
  report SKIP "pip-audit" "pip-audit not installed (python -m pip install pip-audit); CI backend-dependency-audit is the enforcement"
fi

# 3. Frontend dependency audit.
if [[ -d frontend ]]; then
  npm_audit_output="$(cd frontend && npm audit --audit-level=high 2>&1)" || true
  if printf '%s' "$npm_audit_output" | grep -q "found 0 vulnerabilities"; then
    report PASS "npm-audit" "0 vulnerabilities at audit-level high"
  elif printf '%s' "$npm_audit_output" | grep -q "policy_denied"; then
    report SKIP "npm-audit" "sandbox registry policy denies the audit endpoint; CI frontend-dependency-audit is the enforcement"
  else
    report FAIL "npm-audit" "audit failed or reported vulnerabilities — inspect the output above"
  fi
fi

# 4. Authorization proof — the security test files.
if "$python_bin" -c "import pytest" >/dev/null 2>&1; then
  if "$python_bin" -m pytest backend/tests/test_route_role_tenant_matrix.py \
      backend/tests/test_settings_audit_events.py \
      backend/tests/test_platform_admin_api.py \
      backend/tests/test_platform_admin_export.py \
      backend/tests/test_demo_auth_api.py \
      backend/tests/test_csv_export_formula_injection_api.py \
      backend/tests/test_extended_route_snapshot_matrix.py \
      backend/tests/test_tenant_payroll_route_snapshots.py \
      backend/tests/test_api.py -q >/dev/null 2>&1; then
    report PASS "security-tests" "denial + owner-positive matrices, settings audit, platform admin, demo auth, CSV injection, snapshots"
  else
    report FAIL "security-tests" "a security test failed — run the files above with -q for details"
  fi
else
  report SKIP "security-tests" "pytest not available (set PYTHON_BIN to a Python with pytest)"
fi

# 5. Production smoke — repo-only by default, live with --live.
if [[ "$live" == "1" ]]; then
  if "$python_bin" scripts/production_smoke.py >/dev/null 2>&1; then
    report PASS "production-smoke" "live smoke exit 0 (all flows + no divergence)"
  else
    report FAIL "production-smoke" "live smoke failed — inspect the output (a divergence is a FAIL by design)"
  fi
else
  if "$python_bin" scripts/production_smoke.py --repo-only >/dev/null 2>&1; then
    report PASS "production-smoke" "repo-only chain check consistent (run with --live for the live flows)"
  else
    report FAIL "production-smoke" "repo version chain is inconsistent"
  fi
fi

echo "ROUND RESULT: failures=$failures skips=$skips"
[[ "$failures" == "0" ]]
