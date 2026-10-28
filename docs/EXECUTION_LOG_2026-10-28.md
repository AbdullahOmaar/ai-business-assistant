# Execution log — 2026-10-28

## Ordered task queue

1. **SEC-FOREIGN-001 — Foreign-tenant invoice references** — CI VERIFIED on tested SHA `f5adb00c5f577ea1757bc01c5c09e293c3201fee`; docs-only refresh must be rechecked on its new SHA.
   - Added `backend/tests/test_foreign_invoice_references.py`.
   - Covers foreign-business customer and product IDs supplied to invoice creation, plus payment allocation to a foreign-business invoice and receiving a foreign-business purchase order.
   - Acceptance: each request returns HTTP 422, and business-scoped invoice, invoice-line, payment, payment-allocation, stock-movement, and audit-event counts remain unchanged; foreign purchase-order received quantity must remain unchanged.
   - First CI run exposed a real persistence-order defect: foreign payment allocation left a Payment row in the SQLite-backed test despite HTTP 422. `backend/app/services.py` now validates every allocation before inserting Payment.
   - Verification on tested SHA `f5adb00c5f577ea1757bc01c5c09e293c3201fee`: CircleCI **7/7 PASS**; GitHub Actions backend test job **223 passed, 6 skipped, 13 warnings** in 10.50s; backend container, combined backend/frontend workflow, and dependency audit jobs passed. Existing deprecation warnings remain.
   - Local tests: NOT RUN (no online authorized development machine is connected in this session).

2. **SEC-ROUTE-002 — Complete role × route × tenant denial matrix** — NOT STARTED.
   - Reconcile issue #244 with `docs/SECURITY_ROUTE_INVENTORY.md`.
   - Add only proven missing cases; preserve no-write/no-audit assertions.

3. **CI-ACCOUNTING-001 — Diagnose PR #261 backend-accounting failure** — BLOCKED pending accessible exact job output.
   - Existing task ledger records five substantive checks passing and `backend-accounting` failing on head `28d64c10aa067f83b86041eeb296eb76dcd764ec`.
   - Need the exact CircleCI failure output; do not guess at root cause.

4. **ADM-E2E-001 — Platform Admin exact-head Browser Smoke** — PENDING.
   - Local Admin E2E and frontend checks were previously recorded as passing, but exact-head CI was pending.

5. **A11Y-001 — Admin accessibility** — NOT RUN.
   - Keyboard, screen-reader, and mobile evidence is still required.

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
- Latest implementation commit: `a3e5525269251a5895a185dbaf0617e4f485ff75`
- Files: `backend/tests/test_foreign_invoice_references.py`, `backend/app/services.py`
- Validation: source-level review only. Tests and build are NOT RUN locally; require CI evidence.
- Merge/deploy: NOT performed.


9. **CI-ACCOUNTING-001 — PR #261 failure investigation** — PARTIALLY DIAGNOSED / BLOCKED on original logs.
   - PR #261 head `28d64c10aa067f83b86041eeb296eb76dcd764ec` reports `backend-accounting` failure.
   - GitHub Actions backend run `40633593761` also failed, but log retrieval returned HTTP 404 `BlobNotFound`; CircleCI job page is not accessible through the available connection.
   - The unique PR #261 test `test_owner_cannot_mutate_foreign_business_financial_and_stock_ids` includes foreign-invoice payment allocation and no-side-effect snapshots. The new regression reproduced an orphan Payment row for that same workflow; the payment validation-order fix is a strong candidate root-cause fix, but PR #261 itself has not been rerun and root cause is not yet verified.
   - Next: rerun the existing #261 candidate/test on a current-main integration branch or inspect fresh exact job output when accessible. Do not claim #261 verified.

10. **ADM-MEM-001 — Owner-managed membership feature** — NOT READY TO MERGE.
   - Branch `feat/admin-membership-mainline-20261028` is 97 commits behind `main` and only 1 commit ahead; it must be reconciled with current main before use.
   - Existing `feat/platform-admin-user-directory-and-roles` branch is 98 commits behind main with 0 commits ahead. Do not merge either stale branch wholesale.
