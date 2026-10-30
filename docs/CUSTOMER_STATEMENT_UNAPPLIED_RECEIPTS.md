# Customer statement — unapplied receipt visibility

The customer statement now includes a read-only `unapplied_receipt` event when a recorded payment has a positive remainder after its same-currency invoice allocations.

- A fully unallocated receipt is shown in full.
- A partially allocated receipt shows only its positive remainder.
- A fully allocated receipt does not produce an unapplied-receipt event.
- The event is displayed in the statement's credit column for visibility, but `affects_balance=false`; it never reduces invoice receivables or changes the running customer balance.
- A payment with any currency-mismatched allocation is excluded from remainder calculation until the data anomaly is reconciled. The existing mismatch allocation event remains informational and does not affect balances.
- Payments and allocations are filtered by the authenticated business and selected customer. No records are created or modified by statement reads.
- Existing date filtering continues to use the endpoint's current timestamp-date behavior. This change does not claim business-local date or DST semantics; coordinate those boundaries with T40.
- Credit notes, approved-return receivable credits, refunds and double-entry ledger treatment remain outside this display-only change.

The focused regression covers unallocated, partially allocated and fully allocated receipts, stable receivable balances, pagination event count, and absence of payment/allocation/audit side effects. Execution remains NOT RUN until an authorized exact-SHA runner is available.
