# Customer statement date filters

The customer statement UI supports optional inclusive start and end dates. It sends `from_date` and `to_date` to the existing business-scoped statement endpoint; no new backend route or data model is introduced. The backend rejects a start date later than the end date, and the UI prevents that invalid range before requesting data.

Applying a range resets pagination to the first page. Clearing the range removes both date parameters and reloads the complete statement. Changing the selected customer clears the previous customer's date filters. Existing request-version checks prevent a late response for an older customer/page request from overwriting the current statement.

**Important balance semantics:** the current backend builds the event list from invoices issued and payment allocations received inside the selected range, then calculates balances from those in-range events. It does not calculate a carried-forward opening balance before the range. The UI displays this limitation whenever a date filter is active. Currency balances remain separated, and existing backend limitations about credit notes and approved sales returns still apply.

## Validation status

Implemented on `feat/customer-statement-date-filters-20261029` as a frontend/API-client change against the existing endpoint. Automated tests/builds are intentionally **NOT RUN** per owner instruction while CI limits are being resolved. Authenticated browser smoke is also **NOT RUN**. Do not merge until normal review and release gates are available.
