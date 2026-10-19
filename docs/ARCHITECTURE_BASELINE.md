# Architecture Baseline — Proposed Direction

## Status
**Recommended proposal, pending review.** See [ADR-0001](ARCHITECTURE_DECISION_0001.md). No application code or cloud infrastructure has been created by this decision.

## Proposed stack
- Angular frontend (web-first V0).
- Python + FastAPI modular-monolith backend with a versioned REST API.
- PostgreSQL for business and financial records.
- SQLAlchemy and Alembic for persistence and migrations.
- Pydantic for API validation.
- pytest and PostgreSQL-backed integration tests for tenant isolation and financial invariants.
- Local development first; hosting and production deployment remain undecided.

## Rationale
Python is the intended backend language and is a natural foundation for later AI/data features. FastAPI gives a clear API boundary, while PostgreSQL transactions and constraints support reliable financial records. A modular monolith keeps V0 simpler than microservices. Angular remains the only initial client.

## Requirements
- Enforce authorization and business isolation at the backend boundary.
- Verify business membership for every business-scoped request.
- Keep secrets out of source control and client bundles.
- Use Python Decimal and database NUMERIC/DECIMAL for money; document rounding and currency precision.
- Test owner/staff permissions, cross-business isolation, invoice lifecycle, payment allocation, and financial invariants.
- Audit invoice/payment/expense mutations.
- Never silently aggregate different currencies.
- Defer AI until core records/calculations are reliable; consequential AI-proposed changes require human confirmation.
- Include migrations, tests, and a local-development guide.

## Existing infrastructure constraints
- A Firebase project reportedly exists on Spark with Firestore Standard; previous notes about its rules have not been re-verified in this proposal.
- Do not modify Firebase configuration/rules or any Railway resource without explicit user approval.
- Do not provision paid services without explicit approval and cost review.
- Do not reuse unrelated Railway projects.

## Before implementation
1. Check compatible Python, Node, and Angular versions.
2. Choose local PostgreSQL workflow (Docker or native install).
3. Decide local and eventual production authentication/session strategy.
4. Specify invoice/payment states and rounding/currency rules.
5. Decide test environment and CI approach.
6. Review hosting costs/free tiers before selecting a provider.

## Guardrails
Work in small reviewable changes. Never commit credentials or real customer data. Do not claim production readiness before security, tests, deployment, and operational behavior are verified.