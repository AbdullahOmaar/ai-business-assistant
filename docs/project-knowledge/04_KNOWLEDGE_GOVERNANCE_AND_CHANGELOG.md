---
document_id: ABA-KNOW-04
title: Knowledge Governance & Changelog
version: 1.0.0
status: DRAFT
owner: Project Master / Repository Owner
last_verified_at: 2026-10-30T05:30:00Z
review_due: 2026-11-29
knowledge_class: CONTROLLED
applicable_scope: AI Business Assistant Shared Project Knowledge Package
canonical_sources:
  - https://github.com/AbdullahOmaar/ai-business-assistant
  - https://app.notion.com/p/4089320b90fb81ddb93de5116f9f0097
  - https://app.notion.com/p/4099320b90fb812ebd0dc58a22d8ed7c
  - https://app.notion.com/p/4099320b90fb8107a66dd4aeb6924fb9
related_github_sha: d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f
supersedes: none
superseded_by: none
---

# Knowledge Governance & Changelog

> **Publication state:** DRAFT. This file is the package manifest and maintenance contract. Project Sources publication requires an approved PR/review and verified UI readback.

## 1. Package manifest

| Document ID | Filename | Class | Purpose |
| --- | --- | --- | --- |
| ABA-KNOW-00 | [00_PROJECT_CHARTER_AND_SOURCE_MAP.md](./00_PROJECT_CHARTER_AND_SOURCE_MAP.md) | STABLE | Project identity, mission, source authority and bootstrap |
| ABA-KNOW-01 | [01_AGENT_OPERATING_MODEL.md](./01_AGENT_OPERATING_MODEL.md) | CONTROLLED | Roles, discovery, execution, handoffs and command behavior |
| ABA-KNOW-02 | [02_ARCHITECTURE_AND_ENGINEERING_STANDARDS.md](./02_ARCHITECTURE_AND_ENGINEERING_STANDARDS.md) | CONTROLLED | Accepted architecture and engineering constraints |
| ABA-KNOW-03 | [03_SECURITY_POLICY_AND_RELEASE_GATES.md](./03_SECURITY_POLICY_AND_RELEASE_GATES.md) | CONTROLLED | Security, data integrity, approvals and release gates |
| ABA-KNOW-04 | [04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md](./04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md) | CONTROLLED | Manifest, freshness, publication and changelog |

The five documents above are the complete canonical package. Do not add a sixth orientation file or copy live task/PR/deployment snapshots into these documents.

## 2. Metadata contract

Every document must include:
- `document_id`: stable unique identifier.
- `title` and semantic `version`.
- `status`: DRAFT, APPROVED or SUPERSEDED.
- `owner`: accountable role, not an invented runtime identity.
- `last_verified_at`: UTC timestamp of the last source-evidence review.
- `review_due`: next planned review date.
- `knowledge_class`: STABLE or CONTROLLED.
- `applicable_scope`.
- `canonical_sources`: exact GitHub/Notion references used.
- `related_github_sha` and supersession references where relevant.

Unknown or unverified facts must be marked UNKNOWN / NOT VERIFIED in the document. A recent edit timestamp is not proof of correctness or approval.

## 3. Authority and freshness model

- GitHub is authoritative for code, branches, commits, PRs, reviews, tests and CI.
- Notion is authoritative for product scope, assignments, ownership, dependencies, approved decisions and handoffs.
- Vercel is authoritative for deployment/runtime evidence; Neon is authoritative for database schema/revision evidence.
- Project Sources are a published read model of stable/controlled knowledge, never a fourth live status database.
- Project Instructions are a separate ChatGPT UI setting and must be verified independently.

Freshness states:
- **CURRENT:** source and policy evidence was checked for the stated scope.
- **REVIEW_DUE:** scheduled review date reached.
- **STALE:** a relevant source event invalidated the content or the review window expired.
- **SUPERSEDED:** a canonical newer record explicitly replaces it.
- **UNKNOWN:** evidence is unavailable or insufficient.
- **CONFLICTED:** authoritative sources disagree and no valid supersession resolves the conflict.

Freshness is event-aware: a relevant ADR, policy, role, security, runbook or provider change invalidates dependent knowledge immediately, even before the review date. Dynamic facts such as tasks, branch heads, PR status, CI and deployment are never made current by copying them into this package.

Suggested review cadence (operational proposal, pending owner approval):
- STABLE: every 90 days, and immediately after a project identity/scope/authority change.
- CONTROLLED: every 30 days, and immediately after a relevant ADR, policy, security, release or operating-model change.
- Any security incident or owner decision affecting permissions invalidates the relevant document immediately.

## 4. Conflict and supersession protocol

1. Classify the disputed information.
2. Identify its authoritative owning system.
3. Check explicit approval, effective date, scope and supersession.
4. Do not resolve conflicts by last-edited time alone.
5. Preserve historical records and mark superseded material; never erase history to hide a conflict.
6. If authority remains ambiguous, mark CONFLICTED / UNKNOWN and fail closed for consequential actions.
7. Record the exact conflict, source references, owner and required resolution.
8. Update only affected documents after the canonical decision is resolved and independently checked.

## 5. Workstream closeout → knowledge update

At every Workstream Closeout:

1. Read the canonical Notion task, acceptance criteria, latest comments and handoff.
2. Verify the exact GitHub branch/head/base, changed files, tests, review and PR state.
3. Separate implemented, tested, reviewed, merged, deployed and live-verified outcomes.
4. Ask whether the work produced a durable change to project identity, operating rules, architecture, security, release policy or knowledge governance.
5. Classify the outcome:
   - **NO KNOWLEDGE CHANGE:** no stable/controlled rule changed; do not touch this package.
   - **UPDATE EXISTING DOCUMENT:** an existing knowledge rule changed; update the one owning file.
   - **NEW CANONICAL DECISION:** create or update the owning ADR/Notion decision first; then summarize/link it here.
6. Do not copy dynamic status, test output, temporary blockers, customer data, secrets or payroll-sensitive data into Project Sources.
7. Update the canonical GitHub file with version, owner, UTC verification time, review date, source links and supersession metadata.
8. Request independent review for controlled/security/architecture changes. Do not mark APPROVED without the authorized decision/review.
9. Publish only the approved version to ChatGPT Project Sources.
10. Read back every published file and compare filename, version and content with the GitHub canonical copy.
11. Update this changelog and the existing Notion task/handoff with exact PR/SHA, versions, publication/readback state and remaining gaps.
12. If Project UI access is unavailable, provide the exact manual action and mark publication NOT VERIFIED; do not claim sync.

## 6. Publication protocol

- Canonical editable source: `docs/project-knowledge/` in this repository.
- Publication target: ChatGPT Project → Sources.
- Only status APPROVED may be published as the active knowledge package.
- Publish the five files as one consistent version set; never mix versions silently.
- Preserve previous package versions in Git history and record supersession in metadata/changelog.
- Project Sources do not auto-sync with GitHub. A GitHub commit is not proof of upload.
- Project Instructions are not part of this five-file package and require separate UI save/readback.
- Do not upload secrets, production/customer data, full logs or temporary task snapshots.

## 7. Project Instructions — copy-ready draft

The following is a concise draft for the ChatGPT Project Instructions field. It must be checked against the actual UI character limit, saved by an authorized user and read back before it is considered active:

```text
For every new or resumed AI Business Assistant chat, read all five Project Sources files first. Treat them as stable/controlled context, not live status. Discover this chat's role only from its own context or a verified runtime binding; blank or conflicting identity defaults to Master triage. Before work, read the canonical Notion Registry, Operating Model, Master Task Plan, assigned task and latest handoff/comments. Verify live GitHub AGENTS.md, README.md, TASKS.md, main SHA, relevant branches/PRs/diffs and exact-head checks. Use Vercel/Neon for deployment/runtime/schema evidence. Resolve conflicts by source authority, explicit approval and supersession—not last edit time. Mark inaccessible or stale facts UNKNOWN/STALE and fail closed for sensitive actions. Execute all safe authorized work through tests, fixes, review, docs and evidence; a report is a checkpoint, not completion. Block only dependent criteria and continue independent work. Never invent identity, dispatch, acknowledgement, test results or deployment. No merge, production write/migration or deployment without required explicit authorization and gates. Update knowledge only after verified durable change, independent review and approved publication.
```

## 8. Validation and integrity checks

Before review/publication:
- Exactly five canonical Markdown files exist in this directory.
- All five IDs are unique and metadata fields are complete.
- Versions, statuses, owner, UTC verification time, review date and scope are consistent.
- Local Markdown links resolve inside the repository.
- Canonical external source references are present and not replaced by stale snapshots.
- No secrets, customer data, payroll-sensitive data or dynamic status snapshots appear.
- No duplicate or contradictory policy is introduced.
- DRAFT documents are not published as APPROVED.

Run:
`python scripts/validate_project_knowledge.py`

## 9. Review schedule and ownership

- Accountable owner: Project Master / Repository Owner (logical role).
- Independent reviewer: a reviewer who did not author the changed content, when available.
- Stable documents: review every 90 days or on relevant scope/identity/source-authority event.
- Controlled documents: review every 30 days or immediately on relevant policy/ADR/security/release change.
- The review schedule is a proposed maintenance default until explicitly approved by the owner.


## 10. E2E acceptance scenarios

These scenarios define expected behavior of the shared knowledge layer. They are acceptance criteria, not a claim that they have already been executed.

| ID | Scenario | Expected safe result |
| --- | --- | --- |
| S01 | A new blank chat opens the project | Reads the package, defaults to Master triage, resolves a task from Notion and refreshes GitHub; does not guess specialist identity |
| S02 | A specialist chat resumes | Uses its unique role/task anchor, re-reads the latest handoff and refreshes the existing branch/PR; does not restart completed work |
| S03 | One chat hands off to another | Handoff includes task, scope, exact branch/SHA, files, tests, blockers and next action; no acknowledgement is invented |
| S04 | Sources conflict (for example, old Notion text vs a newer task decision) | Checks domain authority, approval and explicit supersession; unresolved conflict is CONFLICTED and dependent action fails closed |
| S05 | Architecture changes in an ADR | Relevant architecture knowledge is invalidated; consumers re-read the accepted ADR before implementation |
| S06 | Branch/PR advances while another chat is working | Refreshes exact head and changed files; stale test evidence is NOT PASS; no concurrent overwrite or duplicate branch |
| S07 | Workstream closeout | Reconciles task status with GitHub/tests/review evidence; updates the canonical handoff; remaining criteria stay PARTIALLY COMPLETE/BLOCKED/NOT RUN |
| S08 | Demo/release preparation | Uses approved scope, exact-SHA checks, deployment/runtime evidence and separate release authorization; no READY/HTTP 200 shortcut |
| S09 | Notion or GitHub is unavailable | Labels affected facts UNKNOWN/BLOCKED, avoids stale snapshots as current and continues independent safe work |
| S10 | Stale/conflicting information is found | Applies event invalidation, preserves prior versions and points to a canonical successor only after verification |
| S11 | An agent attempts an unauthorized action | Refuses the protected action, records the blocker and verifies no unauthorized branch, PR, database, financial or deployment side effect |

For every scenario, record the fixture/input, canonical source references, package version, observed output, forbidden side effects, pass/fail, runner/tool context, timestamp and reviewer disposition. Until such execution evidence exists, every scenario remains NOT RUN.

## 11. Changelog

### 1.0.0 — 2026-10-30 — DRAFT
- Consolidated iteration of the earlier 0.1.0 DRAFT package on `docs/project-sources-knowledge-pack-20261030`; that branch remains unmerged and is retained as historical draft evidence, not an approved predecessor.
- Preserved the eleven S01–S11 shared-knowledge E2E acceptance scenarios; execution remains NOT RUN.
- Initial five-document package authored from GitHub main and canonical Notion sources.
- Recorded source authority, role discovery, engineering/security guardrails and closeout publication workflow.
- Preserved the unresolved T37 authority conflict as fail-closed; did not promote historical approval text.
- Project Sources inventory/publication and Project Instructions UI readback remain NOT VERIFIED.
