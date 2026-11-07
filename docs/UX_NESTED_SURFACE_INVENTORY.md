# T18 UI/UX Nested Surface Inventory

**Evidence baseline:** GitHub branch `master/t18-uiux-hardening-20261107`, commit `7f347ee0991ec2af15ba6e7211fb20bb412e8ada` (2026-11-07). This is source/test evidence, not a rendered product-acceptance claim.

## Implemented source surfaces and regression coverage

| Surface | Current source behavior | Existing regression evidence | Remaining acceptance |
|---|---|---|---|
| Shared shell and mobile More | Central role-aware module registry; active secondary destinations; Escape/outside close; focus restoration; logical RTL/LTR positioning | `module-access.spec.ts`, `mobile-navigation.spec.ts`, `app.component-template-safety.spec.ts` | Browser keyboard and screen-reader run; physical Android/PWA |
| Home | Five quick shortcuts plus the full role-authorized 19-destination module directory; dashboard loading/error/empty states | `workspace-module-catalog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF rendered visibility |
| Customers CSV import | Preview is separate from execution; valid preview gates confirmation; workspace switch clears pending import; owner-only import actions | `app.component-template-safety.spec.ts` customer-import cases | Browser file picker, preview table overflow, focus and retry |
| Products CSV import | Preview/validation before confirmation; confirmed import is not repeated after ambiguous refresh | `app.component-template-safety.spec.ts` product-import cases | Browser file picker and large-file behavior |
| Invoice line editor and totals preview | Dynamic line validation and estimated totals; draft creation distinct from issue; totals remain server-authoritative | `app.component-template-safety.spec.ts` invoice line/validation cases | Rendered mobile editing and long product names |
| Invoice print | Issued-invoice-only print action; escaped business/customer/invoice/line content; popup-blocked and detail errors surfaced | `invoice-print-preview.spec.ts` | Real browser popup/print rendering in RTL and LTR |
| Invoice void confirmation | Shared accessible dialog; OWNER guard; explicit void warning; no refund/credit-note implication; focus return and uncertain-result protection | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF denial and rendered keyboard test |
| Purchase receipt confirmation | Shared dialog; OWNER guard; line quantities reviewed before receipt; uncertain result blocks unsafe retry | `confirmation-dialog.spec.ts`, `app.component-template-safety.spec.ts` | Authenticated OWNER/STAFF journey and no-side-effect evidence |
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
- **UX-05 module count:** addressed in source by deriving the Home directory count from `homeModuleCards.length`; regression tests compare the registry-backed list.
- **UX-06 duplicate version metadata:** do not change without rendered desktop/mobile evidence; NOT RUN.
- **UX-07 reduced motion:** global reduced-motion CSS and shared-component fallbacks exist; rendered OS/browser verification remains NOT RUN.
- **UX-08 nested surfaces:** inventory above maps current major nested interactions and source tests. It does not certify every nested surface or browser behavior.

## Exact-head validation checkpoint

For `7f347ee0991ec2af15ba6e7211fb20bb412e8ada`:

- CircleCI `frontend-unit-tests`: SUCCESS.
- CircleCI `frontend-production-build`: SUCCESS.
- CircleCI `frontend-dependency-audit`: SUCCESS.
- CircleCI `backend-container`: SUCCESS.
- CircleCI `backend-accounting`: SUCCESS.
- CircleCI `frontend-browser-smoke`: PENDING at this checkpoint.
- GitHub Actions backend/frontend workflow and dependency security scan: SUCCESS.
- Semaphore: failure is retired/non-authoritative under current CI policy.

## Explicitly not accepted yet

- Authenticated OWNER, STAFF, second-workspace OWNER and non-member browser journeys: NOT RUN.
- Physical Android Chrome, installed PWA, keyboard-open, safe-area, landscape and screen-reader checks: NOT RUN.
- Figma visual/structural review: BLOCKED by View-only access/read restriction.
- No Vercel preview deployment was available for this branch. Production was not changed.
- No API/backend/schema/migration/financial/payroll-rule changes were made by this UI/UX workstream.
- Phase 2 full Design System and Phase 3 high-fidelity Figma work remain governed by the UX workstream gates; this T18 engineering work does not claim those phases started or were accepted.
