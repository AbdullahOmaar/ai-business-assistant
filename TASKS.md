# Project Task Ledger

> Updated 2026-10-26 from live GitHub metadata. A task is VERIFIED only with implementation evidence and passing checks on the exact commit.

## Rules
- Keep one canonical execution track per task; reconcile existing PRs before opening duplicates.
- Use statuses: TODO, IN_PROGRESS, BLOCKED, VERIFIED.
- Never mark code complete from a diff alone. Record exact test/build/CI evidence.
- Never merge accounting, payment, authorization, or tenant-isolation changes without applicable passing tests.
- Use only free resources; no production data mutations or secrets in source/logs.

## PROD-SAFETY-001 — consolidated production safety workstream
- Status: IN_PROGRESS; release verification: BLOCKED.
- Canonical accounting PR: [#161](https://github.com/AbdullahOmaar/ai-business-assistant/pull/161), branch task/production-safety-consolidated. Live PR head observed during this review: 245b40f30e2c320f177545a0d837729dd2dbbbed (recheck before acting; this ledger update itself will advance the branch).
- Implemented but unverified slice: aggregate duplicate return rows by invoice line; enforce return quantity/value ceilings; apply OWNER checks to purchase-order receiving and sales-return approval; add regression tests.
- Canonical UI/payment safety PR: [#157](https://github.com/AbdullahOmaar/ai-business-assistant/pull/157), observed head 29e442167a0de3bfbde0c20f41d5ba2c4d9c580c. Covers workspace report request invalidation and payment retry/idempotency UI handling.
- Duplicate UI-only PR [#156](https://github.com/AbdullahOmaar/ai-business-assistant/pull/156) is closed as superseded by #157; no changes were merged.
- Distinct Drafts still require reconciliation, not blind duplication: [#154 timezone-aware report dates](https://github.com/AbdullahOmaar/ai-business-assistant/pull/154), [#158 settings PUT CORS preflight](https://github.com/AbdullahOmaar/ai-business-assistant/pull/158), [#160 recurring timezone and setting-key validation](https://github.com/AbdullahOmaar/ai-business-assistant/pull/160). All were open/Draft at review time. Their patches affect different areas except #154 and #157 both touch frontend/src/app/app.component.ts, so any consolidation must resolve overlapping changes and tests.
- Review finding on #154: report period UI still labels the configured business-local period as UTC. Fix the label to use the response timezone before considering this change complete. Also ensure approved return amounts are represented consistently in financial reporting; current report explicitly states returns are not netted.
- #158 changes backend/app/main.py and backend/tests/test_main.py; #160 changes backend/app/extended_api.py and backend/tests/test_api.py. No copy of these patches has been applied to #161 in this checkpoint; avoid creating duplicates until the source diff is merged deliberately and tests can run.
- Security/accounting review remains open: verify owner-only actions across API and service-layer entry points, tenant scoping on all invoice/payment/return references, duplicate/idempotent payment behavior, currency-safe allocations, and cumulative return quantity/amount limits. Existing diffs add some controls but do not constitute end-to-end proof.
- Additional scope still outstanding: return treatment in profit/loss/customer statements; currency-safe allocations; recurring invoices and actual background execution; API rate limits/input/CSV; frontend/PWA; dependency security; authenticated, non-mutating production smoke tests.

## Exact CI evidence — current observed #161 head
- Head: 245b40f30e2c320f177545a0d837729dd2dbbbed.
- Dependency security scan run [40360087495](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360087495): completed failure. Jobs "Audit JavaScript dependencies" and "Audit Python dependencies" report failure, but steps and logs are unavailable (steps=null, logs_url=null).
- Backend/frontend run [40360087354](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360087354): completed failure. Frontend and backend jobs report failure, but steps and logs are unavailable.
- Backend container run [40360087184](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360087184): completed failure. Build job has no exposed steps/logs.
- Backend tests run [40360087420](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360087420): queued at query time and returned zero jobs. Outcome not verified.
- Combined commit status query returned an empty status list. This is not a passing result.
- These are observable GitHub workflow states, but unavailable step/log payloads do not establish whether the runner was allocated or which command failed. Diagnose runner/workflow infrastructure before classifying failures as code defects. Re-query the exact new head after this ledger update.
- Local checkout/test execution remains blocked: the execution environment could not resolve github.com via DNS. This is an infrastructure limitation, not evidence of code failure or success.

## Merge and deployment gates
- Keep #161, #157, #154, #158, and #160 unmerged while checks are failing/queued or have no inspectable logs. Do not bypass branch protection or claim a test passed.
- Free validation fallback: inspect workflow YAML, test commands, dependency manifests, and runner configuration through GitHub; attempt a permitted GitHub Actions rerun and capture job details. If runners still fail before steps are exposed, record the exact platform blocker and continue source-level review without treating it as equivalent to tests.
- Before merge: reconcile overlapping diffs into one canonical branch; add missing regression coverage; backend/PostgreSQL tests, frontend tests/build, and security/dependency checks must pass on the exact candidate SHA.
- After merge: record the merge SHA and verify main head/CI. Before production release: verify deployed frontend/API versions and perform safe, authenticated, non-mutating smoke tests. No production deployment or production data mutation occurred in this checkpoint.

## Other release checks
### Production configuration and authenticated smoke tests
- Status: TODO.
- Verify Firebase configuration without exposing values, PostgreSQL connectivity, exact CORS origins, frontend runtime config, sign-in, workspace isolation, invoice/payment/return flows, health/readiness, and deployed commit/version.
- Use read-only/non-mutating checks; no production migrations or destructive actions.

### Mobile/PWA behavior
- Status: TODO.
- Verify installed PWA sign-in/navigation/update/cache version, viewport/keyboard behavior on a supported browser/device. If device access is unavailable, document exact unverified scenarios and continue independent work.

### Recurring invoice and notification execution
- Status: TODO.
- Establish whether a reliable worker/scheduler exists; if absent, propose and test a zero-cost-compatible implementation and document actual platform limits. Never assume recurring jobs are running.


## Follow-up evidence (2026-10-26)
- Retried failed jobs for runs 40360218318 (dependency scan), 40360218597 (backend/frontend), 40360218363 (container), and 40360218216 (backend tests). GitHub accepted the reruns, but this is not a pass: subsequent job queries still show failure with `steps=null` and `logs_url=null` for dependency, frontend/backend, and container jobs; backend test job was still queued with no logs at query time.
- Combined status queries for #161 head `23be0fb4d4312634833ba4ad08a6b0d7d9d2fa0b` and timezone UI fix commit `6592ba7f43196081f18c5b00d4dab12693e73efd` returned no status checks. No successful CI is evidenced.
- Fixed the known timezone display defect in PR #154: `frontend/src/app/app.component.ts` now displays `profitLoss.period.timezone` with UTC fallback rather than hard-coding UTC. Commit: `6592ba7f43196081f18c5b00d4dab12693e73efd`. Source change was applied once after verifying the exact prior text; frontend build/tests were not run.
- After that commit, PR #154 metadata reports `mergeable=false`; its base SHA also differs from #161's current main base. Treat #154 as requiring a fresh mergeability/rebase check before consolidation. No changes were copied into #161, and no PR was closed as part of this follow-up.
- Current decision: no merge or deployment. CI remains unverified/failed at the runner/job surface, and the timezone UI patch has not been validated by a frontend build.


## Execution update — CORS/settings/timezone reconciliation (2026-10-26)
- Status: implementation changes committed to the canonical #161 branch; validation BLOCKED by GitHub Actions runner allocation.
- Added the #158 CORS fix to #161 without copying a duplicate PR: `backend/app/main.py` now defines `CORS_ALLOWED_METHODS` including PUT and uses it in middleware; `backend/tests/test_main.py` adds a PUT preflight regression test. Commits: `82d070a851c116abe57679596a5a154ed5ff0b83`, `e8c4720bc69a46801622fb8c6edf258ac8e34395`.
- Reconciled #160's settings/schedule validation into the existing #161 `extended_api.py` (preserving the return changes already present): validate recurring schedule timezone with `ZoneInfo`; restrict setting keys to 1–100 character identifiers and reject secret-like names; normalize the key before lookup/persist. Added tests for invalid IANA timezone, secret-like keys, and valid locale. Commits: `e33f3f4f43480f2e4dba20dbcb22ee2f5662b686`, `d4282f7bc34d1a74977d6c00dd67397fcfc5afbf`.
- Reconciled #154's UI timezone label into #161's current app component without overwriting the #157 workspace/payment guard: report period now displays `profitLoss.period.timezone` with UTC fallback. Commit: `b78f9f01ef34902a773b90341b017276431b84a0`. The timezone-aware API date-boundary logic from #154 remains separate and is NOT yet merged into #161.
- Current runner diagnosis from GitHub REST job payloads for runs on head `d4282f7bc34d1a74977d6c00dd67397fcfc5afbf`: all jobs completed in ~3 seconds, `runner_id=0`, empty `runner_name`, and `steps=[]`. Latest runs: [backend/frontend 40360781344](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360781344), [dependency scan 40360781340](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360781340), [container 40360783554](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360783554), [backend tests 40360781432](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40360781432). This is evidence jobs did not acquire a runner and no test command ran; it is not a code-test failure. Reruns show the same symptom.
- Free fallback assessment: the repo already uses `ubuntu-latest` hosted runners and a PostgreSQL service; workflow files include test commands and `workflow_dispatch` for backend/security jobs. No self-hosted runner or other free execution environment is connected through the available tools, and local git/network access still cannot resolve github.com. Changing test commands or removing gates would not solve runner allocation and is not acceptable.
- Current PR #161 remains Draft/open. No tests/builds have passed on the new commits. Keep merge and production release BLOCKED until a hosted runner is available or an authorized free runner is connected and the full gate passes.


## Follow-up: timezone API reconciliation completed in source (2026-10-26)
- Ported the timezone reporting logic from #154 into the canonical #161 branch while preserving the current customer-statement/reporting base: `backend/app/core_features_api.py` now validates IANA timezone values at business create/update, converts inclusive business-local dates into UTC half-open bounds, uses the business-local date for default report periods, and returns the configured timezone. Profit/loss now uses those bounds and explicitly documents that approved returns are not netted and tax accounting is incomplete.
- Removed frontend-generated UTC date bounds from `ApiService.dashboard`; the API now chooses the default 30-day window in the business timezone.
- Added the existing #154 regression suite as `backend/tests/test_business_timezone_reporting.py`, covering local-day boundaries, default 30-day range, invalid timezone names, and 23/25-hour DST days.
- Commits: `158ba785586ba582d8c02fa069a874b80eefc8ea` (backend timezone reporting), `045dc9997676abf809460e811d96462b47a1027d` (frontend default period), `e44857cdcdb2cfbdc7bcb196cbdd221394f9cf06` (timezone regression suite).
- The #154 code is now represented in #161's current source; #154 remains open/Draft until checks pass and the exact diff/base is reconciled. No duplicate implementation was added. #158 CORS and #160 setting/schedule validation are also represented in #161's source; no PRs were closed as a substitute for merging.
- Static source verification confirms the helper/imports, timezone response fields, frontend query change, and five timezone regression test functions are present. This is source inspection only, NOT a test run.
- Latest available CI evidence before these timezone commits shows runner allocation failure: jobs have `runner_id=0`, empty `runner_name`, and `steps=[]`. Re-query CI for the final SHA; merge stays BLOCKED until tests actually run and pass.


## Retry checkpoint (2026-10-26, exact PR #161 head e44857cdcdb2cfbdc7bcb196cbdd221394f9cf06)
- Status: IN_PROGRESS; validation: BLOCKED; merge: NOT AUTHORIZED until checks pass.
- Re-ran failed jobs through GitHub Actions for the previous candidate runs. The resulting runs for this exact head are: dependency security scan [40361007047] (Python audit queued at last query; JavaScript audit failed), backend tests [40361006905] (failed), backend container [40361006897] (failed), and backend/frontend [40361006889] (both jobs failed).
- Job IDs returned no step summaries and null logs URLs, including test job 121706099095, container build 121706099001, frontend 121706098613, backend 121706098762, and JS audit 121706101205. Therefore these failures do not show whether the commands ran; do not classify them as code failures or passing checks without logs.
- Combined commit status for this head returned an empty statuses list. No test/build/security pass is evidenced.
- Workflow source review confirms backend tests are configured to run on ubuntu-latest with PostgreSQL 16, apply Alembic migrations, check migration drift, run pytest, and render offline migration SQL. The backend container workflow builds the image and imports app.main; the dependency scan uses pip-audit and npm audit. The currently available job metadata does not expose execution steps or runner errors, so root cause remains blocked at GitHub Actions job/log visibility.
- Source review of backend/app/operations.py confirms owner-only membership checks are applied before purchase receiving and sales-return approval; return approvals lock the invoice and aggregate requested quantity/amount by invoice line before enforcing cumulative ceilings. These are source observations only, not runtime verification.
- Next action: restore inspectable GitHub Actions job logs or run the same commands in an available checkout/runner; then fix any concrete failure, rerun checks on the exact latest head, and only then consider merge. Do not deploy or mutate production data while blocked.


## Payment and tenant-boundary review (2026-10-26)
- Defense-in-depth fix: `record_payment` now requires OWNER membership inside the service layer, matching the API route's existing owner-only policy. Commit: `4c00031d5e33fa57d7f8c8f9f0d9cc195a9ed889`.
- Added a direct service regression test proving STAFF cannot call `record_payment` even if they bypass the HTTP route: `test_payment_service_requires_owner_role` in `backend/tests/test_services.py`, commit `e40ef1845e016bc6c4dca326e8a46ff097ea8a2c`.
- Added a tenant-isolation regression test proving a payment in tenant A cannot allocate tenant B's invoice: `test_payment_cannot_allocate_invoice_from_another_business`, commit `d07aac67a4394216d0d0ad08ff8082db45b0f72c`.
- Existing source review evidence: payment idempotency is scoped by `(business_id, idempotency_key)` and rejects replay with different payment details; allocation queries constrain invoices and allocations to the same `business_id`; the model declares a unique constraint on `(business_id, idempotency_key)`. Existing API tests deny staff sensitive payment actions, and `test_business_tenant_boundaries.py` exercises non-member read/write denial for payments and other resources.
- Existing return approval locks the sales return, source invoice, return lines and source invoice lines, scopes every lookup by business, aggregates requested quantity/amount by source invoice line, and enforces previously approved quantity/amount ceilings before stock movements. This is source-level review only; PostgreSQL concurrency behavior remains untested until CI can execute.
- Latest observed PR #161 head at this checkpoint: `d07aac67a4394216d0d0ad08ff8082db45b0f72c`; base `af4ba084cedcec7339498579ef5563ce7748bf7c`; GitHub reports mergeable=true, mergeable_state=unstable, Draft=true. Latest runs on this head were queued when queried: dependency scan `40361340865`, container `40361341036`, backend tests `40361341002`. Previous head's job payloads consistently showed `runner_id=0`, empty runner name, and no steps. Recheck latest runs; do not infer success from queued or rerun-accepted states.
- Task status remains IN_PROGRESS; validation and release remain BLOCKED. No merge or deployment has occurred.
