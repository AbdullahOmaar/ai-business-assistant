# Backend hosting notes

The backend remains FastAPI/Python and PostgreSQL; Firebase Authentication remains the identity provider. `backend/api/index.py` is the serverless entry point for Vercel when the Vercel project root directory is set to `backend`.

## Deployment behavior

- A Vercel project must use `backend` as its Root Directory and be linked to this Git repository.
- Runtime settings such as `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CORS_ALLOWED_ORIGINS`, and optional `OPENAI_API_KEY` belong in the host's encrypted environment settings, never in Git.
- The service can start without a database configured, but database-dependent routes and readiness checks will not be production-ready until a PostgreSQL URL is supplied.
- Do not use a transient CI PostgreSQL service as the production database. GitHub Actions' PostgreSQL service is only for tests and is discarded after the workflow.
- Serverless deployment is a compatibility option, not a claim that Firebase Hosting runs Python. Cloud Run is the Google Cloud-native option for a persistent/containerized FastAPI service, and its billing requirements must be checked before use.

## Health checks

`/health` checks process liveness. `/readyz` checks required production dependencies and should be used to confirm operational readiness after secrets and a durable database are configured.
