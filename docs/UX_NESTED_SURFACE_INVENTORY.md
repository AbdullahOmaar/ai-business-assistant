# T18 UI/UX Nested Surface Inventory

**Evidence baseline:** GitHub branch `master/t18-uiux-hardening-20261107`, source/test readback through `c79e9bffa84e8d3950773d4f0d802044061acb25` (2026-11-07). This is source/test evidence, not a rendered product-acceptance claim.

## Implemented source surfaces and regression coverage

| Surface | Current source behavior | Existing regression evidence | Remaining acceptance |
|---|---|---|---|
| Keyboard-accessible data tables | Horizontally scrollable workspace and Platform Admin tables expose named regions, accept keyboard focus, and show a visible focus ring including forced-colors mode | `app.component-template-safety.spec.ts` named-region assertions; `design-tokens.spec.ts` focus/forced-colors assertions | Keyboard-only horizontal scroll, NVDA/VoiceOver announcements and rendered 360/390px acceptance |
| Mobile Hybrid Modern app header | Mobile-only compact brand/name and build-sourced UI version; current workspace name with the existing selector only when multiple workspaces exist; current page title with polite screen-reader announcement and Home-only greeting; Arabic RTL headings retain natural connected-script letter spacing instead of inheriting Latin-style negative tracking; notification and assistant shortcuts; account menu reuses existing language/sign-out actions, dismisses on sibling header actions/outside pointer, and returns focus to the profile trigger after language changes; account popover uses the shared surface token; dynamic page-title changes are politely announced; all mobile header controls have a 44px minimum target; semantic primary/info/surface/popover tokens; existing install CTA remains clear of the header | `mobile-app-header.spec.ts` (11 source-test declarations, including Home-only greeting scope) source regressions for component bindings, version/workspace sources, route reuse, keyboard-dismissable account menu, RTL/overflow, notification-contract honesty and semantic-token usage | Rendered 360/390/412px RTL/LTR comparison; long workspace/page names; real workspace switch and stale-data fencing; profile menu keyboard/outside click; install prompt/help placement; safe-area and screen-reader verification. Unread badge intentionally omitted until the API exposes a read/unread field |
| Shared section headers | Shared h2/h3 hierarchy across Home and nested module sections; long Arabic/English titles wrap safely; narrow-screen layout stacks actions below heading copy and aligns them to the logical start; semantic h1/h2/h3 headings plus eyebrow/navigation captions across the workspace (including nested modules and Platform Admin) use natural tracking in RTL rather than Latin-style letter spacing | `design-tokens.spec.ts` shared section-header hierarchy and narrow-screen layout cases | Rendered 360/390px RTL/LTR, action wrapping and screen-reader heading navigation |
| Shared shell and mobile More | Central role-aware module registry; active secondary destinations; Escape/outside close; focus restoration; logical RTL/LTR positioning; refreshed membership/platform role revalidates the active tab before scoped data reload; Firebase App/Auth runtime SDK loads in a separate chunk after runtime-config validation | `module-access.spec.ts`, `mobile-navigation.spec.ts`, `app.component-template-safety.spec.ts`, `auth-lazy-loading.spec.ts` | Verify initial bundle budget after build; browser keyboard/screen-reader run; physical Android/PWA |
| Home / Overview Dashboard | Mobile Hybrid Modern top header; compact business-local 30-day period/date/timezone strip with a matching non-data period skeleton while KPIs load with one shared workspace-level loading announcement (no duplicate Home live status); four source-backed currency-separated metric groups with 12px minimum readable reporting/detail copy and a semantic level-two Business Summary heading with visible localized labels, aria-labelledby group names, each source timestamp/basis, LTR-isolated dates/amounts/counts and neutral dash placeholders when no currency group exists; neutral trust caveat labelled “Metric notes” / “ملاحظات على المؤشرات” to describe explanatory copy rather than imply a data-integrity result; KPI loading skeletons; five role-filtered compact shortcut links (2 columns at 390/412px, 1 at 360px) rather than a second card grid; the full All Modules disclosure retains all 19 unique destinations; native keyboard-accessible all-module disclosure collapsed by default with a 44px summary target; phrasing-only summary content with an ARIA level-two heading (no invalid nested heading element); failed post-payroll dashboard refresh clears stale Home metrics and preserves its retryable error across navigation; a successful refresh clears only that matching Home banner while preserving unrelated page-level errors; pending-action/operational-alert panel intentionally omitted because the current dashboard API has no aggregate and candidate record statuses are not approved alert semantics | `home-dashboard.spec.ts` (21 source-test declarations), `workspace-module-catalog.spec.ts`, `app.component-template-safety.spec.ts` | Rendered desktop/tablet/360/390/412 RTL/LTR, real OWNER/STAFF and second-tenant visibility, period/date legibility, multi-currency wrapping, loading/empty/error and workspace-switch states, disclosure/quick-access keyboard behavior, screen-reader, zoom and touch-target acceptance |
| Customers CSV import | Preview is separate from execution; valid preview gates confirmation; workspace switch clears pending import; owner-only import actions | `app.component-template-safety.spec.ts` customer-import cases | Browser file picker, preview table overflow, focus and retry |
| Stock-tracked product creation | Workspace members can create products; only OWNER sees the positive opening-stock input. STAFF can still create a stock-tracked product with zero opening stock. The payload also defaults to zero for non-owners, and the value is cleared when workspace/role context changes. The backend remains authoritative and rejects positive opening stock for STAFF before product/stock/audit writes. | `app.component-template-safety.spec.ts` OWNER-only field/payload/reset regression; `mobile-chat.spec.ts` mocks a STAFF product creation and asserts `opening_quantity: 0` | Browser regression authored, NOT RUN; authenticated OWNER/STAFF request-denial and no-side-effect proof; physical mobile rendering |
| Products CSV import | Preview/validation before confirmation; confirmed import is not repeated after ambiguous refresh | `app.component-template-safety.spec.ts` product-import cases | Browser file picker and large-file behavior |
| Invoice line editor and totals preview | Dynamic line validation and estimated totals; draft creation distinct from issue; totals remain server-authoritative | `app.component-template-safety.spec.ts` invoice line/validation cases | Rendered mobile editing and long product names |
| Invoice print | Issued-invoice-only print action; escaped business/customer/invoice/line content; popup-blocked and detail errors surfaced | `invoice-print-preview.spec.ts` | Real browser popup/print rendering in RTL and LTR |
| Invoice void confirmation | Shared accessible dialog; OWNER guard; explicit void warning; no refund/credit-note implication; semantic warning/danger tokens; system-color focus fallback; focus return and uncertain-result protection | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF denial and rendered keyboard test |
| Purchase receipt confirmation | Shared dialog; OWNER-only; Receive available only for approved/partially_received orders with remaining quantity; Draft shows a bilingual explanation and no Receive control; line quantities reviewed; request/confirm re-check eligibility; uncertain result blocks unsafe retry | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Rendered OWNER draft/approved/partial states; authenticated OWNER/STAFF journey and no-side-effect evidence |
| Payments and expenses | Bilingual payment-method and fixed expense-category labels in rows and local search; search over visible receipt/expense details; separate no-match vs no-record state; search clears on workspace change | `record-filters.spec.ts` Arabic method/category cases, `app.component-template-safety.spec.ts` localized-label assertions, `workspace-data-access.spec.ts` | Authenticated data visibility and mobile list usability |
| Suppliers, purchase orders, recurring schedules, notifications | Local search over visible fields; purchase-order and notification status labels/search are bilingual; recurring/allocation state search uses exact state labels; localized empty/no-match states | `record-filters.spec.ts` Arabic status cases, `app.component-template-safety.spec.ts` localized status assertions | Large-list performance and rendered mobile behavior |
| AI assistant | Bilingual empty/loading/error/retry states; named keyboard-focusable conversation log; new-chat reset for the in-memory session; one-tap copy for assistant replies with localized feedback; auto-scroll to the latest turn respects reduced-motion; source list localizes source heading/type and reuses expense category labels; source records remain those supplied by the backend | Existing `mobile-chat.spec.ts` and `app.component-template-safety.spec.ts`; new conversation controls/copy/scroll regression coverage is deferred to the consolidated test batch | Authenticated tenant-scoped source correctness, clipboard behavior across supported browsers, keyboard/screen-reader and physical mobile acceptance |
| Employees and payroll | Lazy-loaded only on owner Employees route; component-local surfaces, controls, typography and success/warning/error/info states use the shared semantic tokens; action controls retain a 44px target; payout action explicitly records an in-app event and does not claim a bank transfer | `employee-payroll-ui.spec.ts`, `app.component-template-safety.spec.ts` | **UX-HR-01 FIX IMPLEMENTED:** employee directory and payroll selector labels now show name/code only; base salary remains in the existing OWNER-only compensation form. Exact-head Node/CircleCI and authenticated OWNER/STAFF/two-tenant privacy acceptance pending |
| Release Guide and Platform Admin | Lazy-loaded only when selected; Platform Admin remains a separate permission domain and now maps its local surface/typography/focus variables onto the shared semantic token system; activity audit action/target labels use the shared bilingual vocabulary | `release-guide.spec.ts`, `platform-admin-user-management.spec.ts`, `audit-labels.spec.ts` | Authenticated platform-admin and workspace-role journeys |
| Reports, Tax, Customer Statement, Activity Log, Integrity, Operational Health | Source-level loading/error/empty/permission states and currency/basis limitations retained; Customer Statement event types and Operational Health status use bilingual labels | `app.component-template-safety.spec.ts`, `data-integrity-ui.spec.ts`, `release-guide.spec.ts` | Authenticated OWNER/STAFF/second-tenant journeys; report basis review |

## UX finding disposition

- **UX-01 contrast:** semantic tertiary text token and contrast regression coverage are present at source level; 64 repeated App Shell color declarations reuse semantic tokens; info/success/danger/warning variants retain distinct semantic colors. Rendered route screenshots now cover 18 workspace destinations plus Platform Admin across RTL/LTR and responsive widths; a formal contrast/forced-colors visual audit remains NOT RUN.
- **UX-02 More-menu focus:** source-level outside close, Escape, focus restoration and RTL/LTR positioning are covered; mocked browser E2E exercises Escape/focus restoration, and the HR mobile navigation now has keyboard-only section switching. Screen-reader/NVDA/VoiceOver acceptance remains NOT RUN.
- **UX-03 mobile viewport/keyboard:** responsive route sweep PASS at 195/360/390/430/768/1280 CSS px in RTL/LTR with no horizontal document overflow; HR keyboard navigation and 44px section targets PASS. Physical installed-PWA keyboard/safe-area/landscape and full-product keyboard-only acceptance remain NOT RUN.
- **UX-04 authenticated journeys:** synthetic OWNER Alpha and OWNER Beta onboarding/draft-invoice UI journeys completed; Beta UI did not expose Alpha customer/invoice. Direct authenticated cross-tenant API denial remains NOT RUN. Live STAFF journey remains BLOCKED because the normal application has no supported invitation/create-membership workflow; no SQL or role spoofing used.
- **UX-05 module count:** addressed in source by deriving the Home directory count from `homeModuleCards.length`; the catalogue has 19 destinations, while the visible count is role- and platform-admin-availability-dependent.
- **UX-06 duplicate version metadata:** do not change without rendered desktop/mobile evidence; NOT RUN.
- **UX-07 reduced motion:** global reduced-motion CSS and shared-component fallbacks exist; forced-colors focus fallback includes the native disclosure summary. Rendered OS/browser reduced-motion and forced-colors verification, plus assistive-technology acceptance, remain NOT RUN.
- **UX-08 nested surfaces:** inventory above maps current major nested interactions and source tests. It does not certify every nested surface or browser behavior.

## Historical exact-head validation checkpoint — 2026-11-07 — `7f347ee0991ec2af15ba6e7211fb20bb412e8ada`

For `7f347ee0991ec2af15ba6e7211fb20bb412e8ada`:

- CircleCI `frontend-unit-tests`: SUCCESS.
- CircleCI `frontend-production-build`: SUCCESS.
- CircleCI `frontend-dependency-audit`: SUCCESS.
- CircleCI `backend-container`: SUCCESS.
- CircleCI `backend-accounting`: SUCCESS.
- CircleCI `frontend-browser-smoke`: FAILED on code SHA `7f347ee0991ec2af15ba6e7211fb20bb412e8ada` (job 13902). The current connected tools do not expose CircleCI's failing test output, so the exact failing test/root cause is UNKNOWN and must not be guessed.
- GitHub Actions backend/frontend workflow and dependency security scan: SUCCESS.
- Semaphore: failure is retired/non-authoritative under current CI policy.

## Explicitly not accepted yet

- Authenticated OWNER, STAFF, second-workspace OWNER and non-member browser journeys: NOT RUN. The failing browser-smoke job is a separate CI failure; its root cause remains UNKNOWN until job output is inspected.
- Physical Android Chrome, installed PWA, keyboard-open, safe-area, landscape and screen-reader checks: NOT RUN.
- Figma visual/structural review: BLOCKED by View-only access/read restriction.
- No Vercel preview deployment was available for this branch. Production was not changed.
- No API/backend/schema/migration/financial/payroll-rule changes were made by this UI/UX workstream.
- Phase 2 full Design System and Phase 3 high-fidelity Figma work remain governed by the UX workstream gates; this T18 engineering work does not claim those phases started or were accepted.


## Current candidate validation — 2026-11-07 — `31d49daf7ff382a8cf065a9c11ed6eeebab83f54`

- This candidate adds the OWNER-only positive opening-stock affordance, the STAFF zero-opening-stock fallback, workspace reset protection, a source regression test, and this UX inventory update.
- The source regression test is authored but **NOT RUN**. Frontend Node tests, Angular build, browser smoke and dependency audit are **NOT RUN on this SHA**.
- The immediately preceding PR head `1ad820d9fcd1d306772fd99f34c6be2a67020d1a` had five CircleCI checks SUCCESS and `frontend-browser-smoke` FAILURE. Those results are historical for that SHA and do not validate this candidate.
- No CircleCI trigger/retry was issued. The implementation commit used `[skip ci]` under the active no-trigger instruction. The browser-smoke failure output is unavailable through the current connected tools; its root cause remains UNKNOWN.
- Rendered OWNER/STAFF, mobile and assistive-technology acceptance remains NOT RUN/BLOCKED.


## Additional STAFF product-creation browser regression — 2026-11-07

- Extended the existing mocked STAFF mobile-navigation Playwright scenario to open Products, enable stock tracking, confirm the positive-opening-stock input is absent, and create a product.
- The mock captures the POST payload and asserts `is_stock_tracked: true` and `opening_quantity: "0"`. The scenario uses only mocked Firebase/API endpoints; it does not contact production or write business data.
- Browser regression is authored but **NOT RUN**. Exact-candidate CircleCI remains NOT RUN / no status contexts on the current source head; no trigger/retry was issued.




## Purchase-order receipt state alignment — 2026-11-07

- Confirmed against current main `backend/app/operations.py`: receipt is accepted only when order status is `approved` or `partially_received`; all other states are rejected before stock movements.
- The prior Angular UI showed Receive for any OWNER order with remaining quantity, including `draft`. Updated the UI to show a draft-state explanation and expose Receive only for approved/partially received orders with remaining quantities.
- Added the same eligibility guard to the dialog-opening and confirmation handlers. No approval action, backend rule, API contract, stock movement or business lifecycle was added/changed.
- Source regression test authored; browser rendering and tests remain **NOT RUN**.


## Exact-source checkpoint — 2026-11-07 — source baseline `17594661bb6214db81b5fb696e6245d1f0d1aac1`

- Confirmed two frontend-only UX defects against current main contracts: positive product opening stock is OWNER-only; purchase-order receipt is valid only for `approved` or `partially_received` status with remaining quantity.
- Source implementation and regression coverage are present on the active T18 branch. STAFF stock-tracked product create is covered by an authored mocked Playwright assertion for `opening_quantity: "0"`; purchase order source test covers status eligibility and draft feedback.
- The following are **authored / NOT RUN**: frontend Node tests, Angular template/production build, Playwright, dependency audit and authenticated/browser/device accessibility acceptance.
- Exact-source combined status at this baseline returned zero status contexts; no CI run was triggered. Earlier CircleCI results on `1ad820d9...` are historical and included a failed `frontend-browser-smoke`; root cause UNKNOWN from inaccessible logs.
- No backend/API/database/schema/migration, business-rule or stock-ledger change; no merge or deployment.


## Explicit membership-role reset regression — 2026-11-07

- The opening-stock source regression now asserts that `loadBusinesses()` compares both workspace ID and `business.role`, then calls `clearWorkspaceData()` when either changes.
- This proves the existing OWNER-to-STAFF role refresh clears the OWNER-only quantity. The `createProduct()` payload still independently forces zero for non-owners as defense in depth.
- Authored source regression is **NOT RUN**; no CI trigger/retry.


## Mobile keyboard viewport regression tightened — 2026-11-07

- Corrected the mocked Android keyboard acceptance in `frontend/e2e/mobile-chat.spec.ts`: it now compares both the send button and textarea bottom edges with `visualViewport.offsetTop + visualViewport.height`, not `window.innerHeight`.
- The previous assertion could pass while the keyboard covered the composer because the layout viewport still includes the keyboard area. This change strengthens the test; it does not alter application behavior or claim physical-device coverage.
- Playwright remains authored / **NOT RUN** until an authorized runner is available. The scenario uses mocked Firebase/API only.


## Bilingual invoice and purchase-order status search/display — 2026-11-07

- Source audit found invoice local search matched only backend status codes even though the list displays localized status labels. Purchase-order rows displayed raw backend status codes and their local search matched only those codes.
- Added localized status-label callbacks to invoice and purchase-order local filters; added a bilingual Purchase Order status label for the five current backend-constrained values (`draft`, `approved`, `partially_received`, `received`, `cancelled`) and use it in the list.
- Added Arabic search regression assertions for invoice `صادرة` and purchase-order `مستلم جزئيًا`, plus a template/source assertion for the displayed PO label.
- Frontend-only presentation/search behavior; no API, backend, database, workflow or financial semantics changed. Tests are authored / **NOT RUN**.


## Notification status labels localized — 2026-11-07

- Notification rows previously exposed raw backend status codes and notification search only matched those codes. Added localized labels for the backend-constrained `pending`, `sent`, `failed`, and `cancelled` values and included the active-language label in local search.
- Added Arabic regression coverage for searching `فشل الإرسال` and a template/source assertion for the displayed label.
- Frontend presentation/search only; delivery state, workers, API and persistence are unchanged. Tests authored / **NOT RUN**.


## Operational health status localization — 2026-11-07

- The read-only Operational Health summary displayed raw API values `ok` / `degraded`. The backend route explicitly returns those two values; the UI now displays localized labels (Healthy / سليم, Degraded / يحتاج مراجعة) and keeps the existing not-checked state.
- Added a source regression assertion for both API values and the localized template helper.
- Frontend presentation only; the owner-only API authorization and read-only operational check are unchanged. Test authored / **NOT RUN**.


## Payment method labels localized — 2026-11-07

- Payment list previously displayed controlled API method codes (`cash`, `bank_transfer`, `card`, `wallet`, `other`) verbatim, even though the create form already offered Arabic/English labels. The list now reuses localized labels, and local search matches the localized method name.
- Added Arabic search regression coverage for `تحويل بنكي` and a source/template assertion for the method label.
- No payment/collection/allocation semantics or API payload values changed; only display/search labels changed. Test authored / **NOT RUN**.


## Expense category labels localized — 2026-11-07

- Expense category values are selected from a fixed bilingual option set, but saved expense rows displayed the stored English code in Arabic mode. The row now displays the matching Arabic/English label and local search includes that label.
- Added Arabic search regression coverage for `نقل ومواصلات` and a source/template assertion for category label usage.
- Stored category values and expense semantics remain unchanged. Test authored / **NOT RUN**.

## Nested-surface inventory reconciliation — 2026-11-07

- Updated the existing Payments/Expenses, Purchasing/Notifications and Reports/Operational Health rows to reflect the new bilingual labels and search behavior; did not create duplicate tracker rows.
- Payment methods and expense categories remain presentation labels over unchanged stored values. Purchase-order, notification and operational-health labels map only to backend-supported status enums.
- Mobile keyboard regression now asserts visual viewport bounds. All browser/device acceptance remains NOT RUN.


## Unknown status fallback preserved — 2026-11-07

- Localized Purchase Order, Notification and Operational Health labels now preserve a non-empty unknown backend status string instead of replacing it with a generic "Unknown status" label. This keeps newly introduced/legacy values visible while known values remain localized.
- Added source assertions for the unknown-value fallback. No status transition or backend behavior changed; tests authored / **NOT RUN**.


## Assistant source citation localization — 2026-11-07

- Assistant citations previously used Arabic-only "المصادر/فاتورة/مصروف" labels even in English mode, and displayed fixed expense category codes verbatim. The citation header/type labels are now bilingual and expense category names reuse the localized category helper.
- Backend source types are currently `invoice` and `expense`; unknown types remain visible as returned. No assistant response, citation membership or API behavior changed.
- Added source/template regression assertions. Test authored / **NOT RUN**.


## Home error ownership and notification-kind parity — 2026-11-07

- The shared workspace error banner is the sole owner of dashboard load failures and the retry action. The Home metrics panel no longer repeats the same alert; its empty state is gated on the absence of an error.
- Notification kind localization now covers the actual current form value `business` and retains `businesses` for legacy records.
- The in-app feature catalogue now documents the bilingual payment, expense, invoice, PO, notification and operational-health labels/search behavior. No release version was advanced; this remains an unreleased PR candidate.
- Source regression tests are authored / **NOT RUN**.


## Customer statement and platform audit label consistency — 2026-11-07

- Customer Statement event types now display bilingual labels for the three values emitted by the current backend route: `invoice_issued`, `payment_allocation`, and `currency_mismatch_allocation`. Unknown values remain visible unchanged.
- Workspace Activity Log and Platform Admin activity audit now share one bilingual action/target label helper; unknown action/target values remain visible unchanged.
- Updated the in-app guide and inventory rows. These are display-only changes; no audit event, customer statement balance, permission or API contract changed.
- Source/unit regressions are authored / **NOT RUN**.


## Customer Statement guide parity — 2026-11-07

- Updated the existing Customers feature-guide entry to describe bilingual Customer Statement event-type labels; no new feature or release version was introduced.
- Feature-guide regression authored / **NOT RUN**.


## Notification audit vocabulary completion — 2026-11-07

- Cross-checked the shared audit label map against backend AuditEvent writers and added the emitted `notification.queued` action and `notification` target labels.
- Unknown future action/target values remain visible unchanged. Tests authored / **NOT RUN**.


## Audit vocabulary cross-check — 2026-11-07

- Extended shared bilingual audit labels after comparing all current backend AuditEvent writer literals across operations, extended/core features, platform admin and employee/payroll APIs.
- Added membership role/removal, employee, payroll lifecycle, platform workspace activation/deactivation, and their target types. Unknown future codes still fall back to raw values.
- Tests authored / **NOT RUN**; no backend changes.


## Platform role audit label consistency — 2026-11-07

- The dedicated Platform Admin role-grant/revocation history now uses the same shared bilingual action map as workspace and platform activity audit.
- Added exhaustive helper assertions for every current backend AuditEvent and PlatformAdminAuditEvent action/target value. Unknown future values continue to fall back to raw text.
- Tests authored / **NOT RUN**.


## Workspace membership audit target label — 2026-11-07

- Backend source confirms membership role changes/removals emit `target_type=business_membership`; added the exact bilingual target label while retaining the generic membership alias.
- Exhaustive audit target test now covers the emitted target value. Tests **NOT RUN**.


## Initial-bundle optimization — 2026-11-07

- Firebase App/Auth runtime imports are dynamic and occur after runtime config validation; the SDK promise is cached and resets on load failure.
- `EmployeePayrollComponent` is standalone, imported directly from its component file, and referenced once inside the OWNER-only `@defer` block with placeholder/loading states. `employee-payroll-ui.spec.ts` now guards this boundary; the test is authored / **NOT RUN**.
- The source-level lazy boundaries are not proof of emitted chunks. Exact initial bundle size, payroll chunk extraction and budget status remain **NOT VERIFIED** until Angular build and bundle analysis run.


## Fail-closed navigation after membership refresh — 2026-11-07

- The interactive workspace-switch path already redirected an active destination when the refreshed role no longer allowed it; the asynchronous `loadBusinesses()` membership refresh path did not apply that same guard.
- After resolving the refreshed workspace role, the shell now revalidates the active tab through the existing `canAccessTab` / `setTab('overview')` policy before loading workspace data. This also closes the mobile More surface through the existing `setTab` behavior.
- Added source regression coverage for ordering relative to role assignment and workspace-data reset. No authorization rule or backend contract changed; server authorization remains authoritative.
- Test authored / **NOT RUN**; browser role-transition acceptance remains NOT RUN.

## Phase 2 — shared interaction foundation (code-level implementation start) — 2026-11-07

- Reused the existing semantic token layer; added --aba-control-height (44px), --aba-control-radius (10px) and --aba-control-padding-inline (12px).
- Added shared high-specificity presentation rules for shell buttons, primary/secondary states, text fields/selects/textareas, card-like surfaces, table headers/hover and Windows forced-colors focus indicators.
- Kept the existing mobile 16px form-control font rule so the redesign does not reintroduce mobile browser zoom.
- Regression coverage added to design-tokens.spec.ts. Static source checks: token uniqueness, required token presence, CSS brace balance and expected selector/test presence PASS. Automated tests, Angular build, browser/RTL/LTR rendering and accessibility/device acceptance NOT RUN.
- Source checkpoint: 44e913fd4dee773fda5b7d53b2ed83aa0968be3e; branch master/t18-uiux-hardening-20261107; PR #348 OPEN / DRAFT / UNMERGED.
- Figma Variables, component library and visual/structural review remain NOT RUN/BLOCKED by current View-only access. This is not Figma Phase 2 acceptance.
- Provider note: CircleCI and non-authoritative GitHub Actions automation started after the two source commits; no manual CI trigger/retry was issued. Read the exact-SHA results before relying on them. Follow-up documentation commits use [skip ci].
- No backend/API/database/schema/migration, business/financial/payroll/stock semantics, production data, merge or production deployment changes.

## Platform-admin capability revocation with no workspace memberships — 2026-11-07

- The no-membership branch of `loadBusinesses()` preserves Platform Admin for authorized administrators. It now explicitly returns to Overview when the refreshed platform-admin capability is absent, rather than retaining a previously active admin tab.
- Added source regression coverage for the authorized-admin and revoked-capability branches. The actual Platform Admin component remains capability-gated; this is a navigation-state fail-closed correction, not a new access rule.
- Test authored / **NOT RUN**; authenticated platform-admin revocation/browser acceptance remains NOT RUN.

## Phase 2 — latest code-level UX checkpoint — 2026-11-07

- The shared design-system layer now covers control dimensions, primary/secondary/destructive states, form controls, card/table surfaces, page/section headings, inline filters, notices, assistant messages and suggestion cards. Focus indicators include a forced-colors fallback; mobile input sizing remains 16px.
- Latest source checkpoint: 295ea51d9355e9fb5399398af04eb924dc1fb564 on master/t18-uiux-hardening-20261107; PR #348 OPEN / DRAFT / UNMERGED; 88 ahead / 0 behind main.
- Static source review: 96 unique tokens; balanced CSS braces/parentheses; all 13 audited text pairs >= 4.5:1 and focus pairs >= 4.82:1. Automated tests, Angular build, browser, rendered RTL/LTR and assistive technology remain NOT RUN.
- Current exact head has zero combined status contexts and GitGuardian SUCCESS only. Earlier CircleCI on 44e913f had two failures (frontend unit tests and browser smoke) and four substantive successes; root cause UNKNOWN because job output is inaccessible. Historical results do not validate this head.
- No preview deployment, merge, production deployment, backend/API/database/schema/migration, financial/payroll/stock semantics or production data changes.

## No-membership navigation uses the shared tab handler — 2026-11-07

- Both authorized Platform Admin and revoked-capability Overview destinations now route through `setTab()`. This keeps active-state cleanup, More-menu dismissal and shared navigation behavior consistent when a refreshed account has no workspace memberships.
- Added a source regression assertion that both branches use `setTab()` and the shared handler closes More. Test authored / **NOT RUN**.

## T18 shared presentation continuation — exact head 136b65a — 2026-11-07

- Added semantic styling for auth/setup cards, invoice disclosure/line rows, aging buckets, CSV import surfaces/errors, warning notices, helper/footnote contrast, install actions and reduced-motion behavior.
- Existing semantic token names/values are preserved; total is now 96 unique tokens (93 existing + 3 control tokens). 16 source test declarations cover the added styles. Tests/build/browser rendering remain NOT RUN.
- Static source checks pass for token uniqueness, CSS brace/parenthesis balance, expected selectors and selected contrast pairs. No rendered RTL/LTR or screen-reader acceptance is implied.
- Current branch/PR: master/t18-uiux-hardening-20261107 / #348 OPEN / DRAFT / UNMERGED; exact head 136b65a09b84bc3176a80a1f18bffffa8e22b94f.
- **Phase-gate clarification:** the user's instruction authorizes this bounded T18 code-level implementation only. It does not mark the UX workstream's formal Phase 1 gate accepted or Phase 2/3 completed/started. Figma Variables/component library, high-fidelity screens/prototype and visual/usability sign-off remain NOT RUN/BLOCKED by View-only access and missing rendered acceptance.
- Exact-head aggregate status has zero contexts; GitGuardian SUCCESS only. No CircleCI trigger/retry, preview deployment, merge or production deployment.

## T18 — shared component sizing and semantic color readback — 2026-11-07

- Source review verified 97 unique design tokens and no unresolved token references across global styles, shared UI components and the confirmation dialog.
- Generic explanatory notices and install-help guidance use informational blue tokens; warning notices remain amber; install CTA remains success-accented; destructive controls remain danger-styled.
- Confirmation dialog now uses defined warning/danger text tokens and exposes a system-color focus outline for the dialog container in forced-colors mode.
- Global action-button normalization excludes the shared quick-access card so its intended 104px minimum height and card radius are not overridden.
- Source regression inventory: 19 declarations in design-tokens.spec.ts and 3 in confirmation-dialog.spec.ts. Tests are authored / NOT RUN; build and rendered checks remain NOT RUN.
- Source implementation commits: `766b2d77ddd43bd1565f5f1c3854d4ef85cba56c`, `282ef1f84847b696143838c0227b33b72a697729`, `6d62e0daa544cbf69d0ba2b5b3dd7f76e87da0ee`. Existing PR #348 remains OPEN / DRAFT / UNMERGED.


## Latest section-header responsive refinement — 2026-11-07 — `290c3d56fc285719b3ae4a4ef4bf47c35a8b2e86`

- Source review identified a narrow-screen layout risk: section heading copy and projected actions shared one horizontal flex row, so long localized/dynamic titles could compete with counts or action buttons for width.
- The shared component now wraps long h2/h3 titles and switches to a single-column layout at 600px and below. Projected actions occupy a full-width row aligned to the logical start, preserving RTL/LTR behavior; tablet/desktop layout is unchanged.
- Added a focused source regression declaration in `frontend/src/app/design-tokens.spec.ts`.
- Test declaration is authored / **NOT RUN**. No rendered screenshot or browser/device acceptance is claimed.


## Latest keyboard-accessible table refinement — 2026-11-07 — `8df911cfbd477261167d3bde28b4f8bd5f0ba8b5`

- Workspace Activity Log, Customer Statement, and Platform Admin data-table scroll containers now expose localized accessible region names and `tabindex="0"`, allowing keyboard users to focus and horizontally scroll wide tables.
- Global focus styling covers the table regions and retains a Windows forced-colors system outline.
- Added source regression assertions across both workspace and Platform Admin templates, plus a design-token focus regression.
- Tests are authored / **NOT RUN**; screen-reader, keyboard-browser and physical-device acceptance remain **NOT RUN**.


## AI conversation history keyboard access — 2026-11-07 — `657cce352b25f168ae4d0747674296144f107b74`

- The bounded chat history now exposes `role="log"`, a localized accessible name and keyboard focus, so users can scroll long conversations without relying on pointer/touch input.
- Shared focus styling covers normal and forced-colors modes. Automated source regression declarations were added; execution and screen-reader verification remain **NOT RUN**.


## T18 App Shell semantic color consolidation — 2026-11-07 — `dba869fb6970ecf85839081f11ff86dbe507adf3`

- Centralized 64 repeated hard-coded App Shell color declarations onto the existing design tokens while retaining fallback colors and visual values.
- Regression coverage verifies token usage and absence of the targeted repeated raw colors. The design-token source suite now has 22 test declarations.
- 97 token definitions remain unique; the only App Shell token reference not defined in the global stylesheet is `--aba-keyboard-inset`, which is assigned dynamically by the keyboard viewport handler.
- Source-only verification; Node tests/build/browser/rendered acceptance remain NOT RUN.


## T18 mobile navigation dock semantic token alignment — 2026-11-07

- The mobile dock now reuses shared navigation border, glass-surface, text and accent tokens; fallback colors preserve its existing palette.
- Regression coverage checks the dock's semantic declarations. Source-only; rendered responsive and RTL/LTR acceptance remains NOT RUN.


## T18 feature-surface token alignment — 2026-11-07

- Platform Admin's local design variables now reference the shared semantic token system, including surface-soft and focus-ring tokens. Its permission domain remains separate.
- Employee & Payroll component-local styling now uses shared surface, control, typography and status tokens; action targets use the shared 44px control height. No payroll business or privacy behavior changed.
- Source tests: Platform Admin 2, Employee/Payroll 10. Authored / NOT RUN; browser, keyboard and assistive-technology acceptance remains NOT RUN.


## T18 status notice semantics and feature mobile headings — 2026-11-07

- Generic notices use informational styling; explicit success, error/danger and warning variants retain their semantic tokens across App Shell, Platform Admin and Payroll.
- Employee/Payroll and Platform Admin custom section headers now stack actions and counts below 600px to protect long localized titles.
- Source test declarations: App Shell 23, Platform Admin 4, Employee/Payroll 11. Authored / NOT RUN; rendered RTL/LTR, keyboard and assistive-technology acceptance remains NOT RUN.


## T18 Platform Admin status palette consolidation — 2026-11-07

- Platform Admin status chips, runtime health, notices, caution/data-note surfaces and read-only/empty-state accents now use shared semantic status tokens.
- Platform Admin design-token suite has 5 source test declarations. Tests and rendered acceptance remain NOT RUN.


## T18 empty vs filtered states — 2026-11-07

- Platform Admin user and workspace directories distinguish empty directories, filter misses and out-of-range pages; Payroll distinguishes an empty employee directory from a search miss.
- Regression declarations: Platform Admin user management 8, Employee/Payroll 12, App Shell design tokens 23. Authored / NOT RUN.


## T18 Mobile Hybrid Modern app header — 2026-11-07 — `4bd5585df6d7ddbfdf543d677122ec4dd48823ab`

- Implemented the accepted mobile-only Hybrid Modern top-section direction as a small standalone `AbaMobileAppHeaderComponent`, rather than expanding the root AppComponent template or attempting a broad AppShell refactor.
- Header displays the app mark/name, generated UI version from `APP_BUILD_INFO`, current workspace name, existing workspace selector when more than one workspace is available, current page title, and a concise greeting only on Home.
- Notification and AI shortcuts route to the existing tabs. The account avatar opens a keyboard-dismissible account-options group that reuses the existing language-toggle and sign-out actions. The current `NotificationRecord` contract has no read/unread field; no unread badge/count is fabricated.
- The old mobile page heading and workspace bar are replaced on mobile only. Desktop topbar/workspace bar, lower dashboard, KPI cards, bottom navigation, route/permission/API behavior and data semantics remain unchanged. The install CTA remains outside the component and the header reserves space to avoid overlap.
- Focused source regression file: `frontend/src/app/mobile-app-header.spec.ts`; included by the existing `node --experimental-strip-types --test src/app/*.spec.ts` script glob. Test is authored / **NOT RUN**.
- Rendered 360/390/412px RTL/LTR, safe-area, profile menu interaction, workspace-switch runtime, keyboard/screen-reader and screenshot comparison remain **NOT RUN**. No Figma artifact was created.
- No API/backend/database/schema/migration, business/financial/payroll/stock semantics or permission changes. No CI trigger/retry, merge, preview or production deployment.


## T18 Home / Overview dashboard hierarchy and metric-basis refinement — 2026-11-07 — `9e41a9468721fca0f34614a62ab6ffb80704c209`

- Replaced the large decorative dark Home hero with a compact neutral period strip showing the backend-returned start date, end date and business timezone. The label reflects the existing backend default of the last 30 business-local calendar days; no client-generated date range or new period selector was introduced.
- Preserved all four verified API metric groups: invoiced sales, collected payments, expenses and outstanding balances. Each currency remains a separate row. Added the exact source-time basis to the first three metrics and retained the recorded-allocation basis for outstanding balances; no outstanding count is fabricated.
- Strengthened the trust caveat: issued invoice value is not collected payments; each metric uses its own timestamp basis; currencies are not combined; the dashboard is not net profit while cost data may be incomplete.
- Updated the Home page identity to “الرئيسية” / “Overview”. Added non-data loading skeletons while preserving the accessible loading message and existing empty/error behavior. Existing quick access and all-module directory remain unchanged.
- Explicitly omitted attention/pending-work, trend, receivables-aging and recent-activity panels because the current Dashboard response does not return those sources.
- Shared metric card now styles projected amounts, currency-safe wrapping, tabular numerals and the supporting source-basis note.
- Regression file: `frontend/src/app/home-dashboard.spec.ts` (7 source-test declarations), included by the existing top-level Node test glob. Authored / **NOT RUN**.
- Source readback assertions: 15/15 PASS. This is not Node test execution, Angular compilation or rendered acceptance.
- No backend/API/database/schema/migration, authorization, financial, currency, payroll or stock semantics changed. No CI trigger/retry, merge, preview or production deployment.
- Remaining: rendered desktop/tablet/mobile RTL/LTR, multi-currency long values, real OWNER/STAFF and tenant journeys, keyboard/screen-reader, 200% zoom and physical Android/PWA acceptance remain **NOT RUN**.

- Follow-up source corrections: each KPI now has a visible localized label in the dedicated `metricLabel` projection, with values/counts/basis notes kept in the value projection; empty currency groups use a neutral dash rather than an unqualified monetary zero; business-local start/end dates are explicitly LTR-isolated. Home source test declarations: 11; broad static source readback: 27/27 PASS on `9e41a9468721fca0f34614a62ab6ffb80704c209`. Runtime test/build/browser acceptance remains NOT RUN.


## Mobile account-menu keyboard dismissal — 2026-11-07

- The mobile account popover closes when keyboard focus moves outside both its trigger and its content, complementing the existing Escape and outside-pointer behavior.
- Tab-out does not force focus back to the trigger; the next focused control remains active. Escape continues to restore focus to the trigger.
- Regression file: `frontend/src/app/mobile-app-header.spec.ts` (10 source-test declarations), authored / **NOT RUN**.
- Rendered keyboard, screen-reader, browser and physical-device acceptance remain **NOT RUN**.


## Mobile account-menu keyboard dismissal — regression matcher correction — 2026-11-07

- The source regression now checks the exact `document:focusin` HostListener via a literal source string and locates the handler using the actual newline boundary.
- Focused static source readback: 6/6 assertions PASS; authored Node test execution remains **NOT RUN**.

## AI Assistant UX transformation baseline — 2026-11-10

- **Source baseline:** current deployed/main UI is based on `main@e018c56640cc63573cdaec590fa5018148d5f662`. Source readback covered `frontend/src/app/app.component.ts`, `frontend/src/app/api.service.ts`, and `backend/app/assistant_api.py`.
- **Current interaction contract:** the chat is rendered inline in the root Angular shell. `sendChat()` sends one authenticated, workspace-scoped JSON request through `ApiService.chat()` to `POST /api/v1/businesses/{business_id}/assistant/chat`; the response is a `ChatReply` containing `answer`, `sources`, and optional `mode`. This is request/response, not streaming.
- **Existing safeguards to preserve:** the request is fenced by workspace ID, authenticated UID, role and signed-in state; only the last eight messages are sent; stale responses clear chat state; failures restore the draft and expose retry; the UI discloses the limited local fallback mode and source records.
- **Current UX limits confirmed by source:** messages are held in component memory (no persistent/searchable conversation history); messages render as plain text paragraphs; there are no message-level copy/regenerate actions or attachment controls. The current `ChatInput` contract accepts only `message` and `history`; there is no file/attachment contract or streaming response type.
- **Do not simulate missing capabilities:** streaming, attachments, persistent/searchable history, and structured Markdown/table/chart rendering must not be represented as working until supported by an approved API/product contract. Frontend-only fake upload/streaming controls are out of scope.
- **Shared-path ownership boundary:** the chat template, composer and its responsive keyboard styles live in `frontend/src/app/app.component.ts`; global foundation styles live in `frontend/src/styles.css`. Active PR #363 currently changes both paths for the invoice editor. The Master UI/UX branch deliberately avoids those shared files until PR #363 is reconciled; no overlapping edits were made.
- **Next chat UX slice:** after the shared-path writer boundary is clear, improve the existing request/response composer, message hierarchy/actions and long-response presentation without changing the API contract; keep streaming, file upload and durable history explicitly deferred.
- **Long-response E2E source coverage:** the mocked mobile-chat journey now returns a multi-paragraph Arabic answer and asserts that the transcript becomes vertically scrollable without horizontal overflow, then scrolls to the final paragraph. This is authored test coverage only; Playwright execution remains NOT RUN.
- **Chat retry/state E2E source coverage:** the mocked OWNER journey sends a 1,742-character Arabic prompt (within the 2,000-character limit) and checks failed-draft restoration, initial empty/status and transcript live-region semantics, loading/status announcement, disabled send during an in-flight request, error/alert semantics, no fake assistant error message, and successful retry. Long Arabic response scrolling remains covered. This is source coverage only until Playwright runs.
- **Mobile navigation E2E source coverage:** the mocked OWNER journey asserts the accepted four-slot dock and >=44px targets, main-content clearance below the dock, and More's five non-empty work-area groups, bounded internal scrolling/overscroll containment, expanded/controls semantics, Escape-to-close and focus restoration in both RTL and LTR. This remains source-only until Playwright runs.
- **Acceptance still NOT RUN:** rendered 360/390/430px and tablet/desktop checks, Arabic RTL/English LTR, long-response behavior, Android keyboard/visual viewport, screen-reader/keyboard/200% zoom, and physical installed-PWA behavior. Source inspection is not rendered/device acceptance.
- **Scope:** source-level UX baseline only; no chat API/backend/database, auth, tenant, AI-provider or business-rule changes.

## Platform Admin mobile usability refinement — 2026-11-10

- The separate Platform Admin surface now keeps navigation, action buttons, pagination controls and form controls at a minimum 44px touch height on mobile; section navigation rises to 46px at narrow widths.
- Mobile filter labels, dashboard metric labels/supporting copy, notices and compact-table text use larger minimum typography while preserving the existing table layout and permission/domain boundaries.
- Added source-level regression assertions in `frontend/src/app/shared-ui-responsive.spec.ts` for touch-target and mobile typography rules.
- This is a visual/accessibility-only change. No platform permissions, APIs, business data, role rules or administrative actions changed.
- Test execution, rendered RTL/LTR review, keyboard/screen-reader acceptance and physical Android/PWA checks remain NOT RUN pending exact-head CI and browser/device access.

## Release Guide mobile disclosure refinement — 2026-11-10

- Feature-group and version-history disclosure rows now provide a 52px minimum touch target, a clear down-chevron affordance, and a subtle surface highlight while expanded.
- The disclosure indicator rotates on open and disables its transition under reduced-motion preferences. Native `details/summary` behavior, content, bilingual copy and feature availability remain unchanged.
- Added source-level regression assertions for touch sizing, open-state styling, chevron affordance and reduced-motion behavior.
- Visual-only change; no API, data, permission, route or business behavior changed. Node test execution and rendered mobile/RTL/LTR/keyboard acceptance remain **NOT RUN**.

## Platform Admin compact-summary readability correction — 2026-11-10

- Source review found the narrow-screen compact invoice summary table was reduced to 10px by a later <=760px override, superseding the earlier 11px mobile rule.
- Raised the effective compact table cell typography to 11px with a 1.4 line height while retaining the four-column fixed layout and narrow-screen column proportions.
- Added a source regression assertion for the effective <=760px rule and mocked Playwright checks at 360/390/430px for computed cell font size and no horizontal page overflow.
- Presentation and test-fixture changes only. No platform permission, API, data, financial, or administrative behavior changed.
- Node tests, Playwright, Angular build, rendered RTL/LTR, keyboard/screen-reader and physical Android/PWA checks remain NOT RUN until an approved runner and device environment are available.


## T18 shared-component polish and 19-destination source review — 2026-11-11

**Review basis:** current `main@405cceb5b36ae972c2979cb2aa7a540c4aecd0eb` and the same T18 branch after its merge-sync. This is a source-level review of every destination in `WORKSPACE_MODULE_CATALOG`; it is not a rendered visual sign-off for all routes. The Production login page was separately inspected at 360×800, 390×844 and 1280×800 in Arabic, plus English at 360×800: no horizontal overflow and all form controls are visible with 44px minimum targets. A follow-up live inspection on 2026-11-12 measured the document at exactly the viewport size (390×844 RTL/LTR and 1280×800 RTL); the card is vertically centered with balanced whitespace and no scrollable overflow. The earlier note describing an unnecessary vertical scrollbar is not reproduced and is withdrawn. The owner of `app.component.ts` and `styles.css` was PR #363; its presentation ownership is now part of merged main.

| Destination | Screen-by-screen source review | T18 action / ownership boundary |
|---|---|---|
| Overview / Home | Four currency-separated source-backed KPIs, date/timezone basis, role-filtered shortcuts, full 19-destination disclosure and retryable workspace error state are preserved. | Shared KPI/quick-access/header typography and computed-size E2E coverage; root dashboard template/global shell remain PR #363-owned. |
| Customers | Customer list/search, CSV preview-before-import, workspace reset and customer statement are present; wide statement table has keyboard-scroll semantics. | Shared headers/state feedback only; CSV and statement workflow semantics unchanged. |
| Products & inventory | Product list/search, CSV preview-before-import and OWNER-only positive opening-stock input with STAFF zero payload are preserved. | Shared headers/state feedback only; stock permissions and payload unchanged. |
| Invoices | Draft editor, validation/summary, issued-invoice lifecycle, print and void-confirmation paths remain separate. | PR #363 owns app shell, invoice editor/draft flow and shared global CSS; no edits to those paths. |
| Payments & collections | Localized payment-method labels/search and payment outcome messaging remain distinct from invoice totals. | Shared section/state surfaces only; allocation and payment semantics unchanged. |
| Expenses | Localized fixed expense categories/search and uncertain-save outcome guidance remain in place. | Shared state/header styling only; no expense classification or posting changes. |
| Employees & payroll | Lazy-loaded OWNER route and privacy-safe employee labels remain the documented boundary. | Chat 4 / T41 single-writer ownership; no payroll source changes. |
| AI assistant | Request/response contract, tenant/role fencing, retry-draft behavior, plain-text history and source references remain unchanged; no streaming/upload capability is implied. | Composer/root shell is PR #363-owned; existing mocked mobile journey gains typography assertions only. |
| Reports / operating result | Preliminary revenue/expense basis and limitation that COGS is not deducted remain visible. | Shared section/state surfaces only; no new metrics or profit claims. |
| Tax summary | Read-only saved invoice tax summary remains currency-separated. | Shared presentation only; no tax rules/calculations changed. |
| Activity log | Read-only event view and keyboard-focusable horizontally scrollable table contract remain. | Shared headings and mobile type scale only; event vocabulary/data unchanged. |
| Data integrity | Read-only legacy-link/allocation mismatch review remains separate from normal operations. | Shared state/notice styling only; no repair or mutation action introduced. |
| App guide / Release Guide | Native `details/summary` disclosure, 52px rows, chevron, open state and reduced-motion behavior remain. | Improve footnote and version/status badge readability; guide content/availability unchanged. |
| Platform Admin | Separate platform permission domain, role-grant/revocation and audit workflows remain isolated; compact four-column summary remains horizontally contained. | Improve functional-label, status-chip, data-note and metadata readability; no roles, permissions or admin actions changed. |
| Suppliers | Workspace-scoped supplier directory and local visible-field search remain. | Shared headings and type hierarchy only; no AP/bill semantics added. |
| Purchasing | Purchase-order states and OWNER-only eligible receiving remain; receiving is not represented as supplier payment. | Shared confirmation/header presentation only; no stock/payment lifecycle changes. |
| Recurring invoices | Scheduling metadata remains distinct from automatic invoice generation. | Shared headings/state presentation only; no scheduler or issue capability implied. |
| Notifications | Notification records/status remain metadata-only; delivery provider/worker requirement remains explicit. | Shared headings/state presentation only; no sent/delivered claim or retry action added. |
| Operational health | Read-only health/configuration check and localized status mapping remain. | Shared state/header presentation only; no new health signals or false-green state. |

### Shared component disposition

- **Keep as-is after review:** `AbaCard` spacing/surface tokens, KPI card's 12px inherited projected-copy token, state-message alert/status semantics, and the confirmation dialog's safe-area-aware mobile bottom sheet / 48px actions / narrow-screen stacking.
- **Polish in this batch:** mobile header context labels/workspace selector/shortcut type; quick-access descriptions; section-count badges; Platform Admin explanatory copy/status metadata; Release Guide footnote/version badge.
- **Regression budget:** extend the existing shared source spec and the existing mocked mobile Home viewport journey. Run the authoritative six-job exact-SHA workflow once at batch close; do not repeat unchanged checks.
- **Acceptance boundary:** source and mocked Playwright are not a substitute for authenticated OWNER/STAFF/two-tenant rendered review, full route-by-route RTL/LTR screenshots, screen-reader/keyboard/200% zoom, or physical Android installed-PWA acceptance. Those remain open until an authenticated isolated test path/device is available.


## T18 shared-component polish continuation — 2026-11-11

- **Candidate:** PR #378, branch `master/t18-mobile-ux-accessibility-20261111`; this batch extends the same mobile-first UX workstream and does not create a duplicate task or branch.
- **Mobile app header:** the current-workspace label and name use a clearer mobile type hierarchy without repeating the app-version chrome already present elsewhere. The workspace selector, workspace name source, navigation actions and membership switching behavior are unchanged.
- **Module directory cards:** mobile descriptions reserve a consistent two-line rhythm; pressed-state feedback is added for touch, with transforms disabled under reduced-motion preferences.
- **Section count badges:** projected `.count` labels receive a neutral, tabular-numeric treatment and wrap safely without hiding counts.
- **Platform Admin:** mobile metadata/data-note copy is raised to 12px with readable line-height; compact table cells remain 11px to preserve the existing four-column summary layout.
- **Release Guide:** UI-version/current-version badges wrap safely at narrow widths; footnote copy is raised to 13px with a 1.65 line-height. Native `details/summary` behavior and guide content remain unchanged.
- **Regression coverage:** `frontend/src/app/shared-ui-responsive.spec.ts` covers mobile workspace-context typography, module-card interaction/reduced motion, section-count styling, Platform Admin metadata and Release Guide text sizing.
- **Boundary:** presentation and regression coverage only. The only `app.component.ts` change is the tablet workspace-bar CSS rule described below; no `styles.css`, API/backend, auth/authorization, tenant isolation, DB/schema/migration, invoice/payment, financial, inventory, payroll or external-message behavior changes.
- **Validation:** pending on the resulting exact head. Prior exact-head CI on the parent SHA is not evidence for this new candidate. Authenticated all-role/two-tenant rendered review, full 19-destination RTL/LTR screenshot acceptance, screen reader, 200% zoom and physical Android installed-PWA remain NOT RUN.


## Tablet workspace header correction — 2026-11-11

- The exact-run 768px RTL screenshot exposed a real layout issue: the desktop three-column workspace bar left too little width for the current business name, wrapping it into a narrow vertical stack.
- Added a tablet-only `max-width:900px` two-column layout: current business and selector remain side by side, while release/build metadata moves to a full-width secondary row. The existing `max-width:760px` mobile single-column override remains later in the cascade and is unchanged.
- Added a source regression assertion for the tablet two-column rule and its ordering before the mobile override. The next exact-head browser artifact must be visually checked at 768px RTL/LTR.
- Presentation only; no workspace selection, business identity, version source, route or permission behavior changed.


## T18 shared mobile/tablet batch verification — 2026-11-11

- **Verified candidate:** `44b6c2a8bf7ec245ffaba6257ef26db91a0929ec`, PR #378, base `main@72a067149562af495d54e35f1a490b218117f333`; branch is 10 commits ahead / 0 behind at this checkpoint.
- **Exact-head CI:** GitHub Actions run [43005416300](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/43005416300) completed with all six substantive jobs and required `all-checks-passed` SUCCESS. Frontend unit suite: 413 passed / 0 failed / 0 skipped. Browser smoke: 21 passed / 0 failed / 0 skipped / 0 errors. Production build, dependency audit, backend accounting and backend container all passed; authenticated API smoke was SKIPPED because this is a frontend-only candidate.
- **Artifact review:** inspected exact-run 320px RTL and 768px RTL/LTR screenshots plus the 320px dock-clearance end state. The tablet fix keeps the current business name and selector readable side by side and places release metadata on a separate row. The 320px page retains an end-of-content runway above the fixed dock.
- **Scope review:** presentation, source regression and documentation only. No API/backend, auth/authorization, tenant, DB/schema/migration, financial/accounting, invoice/payment, inventory, payroll or external-message semantics changed.
- **Still NOT RUN:** full rendered audit of all 19 destinations; authenticated OWNER/STAFF/two-tenant route walkthrough; screen-reader and full keyboard-only acceptance across routes; high-contrast/200% zoom; physical Android Chrome and installed-PWA acceptance.
- **Disposition:** PR remains OPEN / DRAFT / UNMERGED. Active Copilot code-review ruleset remains a merge gate. No merge, production deployment or database mutation.
- **Next:** record the documentation-closeout exact-head run, then leave the PR draft until the outstanding route/device/accessibility acceptance and review gate are satisfied.


## Maintainer review correction — shared count badge coverage — 2026-11-11

- The shared section header has two count forms: its own `.aba-section-header__count` input and projected `.count` labels supplied by workspace pages. The neutral global badge treatment now targets both forms, rather than only one of them.
- Strengthened `shared-ui-responsive.spec.ts` to assert the component-owned count class, the projected `.count` usage in the workspace template, and the combined CSS selector.
- This is a CSS targeting/test-quality correction only; count values, component markup, business behavior and accessibility semantics are unchanged.
- Exact-head CI is pending for the resulting correction commit; previous PASS evidence is not reused as final-head evidence.


## Documentation consistency correction — 2026-11-11

- Clarified the shared-component batch boundary: `app.component.ts` is changed only for the tablet workspace-bar responsive CSS rule documented in the preceding section. No application state, route, navigation, workspace-switching or business logic is changed.


## 390px English mobile page-title wrapping correction — 2026-11-12

- The exact-head artifact review for PR #384 identified a minor layout defect on the Customers route at 390px in English: the final character of the page title wrapped to a second line beside the fixed mobile header actions.
- The shared mobile page-title size is now 16px through 420px viewport width. The brand, notification, profile and assistant control targets remain unchanged at 44px; larger viewports retain the existing fluid type scale.
- Added a focused CSS source regression and a single rendered Playwright assertion for the 390px English Customers header. The existing route sweep and screenshot matrix remain reused; no extra viewport sweep or new route was added.
- Presentation and regression coverage only. No API, authentication, tenant, database/schema/migration, business or financial behavior changed.
- This fix does not close physical Android/PWA, authenticated second-tenant, keyboard-only, screen-reader, high-contrast or 200% zoom acceptance.


## November Phase 1 — auth-shell rendered verification — 2026-11-12

- Live public login inspection at `https://ai-business-assistant-web.vercel.app/` found the auth card vertically centered at 390×844 RTL (x=15, y=134.7, w=360, h=574.6) and 1280×800 RTL (x=370, y=102.9, w=540, h=594.2). English 390×844 keeps the same geometry and switches alignment to LTR.
- At all inspected sizes, document/body dimensions matched the viewport, scrollWidth equaled clientWidth, scrollHeight equaled clientHeight, and forced scrolling left scrollY at 0. No vertical scrollbar exists; the space below the card is balanced centering, not an overflow defect.
- Added a focused Playwright guard to the existing mocked mobile OWNER journey for 360×800, 390×844, 1280×800 RTL and 390×844 LTR. It checks no horizontal/vertical document overflow and vertical centering. It does not submit real credentials or contact production identity/API services.
- No CSS/auth behavior change was justified by this evidence. The source-only route sweep already covers the 18 OWNER workspace destinations; Platform Admin remains a separate identity/surface. Physical Android/PWA, full keyboard/screen-reader, high-contrast/200% zoom and authenticated second-tenant acceptance remain separate open gates.


## November Phase 1 — HR mobile workspaces — 2026-11-12

- The Employees & Payroll destination is part of the 18 OWNER workspace destinations in the existing responsive route sweep. Its previous phone treatment only stacked forms and controls; it did not provide a mobile-first workflow.
- The mobile presentation is reorganized into three focused workspaces: Employees, Prepare pay, and Payroll history. The employee profile form is collapsed by default and opens on demand; editing an employee opens the directory/form, selecting Prepare payroll opens the preparation workspace, and saving a payroll draft returns the user to history.
- Desktop continues to show the existing full employee and payroll workflow. Mobile-only panes do not change API calls, permission checks, server-side net-pay calculation, separate-owner approval, one-time in-app payout recording, or the existing salary privacy boundary.
- The employee directory and payroll employee selector continue to omit base salary values. The Employees & Payroll destination remains owner-only.
- Added structural HR UI regressions and rendered Playwright checks for mobile navigation, pane switching, disclosure state, and RTL/LTR route rendering at the existing phone viewport matrix.
- **Exact-head validation:** GitHub Actions [run 43168710539](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/43168710539) SUCCESS on `0f0f6801deb969009c4e7ac39eec887888f19a9e`; frontend unit tests, production build, dependency audit, backend container, backend accounting, frontend browser smoke and `all-checks-passed` all PASS. Authenticated API smoke SKIPPED by workflow condition. Browser JUnit: 22/22 PASS, 0 failures/errors/skips.
- **Rendered route matrix:** all 18 OWNER workspace destinations were captured at 195/360/390/430/768/1280 CSS px in Arabic RTL and English LTR (216 route screenshots); Platform Admin Overview and Users & Access were separately captured at 360/390/430/768/1280px in both directions (20 screenshots). The 195×422 CSS viewport is a narrow-layout/200%-equivalent approximation for a 390×844 viewport, not actual browser zoom. No horizontal document overflow, route API/network failure, uncaught browser error or unresolved loading state was reported by the route sweep.
- **HR keyboard acceptance:** all three mobile section controls retain at least 44px height; keyboard-only Enter/Tab/Shift+Tab navigation reaches Employees, Prepare pay and Payroll history in natural DOM order; the employee form disclosure opens/closes with Enter and preserves `aria-expanded` state. The form remains collapsed by default.
- **Artifact:** [browser-smoke screenshots and JUnit](https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/43168710539/artifacts/13921421297). The 22/22 result includes mocked E2E flows; it does not prove live STAFF/API authorization or production behavior.
- **Remaining acceptance:** physical Android Chrome/installed-PWA install-update-offline; actual browser zoom at 200%; full-product keyboard-only walkthrough beyond the tested HR controls; screen-reader/NVDA/VoiceOver; high-contrast/forced-colors rendered acceptance; direct authenticated cross-tenant API denial; live STAFF journey (BLOCKED by the absence of a supported invitation/create-membership workflow). Authenticated API smoke was skipped. Phase 1 remains PARTIALLY COMPLETE.


## Platform Admin nested-surface accessibility follow-up — 2026-11-12

- **Destination accounting:** the 19-entry Home catalogue consists of 18 workspace destinations plus the separately permissioned Platform Admin destination. The OWNER workspace sweep remains 18 routes; Platform Admin is tested with its own platform-admin identity rather than being forced into the workspace-owner session.
- Expanded the mocked Platform Admin responsive route capture to all five internal surfaces: Overview, Workspaces, Audit activity, Users & access, and Permissions. Each surface is captured at 360, 390, 430, 768 and 1280 CSS px in both RTL and LTR (50 Platform Admin viewport captures; previously only Overview and Users were captured).
- Added a persistent polite live-region announcement when keyboard or pointer navigation changes the active admin section. Revocation of Users visibility also announces the safe fallback to Overview.
- Extended the Playwright keyboard path to Tab through and activate all five sections, checking the visible heading and matching announcement. This remains mocked browser evidence; it does not replace NVDA/VoiceOver or live platform-role verification.
- No Platform Admin permission rules, identity, membership, API, data mutation, financial behavior, or backend changes.
- Exact-head GitHub Actions validation is pending for the resulting branch candidate. Phase 1 remains PARTIALLY COMPLETE until manual screen-reader/high-contrast/actual-200%-zoom, physical Android/PWA and live role/tenant evidence is addressed.


## E2E locator follow-up — 2026-11-12

- Corrected the Arabic Permissions route selector to an exact accessible-name match after the expanded Platform Admin matrix showed the partial word also matches “Users & access”. The observed failure was strictly an E2E locator ambiguity; the UI and authorization behavior were not changed.
- New exact-head CI evidence is required before the candidate can proceed to merge.

- Keyboard-only Overview check now targets its actual in-section heading (Platform metrics / مؤشرات المنصة), not the page-level Admin center H1.

## Assistant conversation workspace — 2026-11-12

- Added a local **New chat** control that clears only the current in-memory conversation, draft, retry/error and copy-feedback state. It does not call an API or delete persisted business data.
- Added one-tap copy controls to assistant responses, with Arabic/English success/failure feedback. Clipboard access occurs only after an explicit user click; no message is copied automatically.
- The conversation log now scrolls to the latest user/assistant turn and uses immediate scrolling when the user prefers reduced motion.
- Preserved the existing fail-closed authenticated workspace context, backend-supplied citations, read-only assistant contract, last-eight-message context window, and restored draft on failed requests.
- Updated the bilingual in-app feature guide. No API, backend, database, authorization, tenant, financial or external-side-effect behavior changed.
- Automated tests, build, browser smoke and CI are intentionally deferred until the substantial November batch is assembled, per Owner test-economy direction. These new interactions are NOT YET TESTED.
