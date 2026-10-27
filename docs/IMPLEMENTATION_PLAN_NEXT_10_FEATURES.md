# Next 10 Features — After the First 15

These are additional product features beyond `docs/IMPLEMENTATION_PLAN_NEXT_15_FEATURES.md`. The interactive UI preview for these concepts is available at `/demo/` in a frontend deployment built from this branch. All preview data is fictional, client-side, and never sent to the API.

## The next ten

1. **Workspace activity audit log** — append-only business events with actor, timestamp, entity, and safe before/after summaries.
2. **Role and membership management** — invite members and enforce owner/admin/member capabilities server-side with negative authorization tests.
3. **Customer statement timeline** — invoices, allocated payments, credits, and outstanding balance, with currency kept separate.
4. **Invoice PDF preview and print layout** — server-validated invoice rendering with locale-aware dates and amounts.
5. **Recurring invoice templates** — explicit schedule, preview-before-issue, idempotency, and cancellation controls.
6. **Supplier and purchasing workflow** — purchase orders, receiving, and stock movements linked to suppliers.
7. **Tax configuration and tax summary** — jurisdiction-specific settings, effective dates, rounding rules, and transparent line-level calculations.
8. **Backup/export and restore drill** — documented encrypted backup policy, export integrity checks, and tested restore procedure.
9. **Notification preferences and inbox** — user-controlled invoice, low-stock, and system notifications without exposing another tenant's data.
10. **Operational health and audit dashboard** — request IDs, redacted errors, migration status, and safe readiness diagnostics without secrets.

## Current implementation status

- Interactive concept demo: created in `demo/index.html` and copied to `frontend/public/demo/index.html` for inclusion in frontend builds.
- The demo includes workspace switching/failure simulation, customer search, multi-line invoice totals, payment-state simulation, stock movements and thresholds, CSV validation preview, CSV download, AI answer provenance explanation, locale direction toggle, and PWA update simulation.
- This is a prototype using fictional local data, not a substitute for production functionality or security verification.
- The ten items above are **proposed**, not implemented in the production app. Work must proceed feature by feature with server-side authorization and regression tests.
