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

The first migration creates `businesses` and `business_memberships`. The migration runner requires a PostgreSQL URL and refuses SQLite. No cloud database is configured or provisioned.

## Tests

```bash
python -m pytest -q
```

The current automated tests cover the health endpoint, initial SQLAlchemy model declarations, PostgreSQL URL validation, and documented membership role values. They do not yet exercise a live PostgreSQL database. PostgreSQL-backed migration and authorization tests are required before these workflows are considered verified.

## Initial data model

- `Business` is the tenant/workspace record.
- `BusinessMembership` links a provider-neutral external identity reference to a business and assigns an `owner` or `staff` role.
- A database uniqueness constraint prevents duplicate membership for the same identity in the same business.

This schema is groundwork only. It does not authenticate identities, verify tokens, or enforce request-level tenant authorization. Do not expose business-data endpoints until authentication and server-side membership checks are designed and tested.

## Current limits and safety

- No customer, product, invoice, payment, or expense endpoints yet.
- No authentication or tenant authorization yet.
- No provider integration is selected by this starter.
- Firebase, cloud resources, deployments, and paid services are not changed or configured by this starter.
