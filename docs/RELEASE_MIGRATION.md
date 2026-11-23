# Release-time migrations (3A-650 part B)

## The problem this solves

`DATABASE_URL` for production is a Vercel **Sensitive** variable:
write-only, never readable — not even by the person who set it, not by
the CLI, not by any connected agent. The migration therefore cannot be
applied from outside Vercel. The only place that ever holds the
decrypted value is Vercel's own build/runtime environment, so the
migration has to run **inside a Vercel build**.

## The mechanism

`backend/scripts/apply_migrations.py` runs `alembic upgrade head` (with
a `current` read before and after, for the build log). It is invoked
from the API project's **Build Command** in the Vercel dashboard:

- If the API project's root directory is `backend`, set the Build
  Command to:

  ```
  python scripts/apply_migrations.py && <existing build command>
  ```

  (If there is no existing build command, the script alone is the
  Build Command.)
- If the root is the repository root, use:

  ```
  cd backend && python scripts/apply_migrations.py && cd .. && <existing build command>
  ```

The script changes into the backend directory itself, so either root
works. This is a **dashboard setting applied once by the manager** —
the repository cannot set it, and this PR does not try to.

## Why this shape (and what was ruled out)

- **Build time, not app startup.** The app deliberately does not
  auto-run Alembic at startup (repository rule). A migration at startup
  would also run concurrently across serverless instances.
- **Build time, not GitHub Actions.** CI must never receive production
  secrets (repository rule, and the owner decision of 2026-11-15). A
  workflow that applies migrations would need `DATABASE_URL` as a
  GitHub secret — ruled out.
- **Fail-closed.** A failed migration exits non-zero and fails the
  Vercel build, so a bad migration blocks the deploy instead of
  shipping beside it. Without `DATABASE_URL` the script refuses before
  doing anything, and the value is never printed.
- **Previews are disabled** for the API project, so the step only runs
  on production builds — it cannot touch a preview database.

## Migration 0011 — exact SQL review (the pending one)

`0011_report_indexes` (revises `0010_stock_movement_idem`) runs three
statements, one transaction, additive-only — no table, column, or row
is touched, and no calculation changes:

```sql
CREATE INDEX ix_invoices_business_status_issue_date
    ON invoices (business_id, status, issue_date);
CREATE INDEX ix_expenses_business_incurred_at
    ON expenses (business_id, incurred_at);
CREATE INDEX ix_sales_returns_business_status
    ON sales_returns (business_id, status);
```

**Rollback:** `alembic downgrade 0010_stock_movement_idem` drops the
three indexes. Report results are identical with or without them (they
only change how the database finds the rows), so a code rollback never
needs a schema rollback. The API runs correctly without this migration
— reports are only slower as data grows, as documented in 3A-650 part D.

## Verification after the next deploy

1. In the Vercel deployment's build log, confirm the lines
   `alembic current` → `0011_report_indexes` after the upgrade step.
2. Confirm `/version` still reports the expected release and
   `/readyz` is ready.
3. Record the applied revision in `docs/RELEASE_EVIDENCE_REGISTER.md`
   in the same change as the deploy.
