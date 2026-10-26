# Project Task Ledger

> Updated 2026-10-26 from GitHub evidence. This ledger records status, not assumptions; a task is VERIFIED only with implementation evidence and passing checks on the exact commit.

## Rules
- Keep one canonical execution track per task; reconcile existing PRs before opening duplicates.
- Use statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `VERIFIED`.
- Do not mark code complete from a diff alone. Record exact test/build/CI evidence.
- Never merge accounting, payment, authorization, or tenant-isolation changes without applicable passing tests.
- Use only free resources; no production data mutations or secrets in source/logs.

## PROD-SAFETY-001 — consolidated production safety workstream
- Status: `IN_PROGRESS`; release verification: `BLOCKED`.
- Canonical accounting PR: [#161](https://github.com/AbdullahOmaar/ai-business-assistant/pull/161), branch `task/production-safety-consolidated`. The accounting implementation commit is `d77a8a1d1a59dce6c12aacc2909f29089ee18c36`; the branch now also includes the evidence-ledger update. Query PR metadata for the current head before evaluating CI.
- Implemented but unverified slice: aggregate duplicate return rows by invoice line; enforce return quantity/value ceilings; apply OWNER checks to purchase-order receiving and sales-return approval; add regression tests.
- Canonical UI/payment safety PR: [#157](https://github.com/AbdullahOmaar/ai-business-assistant/pull/157), head `29e442167a0de3bfbde0c20f41d5ba2c4d9c580c`. Covers workspace report request invalidation and payment retry/idempotency UI handling.
- Duplicate UI-only PR [#156](https://github.com/AbdullahOmaar/ai-business-assistant/pull/156) was closed as superseded by #157 on 2026-10-26; no changes were merged.
- Related still-open Drafts to reconcile into this release track without duplicate patches: [#160 recurring timezone/settings-key validation](https://github.com/AbdullahOmaar/ai-business-assistant/pull/160), [#158 settings PUT CORS preflight](https://github.com/AbdullahOmaar/ai-business-assistant/pull/158), [#154 business-timezone financial date filters](https://github.com/AbdullahOmaar/ai-business-assistant/pull/154).
- Additional scope still outstanding: financial reports and return treatment; currency-safe allocations; recurring invoices and background execution; API rate limits/input/CSV; frontend/PWA; dependency security; non-mutating production smoke tests.
- CI evidence for accounting implementation head `d77a8a1d1a59dce6c12aacc2909f29089ee18c36`: runs 40315086371 (dependency scan), 40315086568 (backend/frontend), 40315086381 (backend tests), 40315086316 (backend container) all concluded failure. After the ledger update, a new dependency scan run 40359718845 was observed queued on the new PR head; its final outcome and all other checks are still pending. Combined status query returned no successful status checks. The available run response does not establish that tests actually executed; earlier jobs had zero visible steps/missing logs.
- CI evidence for UI/payment PR #157 head `29e442167a0de3bfbde0c20f41d5ba2c4d9c580c`: run 40310365818 (dependency scan) and 40310366022 (backend/frontend) concluded failure; combined status returned no successful checks.
- CI evidence for timezone/settings PR #160 head `f36d5c988736176c921246b1e5c15f99bca15391`: runs 40310866240 (dependency scan), 40310866274 (backend container), 40310866426 (backend/frontend), 40310865953 (backend tests) concluded failure; combined status returned no successful checks.
- Environment blocker: local `git ls-remote` cannot resolve github.com, preventing checkout and local test execution. Treat as infrastructure limitation, not proof of a code defect or passing tests.
- Merge/deploy gate: keep all related PRs Draft and unmerged until a runner executes backend/PostgreSQL, frontend/build, and security checks successfully on the exact heads. After reconciliation, verify latest main SHA and production build/version before release.

- Review finding (2026-10-26): corrected `test_sales_return_approval_rejects_cumulative_amount_above_original_line` in commit `0331184cd039973ba6f10fb4c4d77c0b536335b0`. A 16.00 gross invoice discounted by 25% has a 12.00 net ceiling; returning half the quantity is capped at 6.00, so the original fixture amount 10.00 would be rejected before testing the intended cumulative-return case. This was a source-level arithmetic review, not a test execution result.
- Corrected-head validation: after the fixture correction, the commit-status and PR-triggered workflow query returned no status checks/workflow runs. The latest observable failures above are from the prior head; do not infer the corrected head passed.

## Other release checks
### Production configuration and authenticated smoke tests
- Status: `TODO`.
- Verify Firebase configuration without exposing values, PostgreSQL connectivity, exact CORS origins, frontend runtime config, sign-in, workspace isolation, invoice/payment/return flows, health/readiness, and deployed commit/version.
- Use read-only/non-mutating checks; no production migrations or destructive actions.

### Mobile/PWA behavior
- Status: `TODO`.
- Verify installed PWA sign-in/navigation/update/cache version, viewport/keyboard behavior on a supported browser/device. If device access is unavailable, document the exact unverified scenarios and continue independent work.

### Recurring invoice and notification execution
- Status: `TODO`.
- Establish whether a reliable worker/scheduler exists; if absent, propose and test a zero-cost-compatible implementation and document actual platform limits. Never assume recurring jobs are running.
