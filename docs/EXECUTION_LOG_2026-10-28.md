# Execution log — 2026-10-28

## Ordered task queue

1. **SEC-FOREIGN-001 — Foreign-tenant invoice references** — IN PROGRESS.
   - Added `backend/tests/test_foreign_invoice_references.py`.
   - Covers foreign-business customer and product IDs supplied to invoice creation, plus payment allocation to a foreign-business invoice.
   - Acceptance: each request returns HTTP 422, and business-scoped invoice, invoice-line, payment, payment-allocation, and audit-event counts remain unchanged.
   - First CI run exposed a real persistence-order defect: foreign payment allocation left a Payment row in the SQLite-backed test despite HTTP 422. `backend/app/services.py` now validates every allocation before inserting Payment; exact-head rerun is required.
   - Local tests: NOT RUN (no online authorized development machine is connected in this session).
   - Required next evidence: exact-PR-head CircleCI results; fix any failure and rerun before marking verified.

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
- Latest implementation commit: `1b3ef9a70a25c555206b6fb4dbe13ebeff65679a`
- Files: `backend/tests/test_foreign_invoice_references.py`, `backend/app/services.py`
- Validation: source-level review only. Tests and build are NOT RUN locally; require CI evidence.
- Merge/deploy: NOT performed.
