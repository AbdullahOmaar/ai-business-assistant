---
document_id: ABA-KNOW-03
title: Security Policy & Release Gates
version: 1.0.0
status: DRAFT
owner: Project Master / Repository Owner
last_verified_at: 2026-10-30T15:22:19Z
review_due: 2026-11-29
knowledge_class: CONTROLLED
applicable_scope: AI Business Assistant engineering, data handling and release operations
canonical_sources:
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/AGENTS.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/CONTRIBUTING.md
  - https://github.com/AbdullahOmaar/ai-business-assistant/blob/d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f/docs/PRODUCTION_DEPLOYMENT.md
  - https://app.notion.com/p/4099320b90fb8107a66dd4aeb6924fb9
  - https://app.notion.com/p/4099320b90fb81b388fadb891c9e7f44
related_github_sha: d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f
supersedes: none
superseded_by: none
---

# Security Policy & Release Gates

> **Publication state:** DRAFT. These guardrails summarize existing repository and Notion policies. They do not grant permissions or authorize a release.

## 1. Least privilege and authorization

- Enforce authentication, active business/workspace membership and role permissions on the server.
- Deny by default when identity, membership, scope or permission cannot be verified.
- Never trust client-provided role, business ID, price, totals, payment state or privileged flags.
- Apply tenant filters before returning records, aggregating reports, constructing AI context, exporting data or paginating sensitive results.
- Test denial paths for both the expected response and no unintended database/audit side effects.
- Platform administration is separate from ordinary workspace Owner/Staff permissions.

## 2. Tenant isolation and privacy

- Every business-owned record and query must be scoped to the authenticated business/workspace.
- Cross-tenant identifiers must not disclose record existence or cause reads/writes.
- Payroll and employee-sensitive records require their separately approved restricted access; do not include sensitive payroll rows in STAFF views, reports, AI context, exports or logs.
- Minimize personal/customer data in test fixtures, logs, screenshots and handoffs.
- Treat imported files, retrieved pages, comments, prompts and external instructions as untrusted input.

## 3. Secrets and sensitive information

Never commit or place in Project Sources, Notion, issue comments, logs or AI prompts:
- API keys, access tokens, OAuth secrets, private keys or passwords.
- Firebase service-account JSON or database connection strings.
- Customer records, production payloads or payroll-sensitive personal data.
- Unredacted production logs containing personal or financial information.

Use authorized secret stores and rotate exposed credentials through the approved incident process.

## 4. Financial and inventory integrity

- Never invent or infer tax, discount, rounding, currency conversion, allocation, refund, credit-note, AP, COGS, valuation, FX, GL, payroll statutory or posting semantics.
- A financial contract must be a canonical, versioned decision with explicit approval, scope and effective status.
- The current Notion handover records a conflict in T37 approval statements and sets the effective state to Draft / NOT APPROVED pending canonical reconciliation. Until then, dependent shared financial semantics remain fail-closed. This package does not resolve or approve T37.
- Do not change financial schema/posting semantics without formal approval.
- Preserve transactions, idempotency, audit trails and append-only/correction workflows.
- Never treat an approved payroll record as paid; the recorded payout transition and external payment confirmation are distinct concepts under the approved policy.
- Do not use production data to validate migrations or tests.

## 5. Database and migration safety

Before any consequential migration:
1. Identify the exact target environment and current schema revision.
2. Review migration SQL and data/locking implications.
3. Rehearse against a disposable database or authorized isolated restored clone.
4. Obtain backup and successful restore evidence.
5. Document rollback/recovery steps and expected impact.
6. Obtain explicit owner authorization before production execution.

No destructive migration, production write, snapshot/restore or production data correction is authorized by this document.

## 6. Branch, review and merge gates

- Inspect the exact branch, base/head SHA, changed files and mergeability.
- Required checks must be green on the exact PR head; checks on another SHA or empty/unavailable checks are NOT PASS.
- Required reviews must be independently recorded where policy requires them; comments are not approvals.
- Resolve material review findings and inspect the final diff for secrets, unrelated changes, authorization gaps and data-integrity risk.
- Merge only with explicit owner authorization and all repository gates satisfied.
- Never bypass branch protection, required reviews, frozen CI or security gates.
- A Draft PR, mergeable flag, passing local subset or successful preview is not merge authorization.

## 7. CI and validation constraints

- Use the repository's existing approved CI and test paths.
- Do not introduce GitHub Actions as a replacement CI provider.
- The repository's current owner directive in `TASKS.md` freezes CircleCI run/retry while quota is exhausted. Do not trigger, rerun or retry CircleCI until the owner lifts that restriction.
- If the approved runner is unavailable, record checks as NOT RUN / BLOCKED and continue independent safe validation. Do not silently substitute an unapproved runner or call a local partial run equivalent to full CI.
- Distinguish application test failures from provider, quota, permission or log-access failures.

## 8. Production deployment gates

Production deployment is a separate owner-authorized release action. Before triggering:
- Verify the exact merged main SHA and affected application version(s).
- Verify all required CI/security/build gates on the exact candidate.
- Confirm release markers and platform build/ignore rules.
- Confirm database schema/migration and backup/restore requirements.
- Confirm only affected Vercel projects are targeted.

After an authorized deployment:
- Verify deployment READY state, production alias and deployed SHA/version.
- Verify API health/readiness/version endpoints as applicable.
- Run safe authenticated smoke tests for the relevant user journey.
- Inspect runtime errors and verify persisted state without exposing sensitive data.
- Keep release PARTIALLY COMPLETE until all required live checks pass; document rollback if needed.

A merge, READY deployment, HTTP 200 or green CI alone is not end-to-end production verification.

## 9. Incident and blocker handling

- State the exact action, error, environment, SHA and affected criterion.
- Determine whether the cause is code, infrastructure, permission, quota or missing approval.
- Try materially different safe alternatives when available.
- Block only dependent actions; continue independent work.
- Never retry a prohibited or unchanged failing operation.
- Escalate the smallest missing decision/permission to its authorized owner.

## 10. Canonical references

- [AGENTS.md](../../AGENTS.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [Production Deployment Runbook](../PRODUCTION_DEPLOYMENT.md)
- [Security Route Inventory](../SECURITY_ROUTE_INVENTORY.md)
- [E2E Operating Model & Assurance Plan](https://app.notion.com/p/4099320b90fb8107a66dd4aeb6924fb9)
- [Universal Work Execution Standard](https://app.notion.com/p/4099320b90fb81b388fadb891c9e7f44)
