# Notion source snapshot: 🤖 AI Business Assistant — BRD, PRD & Project Control Center

- Source: https://app.notion.com/p/401bbf2bc2c581348ff3ed65b2367c1a?pvs=204
- Page ID: 401bbf2b-c2c5-8134-8ff3-ed65b2367c1a
- Last edited reported by Notion: 2026-10-28T22:17:24.685Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/401bbf2bc2c581348ff3ed65b2367c1a as of 2026-10-28T22:17:24.685Z:
<page url="https://app.notion.com/p/401bbf2bc2c581348ff3ed65b2367c1a" icon="🤖">
<ancestor-path>
<parent-page url="https://app.notion.com/p/407bbf2bc2c5815781afc0d0ed12a302" title="01 — Product Definition"/>
<ancestor-2-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-3-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"title":"AI Business Assistant — BRD, PRD & Project Control Center"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"🤖"}</iconMetadata>
<content>
> <b>Document type:</b> Combined BRD + PRD + Technical Project Handbook<br /><b>Product:</b> AI Business Assistant<br /><b>Purpose:</b> Single source of truth for product scope, requirements, architecture, security, UX, delivery, links, tools, and the next execution plan.<br /><b>Status:</b> Living product requirements and technical handbook. The embedded engineering snapshot was last verified on 22 October 2026; refresh live GitHub/Vercel evidence before acting. Use Product Home → 02 — Current State for current-source pointers; deployment readiness does not prove business acceptance.

## 00 — Start here

### Product in one sentence

A secure, mobile-first business workspace that helps small businesses manage customers, products, invoices, payments, dashboard metrics, and (once configured and validated) an AI assistant, with strict isolation between businesses.

### Primary links

- <b>GitHub repository:</b> [AbdullahOmaar/ai-business-assistant](https://github.com/AbdullahOmaar/ai-business-assistant)
- <b>Production web app:</b> [ai-business-assistant-web.vercel.app](https://ai-business-assistant-web.vercel.app)
- <b>Production API:</b> [ai-business-assistant-api.vercel.app](https://ai-business-assistant-api.vercel.app)
- <b>Firebase project console:</b> [ai-business-assistant-97f37](https://console.firebase.google.com/project/ai-business-assistant-97f37)
- <b>Vercel frontend project:</b> [Frontend deployments](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-web)
- <b>Vercel backend project:</b> [Backend deployments](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api)
- <b>Latest known frontend production deployment:</b> [Inspect deployment](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-web/CGR355Ntg1mtPdVfnKhzayaAVazC)
- <b>Latest known backend production deployment:</b> [Inspect deployment](https://vercel.com/thepresidentabdo-9110s-projects/ai-business-assistant-api/7RnGx8JJCG64RyDJMJ8Jf9HToTYJ)
- <b>Open mobile UX PR:</b> [PR #36 — Improve mobile navigation and responsive dashboard UX](https://github.com/AbdullahOmaar/ai-business-assistant/pull/36)
- <b>Existing handoff / historical checkpoint:</b> <mention url="https://app.notion.com/p/3febbf2bc2c581f68417d7d0a1ec42d9" />
- <b>Product portfolio index:</b> <mention url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822">Products</mention>

### How to work on this product

1. Read this page before changing code, architecture, business rules, or production configuration.
2. Check the latest GitHub main branch, PRs, workflow runs, and production deployments. This page is a snapshot, not a substitute for live checks.
3. Work in a feature branch; keep changes small and reviewable. Do not push directly to main unless explicitly authorized by project policy.
4. Add or update tests. Do not merge a change just because a deployment is green.
5. Do not claim a feature is complete until its acceptance criteria and relevant tests pass.
6. Never paste secrets into Notion, chat, issues, commits, or frontend runtime configuration.
7. Record material decisions, deployment links, known limitations, and follow-up work here.

## 01 — Product definition (BRD)

### Business problem

Small-business operators need one place to maintain core commercial records and see the state of their business. Scattered tools make it harder to track customers, inventory-linked products, invoices, receipts, and outstanding balances. AI assistance may help explain records and answer business questions, but it must not bypass authorization or perform consequential writes without an explicit safe workflow.

### Target users

- Small-business owner / administrator.
- Staff members who are explicitly granted access to a business workspace.
- Future: role-specific operators (sales, finance, inventory) after a documented role and permission model is agreed.

### Business outcomes

- Reduce time to create and track invoices and record received payments.
- Keep customer, product, invoice, and payment data in a consistent business-scoped workspace.
- Provide a usable mobile workflow, including navigation and forms.
- Make financial status and operational metrics easier to understand.
- Offer trustworthy AI explanations only when provider configuration, authorization, and quality checks are in place.

### Product principles

- <b>Security before convenience:</b> every API request is authenticated and scoped to the selected business.
- <b>Mobile first:</b> core flows must work on narrow Android screens with touch-friendly controls.
- <b>Financial integrity:</b> amounts, currencies, allocations, invoice states, and idempotency must be validated server-side.
- <b>No fake success:</b> UI reports real API outcomes and useful errors.
- <b>Human control:</b> AI is advisory by default; no silent invoice/payment mutations.
- <b>Evidence-based delivery:</b> CI, API tests, and production smoke tests are separate evidence types.

### MVP in scope

- Firebase email/password authentication.
- Create and select a business workspace.
- Business dashboard.
- Customer creation and listing.
- Product creation/listing and stock-tracking flag.
- Draft invoice creation/editing, issuing, and voiding where business rules permit.
- Recording payments and optional allocations to issued invoices.
- AI chat interface and API integration, gated by backend provider configuration.
- Responsive navigation and mobile layouts.
- Tenant authorization and automated tests.

### Explicitly not promised yet

- Full accounting ledger or audited financial statements.
- Refunds and credit notes.
- Multi-line invoice editing in the current quick editor (it supports one product line).
- Automated recurring invoices, scheduled notifications, or background jobs.
- Full inventory movements, purchase orders, warehouses, or offline POS synchronization.
- Production-grade AI tool execution or autonomous record changes.
- Legal/tax compliance certification for any jurisdiction.
- A verified complete cross-tenant penetration test unless documented evidence is added.

## 02 — Functional requirements and acceptance criteria

### FR-01 Identity and sessions

- Users sign up and sign in using Firebase Authentication.
- Backend validates Firebase ID tokens with Firebase Admin credentials.
- Invalid/expired tokens must not access protected business data.
- UI errors must be understandable; do not expose secrets or stack traces.
- Acceptance: integration tests cover missing, malformed, expired/invalid token cases and a valid authorized request.

### FR-02 Business workspace and tenant isolation

- User can list only workspaces they are authorized to access.
- Every business-scoped endpoint validates membership/authorization server-side.
- Changing a business ID in a URL must not grant access to another tenant.
- Foreign IDs supplied in invoice/payment/customer/product operations must be checked against the same business.
- Acceptance: automated negative tests prove User A cannot read or mutate User B's business, customers, products, invoices, payments, or allocations. Include list, detail, create, update, and delete/void paths where applicable.

### FR-03 Dashboard

- Dashboard values must derive from backend records, not demo constants.
- Refresh dashboard after successful invoice/payment actions.
- Empty, loading, error, and partial-failure states should be clear.
- Acceptance: values are reconciled against seeded test records and empty state is usable.

### FR-04 Customers

- Create and list customers within the active business.
- Optional email/phone fields may be omitted.
- Acceptance: validation, API failure, and tenant-boundary tests pass.

### FR-05 Products and stock

- Create/list products with unit price and optional stock tracking.
- Product IDs used on invoices must belong to the same business.
- Acceptance: invalid price and cross-business product references are rejected.

### FR-06 Invoice lifecycle

- Create draft invoice with invoice number, currency, and line items.
- Edit only drafts; issued invoices must not be silently rewritten.
- Issue draft invoice only when required validations pass.
- Void according to backend business rules; issued invoices with allocated payments cannot simply be voided and need a future refund/credit-note workflow.
- Acceptance: tests cover draft → issued, draft edit, invalid transitions, duplicate invoice numbers according to the actual schema/rules, and void constraints. Document stock effects and monetary rounding explicitly.

### FR-07 Payments

- Record a payment with amount, currency, idempotency key, method, optional reference, and optional invoice allocations.
- Validate business ownership, currency, amount, invoice state, remaining balance, and allocation totals.
- Replaying the same idempotency key must not create a duplicate payment.
- Acceptance: tests cover successful payment, invalid allocation, overpayment, cross-tenant invoice ID, and idempotent replay. Reconcile dashboard and invoice balances after payment.

### FR-08 AI assistant

- Chat is scoped to the authenticated user and selected business.
- Missing provider credentials produce a clear configuration error; do not fake a response.
- AI is read-only/advisory unless a separately reviewed tool/action design is approved.
- Do not expose another tenant's data through prompt context, retrieval, logs, or citations.
- Acceptance: provider-configured smoke test, provider-missing test, authorization tests, prompt-injection tests, sensitive-data checks, and safe failure behavior.
- <b>Configuration dependency:</b> backend environment must contain a valid <code>OPENAI_API_KEY</code> if OpenAI is the chosen provider. Add it directly in Vercel project settings as a sensitive environment variable; never put the value in chat or Notion.

### FR-09 Mobile UX and accessibility

- Navigation labels remain understandable on mobile; selected section is visually distinct.
- Fixed navigation must not cover content or form submit buttons.
- Respect safe-area insets, keyboard focus, touch target sizes, reduced-motion preferences, and narrow viewport widths.
- Forms use mobile-friendly input sizes; avoid horizontal page overflow.
- Acceptance: test at 320px, 360px, 390px and a tablet/desktop width; manually verify keyboard, long labels, loading/errors, bottom navigation and scrolling on a real Android device.

## 03 — UX / UI direction

### Mobile navigation PR in progress

PR [#36](https://github.com/AbdullahOmaar/ai-business-assistant/pull/36) changes the small-screen navigation from a compressed horizontal icon row to a fixed bottom navigation with six labeled destinations:

- Overview
- Sales & invoices
- Products & stock
- Customers
- Payments
- AI assistant

The CSS also adds safe-area padding, reserved content space, responsive metric cards/forms, larger touch targets, and reduced-motion support.

<b>Status:</b> open PR; not yet merged or deployed according to the last verified state. The available workflow lookup did not return a run for its commit, so CI status must be checked directly before merging. A real-device visual check is still required. If six items feel crowded at 320px, evaluate a primary 4-item bar plus a clearly accessible “More” menu rather than shrinking labels further.

### UX polish backlog

- Replace text-glyph icons with a consistent, accessible icon set when feasible.
- Improve empty states and add clear primary actions on each section.
- Show currency consistently and format monetary amounts by currency/locale.
- Prevent accidental destructive actions; confirm voiding and explain consequences.
- Add inline validation and preserve form state after recoverable errors.
- Improve assistant message loading, retry, error, and source presentation.
- Verify contrast, keyboard focus, semantic labels, screen reader names, and reduced motion.

## 04 — Technical architecture

### Current technology baseline

- <b>Frontend:</b> Angular 20 standalone component architecture, TypeScript, Angular Forms, Firebase JS SDK.
- <b>Backend:</b> Python / FastAPI API (do not replace with Spring Boot without explicit approval).
- <b>Database:</b> PostgreSQL hosted through Neon.
- <b>Identity:</b> Firebase Authentication; backend Firebase Admin token verification.
- <b>Hosting:</b> Vercel frontend and backend projects.
- <b>CI:</b> GitHub Actions workflow verifies backend tests, migrations, and frontend checks/build as defined in <code>.github/workflows/ci.yml</code>.

### Known project identifiers and consoles

- Firebase project ID: <code>ai-business-assistant-97f37</code> — [Firebase Console](https://console.firebase.google.com/project/ai-business-assistant-97f37)
- Neon project ID: <code>flat-meadow-20571697</code>
- Neon branch: <code>br-hidden-surf-b97btfdh</code>
- Neon database: <code>ai_business_assistant</code>
- Neon Console: [Neon](https://console.neon.tech/)
- Vercel team ID: <code>team_jCzLnqPABe0EM86FWWUXrvTP</code>
- Frontend Vercel project ID: <code>prj_UcoIX8jpsUKlRIr7IHdq0C1mro0P</code>
- Backend Vercel project ID: <code>prj_byaZYCDkYjcGnU0MGCDSbefaalpW</code>

Identifiers are operational references, not credentials. Never put database URLs, private keys, service-account JSON, access tokens, or API key values in this document.

### Important runtime configuration

- Frontend public config file: <code>frontend/public/runtime-config.json</code> contains only public Firebase web configuration and API origin.
- Backend Firebase Admin secret: <code>FIREBASE_SERVICE_ACCOUNT_JSON</code> (Sensitive Vercel environment variable).
- Backend AI provider secret: <code>OPENAI_API_KEY</code> (expected if using OpenAI; current presence must be verified in Vercel).
- Database connection configuration: keep server-side only; do not expose the database URL to the browser.
- Firebase project ID / service account must match the intended Firebase project.

### Architecture and security review checklist

- Confirm every route has an explicit authentication and business membership dependency.
- Confirm no endpoint trusts a business ID from the client without server-side membership checks.
- Ensure queries and mutations are tenant-scoped; database constraints are defense in depth, not the only authorization control.
- Use idempotency for financial writes and database transactions for payment/allocation consistency.
- Keep logs useful but redact tokens, credentials, personal financial data, and prompt contents where appropriate.
- Validate CORS origins, request payloads, rate limits, and error responses.
- Keep migrations reversible where practical; back up before destructive schema changes.
- Verify production env var names and deployment target before changing production settings.

## 05 — Tools and ownership map

| Tool | Purpose | Link / notes |
| --- | --- | --- |
| GitHub | Source code, branches, PR review, issues, CI | [Repository](https://github.com/AbdullahOmaar/ai-business-assistant) |
| GitHub Actions | Automated backend/frontend checks | [Actions](https://github.com/AbdullahOmaar/ai-business-assistant/actions) |
| Vercel | Frontend/backend deployments and environment variables | [Vercel dashboard](https://vercel.com/thepresidentabdo-9110s-projects) |
| Firebase | Authentication and Admin service-account setup | [Firebase Console](https://console.firebase.google.com/project/ai-business-assistant-97f37) |
| Neon | PostgreSQL database/branch management | [Neon Console](https://console.neon.tech/) |
| Notion | Product requirements, decisions, plans, handoffs | <mention url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822">Products</mention> |
| ChatGPT | Planning, code review, test planning, documentation | Continue from this page and verify live state before changes |
| Mobile browser | Production smoke tests and responsive checks | [Production app](https://ai-business-assistant-web.vercel.app) |

## 06 — Delivery roadmap (priority order)

### P0 — Security and release confidence

1. Verify current main commit and PR #36 state; inspect workflow runs and checks.
2. Add/confirm tenant-isolation integration tests across all business-scoped endpoints.
3. Review authentication dependency behavior, Firebase Admin configuration, and production error handling.
4. Verify payment transactionality, idempotency, currency consistency, and invoice balance updates.
5. Run backend tests + PostgreSQL migrations + frontend build/CI; record actual outputs and commit SHA.
6. Run safe production smoke tests without writing destructive or fake financial data.

### P1 — Mobile experience

1. Validate PR #36 in CI and review rendered mobile behavior.
2. Fix 320–390px navigation, keyboard/safe-area overlap, overflow, long text, and form errors.
3. Improve dashboard hierarchy, empty states, loading skeletons, and quick actions.
4. Audit accessibility: contrast, focus, semantic labels, touch target size, reduced motion.
5. Merge only when checks pass; verify production deployment and test live URL afterward.

### P1 — Invoice lifecycle

1. Document the invoice state machine and allowed transitions.
2. Add API tests for create/edit/issue/void and invalid transitions.
3. Validate totals, currency, rounding, product/business ownership, and stock effects.
4. Design refunds/credit notes before allowing voiding of invoices with payments.
5. Decide whether the quick editor should support multiple line items; do not silently imply it already does.

### P1 — AI assistant

1. Confirm <code>OPENAI_API_KEY</code> exists in backend Production environment without revealing its value.
2. If missing, add it through Vercel UI/secure integration and redeploy.
3. Test authenticated chat against the selected business and ensure no cross-tenant context leaks.
4. Add timeout, retry/error UX, usage limits, logging/redaction, and cost controls.
5. Keep record-changing tools disabled until explicit authorization, confirmation, audit logging, and tests exist.

### P2 — Operational readiness

- Structured logging, health/readiness checks, alerting, backup/restore exercise.
- Dependency/security audit and vulnerability triage.
- Document release and rollback procedure.
- Usage, latency, error-rate and AI cost monitoring.
- Role-based permissions, invitation flow, password reset, account lifecycle.
- Multi-line invoices, refund/credit-note workflows, reporting/export, and background jobs after MVP stability.

## 07 — Release gates

A release is accepted only when all applicable gates are evidenced:

- [ ] GitHub Actions CI green for the exact commit.
- [ ] Database migrations succeed against PostgreSQL.
- [ ] Authentication and negative tenant-isolation tests pass.
- [ ] Invoice and payment financial integrity tests pass.
- [ ] Frontend production build succeeds.
- [ ] Mobile smoke test covers 320px–430px widths and one real Android device.
- [ ] Production smoke tests use safe, controlled test data and confirm API integration.
- [ ] Vercel frontend and backend deployments are READY for the same intended release commit.
- [ ] No required secret is missing; no secret is exposed in source or client config.
- [ ] Rollback target and known limitations are documented.

## 08 — Current status snapshot (22 October 2026)

### Verified / previously reported

- Firebase Admin backend configuration issue was addressed by configuring <code>FIREBASE_SERVICE_ACCOUNT_JSON</code>; project owner reported the app opened successfully afterward.
- Frontend runtime config points to the production API and intended Firebase web app.
- Payment recording workflow was merged in PR #34; latest known frontend and backend production deployments were both READY at commit <code>8f75910c1100c35f1076aa17eee59a46349fe89b</code>.
- Payment workflow includes API endpoint, frontend client, payments UI, allocations, method/reference, and idempotency support.
- Mobile navigation/contrast work had been done earlier; re-verify current main before assuming its exact UI is live.
- PR #36 is open with mobile bottom-navigation/responsive improvements.

### Not yet verified / open

- PR #36 CI and real-device visual validation.
- Full tenant-isolation acceptance across every endpoint.
- Full invoice lifecycle acceptance tests.
- Presence and validity of backend <code>OPENAI_API_KEY</code>; AI provider may return a configuration error if absent.
- Production end-to-end acceptance for all main workflows.
- Refund/credit-note workflow and multi-line invoice editing.
- Comprehensive accessibility audit and operational monitoring.

## 09 — Decision log

| ID | Decision / current rule | Status |
| --- | --- | --- |
| DEC-001 | Backend stays Python/FastAPI; do not switch to Spring Boot without explicit approval. | Locked by project direction |
| DEC-002 | PostgreSQL is the application database baseline. | Current implementation |
| DEC-003 | Firebase Authentication provides user identity; backend verifies ID tokens. | Implemented; tests still required |
| DEC-004 | Business membership is required for all business-scoped data access. | Security requirement |
| DEC-005 | Payment recording uses idempotency and business-scoped invoice allocations. | Implemented; verify test evidence |
| DEC-006 | AI is advisory/read-only by default; no autonomous financial writes. | Safety rule |
| DEC-007 | Mobile UX is a first-class requirement, not a later polish item. | Active work |
| DEC-008 | Secrets are configured in hosting secret stores and never committed or documented as values. | Locked security rule |

## 10 — Risks and mitigations

- <b>Cross-tenant data exposure:</b> P0 negative integration tests; centralized authorization; tenant-scoped DB queries.
- <b>Financial inconsistency:</b> transaction boundaries, idempotency, currency validation, reconciliation tests.
- <b>AI unavailable or unsafe:</b> provider configuration check, safe error state, business-scoped context, read-only default.
- <b>Mobile navigation blocks content:</b> safe-area-aware fixed bar, content bottom padding, small-screen test matrix.
- <b>Green deployment mistaken for complete feature:</b> separate CI, integration, production smoke, and acceptance evidence.
- <b>Secrets leakage:</b> sensitive Vercel variables only; redact logs; never store values in Notion.
- <b>Scope creep:</b> finish P0 security and core financial workflows before expanding into advanced accounting or autonomous agents.

## 11 — Definition of Done

A task is done only when code is committed to an identifiable branch/PR, tests are added and pass, authorization and error paths are covered, documentation is updated, review/merge status is known, deployment is verified when requested, and remaining limitations are stated honestly.

## 12 — Next actions for the next work session

1. Open [PR #36](https://github.com/AbdullahOmaar/ai-business-assistant/pull/36) and check the exact CI status.
2. If checks are absent, trigger/inspect the GitHub Actions workflow; fix any failures before merge.
3. Continue tenant-isolation tests and invoice lifecycle tests in separate reviewable PRs.
4. Confirm backend <code>OPENAI_API_KEY</code> presence in Vercel without disclosing the value; if absent, add securely and redeploy.
5. Run controlled production smoke tests and update this page with commit SHAs, evidence, date, and outstanding blockers.

## Management & four feature chats

The current operating rules, feature ownership, sequencing, ready-to-copy prompts, handoff format, and release gates are documented in the [AI Business Assistant — Product & Agent Operating Model](https://app.notion.com/p/407bbf2bc2c581eda73cc3b91a43fc52). Use this as the management layer; do not create another duplicate dashboard.
</content>
</page>
