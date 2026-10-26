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
