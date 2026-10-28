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


## Closed-unmerged PR audit — priority batch 1 (9 of 109 reviewed)

This batch follows the supersession chains for the nine PRs called out first in issue #249. The nine PRs below are closed and unmerged; none is merged directly. The terminal successors and source/test evidence were checked on current main. The remaining **100 of 109** closed-unmerged PRs still require semantic review.

| Closed-unmerged PR (head SHA) | Supersession chain / terminal merge | Current-main behavior and test evidence | Disposition |
|---|---|---|---|
| #230 `4995aa5d3f98561c33a0f7b206fc0fc990e85083` | #230 → #234, merged as `0346fa32de69ad83b2d58dcbd9caadbd6580bb60`; #234 head `ef3ec2c6e27824c3156d338fa68e9c57734351ab` had all four CircleCI contexts PASS. | `scripts/backup-restore-drill.sh`, `scripts/backup-restore-drill.test.sh`, and `docs/BACKUP_RESTORE_DRILL.md` are present on main. The script tests the isolated target-catalog guard; an actual restore drill into an approved non-production database has **NOT RUN**. | Superseded by #234; no code restoration. OPS-001 remains blocked on a safe restore target. |
| #232 `5324862f80c407ff6720a07ef8a28752a89d05de` | #232 → #233, merged as `6fde1b7191314a8225285f44154fa8963c89ae65`; #233 head `4a448d9aa78b0d2a3fdada6f09d4af92afddc56c` had all four CircleCI contexts PASS. | `backend/app/services.py::void_invoice` and `backend/tests/test_operations.py::test_invoice_void_rejects_invoice_with_approved_sales_return` cover the financial integrity guard. | Superseded by #233; do not merge stale branch. |
| #227 `733913ed0cb6772077511ed336df6d0c51fc93ba` | Release evidence consolidated into #226, merged as `6773389e030416c2ef91b6db04fd9bc24cb08399`; #226 head `0e2467c5449170d74731e887d251d282cedcbbb5` had all four CircleCI contexts PASS. | Current `frontend/src/app/release-guide.spec.ts`, `frontend/src/app/build-info.ts`, `frontend/public/sw.js`, and `backend/app/main.py` hold version/build/readiness evidence. #227's unique changes were task/security-review checkpoint documentation, not runtime behavior. | Superseded documentation; current evidence is already reconciled into later TASKS/release records. |
| #222 `4a387ce01121715217b348d1b4deab9a4aadf285` | #222 → #226, merged as `6773389e030416c2ef91b6db04fd9bc24cb08399`; #226 head passed all four CircleCI contexts. | The same current release-guide/version/readiness tests cover the intended version-alignment and startup-readiness behavior. The old TASKS checkpoint references stale main SHAs and deployment state. | Superseded by #226; do not merge stale checkpoint. |
| #212 `76327e203debaab683090baa12b0e98d83a70409` | #212 → #225, merged as `e4117291ab64bbac395ba6c64c15bbf1914d27b4`; #225 head `84377e500d2464bcfc94394b30e9a8e3ad8a5fd3` had all four CircleCI contexts PASS. | `backend/app/services.py` checks OWNER authorization before opening-stock persistence; `backend/tests/test_business_tenant_boundaries.py::test_staff_cannot_seed_opening_stock_during_product_creation` is present on main. | Superseded by #225; no code restoration. |
| #170 `11b579d2639f1971d12d5bcf850d83735f7a1a5e` | #170 → #185, merged as `7472026c2e0b02dcdc9ea8db43574c0ff416a66b`. PR #185's historical exact-head CI was not confirmed by the status query; do not claim it passed based on that query. | Current main includes `backend/tests/test_services.py::test_invoice_issue_aggregates_repeated_product_lines_before_stock_check`, sales-return cumulative/concurrency regressions, and current release metadata. Current main CircleCI was 7/7 PASS at the last verified poll. | Superseded by #185; behavior/tests are present on main, so do not merge the stale branch wholesale. |
| #180 `5cc9143fb8c37b7e1e9afbe28bdf34f53da28582` | #180 → #182, merged as `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`; #182's merge SHA had both Vercel Web/API success contexts. | `frontend/src/app/app.component.ts` contains the responsive invoice/customer layout refinements. This establishes code presence, not a completed visual/mobile accessibility review. | Superseded by #182; no remerge. Visual QA remains NOT RUN. |
| #184 `ee6fed436fd5f0e48e40b23a58a8e602ce577349` | #184 → #170 → #185, terminal merge `7472026c2e0b02dcdc9ea8db43574c0ff416a66b`. #170 itself was not merged. | Release version alignment and the duplicate-line stock regression are present through #185/current main; #184 carries no separate required behavior after the terminal successor. | Superseded chain verified; do not merge the intermediate draft. |
| #179 `d6706a6144189387fde7ef3f5cbddfd145df2bb7` | #179 → #182, merged as `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`; #182's merge SHA had both Vercel Web/API success contexts. | Current `frontend/src/app/app.component.ts` contains the customer/invoice/activity layout refinements. Visual/mobile accessibility evidence is still **NOT RUN**. | Superseded by #182; no remerge. |

## Audit accounting

- Reviewed in this batch: **9/109** closed-unmerged PRs, each with a terminal successor/disposition above.
- Remaining: **100/109** closed-unmerged PRs still need the same source-to-test and successor-chain audit.
- No remote branches were deleted, no stale PR was reopened, and no unmerged branch was merged wholesale.
- CircleCI evidence above is stated per exact PR head where available. Vercel build-rate-limit failures are not treated as source-test failures. Operational restore and visual/mobile QA remain separate unverified release gates.

## Remaining audit work

- **Not complete:** semantically review all 109 closed-unmerged PRs, paginate every PR/branch inventory, trace terminal successor merges, and verify any proposed restoration with tests. The ten orphan branches above have been dispositioned, but this does not substitute for the closed-PR audit.
- **Not complete:** route × role × tenant authorization coverage under issue #244 remains broader than the merged STAFF denial test.
- **Not run:** authenticated production workflows, visual/mobile accessibility review, and an isolated PostgreSQL restore drill.
- Exact-head CircleCI is the acceptance gate for the test additions in this PR. Do not mark these tests verified until the latest PR head and aggregate pass.
