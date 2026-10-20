# Backend — local starter

This is a deliberately small, local-development-only FastAPI starter.

## Run the API locally

Python 3.11+ is recommended.

```bash
python -m venv .venv
# Activate the virtual environment, then:
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for interactive API docs and `http://127.0.0.1:8000/health` for the health endpoint.

## Test

```bash
python -m pytest -q
```

## Initial data model proposal

`app/models.py` defines `Business` and `BusinessMembership` as an initial tenant-isolation foundation. Firebase Auth UIDs are represented as external identity subjects; no passwords are stored. Membership is unique per business and user identity, with `owner` and `staff` roles.

This is only a model proposal: no database URL, connection pool, migration, login verification, authorization dependency, or business-data endpoints are wired yet. Model declarations alone do not enforce tenant isolation.

## Current limits and safety

- No database connection or migrations yet.
- No authentication or tenant authorization yet.
- No business or financial endpoints yet.
- Do not use this starter with real customer or financial data.
- Firebase, cloud resources, and paid services are not changed or configured by this starter.
