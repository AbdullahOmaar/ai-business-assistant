# Tax and Discount Rules — Feature 27

## Implemented in this branch

- Business-scoped pricing-rule records support `tax` and `discount` with a bounded decimal rate.
- Rules now carry timezone-aware `effective_from` and optional exclusive `effective_until` boundaries.
- Existing rules are backfilled from their original `created_at` timestamp in migration `0011_pricing_rule_effective_dates`.
- OWNER-only creation validates timezone-aware and increasing effective windows.
- Business-scoped `GET /pricing-rules` returns only active rules whose effective window contains the requested `as_of` instant; optional type filter is supported.
- Existing invoice line tax snapshots, deterministic cent allocation, partial-return cumulative tax rounding, credit-note tax reversals, tax summary, and P&L activity netting remain separate persisted accounting evidence.

## Important boundaries

- Creating a pricing rule does not retroactively rewrite invoices.
- The rule-list endpoint is configuration discovery; it does not silently override invoice values or apply a tax rate to an existing invoice.
- Invoice creation still snapshots the selected tax/discount values. A future UI integration must select an effective rule and pass an explicit rule reference or immutable rate snapshot.
- No jurisdiction-specific tax filing, tax-code classification, VAT return export, or complete double-entry tax posting is claimed.
- Legacy tax-bearing invoices without saved line-level tax snapshots remain blocked from credit-note issuance rather than estimating a tax reversal.

## Remaining work

- Connect rule selection to invoice creation with server-side effective-date resolution and persisted rule identity/rate snapshots.
- Define whether multiple rules can stack, precedence, inclusive/exclusive tax, and discount-before-tax order.
- Add deactivation/update audit trail and overlap/duplicate policy for effective rules.
- Add UI management, regression tests for rule selection and immutable invoice snapshots, and current-head validation.

## Validation

Model, migration, create/list APIs, client contracts, and regression tests are authored. Current-head tests, migration execution, frontend build, and browser smoke are **NOT RUN**.
