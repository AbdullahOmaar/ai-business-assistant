# Notion Migration Capture Manifest

Captured on 2026-10-29 from the connected Notion workspace for migration preparation.

## Page snapshots captured

Rendered Notion page snapshots are under `notion-page-snapshots/`:

- `product-home.md`
- `operating-model.md`
- `agent-registry.md`
- `master-task-plan.md`
- `brd-prd-control-center.md`
- `t37-financial-contract.md`
- `t03-security.md`
- `t39-inventory-purchasing.md`
- `t40-expenses-reports.md`
- `t41-employees-payroll.md`

## Discussion snapshots captured

Discussion tool output is under `notion-discussion-snapshots/`:

- `operating-model-discussions.md`
- `agent-registry-discussions.md`
- `master-task-plan-discussions.md`
- `t37-financial-contract-discussions.md`
- `t03-security-discussions.md`
- `t40-expenses-reports-discussions.md`
- `t41-employees-payroll-discussions.md`

The discussion tool returned `suggested_edits_status=upgrade_required`; therefore these snapshots must not be interpreted as proof that all suggested edits were available. The native export is still required.

## What this adds

The migration package now preserves more than a summary: it includes rendered source snapshots of the core governance/requirements pages and the discussion responses available for key pages. Each snapshot carries its source URL/ID and available edit/truncation metadata.

## Still missing / not guaranteed

- Full native workspace export and all child pages, archived pages, and attachments.
- A complete CSV export of every Master Task Plan row and exact old/new row-count reconciliation.
- Every page's comments/discussions and suggested edits; only seven selected pages were queried.
- Database relation IDs, rollups, saved views, filters, sorts, and all schema details across all data sources.
- Permissions, teamspace membership, integration configuration, connected apps, secrets, and agent/session state.
- Complete chat handoffs and agent conversation transcripts.
- Verification that the snapshots include every block; the returned metadata did not expose a positive truncation count, but this is not a substitute for native export.

## Next capture sequence

1. Obtain and preserve the native Notion export ZIP (Markdown & CSV; include subpages/databases).
2. Inventory all page and database entries from the export; compare against this manifest and page index.
3. Capture any missing decision, architecture/security/data, UX/design, delivery/QA/release, product-learning, archive, chat-handoff, and feature-owner pages.
4. Compare all task IDs, statuses, dependencies, owners, acceptance criteria, evidence links, comments, and attachment references.
5. Import/rebuild into the new workspace, then run a reconciliation checklist before cutover.

## Safety

This is a documentation-only branch. No merge, deployment, production mutation, or deletion of old workspace data has occurred.
