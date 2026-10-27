# Platform Admin — Feature Scope and Delivery Plan

**Owner scope:** Platform-level administration across businesses/workspaces. This is separate from workspace OWNER/STAFF tools.
**Current candidate:** PR [#172](https://github.com/AbdullahOmaar/ai-business-assistant/pull/172), branch `feat/platform-admin-screen`.
**Release rule:** do not expose platform privileges by default; do not merge/deploy on the strength of a UI build alone. Keep production Firebase configuration, allowlists, data and deployment settings unchanged until the required release gates pass.

## Product boundary

The Admin Center is an operational control plane, not a back door into customer accounts or financial ledgers. Each capability must be backed by a server-enforced authorization decision, validated API contract, tested persistence behavior, auditable sensitive changes, and a clear failure state in the UI.

### Feature inventory

| Priority | Capability | Expected behavior / acceptance criteria | Current evidence | Status |
|---|---|---|---|---|
| P0 | Platform identity and access | Require a verified Firebase principal and explicit server-side `PLATFORM_SUPER_ADMIN_UIDS` allowlist; empty/missing allowlist denies access. Workspace OWNER/STAFF and client-supplied role headers cannot escalate. No hard-coded/default administrator. | Negative authorization tests and missing-verifier test pass in isolated sandbox. Browser-level verified identity test is still blocked by preview SSO. | IN_PROGRESS |
| P0 | Overview dashboard | Show real platform counts for businesses, member identities/memberships, invoices, payments, and audit events. Split monetary amounts by currency and (for invoices) status; disclose data limitations; show loading, stale/error and empty states. | Backend response/contract and currency grouping tests pass in isolated sandbox; web Preview build is READY on the app-code candidate. | IN_PROGRESS |
| P0 | Workspace directory | Search; active/inactive filter; bounded server pagination; allowlisted sort keys/direction; stable tie-break ordering; no unbounded data dumps. | Search/filter/pagination/sorting/invalid input tests pass in isolated sandbox. | IN_PROGRESS |
| P0 | Workspace details | Read workspace metadata and memberships/roles scoped to the selected workspace only. Never expose access tokens, credentials, or cross-workspace records. Do not pretend user names/emails exist when no supported identity-profile integration exists. | Cross-workspace membership test passes in isolated sandbox; missing names/emails explicitly disclosed. | IN_PROGRESS |
| P0 | Workspace suspension/reactivation | Require an explicit reason; authorize only platform allowlist; apply the state change and audit event atomically; concurrent updates must be checked against PostgreSQL; repeat of the same state must be idempotent. Ordinary business APIs must deny inactive workspaces. | Reason, audit actor, idempotence and event count tests pass against SQLite. PostgreSQL locking and end-to-end denial after suspension remain NOT RUN. | IN_PROGRESS |
| P0 | Audit viewer | Read-only and paginated; filter by action, actor, workspace and UTC date range; reject reversed dates and invalid input. Protect sensitive fields from unnecessary disclosure. No UI/API mutation or deletion of audit entries. | Filter/range/read-only tests pass in isolated sandbox. Global tamper-resistance, retention, and access to failed admin attempts still need operational evidence. | IN_PROGRESS |
| P0 | Permission transparency | Describe what platform admin can and cannot do; distinguish platform access from workspace roles; avoid implying features that are not backed by an API. Navigation is shown only after the server-side access probe succeeds. | Source reviewed; no authenticated browser session available to verify the actual menu/dashboard end-to-end. | IN_PROGRESS |
| P0 | Localization, responsive behavior, accessibility | Arabic RTL and English LTR; keyboard-operable controls, semantic labels, visible focus, accessible alerts, useful loading/error states, narrow-screen layout. | Component source includes RTL/LTR and status states. Dedicated Admin-specific accessibility/browser tests are NOT RUN. | TODO |
| P0 | Regression and release gates | Full backend suite, Admin-specific tests, compile, frontend tests/build, dependency audit, PostgreSQL migration/integration and auth-boundary tests must be tied to the reviewed source revision. No skipped/absent runner checks count as green. | Vercel Sandbox reconstructed the PR base backend and applied the Admin source: compile passed; Admin suite 11 passed after adding system-status coverage; full backend suite 155 passed / 1 skipped. The current frontend sources were then synchronized into the sandbox; frontend tests passed 5/5 and Angular production build completed. `pip-audit -r requirements.txt` and `npm audit --audit-level=high` found no known vulnerabilities in the dependency graphs scanned. Read-only `alembic current/check` against the non-default restored Neon drill branch returned `0003_business_workflows (head)` and `No new upgrade operations detected`. A real FastAPI/TestClient smoke against that PostgreSQL branch returned 200 for `/health`, `/readyz`, admin access, overview, businesses list and audit list; malformed mixed-timezone range returned 422 and non-allowlisted identity returned 403. This smoke uses a synthetic test principal resolver, not Firebase token signature/revocation verification; PostgreSQL status-write concurrency/rollback remains NOT RUN. The exact candidate Vercel API Preview build for commit `a03d79f16a085d2349f14a72b995eb1b821f6de4` is READY, target=preview (not production). CircleCI hosted run and Docker image build remain NOT RUN. | BLOCKED |

## Additional Admin capabilities — staged, not falsely advertised

| Priority | Capability | Acceptance criteria / dependency | Status |
|---|---|---|---|
| P1 | System status and release information | Read-only, least-information status: application version/commit, API/database readiness, Firebase verifier configuration, and timestamp of the current check. Never expose environment variables, secrets, connection strings, full exception traces or customer data. Configuration status must not be represented as validation of a specific Firebase token. | Backend endpoint, typed client contract and Arabic/English overview panel implemented. Unit/API tests cover healthy, degraded, denied and no-secret behavior; frontend tests/build and dependency audits passed in an isolated sandbox populated from the current branch sources. A hosted exact-head preview build is not available because the project's intentional Vercel Ignore Build Step canceled deployment without the release marker; no production release marker was added. | IN_PROGRESS |
| P1 | Security events and alerting | Record denied platform access and sensitive admin operations through structured logs/telemetry; include request/correlation ID, actor when verified, action, target, outcome and timestamp. Redact tokens, cookies, secrets and unnecessary personal data. Define alert thresholds and retention from an actual telemetry source. | JSON security logs now record allowlist-denied requests and successful workspace status changes with request ID, verified actor, target and outcome; tests verify redaction. Alerting, log retention, central collection and unverified-token denial telemetry still need an approved operational source. | IN_PROGRESS |
| P1 | Audit integrity and export | Restrict audit read access, preserve records against ordinary application modification, document retention, and provide bounded CSV export only if needed. Export itself must be logged and filtered; test CSV formula injection, output limits and redaction. | TODO |
| P1 | Operational support diagnostics | Safe, tenant-free error summaries and deployment/runtime events from an authorized provider; link to the source of truth. No customer payloads or raw logs in the UI by default. | TODO |
| P2 | User directory and invitations | Only after an approved Firebase Admin user-directory integration and a source of truth for profiles/status; no enumeration, invitations or email/name claims before that integration exists. Test cross-tenant privacy and invitation abuse. | DEFERRED |
| P2 | Global role/permission management | Define a durable role model, separation of duties, least privilege, two-person approval for sensitive grants, step-up authentication if supported, revocation and audit trails. Never let an administrator grant themselves additional privileges. | DEFERRED |
| P2 | Plans, quotas and billing | Display/manage entitlements only after an authoritative billing/plan source exists. Separate read-only visibility from writes. No plan changes or billing actions in this release. | DEFERRED |
| P2 | Financial corrections, refunds and destructive actions | Must use dedicated domain services, immutable correction records, explicit reasons, idempotency, concurrency/rollback tests, and additional approval where appropriate. No direct balance/payment edits, refunds, account impersonation, or workspace deletion in this release. | DEFERRED |
| P2 | Feature flags / maintenance controls | Only after a controlled server-side configuration source, blast-radius boundaries, expiry, rollback, authorization and audit semantics are defined. | DEFERRED |

## Ordered tasks and acceptance gates

### ADM-01 — Repair the test harness
- **Status: VERIFIED in isolated sandbox; committed to PR branch.**
- Ensure the Admin test module imports `pytest`; compile the changed modules.
- Acceptance: Admin tests collect and pass without fixture/import errors.
- Evidence: commit `862204611b51ea28d89c0b44c8f4ad51466be0fc`; targeted suite 8 passed.

### ADM-02 — Execute backend regression suite without GitHub Actions
- **Status: VERIFIED for the isolated sandbox run; exact Git tree provenance remains limited.**
- Use the already provisioned Vercel Sandbox, not a new paid runner.
- Acceptance: compile succeeds; full backend pytest suite passes with exact test output retained.
- Evidence: `python -m compileall -q app tests`; `python -m pytest -q --tb=short -p no:warnings` → **152 passed, 1 skipped in 5.96s** after reconstructing the PR's base backend: reverse-applying PR #170's backend-only delta, verifying Git blob SHAs against main for the five extant changed files, removing the PR #170-only regression test file, and applying PR #172's current API/test/main.py files. This is an exact main-backend + Admin source test result, but not a hosted exact-SHA CI attestation.

### ADM-03 — Security boundary and business lifecycle verification
- **Status: IN_PROGRESS.**
- Unit/API coverage verifies workspace membership does not grant platform privileges, unconfigured access fails closed, deactivation emits one audit event, inactive workspace access is denied by the standard membership authorization path, and mixed-timezone date filters do not return HTTP 500.
- Acceptance: real-PostgreSQL transactional/rollback/concurrency test and verified Firebase token flow in non-production; no test may use production data.
- Evidence: real PostgreSQL read-only endpoint smoke passed (6 key routes 200; invalid range 422; non-allowlisted principal 403). Authentication in this smoke used a synthetic test resolver and does not verify real Firebase token signature, revocation, or wrong-project rejection. Transactional status update under real PostgreSQL is NOT RUN.

### ADM-04 — Frontend/Admin experience validation
- **Status: IN_PROGRESS.**
- Verify compile/build and current API contract; add focused Admin UI tests for failed authorization (hide menu), loading/error/retry states, confirmation/reason validation, filtered pagination, language/RTL, and keyboard accessibility.
- Acceptance: frontend tests/build pass for source containing the current Admin code and a browser smoke test succeeds using an authorized non-production principal.
- Blocker: Vercel SSO intercepted the protected Preview before the application; no authorized test UID/session has been configured.

### ADM-05 — Independent CI alternative
- **Status: BLOCKED on provider onboarding; configuration exists in PR #173 but has not been run.**
- Use CircleCI as an independent CI provider for disposable PostgreSQL, backend tests/migrations, frontend checks/audits, and container build. Validate its config with CircleCI's own CLI/service and capture real run URL + exact SHA.
- Owner action needed: authorize/select this private repository in CircleCI and select the committed `.circleci/config.yml`. YAML parsing alone is not a pipeline result. Do not pay, increase billing, or bypass required checks.

### ADM-08 — Structured Admin security events
- **Status: IN_PROGRESS.**
- Emit single-line JSON events for verified principals denied by the platform allowlist and for successful workspace status changes.
- Acceptance: include timestamp, request ID, verified actor, outcome, and route/business target; never include Authorization/Cookie headers, token values, raw request bodies, status reason, or exception text.
- Evidence: focused Admin suite **13 passed**; full backend suite **157 passed, 1 skipped**. Tests parse log records and assert request ID/actor/target are present while sensitive fields and the business reason are absent.
- Remaining: no central telemetry connector/source is available; alert thresholds, retention, dashboarding, and logging of pre-route invalid/expired-token failures remain NOT RUN. Do not claim alerting is implemented.

### ADM-07 — Safe runtime status panel
- **Status: IN_PROGRESS.**
- Implement the authorized read-only `GET /api/v1/platform-admin/system-status` endpoint and display runtime/release status in the overview panel.
- Acceptance: show version, shortened commit, environment, database connectivity and whether the identity verifier is configured; report degraded/unconfigured states truthfully; never expose secrets/DSNs/exception text; reject non-allowlisted identities.
- Evidence: Admin API tests and full backend suite pass in the isolated sandbox (**155 passed, 1 skipped**); frontend type/build validation on the exact latest source is pending.
- Explicit limit: `checked_at` is the timestamp of the current check, not a historical uptime/last-success metric. Firebase verifier “configured” is not proof that a particular token is valid.

### ADM-06 — Reconcile evidence and merge
- **Status: BLOCKED pending the remaining release gates and exact-source review.**
- Refresh the PR head, main SHA, changed-file list, required status checks, branch protection and deployment targets immediately before merge.
- Acceptance: current PR head must have passing inspectable tests/build/dependency/PostgreSQL/container/security checks; no Admin-specific review findings; branch protections satisfied; merge commit verified on `main`.
- Do not change production allowlists/secrets, database or deployment configuration as a shortcut. Keep the Admin code fail-closed until an approved production platform principal is provisioned out-of-band.

## Security references

- OWASP Top 10 (2025): Broken Access Control, Security Misconfiguration, Authentication Failures, Security Logging and Alerting Failures, and Mishandling of Exceptional Conditions: https://top10.owasp.org/2025/
- OWASP Security Logging and Alerting Failures: https://top10.owasp.org/2025/A09_2025-Security_Logging_and_Alerting_Failures/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- NIST Role Based Access Control: https://csrc.nist.gov/projects/role-based-access-control
- CircleCI project setup for an existing repository/config: https://circleci.com/docs/guides/getting-started/create-project/
- Vercel Sandbox documentation: https://vercel.com/docs/sandbox

## Explicit exclusions for this delivery

No default admin, no user-controlled role/identity headers, no self-promotion, no unverified user enumeration, no global role editing, no workspace deletion, no account impersonation, no direct payment/refund/balance mutation, no mixed-currency aggregation, no secrets/log payload exposure, no production allowlist or migration change, no paid plan/runner change, and no claiming a preview build is proof of authenticated production behavior.


## Latest implementation checkpoint — 2026-10-27

The bounded audit CSV export endpoint and authenticated download control are implemented on the feature branch. Exact-source tests and preview validation are pending; this is not a production release.


Audit export validation remains in progress.

A fresh non-production frontend preview is requested after the API base normalization fix.
