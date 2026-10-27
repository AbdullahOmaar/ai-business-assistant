# Independent CI and accounting release gates

**Checkpoint date:** 2026-10-27  
**Status:** Configuration committed on the CI optimization PR branch; activation and authoritative CircleCI execution are still pending. This document is not evidence of a passing pipeline.

## Provider decision: CircleCI Cloud Free

Use CircleCI as an independent hosted runner while GitHub-hosted runner allocation is failing before the first step. Keep the existing GitHub Actions workflows intact as a fallback and cost-optimization path; do not weaken security or release checks to make a dashboard green.

Official pricing currently describes a Free plan with 30,000 monthly credits, up to 6,000 build minutes when using small Docker resource classes, and up to five active users. Free credits expire monthly; when personal-plan credits reach zero, personal builds stop until the next monthly refill. This is free within the published limits, not unlimited compute and not a guarantee against future plan changes.

- Pricing and limits: https://circleci.com/pricing/
- Free-plan credit behavior: https://circleci.com/docs/guides/plans-pricing/credits/
- Project authorization/setup: https://circleci.com/docs/guides/getting-started/create-project/
- Config reference: https://circleci.com/docs/reference/configuration-reference/
- CLI config validation: https://circleci.com/docs/guides/toolkit/circleci-cli/

Do not upgrade to a paid plan, enable paid overages/automatic credit purchases, attach production secrets, or approve any cost change as part of this work.

## What the new pipeline checks

The `.circleci/config.yml` workflow is intentionally non-deploying and does not use production credentials or data.

1. **Backend and accounting gate:** starts a disposable PostgreSQL 16 service; waits for an actual connection; installs the backend requirements; applies Alembic migrations to that test database; verifies the current revision and ORM/migration drift; runs the complete pytest suite and emits a JUnit report; renders offline migration SQL; and audits the declared Python dependencies.
2. **Frontend gate:** uses `cimg/node:22.12` (Angular 20's supported Node 22 range starts at 22.12), prints the actual Node/npm versions, installs the current manifest, runs the npm high-severity audit, and executes `npm run build`. The repo's build script runs its unit tests before the Angular production build. The frontend currently has no committed `package-lock.json`, so `npm install` resolves the declared semver ranges anew and is not yet deterministic across runs. Add and review a committed lockfile when registry access is available, then switch this gate to `npm ci`.
3. **Container gate:** builds the backend Docker image and verifies that the image can import `app.main`. It does not publish the image.
4. **Scheduled dependency audit:** reruns Python and npm dependency audits every Monday at 08:23 UTC, in addition to the per-change checks.

All three per-change jobs must pass on the exact commit under review. A missing, queued, canceled, infrastructure-failed, or stale check is **not** a pass. Artifacts include the backend JUnit results, audit output, and offline migration SQL where the corresponding steps ran.

## Financial rules that the release gate protects

The pipeline runs the existing domain and workflow tests rather than creating a second, divergent set of financial calculations. A new PostgreSQL-only concurrency test module supplements those existing tests and is enabled only in the CircleCI job against the explicitly named disposable test database. Existing and new coverage includes:

- Exact `Decimal` money calculations and the documented `ROUND_HALF_UP` policy.
- Line-level rounding, invoice subtotal/discount/tax/total reconciliation, and invalid inputs.
- Partial payments, allocation ceilings, invoice outstanding-balance ceilings, and idempotency constraints.
- Partial-return quantity and amount caps, stock movements and purchase receiving.
- Numeric fixed-precision database types and business-scoped foreign keys.
- Currency-separated reporting and cross-business authorization denials.
- Invoice lifecycle constraints, sensitive-role restrictions, and audit-aware workflows.

The PostgreSQL service adds real-database migration and schema-drift checks. The new concurrency module runs selected payment/stock/return workflows against PostgreSQL with isolated schema per test; it does not yet prove that every API workflow has PostgreSQL integration coverage. The overall pytest suite still includes isolated SQLite-based tests. These new tests are written but not yet executed against CircleCI.

No monetary discrepancy, unbalanced expected total, over-allocation, over-return, duplicate financial mutation, cross-business access, invalid migration, high-severity dependency finding, or container import failure can be waived merely to prepare a demo.

## One-time activation and enforcement

CircleCI is not connected to the tools in this workspace, so repository files can be prepared but the account integration, live build, and GitHub required-check settings cannot be truthfully completed here. Repository-owner action is needed for these access-controlled steps:

1. Open https://app.circleci.com/ and sign in with the GitHub account that owns `AbdullahOmaar/ai-business-assistant`.
2. Authorize CircleCI only for this repository (least privilege), create/set up the project, and use the existing `.circleci/config.yml` rather than generating a different starter pipeline.
3. Trigger the current PR branch once and inspect the actual results for `backend-accounting`, `frontend-quality`, and `backend-container`. Use CircleCI's authoritative validator as documented above; a generic YAML parser alone is insufficient.
4. In GitHub repository settings, protect `main` and require the exact CircleCI status-check contexts observed from the first successful build for all three jobs. Require PRs and current-head checks; do not guess check names before CircleCI reports them. Keep required checks enforced even after GitHub Actions recovers.
5. Do not merge the CI PR until the pipeline actually runs on its current head SHA and the checks are passing. Do not change the production Vercel aliases, production secrets, databases, or deployment configuration as part of activating CI.

Until steps 1–5 are verified, task status remains **BLOCKED for enforcement** and the release gate must treat CircleCI as configured-but-inactive.

## Demo and deployment policy

For every demo and production deployment:

1. Identify the exact source SHA and verify required checks are green for that SHA, not merely for an earlier commit or a different branch.
2. Inspect financial test reports and failure logs. Confirm invoice totals reconcile, payment allocations do not exceed payment/invoice balances, cumulative returns do not exceed the original sale, stock movements do not overdraw tracked inventory, and currency totals remain separate.
3. Verify PostgreSQL migrations against a disposable database and resolve schema drift; review migration SQL before any authorized production change.
4. Verify server-side authorization and cross-business negative tests. A Vercel SSO page, HTTP 200, static build, or mock-token test is not proof that Firebase-authenticated financial API flows work in the browser.
5. Verify the relevant preview or production deployment SHA/version and run non-destructive smoke tests. Never run financial mutation tests against production. No deployment is performed by this CircleCI configuration.

If any required job is failing/unavailable, any material financial difference is unexplained, the SHA is stale, or an authorization/migration gate is missing, mark the release **BLOCKED** rather than bypassing checks.

## Current product/accounting limitations — do not overstate readiness

The repository's accounting integrity audit documents these unimplemented capabilities: a balanced double-entry general ledger and period close; inventory valuation and reliable cost of goods sold; jurisdiction-aware tax policy/reporting; exchange rates and FX gains/losses; bank reconciliation and customer statements/receivables aging. The current profit/loss figure is an operational estimate, not certified net profit. CI can guard existing behavior but cannot certify features the application has not implemented.

Remaining follow-up after the CircleCI run becomes available:
- Added `backend/tests/test_postgres_financial_concurrency.py` with isolated-schema PostgreSQL tests for same-key concurrent payment retries, competing allocations against one invoice, competing stock sales, and concurrent approvals of over-sized returns. The fixture requires an explicit `CI_ALLOW_DATABASE_SCHEMA_TESTS=true`, a separate `TEST_DATABASE_URL`, and a database name containing a delimited `test`, `ci`, `disposable`, or `tmp` token; it never falls back to `DATABASE_URL`. The tests and payment-race fix remain unverified until the real CircleCI PostgreSQL job runs.
- Add a reviewed `frontend/package-lock.json` from a successful dependency resolution and switch CI to `npm ci`; current manifest-only installs are not yet deterministic.
- Complete staging Firebase invalid/expired/wrong-project token rejection and API-wide cross-tenant negative tests with non-production credentials.
- Add real-browser Playwright coverage for sign-in, workspace isolation, invoice issue/void, payment recording/allocation, sales return, and installed-PWA startup/update once a safe staging target and test identity are available.
- If a zero-cost CircleCI allowance is exhausted, stop safely and use a reviewed alternate runner (existing local hardware or a separately authorized free tier); do not silently enable paid credits or mark checks green without execution.
