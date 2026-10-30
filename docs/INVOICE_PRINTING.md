# Invoice print view

The print action is available only for invoices currently shown as issued. It opens a blank print window synchronously (so browser popup blockers can report a clear error), then re-fetches invoice detail from the authenticated business-scoped API. The persisted invoice must still be `issued`; if its status changed, printing stops. The action snapshots the selected business ID/name before the asynchronous request and closes the temporary window if the user switches workspaces before the response returns.

## Data provenance

The printable document uses the following sources:

- **Persisted invoice detail:** invoice number, status, currency code, issue/due dates, notes, line descriptions, quantities, unit prices, line totals, subtotal, discount, tax, and final total come from the freshly fetched `InvoiceDetail` response. Totals are not recalculated in the browser.
- **Customer display name:** the response currently contains `customer_id`, not a persisted customer-name snapshot. The UI resolves the label through the currently loaded in-memory customer directory (`customerNameForInvoice`). If that cache is stale or incomplete, the printout can show an old name or the “customer not in current list” fallback. This label is therefore **not** a historical customer-name snapshot.
- **Business header:** business name is taken from the selected in-memory Business object captured before the request; header currency is read from the active in-memory Business object after the same-business guard. The amount rows use the invoice detail's persisted `currency_code`.

This distinction matters: the invoice amounts and lines are freshly persisted data, but the current customer/business labels are UI directory/profile values, not immutable invoice snapshots.

## Rendering and safety

- Arabic uses RTL and English uses LTR; browser Print / Save as PDF is supported.
- Dynamic invoice, customer, business, line, currency, and note values are HTML-escaped before insertion into the isolated print document.
- Missing dates are displayed as an em dash. Dates use the first ten characters of the persisted ISO date-time string to avoid shifting the saved calendar date through the viewer's local timezone.
- If the popup is blocked, the UI reports that pop-ups must be allowed. If the detail fetch fails or the persisted status is no longer issued, the temporary window is closed.
- The print handler is read-only: it calls the invoice-detail read endpoint and does not call invoice/payment mutation APIs. Browser printing or saving a PDF does not create a server-side document, signature, payment, or audit event.

This is a browser print view, not a server-generated or cryptographically signed PDF.

## Regression coverage

`frontend/src/app/invoice-print-regressions.spec.ts` contains static source checks for:
- Re-fetching persisted detail and refusing invoices no longer issued.
- Persisted subtotal/discount/tax/total, dates, notes, and escaped dynamic content.
- Arabic RTL / English LTR presentation and print-only action controls.
- Captured workspace identity and closing the popup after a workspace switch.
- Popup-blocked and read-only behavior.
- The customer-name cache dependency described above.

## Validation status

The print-details implementation is consolidated into PR #305 alongside invoice total breakdown and sales-to-cash UI changes. Source review confirms the behavior described above. Automated Node tests, Angular build, and manual browser print-to-PDF smoke are **NOT RUN** on the exact current PR head. The exact-head CircleCI status currently reports six FAILURE contexts; the underlying runner/platform cause is not established. CircleCI retries are prohibited by the owner quota freeze. Keep the PR unmerged until an authorized non-CircleCI exact-SHA validation path and required independent review are available.
