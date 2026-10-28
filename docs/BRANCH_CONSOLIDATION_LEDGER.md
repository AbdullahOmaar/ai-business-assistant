# Branch Consolidation Ledger

**Repository:** `AbdullahOmaar/ai-business-assistant`  
**Baseline:** `main` at `f04c0e194b3afbefb56a979a5688f80d277b3ece` (observed during audit; refresh before any merge).  
**Audit date:** 2026-10-28  
**Purpose:** Prevent repeated work on branches whose changes were integrated, and distinguish merged PRs from closed/unmerged PRs and branches without a PR record.

## Current inventory

- Git branches returned by GitHub before this ledger branch was created: **210 total including main; 209 non-main branches**.
- Pull requests returned by the GitHub PR listing integration: **203 records**.
- PRs marked merged: **95**.
- PRs currently open: **2**.
- PRs closed without merge: **106**.
- Branches with no matching PR head in the returned inventory: **11**. These are **not automatically unmerged**; inspect compare results and code before deciding.
- Squash/rebase merges can leave a source branch “ahead” of main even after the PR merged. **Use PR merged status as integration evidence; never infer unmerged work from ahead/behind counts alone.** A closed PR with merged=false also does not prove its work is absent from main; a replacement PR may have carried the change.

### Refreshed inventory after opening this ledger PR — 2026-10-28

The counts above are the baseline captured immediately before branch `docs/branch-consolidation-ledger-2026-10-28` and PR #239 were created. Current GitHub metadata after opening this PR:

- Branches: **211 total including main; 210 non-main**.
- PR records: **204 total** — 95 merged, 106 closed without merge, and **3 open** (2 Draft, 1 non-Draft).
- Current open PRs are #236, #238, and this ledger PR #239. Refresh the counts again after any merge/closure.

## Rules for future agents

1. Read this ledger before touching an old branch or recreating work.
2. Treat a branch listed under **Merged PRs** as historical provenance. Do not merge/reapply it again unless a fresh diff proves a specific change is missing from current main.
3. Treat **Closed without merge** as “not merged through this PR”; check whether its feature/fix was superseded or landed through another PR before porting it.
4. The **Open PRs** list is the current PR triage queue. Do not open duplicate PRs for the same branch/change.
5. For branches without a PR record, compare against current main and inspect changed files; classify as duplicate, stale, unique candidate, or empty. Never delete based only on age or ahead/behind.
6. Refresh this inventory after consolidation work: update counts, statuses, main SHA, and branch mappings.
7. Keep one active branch per workstream. Reuse an existing branch for a task; create a new branch only for a genuinely separate substantial feature.

## Open pull requests — review required

| PR | Title | Head branch | State |
|---|---|---|---|
| #238 | test(admin): verify concurrent last-owner membership mutations | `feat/platform-admin-membership-concurrency-20261028` | OPEN · DRAFT |
| #236 | test(finance): cover concurrent invoice void and sales return | `docs/audit-master-plan-2026-10-28` | OPEN · DRAFT |
| #239 | docs: add branch consolidation ledger | `docs/branch-consolidation-ledger-2026-10-28` | OPEN · READY FOR REVIEW |

## Merged pull requests — already integrated through these PRs

| PR | Title | Head branch | State |
|---|---|---|---|
| #10 | feat: add minimal local FastAPI starter | `feat/local-fastapi-starter` | MERGED |
| #11 | docs: add learning-first development workflow | `docs/learning-first-workflow` | MERGED |
| #12 | docs: add one-month individual and team learning plans | `docs/month-one-team-learning-plan` | MERGED |
| #13 | docs: record accepted V0 architecture decision | `architecture-decision-v0` | MERGED |
| #24 | feat: integrate first-ten business workflows with Firebase auth and Angular | `feat/integrated-production-auth-chat` | MERGED |
| #26 | CI: verify backend Docker image builds | `chore/backend-container-ci` | MERGED |
| #28 | Deploy FastAPI backend from Vercel project root | `deploy/vercel-fastapi` | MERGED |
| #29 | Fix Vercel Python dependency resolution | `fix/vercel-python-project-metadata` | MERGED |
| #30 | Preserve FastAPI request paths on Vercel | `fix/vercel-fastapi-path-routing` | MERGED |
| #31 | Use Vercel FastAPI framework autodetection | `fix/vercel-fastapi-autodetect` | MERGED |
| #32 | Fix frontend blank screen and configure deployed API | `fix/frontend-white-screen-runtime-config` | MERGED |
| #33 | Improve mobile navigation icon clarity and color contrast | `feat/mobile-nav-color-contrast` | MERGED |
| #34 | Complete payment recording workflow in API and dashboard | `feat/payment-recording-workflow` | MERGED |
| #35 | Complete expense entry and history UI | `feat/expense-management-ui` | MERGED |
| #37 | Polish mobile-first dashboard UX | `feat/mobile-first-ux-polish` | MERGED |
| #45 | Production release and rollback runbook | `docs/production-release-runbook` | MERGED |
| #51 | test: strengthen tenant, invoice and AI safety regressions | `test/mvp-regression-guardrails` | MERGED |
| #52 | docs: clarify live links and release verification status | `docs/production-status-and-live-links` | MERGED |
| #55 | fix(mobile): ship Arabic-first bottom navigation and PWA improvements | `fix/mobile-release-clean` | MERGED |
| #59 | feat: add interactive feature demo and next 10 feature roadmap | `feat/interactive-demo-next-10-features` | MERGED |
| #75 | feat: improve invoices, app version and profit/loss reporting | `feat/ui-version-invoices-profit-report` | MERGED |
| #77 | Add free local assistant fallback without OpenAI key | `ci/free-local-assistant-fallback-validation` | MERGED |
| #89 | Fix mobile navigation and enforce customer-linked accounting workflows | `feat/mobile-nav-accounting-integrity` | MERGED |
| #90 | docs(audit): add read-only legacy customer linkage report | `audit/legacy-customer-linkage-sql` | MERGED |
| #91 | test(auth): cover invalid and revoked Firebase ID tokens | `test/firebase-invalid-token-regressions` | MERGED |
| #92 | feat(reports): add currency-safe receivables aging report | `feature/receivables-aging-report` | MERGED |
| #93 | docs(accounting): propose double-entry ledger design | `design/double-entry-ledger-adr` | MERGED |
| #96 | feat(frontend): add typed receivables aging API client | `feature/receivables-aging-api-client` | MERGED |
| #97 | feat(frontend): add bilingual receivables aging report UI | `feature/receivables-aging-mobile-ui` | MERGED |
| #100 | docs: add mobile release gates for receivables and invoice editor | `docs/receivables-invoice-mobile-release-gates` | MERGED |
| #102 | feat(mobile): safe CSV imports and multi-line invoice drafts | `feature/csv-import-preview-mainline` | MERGED |
| #105 | [release-web] [release-api] release: v0.2.0 with version visibility and accounting safety fixes | `release/v0.2.0-accounting-and-version` | MERGED |
| #107 | docs: document Neon backup readiness and restore drill | `docs/neon-backup-restore-readiness` | MERGED |
| #115 | feat: add mobile-friendly invoice print preview | `feat/invoice-print-preview` | MERGED |
| #122 | fix(mobile): show release versions in the visible app header | `fix/mobile-version-badge-v0.2.0` | MERGED |
| #124 | fix(accounting): reconcile returnable values with invoice discounts | `fix/discount-return-cent-allocation` | MERGED |
| #125 | feat(audit): add owner activity log API and mobile UI | `feat/audit-log-v0.2` | MERGED |
| #126 | fix(mobile): show UI and API versions in signed-in app | `fix/mobile-version-strip-mainline` | MERGED |
| #131 | fix(accounting): reconcile discounted returns to invoice net subtotal | `fix/return-discount-allocation` | MERGED |
| #135 | docs(ops): add guarded encrypted backup and restore drill | `docs/backup-restore-drill` | MERGED |
| #137 | [release-api] fix(security): enforce OWNER-only pricing and scheduled actions | `fix/security-role-guard-gaps-110` | MERGED |
| #138 | [release-web] feat(release): prepare v1.0.0 with mobile invoice drafts | `feature/mobile-invoice-draft-editor-rebased` | MERGED |
| #139 | docs(accounting): clarify unapplied receipts and expense settlement | `docs/accounting-ledger-review-followups` | MERGED |
| #141 | fix(ui): add assistant suggestions and build timestamp | `fix/assistant-ui-buildstamp-mainline` | MERGED |
| #142 | docs(audit): record production readiness blockers and correct backend guide | `audit/production-readiness-2026-10-26` | MERGED |
| #145 | ci(frontend): run existing unit tests in CI | `fix/ci-run-frontend-unit-tests-2026-10-26` | MERGED |
| #152 | Add autonomous end-to-end engineering rules | `docs/autonomous-execution-rules` | MERGED |
| #153 | ci: reduce redundant workflow runs on zero budget | `fix/ci-filters-reconciled-main` | MERGED |
| #161 | fix: consolidate production safety work and guard sales returns | `task/production-safety-consolidated` | MERGED |
| #166 | fix(auth): require OWNER for invoice issue and void | `fix/owner-only-invoice-issue-void-2026-10-27` | MERGED |
| #167 | docs: reconcile task ledger with merged 1.2.0 production release | `docs/release-ledger-verified-2026-10-27` | MERGED |
| #168 | fix(ui): prevent duplicate payment retries and stale workspace reports | `fix/payment-ui-safety-main-2026-10-27` | MERGED |
| #169 | docs: record verified payment safety frontend production release | `docs/release-web-payment-safety-verified-2026-10-27` | MERGED |
| #171 | docs: codify vibe coding and agent orchestration rules | `docs/vibe-coding-agent-operating-rules` | MERGED |
| #172 | feat(admin): add secure Platform Admin screen | `feat/platform-admin-screen` | MERGED |
| #175 | fix(ui): show workspace release metadata and clarify payment access | `fix/workspace-release-metadata-payment-ui` | MERGED |
| #177 | fix: show payment failures beside the payment form | `fix/payment-errors-visible` | MERGED |
| #182 | fix(ui): refine mobile customers and invoices on current main | `fix/main-synced-mobile-ui` | MERGED |
| #183 | ci: add browser smoke coverage and contributor governance | `automation-testing-e2e` | MERGED |
| #185 | [release-api] [release-web] fix(inventory): rebase v1.2.1 release on latest main | `fix/release-v1.2.1-rebased-main-2026-10-27` | MERGED |
| #186 | [release-web] [release-api] docs(release): record v1.2.1 merge and deployment blocker | `docs/release-v1.2.1-post-merge-checkpoint-2026-10-27` | MERGED |
| #188 | docs(process): reduce branch churn and batch production deployments | `docs/workflow-branch-and-deploy-rules-2026-10-27` | MERGED |
| #190 | feat(admin): add global user directory and delegated platform roles | `feat/platform-admin-user-directory-and-roles` | MERGED |
| #191 | test(finance): add PostgreSQL concurrency and payment idempotency regressions | `integrate/financial-concurrency-main-20261027` | MERGED |
| #192 | feat(release): integrate v1.3.0 invoice, stock, and feature guide on current main | `integrate/release-v1-3-main-20261027` | MERGED |
| #193 | docs(admin): record merged Admin validation and remaining gates | `feat/platform-admin-user-directory-and-roles` | MERGED |
| #196 | test(admin): cover Firebase directory failure paths for role grants | `fix/admin-firebase-directory-failure-tests` | MERGED |
| #197 | feat(accounting): add currency-separated tax summary report | `feat/tax-summary-current-main` | MERGED |
| #200 | feat(customers): search by name, email, and phone | `feat/customer-search-contact-fields-current-main` | MERGED |
| #202 | fix(admin): harden Firebase directory lookups and least-privilege access | `feat/platform-admin-user-directory-and-roles` | MERGED |
| #203 | feat(accounting): add owner data integrity review UI | `feat/data-integrity-owner-ui-clean-main` | MERGED |
| #204 | feat(operations): add scoped supplier and schedule read APIs | `feat/operations-readiness-api-clean-main` | MERGED |
| #206 | chore(release): bump frontend version to 1.3.1 | `release/v1.3.1-version-bump` | MERGED |
| #207 | feat(admin): integrate owner-managed workspace memberships | `feat/admin-membership-mainline-20261028` | MERGED |
| #208 | test(e2e): reapply mobile startup coverage on current main | `reintegrate/e2e-mobile-startup-main-20261028` | MERGED |
| #210 | feat(payments): add spreadsheet-safe payment CSV export | `reintegrate/payment-csv-safe-export-main-20261028` | MERGED |
| #213 | fix(ui): reapply mobile audit and invoice layout polish on latest main | `reintegrate/mobile-ui-polish-main-v2-20261028` | MERGED |
| #214 | feat(workspace): search records, filter invoices, and export CSV | `reintegrate/workspace-search-export-main-20261028` | MERGED |
| #215 | feat(operations): reapply supplier purchasing recurring and notification UI | `reintegrate/operations-ui-main-20261028` | MERGED |
| #217 | fix(ai): retry transient provider failures with bounded timeouts | `reintegrate/assistant-provider-retry-only-20261028` | MERGED |
| #218 | docs(tasks): record branch consolidation and verified gates | `docs/branch-consolidation-status-2026-10-28` | MERGED |
| #219 | fix(ai): cap accumulated conversation history | `reintegrate/assistant-history-cap-main-20261028` | MERGED |
| #220 | fix(security): restrict initial stock creation to owners | `reintegrate/initial-stock-owner-guard-main-20261028` | MERGED |
| #221 | fix(api): remove duplicate report route registrations | `reintegrate/dedupe-api-routes-main-20261028` | MERGED |
| #223 | fix(security): harden Platform Admin and workspace authorization | `security/platform-admin-hardening-2026-10-28` | MERGED |
| #224 | test(security): cover workspace status audit atomicity | `security/platform-admin-audit-atomicity-followup` | MERGED |
| #225 | fix(security): authorize opening stock before product writes | `fix/opening-stock-owner-guard-main-20261028` | MERGED |
| #226 | chore(release): align security release metadata at 1.3.2 | `release/v1.3.2-security-consolidation-20261028` | MERGED |
| #228 | ci: run backup restore safety guard tests | `ci/backup-restore-safety-checks-20261028` | MERGED |
| #229 | docs(release): record Vercel quota blocker and branch audit progress | `docs/release-deployment-blocker-checkpoint-20261028` | MERGED |
| #231 | test(security): cover fail-closed Firebase configuration | `test/security-firebase-unconfigured-503-20261028` | MERGED |
| #233 | fix(finance): prevent invoice void after approved returns | `fix/finance-block-void-after-approved-return-20261028` | MERGED |
| #234 | fix(backup): validate isolated restore target catalogs | `fix/backup-restore-target-safety-main-20261028` | MERGED |
| #235 | docs(tasks): record final consolidation evidence and release blockers | `docs/final-consolidation-checkpoint-20261028` | MERGED |
| #237 | docs: enforce one active branch per contributor | `docs/one-branch-workflow-policy` | MERGED |

## Closed pull requests that were not merged

These PRs are **not merged by their own PR**. Some changes may have been re-integrated or superseded elsewhere; verify before reapplying.

| PR | Title | Head branch | State |
|---|---|---|---|
| #1 | Document proposed V0 architecture and delivery plan | `docs/architecture-proposal-v0` | CLOSED · NOT MERGED |
| #5 | docs: add mandatory project-wide governance rules | `docs/mandatory-project-governance` | CLOSED · NOT MERGED |
| #8 | docs: add V0 architecture decision matrix | `docs/architecture-decision-matrix` | CLOSED · NOT MERGED |
| #9 | docs: propose FastAPI + PostgreSQL architecture for V0 | `docs/adr-fastapi-postgres-v0` | CLOSED · NOT MERGED |
| #15 | feat: lay PostgreSQL and first-ten feature foundations | `feat/first-ten-features` | CLOSED · NOT MERGED |
| #16 | feat: start second-ten roadmap with inventory schema | `feat/second-ten-features` | CLOSED · NOT MERGED |
| #17 | feat: add domain foundations across all planned feature areas | `feat/all-feature-domain-foundation` | CLOSED · NOT MERGED |
| #18 | feat: expose secure business workflow API endpoints | `feat/api-workflows-and-angular-shell` | CLOSED · NOT MERGED |
| #19 | feat: expand tenant-scoped workflows and safe CSV tools | `feat/first-secure-workflows` | CLOSED · NOT MERGED |
| #20 | feat: add responsive Angular dashboard shell | `feat/angular-dashboard-shell` | CLOSED · NOT MERGED |
| #21 | feat: add responsive Angular dashboard shell | `feat/angular-dashboard-shell-current` | CLOSED · NOT MERGED |
| #22 | feat: add responsive Angular dashboard shell | `feat/angular-dashboard-shell-latest` | CLOSED · NOT MERGED |
| #23 | feat: add responsive Angular dashboard shell | `feat/angular-dashboard-shell-reviewed-base` | CLOSED · NOT MERGED |
| #25 | fix: CORS, invoice stock validation, and sales-return lifecycle | `fix/security-audit-cors-invoice-guards` | CLOSED · NOT MERGED |
| #27 | Deploy Angular frontend to Firebase Hosting | `deploy/firebase-hosting` | CLOSED · NOT MERGED |
| #36 | Improve mobile navigation and responsive dashboard UX | `feat/mobile-bottom-nav-ux` | CLOSED · NOT MERGED |
| #38 | Add Arabic RTL workspace UI and app-wide loading feedback | `feat/arabic-rtl-app-loading` | CLOSED · NOT MERGED |
| #40 | feat(ai): bound assistant requests and inventory tenant-scoped routes | `feat/assistant-resilience-usage-limits` | CLOSED · NOT MERGED |
| #41 | Payment integrity regression tests | `test/payment-integrity-regression` | CLOSED · NOT MERGED |
| #42 | Payment integrity regression tests (corrected) | `test/payment-integrity-regression-fixed` | CLOSED · NOT MERGED |
| #43 | AI assistant resilience and tenant route inventory | `feat/assistant-resilience-usage-limits-verified` | CLOSED · NOT MERGED |
| #44 | test(security): deny foreign workspace reads and mutations | `test/tenant-route-negative` | CLOSED · NOT MERGED |
| #46 | Arabic RTL and accessibility polish for mobile | `feat/arabic-rtl-accessibility-ready` | CLOSED · NOT MERGED |
| #47 | fix(auth): diagnose connectivity and add Arabic-English switch | `fix/auth-network-and-language-switch` | CLOSED · NOT MERGED |
| #48 | fix(mobile): compact bottom navigation and add PWA install | `fix/mobile-pwa-navigation-clean` | CLOSED · NOT MERGED |
| #49 | feat(mobile): Arabic-first navigation, PWA polish, and workspace list tools | `fix/mobile-no-topbar-release` | CLOSED · NOT MERGED |
| #50 | test(ai): cover assistant authorization and input guardrails | `test/assistant-safety-guardrails` | CLOSED · NOT MERGED |
| #53 | test: expand tenant isolation coverage across business resources | `test/tenant-resource-boundaries` | CLOSED · NOT MERGED |
| #54 | docs: inventory authenticated business API routes | `docs/security-route-inventory` | CLOSED · NOT MERGED |
| #56 | feat(workspace): search records, filter invoices, and export CSV | `feat/workspace-search-export` | CLOSED · NOT MERGED |
| #57 | feat: start ten business operations upgrades with payment CSV export | `feat/business-ops-roadmap-and-payment-export` | CLOSED · NOT MERGED |
| #58 | fix: prevent stale workspace data leaking during workspace switches | `fix/workspace-switch-data-isolation` | CLOSED · NOT MERGED |
| #70 | ci: add scheduled dependency security scans | `chore/add-python-dependency-security-scan` | CLOSED · NOT MERGED |
| #71 | feat(audit): add workspace-scoped audit event feed | `feat/audit-event-feed` | CLOSED · NOT MERGED |
| #72 | feat(customers): search by name, email, and phone | `feat/customer-search-email-phone` | CLOSED · NOT MERGED |
| #73 | feat(authz): add owner-managed workspace memberships | `feat/workspace-membership-management` | CLOSED · NOT MERGED |
| #74 | feat(customers): add customer statement timeline | `feat/customer-statement-timeline` | CLOSED · NOT MERGED |
| #76 | Add free local assistant fallback without OpenAI key | `feat/free-local-assistant-fallback` | CLOSED · NOT MERGED |
| #98 | feat(invoices): support multi-line invoice drafts on mobile | `feature/mobile-multi-line-invoice-editor` | CLOSED · NOT MERGED |
| #101 | feat(import): add safe preview to existing CSV workflow | `feature/safe-product-csv-import-api` | CLOSED · NOT MERGED |
| #103 | feat(release): show deployed UI/API versions and gate Vercel builds | `release/version-visibility-and-deploy-gates` | CLOSED · NOT MERGED |
| #104 | fix(accounting): prevent sales returns exceeding invoiced quantities | `fix/sales-return-overapproval` | CLOSED · NOT MERGED |
| #108 | feat: save multi-line invoices as drafts with mobile totals preview | `feature/mobile-invoice-draft-editor` | CLOSED · NOT MERGED |
| #112 | fix(accounting): standardize line-level HALF_UP rounding | `fix/accounting-rounding-half-up` | CLOSED · NOT MERGED |
| #113 | feat(audit): add owner-only activity log API | `feat/audit-log-read-api` | CLOSED · NOT MERGED |
| #114 | feat: add currency-safe customer statement API | `feat/customer-statement-api` | CLOSED · NOT MERGED |
| #116 | feat: add read-only accounting data integrity report | `feat/legacy-linkage-audit` | CLOSED · NOT MERGED |
| #117 | fix: keep app version visible on mobile | `fix/mobile-version-visibility` | CLOSED · NOT MERGED |
| #118 | test: verify receivables aging balances and data quality | `test/receivables-aging-report` | CLOSED · NOT MERGED |
| #119 | feat(audit): add owner-only mobile audit log UI | `feat/audit-log-mobile-ui-v2` | CLOSED · NOT MERGED |
| #120 | feat(audit): add mobile-friendly owner activity log UI | `feat/audit-log-mobile-ui` | CLOSED · NOT MERGED |
| #121 | feat(customers): add mobile customer statement view | `feat/customer-statement-mobile-ui` | CLOSED · NOT MERGED |
| #123 | fix(mobile): keep UI and API version visible in installed app | `fix/mobile-version-strip` | CLOSED · NOT MERGED |
| #127 | feat(audit): add owner activity log API and mobile UI | `feat/audit-ui-mainline` | CLOSED · NOT MERGED |
| #128 | feat(accounting): add owner data-integrity review UI | `feat/data-integrity-ui` | CLOSED · NOT MERGED |
| #129 | feat(invoices): add mobile draft editor with discount and tax preview | `feat/mobile-invoice-drafts-v0.2` | CLOSED · NOT MERGED |
| #130 | feat(customers): add currency-safe customer statement | `feat/customer-statement-mainline` | CLOSED · NOT MERGED |
| #132 | feat(operations): add suppliers, purchasing, expenses and schedule views | `feat/operations-modules-v0.2` | CLOSED · NOT MERGED |
| #133 | feat(accounting): add currency-separated tax summary report | `feat/tax-summary-report` | CLOSED · NOT MERGED |
| #134 | feat(release): consolidate accounting and operations readiness modules | `feat/production-readiness-v0.3` | CLOSED · NOT MERGED |
| #136 | chore(release): prepare UI v1.0.0 version badge | `release/v1.0.0-ui-version-badge` | CLOSED · NOT MERGED |
| #140 | feat(ui): assistant suggestions and build timestamp | `feature/invoice-payment-assistant-release-fixes` | CLOSED · NOT MERGED |
| #143 | fix(reports): apply business timezone to financial date filters | `fix/business-timezone-reporting` | CLOSED · NOT MERGED |
| #144 | fix(accounting): prevent sales returns exceeding invoice line value | `fix/sales-return-amount-guard-2026-10-26` | CLOSED · NOT MERGED |
| #146 | fix(ui): prevent stale reports crossing workspace switches | `fix/ui-report-workspace-races-2026-10-26` | CLOSED · NOT MERGED |
| #147 | fix(ui): prevent payment retries after refresh failure | `fix/ui-payment-refresh-idempotency-2026-10-26` | CLOSED · NOT MERGED |
| #148 | fix(api): allow CORS preflight for settings PUT | `fix/cors-put-settings-2026-10-26` | CLOSED · NOT MERGED |
| #149 | fix(api): validate schedule timezones and setting keys | `fix/api-schedule-timezone-setting-keys-2026-10-26` | CLOSED · NOT MERGED |
| #150 | docs(agent): establish permanent engineering agent operating plan | `feat/permanent-engineering-agent-foundation` | CLOSED · NOT MERGED |
| #151 | ci: reduce unnecessary workflow runs on zero budget | `fix/ci-path-filters-zero-budget` | CLOSED · NOT MERGED |
| #154 | fix(reports): apply business timezone to financial date filters | `fix/business-timezone-reporting-rebased` | CLOSED · NOT MERGED |
| #155 | fix(accounting): prevent sales returns exceeding invoice line value | `fix/sales-return-amount-guard-rebased` | CLOSED · NOT MERGED |
| #156 | fix(ui): prevent stale reports crossing workspace switches | `fix/ui-report-workspace-races-rebased` | CLOSED · NOT MERGED |
| #157 | fix(ui): protect workspace reports and payment retries | `fix/ui-workspace-and-payment-safety-rebased` | CLOSED · NOT MERGED |
| #158 | fix(api): allow CORS preflight for settings PUT | `fix/cors-put-settings-rebased` | CLOSED · NOT MERGED |
| #159 | fix(api): validate schedule timezones and setting keys | `fix/api-schedule-timezone-setting-keys-rebased` | CLOSED · NOT MERGED |
| #160 | fix(api): validate recurring schedule timezones and setting keys | `fix/api-validate-schedule-timezones-setting-keys-rebased` | CLOSED · NOT MERGED |
| #162 | feat(accounting): add receivables aging report | `feat/receivables-aging-report` | CLOSED · NOT MERGED |
| #163 | docs: record GitHub Actions runner diagnosis | `fix/ci-runner-diagnosis-2026-10-27` | CLOSED · NOT MERGED |
| #164 | ci: diagnose GitHub-hosted runner allocation | `diagnostic/github-runner-allocation-2026-10-27` | CLOSED · NOT MERGED |
| #165 | ci(frontend): gate Vercel build on unit tests | `ci/vercel-frontend-test-gate-2026-10-27` | CLOSED · NOT MERGED |
| #170 | [release-api] [release-web] fix(inventory): prevent duplicate-line oversell; prepare v1.2.1 | `tests/payment-integrity-regressions-rebased-2026-10-27` | CLOSED · NOT MERGED |
| #173 | ci: add CircleCI accounting gates and financial concurrency tests | `fix/actions-minute-budget` | CLOSED · NOT MERGED |
| #174 | fix(ui): contain customer statement table on mobile | `fix/customer-statement-mobile-overflow` | CLOSED · NOT MERGED |
| #176 | test(payments): verify owner payment creation and idempotent replay | `test/payment-api-owner-flow` | CLOSED · NOT MERGED |
| #178 | feat: polish mobile customers invoices and activity log UI | `feat/mobile-customers-invoices-audit-ui` | CLOSED · NOT MERGED |
| #179 | fix(ui): polish mobile customers, invoices, and activity log | `ui/mobile-customers-invoices-audit` | CLOSED · NOT MERGED |
| #180 | [superseded] mobile UI refinements (implemented in PR #182) | `fix/mobile-ui-on-latest-main` | CLOSED · NOT MERGED |
| #181 | fix(ui): polish mobile customers, invoices, and activity log | `fix/mobile-ui-rebased-on-main` | CLOSED · NOT MERGED |
| #184 | [superseded] release v1.2.1 version alignment (use PR #170) | `chore/release-v1.2.1-2026-10-27` | CLOSED · NOT MERGED |
| #187 | fix(inventory): enforce stock totals and four-slot mobile navigation (v1.2.1) | `fix/inventory-and-admin-mobile-nav-v1.2.1` | CLOSED · NOT MERGED |
| #189 | feat(release): prepare v1.3.0 invoice, stock, and feature guide release | `fix/invoice-payment-and-stock-quantity-2026-10-27` | CLOSED · NOT MERGED |
| #194 | test(admin): cover Firebase directory failure paths for role grants | `feat/platform-admin-user-directory-and-roles` | CLOSED · NOT MERGED |
| #195 | test(e2e): cover mobile startup viewport | `test/e2e-mobile-startup-cycle-2026-10-27` | CLOSED · NOT MERGED |
| #198 | feat(customers): search by name, email, and phone | `feat/customer-search-contact-fields` | CLOSED · NOT MERGED |
| #199 | feat(accounting): add owner data-integrity review UI | `feat/data-integrity-owner-ui` | CLOSED · NOT MERGED |
| #201 | feat(accounting): add owner data-integrity review UI | `feat/data-integrity-owner-ui-current-main` | CLOSED · NOT MERGED |
| #205 | feat(operations): add scoped supplier and schedule read APIs | `feat/operations-readiness-api-current-main` | CLOSED · NOT MERGED |
| #209 | fix(ui): reapply mobile audit and invoice layout polish on current main | `reintegrate/mobile-ui-polish-main-20261028` | CLOSED · NOT MERGED |
| #211 | fix(ai): bound chat history and retry transient provider failures | `reintegrate/assistant-resilience-main-20261028` | CLOSED · NOT MERGED |
| #212 | fix(security): guard opening stock before persistence | `docs/audit-master-plan-2026-10-28` | CLOSED · NOT MERGED |
| #216 | fix(ai): bound chat history and retry transient provider failures | `reintegrate/assistant-resilience-current-main-20261028` | CLOSED · NOT MERGED |
| #222 | docs(tasks): record latest verified branch consolidation | `docs/branch-consolidation-update-2026-10-28` | CLOSED · NOT MERGED |
| #227 | docs(security): refresh post-merge verification evidence | `docs/post-merge-verification-20261028` | CLOSED · NOT MERGED |
| #230 | fix(backup): validate isolated restore target catalogs | `fix/backup-restore-target-safety-20261028` | CLOSED · NOT MERGED |
| #232 | fix(finance): prevent invoice void after approved returns | `docs/audit-master-plan-2026-10-28` | CLOSED · NOT MERGED |

## Branches without a matching PR head in this inventory

No matching PR head was found for these existing branches. This is a review queue, not a claim that all contain unique unmerged work.

- `feat/first-ten-business-foundation`
- `fix/accounting/line-rounding-reconciliation`
- `fix/backup-restore-target-safety-current-main-20261028`
- `fix/deterministic-frontend-install`
- `fix/invoice-stock-return-safety`
- `fix/ui-ux-review-batch-2026-10-28`
- `learning/toto-practice`
- `security/owner-staff-permission-matrix`
- `test/stock-empty-movements`
- `verify/api-release-dec7`
- `verify/merged-main-dec7`

## Audit limitations

- GitHub branch and PR data was inspected; comparisons against `main` were run for all 209 non-main branches before creating this ledger branch. Compare results alone are not proof of integration because squash/rebase merges and replacement PRs exist.
- This document does not authorize branch deletion or production deployment.
- Before merging any change, inspect the latest exact head SHA, required CircleCI checks, review/protection requirements, and current main SHA.
