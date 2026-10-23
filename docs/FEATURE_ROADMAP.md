# Business Operations Feature Roadmap

This roadmap tracks the next ten product features for AI Business Assistant. Work is delivered in small pull requests; no production deployment or paid resources are required to develop these features.

## New feature batch

1. **Payment CSV export** — export payment date, amount, currency, method, reference, and allocation count; protect spreadsheet exports against formula injection. `In progress`
2. **Dashboard date range** — let users choose 7, 30, 90 days or a custom range, with date boundaries applied consistently by the API.
3. **Expense management** — create, list, edit, and archive expenses with category, date, currency, and notes.
4. **Invoice PDF/print view** — print-friendly Arabic/RTL and English invoice document with totals and customer details.
5. **Overdue invoice tracking** — due dates, overdue status, and outstanding balance summary.
6. **Customer detail view** — customer profile with linked invoices, payments, and balances.
7. **Inventory movement history** — auditable stock adjustments and invoice-related movements.
8. **Cash-flow report** — expected collections, recorded payments, and expenses separated by currency.
9. **Workspace member roles** — owner/admin/member permissions enforced server-side with auditable invitations.
10. **AI answer evidence panel** — structured source references and clear handling of missing or stale data.

## Completion gates

- Arabic/RTL and English are checked for every user-facing feature.
- API authorization is enforced server-side and scoped to the active workspace.
- Add or update automated tests for each feature; run the relevant CI checks.
- Do not use fake business data to disguise missing configuration.
- Do not merge or deploy until checks and review findings are addressed; production deployment remains separately gated.
- Manual Android/PWA installation checks must be recorded as not verified until an actual device test is performed.

## Existing mobile/release task closure checklist

- [ ] Mobile bottom navigation and safe-area spacing verified on current branch
- [ ] Mobile top-bar behavior verified
- [ ] More menu keyboard and screen-reader behavior verified
- [ ] Arabic/RTL verified across primary flows
- [ ] PWA manifest icon sizes and install prompt verified
- [ ] Install help does not cover content
- [ ] Loading/empty/error states verified on latest commit
- [ ] Authentication and workspace isolation tests pass
- [ ] CI passes on the exact PR head
- [ ] Release review records deployment state and manual-test limitations
