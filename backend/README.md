# Backend — local starter

This is a local-development-only FastAPI starter. It is not production-ready and must not be used with real customer or financial data.

## Run the API locally

Python 3.11+ and a local PostgreSQL installation are recommended.

```bash
python -m venv .venv
# Activate the virtual environment, then:
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for interactive API docs and `http://127.0.0.1:8000/health` for the process health endpoint. The health endpoint does not check database connectivity.

## Configure local PostgreSQL and migrations

1. Create a local PostgreSQL database named `ai_business_assistant` using your local PostgreSQL tools.
2. Copy `.env.example` to `.env` and replace the example username/password with credentials for your local database. Do not commit `.env` or real secrets.
3. From the `backend` directory, run:

```bash
python -m alembic upgrade head
python -m alembic current
```

The migrations create business workspaces/memberships, products, and stock movement records. The migration runner requires a PostgreSQL URL and refuses SQLite. No cloud database is configured or provisioned.

## Tests

```bash
python -m pytest -q
```

The current automated tests cover the health endpoint, model declarations and constraints, PostgreSQL URL validation, and migration SQL generation without a database connection. They do not yet exercise a live PostgreSQL database. PostgreSQL-backed migration, inventory transaction, and authorization tests are required before these workflows are considered verified.

## Initial data model

- `Business` is the tenant/workspace record.
- `BusinessMembership` links a provider-neutral external identity reference to a business and assigns an `owner` or `staff` role.
- `Product` is a business-scoped catalog item with exact `NUMERIC(14,2)` price storage and optional business-unique SKU.
- `StockMovement` records signed quantity changes using `NUMERIC(14,3)`; positive quantities add stock and negative quantities remove stock. Current quantity must be derived by summing these movements, not by trusting a client-supplied balance.
- A composite foreign key ensures a stock movement's product belongs to the same business recorded on the movement.

This schema is groundwork only. It does not authenticate identities, verify tokens, enforce request-level tenant authorization, implement stock transaction services, or make movement records immutable at the database level. Do not expose business-data endpoints until authentication and server-side membership checks are designed and tested. Stock-changing services must later enforce transaction safety and audit rules.

## Current limits and safety

- No customer, product, inventory, invoice, payment, or expense API endpoints yet.
- No authentication or tenant authorization yet.
- No provider integration is selected by this starter.
- Firebase, cloud resources, deployments, and paid services are not changed or configured by this starter.
