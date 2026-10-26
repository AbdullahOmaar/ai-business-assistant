# Zero-budget operating model

Decision: monthly spend limit is exactly 0. No paid resource may be provisioned, upgraded, or activated by automation.

## Honest capability boundary
A zero-cost design can automate short work cycles, retain state in GitHub, and resume on the next scheduled invocation. It cannot promise a continuously running 24/7 worker on a free serverless tier. Free quotas, sleep policies, account limits, and GitHub-hosted runner availability are external constraints.

## Preferred first implementation
1. Use the existing GitHub repository for task definitions, run summaries, checkpoints, and PRs. Never store credentials in repository files or artifacts.
2. Use GitHub Actions only as a bounded scheduled/event-triggered controller if Actions becomes operational. Use least permissions, concurrency locks, explicit timeouts, a small number of tasks per run, and a hard monthly run budget.
3. Do not use GitHub Actions as a substitute for a permanent daemon; each invocation must be restart-safe and short-lived.
4. Keep existing Vercel projects unchanged. Do not create projects, add paid add-ons, or change production environment variables.
5. Reuse the existing app database only after provider ownership and isolation are verified. Do not reuse the unrelated inactive Supabase project n8n-3a.
6. Check free-tier quotas and billing guardrails before using any provider.

## Budget policy
- monthly_spend_limit_usd: 0
- paid_resource_creation: disabled
- paid_plan_upgrade: disabled
- stop_on_unknown_cost: true
- stop_on_budget_limit: true
- If model inference needs a paid API key, do not call it. Use deterministic scripts, static checks, and existing free CI capacity only.
- Budget alerts are informational if no billing telemetry is available; do not claim provider spend is monitored unless it is connected.

## Safety policy
- No automatic production merge/deploy until exact-SHA required checks pass.
- Missing, skipped, runner-less, cancelled, stale, or unknown checks are blockers.
- No branch-protection bypass or destructive production database operations.
- Never echo secrets into logs, PR comments, artifacts, or the task ledger.

## Next steps
1. Diagnose GitHub Actions runner allocation or establish a verified no-cost execution path.
2. Implement a scheduled, bounded controller and durable task ledger.
3. Test duplicate schedule invocations, cancellation, interrupted work, stale task leases, and zero-budget behavior.
4. Enable automated PR creation only after validation. Merge/deploy stays blocked until all checks are verifiably green.
