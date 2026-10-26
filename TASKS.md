# Project Task Ledger

> Initial handoff ledger created 2026-10-26. This is a starting snapshot from repository documentation, not a claim that each item was re-tested in this session. Reconcile every item with current source, GitHub Issues/PRs, CI, and deployment evidence before changing its status.

## Rules
- Keep one canonical entry per task; link existing GitHub Issues/PRs instead of duplicating them.
- Use statuses: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `NEEDS_VERIFICATION`.
- A task is `DONE` only with implementation evidence and applicable passing checks.
- Record exact commands/results and commit or workflow links where available.
- At each run, choose the highest-priority actionable task, execute it, verify it, update this ledger, and continue.

## Initial tasks to reconcile

### P0 — Re-verify current CI and release readiness
- Status: `NEEDS_VERIFICATION`
- Source: README.md and docs/PRODUCTION_DEPLOYMENT.md
- Acceptance: inspect latest relevant workflow runs and exact release candidate SHA; distinguish current failures from stale documentation; record verified status.
- Next action: inspect Actions runs and current open PRs before selecting a release candidate.

### P0 — Verify production configuration and authenticated smoke tests
- Status: `NEEDS_VERIFICATION`
- Source: README.md and docs/PRODUCTION_DEPLOYMENT.md
- Acceptance: verify configured Firebase web app, backend Firebase Admin credentials, PostgreSQL connectivity, exact CORS origins, frontend runtime config, sign-in, workspace isolation, invoice/payment/return flows, deployed frontend/API versions, and health/readiness endpoints without exposing secrets or mutating production data unsafely.
- Safety: follow the production runbook; do not perform production migrations or destructive operations without explicit approval.

### P1 — Verify invoice and payment edge cases and authorization
- Status: `NEEDS_VERIFICATION`
- Source: docs/PRODUCTION_DEPLOYMENT.md release gates and existing regression-test requirements
- Acceptance: verify role-specific positive/negative tests, cross-tenant isolation, invoice state transitions, payment allocations, discounts/returns rounding, and regression coverage against current code.
- Next action: inspect existing tests and open issues/PRs; add only missing coverage or fixes.

### P1 — Verify mobile/PWA production behavior
- Status: `NEEDS_VERIFICATION`
- Source: README.md and docs/MOBILE_RELEASE_CHECKLIST.md
- Acceptance: confirm the exact deployed commit, real sign-in/navigation/install/update behavior, viewport/keyboard behavior, and installed-PWA cache/version behavior on a supported browser/device when access is available.
- Blocker policy: if a physical device or deployment access is unavailable, document the unverified cases and continue independent work.

### P2 — Verify recurring invoice and notification background execution
- Status: `NEEDS_VERIFICATION`
- Source: README.md known limitations
- Acceptance: determine whether reliable workers/scheduling exist in current source; if missing, design and implement an appropriate safe, zero-cost-compatible path with tests and operational docs.
- Constraint: confirm actual platform limits and costs before enabling recurring jobs; never assume a scheduler is running.

## Consolidated production-safety task (single execution track)
- Status: `IN_PROGRESS`
- Task ID: `PROD-SAFETY-001`
- Scope: consolidate the 30-item release checklist into one tracked task with sequential gates: (1) returns/payment/tenant authorization correctness, (2) financial reports and currency/timezone accuracy, (3) API input/rate-limit/CSV protections, (4) frontend workspace/payment/PWA regression checks, (5) CI/security/deployment verification.
- Current implementation slice: return-approval quantity/value ceiling and OWNER authorization, including aggregation of duplicate source-line rows before validation.
- Acceptance: regression tests pass locally or in GitHub Actions; PostgreSQL/backend and frontend checks are green where relevant; related existing PRs are reconciled rather than duplicated; production checks use non-mutating smoke tests only.
- Merge gate: do not merge financial/security changes while required tests are unexecuted or failing. If Actions runner allocation is unavailable, record BLOCKED with run evidence and continue independent validation.
- Next action: execute return-focused backend tests, then continue the next highest-priority confirmed defect in this same task.

## Active work checkpoint
- Current rules change: branch `docs/autonomous-execution-rules`.
- This ledger is intentionally a verification queue, not proof that the listed work is still outstanding. Reconcile before implementation.
- Next exact action after this documentation PR: inspect latest CI and open PRs, then work the highest-priority confirmed issue through tests and evidence.
