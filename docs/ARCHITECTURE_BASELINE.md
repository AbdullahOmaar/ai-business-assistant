# Architecture Baseline — Proposed Direction

## Status
**Recommended proposal, pending user review.** See [ADR-0001: Proposed V0 Application Architecture](ARCHITECTURE_DECISION_0001.md). No application code or cloud infrastructure has been created by this decision.

## Proposed stack
- Angular frontend (web-first V0).
- Java + Spring Boot modular-monolith backend exposing a versioned REST API.
- PostgreSQL for relational business records and financial transactions.
- Flyway for schema migrations.
- Spring Security for authentication and authorization; prefer same-origin hosting with secure HttpOnly cookies and CSRF protection, subject to deployment review.
- Angular tests and Spring Boot/JUnit integration tests, including PostgreSQL-backed tenant-isolation and financial-invariant tests.
- Local development first; hosting provider and production deployment remain undecided.

## Why this direction
The product has related financial records and strict business-isolation requirements. A trusted backend plus relational database makes validation, transactions, auditability, and reproducible reports explicit. A modular monolith is simpler than microservices for V0. Angular remains the only initial client so a separate mobile app does not delay core workflows.

## Non-negotiable requirements
- Enforce authorization and business isolation at the backend boundary.
- Verify business membership for every business-scoped request; never trust a client-supplied business identifier alone.
- Keep secrets out of source control and client bundles.
- Use decimal money types and backend calculations; document rounding and currency precision.
- Test owner/staff permissions, cross-business isolation, invoice lifecycle, payment allocation, and financial invariants.
- Make invoice/payment/expense mutations auditable.
- Use explicit business currency; do not silently aggregate multiple currencies.
- Defer AI until core records/calculations are reliable. AI may suggest or draft, but consequential changes require human confirmation.
- Include migrations, automated tests, and a clear local-development guide.

## Existing infrastructure constraints
- A Firebase project reportedly exists on the Spark plan with Firestore Standard; current rules were previously noted to deny client reads/writes. This has not been re-inspected as part of this proposal.
- Do not modify Firebase configuration, Firestore rules, or any Railway project/resource without explicit user approval.
- Do not provision paid services or incur costs without explicit approval and cost review.
- Do not reuse unrelated Railway projects/resources.

## Decision checklist
Before implementation, review the proposed stack and settle:
1. Java/Angular versions and local tool availability.
2. Local PostgreSQL workflow (Docker or native install).
3. Authentication/session approach for local development and eventual hosting.
4. Invoice/payment states and rounding/currency rules.
5. Test environment and CI approach.
6. Hosting/runtime costs and free-tier limits before selecting a provider.

## Engineering guardrails
- Work in small, reviewable changes.
- Use feature branches and pull requests where available.
- Never commit credentials, tokens, real customer data, or production secrets.
- Do not claim production readiness until security, tests, deployment, and operational behavior have been verified.
