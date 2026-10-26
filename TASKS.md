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

## Active work checkpoint
- Current rules change: branch `docs/autonomous-execution-rules`.
- This ledger is intentionally a verification queue, not proof that the listed work is still outstanding. Reconcile before implementation.
- Next exact action after this documentation PR: inspect latest CI and open PRs, then work the highest-priority confirmed issue through tests and evidence.


## CI-RUNNER-001 — diagnose GitHub Actions execution failure
- Status: BLOCKED.
- Evidence date: 2026-10-27; canonical safety PR: [#161](https://github.com/AbdullahOmaar/ai-business-assistant/pull/161), head `6c53f6e0c4250293fffab18a7f60250f3710dd9c`; current `main`: `1b58df8a6695e02b845bc84a9ee7094286f32e83`.
- Latest retried workflows:
  - Backend tests: [40403442316](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40403442316), job 121865727568.
  - Backend/frontend: [40403442159](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40403442159), jobs 121865717671 and 121865717965.
  - Container: [40403442226](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40403442226), job 121865707450.
  - Dependency audits: [40403442049](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40403442049), jobs 121865736966 and 121865737229.
- Raw GitHub job API confirms all six latest jobs had `runner_id=0`, empty `runner_name`, empty steps, and failure within approximately 3–4 seconds of job start. Attempt to download logs returned `BlobNotFound`. This is strong evidence the jobs were not assigned a runner and no test/build/audit command executed; not a code-level test failure and certainly not a pass.
- Workflow source review: `.github/workflows/ci.yml`, `backend-tests.yml`, `backend-container.yml`, and `dependency-security.yml` preserve the required backend/PostgreSQL, frontend tests/build, container, and dependency audit gates. No evidence the existing path filters explain the runner-less jobs.
- Three alternative CI-fix branches were inspected. They diverge from current main and should not be merged wholesale: `fix/ci-filters-reconciled-main` (ahead 2/behind 3), `fix/ci-path-filters-zero-budget` (ahead 5/behind 6), `fix/ci-run-frontend-unit-tests-2026-10-26` (ahead 2/behind 6). Their changes do not themselves establish a fix for runner allocation.
- Actions performed this session: re-ran the failed jobs once (GitHub accepted the retries, but results remained runner-less failures); created isolated diagnostic branch `fix/ci-runner-diagnosis-2026-10-27` from `main`. No code, workflow, or production settings were changed in this branch yet.
- Next action: repository owner/authorized admin must inspect GitHub Actions minutes/billing policy, repository/org Actions permissions, hosted runner availability/usage limits, and any repository/org policy restrictions, then restore a runner and rerun the same workflows. Do not enable paid spending or weaken required checks as a workaround.
- Release decision: #161 remains open/Draft and unmerged; no merge, new version, production deployment, or production data mutation was made. Status remains BLOCKED until all required workflows pass on the exact final PR head.


## CI-RUNNER-001 verification update (2026-10-27)
- Targeted alternate-runner test: PASS — 8 tests in `backend/tests/test_domain_rules.py` and `backend/tests/test_security.py` passed in an isolated Vercel Sandbox using source blobs read from current `main` at `1b58df8a6695e02b845bc84a9ee7094286f32e83`. Coverage includes Decimal/HALF_UP invoice totals and validation edges, payment allocation bounds, stock calculation, return quantity/amount caps, currency-separated totals, and authorization denial for cross-business access, role escalation, and inactive businesses.
- Scope limitation: this is a selected test subset from `main`, not PR #161's current candidate SHA. It does not validate the full backend suite, PostgreSQL migrations, frontend tests/build, container build, or dependency audits. A broader attempt was blocked by incomplete private-repository source material in the isolated environment and then the sandbox stopped (HTTP 410 `sandbox_stopped`); those checks are NOT marked passed.
- Overall release status remains BLOCKED pending GitHub-hosted runner allocation and passing full checks on the exact final PR head. No code, workflow gates, production settings or production data were changed.
