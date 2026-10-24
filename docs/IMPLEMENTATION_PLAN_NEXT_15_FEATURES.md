# Next 15 Features — Prioritized Implementation Roadmap

This roadmap starts from the current `main` implementation and is intentionally incremental. Each feature must be delivered behind a reviewed pull request with automated evidence. No production deployment or paid resource is implied.

## Priority order

1. **Workspace switch data isolation** — clear previous workspace records immediately, reject stale asynchronous responses, and never show old records after a failed workspace load. (Implementation started in this branch; requires regression tests and CI.)
2. **Frontend regression test foundation** — establish reliable Angular component/service tests in CI and cover workspace switching, auth errors, and loading state.
3. **Workspace-scoped error and retry states** — provide actionable localized errors without losing the selected workspace or showing stale data.
4. **Accessible mobile navigation** — verify focus behavior, keyboard dismissal, screen-reader labels, and 320px viewport layout with tests.
5. **Complete locale propagation** — centralize language changes so document metadata, page titles, dates, currency labels, dialogs, and errors switch together.
6. **Invoice multi-line editor** — create/edit multiple product lines, validate quantities, and preserve server-side totals as authoritative.
7. **Payment lifecycle and reversals** — prevent unsafe edits to allocated payments and introduce audited refund/credit-note workflows.
8. **Inventory movement history** — show stock-in, invoice deduction, returns, and adjustments as immutable movements with reason and actor.
9. **Low-stock thresholds and alerts** — configurable thresholds per product, with explicit empty and error states.
10. **Customer and product search/pagination** — server-backed pagination and filtering rather than silently truncating at 100 records.
11. **CSV import preview and validation** — dry-run validation, row-level errors, duplicate detection, and explicit confirmation before writes.
12. **Exportable financial reports** — CSV exports that preserve currency separation, date filters, and timezone boundaries.
13. **AI answer provenance and safety** — show source records and data limits, reject unsupported claims, and test prompt-injection-like business data.
14. **Usage limits and resilient AI failures** — backend-enforced limits, bounded retries/timeouts, and clear localized service-unavailable messaging.
15. **PWA update and offline status UX** — signal when a new shell is available, provide safe refresh, and clearly distinguish offline shell access from live business data.

## Acceptance rules

- Every business-data endpoint must enforce a verified principal and active membership on the server.
- No client-supplied user ID or role may grant access.
- Financial totals must remain currency-separated; invoice totals are server-calculated.
- Sensitive API responses and authenticated business records must not be cached by the service worker.
- Loading states must settle on both success and failure; stale requests must not overwrite current workspace state.
- Arabic/RTL and English/LTR must be checked at narrow mobile widths.
- Each item requires focused regression coverage and passing CI before being marked complete.
- Physical Android Chrome checks must be reported as pending unless actually performed on a device.
- Production changes, secret changes, billing changes, and merges remain separate release decisions.

## Status at roadmap creation

- Feature 1: implementation started in `fix/workspace-switch-data-isolation`; regression test and CI verification are still required.
- Features 2–15: planned, not implemented by this document.
