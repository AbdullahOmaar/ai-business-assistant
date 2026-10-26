#!/usr/bin/env python3
"""Offline validation for the repository-seeded engineering agent ledger."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "docs" / "agent" / "initial-task-ledger.json"
ALLOWED_STATUSES = {"queued", "in_progress", "blocked", "completed", "failed", "paused"}


def validate(data: Any) -> list[str]:
    """Return all ledger validation errors; never mutates the input."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["ledger root must be an object"]
    if data.get("schema_version") != 1:
        errors.append("unsupported schema_version")

    agent = data.get("agent")
    if not isinstance(agent, dict):
        errors.append("agent config must be an object")
        agent = {}
    if agent.get("status") != "not_deployed":
        errors.append("worker must remain marked not_deployed until deployment is verified")
    if agent.get("budget_mode") != "controlled":
        errors.append("budget_mode must be controlled")
    if agent.get("monthly_spend_limit_usd") != 0:
        errors.append("monthly spend limit must remain $0")
    for key in ("paid_resource_creation", "paid_plan_upgrade"):
        if agent.get(key) is not False:
            errors.append(f"{key} must be false")
    for key in ("stop_on_unknown_cost", "stop_on_budget_limit", "hard_stop_on_budget_limit"):
        if agent.get(key) is not True:
            errors.append(f"{key} must be true")

    tasks = data.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        errors.append("tasks must be a non-empty list")
        return errors

    ids: list[str] = []
    for index, task in enumerate(tasks):
        if not isinstance(task, dict):
            errors.append(f"task at index {index} must be an object")
            continue
        task_id = task.get("id")
        if not isinstance(task_id, str) or not task_id.strip():
            errors.append(f"task at index {index} needs a non-empty id")
        else:
            ids.append(task_id)
        if not isinstance(task.get("title"), str) or not task["title"].strip():
            errors.append(f"task {task_id!r} needs a title")
        if task.get("status") not in ALLOWED_STATUSES:
            errors.append(f"invalid status for {task_id!r}")
        deps = task.get("depends_on", [])
        if not isinstance(deps, list) or any(not isinstance(dep, str) for dep in deps):
            errors.append(f"depends_on for {task_id!r} must be a list of task IDs")
        attempts = task.get("attempts", 0)
        if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts < 0:
            errors.append(f"attempts for {task_id!r} must be a non-negative integer")

    if len(ids) != len(set(ids)):
        errors.append("task ids must be unique")
    known = set(ids)
    graph: dict[str, list[str]] = {}
    for task in tasks:
        if not isinstance(task, dict) or not isinstance(task.get("id"), str):
            continue
        task_id = task["id"]
        deps = task.get("depends_on", [])
        if not isinstance(deps, list) or any(not isinstance(dep, str) for dep in deps):
            continue
        graph[task_id] = deps
        for dep in deps:
            if dep not in known:
                errors.append(f"unknown dependency {dep!r} for {task_id!r}")
            if dep == task_id:
                errors.append(f"self dependency on {task_id!r}")

    # Detect cycles so a task graph cannot become permanently un-runnable.
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        if node in visiting:
            errors.append(f"dependency cycle includes {node!r}")
            return
        if node in visited:
            return
        visiting.add(node)
        for dep in graph.get(node, []):
            if dep in graph:
                visit(dep)
        visiting.remove(node)
        visited.add(node)

    for node in graph:
        visit(node)
    return errors


def main() -> int:
    try:
        data = json.loads(LEDGER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ledger invalid: {exc}")
        return 1
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"ledger OK: {len(data['tasks'])} tasks; monthly spend limit $0; worker not deployed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
