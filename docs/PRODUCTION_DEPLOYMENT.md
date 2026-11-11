> Repository-wide CI provider selection, required checks, exact-SHA evidence, branch/review rules and merge eligibility are defined in [AGENTS.md](../AGENTS.md). This runbook is limited to production-specific deployment, migration, recovery and runtime verification.

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

## Vercel Web build and preview safety

The Web Vercel project root is `frontend`. The repository-owned `frontend/vercel.json` explicitly runs `node scripts/write-build-info.mjs && ng build` and publishes `dist/ai-business-assistant/browser` (the Angular application builder's browser output directory). This is required because the Angular framework auto-detected build can invoke `ng build` directly and bypass npm's `prebuild` lifecycle, leaving the UI commit label and service-worker cache name as `unknown`.

Run the current repository-required validation defined in [AGENTS.md](../AGENTS.md) before promoting a candidate. A successful Vercel build confirms compilation and generated deployment metadata only; it does not replace CI or exact-SHA release evidence.

Preview builds are fail-closed by `scripts/write-build-info.mjs`: when `VERCEL_ENV=preview`, it replaces the checked-in production runtime config with an empty setup-required config unless all isolated Preview values are supplied. Configure these Vercel Preview environment variables only after a synthetic API and Firebase project exist: `ABA_PREVIEW_API_BASE_URL`, `ABA_PREVIEW_FIREBASE_API_KEY`, `ABA_PREVIEW_FIREBASE_AUTH_DOMAIN`, `ABA_PREVIEW_FIREBASE_PROJECT_ID`, and `ABA_PREVIEW_FIREBASE_APP_ID`. A partial set or the known Production API/Firebase identifiers fails the build. Production and local builds retain the existing runtime config. Do not sign in or mutate data from a Preview until the synthetic runtime is configured and verified.

## Frontend runtime configuration

The public runtime config contains only public Firebase web-app identifiers and the API base URL; never place service-account JSON or an OpenAI key in frontend assets. Configure:
- `apiBaseUrl`: deployed FastAPI origin, without a trailing slash.
- `firebase.apiKey`, `firebase.authDomain`, `firebase.projectId`, and `firebase.appId`: values from the intended Firebase web app.

Enable the Firebase Email/Password sign-in provider in the Firebase Console if that is the chosen sign-in method. Add the frontend's production domain to Firebase Authentication's authorized domains.


## Production release cadence and approval

- Treat production deployment as a release event, not a per-commit or per-task action.
- Batch related work and deploy only when an approved feature bundle or critical fix is ready. Trigger at most one deployment per affected Vercel project for the release; do not redeploy an unchanged project.
- Merge authorization and production-deployment authorization are separate. Confirm the required release authorization before triggering Vercel.
- Before deployment, verify the exact merged `main` SHA, release markers for affected projects, project Ignore Build Step behavior, and the production database recovery/rollback plan where applicable.
- After deployment, verify the intended deployment SHA, production alias, API `/health`, `/readyz`, `/version` where applicable, and safe feature-specific smoke checks. A READY build or HTTP 200 alone is not complete release evidence.

## Repository CI and merge requirements

Follow the current [AGENTS.md CI, merge and deployment requirements](../AGENTS.md#ci-merge-and-deployment). This runbook does not restate CI providers, workflow job lists, review rules or branch protections.

## Release gates

1. Verify the current repository-required exact-SHA validation and merge gates in [AGENTS.md](../AGENTS.md) are satisfied for the approved release commit. Do not reuse evidence from a different SHA.
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


## Post-release accounting hotfix — 2026-10-25

- PR #124 fixes invoice-discount cent allocation for sales returns using deterministic largest-remainder allocation across all invoice lines. Both draft return creation and approval use the same allocation.
- Regression coverage includes 500 one-dollar lines with a $2.45 discount; total returnable value must reconcile to $497.55.
- Required CI passed before merge: backend tests, backend container verification, backend/frontend verification, and Python/JavaScript dependency audits.
- No production schema migration or historical data rewrite is required for this code fix.
- After deployment, verify `/health` and `/readyz` return 200, `/version` reports the deployed commit, and run the approved sales-return smoke test against a disposable/non-production invoice before using discounted returns operationally.

## Return rounding hardening

- Merged fix commit: `1210641021493e3669865ae945acb8c2f4ff967d`.
- Sales-return line amounts are allocated from the stored invoice net subtotal in integer cents with deterministic largest-remainder allocation.
- Regression coverage creates and issues a real discounted invoice through the API, then creates and approves a full return and verifies the return total equals the invoice total.
- Backend, container, frontend/backend verification, and dependency audit passed before merge; independent review found no major issues.


## Platform Admin Screen and explicit super-admin access

- The platform-wide endpoints live under `/api/v1/platform-admin`. They use the same trusted Firebase ID-token verifier and PostgreSQL request-session dependencies as the rest of the API.
- Platform access is denied unless `PLATFORM_SUPER_ADMIN_UIDS` is configured in the **backend server environment** as a comma-separated list of exact verified principals. Each item must use the fully qualified subject returned by the server, `firebase:{FIREBASE_PROJECT_ID}:{firebase_uid}`. Do not place emails, passwords, tokens, or service-account JSON in this variable, source code, the frontend runtime config, or screenshots. The variable being unset or empty denies all platform-admin access.
- Never add this allowlist through the UI, a request body, a workspace role, or automatic first-user registration. Only an authorized infrastructure administrator may configure the server environment after independently verifying the Firebase UID and intended project.
- `GET /api/v1/platform-admin/overview`, `/businesses`, `/businesses/{id}`, and `/audit-events` are read-only. Monetary totals remain separated by currency; they are not converted or added together.
- `PATCH /api/v1/platform-admin/businesses/{id}/status` requires an explanatory reason and records a business-scoped audit event in the same database transaction. It disables/enables workspace access via the existing membership authorization behavior; it does not delete the workspace, its membership rows, invoices, payments, or other records. Treat the audit event and change as one commit.
- The existing workspace `OWNER` and `STAFF` roles do not imply platform access. This screen does not create Firebase users, invite platform admins, mutate membership roles, or change invoice/payment/allocation balances because the current application has no safe user-directory/invitation or privileged financial-correction workflow.
- Before allowing production use, add the allowlist only through the platform’s secret/configuration settings after explicit identity verification; then test the `403` denial cases and authorized access against a non-production deployment. Do not enable it with a guessed UID.


## Release Preflight & Fast-Path Procedure (mandatory)

The goal is to remove avoidable waiting and repeated discovery without weakening any gate. Apply this procedure to every substantive work package before implementation reaches merge readiness.

### 1. Preflight — discover release impact early

At task start, record a compact release profile on the existing Notion task / GitHub PR:
- Current main/base SHA, working branch and accountable owner.
- Likely affected applications/projects (Web/API/etc.) and explicitly unaffected projects.
- Whether GitHub merge to main automatically triggers production deployment for each affected Vercel project; confirm Git integration, production branch, release markers, Ignore Build Step and project root/dependency boundaries.
- Whether schema/migration, secrets/configuration, paid resources, production data, or external side effects are involved.
- Applicable GitHub Actions workflow, required exact-head jobs, and current runner/quota availability.
- Required owner decisions: merge authorization, production deployment authorization, and any separate production data/migration approval.

Do this once before coding. Recheck only when a relevant configuration, scope, branch/base or release target changes. Never defer deployment-coupling discovery until after the owner says “merge”.

### 2. Candidate Ready — one evidence packet, exact SHA

Maintain one current packet in the existing task/PR rather than scattering evidence across repeated status messages:
- PR URL, base SHA, exact head SHA, changed-file inventory and merge-base/divergence.
- Acceptance criteria mapped to tests and results.
- GitHub Actions workflow URL and substantive job outcomes on the exact head.
- Current review submissions and provider/repository-enforced requirements (a comment is not an approval).
- Diff/security/data-integrity review, migrations and production side-effect assessment.
- Release profile: affected projects, automatic deployment behavior, release markers/ignore rules, and explicit non-targets.
- NOT RUN / BLOCKED checks with the precise reason and remaining owner decision.

Use a clear state: **NOT READY**, **READY TO MERGE**, or **READY TO MERGE + DEPLOY**. Never call it ready while a required gate is unknown or failed.

### 3. Evidence reuse and efficient orchestration

- Reuse checks only while their exact tested SHA and relevant workflow/configuration remain valid.
- A new commit invalidates exact-head checks; a base update may invalidate merge/conflict evidence and any checks whose semantics depend on the merged result. Recompute only affected evidence.
- Run independent read-only lookups concurrently: PR metadata/diff, reviews, exact-head CI, deployment configuration and task acceptance. Do not serialize unrelated reads.
- Serialize dependent writes: branch/PR edits, merges, release-marker commits and deployment actions. Read back each result before starting its dependent action.
- Avoid polling unrelated projects or repeating unchanged health/runtime queries. Poll only the affected deployment until terminal state, then perform one complete verification pass.
- Treat ignored/canceled deployment due to a configured Ignore Build Step as “not deployed / intentionally skipped”, not as a build failure. Confirm the intended project was or was not affected.

### 4. Owner decision — ask once, at the right time

Before asking for merge approval, send one concise decision packet with:
1. PR and exact head SHA.
2. Required checks/reviews and their current result.
3. Merge impact, including whether merge automatically deploys to production and which project(s).
4. Explicit production/migration/data side effects (or none).
5. The exact authorization requested.

If merge auto-deploys, disclose this **before merge** and obtain the owner authorization required for that coupled action in advance. If deployment is separate/manual, keep merge and production deployment approvals separate. Never infer either approval from a generic “looks good”, green CI, or mergeability.

### 5. Merge, deploy and verify

After authorization and all gates:
- Merge exactly once through the normal repository path; do not bypass branch protections.
- Verify PR merged state, merge commit SHA, updated main SHA and required main checks.
- Trigger/allow deployment only for affected projects and only under the recorded authorization. Do not deploy unchanged projects.
- Verify terminal deployment state, production alias, exact deployed SHA/version, API readiness/version endpoints where applicable, safe authenticated journey smoke tests and runtime errors.
- Record skipped projects, NOT RUN checks, warnings, rollback/recovery notes and remaining acceptance criteria.
- Keep the task PARTIALLY COMPLETE until every applicable live criterion is evidenced.

### 6. Role contract

This procedure is mandatory for Master, Chat 1–5, QA, integration contributors and external AI agents. The task owner prepares the packet; the accountable maintainer/Project Master validates the evidence and records the full diff self-review; QA contributors may add test evidence; only the authorized owner grants reserved approvals. No separate independent reviewer is required by project policy for any change, including routine merges, Security/Architecture and canonical controlled Project Knowledge publication/update. The accountable maintainer/Project Master records full self-review on the exact candidate SHA. Any formal approval actually enforced by GitHub branch protection remains mandatory and must never be bypassed.

**Non-negotiable:** this fast path is an orchestration optimization, not a gate reduction. It never waives exact-SHA checks, provider-enforced review/protection, the approved CI transition policy and exact-SHA requirements, owner merge/deployment authorization, security/privacy controls, migration approval, backup/restore evidence, or production verification.
