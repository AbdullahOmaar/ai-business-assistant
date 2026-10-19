# Architecture Baseline — Decision Pending

## Status
**Not yet approved.** This document records constraints and decision criteria; it does not commit the project to a stack.

## Options to evaluate
- **Angular + Firebase Auth + Firestore:** potentially faster for a web-first V0, but security rules, data modeling, server-side financial operations, and automated tests must be designed carefully.
- **Angular + API backend (for example, FastAPI) + database:** clearer server-side business logic and validation, but adds deployment and operational responsibilities.

Flutter/mobile can be considered later if validated demand requires it; do not let a second client delay a secure web-first foundation.

## Non-negotiable requirements
- Enforce authorization and business isolation at the trusted data/API boundary.
- Keep secrets out of source control and client bundles.
- Validate all monetary calculations and state transitions server-side or in an equivalently trusted layer.
- Test owner/staff permissions and cross-business isolation.
- Make invoice/payment/expense mutations auditable.
- Use explicit business currency; do not silently aggregate multiple currencies.
- Keep AI integrations behind a service boundary. AI may suggest or draft, but consequential changes require human confirmation.
- Include environment setup, migrations/schema strategy where relevant, automated tests, and a clear local-development guide.

## Existing infrastructure constraints
- A Firebase project reportedly exists on the Spark plan with Firestore Standard; current rules were previously noted as denying client reads/writes. Treat this as unverified until re-inspected.
- Do not modify Firebase configuration, Firestore rules, or any Railway project/resource without explicit user approval.
- Do not provision paid services or incur costs without explicit approval and a cost review.
- Do not reuse unrelated Railway projects/resources.

## Decision checklist
Before selecting a stack, document:
1. Target client for V0 and expected deployment.
2. Authentication and authorization flow.
3. Trusted location for invoice/payment/expense calculations.
4. Business-membership and tenant-isolation model.
5. Automated test strategy for security and financial invariants.
6. Hosting/runtime costs and free-tier limits.
7. Local setup complexity and maintainability.

## Initial engineering guardrails
- Work in small, reviewable changes.
- Protect the default branch; use feature branches and pull requests when available.
- Never commit credentials, tokens, real customer data, or production secrets.
- Do not claim production readiness until security rules, tests, deployment, and operational behavior have been verified.
