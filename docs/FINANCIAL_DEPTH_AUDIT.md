# Financial depth audit — Hasso vs NMS, column by column (C2 — 3A-726)

**Anchor:** NMS charges **1,200 EGP/month per centre** and owns
cashbox + purchasing + sales. This guide lists every NMS capability
column against Hasso's shipped state — **shipped / partial /
missing, with the file or route as evidence** — so «NMS has full
financial depth» stops being a slogan and becomes a shippable
list. Verdicts were read from the code on 2026-11-25, not from a
claim.

## Purchases

| Capability | Verdict | Evidence |
|---|---|---|
| Supplier directory (create/list) | **Shipped** | `POST /suppliers` (`backend/app/api.py:175`), `GET /suppliers` (`backend/app/extended_api.py:256`) |
| Purchase-order lifecycle: draft → approve → receive → cancel, duplicate, full draft replacement | **Shipped** | Create/duplicate/approve/receive `backend/app/extended_api.py:405,450,521,555`; cancel (draft-only) + full draft replacement `backend/app/purchasing_api.py:175,231` |
| Stock receipt with per-line quantities + idempotency | **Shipped** | `POST /purchase-orders/{id}/receive` (Idempotency-Key, `PurchaseReceiptIdempotency`), migration `0010_stock_movement_idem` |
| Partial receipt (`partially_received`) | **Shipped** | `PurchaseOrder` status check constraint (`backend/app/models.py:462`) |
| Supplier bills | **Missing** | Stated in `backend/app/purchasing_api.py:4` — «It does not implement supplier bills, payables, payments, inventory valuation or COGS» |
| Supplier payments | **Missing** | Same module docstring; no payment model or route touches suppliers |
| Payables visibility (what is owed, per supplier) | **Closed in C2** | `GET /reports/payables-aging` (`backend/app/extended_api.py`) — ordered/received/outstanding per supplier and currency. Outstanding equals received totals until supplier payments exist; the response says so |
| Purchase returns (return received goods to a supplier) | **Missing** | No model, no route; sales returns exist (`SalesReturn`), purchase returns do not |
| Inventory valuation / COGS | **Missing** | Same module docstring; profit-loss counts invoiced revenue minus recorded expenses only (`backend/app/core_features_api.py:944`) — purchase costs never enter it |

## Sales

| Capability | Verdict | Evidence |
|---|---|---|
| Invoice cycle: create / issue / void / duplicate / patch | **Shipped** | `backend/app/api.py:193,204,216,240,253,265` |
| Payments + allocations to invoices | **Shipped** | `POST /payments` (`backend/app/api.py:384`); `PaymentAllocation` (`backend/app/models.py:404`) |
| Credit notes (via sales returns) | **Shipped** | `POST /sales-returns/{id}/credit-note` (`backend/app/extended_api.py:945`) |
| Sales returns (create / approve / credit note) | **Shipped** | `backend/app/extended_api.py:757,818,945` |
| Recurring invoices | **Partial** | Schedules are created and listed (`backend/app/extended_api.py:308,1083`) — but **nothing ever runs a due schedule**: `next_run_at` is only read for list ordering; no runner, no job, no cron issues an invoice from a schedule |
| Pricing rules | **Partial** | Rules are created and listed (`backend/app/extended_api.py:1117`) — but **nothing ever applies one**: zero references outside creation + export; invoice totals never consult a rule |
| Receivables aging (per customer, per currency) | **Shipped** | `GET /reports/receivables-aging` (`backend/app/extended_api.py:1793`) |
| Profit-loss summary | **Partial** | `GET /businesses/{id}/profit-loss` — invoiced revenue minus recorded expenses; purchases and COGS absent (see above) |
| Tax summary | **Shipped** | `GET /reports/tax-summary` (`backend/app/extended_api.py:361`) |
| Data-integrity report | **Shipped** | `GET /reports/data-integrity` (`backend/app/extended_api.py:2229`) |

## What Hasso must ship to be price-comparable at the 1,200 EGP anchor

In the order the plan already sequences them — no new decisions
here, only the mapping:

1. **Supplier bills + supplier payments** — the payables side of
   the ledger. Owns: Stage C follow-up (the payables report in C2
   is visibility only; bills/payments need a model + migration +
   a payment rule — a financial-semantics decision, owner-gated
   like T37).
2. **Purchase returns** — the mirror of sales returns. Owns: C5
   (inventory counts/transfers) or C4, by the stock-movement
   contract.
3. **Recurring-invoice execution** — a due schedule must issue an
   invoice (with idempotency + audit). Owns: D2 (durable
   execution) — it needs a scheduler, not a one-off endpoint.
4. **Pricing-rule application** — rules must actually price an
   invoice. Owns: C2 follow-up — applying a rule changes invoice
   totals, so it is a calculation change and needs the owner's
   explicit decision under the batch constants.
5. **Inventory valuation / COGS** — purchases must flow into
   profit-loss. Owns: C5/C6 — needs a valuation policy (FIFO /
   average) decided before any code.
6. **Cashbox** — NMS's third leg. ✅ Shipped in C3 (3A-727, PR #480, migration 0013).

None of these is a pricing decision: the commercial model and the
price itself remain the owner's call (plan decision point 3). This
guide only states what the product must do for the comparison to
be honest.

## Addendum — independent cross-check (2026-11-25)

The column list above was cross-checked with **Gemini**
(`gemini-3.1-flash-lite`, via the company AI-tools registry,
3A-380), which proposed 8 standard SMB capabilities outside the
list. Each was verified against the code before being recorded:

- **New verified gaps (absent — zero references in the backend):**
  quotes/estimates (pre-order documents); customer/vendor
  statement generation (periodic balance summaries); bank feeds /
  bank reconciliation.
- **Folded into existing columns:** landed-cost allocation
  (freight/duties into inventory value) belongs to the
  valuation/COGS gap; FX gain/loss on multi-currency settlement
  is a missing column adjacent to it (currencies are kept
  separate everywhere today, so no gain/loss is ever computed).
- **Already planned, not new:** inventory adjustments / stock
  takes (plan task C5); chart of accounts / general ledger (plan
  task C1, gated on the owner's T37 decision).
- **Rejected after verification:** user roles & permission
  controls — already shipped (the route × role × tenant matrix);
  the suggestion did not survive contact with the code.
