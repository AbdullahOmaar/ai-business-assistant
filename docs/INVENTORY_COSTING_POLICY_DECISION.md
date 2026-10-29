# Inventory Costing Policy Decision — Feature 32

## Decision required before valuation code

The existing inventory workflow records quantities and purchase-line unit-cost snapshots, but it does not define the accounting policy used to value stock issues and returns. COGS and return reversals must not be implemented until the business owner chooses one policy:

### Option A — FIFO

- Each receipt creates an immutable cost layer with remaining quantity and unit cost.
- Sales consume oldest available layers first.
- Returns reverse the original sale's cost allocation; they do not create a new layer at today's purchase cost.
- Pros: traceable receipt-level cost history and intuitive batch depletion.
- Trade-off: more allocation rows and careful locking required under concurrent sales.

### Option B — Moving weighted average

- Each receipt updates the weighted-average unit cost for the product/business.
- Sales snapshot the current average cost at issue time.
- Returns reverse the original sale's snapshotted COGS; the returned quantity's restock treatment must be explicitly defined.
- Pros: simpler valuation layers and smoother cost fluctuations.
- Trade-off: historical recomputation and concurrent receipt/sale ordering must be controlled.

## Shared non-negotiable invariants

- Cost values are server-derived from persisted purchase receipts/opening balances, never client-provided at invoice issue.
- Every stock movement has an immutable valuation posting or an explicit non-valued reason.
- A sale/return/void reversal references the original valuation posting and is idempotent.
- Negative available quantity or negative cost-layer balance is rejected unless a separately authorized backorder policy is approved.
- Tenant, product, currency, and unit-of-measure boundaries are enforced server-side.
- Historical issued invoice totals and historical COGS snapshots are never silently rewritten.
- P&L remains labelled preliminary until all relevant stock and non-stock costs are reconciled.

## Required owner decision

Choose exactly one: **FIFO** or **Moving Weighted Average**.

Do not build hybrid behavior or choose a default in code. Once selected, document the policy, opening-stock valuation method, return/void reversal semantics, and treatment of non-stock-tracked products before migrations are authored.
