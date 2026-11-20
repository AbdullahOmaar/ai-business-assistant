# Autonomous Execution and Task Completion

## Purpose
Prevent premature stops, partial feature delivery, repeated "continue" prompts, lost task state, and unsupported completion claims.

## Operating contract
Every user request that asks for implementation is an end-to-end responsibility. The agent must:
1. Identify the outcome and acceptance criteria.
2. Inspect current implementation and existing work before editing.
3. Track the task and dependencies.
4. Implement all in-scope layers.
5. Test, diagnose, fix, and retest.
6. Review the final diff and security implications.
7. Update the durable task ledger.
8. Continue to the next in-scope action without requiring the user to prompt "continue".
9. Stop only at verified completion or a real blocker that requires human action.

## Acceptance criteria
A task can be marked complete only when the intended behavior is implemented and all applicable validation has been performed. Tests not run must be called out explicitly. A code change, passing build, merged PR, or successful deployment request is not by itself proof that the full feature works in production.

## Blocker protocol
For each blocker, record the observed error, root-cause hypothesis, evidence, attempts made, alternatives considered, and exact next action. Try safe no-cost alternatives where feasible. Never bypass permissions, security controls, required reviews, or explicit approvals. Continue work on independent tasks when possible.

## Persistent state
`TASKS.md` is a handoff ledger, not a replacement for GitHub Issues/PRs. Reconcile it with actual repository state at each run. Avoid duplicating tasks and never mark work complete solely because an earlier chat said it was done.

## Release safety
Use the current production runbook and CI definitions. Confirm the exact candidate SHA, required checks, migration safety, production configuration, deployment version, and authenticated smoke tests when release work is in scope. Production migrations, destructive data changes, and other high-impact operations require the approvals specified by the runbook.

## Execution boundaries
These rules improve agent behavior but do not create background execution by themselves. Continuous or hourly work requires an actual scheduler/runner with repository access, available compute, and appropriate permissions. If a platform ends a run, persist a checkpoint and resume in a later run; never claim continuous execution unless it is actually configured and verified.
