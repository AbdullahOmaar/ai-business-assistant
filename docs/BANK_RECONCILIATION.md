# Bank and Cash Reconciliation — Feature 33

## Scope and safety contract

The first slice is CSV-only. It imports statement activity into a tenant-owned account ledger and supports exact one-to-one matches against recorded payments (inflows) and expenses (outflows).

- Statement amounts are signed: positive means cash/bank inflow; negative means outflow.
- Every account and statement row is scoped to one business. Composite foreign keys prevent cross-business references.
- External transaction IDs are unique per business/account. Re-importing the same file skips previously imported rows.
- Currency must match the account at import and the target transaction at match time.
- Matching is exact amount and direction only. Partial/split matches, FX conversions, automatic fuzzy matching, and direct bank integrations are intentionally excluded.
- A match never creates a payment or expense, changes a receivable, or marks an allocation as paid. It only links existing records to a statement row.
- Only the business OWNER can create accounts, import statements, and match rows. Authorized workspace members can read account and row lists.
- A statement row can be matched once, and a payment/expense can be matched at most once per business. Audit events record account creation, imports, and matches.

## CSV contract

Required headers:

```csv
transaction_id,transaction_date,description,amount,currency_code
BANK-0001,2026-10-28T10:00:00+00:00,Customer receipt,100.00,EGP
BANK-0002,2026-10-28,Office expense,-25.00,EGP
```

Dates accept ISO-8601 timestamps (with or without offset) or ISO dates. Date-only values are interpreted as midnight UTC. Files are limited to 1 MB. The import validates all rows before writing; duplicate transaction IDs within one CSV are rejected, while IDs already imported for that account are skipped.

## API slice

- `POST /bank-accounts` — OWNER creates an account.
- `GET /bank-accounts` — list business accounts.
- `POST /bank-accounts/{account_id}/statement-import` — OWNER imports CSV text.
- `GET /bank-statement-rows` — paginated business-scoped statement rows.
- `POST /bank-reconciliation/matches` — OWNER creates an exact payment/expense match.

Migration: `0010_bank_reconciliation`.

## Remaining work

- Frontend workspace for account creation, CSV import, unmatched-row review, and exact matching.
- Regression tests for cross-business isolation, duplicate match targets, currency/direction mismatch, malformed CSV atomicity, and duplicate import under concurrent requests.
- Browser smoke and current-head CI.
- Periodic statement balance opening/closing reconciliation and support for split transactions require separate accounting decisions; they are not inferred by this first slice.

## Validation status

The model, migration, endpoints, API client contracts, and initial regression tests are authored. Current-head tests, migration execution against PostgreSQL, frontend build, and browser smoke are **NOT RUN**. Do not treat this feature as production-ready.
