# Engineering Task Tracker

Last reviewed: 2026-10-26 (UTC)
Default branch at last verified read: `dec7f26bd2bb33a4c27af4e785abe982e8486676`
Budget: **$0**. No paid plans, paid runners, or new paid services.

This file is the human-readable checkpoint; `docs/agent/task-ledger.json` is the structured backlog. Do not mark work verified from source review alone.

## Release blockers

| ID | Status | Evidence / next action |
|---|---|---|
| TASK-021 Test coverage | IN_PROGRESS | Existing PRs #143–#149 add regression cases for business-timezone reporting, sales-return amount/role enforcement, stale workspace responses, payment refresh/idempotency, CORS PUT, and schedule/settings validation. Execute them when a runner is available; inspect missing edge cases. |
| TASK-022 CI execution | BLOCKED | Actions runs have failed before runner allocation (`runner_id=0`, no steps/logs). This is an infrastructure/account-level failure, not evidence that tests passed or failed. Inspect account runner availability/limits; no paid upgrade. |
| TASK-023 PR review | IN_PROGRESS | Review open PRs #143–#151 and dependency order. Financial/security PRs require real test results before merge. |
| TASK-024 Merge ordering | BLOCKED | No merge until CI executes, security scan is reviewed, and dependent PRs are reconciled. Avoid stacking conflicting frontend/workflow changes. |
| TASK-025 Dependency security | BLOCKED | Dedicated workflow has not executed because no runner was assigned. Re-run free npm/pip audits once execution is available and retain the results. |
| TASK-026 Production configuration | BLOCKED | Do not expose secret values. Verify only metadata and runtime behavior; production credentials, database provider, authenticated smoke tests, and rollback access remain unverified. |
| TASK-027 Release candidate | TODO | Create only from a tested SHA after all release gates pass. |
| TASK-028 Release validation | TODO | Run backend tests, PostgreSQL migrations/concurrency tests, frontend tests/build, auth/tenant-isolation checks, and PWA smoke tests. |
| TASK-029 Deployment | TODO | Deploy only after gates pass; record deployed SHA and rollback path. No deployment has been proven for this change set. |
| TASK-030 Post-deploy verification | TODO | Verify deployed SHA, frontend, API readiness, auth/roles, and core financial workflows after a permitted deployment. |

## Five feature tracks

| ID | Status | Scope / acceptance evidence |
|---|---|---|
| FEATURE-031 Financial dashboard and reports | IN_PROGRESS | PR #143 adjusts business-local date bounds and states report limitations. Require DST boundaries, timezone validation, currency separation, and report correctness tests. |
| FEATURE-032 Invoices, discounts, and returns | IN_PROGRESS | PR #144 shares discounted line allocation and validates aggregate duplicate return lines. Require decimal/rounding tests and PostgreSQL concurrent approval test. |
| FEATURE-033 Payments and idempotency | IN_PROGRESS | PR #147 separates successful payment mutation from refresh failure and preserves idempotency on uncertain mutation outcome. Verify tests and user-facing recovery path. |
| FEATURE-034 Workspace/frontend consistency | IN_PROGRESS | PR #146 invalidates stale report requests on workspace changes. Require unit tests and production build. |
| FEATURE-035 API settings and recurring schedules | IN_PROGRESS | PR #148 covers CORS preflight PUT; PR #149 validates IANA timezones and blocks normalized secret-like setting keys. Require negative authorization and API tests. |

## CI and agent foundation

- PR #145 adds frontend unit-test execution; PR #151 adds path filters and removes duplicate npm audit from the general CI workflow while keeping the dedicated security workflow.
- PR #150 proposes a scheduled ledger monitor, not a persistent autonomous software engineer. It does not claim or perform source-code tasks, merge PRs, or deploy production.
- Do not merge any of these PRs while required checks are missing, runner-less, or unverified.
- Next action: resolve the runner-allocation blocker using available free GitHub Actions capacity, then run the full matrix and review each PR's actual checks/diff before merging.
