# Security verification campaign (3A-703 — Phase 2 B1, executing 3A-417)

Executed 2026-11-24 by the AIBA builder (حسو) under B1; PR-level
independent review by the QA department. This document is the
campaign record: the threat matrix, what was verified, with what
evidence, and what honestly remains open. It changes no permission,
route, or financial rule — the single code change is the audit-event
write that closes the settings gap (item 1 below).

## 3A-417 completion — the two named open items, closed

1. **Settings audit gap — FIXED.** `PUT /settings/{setting_key}`
   (`backend/app/extended_api.py`) committed with no AuditEvent row —
   the last named audit gap in `docs/SECURITY_ROUTE_INVENTORY.md`.
   It now writes `setting.created` / `setting.updated`
   (target `business_setting`) in the same transaction, following the
   established producer pattern. The change summary names the setting
   KEY only — values are never copied into the audit trail (the
   AuditEvent redaction rule). Frontend labels added
   (`audit-labels.ts` + ar/en catalogues + audit-workspace filters).
   Evidence: `backend/tests/test_settings_audit_events.py` (2 tests:
   create/update events without the value; rejected secret-like keys
   and STAFF denial write nothing).
2. **Owner-positive cases — CONSOLIDATED into one proof set.** The
   route × role × tenant matrix proved denials comprehensively
   (unauthenticated 401, non-member 403, cross-tenant 403, STAFF per
   the access model, with byte-identical snapshots), but the OWNER's
   positive cases lived in scattered targeted suites. New
   `test_owner_positive_matrix` in
   `backend/tests/test_route_role_tenant_matrix.py` fires **every
   route in the registry (89/89)** as the actor who should pass —
   the business owner, and a configured platform super admin for the
   platform routes — and requires a 2xx on each. Authorization is
   now proven symmetric: denied for everyone else, usable by the
   owner. The registry test still guarantees the matrix cannot rot
   (a route added without a matrix entry fails the suite).

**Findings surfaced by the positive pass (all controls working):**

- **Payroll separation of duties is real:** payroll approval returns
  409 "Payroll must be approved by a different owner than its
  creator" — the second-approval differentiator already exists in
  the product for payroll. The positive test approves (and pays) as
  a second owner.
- **Idempotency-Key headers are enforced** on stock movements and
  purchase-order receipts (canonical UUID, 422 without) — denied
  actors never reached these checks before.
- **Sales-return approval requires a recorded reason** on the return
  (422 without) — the F-407-01 control, verified end-to-end.

## Threat matrix

| # | Threat | Control | Verification | Evidence | Verifier |
|---|--------|---------|--------------|----------|----------|
| T1 | Cross-tenant data access (business B reads/writes business A) | Membership-scoped authorization on every business route; tenant filters in queries | Denial matrix fires every route as the owner of ANOTHER business: 403 + byte-identical snapshots of both businesses | `test_route_role_tenant_matrix.py` (denial + registry tests) | B1 campaign (this doc) |
| T2 | Privilege escalation (STAFF or non-member reaches owner-only routes) | `owner_only` authorization per route; role model in the matrix registry | Denial matrix: non-member 403 everywhere; STAFF pinned per documented access model (deny = 403 + no side effects) | Same file; `docs/SECURITY_ROUTE_INVENTORY.md` | B1 campaign |
| T3 | Unauthorized platform administration | Platform role grants (viewer/operator/user_manager) + out-of-band super-admin subjects; every platform route permission-checked | Platform rows of both matrices (denied for business actors; positive for a configured super admin); delegated-role granularity in the platform suite | `test_platform_admin_api.py`, matrix file | B1 campaign |
| T4 | Secrets leaking into the repo or logs | gitleaks with the default rule set EXTENDED (never replaced) + GitHub secret scanning & push protection; allowlist entries carry reasons | `.gitleaks.toml` read and confirmed: `[extend] useDefault = true` present (the 3A-328/3A-407 zero-rules flaw stays fixed); CI `secrets-scan` job is a hard gate in `all-checks-passed` | `.gitleaks.toml`; `.github/workflows/ci.yml`; `docs/SECURITY_NEGATIVE_PROOF_2026-11-22.md` §4 | B1 campaign (config read); CI (every PR) |
| T5 | Unaudited business mutations | AuditEvent written by every mutating producer, in the same transaction | Producer inventory re-checked during this campaign; the one gap found (settings PUT) is fixed + tested (item 1 above); denied requests proven to append no events | `test_settings_audit_events.py`; denial-matrix snapshot discipline | B1 campaign |
| T6 | Injection & unsafe input (SQL, CSV formula, oversized payloads) | ORM-bound queries; CSV formula-injection guard; key/payload validation (setting keys reject secret-like names) | Dedicated suites: `test_csv_export_formula_injection_api.py`, validation tests in `test_api.py` | Backend suite (513 passed locally in this campaign) | B1 campaign |
| T7 | Unauthorized or unilateral financial writes | Owner-only payments/payroll routes; payroll separation of duties (different-owner approval); idempotency keys on stock movements & receipts | Positive + denial matrices; the 409 separation-of-duties response observed live in the positive pass | Matrix file; `test_credit_note_reason_required.py` | B1 campaign |
| T8 | Auth bypass / demo-token misuse | Firebase principal resolution; demo session rate limiter with committed DB counters; fail-closed 503 without DB or identity | Fail-closed tests; demo flows in the production smoke (A1) | `test_api.py` fail-closed tests; `scripts/production_smoke.py` | B1 campaign |
| T9 | Sensitive derived-data exposure (payroll amounts leaking to STAFF via reports/exports) | Payroll-expense visibility scoping by role across reports and AI context | `test_financial_report_tenant_privacy.py` (runs in CI; see the local-environment note below) | CI | QA / CI |
| T10 | Vulnerable dependencies | CI dependency audits (npm audit + pip-audit) as gates | CI jobs on every PR | `.github/workflows/ci.yml` | CI |
| T11 | Production surface exposure (docs endpoints, missing headers) | API docs gated 404 in production; security headers on the web shell (CSP, DENY framing, nosniff, HSTS…) | Live check 2026-11-24 ~19:36 EET: smoke flows `web-shell` PASS (headers present), `api-docs-gated` PASS (/docs, /redoc, /openapi.json all 404) | `scripts/production_smoke.py` run record (below) | B1 campaign |

**Live run record (2026-11-24 ~19:36 EET):** production smoke —
security-relevant flows PASS (web-shell, web-version, api-health,
api-version, api-readyz, api-docs-gated, demo-session, demo-auth,
demo-write-cycle); one transient transport failure on the
demo-reads invoices call (HTTP 0 after retries — the cold-instance
connection drops recorded in A1, not a security flow); the standing
API version divergence (live API 1.13.0 vs chain 1.17.0) remains
exactly as recorded in A1 — the manager's API release step, not a
B1 item.

**Local run record (this campaign):** full backend suite 513
passed / 14 skipped (excluding
`test_financial_report_tenant_privacy.py`, which fails identically
on unmodified main in this sandbox's Python 3.12.3 environment and
passes in CI — a recorded pre-existing environment failure, not a
campaign finding); frontend unit suite 809/809; Ruff zero on
`app tests`.

## What remains open — honestly

- **Authenticated production smoke with a real account** — never
  run; needs a real business/platform account (manager/owner side).
  The demo-account flows are proven; a real account's are not.
- **External penetration test** — B2's scope; internal preparation
  first, external execution is an OWNER decision (spend). Per
  3A-417's constraint, pen testing was deferred by manager decision
  to before the public launch.
- **Physical-device / installed-PWA / screen-reader acceptance** —
  recorded Phase 1 follow-up, still never run.

## The completion plan going forward (3A-417's plan, executed)

- Every new route joins the matrix registry or the registry test
  fails — positive and denial proof stay symmetric by construction.
- Every new mutating producer writes its AuditEvent in the same
  transaction, with a redacted summary; the audit-labels map gains
  the new action/target in the same change.
- The campaign re-runs per phase: this document is the Phase 2
  instance; B2 (pen-test program) consumes the open items above.
