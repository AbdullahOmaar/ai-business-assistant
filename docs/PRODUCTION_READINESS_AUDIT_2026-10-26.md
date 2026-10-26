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
