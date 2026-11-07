# T18 UI/UX Nested Surface Inventory

**Evidence baseline:** GitHub branch `master/t18-uiux-hardening-20261107`, source/test readback through `12a106d5ab40df7b02fba72112cf0966b9fb437c` (2026-11-07). This is source/test evidence, not a rendered product-acceptance claim.

## Implemented source surfaces and regression coverage

| Surface | Current source behavior | Existing regression evidence | Remaining acceptance |
|---|---|---|---|
| Keyboard-accessible data tables | Horizontally scrollable workspace and Platform Admin tables expose named regions, accept keyboard focus, and show a visible focus ring including forced-colors mode | `app.component-template-safety.spec.ts` named-region assertions; `design-tokens.spec.ts` focus/forced-colors assertions | Keyboard-only horizontal scroll, NVDA/VoiceOver announcements and rendered 360/390px acceptance |
| Mobile Hybrid Modern app header | Mobile-only compact brand/name and build-sourced UI version; current workspace name with the existing selector only when multiple workspaces exist; current page title and Home-only greeting; notification and assistant shortcuts; account menu reuses existing language/sign-out actions; semantic primary/info/surface/popover tokens; existing install CTA remains clear of the header | `mobile-app-header.spec.ts` source regressions for component bindings, version/workspace sources, route reuse, keyboard-dismissable account menu, RTL/overflow, notification-contract honesty and semantic-token usage | Rendered 360/390/412px RTL/LTR comparison; long workspace/page names; real workspace switch and stale-data fencing; profile menu keyboard/outside click; install prompt/help placement; safe-area and screen-reader verification. Unread badge intentionally omitted until the API exposes a read/unread field |
| Shared section headers | Shared h2/h3 hierarchy across Home and nested module sections; long Arabic/English titles wrap safely; narrow-screen layout stacks actions below heading copy and aligns them to the logical start | `design-tokens.spec.ts` shared section-header hierarchy and narrow-screen layout cases | Rendered 360/390px RTL/LTR, action wrapping and screen-reader heading navigation |
| Shared shell and mobile More | Central role-aware module registry; active secondary destinations; Escape/outside close; focus restoration; logical RTL/LTR positioning; refreshed membership/platform role revalidates the active tab before scoped data reload; Firebase App/Auth runtime SDK loads in a separate chunk after runtime-config validation | `module-access.spec.ts`, `mobile-navigation.spec.ts`, `app.component-template-safety.spec.ts`, `auth-lazy-loading.spec.ts` | Verify initial bundle budget after build; browser keyboard/screen-reader run; physical Android/PWA |
| Home / Overview Dashboard | Mobile Hybrid Modern top header; compact business-local 30-day period/date/timezone strip with a matching non-data period skeleton while KPIs load; four source-backed currency-separated metric groups with 12px minimum readable reporting/detail copy and a semantic level-two Business Summary heading with visible localized labels, aria-labelledby group names, each source timestamp/basis, LTR-isolated dates/amounts/counts and neutral dash placeholders when no currency group exists; neutral trust caveat; KPI loading skeletons; five role-filtered quick shortcuts (2 columns at 390/412px, 1 at 360px); native keyboard-accessible all-module disclosure collapsed by default | `home-dashboard.spec.ts` (15 source-test declarations), `workspace-module-catalog.spec.ts`, `app.component-template-safety.spec.ts` | Rendered desktop/tablet/360/390/412 RTL/LTR, real OWNER/STAFF and second-tenant visibility, period/date legibility, multi-currency wrapping, loading/empty/error and workspace-switch states, disclosure/quick-access keyboard behavior, screen-reader, zoom and touch-target acceptance |
| Customers CSV import | Preview is separate from execution; valid preview gates confirmation; workspace switch clears pending import; owner-only import actions | `app.component-template-safety.spec.ts` customer-import cases | Browser file picker, preview table overflow, focus and retry |
| Stock-tracked product creation | Workspace members can create products; only OWNER sees the positive opening-stock input. STAFF can still create a stock-tracked product with zero opening stock. The payload also defaults to zero for non-owners, and the value is cleared when workspace/role context changes. The backend remains authoritative and rejects positive opening stock for STAFF before product/stock/audit writes. | `app.component-template-safety.spec.ts` OWNER-only field/payload/reset regression; `mobile-chat.spec.ts` mocks a STAFF product creation and asserts `opening_quantity: 0` | Browser regression authored, NOT RUN; authenticated OWNER/STAFF request-denial and no-side-effect proof; physical mobile rendering |
| Products CSV import | Preview/validation before confirmation; confirmed import is not repeated after ambiguous refresh | `app.component-template-safety.spec.ts` product-import cases | Browser file picker and large-file behavior |
| Invoice line editor and totals preview | Dynamic line validation and estimated totals; draft creation distinct from issue; totals remain server-authoritative | `app.component-template-safety.spec.ts` invoice line/validation cases | Rendered mobile editing and long product names |
| Invoice print | Issued-invoice-only print action; escaped business/customer/invoice/line content; popup-blocked and detail errors surfaced | `invoice-print-preview.spec.ts` | Real browser popup/print rendering in RTL and LTR |
| Invoice void confirmation | Shared accessible dialog; OWNER guard; explicit void warning; no refund/credit-note implication; semantic warning/danger tokens; system-color focus fallback; focus return and uncertain-result protection | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF denial and rendered keyboard test |
| Purchase receipt confirmation | Shared dialog; OWNER-only; Receive available only for approved/partially_received orders with remaining quantity; Draft shows a bilingual explanation and no Receive control; line quantities reviewed; request/confirm re-check eligibility; uncertain result blocks unsafe retry | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Rendered OWNER draft/approved/partial states; authenticated OWNER/STAFF journey and no-side-effect evidence |
| Payments and expenses | Bilingual payment-method and fixed expense-category labels in rows and local search; search over visible receipt/expense details; separate no-match vs no-record state; search clears on workspace change | `record-filters.spec.ts` Arabic method/category cases, `app.component-template-safety.spec.ts` localized-label assertions, `workspace-data-access.spec.ts` | Authenticated data visibility and mobile list usability |
| Suppliers, purchase orders, recurring schedules, notifications | Local search over visible fields; purchase-order and notification status labels/search are bilingual; recurring/allocation state search uses exact state labels; localized empty/no-match states | `record-filters.spec.ts` Arabic status cases, `app.component-template-safety.spec.ts` localized status assertions | Large-list performance and rendered mobile behavior |
| AI assistant | Bilingual empty/loading/error/retry states; assistant source list localizes source heading/type and reuses expense category labels; conversation history is a named keyboard-focusable log region; source records remain those supplied by the backend | `mobile-chat.spec.ts`, `app.component-template-safety.spec.ts` bilingual source citation assertion | Authenticated tenant-scoped source correctness, keyboard/screen-reader and physical mobile acceptance |
| Employees and payroll | Lazy-loaded only on owner Employees route; component-local surfaces, controls, typography and success/warning/error/info states use the shared semantic tokens; action controls retain a 44px target; payout action explicitly records an in-app event and does not claim a bank transfer | `employee-payroll-ui.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF salary privacy and actual workflow |
| Release Guide and Platform Admin | Lazy-loaded only when selected; Platform Admin remains a separate permission domain and now maps its local surface/typography/focus variables onto the shared semantic token system; activity audit action/target labels use the shared bilingual vocabulary | `release-guide.spec.ts`, `platform-admin-user-management.spec.ts`, `audit-labels.spec.ts` | Authenticated platform-admin and workspace-role journeys |
| Reports, Tax, Customer Statement, Activity Log, Integrity, Operational Health | Source-level loading/error/empty/permission states and currency/basis limitations retained; Customer Statement event types and Operational Health status use bilingual labels | `app.component-template-safety.spec.ts`, `data-integrity-ui.spec.ts`, `release-guide.spec.ts` | Authenticated OWNER/STAFF/second-tenant journeys; report basis review |

## UX finding disposition

- **UX-01 contrast:** semantic tertiary text token and contrast regression coverage are present at source level; 64 repeated App Shell color declarations now reuse semantic tokens; info/success/danger/warning notice variants retain distinct semantic colors across App Shell, Platform Admin and Payroll; rendered screenshots remain NOT RUN.
- **UX-02 More-menu focus:** source-level outside close, Escape, focus restoration and RTL/LTR positioning are covered; assistive-technology acceptance remains NOT RUN.
- **UX-03 mobile viewport/keyboard:** NOT RUN; needs 360/390px browser and installed-PWA keyboard/safe-area evidence.
- **UX-04 authenticated journeys:** BLOCKED / NOT RUN; no approved isolated synthetic environment and identities are available.
- **UX-05 module count:** addressed in source by deriving the Home directory count from `homeModuleCards.length`; the catalogue has 19 destinations, while the visible count is role- and platform-admin-availability-dependent.
- **UX-06 duplicate version metadata:** do not change without rendered desktop/mobile evidence; NOT RUN.
- **UX-07 reduced motion:** global reduced-motion CSS and shared-component fallbacks exist; forced-colors focus fallback also includes the native disclosure summary; rendered OS/browser and assistive-technology verification remain NOT RUN.
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

- Firebase App/Auth runtime imports are now dynamic and occur after runtime config validation; the SDK promise is cached and resets on load failure.
- Initial-bundle reduction is a source-level intent only; exact output size and lazy chunk behavior remain **NOT VERIFIED** until Angular build and bundle analysis run.


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
