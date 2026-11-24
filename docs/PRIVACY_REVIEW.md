# Privacy review — who sees what (B4 — 3A-722)

The review behind `docs/PRIVACY_PROMISE.md`: the who-sees-what map
read from the code, the check of every promise clause against the
mechanism that enforces it, and the gaps that are tracked, not
hidden. Read 2026-11-24 against main `74840de` (B3 merged).

## 1. Who sees what — roles × data

Proven by the route × role × tenant matrix (91 routes, denial +
owner-positive) and `app/security.py:authorize_membership`.

| Actor | Business profile | Customers / suppliers / products | Invoices / payments / expenses | Payroll (amounts, records) | Settings | Audit events | Full export | Platform audit |
|---|---|---|---|---|---|---|---|---|
| Owner | read + edit | full | full | full | edit | read | yes | no |
| Staff member | read | full (except payroll-linked expenses) | full (except payroll-linked expenses) | **never** (amounts + records hidden by `apply_expense_visibility`) | read only | read | no | no |
| Non-member / unauthenticated | **no** (403/401) | no | no | no | no | no | no | no |
| Cross-tenant owner (another business) | no | no | no | no | no | no | no | no |
| Platform viewer | metadata only (name, member count, status) | no | no | no | no | platform audit only | no | yes (platform) |
| Workspace operator | metadata + can toggle business status | no | no | no | no | platform audit only | no | yes (platform) |
| User manager | metadata + user list | no | no | no | no | platform audit only | no | yes (platform) |
| Platform super admin | metadata | no | no | no | no | platform audit only | no | yes (platform) |

Key points:

- **No platform role can read a business's financial rows.**
  The platform surface is `GET /platform-admin/businesses`
  (metadata + member count) and `GET /platform-admin/businesses/{id}`
  (metadata + membership roles; its docstring: "never returns
  credentials or tokens"). There is no platform route into
  customers, invoices, payments, payroll or exports.
- **Payroll is hidden by construction, not by the UI.**
  `apply_expense_visibility` (app/security.py) removes
  payroll-linked expenses from every read surface for non-owners —
  reports, exports, and the assistant context.
- **A soft-deleted business is invisible to everyone.**
  `authorize_membership` requires an active business; deletion
  (B3) cuts access in the same transaction that stamps it.
- **The demo account is the one shared surface.** Its credentials
  are public by design and its data is visible to anyone with
  them — the promise states this as an exception, and no real
  data may go in it.

## 2. The assistant's data flow

Per question, and only when the user asks (assistant_api.py):

1. Membership is checked for the caller's business; the context is
   built from **that business only**.
2. The context is bounded: the **20 most recent issued invoices**,
   the **20 most recent expenses** (payroll-linked ones removed
   for non-owners), and counts (products, customers, suppliers,
   issued/draft invoices). Nothing else — no payroll records, no
   employee salaries, no customer directory, no settings.
3. The request carries the last **8 messages of client-supplied
   history** (the backend stores no conversation history — there
   is no assistant-history table; history lives with the client).
4. The payload goes to the configured model provider — the
   hardcoded OpenAI-compatible endpoint
   `https://api.openai.com/v1/chat/completions`, model from
   `OPENAI_MODEL` (default `gpt-4.1-mini`), key from
   `OPENAI_API_KEY`. Without a key the assistant answers from the
   local fallback and sends nothing anywhere.
5. The system prompt binds the model to the supplied records
   only ("using only the JSON business records supplied in this
   request"), forbids inventing figures, and requires source
   citations; cited source ids are re-checked against the supplied
   set before the answer is returned.
6. **Nothing is stored server-side from a question.** No record of
   the question, the context, or the answer is persisted.

## 3. Third parties — what leaves حسو

| Party | What it receives | What it does NOT receive |
|---|---|---|
| Firebase Auth (identity) | The user's subject + tokens for sign-in | Business data |
| Neon PostgreSQL (the database) | All business data (it IS the database) | — |
| Vercel (hosting) | The running app + its requests | Business data is not stored by the host |
| OpenAI-compatible provider (assistant only) | Per-question bounded records ( §2 ) | Payroll records, settings, audit events, other businesses |
| Sentry (error reporting) | Error reports only; `send_default_pii=False`, traces off | Request bodies, headers, cookies, user identity, business data |
| Demo rate limiting | A **hash** of the client key (`key_hash`) + a window counter | The raw IP address |

## 4. Zero data retention (ZDR) + data sovereignty — the position

What "zero data retention" means for حسو today, stated plainly:

- **We keep no copy of your data outside your business's
  database.** The assistant sends bounded records per request
  and stores nothing from them; the export is generated on
  demand and not kept; Sentry carries no business data.
- **Deletion is real** (B3): access ends immediately; the purge
  removes the rows after 30 days; the export is yours to keep.
- **Sovereignty is partial and must be said so.** The database
  (Neon) and the host (Vercel) are third-party managed services;
  حسو does not run its own servers. No claim is made about a
  country of residence for the data until the regions are pinned
  in writing (GAP-2).

## 5. Gaps — tracked, not hidden

- **GAP-1 — Model-provider retention terms unverified (owner:
  manager).** The assistant sends records to an OpenAI-compatible
  endpoint. The provider's own API data-retention terms and any
  zero-retention option have NOT been verified from the provider's
  documentation in this task. Until verified, the promise must
  not claim "the provider keeps nothing" — it claims only what
  حسو does (sends per request, stores nothing). Verify + record
  the terms before any marketing use of a ZDR claim.
- **GAP-2 — Data residency not pinned (owner: manager).** The
  Neon project region and the Vercel region are not recorded in
  `docs/ENVIRONMENT_PARITY.md`. Pin both in writing before any
  sovereignty claim is published.
- **GAP-3 — Demo-account boundary (owner: —, already handled).**
  The demo business is shared and public by design. The promise
  states the exception; no further action.

## 6. Promise-vs-code check

| Promise clause | Mechanism | Evidence |
|---|---|---|
| Never sold / shared / used to train | No pipeline sends business data to a training endpoint; the only outbound business-data flow is the per-question assistant call | §2, §3; assistant_api.py |
| Platform team never reads financial rows | No platform route reaches business rows; platform roles are metadata-only | §1; platform_admin_api.py; matrix |
| Staff never sees payroll amounts | `apply_expense_visibility` on every read surface incl. assistant | security.py; test_financial_report_tenant_privacy.py |
| Assistant sees the minimum, only when asked | Bounded 20+20 context, client-supplied history only, no server storage | §2; assistant_api.py |
| Full export + real deletion | B3: export with manifest; soft delete + 30-day purge | RETENTION_AND_DELETION.md; matrix |
| Demo exception | Shared demo credentials by design | §1; demo_auth_api.py |
