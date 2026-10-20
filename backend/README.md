# Backend — local starter

This is a deliberately small, local-development-only FastAPI starter.

## Run locally

Python 3.11+ is recommended.

```bash
python -m venv .venv
# Activate the virtual environment, then:
python -m pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the interactive API docs and `http://127.0.0.1:8000/health` for the health endpoint.

## Test

```bash
python -m pytest
```

## Current limits

- No database connection or migrations yet.
- No authentication or tenant authorization yet.
- No business or financial endpoints yet.
- Do not use this starter with real customer or financial data.
- Firebase, cloud resources, and paid services are not changed or configured by this starter.
