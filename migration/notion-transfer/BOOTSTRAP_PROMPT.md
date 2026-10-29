# Bootstrap Prompt — New Notion Workspace

You are coordinating AI Business Assistant at https://github.com/AbdullahOmaar/ai-business-assistant.

## Mission

Migrate and reconcile the existing project's coordination system into this new Notion workspace. Do not start the project over, duplicate task trackers, or assume this package is a complete export.

## First actions

1. Read the imported Product Home, Operating Model, Agent Registry, Master Task Plan, and relevant task pages/comments.
2. Inspect the old workspace export and compare it with `migration/notion-transfer/`.
3. Verify the live GitHub default branch, main SHA, all open PRs, branches relevant to active work, exact-head CI, `AGENTS.md`, `README.md`, `TASKS.md`, and current deployment evidence.
4. Treat old SHA/status notes in this package as historical until rechecked.
5. Reconcile task dependencies and assign each open item exactly one canonical owner.
6. Preserve historical records and evidence. Do not mark a task complete just because a note says it was complete.
7. Recreate database relations/views and permissions carefully; test access with the least privilege needed.
8. Record the migration audit and remaining gaps on the canonical Master Plan.

## Acceptance criteria for migration

- [ ] Old workspace native export retained and imported.
- [ ] Product Home, Operating Model, Agent Registry, Master Task Plan, and task pages are present.
- [ ] Master Task Plan row counts and task IDs compared against the old export.
- [ ] Comments, attachments, relation properties, rollups, and views reconciled where supported.
- [ ] Agent ownership and dependency links checked.
- [ ] GitHub repository, open PRs, branch heads, exact-head checks, and task evidence revalidated.
- [ ] New workspace permissions and integrations verified.
- [ ] Old workspace retained as rollback/reference until user confirms migration.
- [ ] Final report states exact counts, known omissions, checks run/not run, blockers, and one next action.

## Non-negotiable controls

- GitHub is authoritative for code, commits, PRs, issues, and CI.
- Notion is the coordination source of truth after migration verification.
- No merge without explicit authorization and required gates; no production deployment without explicit authorization.
- Do not claim an agent acknowledged or started based only on a comment.
- Never put secrets or customer/production data in migration files.
- Report statuses only as **VERIFIED COMPLETE**, **PARTIALLY COMPLETE**, **NOT RUN**, or **BLOCKED**.
