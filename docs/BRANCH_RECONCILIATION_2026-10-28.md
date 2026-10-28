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



## Complete remote branch inventory — paginated snapshot (2026-10-28)

- Snapshot captured from the live refs immediately before this inventory refresh commit. The reconciliation branch itself will advance as the report is updated; all other rows reflect the live branch refs at capture time.
- Branch pagination: page 1 = 100, page 2 = 100, page 3 = 33, page 4 = 0; total **233 remote branches**.
- PR pagination: page 1 = 100, page 2 = 100, page 3 = 26, page 4 = 0; total **226 PR records** (114 merged, 109 closed-unmerged, 3 open).
- The table records every branch's full current SHA and all matching same-repository PR numbers/states; `head differs` means the branch has advanced or the PR head is stale relative to that ref.
- **Branches with no associated PR:** 12. **Branches with at least one associated PR whose head SHA differs:** 12. No branch deletion was performed; no-PR branches are recorded for owner review rather than removed.
- This is a point-in-time inventory, not authorization to delete branches or a claim that every no-PR branch is safe to remove.

| Remote branch | Exact branch SHA | Associated PR(s) in paginated inventory |
|---|---|---|
| `architecture-decision-v0` | `61a68c57481387b54ac0dd304e2095771e56561a` | #13 MERGED (head match) |
| `audit/legacy-customer-linkage-sql` | `6228da73b010b865ced9a5f71287cd9ecd67e0ea` | #90 MERGED (head match) |
| `audit/production-readiness-2026-10-26` | `554513c64a7f852a7f394d6c1f8f70d581ab812a` | #142 MERGED (head match) |
| `automation-testing-e2e` | `d125d567d1474ada5601b95c98df22f4d4621e56` | #183 MERGED (head match) |
| `build/frontend-lockfile-npm-ci-20261028` | `0b82e17883f2a272a719f074425af6500748ad91` | #258 MERGED (head match) |
| `build/frontend-lockfile-npm-ci-20261028-v2` | `8facda01faa66dcad758be8d31c85fc1df114182` | NO PR found |
| `build/reproducible-frontend-install-20261028` | `827a0e3d621726d5ef464cc344d4ad1cb0fae1d2` | #251 MERGED (head differs) |
| `build/reproducible-frontend-install-main-20261028` | `6b06760fd912951bf4a406f6ceef7b577f3fbec3` | #257 CLOSED-UNMERGED (head match) |
| `chore/add-python-dependency-security-scan` | `2391ec15c482e92c7edd2c8e80f882ab23e5b5af` | #70 CLOSED-UNMERGED (head match) |
| `chore/backend-container-ci` | `ffe75d86022ac9ad4146913a6d9960f2c265cb00` | #26 MERGED (head match) |
| `chore/release-1.3.3-20261028` | `1dcbb23c54f6c868df9006d53dd0d6a34e7d99cf` | #247 MERGED (head match) |
| `chore/release-v1.2.1-2026-10-27` | `ee6fed436fd5f0e48e40b23a58a8e602ce577349` | #184 CLOSED-UNMERGED (head match) |
| `ci/backup-restore-safety-checks-20261028` | `4ec5ef1c13ec6212fb17cee1bfba458627d15e1b` | #228 MERGED (head match) |
| `ci/free-local-assistant-fallback-validation` | `8d0b68de7b5054fb6a32f61114ca95b6d78d910d` | #77 MERGED (head match) |
| `ci/vercel-frontend-test-gate-2026-10-27` | `4e15f687d6a305af50c467492a0a9fed85f0f663` | #165 CLOSED-UNMERGED (head match) |
| `deploy/firebase-hosting` | `23b74604848b61863287aa423f5c7e9483c6bcc0` | #27 CLOSED-UNMERGED (head match) |
| `deploy/vercel-fastapi` | `5871f5de06fd658441a4cd6ccc5f046804fab36b` | #28 MERGED (head match) |
| `design/double-entry-ledger-adr` | `7c7caec8607612382f0978d5a9ddf86598c4684c` | #93 MERGED (head match) |
| `diagnostic/github-runner-allocation-2026-10-27` | `5e5c40864de79060770bf087e933b89ce6a324ea` | #164 CLOSED-UNMERGED (head match) |
| `docs/accounting-ledger-review-followups` | `53181402fd4ab061a8c0cdfc387892f577eb74d6` | #139 MERGED (head match) |
| `docs/adr-fastapi-postgres-v0` | `35dd9741683dd3cdbb699d757867f9ee51da1d90` | #9 CLOSED-UNMERGED (head match) |
| `docs/architecture-decision-matrix` | `84c6360c7aa9f511af75727d293dc36f1ee26c56` | #8 CLOSED-UNMERGED (head match) |
| `docs/architecture-proposal-v0` | `245c16e43b96a441da563ec9cb48deb51a47f48b` | #1 CLOSED-UNMERGED (head match) |
| `docs/audit-master-plan-2026-10-28` | `fe1ada3d0ffdcdf18aa1aecff97991c98d56c9a1` | #212 CLOSED-UNMERGED (head differs); #232 CLOSED-UNMERGED (head differs); #236 MERGED (head match) |
| `docs/autonomous-execution-rules` | `eb0ed6ac55d7a2a812d3b459721ff805b78d800b` | #152 MERGED (head match) |
| `docs/backup-restore-drill` | `8bde8c1253880ab6eeed2b3df172ea3b844ac2d6` | #135 MERGED (head match) |
| `docs/branch-consolidation-ledger-2026-10-28` | `a719348d7874f2a7ebd54574c4959de0c80b4de8` | #239 MERGED (head match) |
| `docs/branch-consolidation-status-2026-10-28` | `03e23630f134f4845719a6fabb01f5a63adcdd5c` | #218 MERGED (head match) |
| `docs/branch-consolidation-update-2026-10-28` | `4a387ce01121715217b348d1b4deab9a4aadf285` | #222 CLOSED-UNMERGED (head match) |
| `docs/current-main-reconciliation-20261028` | `251e51e48a2e88ccd2f4974bd643a2ad8c20fea7` | #255 MERGED (head match) |
| `docs/final-consolidation-checkpoint-20261028` | `9d89ae302df98b738172bbe0da4aee29d85cb834` | #235 MERGED (head match) |
| `docs/learning-first-workflow` | `32039dfddb864aa6f2a30f84f1fdf4717eaf3fbc` | #11 MERGED (head match) |
| `docs/mandatory-project-governance` | `17521abeb3c1ec88f034efc0f41334b24c7331dd` | #5 CLOSED-UNMERGED (head match) |
| `docs/month-one-team-learning-plan` | `a08c646ca0631cb6f5faea39535f63eb1f2092f5` | #12 MERGED (head match) |
| `docs/neon-backup-restore-readiness` | `4d464891a85405a59cf7c124600332b8458eab4d` | #107 MERGED (head match) |
| `docs/one-branch-workflow-policy` | `990abf9cc421969e20a12a0df0b8f5a749bc14a1` | #237 MERGED (head match) |
| `docs/post-merge-verification-20261028` | `733913ed0cb6772077511ed336df6d0c51fc93ba` | #227 CLOSED-UNMERGED (head match) |
| `docs/production-release-runbook` | `24a72da2d753a11798095eaeee648833d441bfb2` | #45 MERGED (head match) |
| `docs/production-status-and-live-links` | `d4ca6887a07092893aa72b4a2c4f5a819b78d1d0` | #52 MERGED (head match) |
| `docs/receivables-invoice-mobile-release-gates` | `257273c0f160e9e75c9e62efeff25f1c328ac0aa` | #100 MERGED (head match) |
| `docs/refresh-release-evidence-20261028` | `7746df571d6cfd94f9158dc9c11a1599f08ed973` | #253 MERGED (head differs) |
| `docs/release-deployment-blocker-checkpoint-20261028` | `02d217cebbd5ad8d4c9cb154870f790de8bbeae2` | #229 MERGED (head match) |
| `docs/release-ledger-verified-2026-10-27` | `76f0448fc5fd151aa8fb7c11c58ac19c60c60461` | #167 MERGED (head match) |
| `docs/release-v1.2.1-post-merge-checkpoint-2026-10-27` | `54f5a392839a53d5164397cfd06e3c160aab4226` | #186 MERGED (head match) |
| `docs/release-web-payment-safety-verified-2026-10-27` | `e80eaa112ac8a433d37e5180656759c2ca19286d` | #169 MERGED (head match) |
| `docs/security-route-inventory` | `80617fb4fdc23edec0bf02f8ef8e4f922f6dc2c8` | #54 CLOSED-UNMERGED (head match) |
| `docs/task-ledger-refresh-20261028` | `1a2d7f659cc622e37e8fb9f818e59a8094e7bdec` | #259 MERGED (head differs) |
| `docs/ui-ux-merge-verification-2026-10-28` | `99d46a67bd8ae070ac229a210cd840805749c754` | #248 MERGED (head match) |
| `docs/vibe-coding-agent-operating-rules` | `ede7fd5228040117be034de13e87e1cffd53abef` | #171 MERGED (head match) |
| `docs/workflow-branch-and-deploy-rules-2026-10-27` | `47610becdbb4c6b00caa8d2d84b580abf1424b02` | #188 MERGED (head match) |
| `feat/admin-membership-mainline-20261028` | `6110f78d5e9592aa39fadffdba8c3d922f449b0d` | #207 MERGED (head match) |
| `feat/all-feature-domain-foundation` | `bde364b03c52d4f5b0f3c764cc2e4bd9180e9733` | #17 CLOSED-UNMERGED (head match) |
| `feat/angular-dashboard-shell` | `f85a459b3920dac07686abab708efeb76b5f1e75` | #20 CLOSED-UNMERGED (head match) |
| `feat/angular-dashboard-shell-current` | `ecc857804f02def9132abec0bc41b1de98195f39` | #21 CLOSED-UNMERGED (head match) |
| `feat/angular-dashboard-shell-latest` | `6ea6a82818cfb5380f49b61b2347e8f1e0ce4a01` | #22 CLOSED-UNMERGED (head match) |
| `feat/angular-dashboard-shell-reviewed-base` | `400b0e6816a987eccf5531bd6c8ce062eb1d40c9` | #23 CLOSED-UNMERGED (head match) |
| `feat/api-workflows-and-angular-shell` | `cf4aaa268af714c4a987314020146a218a3fb8af` | #18 CLOSED-UNMERGED (head match) |
| `feat/arabic-rtl-accessibility-ready` | `1ede7bba917d2aa6a249ce81048696d6fc70ef4a` | #46 CLOSED-UNMERGED (head match) |
| `feat/arabic-rtl-app-loading` | `67b207f844a925a6b1b7ca598cc277d13d642bd3` | #38 CLOSED-UNMERGED (head differs) |
| `feat/assistant-resilience-usage-limits` | `6cba650f628324c924b52d640b0166648181391c` | #40 CLOSED-UNMERGED (head differs) |
| `feat/assistant-resilience-usage-limits-verified` | `6cba650f628324c924b52d640b0166648181391c` | #43 CLOSED-UNMERGED (head match) |
| `feat/audit-event-feed` | `b114c88d97a0fdd2584a16c563a9baa35e3ee014` | #71 CLOSED-UNMERGED (head match) |
| `feat/audit-log-mobile-ui` | `f3918d28300f0b0d03dd2d5852237cc30bc55039` | #120 CLOSED-UNMERGED (head match) |
| `feat/audit-log-mobile-ui-v2` | `210dba28cdd06bbc40da3b3ed730a9f5ac40bfe6` | #119 CLOSED-UNMERGED (head match) |
| `feat/audit-log-read-api` | `1169d77a7d5127f88144b6655950f38d0bea3921` | #113 CLOSED-UNMERGED (head match) |
| `feat/audit-log-v0.2` | `82c2c818fd6963c2f6599bba4b8ad5829a516677` | #125 MERGED (head match) |
| `feat/audit-ui-mainline` | `3a530360bd44aa95e4f3aab4e8522c171b77ea24` | #127 CLOSED-UNMERGED (head match) |
| `feat/business-ops-roadmap-and-payment-export` | `093d4ce3f00c617fc39b9a9726f1ff5fd12f0fd4` | #57 CLOSED-UNMERGED (head match) |
| `feat/customer-search-contact-fields` | `44ccab074f56378c155c8116fc9e888f325434dc` | #198 CLOSED-UNMERGED (head match) |
| `feat/customer-search-contact-fields-current-main` | `eb2426d58e233593d4883811b9408cbf3a9e5b10` | #200 MERGED (head match) |
| `feat/customer-search-email-phone` | `180c96a5cadfd94b9b0b067cb1e03f3e709372bc` | #72 CLOSED-UNMERGED (head match) |
| `feat/customer-statement-api` | `7778a2863ed55336ba03bba05773c398513341c3` | #114 CLOSED-UNMERGED (head match) |
| `feat/customer-statement-mainline` | `3e7acd2bb95d804075579b94ae78a95fb2ef7418` | #130 CLOSED-UNMERGED (head match) |
| `feat/customer-statement-mobile-ui` | `f1b449255a0b552a87edf27a4b6b78b482476d00` | #121 CLOSED-UNMERGED (head match) |
| `feat/customer-statement-timeline` | `0f04e911d9131e2d684212af41ea0d2fbed7fae9` | #74 CLOSED-UNMERGED (head match) |
| `feat/data-integrity-owner-ui` | `cb085589b934c51e914db64f9aefe9d9def3a709` | #199 CLOSED-UNMERGED (head match) |
| `feat/data-integrity-owner-ui-clean-main` | `3e086d685b77f269e8d44baf95633e28f1ac6d81` | #203 MERGED (head match) |
| `feat/data-integrity-owner-ui-current-main` | `f132894cd67486afd04db6926350d1b8c4516eed` | #201 CLOSED-UNMERGED (head match) |
| `feat/data-integrity-ui` | `50693e95706a20a7b96e6da5a4568e93c8288c1a` | #128 CLOSED-UNMERGED (head match) |
| `feat/expense-management-ui` | `b7dc82d438daeabe0825a507b660e9ddd48e3b0c` | #35 MERGED (head match) |
| `feat/first-secure-workflows` | `d52fe2563a65fccdd6a93a659cceb4bd9e4c37ca` | #19 CLOSED-UNMERGED (head match) |
| `feat/first-ten-business-foundation` | `f76cf7c63881805f79bbbdbfd3fd29aeb44c6362` | NO PR found |
| `feat/first-ten-features` | `d4d7ad4fe0a2b4e21385f63d00af251f4a2d83c0` | #15 CLOSED-UNMERGED (head match) |
| `feat/free-local-assistant-fallback` | `8d0b68de7b5054fb6a32f61114ca95b6d78d910d` | #76 CLOSED-UNMERGED (head match) |
| `feat/integrated-production-auth-chat` | `d9cfe82d39c58e0edf2bbd0faca9967a68b5eff8` | #24 MERGED (head match) |
| `feat/interactive-demo-next-10-features` | `cb911734ae1ce838e073ec9c6e9247ff05875634` | #59 MERGED (head match) |
| `feat/invoice-print-preview` | `032347cc852e8b80e0b639d947446c8266b23d7e` | #115 MERGED (head match) |
| `feat/legacy-linkage-audit` | `1a894a0b14cbd257bfabaaf30841aeeeaa7d82f0` | #116 CLOSED-UNMERGED (head match) |
| `feat/local-fastapi-starter` | `cf3627b3e48f74cd3032f944d0bf80d64d2ae555` | #10 MERGED (head match) |
| `feat/mobile-bottom-nav-ux` | `a66a267cfba0eadcb4308fc31dbeab92dd8ab570` | #36 CLOSED-UNMERGED (head match) |
| `feat/mobile-customers-invoices-audit-ui` | `29ad79128cd97b7a4899d86bade84c50f0ecd54c` | #178 CLOSED-UNMERGED (head match) |
| `feat/mobile-first-ux-polish` | `9cf1513446c228fb77b6555f1ab3f82445d5e5a0` | #37 MERGED (head match) |
| `feat/mobile-invoice-drafts-v0.2` | `7b4c9aeee47516aa95c59d70a351af5026e94993` | #129 CLOSED-UNMERGED (head match) |
| `feat/mobile-nav-accounting-integrity` | `86bfa2510cc7f5be0a3862bb6399495de7189bfe` | #89 MERGED (head match) |
| `feat/mobile-nav-color-contrast` | `e140e0eed18a1e9237052470633cce74a138d7bf` | #33 MERGED (head match) |
| `feat/operations-modules-v0.2` | `537935b9c1ebd3dc0141fb1a6790f53db41a063e` | #132 CLOSED-UNMERGED (head match) |
| `feat/operations-readiness-api-clean-main` | `799ae0b4ffe113eaac453255776710449ad59002` | #204 MERGED (head match) |
| `feat/operations-readiness-api-current-main` | `846db60528b41fbca68d72ea068315f240a06bd9` | #205 CLOSED-UNMERGED (head match) |
| `feat/payment-recording-workflow` | `902a24ee9ae3b96f5fa7a7f8e0216ace0f193b3b` | #34 MERGED (head match) |
| `feat/permanent-engineering-agent-foundation` | `6df082c0a1acc5cc33d99cbe50a726d9d5112005` | #150 CLOSED-UNMERGED (head match) |
| `feat/platform-admin-membership-concurrency-20261028` | `50205526047275e922d11f77bf1c631da049ee11` | #238 MERGED (head match) |
| `feat/platform-admin-screen` | `ee91a24cc38089c91fd329e511e1e3aa40e79274` | #172 MERGED (head match) |
| `feat/platform-admin-user-directory-and-roles` | `217e380ab1d1a3bf02ea8121d3d0743e2c2fe67c` | #190 MERGED (head differs); #193 MERGED (head differs); #194 CLOSED-UNMERGED (head differs); #202 MERGED (head match) |
| `feat/production-readiness-v0.3` | `01c7c4db4555c4144e2e4e9409618b044267ff32` | #134 CLOSED-UNMERGED (head match) |
| `feat/receivables-aging-report` | `cb76a9f17d97ea1751703d21b400a18a766a3596` | #162 CLOSED-UNMERGED (head match) |
| `feat/second-ten-features` | `0b6062033aeca2055b1ff4b03faa2dd798837e9f` | #16 CLOSED-UNMERGED (head match) |
| `feat/tax-summary-current-main` | `a7066831cbca162b240ea6ad71bea4c664e505a6` | #197 MERGED (head match) |
| `feat/tax-summary-report` | `2d59bbd2c44c4b59aca17945f09ff0ab0e6a3540` | #133 CLOSED-UNMERGED (head match) |
| `feat/ui-version-invoices-profit-report` | `f30a69ed2b5ef1fc45a48124563e832b0f477dd0` | #75 MERGED (head match) |
| `feat/workspace-membership-management` | `cf7e0962832e3f0b3a9764a3cbf4b7e6063144ab` | #73 CLOSED-UNMERGED (head match) |
| `feat/workspace-search-export` | `2ecb8d4a58a79b142f250ea040fb51f8bd3a3013` | #56 CLOSED-UNMERGED (head match) |
| `feature/csv-import-preview-mainline` | `ad777fd38e4e54fe8235af716e4d743d8231e8df` | #102 MERGED (head match) |
| `feature/invoice-payment-assistant-release-fixes` | `1c0151d30788bc3c85e4ef6661a3c924cf8c5098` | #140 CLOSED-UNMERGED (head match) |
| `feature/mobile-invoice-draft-editor` | `68243f7a78d8a3fe0cb086be2b2d81c8137355f2` | #108 CLOSED-UNMERGED (head match) |
| `feature/mobile-invoice-draft-editor-rebased` | `104c3a28fb90703e0755e919dc5caec50cc3f69b` | #138 MERGED (head match) |
| `feature/mobile-multi-line-invoice-editor` | `2af650873f9a7a685aef958a119ed6f51ebd8edb` | #98 CLOSED-UNMERGED (head match) |
| `feature/receivables-aging-api-client` | `0b2a3e49a12f1208e970e003e315b0d16c5de809` | #96 MERGED (head match) |
| `feature/receivables-aging-mobile-ui` | `bd5e3cf57a80d131b7d38ea46a8e1dd9c86af232` | #97 MERGED (head match) |
| `feature/receivables-aging-report` | `c859fd0e74ecf2fed1b0df5c8e755a861342a4ab` | #92 MERGED (head match) |
| `feature/safe-product-csv-import-api` | `2963c33dc4eacc97510af65c0ba9c375f94db378` | #101 CLOSED-UNMERGED (head match) |
| `fix/accounting-rounding-half-up` | `d36b62a07f1c3d38da2b7e057876b0f033b829e9` | #112 CLOSED-UNMERGED (head match) |
| `fix/accounting/line-rounding-reconciliation` | `6365a731da0a4b416d8292174834f02987131152` | NO PR found |
| `fix/actions-minute-budget` | `f2fb9a1c29178eb9926f9b3be7eeb6f5133af676` | #173 CLOSED-UNMERGED (head match) |
| `fix/admin-firebase-directory-failure-tests` | `dc01004342304b184e7185a0eaa5a30d5a1eaf24` | #196 MERGED (head match) |
| `fix/api-schedule-timezone-setting-keys-2026-10-26` | `ae3e14c6fe06a833da55031edc9e8f0b8e8aa344` | #149 CLOSED-UNMERGED (head match) |
| `fix/api-schedule-timezone-setting-keys-rebased` | `09aaa3983ec3db53f74b0cf0b5a3e55142671676` | #159 CLOSED-UNMERGED (head match) |
| `fix/api-validate-schedule-timezones-setting-keys-rebased` | `f36d5c988736176c921246b1e5c15f99bca15391` | #160 CLOSED-UNMERGED (head match) |
| `fix/assistant-ui-buildstamp-mainline` | `4f0dc03a36d50197bf0dbf68992be3aaa957981a` | #141 MERGED (head match) |
| `fix/auth-network-and-language-switch` | `1f673bab0262b8ddb5aa2b8cb90a5f4f7506091f` | #47 CLOSED-UNMERGED (head match) |
| `fix/backup-restore-target-safety-20261028` | `4995aa5d3f98561c33a0f7b206fc0fc990e85083` | #230 CLOSED-UNMERGED (head match) |
| `fix/backup-restore-target-safety-current-main-20261028` | `d1cd99f82148d409452bbf1cf45333f9f5db4772` | NO PR found |
| `fix/backup-restore-target-safety-main-20261028` | `ef3ec2c6e27824c3156d338fa68e9c57734351ab` | #234 MERGED (head match) |
| `fix/business-timezone-reporting` | `ffb39e47fe5b4ca163f08cd62653a08dc356ec5e` | #143 CLOSED-UNMERGED (head match) |
| `fix/business-timezone-reporting-rebased` | `6592ba7f43196081f18c5b00d4dab12693e73efd` | #154 CLOSED-UNMERGED (head match) |
| `fix/ci-filters-reconciled-main` | `f423b8f633368b3082d029071a0409e7c0bd96f6` | #153 MERGED (head match) |
| `fix/ci-path-filters-zero-budget` | `9115cbb07e19722126782fb1de863e58a1c8161b` | #151 CLOSED-UNMERGED (head match) |
| `fix/ci-run-frontend-unit-tests-2026-10-26` | `37dec6d80161517d7a242dae17cdf298371577e2` | #145 MERGED (head match) |
| `fix/ci-runner-diagnosis-2026-10-27` | `6cfe6ca53a341b0fe249d7703da027217cd6dd11` | #163 CLOSED-UNMERGED (head match) |
| `fix/cors-put-settings-2026-10-26` | `4e26153973cf8b0ed26377049120e7e19871b04f` | #148 CLOSED-UNMERGED (head match) |
| `fix/cors-put-settings-rebased` | `668ff64001725e6a37af98a3232083d75dc5b228` | #158 CLOSED-UNMERGED (head match) |
| `fix/customer-statement-mobile-overflow` | `75af510d79beabb24adcf8d5b259a7fcdc9d4771` | #174 CLOSED-UNMERGED (head match) |
| `fix/deterministic-frontend-install` | `bb6ca65035b7afff3e087c2f9ab0797bfdf0b93e` | NO PR found |
| `fix/discount-return-cent-allocation` | `aa7925c9c8f55877ff06ec893d9da8c523d41942` | #124 MERGED (head match) |
| `fix/finance-block-void-after-approved-return-20261028` | `4a448d9aa78b0d2a3fdada6f09d4af92afddc56c` | #233 MERGED (head match) |
| `fix/frontend-white-screen-runtime-config` | `f4506cc811cd687a484c883464d5de9cb9452b97` | #32 MERGED (head match) |
| `fix/inventory-and-admin-mobile-nav-v1.2.1` | `ec7697463ccb332251206bd05d254e21c485bcc0` | #187 CLOSED-UNMERGED (head match) |
| `fix/invoice-payment-and-stock-quantity-2026-10-27` | `3a623bb174033c119223bdc0adabc59922eba86a` | #189 CLOSED-UNMERGED (head match) |
| `fix/invoice-stock-return-safety` | `c5c77b7b2f0113cd45548873d3b3018634289ad7` | NO PR found |
| `fix/main-synced-mobile-ui` | `cfa2d3d8eb97f0cb7f747222c4e5a64fdcf795cb` | #182 MERGED (head match) |
| `fix/mobile-no-topbar-release` | `3549d9c4b9c7076e56cc2caeab6652f2b9fc482e` | #49 CLOSED-UNMERGED (head differs) |
| `fix/mobile-pwa-navigation-clean` | `28d49fdc08447603d00ab3312ca4da7c740fba5a` | #48 CLOSED-UNMERGED (head differs) |
| `fix/mobile-release-clean` | `a9859b15998eba02236ea777214e5ff289dc261c` | #55 MERGED (head match) |
| `fix/mobile-ui-on-latest-main` | `5cc9143fb8c37b7e1e9afbe28bdf34f53da28582` | #180 CLOSED-UNMERGED (head match) |
| `fix/mobile-ui-rebased-on-main` | `9660b91db7754f68862ef2371c9918e49ff7be19` | #181 CLOSED-UNMERGED (head match) |
| `fix/mobile-version-badge-v0.2.0` | `9a4ba70ad7d3855e1ce9cf9f4c34adf7a53f6563` | #122 MERGED (head match) |
| `fix/mobile-version-strip` | `8a0e246f6dea8ca5bbccee9792e4a52f6e537a82` | #123 CLOSED-UNMERGED (head match) |
| `fix/mobile-version-strip-mainline` | `67ec6563661918caf0466c1872a5f01f66da283a` | #126 MERGED (head match) |
| `fix/mobile-version-visibility` | `19141f7e4f54fa4b8f862243f4aa207e39e6871a` | #117 CLOSED-UNMERGED (head match) |
| `fix/opening-stock-owner-guard-main-20261028` | `84377e500d2464bcfc94394b30e9a8e3ad8a5fd3` | #225 MERGED (head match) |
| `fix/owner-only-invoice-issue-void-2026-10-27` | `21cbbbe173285edeb1a2a2c2663a0e94132fd6ee` | #166 MERGED (head match) |
| `fix/payment-errors-visible` | `0c843a25ba42cbfcfe37949b67b839d09762bebe` | #177 MERGED (head match) |
| `fix/payment-ui-safety-main-2026-10-27` | `6edeb62fe37a0e072e248fd976cf0d73aa285971` | #168 MERGED (head match) |
| `fix/release-v1.2.1-rebased-main-2026-10-27` | `2abf42ba0544c73db6800edab68690c13693db2f` | #185 MERGED (head match) |
| `fix/return-discount-allocation` | `2cfaa359bb9980e7d90d753d4606f1039e3d4e6a` | #131 MERGED (head match) |
| `fix/sales-return-amount-guard-2026-10-26` | `f17d3068d0812ff75f4487c7f62982b27eb0b931` | #144 CLOSED-UNMERGED (head match) |
| `fix/sales-return-amount-guard-rebased` | `a754ac36b0f2e130fd8b0ebabd8ae60f071be00e` | #155 CLOSED-UNMERGED (head match) |
| `fix/sales-return-overapproval` | `d3cbf217f6db400ea4c55ddc690da00248ef269f` | #104 CLOSED-UNMERGED (head match) |
| `fix/security-audit-cors-invoice-guards` | `b088b9857050f230286d93bff4cbb28351db1ea9` | #25 CLOSED-UNMERGED (head match) |
| `fix/security-role-guard-gaps-110` | `73f0c670a26f5c5270b4e39f4a0361e562409324` | #137 MERGED (head match) |
| `fix/ui-payment-refresh-idempotency-2026-10-26` | `cda4391a35fb5fe9b27bcd7aa0a22aee971eb40a` | #147 CLOSED-UNMERGED (head match) |
| `fix/ui-report-workspace-races-2026-10-26` | `48c04130c2a02cc76c6e309155ac7de5248dcd16` | #146 CLOSED-UNMERGED (head match) |
| `fix/ui-report-workspace-races-rebased` | `71b2c55096a306664c14b1308c472b2c812542a0` | #156 CLOSED-UNMERGED (head match) |
| `fix/ui-ux-review-batch-2026-10-28` | `55cb69422295c3480932993267f84e0212ffc1b7` | #243 MERGED (head match) |
| `fix/ui-workspace-and-payment-safety-rebased` | `29e442167a0de3bfbde0c20f41d5ba2c4d9c580c` | #157 CLOSED-UNMERGED (head match) |
| `fix/vercel-fastapi-autodetect` | `d3b4e59060425f3ce9924bcaa556b2d3a3aa06c5` | #31 MERGED (head match) |
| `fix/vercel-fastapi-path-routing` | `e9f47ec189c8fe5b511841bd86839133ef3203c9` | #30 MERGED (head match) |
| `fix/vercel-python-project-metadata` | `ed394fd9aad1fa4079893236a422f12f4dc33068` | #29 MERGED (head match) |
| `fix/vercel-release-metadata-test-root-20261028` | `a6f77a7004edea80684bdca17c6e7096043080f3` | #246 MERGED (head match) |
| `fix/workspace-header-card-layout` | `269457d84b289559e3a84fad559bb3a7a8a54989` | #265 OPEN (head match) |
| `fix/workspace-release-metadata-payment-ui` | `62735138480433da99038385380f4aedcf087302` | #175 MERGED (head match) |
| `fix/workspace-switch-data-isolation` | `29740b4aca0ddde18d478fdfd2833f76e049c004` | #58 CLOSED-UNMERGED (head match) |
| `integrate/financial-concurrency-main-20261027` | `8c87e5c59244b3dfaffd782c1f4310ebc5431bef` | #191 MERGED (head match) |
| `integrate/release-v1-3-main-20261027` | `4961abd991da1170e8b1f85cd0a5015caa803de4` | #192 MERGED (head match) |
| `learning/toto-practice` | `60b89172461625e20cb9afaa2714b6103d5f6cbc` | NO PR found |
| `main` | `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a` | NO PR found |
| `perf/lazy-load-platform-admin-20261028` | `5d849ae0e98351867c0cae52bbe88716383b7e0e` | #256 MERGED (head match) |
| `reconcile/branch-audit-missing-regressions-20261028` | `2b0861235640657190d56f42ba3f63bd89245cb8` | #260 MERGED (head match) |
| `reconcile/closed-unmerged-pr-batch1-20261028` | `c75cd9ddea467be446e11747894f68ded5551878` | #263 MERGED (head match) |
| `reconcile/closed-unmerged-pr-batch2-20261028` | `7792d8c7e475351a17ab8e44750a3346f014bc49` | #264 OPEN (head match) |
| `reconcile/verified-missing-regressions-20261028` | `bbeac544fb1ab5538cd990b117e706ee05ddf082` | #262 MERGED (head match) |
| `reintegrate/assistant-history-cap-main-20261028` | `07d100771c96c4dc3be6a73d0f964de262a41b23` | #219 MERGED (head match) |
| `reintegrate/assistant-provider-retry-only-20261028` | `106472631180097257f386ba93c80c517fb2ee81` | #217 MERGED (head match) |
| `reintegrate/assistant-resilience-current-main-20261028` | `cd21cb91810511dc9c5fccc7538ea38dae378b3a` | #216 CLOSED-UNMERGED (head match) |
| `reintegrate/assistant-resilience-main-20261028` | `a32f2874aacad8e89685eee984213d2518273483` | #211 CLOSED-UNMERGED (head match) |
| `reintegrate/dedupe-api-routes-main-20261028` | `59a5aeb52fdb63b1c31a5ade9734b08a13031311` | #221 MERGED (head match) |
| `reintegrate/e2e-mobile-startup-main-20261028` | `9e8846f7dbae3040ed44b1b8aa8c30d4d01d3144` | #208 MERGED (head match) |
| `reintegrate/initial-stock-owner-guard-main-20261028` | `a02ab8e595c8364bf30ccdeb5c2fc0e873de475d` | #220 MERGED (head match) |
| `reintegrate/mobile-ui-polish-main-20261028` | `8ce4eb3595313c245d20d58b494b3726429efef0` | #209 CLOSED-UNMERGED (head match) |
| `reintegrate/mobile-ui-polish-main-v2-20261028` | `c9f9f96b7fffd906409bb9f3fe15f85f473767eb` | #213 MERGED (head match) |
| `reintegrate/operations-ui-main-20261028` | `cb92198df622a88302a9b02e11aaac744aef7fe8` | #215 MERGED (head match) |
| `reintegrate/payment-csv-safe-export-main-20261028` | `e526eec8e2051d914c59f669515ca400bee291cf` | #210 MERGED (head match) |
| `reintegrate/workspace-search-export-main-20261028` | `9f549d74e3f3c36b9780d1449361423fe6a0d099` | #214 MERGED (head match) |
| `release/v0.2.0-accounting-and-version` | `46df4341c23cd16ba60354509b60a85e43f6b897` | #105 MERGED (head differs) |
| `release/v1.0.0-ui-version-badge` | `1fa160240262eafaa55a3ea27f40c9292f69c528` | #136 CLOSED-UNMERGED (head match) |
| `release/v1.3.1-version-bump` | `2bb94947b48eedfe0b16545d41aa2601e86a9c3c` | #206 MERGED (head match) |
| `release/v1.3.2-security-consolidation-20261028` | `0e2467c5449170d74731e887d251d282cedcbbb5` | #226 MERGED (head match) |
| `release/version-1.3.4-reconciliation-20261028` | `6543039aecb18dda3d730a173ddc6854f6f57c96` | #266 MERGED (head match) |
| `release/version-visibility-and-deploy-gates` | `8428b37228cdfeed794f10ae4a4c224d9e55ce44` | #103 CLOSED-UNMERGED (head match) |
| `security/foreign-tenant-sensitive-lifecycle-20261028` | `28d64c10aa067f83b86041eeb296eb76dcd764ec` | #261 OPEN (head match) |
| `security/owner-staff-permission-matrix` | `20384a644f3be44a92b63fcca984fd20d14023d3` | NO PR found |
| `security/platform-admin-audit-atomicity-followup` | `e5bb642e9c8f868ce40901adb3ea58252a615b9b` | #224 MERGED (head match) |
| `security/platform-admin-hardening-2026-10-28` | `6a18f2dccc5b25b8a8aca94890e417277b5b66ef` | #223 MERGED (head differs) |
| `task/production-safety-consolidated` | `9c87a23e828e939fdfc97491170d56ce4d3639a7` | #161 MERGED (head match) |
| `test/assistant-safety-guardrails` | `ae9aefe0367ce7c785b718f093a0ca16a13ebcc0` | #50 CLOSED-UNMERGED (head differs) |
| `test/e2e-mobile-startup-cycle-2026-10-27` | `063803a63f71316c3142d569921232a66bcf20cb` | #195 CLOSED-UNMERGED (head match) |
| `test/firebase-invalid-token-regressions` | `2e46133d1303a2d4ee8b71e5b063b6a80518b109` | #91 MERGED (head match) |
| `test/mvp-regression-guardrails` | `5bac1ea2b6fe80691a85541c2f01be9d5c1a5a7f` | #51 MERGED (head match) |
| `test/payment-api-owner-flow` | `b64a1fd5ceb48676047f42134210d8855d69707a` | #176 CLOSED-UNMERGED (head match) |
| `test/payment-integrity-regression` | `5f87850878f1a4c9cabaa661f1980fef0d23b6d9` | #41 CLOSED-UNMERGED (head match) |
| `test/payment-integrity-regression-fixed` | `5f87850878f1a4c9cabaa661f1980fef0d23b6d9` | #42 CLOSED-UNMERGED (head match) |
| `test/payment-owner-staff-regressions-main-sync-20261028` | `05175b308a74ef38caf10eaf8d4873a5abfca23b` | #254 MERGED (head match) |
| `test/receivables-aging-report` | `0908aeef94f030b3a82c4ccfccb1c37b27f70499` | #118 CLOSED-UNMERGED (head match) |
| `test/reconcile-payment-api-idempotency-20261028` | `5ac0b68ac2439e610dccfa60afc0211f520f4ab7` | #252 CLOSED-UNMERGED (head match) |
| `test/security-firebase-unconfigured-503-20261028` | `86b41ec35bb8e71d5f3e6677b9b150ee65111c7e` | #231 MERGED (head match) |
| `test/security-foreign-tenant-no-write-20261028` | `fc2cc42346cad2257cea8655ca955db87c5916c6` | NO PR found |
| `test/security-nonmember-supplier-no-write-2026-10-28` | `ca7658075304fbe15ddc2726a479e99a0933223f` | #250 MERGED (head match) |
| `test/stock-empty-movements` | `eb4f1b4c4eef8e5dcc488d2ab01b9bf36bdf43b7` | #39 CLOSED-UNMERGED (head match) |
| `test/tenant-resource-boundaries` | `ac4b02a4f82fd9e7ae0c428d8c9a93e2722a9f64` | #53 CLOSED-UNMERGED (head match) |
| `test/tenant-route-negative` | `07922d9bdfd5df4e3adf54e35b62196f311ffdba` | #44 CLOSED-UNMERGED (head match) |
| `tests/payment-integrity-regressions-rebased-2026-10-27` | `11b579d2639f1971d12d5bcf850d83735f7a1a5e` | #170 CLOSED-UNMERGED (head match) |
| `ui/mobile-customers-invoices-audit` | `d6706a6144189387fde7ef3f5cbddfd145df2bb7` | #179 CLOSED-UNMERGED (head match) |
| `verify/api-release-dec7` | `0223b75eb8d49ecf784dc887ad9a9afad2cb6a50` | NO PR found |
| `verify/merged-main-dec7` | `dec7f26bd2bb33a4c27af4e785abe982e8486676` | NO PR found |


## Closed-unmerged PR audit — priority batch 3 (9 additional PRs reviewed)

**Audit comparison target:** current main at `1aa803436c45aaf8c3a5c0bf1bbc2d9e386a713a`. These are dispositions based on each closed PR's recorded diff/body, merged successor PRs, and current-main source/test evidence where noted. They do not mean every historical test or every production workflow is verified.

| Closed-unmerged PR | Current-main / successor evidence | Disposition |
|---|---|---|
| #176 — OWNER payment API and idempotent replay test | PR #254 merged the replay and OWNER/STAFF regression on main; current task ledger records the test as restored and exact-head CircleCI 7/7 passed. | Superseded by #254; no stale branch merge. |
| #118 — receivables aging report regression | Canonical receivables-aging work was consolidated into PR #161, which is merged. Its body records partial-payment, cross-business, currency, missing-customer/due-date, settled/overallocated, bucket-total and non-member denial cases. | Superseded by #161; broader authenticated production workflows remain separate gates. |
| #58 — stale workspace data after workspace switch | Current main imports and uses `WorkspaceLoadGuard`; `workspace-load-guard.spec.ts` covers request generation, workspace mismatch, and invalidation after state clears. | Core regression is present; no restore from stale branch. Physical-device smoke remains separate. |
| #53 — tenant isolation across business resources | Later security work #251/#262 is merged, including STAFF denial/no-write/no-audit tests and OWNER service guards. Issue #244 remains open for broader route × role × tenant coverage, so this old test set is not proof of exhaustive coverage. | Partially superseded; retain issue #244 as the gap tracker, do not merge stale history. |
| #44 — foreign workspace read/mutation denial | The workspace denial case is subsumed by later tenant-boundary/security work; the current security ledger explicitly retains broader cross-tenant and role-matrix coverage as unfinished. | Superseded for the reviewed workspace case; no wholesale merge. |
| #104 — sales-return quantity over-approval | Consolidated safety PR #161 is merged and includes sales-return duplicate-line aggregation, discounted return ceilings, cumulative quantity/amount checks and owner-only approval/receiving checks. | Superseded by #161; no restore. |
| #144 — sales-return line amount ceiling | The clean rebased #155 was itself consolidated into #161; #161 is merged and carries discounted return ceilings and cumulative amount checks. | Superseded by #161; no restore. |
| #146 — stale reports across workspace switches | #146 → #156 → #157 consolidation chain; #157 was closed after the core guard behavior was verified on main. Current main uses `WorkspaceLoadGuard` and the spec tests invalidation. | Core guard is present; no stale branch merge. Payment retry safeguards require their own live-path validation. |
| #179 — mobile customers/invoices/activity UI | Superseded by #182, merged on current main; #182 reapplies mobile refinements, workspace header version metadata and invoice create/filter layout. | Superseded by #182; visual QA still needs separate evidence. |

## Audit accounting — after priority batch 3

- Additional closed-unmerged PRs reviewed in this batch: **9**.
- Total reviewed across priority batches 1–3: **27/109**.
- Remaining closed-unmerged PRs requiring semantic review: **82/109**.
- This count tracks semantic reviews, not PRs that must be merged. No branches were deleted and no closed PR was reopened.


## Closed-unmerged PR audit — priority batch 4 (9 additional PRs reviewed)

**Comparison target:** current main `6a72213ce6df51e1b8e2d829474dbc7c8b4d3b48`. Dispositions below are limited to the listed behavior and do not imply exhaustive product or production verification.

| Closed-unmerged PR | Current-main source/test evidence | Disposition |
|---|---|---|
| #194 — Platform Admin Firebase directory failure paths | Both regression test names and bodies are present in current `backend/tests/test_platform_admin_api.py`; the current file's later platform-role and audit-rollback tests also remain present. The old branch adds no missing test functions relative to main. | Already present on main; no restore. Authenticated production Firebase E2E remains NOT RUN. |
| #189 — v1.3.0 invoice payment, opening stock, and release guide | Current main includes invoice payment UI/API, stock aggregation regression `test_invoice_issue_aggregates_repeated_product_lines_before_stock_check`, bilingual release guide and release-guide consistency tests through v1.3.4. | Superseded by later product/release merges; no wholesale merge. Live authenticated payment/stock transactions remain a separate validation gate. |
| #187 — repeated-line inventory safety and four-slot mobile navigation | Current main contains the repeated-SKU stock regression and `mobile-navigation.spec.ts` asserting four slots with Platform Admin under More; package/API metadata is already at 1.3.4. | Superseded by later inventory/security/release merges; no restore. |
| #181 — mobile header, customer tables and invoice create/filter layout | The workspace header was corrected in merged #265; current `release-payment-ui.spec.ts` asserts version/build metadata in the workspace card, and the mobile UI work was reapplied via merged successors. | Superseded; visual QA at narrow device widths is still NOT RUN. |
| #178 — earlier mobile customers/invoices/activity UI | Current `release-payment-ui.spec.ts` includes the payment retry and workspace header regressions; current-main layout work includes the merged #182/#213 successors and #265 header fix. | Duplicate/superseded; no restore. |
| #174 — customer statement horizontal scrolling | Current `customer-statement-layout.spec.ts` has both wide-ledger scroll containment and long-reference wrapping regressions. | Present on main; real mobile-browser interaction remains NOT RUN. |
| #173 — CircleCI accounting/concurrency automation | Current `.circleci/config.yml` contains the CircleCI pipeline; exact current main SHA passed all six substantive contexts plus aggregate (7/7), including backend accounting and container checks. | Core CI migration is present and verified; do not merge stale workflow history. PostgreSQL live production workflows remain NOT RUN. |
| #165 — run frontend tests before build | Current CircleCI frontend unit-test and production-build contexts both pass on current main, and the Vercel web status is successful. The current release pipeline already gates frontend tests/build. | Superseded by current CI/release configuration; no restore. |
| #164 — GitHub-hosted runner diagnostic workflow | The diagnostic workflow is intentionally absent from current main; its PR documents only a pre-step hosted-runner allocation failure. CircleCI now supplies passing frontend/backend/build/audit gates. No product/runtime patch is lost by omitting this one-off diagnostic workflow. | No runtime change to restore; keep GitHub Actions infrastructure issue as an external diagnostic, not a reason to add duplicate CI. |

## Audit accounting — after priority batch 4

- Additional closed-unmerged PRs reviewed in this batch: **9**.
- Total reviewed across priority batches 1–4: **36/109**.
- Remaining closed-unmerged PRs requiring semantic review: **73/109**.
- Current main SHA at comparison: `6a72213ce6df51e1b8e2d829474dbc7c8b4d3b48`; CircleCI 7/7 and Vercel Web/API contexts succeeded on that SHA.
- No branch deleted, no stale PR reopened, and no stale feature branch merged wholesale.
