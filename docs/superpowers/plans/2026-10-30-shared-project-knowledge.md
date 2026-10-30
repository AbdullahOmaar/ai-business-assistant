# Shared Project Knowledge System Implementation Plan

> **For agentic workers:** Implement the approved handoff in this plan task-by-task. The five published knowledge documents remain the only files inside `docs/project-knowledge/`.

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
- [ ] Record exact inaccessible surfaces and unresolved conflicts.

### Task 2: Author the five knowledge documents

**Files:**
- Create: `docs/project-knowledge/00_PROJECT_CHARTER_AND_SOURCE_MAP.md`
- Create: `docs/project-knowledge/01_AGENT_OPERATING_MODEL.md`
- Create: `docs/project-knowledge/02_ARCHITECTURE_AND_ENGINEERING_STANDARDS.md`
- Create: `docs/project-knowledge/03_SECURITY_POLICY_AND_RELEASE_GATES.md`
- Create: `docs/project-knowledge/04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md`

- [ ] Add consistent metadata and canonical source references.
- [ ] Mark the initial package DRAFT pending independent review/approval.
- [ ] Keep all dynamic status out of the package.

### Task 3: Add package validation

**Files:**
- Create: `scripts/validate_project_knowledge.py`

- [ ] Validate exact five-file set, required metadata, unique document IDs, allowed status values, and local Markdown links.
- [ ] Run validator against the package and record output.

### Task 4: Repository ledger and PR

**Files:**
- Modify: `TASKS.md`

- [ ] Append a dated evidence checkpoint without rewriting historical entries.
- [ ] Open one Draft PR; no merge.

### Task 5: Notion governance

**Files:** existing canonical Operating Model page only.

- [ ] Append a bounded knowledge-publication/closeout procedure and GitHub package link.
- [ ] Preserve existing text and conflicting history; do not mark T37 approved.

### Task 6: Publication and UI verification

**Files:** none.

- [ ] Inspect Project Sources inventory and publish only after approval if the UI is accessible.
- [ ] Read back Project Sources and Project Instructions.
- [ ] If the UI is inaccessible, provide exact manual upload/settings steps and mark publication/readback NOT VERIFIED.

### Task 7: Final review

- [ ] Review package content, links, metadata, security and diff.
- [ ] Record validator results and all NOT RUN checks.
- [ ] Keep merge/deployment separate and unauthorized.
