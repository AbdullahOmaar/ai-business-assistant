# Accounting Integrity Review — 2026-10-25

## Scope reviewed
The current Angular UI, FastAPI invoice/payment workflows, SQLAlchemy invoice/payment/allocation models, domain arithmetic rules, dashboard and preliminary profit/loss query paths.

## Existing controls confirmed in source
- Monetary arithmetic uses `Decimal` and explicit half-up cent rounding for invoice totals.
- Invoice line prices are snapshotted; totals are calculated server-side from catalog prices rather than trusted from the client.
- Invoice and invoice-line records are business-scoped, with composite foreign keys for customers/products/invoices where modeled.
- Issuance and tracked-stock deduction occur in a single caller-managed transaction; insufficient stock rejects issuance.
- Payment writes use an idempotency key; allocation validates positive amounts, payment remaining amount, invoice outstanding balance, invoice status, and currency equality.
- Voiding an issued invoice with allocated payments is blocked; stock restoration is recorded as a movement for eligible voids.
- Dashboard/report aggregates are separated by currency and distinguish invoiced sales from collected payments and outstanding balances.
- Sensitive workflows write audit events.

## Gaps and risks
1. **Customer integrity:** an invoice could previously be issued without a customer; an allocated payment could previously use a different customer than the invoice. The current sprint adds server-side checks and regression tests. Legacy unlinked records remain visible; no destructive backfill is planned.
2. **Accounting basis:** current profit/loss is a preliminary operational report: issued invoice totals minus recorded expenses. It is not a general ledger, does not account for receivable/cash accounting policy, and is not net profit.
3. **COGS and inventory valuation:** stock quantities are tracked through movements, but product cost layers/valuation and invoice-linked cost of goods sold are not implemented. Gross margin cannot yet be trusted.
4. **Tax:** invoice-level percentage tax and discount exist with a defined rounding policy, but there is no jurisdiction-aware tax configuration, inclusive/exclusive tax policy, or tax return/reporting workflow.
5. **Customer balances:** payment allocation supports partial settlement, but customer statement/aging views are incomplete. Unallocated receipts must remain clearly distinguished from invoice settlement.
6. **Multi-currency:** values are kept separate and payment/invoice currency must match; exchange rates, reporting-currency conversion and FX gains/losses are not implemented.
7. **General ledger:** no balanced double-entry journal/chart of accounts or close-period locks exist yet.
8. **Reconciliation and evidence:** bank-statement reconciliation, receipt evidence/attachments, and financial close checks remain future work.
9. **Concurrency:** allocation and stock logic use row locks where supported, but production database-specific concurrency tests and migration/reconciliation checks should be added before calling the system accounting-grade.
10. **Historical data:** do not silently assign customers, rewrite issued totals, or recalculate historical invoices. Audit legacy rows and use explicit, auditable correction workflows.

## Sprint acceptance criteria
- [ ] Four fixed mobile navigation destinations; secondary links are in a vertically scrollable More menu.
- [ ] Every newly issued invoice has a valid customer in the same business.
- [ ] Every new receipt has a valid customer; allocated receipts match invoice customer and currency.
- [ ] Regression tests cover missing customer, cross-customer allocation, partial payments, idempotency, stock rollback, and void restrictions.
- [ ] UI shows customer names on invoices and lets a user navigate from a customer to that customer's invoices.
- [ ] CI passes; production deployment is not called verified until the new commit is READY and the demo is smoke-tested.

## Prioritized next phases
1. Close this sprint and verify demo.
2. Customer statements and receivables aging.
3. Inventory cost policy + COGS before promoting profit figures.
4. Tax configuration and report semantics.
5. Double-entry ledger, reconciliation, period close, and FX controls.
