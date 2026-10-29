# Invoice print view

The print action is available only for invoices currently shown as issued. Before rendering, the UI re-fetches invoice detail from the authenticated business-scoped API and verifies that the persisted invoice is still issued; if its status changed, printing stops and the user is asked to refresh.

The printable document is rendered from saved API values, not editable form state or client-side recalculation. It includes:

- Invoice number, issued status, business name, customer label, and currency.
- Saved issue and due dates when present.
- Persisted invoice lines with description, quantity, unit price, and line total.
- Persisted subtotal, discount, tax, and final total.
- Optional saved notes.
- Arabic/English labels and RTL/LTR direction, with browser Print / Save as PDF support.

Dynamic invoice, customer, business, line, and note values are HTML-escaped before being inserted into the isolated print document. Missing dates are displayed as an em dash. Dates use the first ten characters of the persisted ISO date-time string to avoid shifting the saved calendar date through the viewer's local timezone.

This is a browser print view, not a server-generated or cryptographically signed PDF.

## Validation status

The print-details implementation is consolidated into PR #305 alongside invoice total breakdown and sales-to-cash UI changes. Static source checks passed for the issued-state guard, persisted totals, issue/due dates, optional notes, and the InvoiceDetail type. Automated tests/builds and manual browser print-to-PDF smoke are **NOT RUN** because exact-head CI failures are not yet classified. Keep the PR unmerged until required checks are observable and pass.
