---
document_id: ABA-KNOW-02
title: Architecture & Engineering Standards
version: 1.0.0
status: DRAFT
owner: Project Master / Repository Owner
last_verified_at: 2026-10-30T05:30:00Z
review_due: 2026-11-29
knowledge_class: CONTROLLED
applicable_scope: AI Business Assistant Production V1 application architecture
canonical_sources:
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/docs/ARCHITECTURE_BASELINE.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/docs/adr/ADR-001-v0-architecture.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/AGENTS.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/CONTRIBUTING.md
related_github_sha: d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f
supersedes: none
superseded_by: none
---

# Architecture & Engineering Standards

> **Publication state:** DRAFT. ADR-001 and accepted repository architecture documents are authoritative. This document summarizes them; it does not create a competing architecture decision.

## 1. Accepted V0 architecture

| Layer | Accepted technology / boundary |
| --- | --- |
| Frontend | Angular, web-first |
| Backend | Python + FastAPI |
| Application shape | Modular monolith with versioned REST API |
| Persistence | PostgreSQL |
| ORM / migrations | SQLAlchemy 2.x / Alembic |
| Validation | Pydantic |
| Automated tests | pytest, API integration and PostgreSQL-backed authorization/financial-invariant tests |
| Identity | Trusted Firebase ID-token verification boundary in the current implementation |
| AI | Provider-neutral backend service boundary; provider credentials remain server-side |

ADR-001 accepted the V0 stack on 2026-10-20. Changing the identity provider, Firebase project/security rules or core application architecture requires a separate reviewed and approved decision.

## 2. Modular boundaries

Keep business capabilities cohesive and enforce boundaries through application/domain services and explicit API contracts. The Production V1 Charter defines product modules; the accepted V0 backend remains a modular monolith unless a new ADR approves a different deployment or service topology.

Avoid:
- Cross-module direct mutation that bypasses the owning service.
- Duplicate business rules in Angular and FastAPI.
- Trusting client-submitted prices, totals, roles, tenant IDs or payment states.
- Treating frontend visibility as an authorization boundary.
- Silent mutation of issued or otherwise derived financial records.

## 3. API and persistence conventions

- Expose versioned REST endpoints under the established API versioning convention.
- Validate request/response contracts with Pydantic.
- Keep persistence models and migrations aligned through SQLAlchemy and Alembic.
- Apply tenant membership and role checks server-side for every protected read/write.
- Use explicit transactions for consequential multi-record operations.
- Use idempotency or uniqueness constraints where retries could duplicate a business effect.
- Record consequential actions through the approved audit mechanism.
- Keep error handling deterministic and avoid leaking secrets or cross-tenant record existence.
- Treat schema migrations as reviewable release artifacts; rehearse them against disposable/restored non-production data.

## 4. Data integrity invariants

- A business/workspace is the tenant boundary. Foreign business IDs must not grant access.
- Keep invoiced sales, collected payments, payment allocations, outstanding balances and expenses distinct.
- Never combine currencies without an approved conversion policy.
- Use decimal-safe monetary calculations and explicit rounding/currency rules from an approved contract.
- Stock quantity changes must be represented by auditable stock movements; do not silently overwrite balances.
- Do not mutate issued invoices, allocations, recorded payments or derived balances without an approved correction workflow.
- Use transaction boundaries and idempotency to prevent duplicate or partial side effects.
- Profit must remain qualified as an estimate when cost inputs are incomplete.

## 5. Authentication and authorization boundary

- Trust only server-verified identity tokens and the configured project/issuer/audience.
- Resolve workspace membership and role from trusted server-side data.
- Deny by default when identity, membership or policy is missing or invalid.
- Test both allowed and denied paths, including foreign-tenant IDs and no-write/no-audit side effects.
- Never grant platform-level access from an ordinary workspace role or client-provided field.

## 6. Testing standards

Use the smallest test that proves the contract, then expand to the relevant layers:

1. Unit tests for deterministic domain rules and validation.
2. API tests for request/response, status codes and error behavior.
3. PostgreSQL integration tests for transactions, constraints, migrations and tenant isolation.
4. Concurrency/idempotency tests for duplicate/replayed requests and competing updates.
5. Browser/E2E tests for critical user journeys and permission-sensitive UI behavior.
6. Security/dependency checks for secrets, vulnerable dependencies and authorization regressions.

For sensitive operations, test success, failure, invalid input, duplicate/retry, unauthorized role, foreign tenant and absence of unintended state/audit changes. A test result is valid only for the exact source SHA it tested.

## 7. Code review and branch discipline

- Read `AGENTS.md` before changes and follow `CONTRIBUTING.md`.
- Inspect current main, local/user changes, branches, open PRs, issues and CI before starting.
- Reuse a matching active branch/PR; one coherent branch and PR per work package.
- Preserve unrelated user work. Do not overwrite or delete unique changes.
- Keep diffs focused; add tests and docs alongside behavior changes.
- Require independent review for high-risk changes where available.
- Do not merge until the exact PR head has required checks and reviews and the owner has authorized merge.
- Do not create duplicate task trackers or branch-per-subtask noise.

## 8. Dependency and security review

Before adding/upgrading dependencies:
- Confirm the dependency is necessary and maintained.
- Review license, transitive dependencies, security advisories and compatibility.
- Prefer existing project libraries and avoid unnecessary runtime dependencies.
- Run the repository's approved dependency audit path when available.
- Do not weaken or delete valid tests to suppress dependency or security findings.

## 9. Architecture change process

1. State the observed limitation and evidence.
2. Compare viable alternatives and migration/rollback impact.
3. Record a versioned ADR with decision owner, date, scope, consequences and supersession.
4. Obtain required owner/security review.
5. Update this summary only after the canonical ADR is accepted.
6. Revalidate affected API, persistence, authorization, migrations, tests and operational runbooks.

## 10. Canonical references

- [Architecture Baseline](../ARCHITECTURE_BASELINE.md)
- [ADR-001 — V0 Application Architecture](../adr/ADR-001-v0-architecture.md)
- [AGENTS.md](../../AGENTS.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [Production V1 Charter](https://app.notion.com/p/4099320b90fb81259288c92962839b90)
