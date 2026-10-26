# Production Readiness Audit — 2026-10-26

## Status and evidence

- Repository: `AbdullahOmaar/ai-business-assistant`
- Branch reviewed: `main`
- Reviewed commit: `dec7f26bd2bb33a4c27af4e785abe982e8486676`
- Review mode: source/configuration and GitHub Actions metadata; no production data or credentials accessed.
- Release verdict: **NOT CLEARED FOR PRODUCTION**.

This document records source-backed blockers and verification limits. It is not a claim that every screen has been manually exercised in a real browser or that production services were tested end-to-end.

## Confirmed release blockers

### 1. Required CI checks are failing without usable step evidence

For commit `dec7f26bd2bb33a4c27af4e785abe982e8486676`:

- [Verify backend and frontend — run 40249207827](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40249207827): failed.
- [Dependency security scan — run 40249207778](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40249207778): failed.

The GitHub job API returned completed failed jobs with empty step lists for both workflows. Downloading the associated job logs returned a GitHub BlobNotFound/404 response. The available evidence therefore does **not** identify a failing application command or prove a code defect. Re-run the checks and capture usable logs before classifying the cause. Do not suppress scans or treat a failed run as a pass.

The backend container verification also failed on the immediately preceding main commit `ba2376e24af3be55b7626f98aac9cbd20123d93a`: [run 40249039986](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40249039986).

### 2. Production deployment and authenticated smoke tests are not verified

The root README explicitly says production aliases are not proof that the latest source is deployed or that the full sign-in flow works. The production release policy requires:
- all required CI workflows passing for the release commit;
- production deployment commit SHA verification;
- frontend and API version metadata matching the intended release;
- authenticated, safe smoke tests;
- Android Chrome smoke testing.

Until each is evidenced, do not describe production as verified and do not run migrations or financial writes against production as a smoke test.

### 3. The backend README contradicts the current repository

`backend/README.md` still describes the backend as a local starter with only `GET /health`, says there is no Angular UI, no authentication, and no business HTTP endpoints. Current `main` contains registered business routers, Firebase token verification, PostgreSQL session setup, and the Angular frontend. This stale documentation can cause unsafe deployment decisions. Update it to match the actual code while retaining the warning that production use is not approved until runtime configuration and release gates are verified.

### 4. Accounting limitations must remain explicit

`docs/ACCOUNTING_INTEGRITY_AUDIT.md` states that:
- the profit/loss result is preliminary operational reporting, not a general ledger or net-profit figure;
- inventory valuation and invoice-linked cost of goods sold are not implemented;
- jurisdiction-aware tax policy and tax filing are not implemented;
- currency conversion and FX accounting are not implemented;
- a balanced double-entry ledger, reconciliation, and period-close controls are not implemented;
- production-database concurrency tests remain a gap.

Do not label this product a complete accounting, tax-filing, or double-entry accounting system. Keep these limitations visible wherever existing reports could otherwise be misunderstood.

### 5. Database concurrency needs PostgreSQL-specific evidence

Pure domain rules and service tests provide useful coverage, but the backend README and accounting audit both identify concurrency behavior as needing PostgreSQL integration coverage. SQLite/in-memory tests do not prove PostgreSQL row-lock behavior, uniqueness races, or transaction isolation for concurrent payments and stock updates.

### 6. Open pull requests are heavily stacked and partially duplicative

At review time, many PRs remained open, including stacked accounting/operations work and overlapping audit-log changes (for example #125 and #127). Some feature branches target other feature branches rather than `main`. Do not merge the whole open-PR list or assume a PR is safe because its title sounds release-related. Compare each candidate against current `main`, identify dependencies, avoid duplicate commits, and run the full checks on one coherent release candidate.

### 7. Financial reporting used UTC instead of the configured business timezone

The dashboard and profit/loss endpoints converted inclusive date filters using UTC midnight and returned `timezone: UTC`, despite each workspace storing a timezone. This can place transactions near local midnight into the wrong reporting day and can make the default month/30-day period use the wrong local date. A focused fix and regression tests are under review in [PR #143](https://github.com/AbdullahOmaar/ai-business-assistant/pull/143); do not count this as resolved until its checks pass and it is merged.

## Source-backed architecture observations

- Frontend: Angular 20 package declarations; build script writes build metadata before the production build.
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL driver, and Firebase Admin authentication adapter.
- API readiness correctly requires a configured database session factory and trusted principal resolver, then executes `SELECT 1`.
- The public Firebase web-app configuration in `frontend/public/runtime-config.json` is documented as public configuration, not a server secret. Service-account credentials, database URLs, and provider API keys must remain server-side.
- Business routes are intended to use a trusted principal and workspace membership. Continue checking each endpoint and each object reference for workspace scoping; route inventory documentation notes that coverage is not exhaustive.
- The service worker avoids caching `/api/` calls and caches the app shell/static bundles. Validate update behavior in an installed Android Chrome PWA before release.

## Required next actions, in order

1. Re-run failed workflows and capture actual step-level logs. Separate runner/platform failures from dependency, build, migration, test, and application failures.
2. Resolve dependency-security findings only from actual scan output; do not use blanket suppressions or arbitrary major upgrades.
3. Reconcile `backend/README.md` with current implementation and deployment safeguards.
4. Run backend unit/integration tests, Alembic upgrade/check against disposable PostgreSQL, frontend tests, and Angular production build in isolated CI.
5. Add/verify PostgreSQL concurrency tests for payment idempotency/allocation and stock deductions without touching production data.
6. Perform route-by-route authorization and tenant-isolation coverage review, especially extended operations, exports/imports, settings, audit/report routes, and direct resource IDs.
7. Review existing UI workflows on mobile and desktop; record defects with route, steps to reproduce, expected/actual behavior, and regression test.
8. Confirm runtime Firebase project, service-account setup, production PostgreSQL, CORS, and frontend runtime configuration using the existing runbook—without printing secrets.
9. After all gates pass, use the approved release process, verify deployment SHA and `/version`, and perform authenticated read-only smoke tests plus physical-device Android Chrome checks.

## Safety constraints

- No new product features or unrelated modules.
- No production schema migration, destructive data change, historical financial rewrite, or live financial test.
- No production deployment or promotion until the documented release gates pass.
- No claim of full production readiness based solely on HTTP 200 health checks, a preview build, or source inspection.
- Keep all unresolved issues explicit; do not mark them complete without evidence.


## Execution update — 2026-10-26 00:46 UTC

### Current repository / pull-request state rechecked

- `main` still points to `dec7f26bd2bb33a4c27af4e785abe982e8486676`; the supplied baseline has not advanced.
- PR #142 remains open, draft, unmerged, and mergeable according to the PR API. It changes this audit and `backend/README.md`.
- PR #143 remains open, draft, unmerged, and mergeable according to the PR API. Its head is `c529a7cb3d9bfa65bcf738f55e09f037515a913b`; it changes `backend/app/core_features_api.py` and adds `backend/tests/test_business_timezone_reporting.py`.
- PRs #137, #138, #139, and #141 are merged. PR #140 is closed without merge and is explicitly superseded by #141. The latest main commit message records #141.
- No PR has been merged as part of this audit. No production deployment or production data operation was performed.

### New CI evidence

Latest reviewed workflow attempts on the PR heads failed almost immediately:
- PR #142 head `6b8718726e76393b6e00d23ff341738179dcdb23`: [CI run 40250458223](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250458223), [container run 40250458209](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250458209), [backend tests 40250458202](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250458202), [dependency scan 40250458201](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250458201).
- PR #143 head `c529a7cb3d9bfa65bcf738f55e09f037515a913b`: [backend tests 40250433988](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250433988), [CI run 40250433967](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250433967), [dependency scan 40250433930](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250433930), [container run 40250433927](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250433927).
- The GitHub jobs API returned `runner_id=0`, an empty runner name, zero steps, and an empty step list for sampled jobs. The job-log download returned BlobNotFound/404 rather than application logs. This strongly indicates that the jobs failed before a runner executed the workflow; it does not prove that the code/tests pass.
- A retry request was accepted for failed jobs in run 40250433967. Its resulting attempt must be checked separately; the accepted retry request is not a successful check.

### Workflow source review

The repository defines four workflows: backend/frontend verification, backend tests with PostgreSQL 16 and Alembic checks, dependency security scanning, and backend container verification. They declare read-only repository permissions and use Ubuntu hosted runners. Since all observed workflow families exhibit runner assignment failures with no steps, changing test commands or suppressing dependency findings would be unjustified until a run provides actionable evidence.

### PR #143 review notes

The proposed change converts inclusive business-local date ranges into UTC half-open intervals and selects the default reporting date in the configured business timezone. The regression test uses an isolated in-memory SQLite database and does not touch production data. It covers one New York local-day boundary and invalid timezone on business creation. Remaining verification gaps before merge:
- Execute the test and full backend suite on a real runner.
- Add/verify daylight-saving boundary assertions (23-hour spring-forward day and 25-hour fall-back day).
- Verify timezone validation on business updates as well as creation.
- Run the existing PostgreSQL-backed test/migration pipeline; SQLite does not establish PostgreSQL behavior.

### Execution status

- Repository / PR state check: complete for the API data available in this review.
- Workflow source inspection and no-runner evidence: complete for the sampled current runs.
- Retry of one failed CI run: requested; outcome not yet verified.
- Feature-by-feature source inventory, route-by-route authorization audit, PostgreSQL concurrency tests, full frontend review, dependency findings, production deployment SHA verification, authenticated smoke tests, and installed Android Chrome PWA checks: not yet complete.
- Release verdict remains **NOT CLEARED FOR PRODUCTION**.


## Deployment state verified through Vercel project access — 2026-10-26 00:49 UTC

The Vercel team/project read succeeded when scoped to team `team_jCzLnqPABe0EM86FWWUXrvTP`. This provides concrete deployment metadata, but not a successful runtime smoke test.

- Frontend production alias `ai-business-assistant-web.vercel.app` resolves to deployment `dpl_Gep5cA11Qq3ETttRhHj4rjx2GtsV`, state READY, source `main`, commit `dec7f26bd2bb33a4c27af4e785abe982e8486676`. [Deployment details](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-web/Gep5cA11Qq3ETttRhHj4rjx2GtsV)
- API production alias `ai-business-assistant-api.vercel.app` resolves to deployment `dpl_3YoKDZX76b2rKG3PMijZar481XLg`, state READY, source `main`, commit `c8078c563ad9d88f04cccee740efdb1b64527df7`. [Deployment details](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api/3YoKDZX76b2rKG3PMijZar481XLg)
- The API deployment attempt for current main commit `dec7f26bd2bb33a4c27af4e785abe982e8486676` is CANCELED (`dpl_DEAjTugY5FpuEcf15cNCbvM5Kq9Y`). Vercel build events show this was caused by the configured Ignored Build Step: `git log -1 --pretty=%B | grep -q '\\[release-api\\]' && exit 1 || exit 0` returned exit code 0 because the latest commit message was not tagged `[release-api]`. This is the configured deployment filter, not a build failure.
- Comparing API production commit `c8078c563ad9d88f04cccee740efdb1b64527df7` with current `main` shows two commits ahead. Changed paths are frontend files, release notes, and `backend/tests/test_services.py`; **no backend application runtime file changed** after the API production commit. The return-rounding fix commit `1210641021493e3669865ae945acb8c2f4ff967d` is an ancestor of `c8078c5`, so the current API deployment source includes that runtime fix. The different SHAs are therefore not, by themselves, evidence that frontend and API runtime code are incompatible.
- A direct fetch of `/version`, `/health`, and `/readyz` through the available web fetch channel was blocked (DisabledError). No runtime status code or version payload is claimed.
- No production promotion was attempted. Runtime configuration validity, authenticated read-only smoke tests, and the release CI gates remain blockers.

### Updated verdict

**NOT CLEARED FOR PRODUCTION.** In addition to unexecuted CI and accounting/security verification, production runtime/version compatibility and authenticated smoke tests remain unverified. The differing frontend/API SHAs were compared: the only intervening backend-path change is a test file, not backend runtime code; this is not by itself evidence of a runtime mismatch.


## Further execution update — 2026-10-26 00:50 UTC

### Feature inventory artifact

Created `docs/FEATURE_INVENTORY_2026-10-26.md` on this audit branch. It records the seven existing frontend tabs, setup/auth/loading states, registered backend endpoint groups, data models, current test files, and confirmed limitations. It explicitly separates model/API existence from a complete user-facing workflow and marks manual/browser checks as unperformed.

### Additional timezone regression coverage

PR #143 now also includes assertions for New York daylight-saving transition boundaries:
- 2026-03-08 local day is expected to span 23 hours.
- 2026-11-01 local day is expected to span 25 hours.
- A business timezone update to an invalid IANA name must return 422.

These tests were committed to branch `fix/business-timezone-reporting` (latest known commit `d564e7ee982cc9782f6959389e18499dd8ae6c1a`). They have **not executed successfully** because the workflow jobs failed before runner assignment.

### Repeated CI retry evidence

- Retrying failed jobs in [run 40250433967](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40250433967) was accepted, but attempt 2 also failed.
- New runs for PR #142's updated audit commit `1ba15a37c500fc8e08c1a64c7e9ecdb587f28871` failed in the same pre-runner pattern: [CI 40251155893](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251155893), [backend tests 40251155780](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251155780), [dependency scan 40251155775](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251155775), and [container check 40251155774](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251155774).
- For run 40251155893, the raw jobs endpoint again reported `runner_id=0`, blank `runner_name`, and `steps=[]` for both backend and frontend jobs. The issue affects independent workflow families and does not identify a source-level test failure.

### Current verified release blockers

1. CI has not executed the code; tests, migrations, builds and dependency scans remain unverified.
2. Production frontend alias is on `dec7f26bd2bb33a4c27af4e785abe982e8486676`; API alias is on `c8078c563ad9d88f04cccee740efdb1b64527df7`. The API attempt for the frontend's current SHA was intentionally skipped by the configured `[release-api]` Ignored Build Step, and source comparison shows no backend application runtime changes between these SHAs. Still verify runtime `/version`, authenticated API behavior, and all release gates before promotion.
3. The timezone fix remains unmerged and unexecuted.
4. PostgreSQL concurrency tests, route-by-route authorization review, real desktop/mobile UX, runtime configuration confirmation, authenticated smoke tests and physical Android PWA tests remain outstanding.
5. Vercel project metadata was readable under the exact team ID, but no production change was made. Runtime HTTP probes through the available web fetch channel were blocked, so no live API health/version response is claimed.

Release verdict remains **NOT CLEARED FOR PRODUCTION**.


## Runtime configuration metadata review — 2026-10-26 00:52 UTC

Read project environment-variable metadata with decryption disabled; no secret values were requested or recorded.

- Frontend Vercel project has no project-level environment variables listed. The committed public runtime config points to `https://ai-business-assistant-api.vercel.app` and the Firebase project ID matches the backend's configured `FIREBASE_PROJECT_ID` value. The Firebase web API key is public client configuration and was not copied into this audit.
- API production environment metadata lists `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, and `CORS_ALLOWED_ORIGINS` with production targets. Their secret values were not inspected. The CORS origin entry matches the frontend production origin.
- No project-level `OPENAI_API_KEY` appeared in the API environment-variable listing. The current assistant source has a deterministic, limited intent-based fallback when that key is absent; do not represent it as unrestricted model-backed chat. Confirm intended behavior against product requirements without adding paid configuration or secrets automatically.
- These metadata checks do not establish that credentials are valid, PostgreSQL is reachable, Firebase token verification works, or CORS/authenticated requests succeed at runtime.

### Latest CI status after these updates

The latest runs for PR #142 commit `1ba15a37c500fc8e08c1a64c7e9ecdb587f28871` now show completed failure, with runner ID 0 and no steps in sampled jobs. The latest PR #143 run family for `d564e7ee982cc9782f6959389e18499dd8ae6c1a` also shows failed jobs with no step evidence. Relevant links: [PR #143 CI 40251116121](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251116121), [backend tests 40251116118](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251116118), [dependency scan 40251116114](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251116114), [container check 40251116119](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40251116119).

The CI root cause remains unresolved by the available GitHub API evidence; no workflow changes were made to mask it. Release verdict remains **NOT CLEARED FOR PRODUCTION**.


## Execution continuation — 2026-10-26 01:30 UTC

### Accounting code review and correction PR #144

Source review found a gap in the service-layer sales-return approval operation: it checked cumulative returned quantity and non-negative amount, but did not enforce the same discounted invoice-line amount ceiling used by the HTTP API. This allowed service-level return records to exceed the original line's allocated net subtotal under inconsistent persisted/input data.

- Opened [PR #144](https://github.com/AbdullahOmaar/ai-business-assistant/pull/144), draft, on branch `fix/sales-return-amount-guard-2026-10-26`.
- Added `discounted_return_line_total` as a shared deterministic largest-remainder allocation rule, reused by both the HTTP return endpoints and service-layer operation.
- Added regression tests for an amount exceeding the source line and cumulative approved return amounts exceeding the discounted source line.
- No schema migration, production data change, or deployment was made.
- Code was reviewed from GitHub source diffs. Tests have **not been executed** because Actions still fails before assigning runners.

### Runner/CI diagnosis status

For new PR #144 commit `72720b91a61a72776a1a3c9f54e11d2a07cd824a`, GitHub created four workflow runs and all completed as failures within seconds:
- [Verify backend/frontend — 40254076031](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254076031)
- [Backend tests — 40254076024](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254076024)
- [Dependency scan — 40254076045](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254076045)
- [Container check — 40254076020](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254076020)

The sampled jobs again have `runner_id=0`, no runner name, and no steps; downloading job logs returns `BlobNotFound`, consistent with no log artifact being produced. The current public [GitHub Status](https://www.githubstatus.com/) page shows all systems operational, and no active Actions incident matching these failures was visible during this check. This does **not** prove whether the cause is account/repository Actions configuration, billing/quota, or a non-public runner service problem. The exact root cause cannot be established from the available GitHub API evidence. Do not change workflows to hide this failure; inspect repository Actions settings and owner billing/quota in GitHub UI or escalate to GitHub Support with the run IDs.

### Remaining unverified work

- Execute all changed backend tests, full PostgreSQL migration/integration suite, frontend production build, npm/pip dependency scans, and container build once a runner is available.
- Finish route-by-route authorization and tenant-isolation tests, payment idempotency/concurrency verification, and report correctness review.
- Complete real browser/mobile/PWA checks and authenticated runtime smoke tests.
- Review and merge PRs #142, #143, and #144 only after their required checks have actually executed and passed.
- No production deployment or promotion was attempted.

Release verdict remains **NOT CLEARED FOR PRODUCTION**.


## Latest source review — 2026-10-26 01:29 UTC

### PR #144 expanded after reviewing both API and service-layer paths

The API route already had a discounted net-subtotal ceiling, but the separate service operation did not. The fix now shares the same largest-remainder allocation helper across both code paths and aggregates duplicate return-line entries by original invoice line before checking quantities and amounts. Regression tests cover:
- A return amount above the recorded source-line ceiling.
- Cumulative approved amounts above the discounted line ceiling.
- Duplicate rows in one draft return that collectively exceed the sold quantity.

Latest PR #144 head is `d6fdc6254fb93ec15fc0e4301905970456944bf0`. These are source changes plus tests; they have not run in a real test process.

### Latest CI evidence

The new PR #144 backend test run [40254339648](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254339648) completed as failure in three seconds; its job had `runner_id=0`, blank runner name, and no steps. The newest workflow family on the same SHA includes [backend/frontend 40254339645](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254339645), [dependency scan 40254339686](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254339686), and [container build 40254339932](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40254339932). No code-test pass is claimed.

### Route authorization source review

Reviewed the route declarations in `api.py`, `core_features_api.py`, `extended_api.py`, and `assistant_api.py`. Public business workflows use trusted `get_principal` / `get_session` dependencies and the service or route-level membership guard; sensitive owner-only routes explicitly require the OWNER role. The source has no separate membership-active flag in the current model, so "inactive membership" is not a state the current schema can express. This is a code inspection, not a successful end-to-end authorization test. Cross-business and role tests remain to be run.

Release verdict remains **NOT CLEARED FOR PRODUCTION**.


## Historical PR reconciliation — 2026-10-26

Reviewed PR metadata and diffs for #137–#141 against current `main`:
- **#137 — merged:** OWNER-only protection for recurring invoice schedules and notification creation; the current `extended_api.py` route checks retain those owner gates.
- **#138 — merged:** v1.0.0 release-candidate invoice draft/mobile work, decimal rounding tests, and release notes. Its changes are in main through `ba2376e`.
- **#139 — merged:** accounting ledger documentation clarifying unallocated receipts and expense settlement; documentation only, not evidence of a full double-entry ledger implementation.
- **#140 — closed without merge:** assistant/build timestamp change set was superseded/replaced by #141.
- **#141 — merged:** UI assistant suggestions and build timestamp; this is the current main tip `dec7f26bd2bb33a4c27af4e785abe982e8486676`.

No duplicate historical PR was re-applied to main during this audit. PRs #142, #143, and #144 remain open drafts and must not be merged while checks cannot execute.

### Further authorization hardening in PR #144

The service-layer purchase-order receiving and sales-return approval operations now require the OWNER role, matching the existing HTTP route policy. Added a regression test that verifies a STAFF membership cannot approve a sales return through the service operation. The latest commit with this change is on PR #144; automated execution remains blocked by the runner issue.
