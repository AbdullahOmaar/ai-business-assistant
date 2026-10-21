# Security and production readiness audit — 2026-10-22

## Scope and evidence

This is a source-level audit of the merged integration commit `cde9a12745da5a62ac7f5bc03d1b8fcd59312f08` (PR #24). It is not a penetration test and does not establish production readiness. GitHub connector status lookup returned no combined status records and no PR-triggered workflow runs for the squash merge SHA; inspect the Actions UI and the branch's push-triggered runs before release.

## Verified in source

- `backend/app/firebase_auth.py` accepts only a Bearer token, calls Firebase Admin `verify_id_token(..., check_revoked=True)`, and creates a project-qualified principal. Missing Firebase configuration fails closed.
- `/readyz` returns 503 unless both the database session factory and trusted principal resolver are configured, then runs `SELECT 1`.
- Business workflow services call membership authorization and query records with the business/workspace identifier in scope in the reviewed paths.
- Frontend package manifest contains Angular/Firebase client dependencies and a build script. A live `npm audit` result was not available through the GitHub connector; CI audit must be inspected rather than inferred.
- PR #24 has a GitGuardian alert for a generic-password detector at `.github/workflows/ci.yml` line 21. The finding appears to point at a disposable CI PostgreSQL password, not a production credential, but must be checked in the GitGuardian incident UI. Never reuse that value outside CI.

## Findings requiring correction or verification

1. **CORS omits PUT (corrected in this branch):** `backend/app/main.py` allows GET/POST/PATCH/DELETE/OPTIONS but the settings API exposes PUT. Added PUT to the allow-list. CORS still requires exact configured origins.
2. **Repeated product lines can oversell stock:** `issue_invoice` checks each invoice line against the same current movement sum while SQLAlchemy autoflush is disabled. Aggregate quantities by product before checking and creating stock movements; add regression coverage.
3. **Sales-return approval lacks lifecycle revalidation:** approval must reject returns if the source invoice has been voided and must revalidate aggregate quantities across all approved returns while locking the invoice/return lines. Draft returns can otherwise become stale or concurrent approvals can over-credit inventory.
4. **Tenant isolation is not yet proven end-to-end:** source-level membership filters are not equivalent to negative integration tests. Test two independent Firebase subjects and workspaces against every list/detail/mutation/export/report/assistant route, including guessed IDs and role escalation.
5. **Firebase is code-configured, not production-verified:** no evidence in this audit confirms a Firebase project ID, Email/Password provider configuration, real ID-token acceptance/revocation behavior, or service-account/ADC availability in the deployment environment.
6. **Production runtime is not proven:** no verified Railway project/service/deployment, public backend URL, production PostgreSQL, secret configuration, or HTTP health/readiness smoke test is evidenced here.
7. **Invoice/payment lifecycle remains incomplete for release:** payment idempotency and transactional behavior need PostgreSQL concurrency tests; invoices with allocated payments need a refund/credit-note workflow rather than direct voiding. The Angular draft editor has been documented as single-line although the API supports multiple lines.
8. **Dependency audit and frontend deployment:** obtain a fresh `npm audit` against the lockfile and inspect the latest Vercel deployment commit/runtime config. Do not use a successful build as evidence of security or API connectivity.

## Release gates

- CI green on the actual PR head and merged main commit, including PostgreSQL migration upgrade/head validation, pytest, Angular production build and `npm audit --audit-level=high`.
- Regression tests for repeated invoice product lines and sales-return void/concurrency scenarios.
- Cross-tenant and owner/staff authorization integration tests using real Firebase test/emulator credentials where available; no test resolver treated as proof of production identity.
- Firebase and PostgreSQL secrets configured only in the chosen host's secret manager.
- Verified `/health`, `/readyz`, CORS preflight, valid-token success, invalid-token rejection, and business workflow smoke tests on staging.
- No production financial data mutation until all applicable release gates pass.

## Deployment note

No Railway resource was created or changed by this audit. Railway tool calls were unavailable in this execution context, so workspace/project existence and cost cannot be verified here. No production deployment is claimed.
