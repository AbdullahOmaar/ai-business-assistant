#!/usr/bin/env python3
"""Validate the five-document AI Business Assistant project-knowledge package."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs" / "project-knowledge"
EXPECTED = {
    "00_PROJECT_CHARTER_AND_SOURCE_MAP.md",
    "01_AGENT_OPERATING_MODEL.md",
    "02_ARCHITECTURE_AND_ENGINEERING_STANDARDS.md",
    "03_SECURITY_POLICY_AND_RELEASE_GATES.md",
    "04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md",
}
REQUIRED = {
    "document_id", "title", "version", "status", "owner",
    "last_verified_at", "review_due", "knowledge_class",
    "applicable_scope", "canonical_sources", "related_github_sha",
    "supersedes", "superseded_by",
}
ALLOWED_STATUS = {"DRAFT", "APPROVED", "SUPERSEDED"}


def frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise ValueError("unterminated YAML frontmatter")
    values: dict[str, str] = {}
    for line in parts[1].splitlines():
        if not line or line.startswith("  - "):
            continue
        match = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if match:
            values[match.group(1)] = match.group(2).strip()
    return values


def validate() -> list[str]:
    errors: list[str] = []
    if not PACKAGE.is_dir():
        return [f"missing package directory: {PACKAGE}"]

    files = {p.name for p in PACKAGE.glob("*.md")}
    if files != EXPECTED:
        errors.append(
            f"package file set mismatch: missing={sorted(EXPECTED - files)}, "
            f"extra={sorted(files - EXPECTED)}"
        )

    ids: dict[str, str] = {}
    for name in sorted(EXPECTED & files):
        path = PACKAGE / name
        content = path.read_text(encoding="utf-8")
        try:
            meta = frontmatter(content)
        except ValueError as exc:
            errors.append(f"{name}: {exc}")
            continue

        missing = sorted(REQUIRED - set(meta))
        if missing:
            errors.append(f"{name}: missing metadata: {', '.join(missing)}")
        doc_id = meta.get("document_id", "")
        if doc_id in ids:
            errors.append(f"{name}: duplicate document_id {doc_id} also in {ids[doc_id]}")
        elif doc_id:
            ids[doc_id] = name

        if meta.get("status") not in ALLOWED_STATUS:
            errors.append(f"{name}: invalid status {meta.get('status')!r}")
        if not re.fullmatch(r"\d+\.\d+\.\d+", meta.get("version", "")):
            errors.append(f"{name}: version must be semantic x.y.z")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", meta.get("last_verified_at", "")):
            errors.append(f"{name}: last_verified_at must be UTC ISO-8601")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta.get("review_due", "")):
            errors.append(f"{name}: review_due must be YYYY-MM-DD")

        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", content):
            target = target.split("#", 1)[0]
            if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            parsed = urlparse(target)
            if parsed.scheme:
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                errors.append(f"{name}: broken local link: {target}")

    return errors


if __name__ == "__main__":
    problems = validate()
    if problems:
        for problem in problems:
            print(f"FAIL: {problem}")
        sys.exit(1)
    print(f"PASS: {len(EXPECTED)} knowledge files; metadata, unique IDs and local links valid.")
