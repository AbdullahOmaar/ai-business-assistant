# T18 UI/UX Nested Surface Inventory

**Evidence baseline:** GitHub branch `master/t18-uiux-hardening-20261107`, source/test baseline refreshed after the opening-stock UX fix at commit `31d49daf7ff382a8cf065a9c11ed6eeebab83f54` (2026-11-07). This is source/test evidence, not a rendered product-acceptance claim.

## Implemented source surfaces and regression coverage

| Surface | Current source behavior | Existing regression evidence | Remaining acceptance |
|---|---|---|---|
| Shared shell and mobile More | Central role-aware module registry; active secondary destinations; Escape/outside close; focus restoration; logical RTL/LTR positioning | `module-access.spec.ts`, `mobile-navigation.spec.ts`, `app.component-template-safety.spec.ts` | Browser keyboard and screen-reader run; physical Android/PWA |
| Home | Five quick shortcuts plus the role-authorized directory over the 19-destination catalogue (actual visible count varies by workspace role and platform-admin availability); dashboard loading/error/empty states | `workspace-module-catalog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF rendered visibility |
| Customers CSV import | Preview is separate from execution; valid preview gates confirmation; workspace switch clears pending import; owner-only import actions | `app.component-template-safety.spec.ts` customer-import cases | Browser file picker, preview table overflow, focus and retry |
| Stock-tracked product creation | Workspace members can create products; only OWNER sees the positive opening-stock input. STAFF can still create a stock-tracked product with zero opening stock. The payload also defaults to zero for non-owners, and the value is cleared when workspace/role context changes. The backend remains authoritative and rejects positive opening stock for STAFF before product/stock/audit writes. | `app.component-template-safety.spec.ts` OWNER-only field/payload/reset regression; `mobile-chat.spec.ts` mocks a STAFF product creation and asserts `opening_quantity: 0` | Browser regression authored, NOT RUN; authenticated OWNER/STAFF request-denial and no-side-effect proof; physical mobile rendering |
| Products CSV import | Preview/validation before confirmation; confirmed import is not repeated after ambiguous refresh | `app.component-template-safety.spec.ts` product-import cases | Browser file picker and large-file behavior |
| Invoice line editor and totals preview | Dynamic line validation and estimated totals; draft creation distinct from issue; totals remain server-authoritative | `app.component-template-safety.spec.ts` invoice line/validation cases | Rendered mobile editing and long product names |
| Invoice print | Issued-invoice-only print action; escaped business/customer/invoice/line content; popup-blocked and detail errors surfaced | `invoice-print-preview.spec.ts` | Real browser popup/print rendering in RTL and LTR |
| Invoice void confirmation | Shared accessible dialog; OWNER guard; explicit void warning; no refund/credit-note implication; focus return and uncertain-result protection | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF denial and rendered keyboard test |
| Purchase receipt confirmation | Shared dialog; OWNER-only; Receive available only for approved/partially_received orders with remaining quantity; Draft shows a bilingual explanation and no Receive control; line quantities reviewed; request/confirm re-check eligibility; uncertain result blocks unsafe retry | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Rendered OWNER draft/approved/partial states; authenticated OWNER/STAFF journey and no-side-effect evidence |
| Payments and expenses | Local search over visible receipt/expense details; separate no-match vs no-record state; search clears on workspace change | `record-filters.spec.ts`, `workspace-data-access.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated data visibility and mobile list usability |
| Suppliers, purchase orders, recurring schedules, notifications | Local search over visible fields; localized empty/no-match states; allocation/active-state search uses exact state labels | `record-filters.spec.ts`, `app.component-template-safety.spec.ts` | Large-list performance and rendered mobile behavior |
| Employees and payroll | Lazy-loaded only on owner Employees route; payout action explicitly records an in-app event and does not claim a bank transfer | `employee-payroll-ui.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF salary privacy and actual workflow |
| Release Guide and Platform Admin | Lazy-loaded only when selected; Platform Admin remains a separate permission domain | `release-guide.spec.ts`, `platform-admin-helpers.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated platform-admin and workspace-role journeys |
| Reports, Tax, Activity Log, Integrity, Operational Health | Source-level loading/error/empty/permission states and currency/basis limitations retained | `app.component-template-safety.spec.ts`, `data-integrity-ui.spec.ts`, `release-guide.spec.ts` | Authenticated OWNER/STAFF/second-tenant journeys; report basis review |

## UX finding disposition

- **UX-01 contrast:** semantic tertiary text token and contrast regression coverage are present at source level; rendered screenshots remain NOT RUN.
- **UX-02 More-menu focus:** source-level outside close, Escape, focus restoration and RTL/LTR positioning are covered; assistive-technology acceptance remains NOT RUN.
- **UX-03 mobile viewport/keyboard:** NOT RUN; needs 360/390px browser and installed-PWA keyboard/safe-area evidence.
- **UX-04 authenticated journeys:** BLOCKED / NOT RUN; no approved isolated synthetic environment and identities are available.
- **UX-05 module count:** addressed in source by deriving the Home directory count from `homeModuleCards.length`; the catalogue has 19 destinations, while the visible count is role- and platform-admin-availability-dependent.
- **UX-06 duplicate version metadata:** do not change without rendered desktop/mobile evidence; NOT RUN.
- **UX-07 reduced motion:** global reduced-motion CSS and shared-component fallbacks exist; rendered OS/browser verification remains NOT RUN.
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
