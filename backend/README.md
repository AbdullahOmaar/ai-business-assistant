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

Migrations require PostgreSQL and refuse SQLite. GitHub Actions starts a disposable PostgreSQL 16 service, applies all migrations against it, checks the migration head, runs tests, and also renders the migration SQL offline. This is CI-only infrastructure; no hosted or production database is created.

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

The `app/domain_rules.py` module contains pure, unit-tested calculations for invoice totals, payment allocation limits, derived stock balances, return quantities, and currency-separated report totals. The `app/services.py` module now adds transaction-scoped service functions for customer/supplier/product creation, stock movements, draft invoice creation and issue, payment recording/allocation, expense creation, and audit events. `app/operations.py` adds purchase-order receiving, sales-return approval, deduplicated notification queuing, and currency-separated financial summaries. Service and operation unit tests use an isolated in-memory SQLite database; PostgreSQL migrations are separately exercised in CI. Each service checks the verified principal's active business membership, scopes database queries by business, and flushes but never commits so the API/request layer can control the transaction.

## Critical limits and implementation status

These are domain foundations, **not a completed product**:

- The only HTTP endpoint is `GET /health`. Service functions are not exposed as business API endpoints yet; request/response schemas and an Angular UI are outstanding.
- Authentication token verification is not implemented, and the identity provider remains undecided. The `AuthenticatedPrincipal` type is only a boundary for a future trusted verifier; never construct it from request data. Do not expose business-data endpoints until trusted authentication and request-level authorization are implemented and tested.
- Transaction-scoped services currently cover customer/supplier/product creation, stock movements, invoice drafts and issue, payment recording/allocation, expenses, and audit events. Additional operations cover purchase receiving, return approval, notification queueing, and currency-separated summaries. CSV parsing/serialization helpers now exist, but there is no authenticated import/export endpoint or import-job processor.
- Payment retries now compare the stored payment request and allocations for an idempotency key. Invoice line rounding uses the explicit half-up money policy. Dedicated PostgreSQL concurrency/integration tests are still needed; in-memory SQLite tests do not prove row-lock behavior.
- Recurring invoice schedule execution, customer-facing reports, notification delivery, import/export job execution, and full tax/discount snapshots are not complete. Audit records are written by the service workflows but immutability/retention controls are not enforced yet.
- The read-only AI assistant and Angular screens are not implemented; no model provider has been selected.
- No Firebase changes, cloud resources, deployments, or paid services are included.
