"""Unit tests for the project-knowledge package validator."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import validate_project_knowledge as validator


def document(name: str, doc_id: str, *, link: str = "../../README.md") -> str:
    return f"""---
document_id: {doc_id}
title: Test document
version: 1.0.0
status: DRAFT
owner: Project Master / Repository Owner
last_verified_at: 2026-10-30T05:30:00Z
review_due: 2026-11-29
knowledge_class: CONTROLLED
applicable_scope: Test scope
canonical_sources:
  - https://example.com/canonical
related_github_sha: d99b71b57ced822cd8f7bc5dfa2a4835b0a2f14f
supersedes: none
superseded_by: none
---

# {name}

[Canonical local reference]({link})
"""


class ProjectKnowledgeValidatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.package = self.root / "docs" / "project-knowledge"
        self.package.mkdir(parents=True)
        for filename, doc_id in validator.EXPECTED.items():
            (self.package / filename).write_text(
                document(filename, doc_id), encoding="utf-8"
            )
        (self.root / "README.md").write_text("# test\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_validation(self) -> list[str]:
        with patch.object(validator, "ROOT", self.root), patch.object(
            validator, "PACKAGE", self.package
        ):
            return validator.validate()

    def test_valid_five_document_package(self) -> None:
        self.assertEqual([], self.run_validation())

    def test_rejects_duplicate_or_wrong_document_identity(self) -> None:
        filename = "04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md"
        (self.package / filename).write_text(
            document(filename, "ABA-KNOW-03"), encoding="utf-8"
        )
        errors = self.run_validation()
        self.assertTrue(any("document_id must be" in error for error in errors))
        self.assertTrue(any("duplicate document_id" in error for error in errors))

    def test_rejects_inconsistent_package_versions(self) -> None:
        filename = "03_SECURITY_POLICY_AND_RELEASE_GATES.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        (self.package / filename).write_text(
            content.replace("version: 1.0.0", "version: 1.1.0"), encoding="utf-8"
        )
        self.assertTrue(any("versions are inconsistent" in e for e in self.run_validation()))

    def test_rejects_link_escaping_repository(self) -> None:
        filename = "00_PROJECT_CHARTER_AND_SOURCE_MAP.md"
        (self.package / filename).write_text(
            document(filename, "ABA-KNOW-00", link="../../../../outside.md"),
            encoding="utf-8",
        )
        self.assertTrue(any("escapes repository" in e for e in self.run_validation()))

    def test_rejects_empty_canonical_source(self) -> None:
        filename = "01_AGENT_OPERATING_MODEL.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        content = content.replace("  - https://example.com/canonical", "  - ")
        (self.package / filename).write_text(content, encoding="utf-8")
        self.assertTrue(any("canonical_sources" in e for e in self.run_validation()))

    def test_rejects_extra_package_file(self) -> None:
        (self.package / "UNTRACKED.md").write_text("# extra", encoding="utf-8")
        self.assertTrue(any("package entry set mismatch" in e for e in self.run_validation()))

    def test_rejects_missing_canonical_source(self) -> None:
        filename = "01_AGENT_OPERATING_MODEL.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        content = content.replace("  - https://example.com/canonical\n", "")
        (self.package / filename).write_text(content, encoding="utf-8")
        self.assertTrue(any("canonical_sources" in e for e in self.run_validation()))


    def test_rejects_unexpected_nested_package_content(self) -> None:
        nested = self.package / "archive"
        nested.mkdir()
        (nested / "old.md").write_text("# stale", encoding="utf-8")
        self.assertTrue(any("package entry set mismatch" in e for e in self.run_validation()))

    def test_rejects_non_http_canonical_source(self) -> None:
        filename = "00_PROJECT_CHARTER_AND_SOURCE_MAP.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        content = content.replace("https://example.com/canonical", "javascript:alert(1)")
        (self.package / filename).write_text(content, encoding="utf-8")
        self.assertTrue(any("absolute HTTP(S) URL" in e for e in self.run_validation()))

    def test_rejects_duplicate_metadata_key(self) -> None:
        filename = "00_PROJECT_CHARTER_AND_SOURCE_MAP.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        content = content.replace("title: Test document", "title: Test document\ntitle: Duplicate")
        (self.package / filename).write_text(content, encoding="utf-8")
        self.assertTrue(any("duplicate metadata key: title" in e for e in self.run_validation()))

    def test_rejects_review_date_before_verification_date(self) -> None:
        filename = "00_PROJECT_CHARTER_AND_SOURCE_MAP.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        content = content.replace("review_due: 2026-11-29", "review_due: 2026-10-01")
        (self.package / filename).write_text(content, encoding="utf-8")
        self.assertTrue(any("review_due must not precede" in e for e in self.run_validation()))

    def test_rejects_broken_local_link(self) -> None:
        filename = "00_PROJECT_CHARTER_AND_SOURCE_MAP.md"
        (self.package / filename).write_text(
            document(filename, "ABA-KNOW-00", link="../../missing.md"),
            encoding="utf-8",
        )
        self.assertTrue(any("broken local link" in e for e in self.run_validation()))

    def test_rejects_inconsistent_package_owners(self) -> None:
        filename = "04_KNOWLEDGE_GOVERNANCE_AND_CHANGELOG.md"
        content = (self.package / filename).read_text(encoding="utf-8")
        content = content.replace(
            "owner: Project Master / Repository Owner",
            "owner: Different Owner",
        )
        (self.package / filename).write_text(content, encoding="utf-8")
        self.assertTrue(any("owners are inconsistent" in e for e in self.run_validation()))


if __name__ == "__main__":
    unittest.main()
