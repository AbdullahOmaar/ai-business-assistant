# Invoice print view

The invoice print action is available only for invoices shown as issued. It fetches the invoice detail from the authenticated business-scoped API immediately before opening the print document; if the saved invoice is no longer issued, printing is stopped and the user is asked to refresh.

The printable document is rendered from saved invoice values returned by the API, not from editable form state or client-side recalculation. It includes:

- Invoice number, issued status, business name, customer label, and currency.
- Saved issue and due dates when present.
- Persisted invoice lines with description, quantity, unit price, and line total.
- Persisted subtotal, discount, tax, and total values.
- Optional saved invoice notes.
- Arabic/English labels and RTL/LTR direction, with browser Print / Save as PDF support.

Dynamic text values are HTML-escaped before being inserted into the isolated print document. Missing dates are displayed as an em dash. Dates use the first ten characters of the persisted ISO date-time string to avoid changing the saved calendar date through the viewer's local timezone.

The API's `GET /api/v1/businesses/{business_id}/invoices/{invoice_id}` detail response is business-scoped and supplies the saved invoice dates, notes, totals, and line snapshots. This is a browser print view, not a server-generated or cryptographically signed PDF.

## Validation status

Feature source changes were made on `feat/invoice-print-details-20261029`. Per the project owner's instruction, automated tests/builds are intentionally **NOT RUN** while CI capacity/limits are being resolved. Manual browser print-to-PDF smoke is also **NOT RUN**. Keep the change unmerged until the normal review and release gates are available.
