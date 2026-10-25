# Production deployment runbook

This application uses Angular + FastAPI + PostgreSQL. Firebase Authentication verifies identity; it is not a host for this Python API.

## Required backend environment

Set these as platform secrets/configuration (never commit real values):

- `DATABASE_URL`: PostgreSQL SQLAlchemy URL using `postgresql+psycopg://...`.
- `FIREBASE_PROJECT_ID`: exact Firebase project ID used by the frontend.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: service-account JSON for the same Firebase project, stored as a secret. Omit only when the host provides working Google Application Default Credentials.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact frontend origins, e.g. the Vercel production origin.
- `OPENAI_API_KEY`: optional. AI chat returns 503 until configured; keep this key backend-only.
- `OPENAI_MODEL`: optional; defaults to `gpt-4.1-mini`.

Run database migrations only as an explicitly approved release step after validating the target database and migration plan. Never point this command at production merely to test it. Before an existing production database is migrated, take a backup and verify that it can be restored to an isolated database; review the migration SQL and confirm the current production revision/schema. Test the upgrade against a disposable PostgreSQL database or restored non-production clone first. Do not migrate an existing production database from scratch or assume it is empty.

```bash
cd backend
alembic upgrade head
```

Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Health checks:
- `/health` is process liveness only.
- `/readyz` returns ready only when PostgreSQL connectivity and trusted Firebase token verification are configured.

## Frontend runtime configuration

The public runtime config contains only public Firebase web-app identifiers and the API base URL; never place service-account JSON or an OpenAI key in frontend assets. Configure:
- `apiBaseUrl`: deployed FastAPI origin, without a trailing slash.
- `firebase.apiKey`, `firebase.authDomain`, `firebase.projectId`, and `firebase.appId`: values from the intended Firebase web app.

Enable the Firebase Email/Password sign-in provider in the Firebase Console if that is the chosen sign-in method. Add the frontend's production domain to Firebase Authentication's authorized domains.

## Release gates

1. Verify CI passes on the exact release candidate SHA, including backend tests, frontend build/audit, and backend container verification.
2. Confirm the production database's current Alembic revision and schema without modifying data.
3. Take a production backup and prove it can be restored into an isolated non-production database; record recovery evidence.
4. Review migration SQL and run the migration against a disposable PostgreSQL database or restored non-production clone. Only run production migrations after explicit owner approval and the approved backup/rollback plan.
5. Confirm Firebase token verification rejects missing, expired, revoked, and wrong-project tokens in a controlled staging environment.
6. Test that a user cannot list, read, or mutate another workspace by changing `business_id`, resource IDs, or allocation references.
7. Configure exact CORS origins and confirm the frontend can sign in and make authenticated API calls.
8. Verify AI answers only cite source IDs returned by the current workspace; keep provider keys backend-only and test the no-key fallback.
9. Review Python and npm dependency audits and resolve release-blocking high-severity findings.
10. After an approved deployment, verify the deployed frontend/API SHAs, `/readyz`, sign-in, invoice/payment/return flows, and rollback procedure.

Do not reuse the existing inactive Supabase project named for n8n without explicit confirmation that it belongs to this app. Do not store production credentials in GitHub files.
