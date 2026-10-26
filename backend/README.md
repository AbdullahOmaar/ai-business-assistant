# Backend — AI Business Assistant API

This directory contains the current FastAPI backend for the existing AI Business Assistant application. It includes HTTP routers for workspace/core business workflows, extended operations, and assistant interactions; SQLAlchemy models/services; Alembic migrations; and Firebase ID-token verification.

**Release status:** source implementation does not by itself establish production readiness. Do not use real customer or financial data until the release gates in [the root README](../README.md) and [production deployment runbook](../docs/PRODUCTION_DEPLOYMENT.md) are satisfied. The latest reviewed main commit did not have passing CI evidence.

## Stack

- Python 3.12+
- FastAPI and Pydantic
- SQLAlchemy 2.x and Alembic
- PostgreSQL with psycopg 3
- Firebase Admin SDK for verifying Firebase ID tokens
- pytest for tests

See `pyproject.toml` and `requirements.txt` for declared dependencies.

## Local setup

From this directory:

```bash
python -m venv .venv
# Activate the virtual environment, then:
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
```

Configure a disposable local PostgreSQL database in `.env`. Never commit `.env`, service-account JSON, database credentials, or provider API keys.

Apply and inspect migrations:

```bash
python -m alembic upgrade head
python -m alembic current
python -m alembic check
```

Run tests:

```bash
python -m pytest -q
```

Start the API locally:

```bash
uvicorn app.main:app --reload
```

Open `/docs` for the generated API documentation and `/health` for process liveness.

## Runtime configuration

The backend uses environment configuration. Relevant settings include:

- `DATABASE_URL`: PostgreSQL connection URL. A database engine/session factory is initialized when this is configured.
- `FIREBASE_PROJECT_ID`: Firebase project ID expected by the token verifier.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: optional service-account JSON supplied as a server-side secret. If omitted, the Firebase Admin SDK uses Application Default Credentials.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact frontend origins permitted by CORS.
- `OPENAI_API_KEY`: backend-only key for generative assistant behavior, when configured.

Do not place server credentials in the frontend runtime configuration or browser bundle. The Firebase web-app settings in `frontend/public/runtime-config.json` are public client configuration; they are not a substitute for backend credentials.

## Health and readiness

- `GET /health` reports process liveness only. It does not prove that PostgreSQL or authentication is configured.
- `GET /readyz` returns ready only when the database session factory and trusted Firebase principal resolver are configured and a database query succeeds.
- `GET /version` reports API version, short commit metadata when supplied by the deployment platform, and environment metadata.

A successful `/health` response is not a production-readiness check.

## Existing backend areas

The current source includes:

- Workspace creation/profile, membership-scoped workspace listing, and dashboard aggregation.
- Customer, supplier, product, invoice draft/issue/void, payment allocation, and stock movement workflows.
- Expenses, purchasing/receiving, sales returns, recurring invoice schedule records, pricing rules, notifications, business settings, and currency-separated reports.
- CSV import/export routes and record-grounded assistant interactions.
- Decimal-based invoice calculations, payment allocation rules, stock movement calculations, audit events, and workspace membership authorization.

Availability of a model, service, or route does not prove every operational workflow is complete or suitable for production. Use the route inventory and tests to verify behavior before relying on any capability.

## Known limitations and release gates

The following limitations are documented in the repository and must not be represented as completed capabilities:

- The operational profit/loss report is preliminary; it is not a general ledger or a net-profit calculation.
- Inventory cost valuation/COGS, jurisdiction-specific tax filing, foreign-exchange accounting, double-entry journals, bank reconciliation, and period-close controls are not implemented.
- Recurring invoice schedules do not themselves guarantee automatic invoice generation; a deployed scheduler/worker is required.
- Notification queue metadata does not prove external notification delivery; a delivery provider/worker must be configured.
- Expense attachment storage and background workers require explicit configuration before they can be considered operational.
- PostgreSQL-specific concurrency coverage is required for payment idempotency/allocation and stock updates; in-memory/SQLite unit tests alone do not prove production database locking behavior.
- Real production Firebase/PostgreSQL configuration, authenticated smoke tests, CI passing for the release commit, deployed commit verification, and Android Chrome/PWA checks remain release gates.

## Security and transaction expectations

- Business-data requests must use a trusted verified Firebase ID token; never construct a principal from client-supplied user IDs or arbitrary headers.
- Every sensitive read/write must enforce active membership and scope referenced records to the requested business.
- Workflow services flush but do not commit; API/request-layer transaction handling is responsible for committing or rolling back the complete operation.
- Keep payment, invoice, and stock operations transactional and idempotent where applicable.
- Never use production customer/financial records as destructive test fixtures. Do not run migrations or rewrite historical records without an approved migration, backup, and rollback plan.

For the current release decision and required verification sequence, see [Production Readiness Audit — 2026-10-26](PRODUCTION_READINESS_AUDIT_2026-10-26.md) and [Production Deployment](../docs/PRODUCTION_DEPLOYMENT.md).
