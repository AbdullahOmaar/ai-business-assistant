# Double-Entry General Ledger — Design Proposal

**Status:** Proposed; requires independent accounting and engineering review before implementation.  
**Tracking issue:** [#81 — Double-entry general ledger and chart of accounts](https://github.com/AbdullahOmaar/ai-business-assistant/issues/81)  
**Scope:** Design only. No schema migration, journal posting, or production data change is authorized by this document.

## 1. Goals and invariants

The ledger should provide an auditable accounting record without replacing current operational invoice, payment, expense, inventory, or return records.

Required invariants:

1. Every posted journal entry balances within each currency: total debits equal total credits using exact decimal arithmetic.
2. A posted entry and its lines are immutable. Corrections are represented by linked reversal/correction entries, never by silently editing posted lines.
3. A source business event is posted at most once. Posting must be idempotent and protected by a unique source-event key.
4. Every posting is scoped to one business. Cross-business references must be rejected by database constraints and service authorization.
5. Amounts are stored as fixed-precision numeric values, never binary floating point.
6. A journal entry has one transaction currency unless an explicitly reviewed multi-currency design supplies balanced functional-currency amounts and dated FX rates. Do not balance EGP and USD against each other.
7. Draft, void, reversed, and unposted operational records are not silently treated as posted ledger activity.
8. Historical operational records are not bulk-posted until reconciliation rules, source completeness, opening balances, and a reviewed migration plan are approved.

## 2. Proposed data model

### Accounts

Fields: id, business_id, code, name, account_type, normal_balance, currency_policy, is_active, created_at.

- Account types: asset, liability, equity, revenue, expense.
- Unique (business_id, code) and a composite key suitable for business-scoped foreign keys.
- Account codes and types become immutable after first use; deactivation is preferred to deletion.

### Journal entries

Fields: id, business_id, entry_number, status, entry_date, currency_code, source_type, source_id, source_event, idempotency_key, description, created_by_subject, posted_at, reversal_of_entry_id, created_at.

- Unique (business_id, entry_number) and unique source-event/idempotency constraints.
- Only a trusted posting service may transition a balanced draft to posted.
- Enforce valid status transitions and business-scoped source references.

### Journal lines

Fields: id, business_id, journal_entry_id, account_id, line_number, debit_amount, credit_amount, currency_code, optional source-line reference and safe memo.

- Exactly one of debit or credit must be greater than zero; the other must be zero.
- Amounts must be nonnegative and have approved precision.
- Composite foreign keys must ensure entry and account belong to the same business.
- Posted lines are append-only; database permissions and service checks should enforce this as far as the hosting model permits.

A posted-entry invariant must be checked in the posting transaction under appropriate locking. A simple row-level CHECK constraint cannot enforce the sum across multiple journal lines, so the posting service and integration tests are mandatory. Consider a database trigger only if compatible with migrations and hosting and independently reviewed.

## 3. Minimum chart-of-accounts template

A business may customize account names and codes, but the application should seed a small, versioned template only after review.

| Category | Example account | Purpose |
|---|---|---|
| Asset | Cash / Bank | Recorded cash and bank balances |
| Asset | Accounts Receivable | Unpaid issued invoices |
| Asset | Inventory | Inventory value only after valuation policy is implemented |
| Liability | Tax Payable | Tax collected and owed under approved tax rules |
| Equity | Opening Balance / Owner Equity | Reconciled opening balances |
| Revenue | Sales Revenue | Revenue under the selected accounting policy |
| Contra-revenue | Sales Returns / Credits | Approved credit notes and returns |
| Expense | Operating Expenses | Recorded expenses |
| Expense | Cost of Goods Sold | Only when inventory costing and issue/return rules are reliable |
| FX | Realized FX Gain/Loss | Only after dated FX rates and functional-currency rules are approved |

Do not seed or post into an account whose accounting meaning is not defined for the business.

## 4. Proposed posting map

The exact accounting basis and tax treatment require approval. The following is a candidate accrual-style map, not authorization to post live entries.

| Source event | Candidate debit | Candidate credit | Gate |
|---|---|---|---|
| Invoice issued | Accounts Receivable | Sales Revenue and, when applicable, Tax Payable | Customer, currency, totals, tax policy, and invoice state validated |
| Receipt recorded and allocated | Cash / Bank | Accounts Receivable | Receipt currency and customer match; allocation is valid and idempotent |
| Expense recorded | Appropriate Expense or Asset | Cash / Bank or Accounts Payable | Evidence/policy and payment state known; do not infer cash payment from an expense record alone |
| Credit note approved | Sales Returns / Credits and applicable Tax Payable adjustment | Accounts Receivable | Linked to original invoice; approved and within remaining creditable amount |
| Invoice void | Reverse the original posted invoice entry | Reverse corresponding accounts | Only through an explicit, auditable reversal; respect period locks |
| Inventory receipt | Inventory | Accounts Payable / clearing account | Only after costing and receiving rules are approved |
| Cost of goods sold | Cost of Goods Sold | Inventory | Block until inventory valuation and invoice/return linkage are reliable |

Unallocated receipts must remain in an appropriate unapplied-cash/clearing account rather than reducing Accounts Receivable arbitrarily. Refunds require an explicit cash/bank credit and corresponding liability/receivable/credit-note treatment based on the approved workflow.

## 5. Posting service and transaction boundary

The posting service should:

1. Load and authorize the business and source record server-side.
2. Lock the source record and relevant balances where supported.
3. Validate source status, currency, amount, customer, and idempotency key.
4. Build candidate journal lines from trusted server-side data, not client-supplied debit/credit values.
5. Validate line count, accounts, currency, positive amounts, and debit/credit equality.
6. Insert the journal header and all lines in one database transaction.
7. Change source posting state and write a safe audit event in the same transaction.
8. Commit only after every invariant passes; roll back all changes on any failure.
9. Return the existing posted entry for an identical idempotent request, or reject conflicting reuse of the key.
10. Never call an external AI model to choose or post accounting entries.

## 6. Reversals, corrections, and period locks

- Reversals reference the original entry and reproduce its amounts with debits and credits swapped.
- A reversal must be idempotent; the same posted entry cannot be reversed twice.
- Corrections are represented as reversal plus replacement, preserving links and audit history.
- Closed periods reject new entries and reversals dated inside the closed period unless an owner-authorized, audited reopening process is approved.
- Period close should check unallocated receipts, unbalanced draft entries, reconciliation status, missing tax configuration, and inventory valuation gaps.
- Never backdate silently. Keep source event date, posting date, and correction reason distinct.

## 7. Migration and historical reconciliation plan

Do not bulk-post existing records as part of the initial schema migration.

1. Add new tables and constraints in an additive migration tested against PostgreSQL.
2. Deploy schema-only changes with posting disabled.
3. Run read-only source audits by business and currency: issued invoices, allocations, unallocated receipts, expenses, returns, inventory movements, voids, missing customers, and currency mismatches.
4. Define opening balances and source-event eligibility with the business owner/accounting reviewer.
5. Generate a dry-run report with expected journal entries and per-currency trial-balance totals.
6. Reconcile invoice totals, receipts, expenses, and opening balances to approved source-of-truth records.
7. Have an independent reviewer sign off on the dry-run output and rollback/restore plan.
8. Enable posting for new events behind a feature flag only after posting service and integration tests pass.
9. Backfill historical events in small idempotent batches only after explicit approval, with resumability and an auditable result log.
10. Verify the trial balance per business and currency before considering historical posting complete.

No customer assignment, invoice total, payment, allocation, or historical balance should be guessed or silently rewritten to make reconciliation pass.

## 8. Required test matrix

- Balanced and unbalanced entries; zero, negative, excessive precision, and overflow amounts.
- Exactly one debit/credit side per line.
- Cross-business account, source, entry, and line references rejected.
- Duplicate idempotency key and conflicting reuse.
- Concurrent attempts to post the same source event produce one entry only.
- Concurrent allocation/receipt activity cannot create an invalid receivable balance.
- Currency mismatch rejected or surfaced as an explicit data-quality failure; no cross-currency balancing.
- Reversal of a posted entry, duplicate reversal rejection, and immutable original lines.
- Closed-period rejection and audited reopening.
- Transaction rollback leaves no partial journal lines or source-state changes.
- PostgreSQL migration and constraint tests, not SQLite-only coverage.
- Trial-balance equality by business and currency.

## 9. Rollout gates

Do not enable production posting until all are true:

- An accounting reviewer approves the accounting basis, chart of accounts, tax handling, returns/refunds, and opening balances.
- An independent engineer reviews schema, posting transaction, idempotency, tenant isolation, and rollback behavior.
- PostgreSQL integration tests and migrations pass.
- Dry-run reconciliation has no unexplained difference.
- Backup restoration has been tested.
- A feature flag and rollback/disable procedure are documented.
- The production deployment is verified against the intended commit.

## 10. Decisions still required

1. Accrual basis and recognition date for revenue and expenses.
2. Whether tax is inclusive/exclusive and how tax liabilities are represented.
3. Whether inventory is in scope for the first ledger release or explicitly deferred until cost layers/COGS are ready.
4. The default chart-of-accounts template and permitted customization.
5. Whether multi-currency uses transaction-currency ledgers, functional currency, or both, and the FX source/date policy.
6. Who provides independent accounting approval and who provides independent code review.

**Current recommendation:** implement the ledger schema and posting engine only after this design is reviewed. Keep existing operational reports clearly labeled as preliminary until reconciled to the ledger.