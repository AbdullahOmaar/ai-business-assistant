# Shared Project Knowledge System Implementation Plan

> **Execution record:** User-authorized implementation and verification handoff; this plan records actual execution and outstanding gates. The five canonical knowledge documents remain the only files inside `docs/project-knowledge/`.

**Goal:** Create a versioned, evidence-backed five-document knowledge package for ChatGPT Project Sources, with repository validation and a governed Notion closeout workflow.

**Architecture:** GitHub stores the reviewable canonical Markdown package. Notion remains the coordination authority and links to the package; ChatGPT Project Sources receives only an approved publication copy. Dynamic task, branch, PR, CI and deployment state stays in its owning live system. Project Sources and Project Instructions UI changes require explicit readback; this session has no direct UI control.

**Tech Stack:** Markdown, GitHub Contents API, Python standard library validator, Notion connector.

**Spec:** User-provided “AI BUSINESS ASSISTANT — SHARED PROJECT KNOWLEDGE SYSTEM / IMPLEMENTATION HANDOFF PROMPT v1.0”.

## Global Constraints

- Base: `main` at `d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f`.
- Do not modify application code or financial semantics.
- Do not merge or deploy.
- Do not trigger, rerun or retry CircleCI; quota freeze is active.
- Do not introduce GitHub Actions or another CI provider.
- Do not publish DRAFT documents to Project Sources.
- Preserve all existing Notion content and GitHub user work.

## Review Focus

- Historical T37 approval statements conflict; package must fail closed and cite the current unresolved state.
- `TASKS.md` contains stale SHA/status snapshots; do not copy them as current facts.
- Project Sources inventory and Project Instructions readback are unavailable through current tools.
- Existing PR #307 is a Notion migration package, not this knowledge-system work.
- CI is frozen; repository validation must not claim CI success.

---

### Task 1: Baseline and evidence reconciliation

**Files:** none.

- [x] Read repository identity, README, AGENTS, TASKS, CONTRIBUTING, Architecture Baseline, ADR-001 and deployment runbook.
- [x] Read canonical Notion Registry, Operating Model, Master Task Plan, Universal Execution Standard, Work Package Standard, E2E Assurance, Product Charter and T37 decision page.
- [x] Verify current main SHA and open PR inventory.
- [x] Record exact inaccessible surfaces and unresolved conflicts: Project Sources / Project Instructions UI unavailable; CircleCI frozen; Desktop Commander device offline; T37 authority conflict remains fail-closed.

### Task 2: Author the five knowledge documents

**Files:**
- Create: `docs/project-knowledge/00_PROJECT_CHARTER_AND_SOURCE_MAP.md`
- Create: `docs/project-knowledge/01_AGENT_OPERATING_MODEL.md`
- Create: `docs/project-knowledge/02_ARCHITECTURE_AND_ENGINEERING_STANDARDS.md`
- Create: `docs/project-knowledge/03_SECURITY_POLICY_AND_RELEASE_GATES.md`
- Create: `docs/project-knowledge/04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md`

- [x] Add consistent metadata and canonical source references.
- [x] Mark all five documents DRAFT pending independent review/approval.
- [x] Keep dynamic task, PR, CI, deployment and runtime status out of the package.

### Task 3: Add package validation

**Files:**
- Create: `scripts/validate_project_knowledge.py`

- [x] Implement exact package-file set, required metadata, expected unique IDs, allowed status, package version/status/owner consistency, valid dates, SHA format, non-empty canonical sources and repository-confined local links.
- [ ] Run validator against the package and record output — NOT RUN (only connected Desktop Commander device is offline; no local checkout/runtime available).

### Task 4: Repository ledger and PR

**Files:**
- Modify: `TASKS.md`

- [x] Append a dated evidence checkpoint without rewriting historical entries.
- [x] Open one Draft PR; no merge.

### Task 5: Notion governance

**Files:** existing canonical Operating Model page only.

- [x] Append a bounded knowledge-publication/closeout procedure and GitHub package link to the existing canonical Operating Model.
- [x] Preserve existing text and conflicting history; do not mark T37 approved.

### Task 6: Publication and UI verification

**Files:** none.

- [ ] Inspect Project Sources inventory and publish only after approval — NOT VERIFIED (Project UI is not exposed; package remains DRAFT).
- [ ] Read back Project Sources and Project Instructions — NOT VERIFIED (Project UI is not exposed).
- [x] If the UI is inaccessible, record the exact manual publication/settings requirement and mark publication/readback NOT VERIFIED.

### Task 7: Final review

- [x] Perform a source/diff review of package content, links, metadata and security boundaries; no secrets/customer/payroll data found in reviewed package.
- [x] Record static checks and all NOT RUN checks; executable validator/unit tests remain NOT RUN.
- [x] Complete a Project Master maintainer self-review of the five documents, validator, tests and source lineage; fix validator boundary/date/link-scheme gaps found during review.
- [ ] Independent human review — NOT AVAILABLE. The maintainer self-review is explicitly non-independent and does not satisfy this gate.
- [ ] Run the expanded 17-case validator unit suite and package validator — NOT RUN (approved local runtime remains unavailable; CI is frozen).
- [x] Keep merge/deployment separate and unauthorized.
