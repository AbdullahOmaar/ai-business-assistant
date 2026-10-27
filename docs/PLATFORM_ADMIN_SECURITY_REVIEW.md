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
- CircleCI reports all four contexts successful on baseline SHA `068b0b4825765684078c3db44ecd9cafbb7e1cf4`. The CSV-only review commit `7978e5e66f4869faf284074736f24a8193c715ae` also passed all four contexts; later code/test changes are pending at the latest status read.
- Production API `/readyz` returned HTTP 200, but `/version` reported commit `877243840576`, not the current main SHA. Vercel deployment metadata identifies latest READY production Web deployment `dpl_3PLEvrGRx6rb6hamkVNV5Nq5is9K` at source SHA `8a1ebbfe334980b02795e238be05fad560bd4f28`, and API deployment `dpl_8i3a1jJgXf5LKweh7wGcL6W7tgAF` at source SHA `8772438405764734bda6f475e31bd50c22341c86`. Both differ from main. GitHub Vercel status checks link to a daily build-rate-limit page. Production source parity and authenticated admin workflows remain unverified.

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

1. **False audit event for absent role revocation — fixed on review branch.** Previously, a super-admin revoking a role with no grant row created an inactive grant and wrote a `platform.user_role.revoked` event even though no active role had been removed. The branch now returns an unchanged state without writing a grant or audit event; regression coverage is pending exact-head CI.
2. **Stale admin snapshots after failed refresh — fixed on review branch.** The overview and runtime-health refresh handlers previously retained the last successful values after a later request failed, including a 403. The branch now clears those snapshots and extends the mocked Playwright flow to check that they disappear; exact-head browser smoke is pending.
3. **Production source parity is not established.** `/version` reports `877243840576`; current main is `068b0b4825765684078c3db44ecd9cafbb7e1cf4`. Vercel status checks show the daily build-rate-limit page. This is an operational mismatch, not proof that the live application is broken or exploitable.
4. **CSV export regression coverage was missing in the inspected Admin test file.** Two tests have now been added for formula neutralization, bounded export metadata, no-store behavior, and denial without audit permission. They are not verified until the exact-head CircleCI run completes.
5. **Cross-workspace membership IDOR regression is now covered by a new test, but is not yet CI-verified.** The test checks that an owner of Workspace A cannot list, change, or remove a known membership in Workspace B.
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
- Latest code/test head `7e935995c932121e261d8c5d337df93226b6e31b` had CircleCI runs 866–868 pending at the last status check; the backend-container status was not yet present. A later documentation-only commit is newer and should not be confused with this tested code snapshot.
- No production deployment was attempted. The task itself prohibits deployment without explicit release authorization.

## Release decision

**NO-GO for declaring Platform Admin production-ready.** The live API readiness endpoint is responsive, but deployed source parity, authenticated end-to-end behavior, concurrency coverage, and exact-head checks for the newly added CSV tests remain unresolved. No production data, secrets, identity configuration, or deployments were changed in this review.
