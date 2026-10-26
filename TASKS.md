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


## 2026-10-26 — Receivables aging feature (branch: feat/receivables-aging-report)
- Status: `BLOCKED` for release verification; implementation remains unverified until checks pass.
- Added tenant-scoped `GET /api/v1/businesses/{business_id}/reports/receivables-aging?as_of=YYYY-MM-DD`.
- The report returns issued-invoice balances, aging buckets, days overdue, missing due dates, settled/overallocated classifications, and currency-separated summaries. It does not combine currencies or mutate accounting records.
- Test coverage has been strengthened to include EGP and USD invoices within the same business, exclusion of another business's USD invoice, not-due / 1–30 / 31–60 / over-90 / missing-due-date / settled / overallocated buckets, amount totals, and a negative authorization test expecting HTTP 403 for a non-member.
- Financial correctness guard added in `backend/app/extended_api.py` commit `cc59664a2b6aa6f6cd66279ac3db6529abc00073`: allocations are joined to the same-business payment and invoice and only matching-currency allocations reduce the receivable; mismatched currency allocations are disclosed separately per invoice and do not change the balance. Commit `6921dd5ac6f2587e4e228194083efc0b4d9b77ed` ensures an overallocated invoice reports zero receivable plus a separate positive `overallocated_amount`, rather than presenting a negative receivable.
- Regression tests include the EGP invoice / USD allocation case and over-allocation output: commits `e4f9bb171766e6c950b342a9934575ef18e93f79`, `7c3395083c8ac35f41bc9ec4f75efe82631cf99c`, `811167fe4803287dd41aa60c6f2d87171d97b3c8`, and `b1fe7dac36b1128d06ffeec98cd1e8d40719a266`. Source review caught and corrected four currency-summary assertions that had omitted the `EGP` key; all EGP summary assertions now use `payload["by_currency"]["EGP"]`. Expected behavior is source-reviewed only; tests have **not** been executed.
- Latest workflow runs on the relevant source/test candidate still fail before executable steps are exposed: [backend/frontend run 40376131927](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40376131927), [backend tests 40376131849](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40376131849), [container 40376131912](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40376131912), [dependency scan 40376131978](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/40376131978). Jobs show `steps=null` / no logs. These are failed workflow states, not evidence that test commands ran and failed.
- Verification: source and test edits were committed through the GitHub Contents API. The current runner issue is recorded in the canonical release ledger: [TASKS.md on production-safety branch](https://github.com/AbdullahOmaar/ai-business-assistant/blob/task/production-safety-consolidated/TASKS.md). The latest runner retries fail before any executable step/log becomes available; local execution is also unavailable because the connected development device is offline and this environment cannot resolve `github.com`.
- Release gate: keep [PR #162](https://github.com/AbdullahOmaar/ai-business-assistant/pull/162) Draft and unmerged. Run backend/PostgreSQL tests and the relevant authorization/currency regressions on the exact final head SHA before considering it verified.
