#!/usr/bin/env python3
"""Validate the five-document AI Business Assistant project-knowledge package."""

from __future__ import annotations

import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "docs" / "project-knowledge"
EXPECTED = {
    "00_PROJECT_CHARTER_AND_SOURCE_MAP.md": "ABA-KNOW-00",
    "01_AGENT_OPERATING_MODEL.md": "ABA-KNOW-01",
    "02_ARCHITECTURE_AND_ENGINEERING_STANDARDS.md": "ABA-KNOW-02",
    "03_SECURITY_POLICY_AND_RELEASE_GATES.md": "ABA-KNOW-03",
    "04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md": "ABA-KNOW-04",
}
REQUIRED = {
    "document_id", "title", "version", "status", "owner",
    "last_verified_at", "review_due", "knowledge_class",
    "applicable_scope", "canonical_sources", "related_github_sha",
    "supersedes", "superseded_by",
}
ALLOWED_STATUS = {"DRAFT", "APPROVED", "SUPERSEDED"}
ALLOWED_CLASSES = {"STABLE", "CONTROLLED"}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def frontmatter(text: str) -> dict[str, str]:
    """Parse the deliberately small scalar/list-subset YAML metadata contract."""
    if not text.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise ValueError("unterminated YAML frontmatter")

    values: dict[str, str] = {}
    in_sources = False
    for line in parts[1].splitlines():
        if not line.strip():
            continue
        if line.startswith("canonical_sources:"):
            if "canonical_sources" in values:
                raise ValueError("duplicate metadata key: canonical_sources")
            raw_value = line.split(":", 1)[1].strip()
            values["canonical_sources"] = raw_value
            in_sources = True
            continue
        if in_sources and line.startswith("  - "):
            item = line[4:].strip()
            values["canonical_sources"] += ("\n" if values["canonical_sources"] else "") + item
            continue
        if line.startswith(" ") and in_sources:
            continue
        in_sources = False
        match = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if match:
            key, value = match.group(1), match.group(2).strip()
            if key in values:
                raise ValueError(f"duplicate metadata key: {key}")
            values[key] = value
    return values


def validate() -> list[str]:
    errors: list[str] = []
    if PACKAGE.is_symlink():
        return [f"package directory must not be a symlink: {PACKAGE}"]
    if not PACKAGE.is_dir():
        return [f"missing package directory: {PACKAGE}"]

    expected_files = set(EXPECTED)
    paths = list(PACKAGE.rglob("*"))
    entries = {p.relative_to(PACKAGE).as_posix() for p in paths}
    files = {
        p.relative_to(PACKAGE).as_posix()
        for p in paths
        if p.is_file() and not p.is_symlink()
    }
    symlinks = sorted(
        p.relative_to(PACKAGE).as_posix() for p in paths if p.is_symlink()
    )
    if entries != expected_files or files != expected_files or symlinks:
        errors.append(
            f"package entry set mismatch: missing_files={sorted(expected_files - files)}, "
            f"extra={sorted(entries - expected_files)}, symlinks={symlinks}"
        )

    ids: dict[str, str] = {}
    versions: set[str] = set()
    statuses: set[str] = set()
    owners: set[str] = set()

    for name in sorted(expected_files & files):
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
        unexpected = sorted(set(meta) - REQUIRED)
        if unexpected:
            errors.append(f"{name}: unexpected metadata: {', '.join(unexpected)}")

        for key in REQUIRED - {"canonical_sources"}:
            if key in meta and not meta[key]:
                errors.append(f"{name}: {key} must not be empty")

        doc_id = meta.get("document_id", "")
        if doc_id != EXPECTED[name]:
            errors.append(f"{name}: document_id must be {EXPECTED[name]}")
        if doc_id in ids:
            errors.append(f"{name}: duplicate document_id {doc_id} also in {ids[doc_id]}")
        elif doc_id:
            ids[doc_id] = name

        status = meta.get("status", "")
        if status not in ALLOWED_STATUS:
            errors.append(f"{name}: invalid status {status!r}")
        elif status:
            statuses.add(status)

        version = meta.get("version", "")
        if not SEMVER_RE.fullmatch(version):
            errors.append(f"{name}: version must be semantic x.y.z")
        elif version:
            versions.add(version)

        owner = meta.get("owner", "")
        if owner:
            owners.add(owner)

        if meta.get("knowledge_class") not in ALLOWED_CLASSES:
            errors.append(f"{name}: knowledge_class must be STABLE or CONTROLLED")

        verified_at = meta.get("last_verified_at", "")
        parsed_verified_at = None
        try:
            parsed_verified_at = datetime.strptime(verified_at, "%Y-%m-%dT%H:%M:%SZ")
            if parsed_verified_at.strftime("%Y-%m-%dT%H:%M:%SZ") != verified_at:
                raise ValueError
        except ValueError:
            errors.append(f"{name}: last_verified_at must be a valid UTC ISO-8601 timestamp")

        review_due = meta.get("review_due", "")
        try:
            parsed_review_due = date.fromisoformat(review_due)
            if parsed_review_due.isoformat() != review_due:
                raise ValueError
            if parsed_verified_at is not None and parsed_review_due < parsed_verified_at.date():
                errors.append(f"{name}: review_due must not precede last_verified_at")
        except ValueError:
            errors.append(f"{name}: review_due must be a valid YYYY-MM-DD date")

        source_items = [
            item.strip()
            for item in meta.get("canonical_sources", "").splitlines()
            if item.strip()
        ]
        if not source_items:
            errors.append(f"{name}: canonical_sources must contain at least one list item")
        for source in source_items:
            parsed_source = urlparse(source)
            if (
                parsed_source.scheme not in {"http", "https"}
                or not parsed_source.netloc
                or parsed_source.username is not None
                or parsed_source.password is not None
            ):
                errors.append(f"{name}: canonical source must be an absolute HTTP(S) URL without embedded credentials: {source!r}")

        sha = meta.get("related_github_sha", "")
        if sha.lower() != sha or not SHA_RE.fullmatch(sha):
            errors.append(f"{name}: related_github_sha must be a lowercase 40-character SHA")

        for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", content):
            target = target.split("#", 1)[0]
            if not target or target.startswith("#"):
                continue
            parsed_target = urlparse(target)
            if parsed_target.scheme in {"http", "https", "mailto"}:
                continue
            if parsed_target.scheme:
                errors.append(f"{name}: unsupported local-link scheme: {parsed_target.scheme}")
                continue
            decoded_target = unquote(target)
            resolved = (path.parent / decoded_target).resolve()
            try:
                resolved.relative_to(ROOT.resolve())
            except ValueError:
                errors.append(f"{name}: local link escapes repository: {target}")
                continue
            if not resolved.exists():
                errors.append(f"{name}: broken local link: {target}")

    if len(ids) != len(EXPECTED):
        errors.append(f"expected {len(EXPECTED)} unique document IDs, found {len(ids)}")
    if len(versions) > 1:
        errors.append(f"package versions are inconsistent: {sorted(versions)}")
    if len(statuses) > 1:
        errors.append(f"package statuses are inconsistent: {sorted(statuses)}")
    if len(owners) > 1:
        errors.append(f"package owners are inconsistent: {sorted(owners)}")

    return errors


if __name__ == "__main__":
    problems = validate()
    if problems:
        for problem in problems:
            print(f"FAIL: {problem}")
        sys.exit(1)
    print(f"PASS: {len(EXPECTED)} knowledge files; metadata, package consistency and local links valid.")
