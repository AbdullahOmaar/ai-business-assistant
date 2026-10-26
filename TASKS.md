# Project Task Ledger

> Updated 2026-10-27. This is a working queue, not proof that tasks have passed. Reconcile every item with current source, GitHub Issues/PRs, CI, and deployment evidence before changing its status.

## Rules
- Keep one canonical entry per task; link existing GitHub Issues/PRs instead of duplicating them.
- Use statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`.
- A task is `VERIFIED` only with implementation evidence and applicable passing checks.
- Record exact commands/results and commit or workflow links where available.
- At each run, choose the highest-priority actionable task, execute it, verify it, update this ledger, and continue.

## Active work

### P0 — Diagnose GitHub Actions runner allocation
- Status: `BLOCKED`
- Evidence from existing jobs: runs 40406529110, 40406528996, 40406528993, and 40406528969 for PR #161 failed within 3–4 seconds; all six jobs had `runner_id=0`, empty `runner_name`, and zero steps. Run 40377997975 from another branch showed the same pattern.
- Isolation test: PR #164 `https://github.com/AbdullahOmaar/ai-business-assistant/pull/164`, commit `fb1ef9026b2c8d1308d1db195f3021d0efcd9c70`, added a minimal no-secret `ubuntu-latest` workflow. Run 40410080644 failed after 3 seconds with `runner_id=0`, empty `runner_name`, and zero steps; no smoke-test output was produced. Existing CI jobs on the same PR failed identically.
- Interpretation: this is a confirmed pre-step hosted-runner allocation failure across the app CI and a minimal diagnostic workflow. It is not evidence that application tests failed, nor evidence that tests passed. Public GitHub Community discussions report the same failure signature across other repositories/accounts: https://github.com/orgs/community/discussions/205948 and https://github.com/orgs/community/discussions/208438.
- Likely owner of next action: GitHub platform/support or account-level hosted-runner entitlement/policy. Public status alone cannot rule out an account-specific backend problem.
- Next action: owner checks GitHub Actions usage/billing and repository/account Actions settings; then open GitHub Support request with run 40410080644, job 121878252005, PR 164, and the cross-branch examples. Ask support to inspect hosted runner dispatch/entitlement state. Do not keep rerunning identical workflows while the allocation signature persists.
- Safety: the diagnostic uses no secrets, production services, databases, deployment, or application data. Keep PR #164 Draft; do not merge it or release PR #161 merely to bypass blocked CI.

### P0 — Re-verify current CI and release readiness
- Status: `BLOCKED`
- Source: README.md and docs/PRODUCTION_DEPLOYMENT.md
- Acceptance: inspect latest relevant workflow runs and exact release candidate SHA; distinguish current failures from stale documentation; record verified status.
- Next action: resume after hosted runner allocation is restored or a trustworthy alternative CI environment validates the exact candidate SHA.

### P0 — Verify production configuration and authenticated smoke tests
- Status: `TODO`
- Source: README.md and docs/PRODUCTION_DEPLOYMENT.md
- Acceptance: verify configured Firebase web app, backend Firebase Admin credentials, PostgreSQL connectivity, exact CORS origins, frontend runtime config, sign-in, workspace isolation, invoice/payment/return flows, deployed frontend/API versions, and health/readiness endpoints without exposing secrets or mutating production data unsafely.
- Safety: follow the production runbook; do not perform production migrations or destructive operations without explicit approval.

### P1 — Verify invoice and payment edge cases and authorization
- Status: `TODO`
- Source: docs/PRODUCTION_DEPLOYMENT.md release gates and existing regression-test requirements
- Acceptance: verify role-specific positive/negative tests, cross-tenant isolation, invoice state transitions, payment allocations, discounts/returns rounding, and regression coverage against current code.
- Next action: inspect existing tests and open issues/PRs; add only missing coverage or fixes.

### P1 — Verify mobile/PWA production behavior
- Status: `TODO`
- Source: README.md and docs/MOBILE_RELEASE_CHECKLIST.md
- Acceptance: confirm the exact deployed commit, real sign-in/navigation/install/update behavior, viewport/keyboard behavior, and installed-PWA cache/version behavior on a supported browser/device when access is available.
- Blocker policy: if a physical device or deployment access is unavailable, document the unverified cases and continue independent work.

### P2 — Verify recurring invoice and notification background execution
- Status: `TODO`
- Source: README.md known limitations
- Acceptance: determine whether reliable workers/scheduling exist in current source; if missing, design and implement an appropriate safe, zero-cost-compatible path with tests and operational docs.
- Constraint: confirm actual platform limits and costs before enabling recurring jobs; never assume a scheduler is running.

## Active work checkpoint
- Current diagnostic branch: `diagnostic/github-runner-allocation-2026-10-27`; diagnostic PR #164 remains Draft and unmerged.
- PR #161 remains Draft and unmerged; current CI is blocked by hosted-runner allocation symptoms, not proven code test failures.
- No merge, version bump, or production deployment is authorized or claimed by this ledger.