## Execution checkpoint — 2026-10-26 17:15 UTC

- Latest live PR #161 head observed immediately before this ledger edit: a94352d353b3b8fbf7a6092132964f3362aa1a5e; base/main recorded by GitHub: af4ba084cedcec7339498579ef5563ce7748bf7c. PR is open, Draft, and unmerged. Re-check head after this documentation commit because concurrent edits may advance it.
- Re-ran failed jobs for workflow runs 40366036176 (backend/frontend), 40366036186 (container), 40366036185 (dependency scan), and 40366036177 (backend tests). GitHub accepted retries. New runs for the latest observed candidate include backend/frontend 40366168982 (queued at last query), container 40366168740 (failure), dependency scan 40366168992 (failure), and backend tests 40366169193 (failure).
- Jobs on the latest completed attempts return steps=null / empty step lists and logs download fails with BlobNotFound. Therefore no passing test/build/audit is evidenced, and no command-level failure can be diagnosed from logs. Do not claim runner allocation failure for these exact newest attempts without runner metadata; previous runs did show runner_id=0 and no steps.
- Current #161 changed files include backend authorization/operations/services, timezone reporting, CORS/settings validation, regression tests, frontend API/app component, TASKS.md and release audit documentation. Source diffs do not substitute for executable verification.
- Open feature branches still require controlled reconciliation: #129 mobile invoice editor; #130 customer statements (mergeability false in latest read); #132 supplier/purchasing/expense/schedule UI; #133 tax summary; #134 broad operations/accounting consolidation (mergeability false in latest read); #157 workspace/report/payment retry UI protections. Do not merge stale/stacked branches blindly or create duplicate PRs.
- Confirmed outstanding release scope from open issues includes #79 credit notes/refunds/customer returns, #84 inventory valuation/COGS, #85 tax configuration/reporting, #86 bank/cash reconciliation, #87 period close/lock, #106 backup/restore drill, #110 owner/staff authorization, #111 rounding, and #94 release-safety roadmap. Inspect source and existing PRs before implementing any overlapping work.
- Status: implementation IN_PROGRESS; executable validation BLOCKED; merge/deployment BLOCKED. No main merge, production deployment, or production data mutation was performed in this checkpoint. Required next action: restore inspectable CI execution (hosted runner/platform support or authorized free runner), run backend/PostgreSQL tests, frontend checks/build, container build, and dependency audits on the exact final candidate SHA; fix observed failures and repeat before merge.


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
- Latest code head observed: `d07aac67a4394216d0d0ad08ff8082db45b0f72c`; current PR head after the ledger-only commit is `9344f7432ddd3837a1f0e6975112938f5b51c8fd`; base `af4ba084cedcec7339498579ef5563ce7748bf7c`. GitHub reports mergeable=true and mergeable_state=clean, but the PR remains Draft. Runs `40361340865` (dependency scan), `40361341036` (container), and `40361341002` (backend tests) subsequently completed FAILURE; every job has `runner_id=0`, empty runner name, and zero steps. Combined status is empty. This proves the runner never started the workflow commands; no test result exists. The ledger-only commit does not trigger code CI, so the latest code-head runs remain the relevant evidence.
- Task status remains IN_PROGRESS; validation and release remain BLOCKED. No merge or deployment has occurred.


## PR deduplication outcome
- Closed #154, #158, and #160 as superseded by #161 only after their source changes and regression tests were confirmed present in the canonical branch. All three are closed with `merged=false`; this was not a merge to main.
- #156 and #155 were already closed as duplicates/superseded. #157 remains open/Draft because its workspace request guards and payment retry UI behavior are distinct and have not been transplanted or validated here.
- Current open execution track is #161 plus distinct UI/payment safety #157. Release remains BLOCKED by runner allocation; no main merge or production deployment occurred.


## RELEASE-AUDIT-2026-10-26 — existing-scope production readiness review
- Status: BLOCKED; this is a source/configuration audit, not a passed test run or an accounting certification.
- Main SHA reviewed: `af4ba084cedcec7339498579ef5563ce7748bf7c`.
- Production frontend Vercel deployment is READY on the same SHA `af4ba084cedcec7339498579ef5563ce7748bf7c`.
- Production API Vercel deployment is READY but still runs `c8078c563ad9d88f04cccee740efdb1b64527df7`; `/version` returned `0.4.0`, commit `c8078c563ad9`, environment `production`. API `/health` returned 200 and `/readyz` returned 200 at review time. These liveness/readiness responses do not prove authenticated workflows.
- CI infrastructure evidence: main SHA run [40347841637](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40347841637) (dependency scan) failed. Runs [40313758952](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40313758952) (backend/frontend) and [40313758885](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40313758885) (container) failed. Fresh candidate runs [40361274542](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361274542) and [40361254273](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361254273) report `runner_id=0`, empty runner name, zero steps, and no logs. This is evidence jobs did not acquire a runner; it is not evidence that tests ran and failed in application code.
- Confirmed source findings on current main:
  1. `backend/app/main.py` CORS methods omit `PUT` although settings use PUT. The existing fix/test is in open PR #158 and is also represented in the consolidated #161 patch; not yet on main.
  2. `backend/app/core_features_api.py` calculates date boundaries and report defaults in UTC rather than the business's configured timezone. Dashboard response labels timezone as UTC. PR #154/#161 contain the proposed correction, but it is not merged/verified on main.
  3. `backend/app/extended_api.py` creates purchase orders with status `approved` for any active member; the release runbook says staff may create drafts and sensitive procurement actions require owner authorization. The current route does not expose a separate approval lifecycle. Treat this as a procurement authorization/workflow blocker.
  4. Service-layer guards in `backend/app/services.py` and `backend/app/operations.py` generally check membership, not OWNER role. Some HTTP routes add owner checks, but critical operations need defense-in-depth service checks plus STAFF-denied/OWNER-allowed tests. PR #161 attempts part of this; keep unverified until CI runs.
  5. Frontend navigation in `frontend/src/app/app.component.ts` currently includes overview, customers, products, invoices, payments, assistant, reports, and audit only. There are no visible supplier/purchase-order, expense-register, or sales-return screens in main. The invoice editor is single-product-line according to README; the multi-line editor exists in open PR #129.
  6. Purchase receiving currently records stock movements, but the existing model does not complete supplier-bill/payment/accounts-payable posting. Purchase order total/receiving is not a complete procure-to-pay accounting cycle.
  7. Sales returns exist as an operational workflow, but credit notes/refunds and complete reversal of receivables/cash are still tracked as missing in issue #79. Profit/loss and customer statements explicitly do not net all return/credit-note effects.
  8. Inventory movements exist, but inventory valuation and cost of goods sold are not implemented; therefore profit/loss is a management summary/estimate, not a full accrual-accounting profit figure (issue #84).
  9. Tax summary is not jurisdiction-specific tax compliance or filing. Inclusive/exclusive tax policy, exemptions, and configured jurisdiction need explicit treatment (issue #85).
  10. Bank/cash reconciliation, period close/lock, and dated foreign-exchange rates are still open in issues #86, #87, and #88. Do not claim bank reconciliation, period locking, or converted multi-currency reporting.
  11. Recurring invoices have schedule configuration but no verified scheduler/worker; notification records are queued but delivery is not verified. No automatic execution is proven.
  12. Production backup/restore drill has not been completed against an isolated target. A backup script or provider metadata is not proof of recoverability (issue #106 / runbook).
  13. Android installed-PWA, real Firebase sign-in, role matrix, cross-business negative paths, and full invoice/payment/return smoke tests remain unverified.
- Scope decision: no unrelated product features are approved by this audit. Only existing-workflow fixes required for safe release should be added. Do not silently rewrite historical invoice/customer data.
- Required order: (1) restore executable CI runner and get inspectable logs; (2) reconcile the existing PRs into one candidate and close proven CORS/timezone/role/rounding/return defects; (3) finish the existing UI paths needed for customers, sales/invoices/payments, purchasing/receiving, expenses, returns, and balances; (4) add/verify regression tests; (5) perform a zero-cost backup/restore drill if feasible; (6) deploy only after gates pass; (7) verify frontend/API SHAs and authenticated smoke flows.
- No production deployment, production migration, historical-data rewrite, or live business mutation was performed during this review.

- Additional confirmed security blocker from the 2026-10-26 source review: current main rejects only a small exact list of sensitive setting keys in `backend/app/extended_api.py`; normalized aliases such as `API-KEY`, `pwd`, `passwd`, `access-key`, and `encryption_key` are not comprehensively rejected, while setting responses include stored values. Keep the generic settings table free of secrets and verify the broader validation patch in #160/#161 before release.

- Runtime review: Vercel error summaries for the production frontend and API reported no error clusters in the last 24 hours; raw 24-hour logs were unavailable on the Hobby retention window. This does not replace authenticated smoke tests. The audit report was committed to PR #161; current branch head before this checkpoint update was `df6954b54f17814fe3b790b82b5dde3e5e84689c`. Keep the PR draft because code tests remain unverified.


## Follow-up security fix — purchase-order authorization (2026-10-26)
- Confirmed source defect in the canonical #161 branch: `POST /purchase-orders` authorized any active member, then persisted the order directly with status `approved`. That allowed a STAFF member to create an approved procurement commitment despite the receiving route requiring OWNER.
- Applied defense-in-depth at the route boundary: purchase-order creation now calls `_authorized(..., owner_only=True)`, preventing STAFF from creating an already-approved order. This is the smallest safe change for the current workflow because no separate approval endpoint/lifecycle is present.
- Added API regression test `test_staff_cannot_create_approved_purchase_order`; it asserts STAFF receives 403 and no purchase-order line is persisted.
- Commits: authorization fix `4a3f57c358cbbb3df72d1e59bc6ff92b2d367f98`; regression test `3548922c1c59471d5d38d283e87618f319bd3903`.
- Validation: source edit and test addition were committed through GitHub; tests were NOT executed. On prior observed head `4bd529d06a60e1692e8ec5c447c3aab9bd9e6837`, latest backend test run [40361849566](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361849566) failed with no step payload; frontend/backend [40361849514](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361849514) and container [40361849567](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361849567) also failed without inspectable steps; dependency scan [40361849473](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40361849473) remained queued. These are not passing checks and do not yet identify a code failure. Re-query CI on the new exact head.
- Status: implementation IN_PROGRESS; automated validation BLOCKED; merge/deploy remain blocked.


## Latest verification attempt — 2026-10-26
- PR #161 latest reviewed head before this ledger-only commit: 4bd529d06a60e1692e8ec5c447c3aab9bd9e6837; base main: af4ba084cedcec7339498579ef5563ce7748bf7c.
- Re-ran failed jobs on runs 40361849514 (backend/frontend), 40361849567 (container), 40361849566 (backend tests), and 40361849473 (dependency scan). GitHub accepted reruns, but fresh job records again show backend, frontend, container build, and backend test completed as failure with steps=null and logs_url=null; dependency jobs were queued at last poll.
- Direct log fetch for backend test job 121718300526 returned BlobNotFound; step query returned an empty list. The rerun created job 121719176852 with the same failure/no-log pattern. This is repeatable missing job/log evidence, not a test pass and not sufficient to diagnose a source defect.
- Additional source review: financial_summary and /reports/summary report issued invoice totals and allocated payments/expenses by currency, and explicitly disclaim that totals are not profit or cash balance. They currently do not net approved sales returns; profit/loss and customer-statement correctness remains a release blocker and should be addressed with explicit accounting semantics and tests before release rather than silently changing the meaning of existing summary fields.
- No production data was mutated; no merge/deploy was performed. Status remains IN_PROGRESS for source review and BLOCKED for runtime verification. Do not merge until tests/build/security checks are inspectably passing on the exact candidate SHA.


## Procurement authorization fix (2026-10-26)
- Status: IN_PROGRESS; runtime verification: BLOCKED on GitHub Actions job-log visibility.
- Source review found a concrete authorization/workflow defect in `backend/app/extended_api.py`: POST `/purchase-orders` created orders directly as `approved` for any active member, bypassing owner approval; the receipt endpoint also accepted nonpositive receipt quantities, which could create invalid/negative stock movements.
- Implemented on this PR branch: new orders start in `draft`; added owner-only POST `/purchase-orders/{order_id}/approve` with business scoping, row lock, state validation, nonempty-line check, and audit event; receipt endpoint rejects empty receipts and nonpositive quantities.
- Regression coverage updated in `backend/tests/test_api.py`: owner approval and receipt flow, zero-quantity receipt rejection, and STAFF denied approval while draft status remains unchanged.
- Not yet runtime-verified: tests have not been shown to execute. Prior workflow runs on candidate head `4bd529d06a60e1692e8ec5c447c3aab9bd9e6837` all reported failure but each job had empty steps and logs download returned BlobNotFound. Recheck Actions on the new head; do not merge until backend tests, frontend checks, container build, and dependency scans have inspectable successful results.


## Latest retry and source review — 2026-10-26
- Latest PR #161 head inspected: a3178296eb934e570050fdf33d45e4c4e2609ff6; base main af4ba084cedcec7339498579ef5563ce7748bf7c. PR remains Draft/open/unmerged.
- Latest workflow runs on this candidate: backend tests 40364867367; dependency scan 40364864811; container build 40364864962; backend/frontend 40364864937. All completed failure. Job records for test 121719714756, Python audit 121719706209, JS audit 121719707007, container 121719706389, backend 121719706692, and frontend 121719707444 expose steps=null and logs_url=null. Direct logs remain unavailable/BlobNotFound on prior exact attempts. No passing check is evidenced.
- Source review confirmed new purchase orders now start as draft; order approval and receipt are owner-only, business-scoped, state-checked, and audited; receipt rejects empty/nonpositive quantities and caps quantities at ordered amounts. A negative staff approval test was added. Payment recording is now owner-only in the service layer. These are code-level observations only; no runtime test result is available.
- Accounting follow-up: both summary/report surfaces currently show issued invoice totals and payments/expenses but do not include approved sales returns as a separate currency-scoped total. Existing endpoint text explicitly says these totals are not profit/cash balance. Treat return presentation in profit/loss/customer statements as unfinished; do not silently net returns into the issued-invoice total without a documented accounting contract and tests.
- Current status: implementation IN_PROGRESS; validation BLOCKED by unavailable GitHub Actions job steps/logs; merge/deploy NOT performed. Next: restore runner/job log visibility or use a working checkout/runner, run backend/PostgreSQL tests, frontend checks/build, container import/build and dependency scans, then address concrete failures and verify latest exact SHA before merge.


## Execution checkpoint — latest observed candidate (2026-10-26 17:03 UTC)
- Candidate PR: [#161](https://github.com/AbdullahOmaar/ai-business-assistant/pull/161), branch `task/production-safety-consolidated`, observed head `f133dd74b057f9c6f566d272e666152453d970d9`, base/main `af4ba084cedcec7339498579ef5563ce7748bf7c`; remains Draft/open.
- Reconciled purchasing lifecycle in candidate source: purchase order creation persists `draft`; a separate `POST /purchase-orders/{order_id}/approve` requires OWNER, locks/scopes the order to its business, validates it is still draft and has lines, then records an audit event. Receipt remains OWNER-only and only accepts approved/partially received orders.
- Candidate regression coverage now includes owner approval before receiving, staff denied purchase-order approval, sales-return quantity/value/cumulative-return checks, owner-only payment service checks, business-local timezone reporting, CORS PUT preflight, and rejection of secret-like settings keys. This is source/test-file inspection, not execution evidence.
- Latest workflow attempts on head `f133dd74b057f9c6f566d272e666152453d970d9`: [backend/frontend](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365000073), [container](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40364999911), [dependency scan](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40364999866). Jobs report failure with `steps=null`; fetching step summaries returns empty arrays, and logs are unavailable. Re-runs were accepted but reproduced the same failure-before-steps pattern. No test/build/audit command is evidenced as executed successfully.
- Main remains `af4ba084cedcec7339498579ef5563ce7748bf7c`. Production frontend points to that SHA; API remains on `c8078c563ad9d88f04cccee740efdb1b64527df7`. No deployment or merge was performed.
- Release blockers still open: executable CI on an available runner; UI integration for purchasing/expenses/returns and multi-line invoices from existing PRs; complete credit-note/refund and supplier payable lifecycle; inventory valuation/COGS; reconciliation/period close/tax-jurisdiction review; backup restore drill; authenticated safe production smoke tests.
- Next action: reconcile existing UI PRs (#129 and #132, plus statement/report PRs) into this candidate without overwriting current workspace/payment/timezone fixes; run all gates on one exact SHA when runner allocation works. Keep merge and deployment blocked until then.


## Regression review — purchasing role test (2026-10-26)
- Found and fixed a concrete test defect: the new test_staff_cannot_approve_purchase_order referenced the PurchaseOrder ORM model without importing it. Added the missing import in commit 2b907970d90a764551499b4bf050d04fc8c346e1.
- Current candidate after that source/test commit: 2b907970d90a764551499b4bf050d04fc8c346e1; main remains af4ba084cedcec7339498579ef5563ce7748bf7c.
- Workflows triggered for this candidate: container https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365361368, backend/frontend https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365361379, dependency scan https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365361391, backend tests https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365361451. All jobs returned failure with no step summaries; rechecking yielded steps=null. No command execution is evidenced, so this import fix is not runtime-verified.


## Procurement workflow follow-up — 2026-10-26
- Reconciled the current branch's procurement flow: purchase-order creation already records a `draft`, and a separate `POST /purchase-orders/{order_id}/approve` requires OWNER. The prior source had also restricted draft creation to OWNER, which prevented STAFF from preparing orders for owner review.
- Changed only the draft-creation authorization to allow an authorized business member; owner-only approval and owner-only receipt remain in place. Updated `test_staff_cannot_approve_purchase_order` so it now creates the draft as STAFF, confirms status is `draft`, attempts approval, and asserts 403 with the order still draft.
- Source commit: `06661ad9d38d72a0c013add54bcf13be1832fb82`; test commit: `c96675c9592958ccbeafbc1ebcfd80c1c90e9d26`.
- Static source verification only; test execution is still BLOCKED. Latest observed CI attempts on prior candidate `0065ee9f70553f99eed8ff96617379a97909bd9d` were all failures with `steps=null`: backend tests [40365490575](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365490575), backend/frontend [40365490600](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365490600), container [40365490672](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365490672), dependency scan [40365490550](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40365490550). Re-query checks for the new exact candidate before any release decision.
- Release remains BLOCKED: no merge/deploy; main SHA remains `af4ba084cedcec7339498579ef5563ce7748bf7c` at last confirmed check. Open accounting gaps still include approved returns not netted from reported revenue, incomplete tax/credit-note lifecycle, no COGS valuation linked to sales, reconciliation/period-close and backup-restore verification.


## Continuation checkpoint — 2026-10-26 (latest PR review)
- Latest PR #161 head observed: 3b4e66baa8cbf748e50a07027ce852ad46175cbc; base main: af4ba084cedcec7339498579ef5563ce7748bf7c; PR remains open/draft/unmerged. Head has moved repeatedly while reviewing; always refresh before any source update.
- Re-ran failed workflows again (runs 40361849514 backend/frontend, 40361849567 container, 40361849566 backend tests, 40361849473 dependency audit). GitHub accepted retries, but the new jobs again reported backend/frontend/container/tests as failure with no step summaries and no logs URL. Direct log retrieval returned BlobNotFound. No executable test result is available.
- Existing UI work remains open and based on older main SHAs: PR #129 mobile invoice draft editor head 7b4c9aeee47516aa95c59d70a351af5026e94993 based on e682479c91ae6caeff99b47ab9174402d93599bb; PR #132 purchasing/expenses/schedule views head 537935b9c1ebd3dc0141fb1a6790f53db41a063e based on b657d2188878a73deccdbb750bae314dfd0c2d49; PR #157 workspace reports/payment retry protection head 29e442167a0de3bfbde0c20f41d5ba2c4d9c580c based on e1ccc669058786634bcc3eeb0ff411049d25b4c7. They remain draft/open and should not be merged blindly: stale base means conflict/regression review is required.
- Source inventory confirms extended_api.py exposes GET /payments only; no payment creation/allocation or refund/credit-note route is implemented in that router. This is a confirmed completeness gap for a full invoice/payment/return lifecycle, not a claim that another module has no such route; route-wide inventory is required before implementation to avoid duplicate endpoints.
- Current financial summary explicitly reports issued invoice totals and expenses by currency, not profit or cash balance. Receivables aging computes allocations but does not visibly net approved sales returns; because approved returns lack a verified credit-note/refund posting lifecycle, do not silently net them until accounting treatment is defined and tested.
- Status: source review IN_PROGRESS; runtime verification BLOCKED; merge/deploy NOT AUTHORIZED until exact-head test/build/security results are available and pass. No production data was mutated.


## Procurement workflow regression coverage — 2026-10-26
- Added `test_owner_can_approve_draft_purchase_order`: verifies owner-created draft starts in `draft`, owner approval returns `approved`, persists the transition, and retains the expected Decimal total.
- Test commit: `6242bcb151a5e17c7f8b99cca4efea43102420ee`. The staff workflow test also now exercises the intended lifecycle: STAFF creates a draft, STAFF approval is denied, and the order remains draft.
- Rechecked PR #161 head: `6242bcb151a5e17c7f8b99cca4efea43102420ee`, base/main: `af4ba084cedcec7339498579ef5563ce7748bf7c`, open and Draft. No workflow runs were returned for this exact head at the time of checking; the latest runs on the preceding test commit failed without step summaries, and log download returned 404 (no logs available). Do not infer that tests ran or passed.
- Status: code/test changes committed to candidate; validation BLOCKED; merge/deploy blocked.


## Follow-up route inventory correction — 2026-10-26
- Completed the cross-module route inventory after the earlier note: payment creation DOES exist in backend/app/api.py as POST /businesses/{business_id}/payments, calling services.record_payment. The earlier statement was scoped to extended_api.py only; do not interpret it as absence from the whole backend. Existing service logic enforces owner role, customer/business matching, invoice/business and currency matching, allocation ceilings, and idempotency-key detail consistency; existing tests cover idempotent replay, owner-only access, and cross-business invoice allocation.
- A fresh direct log fetch for job 121724266053 (backend tests), 121724178985 (container), 121724160171 (frontend), and 121724208196 (JS dependency audit) again returned BlobNotFound. Job metadata still has steps=null and logs_url=null. This is a repeatable CI evidence/runner-log problem, not a passing run and not enough to diagnose code failures.
- No safe code change was made based on an unverified accounting assumption. Next technical step is obtain an executable checkout/runner or repair the GitHub Actions logging/runner path, then run pytest, frontend tests/build, container import/build, migration drift, and dependency audits on the exact current head.


## Financial correctness follow-up — 2026-10-26

### FIN-RET-001 — Trace and specify sales-return accounting before changing formulas
- Status: IN_PROGRESS.
- Canonical implementation branch/PR: `task/production-safety-consolidated` / [PR #161](https://github.com/AbdullahOmaar/ai-business-assistant/pull/161).
- Evidence from `backend/app/core_features_api.py`: profit/loss revenue currently sums issued invoice `total`; response explicitly states approved sales returns are not netted and stored tax is included. This is a confirmed reporting limitation, not permission to subtract gross return totals blindly.
- Required source audit before implementation: inspect return/return-line schema and lifecycle, whether returned amounts represent gross/tax-inclusive or net values, discount allocation, tax rates/amounts, invoice-line references, approval timestamps/status, and any credit-note/refund records. Trace all existing customer statement, dashboard, aging, and profit/loss calculations.
- Acceptance: document a single source-of-truth treatment for approved vs draft/rejected returns; prove currency/business scoping; reconcile invoice subtotal, discount, tax, total, return lines and refund/payment data without inventing tax allocation rules.
- Safety: do not alter monetary formulas or tax allocation until the stored fields and intended accounting semantics are proven from code/tests.

### FIN-RET-002 — Add sales-return regression fixtures and invariant tests
- Status: TODO.
- Add tests for draft/rejected returns excluded from posted reporting; approved returns reflected only according to the verified accounting policy; duplicate request lines aggregated safely; cumulative returned quantity/value never exceeds the source invoice line; discounted lines and decimal rounding; zero/negative/over-limit amounts; cross-business invoice/line references rejected; wrong-currency allocations rejected; unauthorized staff approval rejected.
- Add reconciliation assertions that no amount is silently counted twice across invoice, return, credit note, and refund records. Where the current schema cannot support a safe assertion, add an explicit limitation and separate task rather than guessing.
- Required validation: backend tests against supported PostgreSQL behavior (including concurrent duplicate/over-return attempts), plus existing SQLite unit coverage where applicable. Do not mark VERIFIED from source inspection alone.

### FIN-REPORT-003 — Financial report reconciliation contract
- Status: TODO.
- Add fixtures covering invoice-only, partial payment, fully paid, approved return, expense, mixed currencies, business-local date boundaries, and DST transitions.
- Assert dashboard invoiced sales, collected payments, expenses, outstanding balances, and profit/loss remain distinct measures; no currency aggregation/conversion; date filtering is business-local and half-open in UTC.
- Report names must not imply net profit until COGS and the approved return/tax treatment are represented. Keep explicit limitations until the required ledgers exist.

### FIN-COGS-004 — Inventory valuation and cost-of-goods-sold linkage
- Status: TODO.
- Trace purchase receipt, stock movements, product cost, invoice line, return-to-stock, and cost history. Choose valuation method only after reviewing existing schema and business rules; do not derive COGS from current purchase price when historical cost is needed.
- Acceptance: documented valuation policy, immutable/reproducible cost basis, return reversal policy, currency and tenant isolation, and tests for stock/financial reconciliation. Keep profit/loss explicitly before COGS until then.

### FIN-TAX-005 — Credit notes, tax treatment, and refunds
- Status: TODO.
- Reconcile existing issues/PRs before adding work. Define the relationship between sales returns, credit notes, tax reversals, and cash refunds from the actual schema and applicable product requirements. Do not infer tax rates or split gross amounts into net/tax without source data.
- Acceptance: explicit state transitions, owner permissions, idempotent refund handling, audit trail, tenant/currency checks, and regression tests; any legally required accounting interpretation needs an owner/accountant decision before production activation.

### REL-CI-006 — Inspectable CI gate recovery (no runner assumptions)
- Status: BLOCKED.
- Latest observed PR #161 head before this ledger update: `a7e176f745e8205167341916892421f8f3297faf`; main/base SHA: `af4ba084cedcec7339498579ef5563ce7748bf7c`.
- Reran runs `40366521926`, `40366521727`, `40366521786`, and `40366521696`; GitHub accepted the retries, but all four returned failure. Their jobs expose `steps=null` and `logs_url=null`; this does not establish a code failure or prove runner allocation failure for those exact attempts.
- Next actions independent of runner availability: review workflow YAML, dependency manifests, and commands; add/maintain deterministic regression tests; run any tests possible in the current environment; preserve CI gates. Once an authorized execution environment yields inspectable successful checks on the exact final SHA, re-evaluate merge readiness.
- Do not bypass required checks, merge, deploy, or mark VERIFIED without evidence.

### Release gate — merge/deployment
- Status: BLOCKED.
- No merge or deployment is authorized by passing evidence at this checkpoint. PR #161 remains Draft/open; #157 is a separate Draft/open UI safety change and must be reconciled independently.
- Before merge: review return/payment/tenant authorization diffs, ensure no duplicated or conflicting UI changes, obtain passing backend/PostgreSQL tests, frontend tests/build, container build and dependency security scan on the exact candidate SHA.
- After merge only: record merge SHA, verify `main` head and CI, then perform safe read-only production version/health checks. Never infer deployed version from the production URL alone.


## Financial reporting clarification update — 2026-10-26
- Status: IN_PROGRESS; executable validation remains BLOCKED.
- Evidence reviewed in `backend/app/models.py`: invoice header stores `subtotal`, `discount_total`, `tax_total`, and `total`; sales-return header stores only `total`; return lines store quantity and amount but no tax allocation or credit-note/refund linkage. Therefore a safe net-of-return/tax formula cannot be inferred from the current return records alone.
- Safe additive change: `backend/app/core_features_api.py` now emits `revenue_basis` with the explicit contract “gross issued invoice totals before sales returns; stored invoice tax is included”. Existing currency-separated values and formulas remain unchanged. Commit: `87712e010aa87dc717fc3d6b594e706c708e098f`.
- Regression assertion added to `backend/tests/test_business_timezone_reporting.py` to check the new report basis while retaining the existing timezone, revenue, expense, and limitations assertions. Commit: `089cbdda74d56f035fa5a67f10b991598d54e932`.
- These source/test edits are committed to the canonical PR branch, but tests were not executed in this environment. Do not mark VERIFIED until the test runs on the exact head and report contract compatibility are checked.
- Next independent tasks: trace all frontend consumers of `profit-loss` to confirm additive-field compatibility; add a fixture with an approved return to prove the response remains explicitly gross-before-returns until tax/credit-note semantics are defined; review existing credit-note/refund work before implementation. No accounting amount or tax allocation was changed.


## Financial reporting contract follow-through — 2026-10-26
- Status: IN_PROGRESS; test execution not yet verified.
- Added a focused regression test that creates an issued invoice plus an approved sales return and asserts profit/loss remains explicitly gross-before-returns while the current schema has no tax allocation/credit-note ledger. Test file: `backend/tests/test_business_timezone_reporting.py`. Commit: `971b857423415807fdd804abb2f28277006d53fe`.
- Updated the frontend `ProfitLossReport` type to include `revenue_basis` and displayed that basis in the report UI, so the API's gross-before-return/tax-included caveat is visible rather than hidden in backend-only limitations. Commits: `8465cb6bf3a4e96c9b55e91b108ef37bcd475e55`, `a7c0dfb36cf2007406c3d928a48e6738c2a6f33a`.
- Existing frontend only consumes typed `currencies` and `period`; the new response field is additive and does not replace existing keys. Source inspection only; no frontend build or backend test execution has been claimed.
- Next: verify template compilation and backend fixture on CI or an authorized local test environment; inspect all return and customer-statement surfaces for consistent disclosures; only after tax/credit-note/refund semantics are established implement net-return accounting.


## Execution checkpoint — 2026-10-26 (latest independent review)
- PR #161 current observed head before this checkpoint: 0d1d9eb8ee957132b3f93a9b54982f2e63596fb6; base SHA: af4ba084cedcec7339498579ef5563ce7748bf7c. State: open, draft=true, merged=false, mergeable=true. Re-check metadata because this ledger edit advances the branch.
- Exact-head workflow runs returned by GitHub for that candidate: backend tests [40369574889](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40369574889), backend/frontend [40369575309](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40369575309), container [40369575108](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40369575108), dependency scan [40369574923](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40369574923) all report completed/failure. The backend test job response contains `steps=null` and `logs_url=null`; combined status is empty. This does not prove tests ran or passed and does not identify a code-level cause.
- Read-only source inspection confirms #161 includes transactional service workflows and regression coverage, including tenant-scoped invoice/customer/product lookups, payment idempotency and allocation validation, stock movement negative-inventory protection, owner-only purchase-order receiving, and owner-only return approval with cumulative quantity/amount caps. This is source evidence only, not runtime validation.
- Backend workflow configuration on main explicitly runs PostgreSQL 16, Alembic upgrade/current/check, pytest, and offline migration SQL rendering. These steps cannot be claimed successful while the current run exposes no steps/logs.
- Feature/release gap remains: sales returns are not yet proven to generate credit notes/refund/payment-ledger entries or net correctly into financial statements. Do not invent accounting treatment or change tax/COGS assumptions without established domain rules and tests. Other unresolved areas include inventory valuation/COGS, bank/cash reconciliation, period close, backup/restore evidence, and complete role-matrix checks.
- Status: PROD-SAFETY-001 implementation IN_PROGRESS; validation BLOCKED; merge/deployment BLOCKED. User requested continuing without waiting for runner; source review and repository work can continue, but a merge of payment/accounting/authentication changes with failed or uninspectable required checks would violate release safety. No merge/deploy was performed.
- Next actionable work: inspect and reconcile existing feature PRs/issues against current main; implement only a non-duplicative, bounded feature with explicit domain rules and tests. For release, GitHub Actions must expose successful backend/PostgreSQL, frontend build/test, container, and dependency-check results on the exact final candidate SHA.


## Feature implementation checkpoint — 2026-10-26
- Added a bounded slice of Feature 30 (Operational health and audit dashboard, issue #69) on canonical PR #161: backend middleware now generates a fresh UUID correlation ID for each HTTP response as `X-Request-ID`; it does not echo caller-supplied IDs. CORS now exposes this header so browser clients can read it. This adds no customer data, secrets, or production mutations.
- Regression tests added to `backend/tests/test_main.py`: verify health response IDs are valid server-generated UUIDs and caller-provided `X-Request-ID` is not trusted; CORS regression asserts the correlation header is exposed. Source commits: `b75368b2bb43893b000969976af151140c85aa2d`, `2f3dd74bf78dd110049872cf3c1d06430919e261`, `c5a0a738a96cd2ee5452c2e9f86c252afc51d773`, `5dfd607565b7aaa79ab4bd91f6401d35e28cae31`.
- Validation status: tests are authored but NOT executed locally or in CI. The latest observed workflow attempts for the preceding candidate all failed with missing step/log payloads; the exact newest candidate must still be checked. Feature status remains IN_PROGRESS, not VERIFIED. Readiness/database migration status and redacted operational error reporting remain unimplemented parts of issue #69.
- PR #161 at the time of this checkpoint: head `5dfd607565b7aaa79ab4bd91f6401d35e28cae31`, base `af4ba084cedcec7339498579ef5563ce7748bf7c`, state `open`, draft=true, merged=false. Do not merge or deploy until required backend/PostgreSQL, frontend/build, container, and dependency checks are successful and inspectable on the exact final head. No runner was manually provisioned or required from the user; source work proceeded via GitHub repository access.



## Execution checkpoint — receivables-aging regression coverage (2026-10-26)
- Status: IN_PROGRESS; validation BLOCKED until CI provides inspectable successful runs.
- Feature reviewed: existing `GET /api/v1/businesses/{business_id}/reports/receivables-aging` already separates balances by currency, flags mismatched-currency allocations and overallocations, and places missing due dates in a distinct bucket. Avoided duplicating this endpoint.
- Added API regression coverage in `backend/tests/test_api.py` for (1) missing due-date balances staying in `no_due_date` and currency-specific summaries, and (2) non-member access being denied without invoice disclosure.
- Commits: `26e767fec607bbeb8e17ac027c5b98c3a5c265ce` (initial test addition), `c8ce37a4f1f5fb23bffe719f83de3ac6d1ecde5b` (corrected expected fixture total after source review). These changes are source commits only; the tests have NOT been executed locally or successfully in CI.
- Release gate remains BLOCKED: latest previous candidate runs had failed workflow conclusions with unavailable steps/logs. Re-query CI for the new head. Do not merge or deploy until backend tests, frontend build/tests, container build, and dependency scans pass on the exact final SHA.
- Next accounting priorities remain credit notes/refunds (#79), inventory valuation/COGS (#84), tax reporting (#85), reconciliation (#86), and period close (#87); inspect existing branches/issues before any overlapping implementation.


## Execution checkpoint — approved-return visibility feature (2026-10-26)
- Status: implementation IN_PROGRESS; executable validation BLOCKED; merge/deploy BLOCKED.
- Added a separate approved-return amount/count to the profit-and-loss report, grouped by invoice currency and limited to approved returns attached to issued invoices whose original issue date is inside the selected report period. Return totals are NOT deducted from revenue or used to infer tax/credit-note/refund treatment.
- Rationale: SalesReturn stores a total and creation timestamp but no approval timestamp, tax allocation, discount allocation, credit-note link, or refund link. Filtering by the original invoice's issue date is explicitly documented to avoid silently inventing a return recognition date.
- Added regression assertions to the existing approved-return fixture and exposed the new fields in the frontend type and report UI with a clear non-netted label.
- Source edits are being committed to the existing canonical #161 branch; no runner was queried per the current instruction. Tests/build/security checks have not been executed in this checkpoint. Do not merge or deploy until the required gates have inspectable successful evidence.


- Follow-up test fixture: added draft and rejected sales returns to the approved-return reporting regression case, asserting they are excluded from the approved-return total/count. Source commit: `021dac13ffea9fde091fcef3356635835e8884a1`. This is source-level coverage only; not executed.


## Accounting priority checkpoint — credit notes/refunds (2026-10-26)
- Credit-note/refund feature (#79): **IN_PROGRESS**. The existing sales-return workflow only records/approves returned quantities and stock movements; it does not persist a credit note, record a refund, or post a customer-ledger adjustment. Do not represent an approved goods return as cash refunded.
- Added regression test `test_approving_sales_return_does_not_silently_rewrite_invoice_or_payment_balances` in `backend/tests/test_api.py` (commit `d344304c1cdbb3d6bd853cd2a9d997de17aef56b`). It asserts approval preserves the issued invoice snapshot, recorded payment, payment allocation, currency, and outstanding calculation until a separate audited credit-note/refund workflow exists.
- This is source-level test coverage only; the test has **not** been executed. Re-query Actions on the exact current head. Do not mark VERIFIED from authored tests alone.
- Remaining implementation before #79 can be VERIFIED: design a persistent credit-note record linked to invoice/customer/approved return, immutable line/tax/discount snapshots, idempotent refund records linked to actual recorded payments, per-currency caps, owner-only posting, audit events, and transactional/locked cumulative limits. Add an Alembic migration and positive/negative tests for partial credit, partial refund, duplicate idempotency key, already-refunded amount, cross-business/customer/currency mismatch, staff denial, and unchanged historical invoice/payment records.
- Accounting policy is intentionally not guessed: the current return model has no tax allocation or credit-note recognition date and no refund ledger. Until those are specified and implemented, do not net returns into revenue/tax/COGS or claim customer balances are fully reconciled.
- Status: code/test authoring **IN_PROGRESS**; executable verification **BLOCKED** if Actions does not expose inspectable passing steps; merge/deploy remain **BLOCKED** until the exact candidate SHA passes required checks.
