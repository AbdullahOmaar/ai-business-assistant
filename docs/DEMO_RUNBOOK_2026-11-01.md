# AI Business Assistant — Same-Day Demo Runbook

**Date:** 2026-11-01  
**Candidate:** Master demo-readiness PR #323  
**Candidate branch:** `master/demo-readiness-ui-20261101`  
**Current code head at authoring:** `b7cdc6ebe534aed650c63e2a74e0d5f54bb7a55e`  
**Release state:** Draft / NOT APPROVED for merge or production deployment.

This runbook is a bounded demonstration procedure, not a Production V1 acceptance declaration. Use only a dedicated demo workspace with synthetic data. Do not use production customer, financial, employee or payroll data.

## 1. Before opening the demo

The following must be confirmed by the demo operator; values are intentionally not invented:

- Demo web URL: **NOT VERIFIED for this PR branch**. The existing production alias points to the current main deployment, not this PR head.
- Demo API URL and health/version: **NOT VERIFIED for this PR branch**.
- Demo Owner account: **NOT PROVIDED / NOT VERIFIED**.
- Demo Staff account: **NOT PROVIDED / NOT VERIFIED**.
- Synthetic demo workspace and fixture state: **NOT VERIFIED**.
- Exact-head frontend build, regression suite and browser E2E: **NOT RUN / BLOCKED** pending a complete authorized runner checkout.

Do not substitute the production alias and imply it contains this candidate.

## 2. Owner walkthrough

1. Sign in with the dedicated demo Owner account.
2. Confirm the selected workspace name and role before entering records.
3. Open the Home/module launcher. Confirm each implemented destination is visible and opens without a blank screen or console-blocking error.
4. Open Customers and Products. Use synthetic records only.
5. Open Invoices. Demonstrate an existing draft, edit it, then issue only if the demo API confirms the Owner-authorized operation is available and safe. Print an issued invoice only after confirming it is persisted.
6. Open Payments. Demonstrate only the supported payment/allocation path exposed by the current API and existing demo fixtures. Do not invent tax, refund, credit-note, currency conversion, or posting behavior.
7. Open Inventory, Suppliers and Purchasing. Show only implemented list/detail/receiving behavior. Do not demonstrate AP, supplier payment, valuation or COGS semantics that are not approved.
8. Open Expenses and Reports. Distinguish incurred expenses from paid/cash movements; label incomplete accounting outputs as preliminary where shown.
9. Open Employees & Payroll as Owner only. Use synthetic employee/payroll data. Demonstrate only existing approved lifecycle controls; do not imply salary-history/backfill/proration or external bank payout support.
10. Open Assistant. Use a harmless question grounded in the selected demo workspace and verify the answer does not expose another workspace's data.

## 3. Staff permission walkthrough

1. Sign out completely.
2. Sign in with the dedicated demo Staff account for the same synthetic workspace.
3. Confirm Owner-only destinations/actions are not available through navigation or direct UI interaction.
4. Confirm Staff can access only ordinary workspace modules allowed by backend policy.
5. Verify Staff cannot issue/void invoices or access payroll-sensitive views/actions.
6. If a role or workspace transition leaves stale content visible, stop the demo and record a blocker; do not continue with that browser session.

## 4. Workspace isolation smoke check

Use two synthetic workspaces A and B and no production records:

1. Sign in as Owner of A and load its customers/invoices.
2. Switch to B while a read-only chat or list request is pending, if this can be done without triggering a write.
3. Confirm late responses from A do not appear in B.
4. Sign out while a read-only request is pending, then sign in as B; confirm A data does not reappear.
5. Repeat with CSV preview only. Do not confirm/import a CSV during this smoke check.
6. Do not replay create/issue/void/import/payment writes when their outcome is uncertain.

This is a manual smoke procedure only; it does not replace automated deferred-promise and backend tenant-isolation tests.

## 5. Demo stop conditions

Stop the walkthrough immediately if any of these occurs:

- Blank screen, application crash, unhandled blocking error or broken navigation.
- A record from another workspace appears.
- Staff can access an Owner-only action or payroll-sensitive data.
- An operation has an uncertain persisted outcome.
- API/runtime target does not match the declared demo environment.
- The only available account or data is production.

Do not attempt to repair demo data by writing directly to Production.

## 6. Known limitations and non-claims

- This PR is Draft and unmerged. Production Web/API deployments previously verified were built from main SHA `dcb0853ab06dc9271b1109db03eb84ab2e3360c8`, not this PR head.
- No Preview deployment for this PR branch was found in the latest lookup.
- Exact-head frontend tests and Angular build are not verified: the resumed sandbox contained an incomplete/stale source snapshot, missing modules imported by the app. Its test/build failures are not valid evidence against the exact PR head.
- GitHub exact-head status contexts reported Semaphore failure and CircleCI error; neither was triggered or retried. CircleCI remains frozen.
- Independent review is absent at this checkpoint.
- Browser E2E, authenticated mobile/RTL/accessibility, live Owner/Staff journeys and tenant-isolation runtime checks remain NOT RUN.
- Financial/accounting features outside explicitly approved bounded policy are not part of this demo claim: tax, COGS, AP, FX, GL, credit-note/refund posting, salary-history/backfill/proration and new payout states.
- Payroll privacy approval is limited; do not expose payroll-sensitive information to Staff.
- This document does not authorize merge, production deployment, migrations or production data changes.

## 7. Final demo record

Before claiming a successful demo, record:
- exact web/API URLs and deployed commit SHA,
- synthetic workspace identifiers (not personal data),
- confirmation that Owner and Staff accounts are dedicated demo accounts,
- browser/device and language/RTL used,
- exact journeys completed and their outcomes,
- screenshots/log references with sensitive data redacted,
- all blocked, partial and not-run criteria.

**Current status:** Runbook drafted. A real end-to-end demo remains **BLOCKED / NOT VERIFIED** until a safe candidate environment, demo accounts/data and exact-head validation are available.


## 8. Master validation refresh — 2026-11-01 14:10 +02:00

- **Current candidate HEAD:** `e8bbabad500c931d37231ec753d4edc661409614` on `master/demo-readiness-ui-20261101`; base/main `dcb0853ab06dc9271b1109db03eb84ab2e3360c8`. PR #323 remains OPEN / DRAFT / UNMERGED with no review submissions. Exact-head statuses: Semaphore FAILURE and CircleCI ERROR; no CI provider was triggered or retried.
- **Targeted source/spec checks now available:** 84 PASS / 0 FAIL across four isolated Node 24.22.1 runs. The 47-test template/invoice-draft/payment-retry subset ran at parent code head `cb342ed18176a6606ba7333ebc337eae0b287719`; the only three later commits changed `TASKS.md` and `release-guide.ts/spec`, not those tested application/helper files. Current-head runs: release-guide 8/8, module-access + workspace-load-guard 14/14, payment-allocation + list-pagination 15/15. These are focused pure/source-level tests, not the full frontend suite.
- **Still NOT RUN:** full `npm test`, Angular production build/template compilation, backend pytest/PostgreSQL, browser E2E, authenticated Owner/Staff, A→B/logout→B, mobile/Arabic RTL/accessibility, dependency/security scans and independent Chat 5 review.
- Demo web/API preview, dedicated Owner/Staff accounts and synthetic fixture workspaces remain UNKNOWN / NOT VERIFIED. Production aliases are not a substitute for this candidate.
- **Five-task status:** 0/5 VERIFIED COMPLETE; UI/navigation, Sales, operational module integration and workspace security remain IN PROGRESS; final demo validation is BLOCKED pending complete exact-source build/E2E runner and safe demo environment.
- No merge, production deployment, migration or production database write was performed. This runbook remains a demo procedure with explicit limitations, not a release approval.



## 9. Chat 1 latest T38 handoff — 2026-11-01 14:20 +02:00

Chat 1's existing PR #305 advanced to `14761ed409c14087c95a1580b798483f21885c6c` (OPEN/DRAFT/UNMERGED, mergeable=false). Its new `invoice-payment-behavior.spec.ts` contains seven method-level simulations for popup-blocked printing, late print response after workspace switch, server-total/HTML escaping, single-flight payment, same-key/same-payload retry, late payment completion after identity switch and blocking workspace switch during a pending payment. These do not replace real browser/Firebase tenant journeys or backend persisted side-effect tests. Previous Chat 5 reviews are COMMENTED on older heads; exact-head independent review is pending.

PR #305 combined status shows CircleCI contexts SUCCESS and Semaphore FAILURE; Master did not trigger/retry them. Do not use those statuses as the demo gate under the current freeze/authority conflict. Chat 1 owns #305; do not merge it wholesale or alter its branch from Master.



## 10. Operational UI validation update — 2026-11-01 14:25 +02:00

Exact Master branch app blob `843077a92ea6a438ac82afa8f9274cd19df238e8` and current dependencies were used to run `employee-payroll-ui.spec.ts` + `expense-ui.spec.ts` in isolated Node 24.22.1: **13 PASS / 0 FAIL**. Payroll checks cover Owner-only UI guard, workflow controls, responsive styles, workspace-scoped API, no client net-pay, period validation, bilingual guide and post-pay expense/dashboard refresh. Expense checks cover API scope, mobile navigation, load/clear, validation, uncertain-save protection and local datetime handling.

Cumulative focused source/spec checks: **97 PASS / 0 FAIL** across five groups. Full frontend suite/build, browser E2E, backend/PostgreSQL and authenticated demo flows remain NOT RUN. Supplier/purchasing/receiving journeys remain unverified; T37-gated financial changes remain excluded.



## 11. Preview and current delivery status — 2026-11-01 14:30 +02:00

- PR #323 pre-refresh candidate `22373ad3bd2e3fd95bb96a463aa370215ae8cad4`; OPEN/DRAFT/UNMERGED, no review submissions. Exact status contexts: Semaphore FAILURE, CircleCI ERROR; Master did not trigger/retry CI.
- Vercel branch-filtered deployment lookup returned **zero** preview deployments for both Web and API on `master/demo-readiness-ui-20261101`. Existing production aliases are main-only and must not be used to claim this candidate is deployed.
- 97 focused source/spec tests passed across five isolated Node runs; full repository test/build/backend/browser/security/accessibility checks remain NOT RUN.
- Demo Owner/Staff accounts and synthetic workspaces/fixtures remain NOT PROVIDED / NOT VERIFIED. The walkthrough is therefore not executable end-to-end yet.
- Chat 1's current PR #305 head is `14761ed409c14087c95a1580b798483f21885c6c`; seven extracted-method behavior simulations are authored; independent Chat 5 review on this head is pending.
- No merge, production deployment, migration or production DB write.

