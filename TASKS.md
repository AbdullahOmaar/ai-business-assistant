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
- Status: `IN_PROGRESS`
- Evidence: runs 40406529110, 40406528996, 40406528993, and 40406528969 for PR #161 all failed within 3–4 seconds; all six jobs had `runner_id=0`, empty `runner_name`, and zero steps. A job from another branch (run 40377997975) showed the same pattern. Logs were unavailable for the sampled failed job.
- Current hypothesis: jobs are failing before a hosted runner starts; this is not evidence of a test assertion failure.
- Diagnostic change: added `.github/workflows/runner-diagnostic.yml` on branch `diagnostic/github-runner-allocation-2026-10-27`. It runs one two-minute, no-secrets smoke job and prints runner metadata only.
- Acceptance: run the diagnostic PR workflow; confirm whether a runner is allocated and the step emits `RUNNER_ALLOCATION_OK`. If it fails before any step with runner ID 0, capture the run/job IDs and escalate through GitHub Support after checking Actions usage/billing/repository policy.
- Safety: no secrets, production services, databases, deployment, or application data are used. Do not merge the diagnostic PR or release PR #161 merely to bypass blocked CI.
- Next action: open a draft PR, inspect its run/job metadata, and continue to isolate the runner/account-policy issue.

### P0 — Re-verify current CI and release readiness
- Status: `BLOCKED`
- Source: README.md and docs/PRODUCTION_DEPLOYMENT.md
- Acceptance: inspect latest relevant workflow runs and exact release candidate SHA; distinguish current failures from stale documentation; record verified status.
- Next action: resume after runner allocation is restored or a trustworthy alternative CI environment validates the exact candidate SHA.

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
- Current diagnostic branch: `diagnostic/github-runner-allocation-2026-10-27`.
- PR #161 remains Draft and unmerged; current CI is blocked by runner allocation symptoms, not proven code test failures.
- No merge, version bump, or production deployment is authorized or claimed by this ledger.