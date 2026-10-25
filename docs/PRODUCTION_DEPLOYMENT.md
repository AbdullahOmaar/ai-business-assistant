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


## Release 0.2.0 authorization and restore gates

The current application defines only `OWNER` and `STAFF`. The approved least-privilege policy is enforced on the API (never only in the UI):

- OWNER only: issue or void invoices; record payments; post stock movements; receive purchase orders; approve sales returns; change pricing rules or business settings; deactivate customers/products; preview or execute bulk CSV imports; export CSV.
- STAFF: read workspace-scoped records and reports, manage ordinary customer/product data, create/edit draft invoices, create draft sales returns, and create expenses/purchase orders. Any action not explicitly granted must remain denied by default.
- Every sensitive route needs a STAFF-denied test and a positive OWNER test. Tenant isolation must be tested independently by attempting to use another business's IDs.

Firebase token acceptance must be tied to the configured project: validate the Admin SDK result's `aud` against `FIREBASE_PROJECT_ID` and `iss` against `https://securetoken.google.com/{FIREBASE_PROJECT_ID}`. Invalid, expired, revoked, and foreign-project tokens must fail closed with no principal.

### Backup/restore acceptance

A successful migration test against a disposable PostgreSQL database is not evidence that production backups can be restored. Before production approval:

1. Confirm the active Neon plan, free quota, branch/snapshot limits, and potential storage/compute charges.
2. If and only if the drill can be completed without paid resources (or the owner separately approves the exact cost), create a recovery point and restore it to a separate branch/database. Never overwrite the production branch.
3. Compare schema/migration revision, row counts and critical relationships; verify representative invoice, payment, allocation, stock movement, and sales-return totals without exposing customer data in logs.
4. Run application smoke tests against the restored database and record duration, errors, and the cleanup plan.
5. If the plan or cost cannot be verified, leave the restore gate open; do not create snapshots, compute, or upgrade resources.

### Current release blockers

- CI must pass on the exact final candidate commit, including OWNER/STAFF route tests and the foreign-project Firebase token test.
- The actual backup/restore drill must be proven with a confirmed zero-cost path.
- The owner must explicitly approve the final merge and production deployment.
- After deployment, verify `/health`, `/readyz`, `/version`, Firebase login, workspace isolation, invoice creation/issue, payment, returns, and installed-PWA update on a mobile device.

## Release trigger — v0.2.0

- Release source commit: `0754a5c2887726f7c6b03f3fdba83f6b104e6272`.
- Backend tests, backend container verification, backend/frontend verification, and Python/JavaScript dependency audits passed on the release candidate.
- The initial Vercel production hooks were intentionally skipped because the squash commit did not contain the projects' required `[release-web]` / `[release-api]` build markers. A follow-up release-marker commit is used to trigger those configured deployments; this documentation update does not change application behavior.
- No production schema migration or production data rewrite is included in this release.

## Mobile version visibility follow-up

- Follow-up commit: `7a62565fecc1d46781a8ec50c24da0c807cc79c7`.
- The compact mobile version row is rendered inside the visible main content because the full top bar is hidden at narrow widths.
- Frontend CI and dependency audit passed before merge. Verify the deployed UI and installed-PWA cache after the release-marker deployment completes.
