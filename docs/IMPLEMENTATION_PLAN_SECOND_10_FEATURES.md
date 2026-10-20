# Second 10 Product Features — Proposed Roadmap

- **Status:** Proposed extension; feature order is a working plan and does not mean the features are implemented.
- **Architecture:** Follow accepted ADR-001: Angular + FastAPI + PostgreSQL, SQLAlchemy/Alembic, Pydantic, pytest.
- **Safety:** Local-first. No deployment, paid services, Firebase changes, or production data. Every feature is delivered through a reviewable PR and is not merged without explicit approval.

## Feature order

| # | Feature | Acceptance criteria |
|---|---|---|
| 11 | Inventory and auditable stock movements | Products can be stock-tracked; receipts, sales, returns, and adjustments are recorded as signed movements; quantities are derived from movements rather than silently overwritten; cross-business references are rejected. |
| 12 | Supplier directory | Supplier records are business-scoped, searchable, and deactivatable; supplier contact details are validated. |
| 13 | Purchase orders and receiving | Draft/approved/received lifecycle; partial receipts supported; receiving creates stock movements; duplicate receipt requests are idempotent or rejected. |
| 14 | Sales returns and credit notes | Returns reference original invoices/lines; returned quantities cannot exceed eligible sold quantities; financial and stock effects are auditable. |
| 15 | Recurring invoices | Explicit schedule, timezone, next-run state, and idempotency; generated invoices remain drafts until the owner chooses otherwise. |
| 16 | Tax and discount rules | Tax/discount scope and rounding are explicit; server computes totals; invoice snapshots preserve the rules used at issue time. |
| 17 | Reminders and notifications | Due-date and low-stock notifications are scoped to authorized businesses; delivery attempts are tracked and deduplicated. |
| 18 | Data import and export | Validated CSV templates, preview-before-import, row-level errors, duplicate handling, and export scoping; no secrets or cross-business leakage. |
| 19 | Audit trail and activity history | Sensitive business and financial actions record actor, action, target, timestamp, and safe change metadata; logs exclude credentials and unnecessary personal data. |
| 20 | Business settings, permissions, and integrations foundation | Explicit settings and permission matrix; integrations use documented secret-handling boundaries and are disabled until configured; no provider is silently selected. |

## Delivery sequence

Start with feature 11 because inventory accuracy depends on immutable-style stock movement records and a business-scoped product catalog. The first slice is database groundwork only: product and stock-movement models, a reversible Alembic migration, and schema-level tests. API endpoints, authentication, tenant authorization, and live PostgreSQL integration tests remain separate work and must be completed before this schema is used by clients.

## Definition of done

- Document API contracts and validation before exposing endpoints.
- Enforce authorization and business scope at the trusted backend boundary.
- Test success, invalid input, duplicate submissions, permissions, and cross-business access as applicable.
- Use exact Decimal/NUMERIC for money and explicit quantity precision for stock.
- Keep financial/stock history auditable; never silently overwrite issued financial events or historical stock.
- Verify migrations against PostgreSQL in CI before calling them integration-tested.
- CI passes on the exact commit under review.
- No PR merge without explicit owner approval.
