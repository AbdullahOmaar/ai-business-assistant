#!/usr/bin/env python3
"""Offline validation for the repository-seeded engineering agent ledger."""
from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "docs" / "agent" / "initial-task-ledger.json"

def main() -> int:
    data = json.loads(LEDGER.read_text(encoding="utf-8"))
    assert data.get("schema_version") == 1, "unsupported schema_version"
    agent = data.get("agent")
    assert isinstance(agent, dict), "agent config must be an object"
    assert agent.get("status") == "not_deployed", "do not misrepresent a live worker"
    assert agent.get("budget_mode") == "controlled", "budget must be controlled"
    assert agent.get("monthly_spend_limit_usd") == 0, "monthly spend must remain zero"
    assert agent.get("paid_resource_creation") is False, "paid resource creation must be disabled"
    assert agent.get("paid_plan_upgrade") is False, "paid plan upgrades must be disabled"
    tasks = data.get("tasks")
    assert isinstance(tasks, list) and tasks, "tasks must be a non-empty list"
    ids = [task.get("id") for task in tasks]
    assert all(isinstance(task_id, str) and task_id for task_id in ids), "every task needs an id"
    assert len(ids) == len(set(ids)), "task ids must be unique"
    known = set(ids)
    allowed = {"queued", "in_progress", "blocked", "completed", "failed", "paused"}
    for task in tasks:
        assert task.get("status") in allowed, f"invalid status for {task.get(chr(105)+chr(100))}"
        for dep in task.get("depends_on", []):
            assert dep in known, f"unknown dependency {dep} for task {task.get(chr(105)+chr(100))}"
            assert dep != task.get("id"), f"self dependency on {dep}"
    print(f"ledger OK: {len(tasks)} tasks; monthly spend limit $0; worker not deployed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
