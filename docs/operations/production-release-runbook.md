# Production release, smoke-test, backup and rollback runbook

Last reviewed: 2026-10-22. This runbook records safe steps; it does not claim a backup restore or production smoke test has been performed.

## Release gates

Do not promote a preview until all are true:
- PR is reviewed; no unresolved P0 finding; merge commit and exact SHA are recorded.
- GitHub Actions for that exact SHA pass: backend tests against PostgreSQL, migration-head check, offline migration SQL, backend container, and frontend build/checks.
- Vercel frontend and backend preview deployments are `READY` for the intended source revision.
- Firebase Admin configuration and database connectivity are verified without printing secret values.
- Payment, tenant-isolation, invoice lifecycle and AI failure-path tests pass.
- A current recoverable database backup or provider restore point is confirmed before schema/data changes.

## Environment variable inventory (names only)

### Backend production
- `DATABASE_URL` — PostgreSQL connection string; sensitive.
- `FIREBASE_PROJECT_ID` — Firebase project identifier.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — sensitive Firebase Admin service-account JSON, never log or expose.
- `CORS_ALLOWED_ORIGINS` — comma-separated explicit production origins.
- `OPENAI_API_KEY` — sensitive; add only in the backend project's Vercel Environment Variables when enabling AI chat.
- `OPENAI_MODEL` — optional model override.

### Frontend production
- `frontend/public/runtime-config.json` contains public Firebase client config and `apiBaseUrl`; it must never contain server credentials or API keys intended to be secret.
- Confirm the deployed API URL is the intended production backend.

## Safe smoke test

After deployment:
1. Confirm frontend deployment state `READY` and record its commit SHA.
2. Confirm backend deployment state `READY` and record its commit SHA.
3. Request `GET /health` (process liveness) and `GET /readyz` (database and Firebase verifier configured). A 200 on `/health` alone is not readiness.
4. Load the app, sign in using a designated test account, list only that account's business workspaces, and open the dashboard.
5. Check customers/products/invoices/payments/expenses using safe reads. Do not create a real payment, issue/void a real invoice, or mutate stock as part of a generic smoke test.
6. Verify an unauthenticated business API request fails closed and a user without membership cannot read a different business.
7. Verify AI's expected behavior: if `OPENAI_API_KEY` is absent, return a safe 503; if enabled, ask a non-sensitive question and confirm no cross-business data is exposed.
8. Record response status, deployment SHA, time and any redacted error code. Never record tokens, service-account JSON, API keys, or full financial/customer payloads.

## Database migrations and backups

Before a release containing migrations:
1. Read the migration diff and generated SQL; reject destructive changes unless an approved data migration/restore plan exists.
2. Verify the provider's latest backup/restore point and retention in the database console. Record timestamp and recovery-point objective.
3. Prefer additive, backward-compatible migrations; deploy code that tolerates both old and new schema during rollout.
4. Do not run production migrations manually from an unreviewed local checkout.

Restore rehearsal (must be done in a safe target, not production):
1. Create an isolated temporary database/branch from a known backup or provider restore point.
2. Restore using the database provider's supported restore workflow.
3. Run migration/version checks and representative read-only reconciliation queries.
4. Record restore start/end time, data timestamp, row-count/financial-total checks and cleanup.
5. Delete the temporary restored target only after evidence is saved. This repository has not yet recorded a completed restore rehearsal.

## Rollback

- Frontend-only issue: promote the last known-good Vercel frontend deployment; verify its SHA and smoke-test login/navigation.
- Backend code issue without schema change: redeploy/promote the last known-good backend deployment, then verify `/health`, `/readyz`, auth and read-only endpoints.
- If schema changed: do not assume code rollback alone is safe. Check migration compatibility and data writes first; restore only under the approved recovery plan.
- Roll back immediately for cross-tenant exposure, financial balance mismatch, auth bypass, repeated 5xx, or corrupted invoice/payment state.
- Record incident time, affected deployment IDs/SHAs, actions taken and post-rollback verification.

## Observability and redaction

- `/health` is liveness; `/readyz` checks database query and configured trusted identity resolver.
- Logs should use request/trace IDs, route template, status code, duration and exception class.
- Never log Authorization headers, cookies, Firebase tokens, service-account JSON, `OPENAI_API_KEY`, raw prompts, or full customer/payment records.
- Before adding structured logging, verify all middleware and exception handlers redact sensitive values. A successful health response is not proof of log redaction.

## Current release state

- Production has not been promoted by this runbook.
- No production database migration or restore rehearsal is claimed.
- Manual Android viewport/keyboard QA is still required for mobile release acceptance.
