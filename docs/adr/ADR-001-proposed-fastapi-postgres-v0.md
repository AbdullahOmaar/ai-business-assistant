# ADR-001: Proposed V0 Backend Architecture

- **Status:** Proposed — owner/team review required; not yet ratified.
- **Date:** 2026-10-20
- **Decision owner:** Repository owner
- **Scope:** V0 application architecture only. This document does not authorize production deployment, paid resources, or changes to Firebase.

## Proposal

Use:
- **Frontend:** Angular
- **Backend API:** Python + FastAPI
- **Primary relational data store:** PostgreSQL
- **Authentication (existing):** Keep Firebase Authentication unchanged for now, subject to a separate integration/security review.
- **Local development:** Run the frontend, API, and PostgreSQL locally; no cloud resources are required for this initial slice.

This is a provisional choice to optimize for a small-team MVP and future AI integrations. It is not a claim that FastAPI is inherently safer or more financially correct than Spring Boot.

## Why this proposal

1. Python has a broad ecosystem for AI/LLM integrations and data-oriented tooling.
2. FastAPI offers typed request/response schemas and OpenAPI generation with a relatively small initial setup.
3. PostgreSQL provides transactions, constraints, and exact numeric types appropriate for financial records.
4. A local-first workflow avoids paid infrastructure while the core domain and tests are established.

## Alternatives considered

### Angular + Spring Boot + PostgreSQL

A valid alternative with mature enterprise conventions and a strong Java ecosystem. Prefer it if the team has materially stronger Spring expertise or if existing project code/review establishes it as the better fit. Revisit this decision before implementation expands if that evidence emerges.

### Angular + Firebase/Firestore as the primary business database

Not selected for this proposal because the business domain requires relational reporting, financial allocations, transactional invariants, and auditable relationships. Firebase Authentication can remain in use independently of the choice of primary database.

## Non-negotiable engineering requirements

- Enforce tenant/business isolation on the server for every tenant-owned read and write.
- Authenticate requests and authorize roles server-side; never trust a client-supplied business ID by itself.
- Store monetary values with PostgreSQL `NUMERIC/DECIMAL` and Python `Decimal`; do not use binary floating point for money.
- Keep invoices, collected payments, payment allocations, outstanding balances, expenses, inventory cost, and estimated profit distinct.
- Prevent allocations from exceeding the payment amount or the invoice's remaining balance unless an explicit, separately modeled credit/refund workflow permits it.
- Make retry-sensitive financial operations idempotent and audit material financial changes.
- Do not combine currencies without an approved exchange-rate and reporting policy.
- Do not double-count inventory cost/COGS; label profit estimates as incomplete when reliable cost data is missing.
- AI may prepare financial-action drafts only; a human must review and approve them before execution.
- Add automated tests for tenant isolation, Owner/Staff permissions, allocation limits, idempotency, currency handling, missing costs, and audit history before calling a financial slice ready.

## Authentication integration boundary

Do not change the existing Firebase project, Auth settings, or Firestore. Before connecting Angular/Firebase Auth to FastAPI, separately document and test token verification, issuer/audience validation, error handling, role mapping, and tenant authorization. Never place service-account credentials or secrets in source control.

## Local-first first slice

Start with a minimal FastAPI application exposing a non-sensitive health endpoint, configuration through environment variables, and tests. Add PostgreSQL connectivity and migrations only in a subsequent reviewed slice. No production data, deployment, paid services, or Firebase modifications are in scope.

## Review checklist

- [ ] Owner confirms the proposed stack and team capability assumptions.
- [ ] Resolve conflicting architecture references, including the Spring Boot proposal in PR #1 and any FastAPI references.
- [ ] Review this ADR and the architecture decision matrix together.
- [ ] Approve a separate implementation PR after local tests and security requirements are demonstrated.
- [ ] Review Firebase Auth integration separately before enabling it in the API.

## Consequences

The project can begin a small local FastAPI slice without committing to cloud hosting. The team accepts responsibility for keeping a clear module structure, typed schemas, migrations, automated tests, and explicit security boundaries. This ADR remains provisional until reviewed and accepted in GitHub.
