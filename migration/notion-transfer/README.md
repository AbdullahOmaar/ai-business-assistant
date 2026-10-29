# AI Business Assistant — Notion Migration Handoff

**Purpose:** preserve the project's durable coordination context while moving to a newly created Notion workspace.

## Scope and truthfulness

This directory is a **migration handoff package**, not a full export of the old Notion workspace. It is stored on a dedicated Git branch and is not merged into `main`.

- GitHub remains authoritative for source code, branches, issues, pull requests, commits, and CI.
- Notion is intended to remain the canonical coordination layer for the new workspace.
- The package preserves known operating rules, old workspace page links, a historical task snapshot, and a bootstrap procedure.
- It does **not** contain every Notion page/database row, all comments, files/attachments, permissions, relation IDs, integration credentials, or agent-session state.
- The old Notion workspace must not be deleted or disconnected until the new workspace has been reconciled and verified.

## Files

- `OPERATING_MODEL.md` — project rules, evidence standards, and release safety.
- `LIVE_SNAPSHOT.md` — evidence observed while creating this package, plus explicitly stale historical notes.
- `NOTION_PAGE_INDEX.md` — old workspace links and the known task database schema.
- `BOOTSTRAP_PROMPT.md` — instructions for the first migration/reconciliation session in the new workspace.

## Migration sequence

1. Export the old Notion workspace using Notion's native export, including subpages and databases (Markdown & CSV where available). Keep the export ZIP intact.
2. Import the export into the new workspace. Notion may not preserve all relation properties, comments, permissions, or integration configuration exactly.
3. Connect the Notion integration to the new workspace and grant only required access.
4. Use this package to reconcile imported pages against GitHub's live state.
5. Recreate/repair database schemas, relations, rollups, views, page links, Agent Registry, Operating Model, Master Plan, and task ownership.
6. Verify representative task rows, comments/discussions where accessible, links, attachments, and permissions.
7. Only after verification, designate the new workspace canonical. Keep the old workspace as rollback/reference until then.

## Current package status

- **PARTIALLY COMPLETE** — handoff documentation committed on a dedicated branch.
- **NOT RUN** — full native Notion export/import, new-workspace reconciliation, full database row count comparison, permissions validation.
- **BLOCKED** — full transfer of old Notion content cannot be completed without the native export and access to the destination workspace.
- No PR merge or production deployment is part of this package.
