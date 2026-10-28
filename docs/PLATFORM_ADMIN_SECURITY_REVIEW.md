# Platform Admin Security Review & Hardening

Date: 2026-10-28  
Repository: `AbdullahOmaar/ai-business-assistant`  
Baseline `main`: `068b0b4825765684078c3db44ecd9cafbb7e1cf4`  
Status: evidence-based review in progress; this is not a production-readiness attestation.

## Executive summary

- The Platform Admin API is a FastAPI router with a server-side bootstrap allowlist and database-backed delegated platform roles. Workspace membership roles remain a separate authorization domain.
- This review branch fixes two confirmed edge cases: absent-role revocation no longer writes a false revoke event, and failed overview/runtime refreshes clear stale snapshots.
- Firebase identity resolution verifies ID tokens with revocation checking, validates the configured project's audience and issuer, and emits project-qualified subjects.
- Existing code uses explicit permission checks for the main read/write endpoints. Workspace status changes and delegated role changes persist their corresponding audit records in the same database transaction as the mutation.
- PR #223 merged to `main` as `8626ce2a30ae9a343bc9e8c72a0d98b6c5aa3890`; all four CircleCI contexts passed on that merge SHA (backend-container 882, frontend-quality 881, backend-accounting 883, frontend-browser-smoke 884). Follow-up PR #224 adds workspace-status/audit rollback coverage. Its initial backend-accounting run failed; the test harness was corrected to return HTTP 500 instead of re-raising, and the latest PR head awaits exact-head CI.
- Current `main` is `8626ce2a30ae9a343bc9e8c72a0d98b6c5aa3890`. Vercel lists READY production API deployment `dpl_5VH6yC7nN8oTPS65Z78rTAaJFErA` at this exact SHA. The latest listed READY production Web deployment `dpl_3PLEvrGRx6rb6hamkVNV5Nq5is9K` is at older SHA `8a1ebbfe334980b02795e238be05fad560bd4f28`; no Web deployment for current main was listed. Its build succeeded but warned that the initial JS bundle is 730.87 kB, 30.87 kB above the 700 kB budget. The GitHub Vercel Web status reports a build-rate-limit failure. Authenticated production Admin workflows remain unverified; no deployment was triggered by this review.

## Architecture and route inventory

| UI action / area | API route | Authorization | Data source / mutation | Audit and test evidence |
| --- | --- | --- | --- | --- |
| Resolve admin access and effective permissions | `GET /api/v1/platform-admin/access` | Verified principal; bootstrap allowlist or active DB grants | Firebase-derived principal + `PlatformRoleGrant` rows | Denials emit structured security logs. Existing API tests cover default deny and delegated access. |
| Runtime status | `GET /api/v1/platform-admin/system-status` | `view_system_status` | DB `SELECT 1`, environment/version metadata | Returns dependency status without secrets; tests cover healthy/degraded status and denial. |
| Platform overview | `GET /api/v1/platform-admin/overview` | `view_overview` | Global workspace, membership, invoice, payment, and audit aggregates; totals grouped by currency | Read-only; tests cover counts and currency separation. |
| Search/list workspaces | `GET /api/v1/platform-admin/businesses` | `view_workspaces` | `Business` and membership count; bounded search, sorting and pagination | Tests cover search/status/pagination and bounded parameters. |
| Inspect workspace and memberships | `GET /api/v1/platform-admin/businesses/{business_id}` | `view_workspaces` | One workspace and its membership subjects/roles | Read-only; tests verify membership scope to the requested workspace. |
| Activate/deactivate workspace | `PATCH /api/v1/platform-admin/businesses/{business_id}/status` | `manage_workspace_status` | Row-locked workspace update; reason required | `AuditEvent` persisted in the same transaction; tests cover reason, audit event and idempotence. |
| View audit events | `GET /api/v1/platform-admin/audit-events` | `view_audit` | Filtered, bounded `AuditEvent` query | Read-only; tests cover filtering and date validation. |
| Export audit CSV | `GET /api/v1/platform-admin/audit-events/export.csv` | `view_audit` | Bounded export, max 5,000 rows plus one-row truncation probe | Formula-cell helper, UTF-8 BOM, `Cache-Control: no-store`, row-count/truncation headers, structured security log. Two regression tests added. On code/test commit `7978e5e66f4869faf284074736f24a8193c715ae`, CircleCI `backend-container`, `backend-accounting`, `frontend-quality`, and `frontend-browser-smoke` all passed (runs 813–816). Local test execution was not available in this environment. |
| Browse Firebase users | `GET /api/v1/platform-admin/users` | `view_users` | Firebase Admin user directory; DB maps for platform roles and workspace memberships | Exact UID/email search, opaque cursor pagination, disabled-account metadata, no credentials returned. Tests cover pagination, exact lookup, no match and delegated-role boundary. |
| Grant/revoke delegated platform role | `POST /api/v1/platform-admin/users/{user_uid}/roles` | Bootstrap super-admin allowlist only | `PlatformRoleGrant` mutation | Rejects self-grant and root grant; checks target Firebase account on activation; `PlatformAdminAuditEvent` is committed atomically with grant change. Existing tests cover disabled/missing accounts, Firebase outage and audit persistence. |
| View platform role audit | `GET /api/v1/platform-admin/role-audit-events` | `view_audit` | Paginated `PlatformAdminAuditEvent` | Read-only; dedicated tests should continue to cover actor, target, role, reason and pagination. |

### Frontend wiring inspected

File: `frontend/src/app/platform-admin.component.ts`  
Client: `frontend/src/app/api.service.ts`

Observed UI flows include access refresh, system status, overview, user search/pagination, selecting a user, role grant/revoke, role-audit loading, workspace search/details/status update, audit filtering and CSV export. The component uses Arabic RTL / English LTR, error alerts, success status announcements, retry controls, and section navigation. Full browser/keyboard/screen-reader/mobile verification is not established by source inspection alone.

### Workspace membership boundary

Files inspected: `backend/app/security.py`, `backend/tests/test_membership_management_api.py`. The authorization primitive scopes membership by both workspace ID and principal subject and rejects inactive workspaces. Existing membership tests cover owner list/change, non-owner denial, last-owner protection and rejection of extra payload fields. This review branch adds cross-workspace list/patch/delete IDOR regression coverage; it awaits exact-head CI. Concurrent last-owner changes and production PostgreSQL locking behavior still need explicit verification.

## Permission matrix observed in code

| Capability | Super Admin | Platform Viewer | Workspace Operator | User Manager |
| --- | --- | --- | --- | --- |
| `view_overview` | Yes | Yes | Yes | Yes |
| `view_workspaces` | Yes | Yes | Yes | Yes |
| `view_audit` | Yes | Yes | Yes | Yes |
| `view_system_status` | Yes | Yes | Yes | Yes |
| `view_users` | Yes | No | No | Yes |
| `manage_workspace_status` | Yes | No | Yes | No |
| `manage_platform_roles` | Yes | No | No | No |

The super-admin permission set is derived from the configured server-side allowlist; the three delegated roles are read from active database grants. Workspace `OWNER`/`STAFF` membership does not itself grant platform access.

## Findings and risks

### Confirmed from current evidence

1. **False audit event for absent role revocation — merged and CI-verified.** PR #223 merged as `8626ce2a30ae9a343bc9e8c72a0d98b6c5aa3890`; its four CircleCI contexts passed on the merge SHA. The regression test asserts no grant row or revoke event is created.
2. **Stale admin snapshots after failed refresh — merged and CI-verified.** The component clears overview/runtime snapshots after failed refresh; PR #223's four CircleCI contexts passed on the merge SHA, including frontend browser smoke.
3. **Web/API deployment parity is partial.** API production is on current main SHA `8626ce2a30ae9a343bc9e8c72a0d98b6c5aa3890`; latest listed Web production remains on older SHA `8a1ebbfe334980b02795e238be05fad560bd4f28`, and the Vercel Web status reports a build-rate-limit failure. This mismatch is an operational release blocker, not proof of an application vulnerability.
4. **CSV export hardening — merged and CI-verified.** Tests cover formula neutralization, bounded export metadata, no-store behavior, and denial without audit permission; all four CircleCI contexts passed on PR #223's merge SHA.
5. **Cross-workspace membership IDOR regression — merged and CI-verified.** The test checks that an owner of Workspace A cannot list, change, or remove a known membership in Workspace B; PR #223's exact merge SHA passed all four CircleCI contexts.
6. **Production authenticated Admin E2E has not been run in this review.** Public readiness and version endpoints do not validate a signed-in user's role enforcement or the complete browser workflow.

### Risks requiring more evidence / follow-up

- **Export audit durability:** the export route emits a structured application security log but does not visibly persist an export event to `PlatformAdminAuditEvent`. Confirm the required audit-retention policy and log durability before treating this as a defect.
- **Concurrent last-owner protection:** unit tests prove sequential protection, but do not establish race safety under concurrent PostgreSQL transactions.
- **Revocation behavior:** Firebase token revocation is checked by the identity adapter; delegated platform grants are read from the DB per authorization resolution. Measure actual revocation latency in an integration test rather than inferring it.
- **Role and membership data minimization:** global user listings include email, account status, platform roles and workspace membership names/roles. Confirm this breadth is intentional for `user_manager` and the product's privacy model.
- **System status semantics:** the endpoint reports identity configuration, not verification of a particular token; its response includes that limitation. Keep this distinction visible in UI and runbooks.
- **Bootstrap configuration naming:** `PLATFORM_SUPER_ADMIN_UIDS` is compared against project-qualified subjects (`firebase:{project_id}:{uid}`). Check deployment documentation/configuration examples for consistency before changing behavior.

## Prioritized next work

| Task | Priority | Next action | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| ADM-01 | P0 | Reconcile current main SHA with both Vercel deployment source SHAs and aliases after quota permits. | Exact deployed SHA/version and safe health checks; no deployment without approval. | IN_PROGRESS |
| ADM-02 | P0 | Keep this route inventory aligned with actual UI/API behavior; map remaining component states and test IDs. | Every admin action mapped to route, authorization, persistence, audit and test. | IN_PROGRESS |
| ADM-03/04 | P0 | Expand explicit negative tests for invalid/expired/revoked tokens, missing verifier, role boundaries and endpoint-by-role access. | Tests pass on exact head and authorization matrix is covered. | IN_PROGRESS |
| ADM-05/06 | P0 | Add integration coverage for grant revocation and concurrent last-owner mutations against PostgreSQL. | Deterministic concurrent test; no ownerless workspace or stale grant acceptance beyond documented limits. | NOT RUN |
| ADM-07/09 | P0 | Confirm persistent audit requirements and review sensitive data returned to each delegated role. | Written policy/evidence and regression tests for audit failure and least privilege. | NOT RUN |
| ADM-08/13 | P1 | Run the new CSV export tests, then add missing edge cases if they reveal gaps. | Exact-head CircleCI success; formula, authorization, bounds and response headers verified. | IN_PROGRESS |
| ADM-10/11/12/14 | P1 | Run frontend unit/build and Playwright checks for errors, empty states, RTL/LTR, keyboard and mobile. | Test output and accessibility review; do not infer from source alone. | NOT RUN |
| ADM-15/16 | P1 | Define release/rollback gates and verify after explicit release authorization. | Candidate SHA, green required checks, deployment SHA/version, health and safe smoke evidence. | NOT RUN |

## References consulted

- [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) — verification requirements for application security controls.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — deny-by-default, least privilege, and server-side authorization on every request.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — security event logging and minimizing sensitive log content.
- [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/) — authentication, authorization, input validation and business-logic test methodology.
- [Firebase Admin ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) and [session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions) — token verification and revocation-check behavior.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) — accessibility criteria for the planned frontend review.
- [NIST Separation of Duty glossary](https://csrc.nist.gov/glossary/term/separation_of_duty) — separation-of-duty principles for privileged operations.

## Access and release blockers

- GitHub branch-protection API returned HTTP 403 `Resource not accessible by integration`; repository rulesets API returned HTTP 403 stating the feature is unavailable for this repository plan. Branch protection requirements therefore remain **unverified**, not absent.
- The public API Admin access probe could not reach the app because Vercel deployment authentication blocked the fetch tool and the direct web fetch was inaccessible. Do not infer the app's HTTP authorization result from this probe.
- Follow-up PR #224 current head is tracked in GitHub; exact-head CI must pass before merge. Its earlier backend-accounting run failed, and the test harness was adjusted in commit `719b0ef9361993d5387351e2b5384d02ba877956`. Latest checks after the subsequent docs commit were still pending at the last status read.
- No production deployment was attempted. The task itself prohibits deployment without explicit release authorization.

## Release decision

**NO-GO for declaring Platform Admin production-ready.** API production matches current main, but Web production is behind and its Vercel status is blocked; authenticated Admin smoke, PostgreSQL concurrency evidence, full accessibility validation, and exact-head CI for follow-up PR #224 remain unresolved. No production data, secrets, identity configuration, deployment, promotion, or rollback was changed in this review.


## Operational rollback runbook (documented; NOT executed)

This runbook is a checklist, not evidence that rollback has been tested. It deliberately does not change production.

### Preconditions and decision

1. Declare an incident and identify the affected surface (Web, API, or both), current production deployment IDs, live `/version` response, and the last known-good deployment IDs/SHAs.
2. Confirm the candidate rollback target is a known-good deployment for the same project/environment and that its configuration and database schema remain compatible.
3. Record incident owner, reason, UTC timestamp, approval, current and target SHAs, and the intended validation/abort criteria. Never use a rollback to bypass release approval.

### Execute only with explicit release/incident authorization

1. Prefer the platform's deployment rollback/promote-to-known-good mechanism for the affected Vercel project. Do not rebuild source as a substitute for restoring a known-good artifact unless that is the approved plan.
2. Roll back Web and API independently only when evidence shows which surface is affected; keep their API contract and schema compatibility in view.
3. Do not revert or rewrite database migrations, delete records, rotate credentials, or change Firebase allowlists as part of an application rollback without separate explicit authorization and a reviewed data-recovery plan.
4. If the deployment platform reports quota, protection, or permission errors, stop the production change and escalate the exact error; do not bypass protection.

### Verification and closeout

1. Verify the active production aliases resolve to the intended deployment IDs and inspect each deployment's source SHA.
2. Check `/readyz` and `/version` for the API, then run approved, non-destructive authenticated Admin smoke tests: access/permission resolution, overview read, workspace list, audit read, and a denied request with a delegated role. Never perform a real role grant or workspace status mutation as a smoke test.
3. Check runtime logs and error rates for regressions; verify that the live API and Web builds are mutually compatible.
4. Record actual command/UI actions, timestamps, HTTP results, deployment IDs/SHAs, smoke outcomes, and remaining risks in `TASKS.md`. Rollback is VERIFIED only when all evidence is captured and reviewed.

### Current status

- Runbook written: yes.
- Rollback executed: **NOT RUN** (no incident/rollback authorization).
- Last-known-good deployment identity and schema compatibility: **NOT VERIFIED**.
- Production Admin authenticated smoke after rollback: **NOT RUN**.


## PostgreSQL last-owner concurrency regression — 2026-10-28

- ADM-06 follow-up status: **IN_PROGRESS**; exact final-head CI is pending.
- Added `backend/tests/test_membership_management_postgres_concurrency.py` to exercise concurrent owner demotion and owner removal against the disposable PostgreSQL service used by CircleCI. Existing SQLite coverage is insufficient evidence for `SELECT ... FOR UPDATE` behavior.
- The test asserts exactly one concurrent mutation succeeds, the workspace retains one OWNER, and exactly one matching audit event persists. It is gated on `CI_ALLOW_DATABASE_SCHEMA_TESTS=true` and a PostgreSQL `TEST_DATABASE_URL`; it does not create schema or access production.
- Current `main` rechecked at `f04c0e194b3afbefb56a979a5688f80d277b3ece`; its branch-policy changes were reconciled by merge commit `abf1e924821002dacd2a0478c5d4cf13db2ddd22`. The branch now compares 10 commits ahead and 0 behind main.
- Branch: `feat/platform-admin-membership-concurrency-20261028`; PR #238: https://github.com/AbdullahOmaar/ai-business-assistant/pull/238.
- Follow-up code review fixed UUID-typed SQLAlchemy filters/cleanup and avoided TestClient lifespan handling in worker threads. CircleCI on prior head `bbdb64d6a6388a5296756f0ad5b375e4191f8c12` passed all four contexts (1197–1200); after mainline sync, CircleCI contexts were pending on merge head `abf1e924821002dacd2a0478c5d4cf13db2ddd22` (runs 1217, 1218, 1220; backend-container also needs checking). The latest head changes with this documentation update; verify all four contexts on that exact head before merge.
- Local execution: **NOT RUN** (no local repository checkout/runtime available). GitHub Actions checks report failures but log download returned `404 BlobNotFound`; cause remains unverified.
- No production deployment, identity configuration, or production data mutation was performed.
- Production readiness remains **NO-GO / NOT VERIFIED** until PostgreSQL concurrency evidence passes, WCAG 2.2 AA keyboard/screen-reader/mobile checks are completed, authenticated Admin smoke is run with authorization, and Web/API deployed SHA parity is established.


- Latest observed CI checkpoint before this documentation commit: candidate `70933ee7d378e473b5798e3874af0c5fb98056ed` had CircleCI backend-container **PASS** (1225), frontend-quality **PASS** (1227), backend-accounting **FAIL** (1226), frontend-browser-smoke **PENDING** (1228). PR remains Draft.
- The backend-accounting run's detailed output is inaccessible through available connectors; a CircleCI page open returned an access error, and GitHub Actions job-log downloads returned `404 BlobNotFound`. Root cause is **UNVERIFIED**. Do not make speculative code changes or merge until the actual failure details are available. The next documentation commit changes the candidate SHA and requires a fresh exact-head check.


## ADM-06 backend-accounting teardown defect — 2026-10-28

- Reproduced a deterministic fixture-cleanup error in the PostgreSQL last-owner race test: `business_id` is retained as a UUID object, while three cleanup filters attempted to wrap it with `UUID(...)`, raising `AttributeError` during teardown.
- Replaced those three wrappers with the already-typed UUID value. The test's `UUID(business_id)` conversion remains where the fixture yields the business ID as a string.
- Disposable PostgreSQL 16 diagnostic run: before fix, assertions completed but teardown errored; after fix, **1 passed**. The sandbox uses a prior application snapshot, not an exact checkout of the PR SHA. This is targeted defect evidence only; exact-head CircleCI remains the merge gate.
- Fix commit: `addc50f1a6e2dfd792b50b608bc52fec85c8010c`. Keep PR #238 Draft until all four CircleCI contexts pass on the final head and review/protection requirements are satisfied.


## ADM-06 verification refresh — 2026-10-28 01:14 UTC

- Candidate source SHA with completed CircleCI validation: `df9af849b9dea593c9091107573341af956e9f73`. All four CircleCI contexts passed on that SHA: backend-container (1241), backend-accounting (1242), frontend-quality (1243), frontend-browser-smoke (1244).
- GitHub Actions on the same candidate SHA concluded failure for Backend tests (run 680), Verify backend container (run 818), Verify backend and frontend (run 1396), and Dependency security scan (run 1097). Job-step summaries are empty and log retrieval returns HTTP 404 `BlobNotFound`; causes remain UNVERIFIED. No Actions rerun was attempted because the current task ledger records the runner allowance as exhausted.
- PR #238 is still open and Draft with no recorded reviews. Branch protection/review requirements remain unverified because the connected integration returned HTTP 403. No merge or deployment is authorized by this evidence.
- Documentation update commit on the feature branch: `92c91427ad3f3cec17e290df886a91c101a6bb07` (TASKS.md). This docs-only commit creates a new PR head and therefore requires fresh exact-head status verification before any merge decision.
- Local test execution, production authenticated Admin smoke, full WCAG 2.2 AA validation, and Web/API deployed SHA parity: NOT RUN / NOT VERIFIED. Production remains NO-GO.


## CircleCI-first verification — 2026-10-28 01:19 UTC

- CircleCI passed all four contexts on source SHA `efa94afff7c8e9c9642763e2c5f743e77bfab022`: backend-container (1256), backend-accounting (1253), frontend-quality (1254), frontend-browser-smoke (1255). This covers the PostgreSQL last-owner concurrency regression on that exact candidate.
- CI configuration review confirms CircleCI runs the disposable PostgreSQL backend suite, migration/schema-drift checks and offline SQL generation, Python/npm audits, frontend build (which runs npm tests), backup/restore shell safety tests, backend image build/import check, and Chromium Playwright E2E.
- GitHub Actions workflows still conclude failure on that source SHA (runs 682, 1099, 1398, 820); job-step summaries are empty and log retrieval returns HTTP 404 `BlobNotFound`. Their causes are UNVERIFIED. Branch protection and required-check settings cannot be read through the current integration (HTTP 403), and no PR review approvals are recorded.
- PR #238 remains Draft. No merge, deployment, or production data/configuration changes. Local exact-head test execution, production authenticated Admin smoke, WCAG 2.2 AA validation, and Web/API SHA parity remain NOT RUN / NOT VERIFIED.
- TASKS.md ledger update commit: `04697b0589557e69799ab0f5d94c9615188698bb`. This documentation update creates another new PR head, so the four CircleCI contexts must be checked again on the resulting latest SHA.

## ADM-06 concurrency test assertion review — 2026-10-28

- Tightened `backend/tests/test_membership_management_postgres_concurrency.py`: a losing request must return HTTP 422 with the exact last-owner guard message, not merely any 403/422. This prevents authorization/setup failures from being counted as evidence that the concurrency invariant held.
- The API guard in `backend/app/core_features_api.py` returns this message for both owner demotion and owner removal when the workspace would otherwise have no OWNER.
- Exact-head CircleCI is pending after this test-only hardening; do not mark ADM-06 verified until all four contexts pass on the new SHA.
