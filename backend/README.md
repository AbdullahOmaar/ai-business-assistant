# Backend — local starter

This is a local-development-only FastAPI starter. It is not production-ready and must not be used with real customer or financial data.

## Run locally

Python 3.11+ and a local PostgreSQL installation are recommended.

```bash
python -m venv .venv
# Activate the virtual environment, then:
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for API docs and `http://127.0.0.1:8000/health` for process health. The health endpoint does not check database connectivity.

## Local PostgreSQL and migrations

1. Create a local PostgreSQL database named `ai_business_assistant`.
2. Copy `.env.example` to `.env` and configure local credentials. Never commit `.env` or secrets.
3. From this directory, run:

```bash
python -m alembic upgrade head
python -m alembic current
python -m pytest -q
```

Migrations require PostgreSQL and refuse SQLite. CI currently renders migration SQL without connecting to PostgreSQL; live migration integration is still required.

## Domain groundwork now modeled

- Business workspaces and memberships.
- Products and signed stock movements; stock balances should be derived from movements.
- Customers and suppliers.
- Invoice headers and line snapshots.
- Payments and invoice allocations with idempotency-key storage.
- Expenses.
- Purchase orders and order lines, including received quantities.
- Sales returns and return lines linked to original invoice lines.
- Recurring invoice schedules.
- Tax/discount pricing rules.
- Deduplicated notification metadata.
- Audit event metadata.
- Import/export job metadata.
- Business settings.

The `app/domain_rules.py` module contains pure, unit-tested calculations for invoice totals, payment allocation limits, derived stock balances, return quantities, and currency-separated report totals.

## Critical limits

These are domain foundations, **not all completed product features**:

- The only API endpoint is `GET /health`. There are no CRUD, inventory, invoice, payment, customer, supplier, reporting, import/export, or AI endpoints yet.
- There is no Angular UI yet.
- Authentication/token verification and request-level membership/role authorization are not implemented. Do not expose business-data endpoints until a trusted identity provider decision and server-side authorization are implemented and tested.
- Payment allocation and return rules have pure unit tests, but concurrency-safe database transactions, idempotent request handlers, and live PostgreSQL tests are not implemented.
- Invoice issuing/audit immutability, stock movement append-only enforcement, purchase receiving, recurring scheduling, tax snapshots, notification delivery, CSV processing, and audit event recording still need application services.
- The read-only AI assistant is not implemented and no model provider has been selected.
- No Firebase changes, cloud resources, deployments, or paid services are included.
