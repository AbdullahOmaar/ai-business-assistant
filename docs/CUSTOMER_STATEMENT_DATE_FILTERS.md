# Customer statement date filters

The customer statement UI supports optional inclusive start and end dates. It sends `from_date` and `to_date` to the existing business-scoped statement endpoint. The backend evaluates these dates in the business IANA timezone using UTC half-open boundaries; no new route or data model is introduced.

Applying a range resets pagination to the first page. Clearing the range removes both date parameters and reloads the complete statement. Changing the selected customer clears the previous customer's date filters. Existing tenant-context request guards prevent a late response for an older customer, workspace, role, or sign-in context from overwriting the current statement.

**Important balance semantics:** the current backend builds the event list from invoices issued and payment allocations received inside the selected range, then calculates balances from those in-range events. It does not calculate a carried-forward opening balance before the range. The UI displays this limitation whenever a date filter is active. Currency balances remain separated, and existing backend limitations about credit notes and approved sales returns still apply.

## Validation

Frontend unit tests, production build, dependency audit, and browser smoke run through the canonical GitHub Actions workflow. Authenticated business-session testing remains separate from the static component-source regression tests.
