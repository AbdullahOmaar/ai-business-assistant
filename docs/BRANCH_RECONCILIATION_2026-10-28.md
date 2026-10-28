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


## Closed-unmerged PR audit — priority batch 2 (9 additional PRs reviewed)

**Audit base main SHA:** `b84966db294c87338385508b35e98f2b2287e13e`  
**Inventory captured through paginated GitHub REST results:** 230 branches (100 + 100 + 30); 222 closed PRs (100 + 100 + 22), comprising 113 merged and 109 closed-unmerged; one open PR (#261). Total PR records: 223. No branches were deleted or stale PRs reopened.

| Closed-unmerged PR (head SHA) | Successor chain / terminal merged PR | Current-main evidence | Disposition |
|---|---|---|---|
| #257 `6b06760fd912951bf4a406f6ceef7b577f3fbec3` — reproducible frontend installs | Superseded by #258, merged at `91592ede7322ad6b2450d27b88e465c2ccec2630`. | `frontend/package-lock.json` exists on main; `.circleci/config.yml` has five `npm ci --no-audit --no-fund` installs and zero matching `npm install --no-audit --no-fund` installs. | Fully superseded; no restoration. |
| #252 `5ac0b68ac2439e610dccfa60afc0211f520f4ab7` — payment and OWNER/STAFF regressions | Split/superseded by #250 (non-member supplier denial) and #254 (payment replay and OWNER/STAFF service regression); both merged. | Main contains `test_nonmember_cannot_create_supplier_without_writes_or_audit_events`, `test_owner_can_record_and_idempotently_replay_payment_via_api`, and `test_staff_can_prepare_drafts_but_cannot_post_financials`. | All reviewed test behavior is present through terminal successors; no restoration. |
| #216 `cd21cb91810511dc9c5fccc7538ea38dae378b3a` — assistant resilience/history | Retry behavior merged through #217 at `8a1ebbfe334980b02795e238be05fad560bd4f28`; bounded history merged through #219 at `0b915a8de0fc173ee508b9b64145092e16b0accd`. | Main `backend/app/assistant_api.py` contains `_provider_post` retry handling and the accumulated-history limit; tests are present in `test_assistant_resilience.py` and `test_assistant_security.py`. | Superseded by both terminal successors; no restoration. |
| #211 `a32f2874aacad8e89685eee984213d2518273483` — assistant resilience/history | Same terminal successors #217 and #219. | Same source and regression-test evidence as #216; both retry and history-limit behavior are on main. | Duplicate/superseded; no restoration. |
| #209 `8ce4eb3595313c245d20d58b494b3726429efef0` — mobile audit/invoice layout | Superseded by #213, merged at `52ea765da234c1a7421febd232d40676cff42587`. | Current `frontend/src/app/app.component.ts` contains the `audit-table-wrap` layout refinement. Source presence does not prove visual/mobile accessibility acceptance. | Superseded; no restoration. Visual QA remains NOT RUN. |
| #205 `846db60528b41fbca68d72ea068315f240a06bd9` — operations read APIs | Superseded by #204, merged at `69c76b2623017036730c836173e936aad5a3ba3b`. | Current `extended_api.py` registers router-relative `/suppliers`, `/purchase-orders`, and `/recurring-invoices` routes (avoiding the stale branch's duplicated `/businesses/{business_id}` segment); workspace-scoping regression exists in `test_business_tenant_boundaries.py`. | Superseded by corrected terminal successor; no restoration. |
| #201 `f132894cd67486afd04db6926350d1b8c4516eed` — owner data-integrity UI | Superseded by #203, merged at `955e2314439a32a0266936da0d03947de61e8ec7`. | Main has the owner-gated integrity tab and API service contract, plus `frontend/src/app/data-integrity-ui.spec.ts` for read-only and workspace-switch clearing behavior. | Superseded; no restoration. |
| #199 `cb085589b934c51e914db6926350d1b8c4516eed` — owner data-integrity UI | Same terminal successor #203. | Same main UI/service/spec evidence as #201; no unique missing behavior was identified in the reviewed patch. | Duplicate/superseded; no restoration. |
| #198 `44ccab074f56378c155c8116fc9e888f325434dc` — customer search by contact fields | Superseded by #200, merged at `64ad1e53c3773c29adb2f4d62515ca6fa3ee4935`. | Main customer search uses SQLAlchemy `or_` across name, email and phone while retaining business/active scoping; `test_customer_search_matches_name_email_and_phone` is present. | Superseded; no restoration. |

## Audit accounting — after priority batch 2

- Additional closed-unmerged PRs semantically reviewed in this batch: **9**.
- Total reviewed with batch 1: **18/109**.
- Remaining closed-unmerged PRs requiring semantic review: **91/109**.
- Current branch inventory remains 230 branches; current PR inventory is 223 records (113 merged, 109 closed-unmerged, one open #261).
- This is a source/successor audit, not a fresh execution of every historical PR's test suite. Current main SHA `b84966db294c87338385508b35e98f2b2287e13e` passed six substantive CircleCI contexts plus the aggregate (7/7). The open foreign-ID security PR #261 remains blocked by its failing `backend-accounting` context; its logs are inaccessible through the connected integration. Vercel Web/API builds remain blocked by `build-rate-limit`.


## Closed-unmerged PR audit — batch 3 (9 additional PRs reviewed)

**Current main verification snapshot:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a` (2026-10-28). Release v1.3.4 is merged; Vercel Web and API deployments are both READY for this exact SHA, and the CircleCI aggregate `verify-all-changes/all-checks-passed` is successful. This release deployment was explicitly requested by the repository owner; it is separate from the reconciliation acceptance gate.

| Closed-unmerged PR (head SHA) | Successor / source evidence | Disposition |
|---|---|---|
| #195 `063803a63f71316c3142d569921232a66bcf20cb` — mobile startup viewport E2E | Superseded by #208, merged as `8772438405764734bda6f475e31bd50c22341c86`. Current `frontend/e2e/startup.spec.ts` covers the explicit setup screen, fail-closed missing-Firebase configuration, and narrow mobile viewport. Current main's CircleCI browser-smoke gate passes on `1aa8034`. | Superseded/present; no restoration. Authenticated Firebase E2E remains NOT RUN because test identity/secrets are not available. |
| #194 `a97fbb858ab817a6999cdf3b82114feabededf5c` — Firebase directory failure paths | Test behavior is present in `backend/tests/test_platform_admin_api.py::test_role_grant_returns_not_found_for_missing_firebase_account_without_persisting`; the typed Firebase lookup/least-privilege work landed via #202, merge `53ecc6bac5d4e45a5fab5375d4fe067822d9ffa1`. | Superseded/present; no restoration. Production Admin bootstrap and live Firebase failure injection remain NOT RUN. |
| #189 `3a623bb174033c119223bdc0adabc59922eba86a` — v1.3.0 invoice/stock/feature guide | Reapplied against current main by #192, merge `889d23304e8bcf79175567bbf01c925ee447aa06`. Current code contains invoice payment allocation, opening stock, bilingual release guide and regression coverage; later release metadata is now v1.3.4. | Superseded by #192 and later release commits; do not merge stale branch. |
| #187 `ec7697463ccb332251206bd05d254e21c485bcc0` — repeated-line inventory and mobile navigation | Inventory integrity landed via #185, merge `7472026c2e0b02dcdc9ea8db43574c0ff416a66b`; mobile refinements landed via #182, merge `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`. Current tests include repeated-SKU aggregation and current mobile navigation rules. | Superseded by #185/#182; no restoration. |
| #181 `9660b91db7754f68862ef2371c9918e49ff7be19` — mobile customers/invoices/activity layout | Current component refinements were reapplied by #182, merge `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`; current source has the workspace release metadata, invoice disclosure and mobile table wrapping. | Superseded/present; no restoration. Visual/accessibility review is still NOT RUN. |
| #176 `b64a1fd5ceb48676047f42134210d8855d69707a` — owner payment and idempotent replay regression | The API regression `test_owner_can_record_and_idempotently_replay_payment_via_api` is on main through #254, merge `91c86932c3344fff395058724f5d44ae4ee06dbd`; current service also retains the savepoint/unique-key race recovery. | Superseded/present; no restoration. |
| #173 `f2fb9a1c29178eb9926f9b3be7eeb6f5133af676` — CircleCI and financial concurrency gates | The PostgreSQL concurrency suite and payment idempotency recovery are present through #191, merge `4538cf4de7f44e1a4e031f770157a780830f9259` and subsequent mainline tests. Current `.circleci/config.yml` has backend-accounting, container, frontend test/build, dependency-audit, browser-smoke and aggregate gates. The branch's GitHub Actions concurrency-group additions are absent; they are not restored because CircleCI is the authoritative green gate and the Actions provider has documented pre-step runner-allocation failures. | Core behavior/CI superseded; defer provider-specific concurrency-only changes. No new CI system added. |
| #164 `5e5c40864de79060770bf087e933b89ce6a324ea` — GitHub hosted-runner diagnostic workflow | The diagnostic only reproduces the known pre-step `runner_id=0` allocation failure; it adds a new workflow rather than fixing application behavior. CircleCI is now the working required verification route and is green on current main. | Obsolete diagnostic; do not add another GitHub Actions workflow. Runner/account policy issue remains separate and unresolved. |
| #163 `6cfe6ca53a341b0fe249d7703da027217cd6dd11` — runner-diagnosis documentation | TASKS and the release/CI runbooks already record the provider failure and the successful CircleCI alternative. The branch carries only a historical checkpoint on an older main baseline. | Superseded documentation; do not merge stale TASKS snapshot. |

## Audit accounting — after batch 3

- Closed-unmerged PRs semantically reviewed in this report: **27/109** (9 priority PRs in batch 1, 9 in batch 2, 9 in batch 3).
- Remaining: **82/109** closed-unmerged PRs still require semantic review and a disposition.
- Fresh PR pagination: page 1 = 100, page 2 = 100, page 3 = 26, page 4 = 0; **226 PR records** = 114 merged, 109 closed-unmerged, 3 open.
- Fresh branch pagination: page 1 = 100, page 2 = 100, page 3 = 33, page 4 = 0; **233 remote branches** including main (232 non-main). No remote branches were deleted.
- Production release v1.3.4: Web `dpl_8tQwd46MEPxJxCdYKGsqWXKb7kZG` and API `dpl_5AtRUQ5EFmr1WNaP2EDvaRz5cziN` are READY on main SHA `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`; aliases point to those deployments. CircleCI aggregate passes on the same SHA.
- This is not a claim that all 109 PRs are reconciled. No branch was deleted, no stale PR was reopened, and no stale branch was merged wholesale.


## Closed-unmerged PR audit — batch 4 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #162 `cb76a9f17d97ea1751703d21b400a18a766a3596` — receivables aging report | API report is merged through #92 (merge `5ca0962dfaa3669c2afbf15a631a1cc78f82f2f8`), typed frontend client through #96 (merge `4dbc96cda1bd7abc82d972dc37466379a78a0fa6`). Current `backend/app/extended_api.py`, `backend/tests/test_api.py`, and `frontend/src/app/api.service.ts` contain the report/client and currency-safe regressions. | Superseded by #92/#96 and later fixes; no restoration. |
| #160 `f36d5c988736176c921246b1e5c15f99bca15391` — recurring schedule timezone and setting-key validation | Canonical safety consolidation #161 merged as `0e4627f51a627ee3eba8ab2b6076724ccc9f3c35`. Current `backend/app/extended_api.py` validates IANA timezones and normalizes/rejects unsafe setting keys; current API tests cover invalid timezone and secret-like setting keys. | Superseded by #161; no restoration. |
| #159 `09aaa3983ec3db53f74b0cf0b5a3e55142671676` — schedule timezone and setting-key validation | Same #161 terminal merge; same source/test evidence as #160. | Duplicate/superseded; no restoration. |
| #158 `668ff64001725e6a37af98a3232083d75dc5b228` — CORS preflight for settings PUT | #161 includes the CORS method policy; current `backend/app/main.py::CORS_ALLOWED_METHODS` includes PUT/PATCH/DELETE/OPTIONS and `backend/tests/test_main.py::test_cors_method_policy_includes_settings_put_route` asserts preflight behavior and exposed request ID. | Superseded/present; no restoration. |
| #157 `29e442167a0de3bfbde0c20f41d5ba2c4d9c580c` — workspace report invalidation and payment retries | Current `WorkspaceLoadGuard` invalidates pending report requests when workspace state is cleared, with `workspace-load-guard.spec.ts` coverage. Payment idempotency and retry safety are independently present in `backend/app/services.py`, `frontend/src/app/api.service.ts`, and #254's merged API regression. The old UI patch is not a safe wholesale replacement for current component changes. | Behavior is present across current-main commits; no stale component snapshot restored. |
| #156 `71b2c55096a306664c14b1308c472b2c812542a0` — stale reports crossing workspace switches | Current `WorkspaceLoadGuard.invalidate()` is called by `clearWorkspaceData()` for profit/loss and receivables-aging requests; tests assert cleared-state invalidation. | Superseded/present; no restoration. |
| #155 `a754ac36b0f2e130fd8b0ebabd8ae60f071be00e` — sales returns cannot exceed invoice-line value | Consolidated safety PR #161 merged as `0e4627f51a627ee3eba8ab2b6076724ccc9f3c35`. Current `backend/app/domain_rules.py` contains return amount/quantity validation and discounted return-line reconciliation; current API/operations tests cover cumulative returns and authorization. | Superseded by #161; no restoration. |
| #154 `6592ba7f43196081f18c5b00d4dab12693e73efd` — business-local financial date boundaries | #161 consolidated the timezone reporting behavior. Current `backend/app/core_features_api.py` resolves validated IANA zones and uses business-local date boundaries; `backend/tests/test_business_timezone_reporting.py` covers local date/DST behavior. | Superseded by #161; no restoration. |
| #151 `9115cbb07e19722126782fb1de863e58a1c8161b` — GitHub Actions path filters | Clean replacement #153 merged as `e1ccc669058786634bcc3eeb0ff411049d25b4c7`. Current release gating is handled by CircleCI; the remaining Actions provider has pre-step runner allocation failures, and the stale branch filters are not needed to validate current code. | Superseded by #153; no restoration. |
| #150 `6df082c0a1acc5cc33d99cbe50a726d9d5112005` — permanent engineering agent controller proposal | Branch adds a new GitHub Actions controller workflow, task-ledger scripts, and a proposed persistent agent runtime; the proposal explicitly says the controller is not deployed. Current `AGENTS.md` and `TASKS.md` contain the adopted execution/security/continuity rules, while the repository has no authorized continuously running controller deployment. | Unadopted architecture proposal; do not merge its new workflow/runtime without a separate approved design and operational threat/cost review. |

## Audit accounting — after batch 4

- Closed-unmerged PRs semantically reviewed in the report: **37/109**; **72/109 remain**.
- PR inventory remains 226 records (114 merged, 109 closed-unmerged, 3 open); branch inventory remains 233 refs (232 non-main), verified by complete pagination.
- No runtime code was changed or restored in this batch. Current main's CircleCI checks and v1.3.4 Web/API deployment evidence remain as recorded above.
- Remaining work: continue patch-level review of the other 72 closed-unmerged PRs; identify any unique intended behavior missing from current main and only then decide whether a focused restoration is warranted.


## Closed-unmerged PR audit — batch 5 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #149 `ae3e14c6fe06a833da55031edc9e8f0b8e8aa344` — schedule timezone and setting-key validation | The changes were consolidated in #161 (merge `0e4627f51a627ee3eba8ab2b6076724ccc9f3c35`). Current `extended_api.py` validates IANA timezone names and rejects normalized secret-like setting keys; API tests cover invalid timezone/setting inputs. | Superseded by #161; no restoration. |
| #148 `4e26153973cf8b0ed26377049120e7e19871b04f` — CORS settings PUT preflight | CORS policy and regression are present on main: `CORS_ALLOWED_METHODS` includes PUT and the test executes an OPTIONS preflight against the settings route. | Superseded by #161; no restoration. |
| #147 `cda4391a35fb5fe9b27bcd7aa0a22aee971eb40a` — prevent payment retries after refresh failure | Workspace/report invalidation and payment retry safety landed in #168 (merge `96cefa42b68a94ddc87b10563c3c26bd6784c394`); API idempotency replay regressions were further restored by #254 (merge `91c86932c3344fff395058724f5d44ae4ee06dbd`). | Superseded/present; no stale UI patch restored. |
| #146 `48c04130c2a02cc76c6e309155ac7de5248dcd16` — stale reports on workspace switch | Same terminal #168; current `WorkspaceLoadGuard` invalidates stale responses, with tests for clearing workspace state and pending requests. | Superseded/present; no restoration. |
| #144 `f17d3068d0812ff75f4487c7f62982b27eb0b931` — return value guard | Canonical #161 contains cumulative sales-return validation and discounted line reconciliation. Current domain/API/operations tests cover amount, quantity, and authorization invariants. | Superseded by #161; no restoration. |
| #143 `ffb39e47fe5b4ca163f08cd62653a08dc356ec5e` — business timezone reporting | Canonical #161 contains business-local reporting bounds; `test_business_timezone_reporting.py` covers local-day and DST boundaries, and the UI no longer sends a client-derived UTC period. | Superseded by #161; no restoration. |
| #140 `1c0151d30788bc3c85e4ef6661a3c924cf8c5098` — assistant suggestions/build timestamp | Reconciled by #141 (merge `dec7f26bd2bb33a4c27af4e785abe982e8486676`). Current UI includes assistant suggestions and generated build/deploy metadata; later version work now reports v1.3.4. | Superseded by #141; no restoration. |
| #136 `1fa160240262eafaa55a3ea27f40c9292f69c528` — UI v1.0.0 badge | The one-field version bump is obsolete: current package/API metadata and release history are aligned at v1.3.4, and production Web/API are deployed on the same SHA. | Obsolete release candidate; do not roll back or restore an old version. |
| #134 `01c7c4db4555c4144e2e4e9409618b044267ff32` — accounting/operations consolidation | The broad stale snapshot was split into current-main successors: #141 assistant/build timestamp, #192 invoice/stock/guide release, #197 tax summary, #203 data-integrity UI, and #215 operations UI. Current source includes audit events, customer statement, data integrity, invoice drafts, tax summary and supplier/purchasing/schedule/notification views with associated tests. | Superseded across terminal feature PRs; do not merge the stale component/API snapshot. |
| #133 `2d59bbd2c44c4b59aca17945f09ff0ab0e6a3540` — currency-separated tax summary | Reapplied as #197, merged `ee15df2780aecc8869cdc7c54e499686733de988`. Current API, frontend service/screen and regression tests contain currency-separated tax totals and date filtering. | Superseded by #197; no restoration. |

## Audit accounting — after batch 5

- Closed-unmerged PRs semantically reviewed in the report: **47/109**; **62/109 remain**.
- Inventory unchanged after complete pagination: 233 remote branches and 226 PR records (114 merged, 109 closed-unmerged, 3 open).
- No runtime code was changed or restored in this batch. No remote branch was deleted, no PR was reopened, and no stale branch was merged wholesale.


## Closed-unmerged PR audit — batch 6 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #178 `29ad79128cd97b7a4899d86bade84c50f0ecd54c` — mobile customers/invoices/activity layout | Reapplied by #182 (merge `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e`). Current component contains the mobile card/layout and audit navigation refinements. | Superseded duplicate; no restoration. |
| #174 `75af510d79beabb24adcf8d5b259a7fcdc9d4771` — customer statement mobile overflow | Current component includes a touch-scrollable statement table and long-reference wrapping; `frontend/src/app/customer-statement-layout.spec.ts` asserts both behaviors. The current component/layout was subsequently refined in later UI commits. | Behavior present; no restoration. Visual/accessibility review remains NOT RUN. |
| #165 `4e15f687d6a305af50c467492a0a9fed85f0f663` — run unit tests before Vercel build | Current `frontend/package.json` build command runs `npm test && ng build`; CircleCI separately gates frontend unit tests and production build on the exact SHA. | Superseded by current build/CI gates; no restoration. |
| #132 `537935b9c1ebd3dc0141fb1a6790f53db41a063e` — suppliers, purchasing, expenses, schedules and notifications | Supplier/purchase-order/schedule APIs landed in #204 (merge `69c76b2623017036730c836173e936aad5a3ba3b`) and UI reapplication in #215 (commit `64e44b01c39256a669a5fdb3002f4a7b9dafcc48`). Current API/UI and `test_supplier_purchase_order_and_recurring_schedule_lists_are_workspace_scoped` cover the intended operations. | Superseded by corrected API/UI successors; no restoration. |
| #130 `3e7acd2bb95d804075579b94ae78a95fb2ef7418` — currency-safe customer statement | Current `extended_api.py` has the workspace-scoped statement endpoint; tenant-boundary tests assert currency safety/pagination; current UI exposes the statement and `customer-statement-layout.spec.ts` covers narrow screens. | Present on current main; no duplicate endpoint or stale UI restore. |
| #129 `7b4c9aeee47516aa95c59d70a351af5026e94993` — mobile invoice draft editor | Reconciled into #192 (merge `889d23304e8bcf79175567bbf01c925ee447aa06`). Current component supports draft save/edit/issue, multi-line entry and decimal preview; server-side calculation remains authoritative. | Superseded by #192; no restoration. |
| #128 `50693e95706a20a7b96e6da5a4568e93c8288c1a` — owner data-integrity review | Reapplied by #203 (merge `955e2314439a32a0266936da0d03947de61e8ec7`). Current API is read-only and owner-authorized; `test_data_integrity_report_is_owner_only_read_only_detects_currency_and_customer_mismatches` and `data-integrity-ui.spec.ts` cover API/UI behavior. | Superseded by #203; no restoration. |
| #127 `3a530360bd44aa95e4f3aab4e8522c171b77ea24` — owner activity log API/UI | Current `extended_api.py` exposes workspace-scoped audit events; tenant tests cover owner-only pagination/workspace isolation; current UI provides the audit tab and filter vocabulary. | Present through subsequent current-main feature commits; no stale component snapshot restored. |
| #123 `8a0e246f6dea8ca5bbccee9792e4a52f6e537a82` — mobile UI/API version visibility | Current `app.component.ts` renders UI/API version metadata in the workspace card and has a mobile-only release metadata row; v1.3.4 build logs confirm generated UI version/cache metadata. | Superseded by later workspace-card UI and v1.3.4 release; no restoration. |
| #121 `f1b449255a0b552a87edf27a4b6b78b482476d00` — mobile customer statement | Current customer-statement endpoint, typed UI client/panel, pagination, currency separation and narrow-screen scroll tests are present. | Superseded/present; no restoration. |

## Audit accounting — after batch 6

- Closed-unmerged PRs semantically reviewed in the report: **57/109**; **52/109 remain**.
- Inventory remains 233 remote branches and 226 PR records (114 merged, 109 closed-unmerged, 3 open), with all pages checked.
- No runtime code was changed or restored in this batch; no remote branch was deleted or stale PR reopened.


## Closed-unmerged PR audit — batch 7 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #120 `f3918d28300f0b0d03dd2d5852237cc30bc55039` — mobile activity log UI | The owner-only audit-events API/UI and customer statement were integrated by #125 (merge `af4ba084cedcec7339498579ef5563ce7748bf7c`) and refined by later UI commits. Current UI has the audit tab; API tests cover owner-only pagination/workspace isolation. | Superseded/present; no restoration. |
| #119 `210dba28cdd06bbc40da3b3ed730a9f5ac40bfe6` — owner audit log UI | Same #125 terminal merge and later UI refinements; current component exposes read-only activity events and localized action/type filters. | Duplicate/superseded; no restoration. |
| #118 `0908aeef94f030b3a82c4ccfccb1c37b27f70499` — receivables-aging regression suite | Currency-safe aging implementation/tests are present through #92 (merge `5ca0962dfaa3669c2afbf15a631a1cc78f82f2f8`) and later accounting consolidation #161. Current tests cover currency separation, partial matching-currency allocation, aging and workspace authorization. | Superseded by canonical implementation and later tests; no restoration. |
| #117 `19141f7e4f54fa4b8f862243f4aa207e39e6871a` — mobile version visibility | Version visibility landed in release #105 (merge `0754a5c2887726f7c6b03f3fdba83f6b104e6272`) and was later refined into the workspace card/mobile row; current release metadata is v1.3.4. | Superseded; no restoration. |
| #116 `1a894a0b14cbd257bfabaaf30841aeeeaa7d82f0` — read-only accounting integrity report | Report/API/UI were reapplied via #203 (merge `955e2314439a32a0266936da0d03947de61e8ec7`). Current endpoint is owner-only/read-only, with tenant-boundary and UI clearing regressions. | Superseded by #203; no restoration. |
| #114 `7778a2863ed55336ba03bba05773c398513341c3` — currency-safe customer statement API | Integrated by #125 (merge `af4ba084cedcec7339498579ef5563ce7748bf7c`) and refined later. Current statement query is workspace-scoped, paginated, and separates balances by currency; tests cover tenant boundaries and layout. | Superseded/present; no duplicate endpoint. |
| #113 `1169d77a7d5127f88144b6655950f38d0bea3921` — owner audit events API | Integrated by #125 (merge `af4ba084cedcec7339498579ef5563ce7748bf7c`). Current `extended_api.py` exposes audit events; tests cover owner-only pagination/filtering and workspace isolation. | Superseded by #125; no restoration. Request-ID correlation remains a separate unimplemented capability, not something supplied by this stale PR. |
| #112 `d36b62a07f1c3d38da2b7e057876b0f033b829e9` — HALF_UP financial rounding | Current `backend/app/domain_rules.py::money` uses `ROUND_HALF_UP`; `test_money_rounds_half_up_to_two_decimal_places` and invoice line-rounding tests are present on main. No historical issued invoice rewrite is included. | Behavior/test coverage present; no restoration. |
| #108 `68243f7a78d8a3fe0cb086be2b2d81c8137355f2` — mobile multi-line invoice drafts | Draft editor and discount/tax preview were integrated in #192 (merge `889d23304e8bcf79175567bbf01c925ee447aa06`) and related mobile release work. Current server remains authoritative for final prices, stock and totals. | Superseded by #192; no restoration. |
| #104 `d3cbf217f6db400ea4c55ddc690da00248ef269f` — sales-return quantity guard | Consolidated release #105 (merge `0754a5c2887726f7c6b03f3fdba83f6b104e6272`) included the over-allocation fix; later #161 strengthened return amount/quantity validation and regression coverage. | Superseded by #105/#161; no restoration. |

## Audit accounting — after batch 7

- Closed-unmerged PRs semantically reviewed in the report: **67/109**; **42/109 remain**.
- Inventory remains 233 remote branches and 226 PR records (114 merged, 109 closed-unmerged, 3 open), with complete pagination.
- No runtime code was changed or restored in this batch; no branch was deleted or stale PR reopened.


## Closed-unmerged PR audit — batch 8 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #103 `8428b37228cdfeed794f10ae4a4c224d9e55ce44` — deployed UI/API versions and build gates | Consolidated release #105 merged as `0754a5c2887726f7c6b03f3fdba83f6b104e6272`; current generated build metadata, mobile version visibility, API version endpoint and v1.3.4 deployment parity supersede the old release branch. | Superseded by #105 and later release commits; no restoration. |
| #101 `2963c33dc4eacc97510af65c0ba9c375f94db378` — safe CSV import preview | Current API exposes `/imports/products.csv/preview`; the UI has a separate preview step before explicit import confirmation, and current source describes preview as read-only until confirmation. | Behavior present on main; no duplicate import endpoint restored. |
| #98 `2af650873f9a7a685aef958a119ed6f51ebd8edb` — multi-line mobile invoice drafts | Current draft editor, multi-line rows, discount/tax preview and server-side recalculation were integrated in #192 (merge `889d23304e8bcf79175567bbf01c925ee447aa06`). | Superseded by #192; no restoration. |
| #76 `8d0b68de7b5054fb6a32f61114ca95b6d78d910d` — local assistant fallback | Same head SHA as merged PR #77; current `assistant_api.py` contains a clearly labeled deterministic local fallback and tests cover authorized workspace scoping. | Duplicate head of merged #77; no restoration. |
| #74 `0f04e911d9131e2d684212af41ea0d2fbed7fae9` — customer statement timeline | Current currency-separated statement API/UI was integrated by #125 (merge `af4ba084cedcec7339498579ef5563ce7748bf7c`) and refined later. Tests cover pagination, tenant scope and mobile scroll/wrapping. | Superseded/present; no duplicate endpoint. |
| #73 `cf7e0962832e3f0b3a9764a3cbf4b7e6063144ab` — owner-managed workspace memberships | Reapplied by #207, commit `f26fb42917ec`. Current `core_features_api.py` implements owner-only membership role changes/removal, and `test_membership_management_api.py` plus PostgreSQL concurrency tests cover last-owner protections. | Superseded by #207 and subsequent authorization hardening; no restoration. |
| #72 `180c96a5cadfd94b9b0b067cb1e03f3e709372bc` — customer search by name/email/phone | Current customer query searches name, email and phone while retaining business/active filtering; regression `test_customer_search_matches_name_email_and_phone` is present. | Present through the merged customer-search successor; no restoration. |
| #71 `b114c88d97a0fdd2584a16c563a9baa35e3ee014` — owner audit event feed | Current audit API/UI was integrated by #125 (merge `af4ba084cedcec7339498579ef5563ce7748bf7c`); tenant tests assert owner-only access, pagination and workspace isolation. | Superseded by #125; no restoration. |
| #70 `2391ec15c482e92c7edd2c8e80f882ab23e5b5af` — scheduled dependency scans | Current `.circleci/config.yml` contains the scheduled dependency-audit workflow plus Python and frontend dependency audit jobs; current-main CircleCI dependency audit passes. | Present through CircleCI; no additional workflow needed. |
| #58 `29740b4aca0ddde18d478fdfd2833f76e049c004` — stale workspace data isolation | Current `clearWorkspaceData()` clears prior workspace records and invalidates pending report requests through `WorkspaceLoadGuard`; guard regression tests reject stale responses after workspace changes/clear. | Present in current main; no restoration. |

## Audit accounting — after batch 8

- Closed-unmerged PRs semantically reviewed in the report: **77/109**; **32/109 remain**.
- Inventory remains 233 remote branches and 226 PR records (114 merged, 109 closed-unmerged, 3 open), with complete pagination.
- No runtime code was changed or restored in this batch; no remote branch was deleted or stale PR reopened.


## Closed-unmerged PR audit — batch 9 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #57 `093d4ce3f00c617fc39b9a9726f1ff5fd12f0fd4` — payment CSV export and roadmap | Current owner-only payment panel already has `exportPaymentsCsv()`, exporting received date, amount, currency, method, reference and allocation count through shared `buildCsv` which neutralizes spreadsheet formulas. A focused test for the handler/fields/owner-only button was missing; this reconciliation branch adds `frontend/src/app/payment-csv-export.spec.ts`. The proposed roadmap document is not needed to ship the already-present feature. | Behavior present; restore only the missing focused regression test. No duplicate CSV serializer or roadmap snapshot. |
| #56 `2ecb8d4a58a79b142f250ea040fb51f8bd3a3013` — record search, invoice filters and CSV export | Current `record-filters.ts` and `app.component.ts` support customer/product/invoice filtering and export of filtered customer/product/invoice rows; `record-filters.spec.ts` and `csv-export.spec.ts` cover filtering/CSV safety. | Behavior present; no restoration. |
| #54 `80617fb4fdc23edec0bf02f8ef8e4f922f6dc2c8` — authenticated API route inventory | Current `docs/SECURITY_ROUTE_INVENTORY.md` records registered routes, authorization expectations and explicit remaining negative-test gaps. | Superseded by current security route inventory; no stale documentation restore. |
| #53 `ac4b02a4f82fd9e7ae0c428d8c9a93e2722a9f64` — tenant isolation tests | Current `backend/tests/test_business_tenant_boundaries.py` and `test_core_features_api.py` cover cross-business IDs, denied reads/mutations, no-write guarantees and scoped resources; additional sensitive lifecycle coverage is tracked separately in PR #261. | Core behavior/test coverage present and strengthened by later tests; no duplicate stale test file. Broader route × role matrix remains a separate gap. |
| #50 `cbcf5d1c9f902951685e697edd603fa31f78980a` — assistant safety regressions | Superseded by merged #51 (merge `5bac1ea2b6fe80691a85541c2f01be9d5c1a5a7f`); current `test_assistant_security.py` and `test_core_features_api.py` cover authorization, input limits and local fallback scoping. | Superseded by #51; no restoration. |
| #49 `c23c88c91578c01593a4e6ddfc87c5bad850c0f6` — Arabic-first mobile navigation/PWA | Mobile navigation and PWA release work landed through #55 (merge `510a2014bb469c46ff7d64934bafce905f8c3662`) and later UI refinements; current shell has RTL/LTR direction, bottom navigation, More menu, install help and service worker. | Superseded by #55 and later mainline; no restoration. Android/installed-PWA visual QA remains NOT RUN. |
| #48 `2dc2ee6e93c43d07936fa7eeccc417e8df9b1e76` — compact mobile navigation/PWA | Explicitly superseded by #49; terminal mobile release #55 is merged. | Duplicate/superseded; no restoration. |
| #47 `1f673bab0262b8ddb5aa2b8cb90a5f4f7506091f` — connectivity diagnostics and language switch | Supersession chain #47 → #48 → #49 → #55; current setup/error UI and language direction switching are present and startup E2E covers the setup screen and RTL/LTR viewport. | Superseded; no restoration. Authenticated live Firebase sign-in E2E remains NOT RUN. |
| #46 `1ede7bba917d2aa6a249ce81048696d6fc70ef4a` — Arabic RTL/accessibility polish | Current app uses Arabic-first UI, document lang/dir switching, visible keyboard focus and active navigation semantics; current startup/browser smoke tests cover setup and narrow RTL/LTR behavior. | Behavior present in later mainline; no stale UI snapshot. Full visual/accessibility QA remains NOT RUN. |
| #44 `07922d9bdfd5df4e3adf54e35b62196f311ffdba` — deny foreign workspace reads/mutations | Current tenant-boundary/API tests deny foreign workspace access and mutations, verify no unauthorized write side effects, and preserve owner records. PR #261 extends sensitive lifecycle foreign-ID coverage. | Basic regression present; no duplicate test restoration. Remaining resource/role matrix is tracked separately. |

## Audit accounting — after batch 9

- Closed-unmerged PRs semantically reviewed in the report: **87/109**; **22/109 remain**.
- Inventory remains 233 remote branches and 226 PR records (114 merged, 109 closed-unmerged, 3 open), with complete pagination.
- One test-only gap was restored: `frontend/src/app/payment-csv-export.spec.ts` covers the already-shipped payment CSV export contract. No production behavior or deployment configuration changed in this batch.


## Closed-unmerged PR audit — batch 10 (10 additional PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #43 `6cba650f628324c924b52d640b0166648181391c` — assistant resilience and route inventory | Bounded provider retry/timeout landed in #217 (merge `8a1ebbfe334980b02795e238be05fad560bd4f28`); history cap landed in #219 (merge `0b915a8de0fc`). Current `assistant_api.py` and `test_assistant_resilience.py` cover transient retries/timeouts, and the current security route inventory documents auth boundaries/gaps. | Superseded by #217/#219 and current docs; no restoration. |
| #42 `5f87850878f1a4c9cabaa661f1980fef0d23b6d9` — corrected payment integrity tests | Same head SHA as #41; current `test_services.py` covers currency mismatch, over-allocation, cross-business allocation, idempotency-key reuse and cumulative allocations, with later #192/#254 regression updates. | Duplicate head/test candidate; behavior and regression coverage are present. |
| #41 `5f87850878f1a4c9cabaa661f1980fef0d23b6d9` — payment integrity tests | Duplicate of #42 with identical head SHA. Current payment/domain service tests contain the corrected cases; no separate code patch is required. | Duplicate of #42; no restoration. |
| #40 `c136e4878707312fa6c7743270978b8d72258c98` — assistant request bounds and route inventory | Same resilience implementation was superseded by #217/#219; current history accumulation is capped, provider calls use bounded timeouts/retry, and resilience tests exist. | Superseded; no restoration. |
| #39 `eb4f1b4c4eef8e5dcc488d2ab01b9bf36bdf43b7` — empty stock movement test | Current `backend/tests/test_domain_rules.py::test_empty_stock_movements_produce_zero_balance` asserts an empty movement list yields zero balance. | Test already present; no restoration. |
| #38 `bc023f6c74a76a2c74c82b26e410cdefbd5b95df` — Arabic RTL shell/loading feedback | Current Angular app sets document language/direction, has a setup/configuration screen and retryable error/loading states; current startup/browser smoke covers the setup path. The old component snapshot predates API-connected workspace behavior. | Superseded by current Angular shell/mobile release; do not merge stale component. |
| #36 `a66a267cfba0eadcb4308fc31dbeab92dd8ab570` — mobile navigation/dashboard UX | Current labeled bottom navigation, workspace card and responsive layouts landed via #55 and subsequent mobile UI commits. | Superseded/present; no restoration. |
| #27 `23b74604848b61863287aa423f5c7e9483c6bcc0` — Firebase Hosting deployment | The project currently deploys the Web/API through Vercel; both production deployments are READY on current main SHA. A second Firebase Hosting deployment path would create competing release/alias behavior. | Obsolete deployment target; do not add Firebase Hosting workflow/config. |
| #25 `b088b9857050f230286d93bff4cbb28351db1ea9` — CORS, stock validation and sales-return lifecycle | CORS PUT preflight is covered in current `main.py/test_main.py`; repeated-line stock aggregation is in current `services.py`/tests; return amount/quantity guards are in #161 and current domain/API tests. The old branch also changes runtime deployment configuration and must not be merged wholesale. | Core fixes present via later mainline; do not copy stale runtime config. |
| #23 `400b0e6816a987eccf5531bd6c8ce062eb1d40c9` — responsive Angular shell | Current main is a real API-connected Angular workspace with auth, tenant-scoped data, responsive navigation and release metadata; the old PR's own README explicitly describes local-only sample data disconnected from the API. | Obsolete scaffold; do not merge a stale frontend shell. |

## Audit accounting — after batch 10

- Closed-unmerged PRs semantically reviewed in the report: **97/109**; **12/109 remain**.
- Inventory remains 233 remote branches and 226 PR records (114 merged, 109 closed-unmerged, 3 open), with complete pagination.
- No runtime behavior or deployment configuration was changed in this batch; no branch was deleted or stale PR reopened.


## Closed-unmerged PR audit — batch 11 (final 12 PRs reviewed)

**Source comparison SHA:** `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`.

| Closed-unmerged PR (head SHA) | Successor / current-main evidence | Disposition |
|---|---|---|
| #22 `6ea6a82818cfb5380f49b61b2347e8f1e0ce4a01` — responsive Angular shell | Explicitly superseded by #23. Current main is the later API-connected Angular workspace; the old shell is based on an obsolete frontend-only scaffold. | Duplicate/superseded; no restoration. |
| #21 `ecc857804f02def9132abec0bc41b1de98195f39` — responsive Angular shell | Superseded by #22 then #23; current main contains authenticated workspace navigation and real API-backed screens. | Duplicate/superseded; no restoration. |
| #20 `f85a459b3920dac07686abab708efeb76b5f1e75` — responsive Angular shell | Superseded by #21 → #22 → #23. Stale component snapshot would revert newer backend/catalog validation and mobile/PWA behavior. | Duplicate/superseded; no restoration. |
| #19 `d52fe2563a65fccdd6a93a659cceb4bd9e4c37ca` — tenant-scoped workflows and safe CSV tools | Current `backend/app/data_exchange.py` provides allowlist-based CSV parsing and formula-safe export; `extended_api.py` exposes preview/confirm import/export routes; UI supports product CSV preview before import. Current catalog/service/API code covers scoped search, audited deactivation, HALF_UP money and full payment idempotency replay validation; duplicate sales-return lines are rejected. | Core intended behavior is present through later APIs/services/tests. No stale `catalog.py`/CSV helper snapshot restored. Customer/expense bulk-import UI is not part of the currently shipped workflow; do not imply it is complete. |
| #18 `cf4aaa268af714c4a987314020146a218a3fb8af` — secure business workflow endpoints | Current `firebase_auth.py`, `security.py`, `main.py`, API routers, PostgreSQL models/migrations and tenant-boundary tests implement verified Firebase identity, fail-closed auth, scoped workspace access, CORS and readiness/health. The current app is far beyond the original stacked feature slice. | Superseded by the evolved mainline; no stale full-stack snapshot. |
| #17 `bde364b03c52d4f5b0f3c764cc2e4bd9180e9733` — domain foundations | Current models/migrations, pure domain rules and transaction-scoped services cover customers, suppliers, invoices, payments, expenses, purchasing, returns, recurring schedules, tax/discount rules, notifications and audit events. Tenant constraints and current regression suites supersede the old broad migration/model snapshot. | Superseded by later migrations/services and tests; no restoration. |
| #16 `0b6062033aeca2055b1ff4b03faa2dd798837e9f` — inventory schema | Current `StockMovement` model and inventory migration, stock balance derivation, repeated-SKU aggregation and owner-only opening-stock guard/tests are present. | Superseded/present; no duplicate migration. |
| #15 `d4d7ad4fe0a2b4e21385f63d00af251f4a2d83c0` — PostgreSQL and first-ten foundations | Current `DATABASE_URL` validation, SQLAlchemy/Alembic setup, initial business/membership schema, verified Firebase auth and API-backed Angular workflows are present. Later migration/test changes supersede the initial scaffold. | Superseded by current architecture and migrations; no restoration. |
| #9 `35dd9741683dd3cdbb699d757867f9ee51da1d90` — FastAPI/PostgreSQL V0 architecture proposal | The actual repository uses Angular + FastAPI + PostgreSQL; the current ADR/README reflect the adopted architecture and the backend is implemented. The PR's text remains a provisional proposal and is not needed as a duplicate architecture decision. | Superseded by current accepted architecture; no restoration. |
| #8 `84c6360c7aa9f511af75727d293dc36f1ee26c56` — architecture decision matrix | The matrix was a pre-decision document; current ADR and implementation settle the stack. Merging it as an active decision would reintroduce outdated alternatives and ambiguity. | Obsolete decision-stage documentation; do not merge. |
| #5 `17521abeb3c1ec88f034efc0f41334b24c7331dd` — project governance rules | Current `AGENTS.md`, `TASKS.md`, README and release/security runbooks already encode the adopted inspect-before-change, tests, authorization, no-destructive-actions and deployment-gate requirements. The old branch is a historical snapshot. | Superseded by current governance; no restoration. |
| #1 `245c16e43b96a441da563ec9cb48deb51a47f48b` — proposed Spring Boot architecture | Conflicts with the accepted Angular + Python/FastAPI + PostgreSQL architecture and the implemented backend. It is a proposal, not an approved migration plan. | Rejected/obsolete architectural alternative; do not merge. |

## Closed-unmerged PR audit — final accounting

- **109/109 closed-unmerged PRs have evidence-based dispositions recorded across batches 1–11.**
- Dispositions are patch/source/test based, not inferred from titles or closed status. No closed-unmerged PR was reopened, no stale branch was merged wholesale, and no branch was deleted.
- **This does not yet mean Issue #249 is VERIFIED COMPLETE:** the full remote-branch inventory with each branch SHA and associated PR still needs to be materialized in this report, and the final PR's exact-head CircleCI/security checks must pass before merge.
