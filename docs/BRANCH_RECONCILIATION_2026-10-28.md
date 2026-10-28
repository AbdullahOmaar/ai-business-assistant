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
