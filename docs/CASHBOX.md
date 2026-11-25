# Cashbox — physical cash for centres (C3, 3A-727)

The cashbox records the physical cash in a centre's drawer:
openings, deposits, withdrawals, and a daily close with a
documented handover receipt. It is one of the three legs of
the NMS market anchor (cashbox + purchasing + sales at
1,200 EGP/month per centre — see
`docs/FINANCIAL_DEPTH_AUDIT.md`).

## Semantics

- **The balance is computed, never stored:** opening +
  deposits − withdrawals, per currency. Currencies are never
  combined.
- **Entries are append-only.** There is no edit and no
  delete endpoint: a mistake is corrected by a counter-entry
  with its reason, so the trail stays complete.
- **A withdrawal larger than the current balance is
  rejected** (422): the drawer cannot pay out cash it does
  not hold.
- **Every movement writes an audit event** (`cashbox.opened`
  / `cashbox.deposit` / `cashbox.withdrawal` /
  `cashbox.closed`) naming the amount, the currency and the
  reason. Cash amounts are operational data, not secrets.
- **The cashbox is not** a bank account, not a second
  ledger, and not a replacement for expenses or payments:
  expenses record what was spent and why; the cashbox
  records what physically moved through the drawer.

## Roles

- **Recording a movement: any member** — the same pattern as
  expenses and payments; the person at the drawer is usually
  staff.
- **Closing the day: owner only** — the close is the control
  point (counted amount, variance, handover).

## The daily close

`POST /cashbox/close` (owner) records, per currency and day:

- **expected** — the computed balance at close time;
- **counted** — what was physically in the drawer;
- **variance** — counted − expected (may be negative; a
  variance is recorded, never hidden or auto-corrected);
- **the handover receipt** — `handed_by`, `received_by`,
  and an optional note.

One closing per business, currency and day; a second close
for the same day is rejected (422). Closings are listed by
`GET /cashbox/closings`.

## Data lifecycle

Cashbox entries and closings are part of the full business
export (`GET /businesses/{id}/export`, B3) and are removed
by the deleted-business purge with the rest of the
business's rows. Migration `0013_cashbox` is additive only;
its downgrade drops both tables.
