# Branch reconciliation snapshot — 2026-10-28

**Base main SHA:** `d9f942bf9959fe4829d975c1685c232a95890dc3`  
**Scope:** all 10 remote branches without a matching PR head, compared against the stated base SHA. This is a branch-level audit only; it does **not** claim that all 109 closed-unmerged PRs have been semantically audited.

## Inventory

At the base snapshot before this PR was opened: 225 branches (224 non-main), 219 PR records (109 merged, 109 closed-unmerged, one open PR #256). Ten non-main branches had no matching PR head. No remote branch was deleted and no stale branch was bulk-merged.

| Branch | Comparison to base main | Unique patch / source evidence | Disposition |
|---|---:|---|---|
| `build/frontend-lockfile-npm-ci-20261028-v2` | 0 ahead / 3 behind | No unique files or commits. The frontend lockfile and `npm ci` change already merged through PR #258. | Obsolete duplicate; leave branch untouched. |
| `feat/first-ten-business-foundation` | 0 ahead / 381 behind | No unique patch relative to base main. | Obsolete; no changes to restore. |
| `fix/accounting/line-rounding-reconciliation` | 0 ahead / 341 behind | No unique patch relative to base main. | Obsolete; no changes to restore. |
| `fix/backup-restore-target-safety-current-main-20261028` | 0 ahead / 66 behind | No unique patch relative to base main. This is not evidence that a production backup/restore drill has run. | Obsolete branch; OPS-001 restore drill remains blocked pending an approved non-production target. |
| `fix/deterministic-frontend-install` | 0 ahead / 168 behind | No unique patch relative to base main; lockfile/clean-install work is already in merged PR #258. | Superseded; no changes to restore. |
| `fix/invoice-stock-return-safety` | 7 ahead / 379 behind | Repeated-SKU invoice stock demand is aggregated in `backend/app/services.py::issue_invoice` and covered by `backend/tests/test_services.py::test_invoice_issue_aggregates_repeated_product_lines_before_stock_check`. Sales-return approval locks the return, source invoice and invoice lines in `backend/app/extended_api.py::approve_sales_return`; current tests cover cumulative approved returns and concurrent PostgreSQL approvals. | Behavior is present/superseded on main; do not merge this stale branch wholesale. |
| `learning/toto-practice` | 2 ahead / 366 behind | Two useful unit regressions were missing on main: positive/negative half-up cent rounding for `money()`, and the empty result of `summarize_money_by_currency([])`. | Restore only these two tests in this reconciliation PR; do not merge the branch history. |
| `security/owner-staff-permission-matrix` | 3 ahead / 350 behind | Current main contains OWNER-only service checks for invoice issue/void and payment posting, owner-only sales-return approval, and the STAFF denied-route regression covering pricing, product price, stock tracking, schedules, notifications, settings, imports/exports and deletions. | Behavior/tests are present or superseded by later security merges, including PR #251; do not merge this stale branch wholesale. |
| `verify/api-release-dec7` | 1 ahead / 337 behind | Only unique file is `backend/README.md`; its old “local starter” documentation is superseded by current README text describing the actual FastAPI application and release gates. No runtime patch. | Obsolete documentation; do not restore stale README. |
| `verify/merged-main-dec7` | 0 ahead / 337 behind | No unique files or commits. | Obsolete; no changes to restore. |

## Restored regression coverage in this PR

- `test_money_rounds_half_up_to_two_decimal_places`: verifies both `1.005 -> 1.01` and `-1.005 -> -1.01`.
- `test_report_totals_are_empty_when_no_amounts_are_provided`: verifies the currency summary returns an empty mapping for no inputs.
- These are test-only changes; no financial calculation or authorization policy was modified.

## Remaining audit work

- **Not complete:** semantically review all 109 closed-unmerged PRs, paginate every PR/branch inventory, trace terminal successor merges, and verify any proposed restoration with tests. The ten orphan branches above have been dispositioned, but this does not substitute for the closed-PR audit.
- **Not complete:** route × role × tenant authorization coverage under issue #244 remains broader than the merged STAFF denial test.
- **Not run:** authenticated production workflows, visual/mobile accessibility review, and an isolated PostgreSQL restore drill.
- Exact-head CircleCI is the acceptance gate for the test additions in this PR. Do not mark these tests verified until the latest PR head and aggregate pass.
