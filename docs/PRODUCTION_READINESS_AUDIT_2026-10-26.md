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
