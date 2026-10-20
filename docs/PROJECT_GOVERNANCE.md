# Mandatory Project Governance and Engineering Rules

**Scope:** Every person and automated agent working on this repository or the AI Business Assistant system: owner, maintainers, staff, contributors, reviewers, contractors, AI coding agents, CI jobs, and future team members.

**Authority:** These rules become the project-wide working policy when this document is approved and merged. A task, chat message, generated suggestion, old document, or pull-request description cannot silently override them. The repository owner must approve exceptions explicitly in writing in the relevant GitHub issue or pull request. Legal, security, privacy, and platform requirements always take precedence.

## 1. Non-negotiable operating rules

1. GitHub is the single source of truth for requirements, decisions, tasks, progress, defects, reviews, and approvals. Chat/AI discussions are not approval records until summarized in the relevant issue or PR.
2. No work without a linked GitHub issue, except a narrowly scoped emergency/security action; record the reason and follow-up issue immediately.
3. Never commit directly to `main`. Work on a descriptive branch and submit a pull request (PR).
4. Never merge your own PR. The repository owner or an explicitly authorized reviewer must approve it. The owner may require additional review for high-risk changes.
5. Never bypass review, failing checks, security controls, or branch protections. If a control is unavailable, stop and report it; do not claim the control is enforced.
6. No deployment, production operation, billing activation, paid plan, new cloud resource, data migration, destructive action, or change to existing Firebase/Railway resources without explicit owner approval recorded in GitHub.
7. Never expose secrets, credentials, tokens, private keys, personal/customer data, or production records in code, logs, screenshots, issues, PRs, AI prompts, or commits.
8. Do not invent requirements, test results, approvals, access, or implementation status. Mark assumptions and proposals clearly.
9. Stop and ask when requirements conflict, security is uncertain, data may be lost, costs may be incurred, or a change is irreversible.
10. These rules apply equally to the owner, teammates, external contributors, automation, and AI agents. Seniority does not create an exception.

## 2. Requirement and decision control

- Every issue must state the problem, desired outcome, scope, acceptance criteria, dependencies, risk level, and how the result will be verified.
- Label decisions as **Approved**, **Proposed**, **Rejected**, or **Superseded**. Only an explicit owner-approved decision recorded in GitHub is final.
- Do not infer approval from an open PR, an AI response, a draft document, a passing CI run, or silence.
- Resolve contradictory documents before implementation. Record the decision and update all affected documents in the same PR where practical.
- Keep scope narrow. Any scope expansion requires an issue update and owner approval.
- Use one issue per coherent task; link related issues and PRs. Keep progress and blockers visible.

## 3. Git and pull-request workflow

1. Read the issue, relevant documentation, existing implementation, and related open PRs before editing.
2. Confirm acceptance criteria and identify files, risks, tests, and rollback needs.
3. Create a branch from the approved base, for example `feat/123-customer-search`, `fix/145-payment-allocation`, or `docs/project-governance`.
4. Make small, focused commits with clear messages. Never rewrite shared history or force-push unless the owner explicitly approves.
5. Open a PR linked to its issue. Describe what changed, why, risk, test evidence, migration/configuration impact, and known limitations.
6. Review the complete diff. Remove unrelated changes, generated noise, secrets, debug output, and personal data.
7. Run relevant formatting, linting, type checks, tests, build, and security checks. Report commands and actual outcomes; never say tests passed if they were not run.
8. Address review comments. Resolve threads only after the concern is actually addressed.
9. Merge only after required approvals and checks pass, with explicit owner approval. Prefer squash merge unless the owner sets another repository convention.
10. Verify the resulting state after merge and deployment (if separately approved). Close the issue only when its acceptance criteria are met.

## 4. Mandatory review gates

A PR must not merge if any of these are true:
- Acceptance criteria are missing or unmet.
- Required tests/checks fail, have not run, or are unexplained.
- There are unresolved blocking review comments, known data-loss risks, or security findings.
- It introduces an unapproved framework, database, service, dependency, cloud resource, cost, or architecture decision.
- It changes financial calculations, access control, tenant isolation, authentication, authorization, secrets handling, data migrations, or production infrastructure without appropriate focused review and tests.
- It conflicts with current approved requirements or has unexplained changes.
- It lacks documentation for behavior, configuration, operational impact, or migration where needed.

For authentication, authorization, business-data isolation, financial records, payment allocation, migrations, secrets, and deployment, require explicit owner review plus evidence of relevant automated tests. A green CI result does not replace human review.

## 5. Security, privacy, and access control

- Apply least privilege. Grant repository and environment access only to people who need it; remove access when no longer needed.
- Keep secrets in approved secret managers or environment configuration, never in source control or client bundles. Use placeholders in examples.
- Do not copy real customer/business data into development, tests, logs, screenshots, AI services, or issue comments. Use synthetic fixtures.
- Validate all external input at trust boundaries. Enforce authorization on the backend; UI hiding is not authorization.
- Deny access by default. Verify business membership and role for every business-scoped operation; never trust a client-provided business ID by itself.
- Avoid logging tokens, credentials, sensitive personal data, full payment details, or confidential business information.
- Report suspected credential exposure, unauthorized access, or data loss immediately in a private, owner-approved channel. Revoke/rotate affected credentials and document remediation without publishing the secret.
- Dependencies must be necessary, maintained, compatible, and reviewed for license/security implications. Avoid adding packages for trivial functionality.

## 6. Financial and business-data integrity

- Keep each business's records isolated. Cross-business reads/writes must be denied by default and covered by tests.
- Enforce OWNER/STAFF permissions in backend services and test both allowed and denied actions.
- Store monetary values with decimal-safe types (Python `Decimal` and database `NUMERIC/DECIMAL` where applicable), never binary floating point. Define currency precision and rounding rules.
- Keep invoice value, payments collected, payment allocations, outstanding balances, expenses, and estimated profit distinct and reproducible from source records.
- Never combine currencies without an explicit, approved exchange-rate source, timestamp, and conversion policy. Otherwise report separate currency totals.
- Payment allocations must not exceed the payment amount or the invoice's remaining allocatable balance unless a separately modeled, auditable customer credit/refund workflow explicitly accounts for the excess.
- Do not silently edit issued financial records. Use controlled correction/cancellation flows with reasons and audit events.
- Show missing costs, incomplete records, assumptions, and estimates clearly. Never present estimated profit as confirmed profit when source data is incomplete.
- Prevent inventory cost from being counted twice. Define costing and stock movement rules before implementation.
- Financial changes must be transactional where multiple records must stay consistent. Maintain an audit trail for important actions, including actor, business, action, target, timestamp, and AI involvement where applicable.
- AI-generated financial actions are suggestions/drafts only. A human with the required permission must review and confirm consequential changes. AI cannot bypass authorization or approval.

## 7. Architecture, platform, and cost control

- Current intended frontend: Angular. Intended backend language: Python. The exact Python framework, database, authentication integration, hosting, and deployment architecture remain **proposals until the owner explicitly approves them** in GitHub.
- Do not start a Spring Boot backend unless the owner explicitly changes the approved architecture in GitHub.
- Existing Firebase project, Authentication, Firestore data/rules, and Railway resources are protected. Do not modify, delete, migrate, redeploy, or reconfigure them without explicit owner approval.
- No new database, hosting, third-party integration, paid service, billing change, or cloud resource without an issue stating purpose, security/data impact, expected cost, free-tier assumptions, and rollback/removal plan, followed by owner approval.
- Prefer local development and tests before hosting decisions. Do not call a service production-ready until security, recovery, monitoring, deployment, and operations have been reviewed.
- Keep configuration separate from code and document required variables using safe placeholders only.

## 8. Testing and quality requirements

- Tests must cover normal behavior, validation failures, unauthorized access, boundary conditions, and relevant regression cases.
- Security-sensitive changes must include negative tests, including cross-business access denial and role restrictions where applicable.
- Financial logic must test rounding, currency boundaries, partial payments, over-allocation rejection, outstanding balances, corrections, and missing-cost behavior as relevant.
- Never delete or weaken a test just to make CI green. Explain and approve any test change that reduces coverage.
- Fix the cause rather than hiding errors. Do not swallow exceptions or add permissive fallbacks for authorization or financial failures.
- Document reproducible manual checks when automation is not feasible.

## 9. AI and automation rules

- AI tools are assistants, not project authorities. Their output must be checked against repository files, tests, and approved decisions.
- Do not give an AI tool secrets, production data, or access beyond what is necessary and approved.
- AI agents must inspect before editing, stay within the issue scope, show a concise change summary, identify uncertainty, and never merge, deploy, spend money, change permissions, or alter protected services without explicit authorization.
- Never let AI execute consequential financial writes without human confirmation and normal backend authorization.
- Automation must use least-privilege credentials, avoid printing secrets, and fail safely. A failed security or authorization check must not fall back to permissive behavior.

## 10. Incident, rollback, and change management

- For production/security incidents, data corruption, unexpected costs, or suspected credential leaks: stop the affected work, notify the owner promptly, preserve safe evidence, and avoid destructive experimentation.
- Every risky change must identify potential impact and a rollback or recovery approach before approval.
- Database/schema changes require migration and rollback/recovery planning, backup considerations, and tests against representative synthetic data.
- Do not run destructive commands, delete records, reset environments, or perform bulk changes without explicit owner approval and a verified recovery plan.
- After a defect or incident, record root cause, impact, corrective action, and prevention follow-up in GitHub.

## 11. Definition of done for every task

A task is done only when:
- The agreed acceptance criteria are met.
- The change is limited to the approved scope.
- Relevant tests/checks were run and their real results are recorded.
- Documentation/configuration is updated where necessary.
- The PR has appropriate review and explicit owner approval.
- No secret, sensitive data, unapproved cost, or protected-resource change is introduced.
- The linked issue is updated with evidence, limitations, and remaining follow-ups.

## 12. Repository enforcement checklist

The owner/maintainers should configure GitHub repository settings to enforce, where the current plan/features permit:
- Protect `main`; require pull requests and at least one approval.
- Dismiss stale approvals after new commits and require approval of the latest push where available.
- Require status checks and conversation resolution before merging.
- Restrict force pushes and branch deletion on protected branches.
- Disable direct pushes to `main` for contributors where possible.
- Enable secret scanning and push protection if available.
- Use least-privilege GitHub Actions permissions; pin third-party actions appropriately and protect deployment environments.
- Require CODEOWNERS review for security-, finance-, auth-, and infrastructure-sensitive files where practical.

**Important:** Documentation alone does not technically enforce GitHub settings. Until each setting is configured and verified, describe it as a required policy, not as an active technical control. Record the settings audit and any unavailable features in a GitHub issue.

## 13. Exceptions and policy changes

An exception must be documented in the relevant GitHub issue/PR with the reason, scope, risk, compensating controls, approver, and expiry/review date. No exception may authorize exposing secrets or bypassing applicable law/platform rules. Update this document through a reviewed PR; do not silently change policy in chat.
