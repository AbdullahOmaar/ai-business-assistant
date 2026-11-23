# Security verification — negative-permission proof & secrets scanning (3A-328)

Date: 2026-11-22. Batch branch `aiba/security-verification-3a-328` from `main`
`adbb4cd`. This batch changes no application code, no authorization policy, no
calculation and no permission; it adds a CI secrets gate, its configuration,
and this evidence document.

## 1. Unauthenticated requests — live production API

Checked 2026-11-22 against `https://ai-business-assistant-api.vercel.app`
with no credentials:

| Request | Result |
| --- | --- |
| `GET /api/v1/businesses` | 401 |
| `GET /api/v1/businesses/{id}/customers` | 401 |
| `GET /api/v1/businesses/{id}/dashboard` | 401 |
| `GET /api/v1/businesses/{id}/reports/tax-summary` | 401 |

Public by design: `/version`, `/health`, `/readyz`. The public API
documentation surface (`/docs`, `/openapi.json`) is a separate owner-gated
decision tracked in Linear 3A-348 and is not changed here.

## 2. Authenticated but unauthorized — two-account denial evidence

The denial cases the pre-production checklist asked to see documented, each
backed by a named test in the backend suite:

| Case | Test |
| --- | --- |
| Staff member denied sensitive business routes | `tests/test_api.py::test_staff_is_denied_sensitive_business_routes` |
| Foreign business denied profile, dashboard and mutation | `tests/test_core_features_api.py::test_foreign_business_profile_dashboard_and_mutation_are_denied` |
| Cross-business service access denied | `tests/test_services.py::test_cross_business_access_is_denied` |
| Denied platform-admin access emits a redacted structured security event | `tests/test_platform_admin_api.py::test_denied_platform_access_emits_redacted_structured_security_event` |

Local run on this batch's base tree (2026-11-22): **10 passed** (the four
tests above plus the six in §3). The full backend suite re-runs on the exact
PR head in CI (`backend-accounting`, gated by `all-checks-passed`).

## 3. AIBA-01 — duplicate stock recording: FIXED AND SHIPPED

The handover review item AIBA-01 ("duplicate stock recording") was located in
the handover record on 2026-11-22. Its "not fixed" note predates the same-day
fix; the item is closed with this evidence:

- Reproducing test: `tests/test_stock_movement_retry_reproduction.py::test_manual_stock_movement_retry_replays_without_duplicating`.
- Fix: Linear 3A-342, PR #420 — canonical-UUID `Idempotency-Key` required for
  stock movements, migration `0010_stock_movement_idem`, replay/conflict/scope
  covered by `tests/test_stock_movement_idempotency_api.py` (5 tests) plus a
  PostgreSQL schema test that runs in CI.
- Shipped: production API 1.6.5 verified live 2026-11-22 (`/version` 1.6.5,
  `/readyz` ready).

## 4. Secrets scanning

Baseline: `gitleaks detect` 8.30.1 over the full history (1,952 commits) on
2026-11-22 found 13 findings; every one is a verified false positive:

| Rule | Count | Where | Classification |
| --- | --- | --- | --- |
| `generic-api-key` | 6 | `frontend/src/app/aba-filter-bar.spec.ts`, `frontend/src/app/aba-search-field.spec.ts` | Synthetic fixture strings used as test data |
| `github-pat` | 4 | `tests/test_github_actions_slack_failure.py` | Deliberately fake tokens proving secret redaction |
| `gcp-api-key` | 3 | `frontend/public/runtime-config.json` | Firebase web-app key — a public client identifier shipped to every browser (documented as public in `docs/PRODUCTION_DEPLOYMENT.md`) |

Controls added by this batch:

- `.gitleaks.toml` allowlists exactly those rule+path pairs, each with its
  written justification. With the configuration in place, the same
  full-history scan reports **no leaks found**.
- Detection trial: a scratch directory holding a realistic fake AWS key pair
  and a fake GitHub PAT was scanned with the shipped configuration and
  produced **2 findings** — new secrets are caught.
- CI: a `secrets-scan` job (gitleaks-action v2, pinned to
  `ff98106e4c7b2bc287b24eaf42907196329070c7`) runs on pull requests, pushes to
  `main`, the weekly schedule and manual dispatch, and is wired fail-closed
  into `all-checks-passed`.
- GitHub secret scanning and secret-scanning push protection were **enabled**
  via the API on 2026-11-22 (enablement response verified: both `enabled`).
  The GitGuardian app check on PRs remains as an additional layer.

## 5. Remaining gaps — explicitly not claimed

- The exhaustive route × role × tenant negative matrix is **not** complete;
  the remaining scope stays tracked in `docs/SECURITY_ROUTE_INVENTORY.md`
  ("Remaining coverage gaps") and GitHub issue #276. §2 proves the documented
  cases, not every combination.
- Human penetration test: **DEFERRED** by manager decision 2026-11-22 —
  internal verification only for now; it reopens before public launch.
- Authenticated production smoke remains a separate tracked item and is not
  part of this proof.
