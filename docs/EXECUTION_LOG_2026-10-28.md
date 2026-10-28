# Execution log — 2026-10-28

## Ordered task queue

1. **SEC-FOREIGN-001 — Foreign-tenant sensitive workflows** — CI VERIFIED on latest checked SHA `0627c62958c776eb251ecf47fe2bd9817a31ac06`.
   - Added `backend/tests/test_foreign_invoice_references.py` and `backend/tests/test_foreign_business_workflows.py`.
   - Covers foreign-business customer/product IDs during invoice creation, foreign invoice payment allocation, foreign purchase-order receiving, foreign invoice issue, foreign product stock movement, purchase-order creation with foreign supplier/product IDs, and foreign sales-return creation/approval.
   - Acceptance: each request returns HTTP 422, and business-scoped invoice, invoice-line, payment, payment-allocation, stock-movement, and audit-event counts remain unchanged; foreign purchase-order received quantity must remain unchanged.
   - First CI run exposed a real persistence-order defect: foreign payment allocation left a Payment row in the SQLite-backed test despite HTTP 422. `backend/app/services.py` now validates every allocation before inserting Payment.
   - Verification on latest checked SHA `0627c62958c776eb251ecf47fe2bd9817a31ac06`: CircleCI **7/7 PASS**; GitHub Actions backend tests **224 passed, 6 skipped, 16 warnings** in 9.66s; backend container, combined backend/frontend workflow, and dependency audit jobs passed. Existing deprecation warnings remain.
   - Local tests: NOT RUN (no online authorized development machine is connected in this session).

2. **SEC-ROUTE-002 — Complete role × route × tenant denial matrix** — IN PROGRESS; sensitive foreign-ID coverage expanded in the PR, remaining route/role gaps still need inventory reconciliation.
   - Reconcile issue #244 with `docs/SECURITY_ROUTE_INVENTORY.md`.
   - Add only proven missing cases; preserve no-write/no-audit assertions.

3. **CI-ACCOUNTING-001 — Diagnose PR #261 backend-accounting failure** — PARTIALLY DIAGNOSED; regression scenario fixed on the new candidate, original #261 head still not rerun.
   - Existing task ledger records five substantive checks passing and `backend-accounting` failing on head `28d64c10aa067f83b86041eeb296eb76dcd764ec`.
   - The same foreign-invoice payment scenario was reproduced in the new regression and fixed by validating allocations before inserting Payment. PR #261's own exact-head rerun is still required; do not mark that old head verified.

4. **ADM-E2E-001 — Platform Admin exact-head Browser Smoke** — VERIFIED on tested SHA `0627c62958c776eb251ecf47fe2bd9817a31ac06`.
   - Existing `frontend/e2e/platform-admin.spec.ts` covers signed-in admin user listing, pagination, exact search, delegated-role grant, bearer-token use, and clearing stale metrics after refresh failure. CircleCI Browser Smoke passed 7/7 on the tested SHA.

5. **A11Y-001 — Admin mobile/keyboard regression** — IN PROGRESS in draft PR #268.
   - New assertions run the existing admin flow at 390×844, activate Users & Access with Enter, keep the search field visible, and check page-level horizontal overflow. Exact-head Browser Smoke pending; full screen-reader/WCAG audit remains NOT RUN.

6. **OPS-001 — PostgreSQL backup/restore drill** — BLOCKED.
   - Requires an approved isolated non-production database; no production restore.

7. **PR-RECON-001 — Closed-unmerged PR semantic audit** — IN PROGRESS.
   - Last recorded inventory: 100 of 109 closed-unmerged PRs remain for review.
   - No stale branch bulk merges or branch deletions.

8. **REL-001 — Release parity and production readiness** — BLOCKED/PENDING.
   - Last recorded Vercel API deployment was blocked by `build-rate-limit`; production authenticated workflows remain NOT RUN.
   - No deployment performed by this change.

## Change made in this execution

- Branch: `test/security-foreign-customer-no-side-effects`
- Latest checked implementation SHA: `0627c62958c776eb251ecf47fe2bd9817a31ac06`
- Files: `backend/tests/test_foreign_invoice_references.py`, `backend/tests/test_foreign_business_workflows.py`, `backend/app/services.py`
- Validation: CircleCI 7/7 PASS and GitHub Actions backend suite 224 passed, 6 skipped, 16 warnings on latest checked SHA above. Local tests/build remain NOT RUN.
- Merge/deploy: NOT performed.


9. **CI-ACCOUNTING-001 — PR #261 failure investigation** — PARTIALLY DIAGNOSED / BLOCKED on original logs.
   - PR #261 head `28d64c10aa067f83b86041eeb296eb76dcd764ec` reports `backend-accounting` failure.
   - GitHub Actions backend run `40633593761` also failed, but log retrieval returned HTTP 404 `BlobNotFound`; CircleCI job page is not accessible through the available connection.
   - The unique PR #261 test `test_owner_cannot_mutate_foreign_business_financial_and_stock_ids` includes foreign-invoice payment allocation and no-side-effect snapshots. The new regression reproduced an orphan Payment row for that same workflow; the payment validation-order fix is a strong candidate root-cause fix, but PR #261 itself has not been rerun and root cause is not yet verified.
   - Next: rerun the existing #261 candidate/test on a current-main integration branch or inspect fresh exact job output when accessible. Do not claim #261 verified.

10. **ADM-MEM-001 — Owner-managed membership feature** — NOT READY TO MERGE.
   - Branch `feat/admin-membership-mainline-20261028` is 97 commits behind `main` and only 1 commit ahead; it must be reconciled with current main before use.
   - Existing `feat/platform-admin-user-directory-and-roles` branch is 98 commits behind main with 0 commits ahead. Do not merge either stale branch wholesale.

