#!/usr/bin/env python3
"""Validate the durable task ledger and emit an evidence-first follow-up report."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "docs/agent/task-ledger.json"
REPORT = ROOT / "task-monitor-report.md"
ALLOWED = {"pending", "in_progress", "blocked", "review", "verified", "merged", "deployed"}
EVIDENCE_STATES = {"verified", "merged", "deployed"}

def main() -> int:
    data = json.loads(LEDGER.read_text(encoding="utf-8"))
    tasks = data.get("tasks")
    errors = []
    ids = set()
    if not isinstance(tasks, list) or not tasks:
        errors.append("tasks must be a non-empty array")
        tasks = []
    for task in tasks:
        tid = task.get("id")
        if not tid or tid in ids:
            errors.append(f"missing or duplicate task id: {tid!r}")
        ids.add(tid)
        if task.get("status") not in ALLOWED:
            errors.append(f"{tid}: invalid status {task.get('status')!r}")
        if task.get("status") in EVIDENCE_STATES and not task.get("evidence"):
            errors.append(f"{tid}: evidence required for {task.get('status')}")
        if task.get("status") in {"verified", "merged", "deployed"} and task.get("last_test_result") in {"unverified", None, ""}:
            errors.append(f"{tid}: test evidence is not verified")
    for task in tasks:
        for dep in task.get("dependencies", []):
            if dep not in ids:
                errors.append(f"{task.get('id')}: unknown dependency {dep}")
    now = datetime.now(timezone.utc).isoformat()
    incomplete = [t for t in tasks if t.get("status") not in EVIDENCE_STATES]
    lines = [
        "# Scheduled Task Monitor Report", "",
        f"- Generated (UTC): {now}",
        f"- Ledger: docs/agent/task-ledger.json",
        f"- Tasks: {len(tasks)} total; {len(incomplete)} incomplete; {len(errors)} ledger validation errors",
        "- This report does not claim CI, merge, deployment, or runtime success unless linked evidence exists.", "",
        "## Follow-up queue"
    ]
    for t in incomplete:
        lines += [
            f"### {t.get('id')} — {t.get('title')}",
            f"- Status: {t.get('status')}",
            f"- Blocker: {t.get('blocker') or 'None recorded'}",
            f"- Next action: {t.get('next_action') or 'Investigate and record a specific next action'}",
            f"- Evidence: {t.get('evidence') or 'No evidence recorded'}", ""
        ]
    lines += ["## Ledger validation", *(f"- ERROR: {e}" for e in errors)] if errors else ["## Ledger validation", "- PASS"]
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 1 if errors else 0

if __name__ == "__main__":
    raise SystemExit(main())
