from __future__ import annotations

import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "ci.yml"


def selector_source() -> str:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    marker = "          python - <<'PY'\n"
    start = workflow.index(marker) + len(marker)
    end = workflow.index("\n          PY\n", start)
    return textwrap.dedent(workflow[start:end])


class ChangeAwareValidationScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-b", "main"], cwd=self.root, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "CI Scope Test"], cwd=self.root, check=True)
        subprocess.run(["git", "config", "user.email", "ci-scope@example.invalid"], cwd=self.root, check=True)
        self.write("README.md", "baseline\n")
        self.write("backend/tests/test_api.py", "def test_baseline():\n    assert True\n")
        self.write("backend/tests/conftest.py", "# baseline fixtures\n")
        self.write("backend/app/security.py", "VALUE = 1\n")
        self.write("frontend/src/app/customer-directory.component.ts", "export const value = 1;\n")
        self.write("frontend/src/app/customer-directory.spec.ts", "import test from 'node:test';\n")
        self.write("frontend/package-lock.json", "{}\n")
        self.write("docs/README.md", "docs baseline\n")
        self.commit("baseline")
        self.base = self.git("rev-parse", "HEAD")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def git(self, *args: str) -> str:
        result = subprocess.run(["git", *args], cwd=self.root, check=True, capture_output=True, text=True)
        return result.stdout.strip()

    def write(self, relative: str, content: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def commit(self, message: str) -> str:
        self.git("add", "-A")
        self.git("commit", "-m", message)
        return self.git("rev-parse", "HEAD")

    def run_selector(self, base: str | None = None) -> dict[str, str]:
        head = self.git("rev-parse", "HEAD")
        output = self.root.parent / f"{self.root.name}-github-output.txt"
        env = os.environ.copy()
        env.update({
            "GITHUB_OUTPUT": str(output),
            "EVENT_NAME": "pull_request",
            "PR_BASE_SHA": base or self.base,
            "PUSH_BEFORE": "",
            "HEAD_SHA": head,
            "PR_HEAD_REF": "test-change-aware-scope",
            "PR_HEAD_REPO": "owner/repo",
            "REPOSITORY": "owner/repo",
            "REF_NAME": "refs/pull/1/merge",
        })
        result = subprocess.run(
            ["python", "-c", selector_source()],
            cwd=self.root,
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        values: dict[str, str] = {}
        lines = output.read_text(encoding="utf-8").splitlines()
        index = 0
        while index < len(lines):
            line = lines[index]
            if "<<EOF" in line:
                key = line.split("<<EOF", 1)[0]
                index += 1
                block = []
                while index < len(lines) and lines[index] != "EOF":
                    block.append(lines[index])
                    index += 1
                values[key] = "\n".join(block)
            elif "=" in line:
                key, value = line.split("=", 1)
                values[key] = value
            index += 1
        output.unlink(missing_ok=True)
        return values

    def test_frontend_component_runs_its_spec_and_build(self) -> None:
        self.write("frontend/src/app/customer-directory.component.ts", "export const value = 2;\n")
        self.commit("frontend component")
        plan = self.run_selector()
        self.assertEqual(plan["frontend_tests"], "true")
        self.assertEqual(plan["frontend_full"], "false")
        self.assertIn("frontend/src/app/customer-directory.spec.ts", plan["frontend_specs"])
        self.assertEqual(plan["frontend_build"], "true")
        self.assertEqual(plan["docs_validation"], "false")
        self.assertEqual(plan["backend_tests"], "false")

    def test_frontend_spec_only_change_skips_production_build(self) -> None:
        self.write(
            "frontend/src/app/customer-directory.spec.ts",
            "import test from 'node:test';\\ntest('updated assertion', () => {});\\n",
        )
        self.commit("frontend spec only")
        plan = self.run_selector()
        self.assertEqual(plan["frontend_tests"], "true")
        self.assertEqual(plan["frontend_full"], "false")
        self.assertIn("frontend/src/app/customer-directory.spec.ts", plan["frontend_specs"])
        self.assertEqual(plan["frontend_build"], "false")
        self.assertEqual(plan["docs_validation"], "false")

    def test_frontend_auth_spec_change_runs_full_suite(self) -> None:
        self.write("frontend/src/app/auth-session.spec.ts", "import test from 'node:test';\\n")
        self.commit("frontend auth spec")
        plan = self.run_selector()
        self.assertEqual(plan["frontend_tests"], "true")
        self.assertEqual(plan["frontend_full"], "true")
        self.assertEqual(plan["frontend_build"], "false")

    def test_frontend_locale_data_change_runs_full_suite_and_build(self) -> None:
        self.write("frontend/public/i18n/ar.json", "{\\n  \"app.title\": \"تطبيق\"\\n}\\n")
        self.commit("frontend locale data")
        plan = self.run_selector()
        self.assertEqual(plan["frontend_tests"], "true")
        self.assertEqual(plan["frontend_full"], "true")
        self.assertEqual(plan["frontend_build"], "true")

    def test_docs_validation_is_not_selected_for_app_only_changes(self) -> None:
        self.write("backend/tests/test_api.py", "def test_targeted():\\n    assert 3 == 3\\n")
        self.commit("backend test only")
        plan = self.run_selector()
        self.assertEqual(plan["docs_validation"], "false")

    def test_ci_meta_tests_run_without_application_regression(self) -> None:
        for path in (
            "tests/test_ci_validation_scope.py",
            "tests/test_project_knowledge_validator.py",
            "tests/test_github_actions_slack_failure.py",
        ):
            with self.subTest(path=path):
                self.git("reset", "--hard", self.base)
                self.git("clean", "-fd")
                self.write(path, "def test_ci_meta():\\n    assert True\\n")
                self.commit(f"update {path}")
                plan = self.run_selector()
                self.assertEqual(plan["docs_validation"], "true")
                self.assertEqual(plan["backend_tests"], "false")
                self.assertEqual(plan["frontend_tests"], "false")
                self.assertEqual(plan["backend_container"], "false")
                self.assertEqual(plan["frontend_build"], "false")

    def test_backend_test_module_is_targeted(self) -> None:
        self.write("backend/tests/test_api.py", "def test_targeted():\n    assert 2 == 2\n")
        self.commit("backend test module")
        plan = self.run_selector()
        self.assertEqual(plan["backend_tests"], "true")
        self.assertEqual(plan["backend_full"], "false")
        self.assertEqual(plan["backend_container"], "false")

    def test_backend_fixture_or_conftest_change_runs_full_suite(self) -> None:
        self.write("backend/tests/conftest.py", "# changed shared fixture\n")
        self.commit("backend test fixture")
        plan = self.run_selector()
        self.assertEqual(plan["backend_tests"], "true")
        self.assertEqual(plan["backend_full"], "true")

    def test_backend_security_change_runs_full_backend_and_container(self) -> None:
        self.write("backend/app/security.py", "VALUE = 2\n")
        self.commit("backend security")
        plan = self.run_selector()
        self.assertEqual(plan["backend_full"], "true")
        self.assertEqual(plan["backend_container"], "true")

    def test_migration_change_runs_full_backend_and_migration_check(self) -> None:
        self.write("backend/migrations/versions/0008_test.py", "revision = '0008'\n")
        self.commit("migration")
        plan = self.run_selector()
        self.assertEqual(plan["backend_full"], "true")
        self.assertEqual(plan["migrations"], "true")

    def test_backend_dependency_change_runs_tests_container_and_audit(self) -> None:
        self.write("backend/requirements.txt", "pytest>=9\n")
        self.commit("backend dependencies")
        plan = self.run_selector()
        self.assertEqual(plan["backend_full"], "true")
        self.assertEqual(plan["backend_container"], "true")
        self.assertEqual(plan["backend_audit"], "true")

    def test_frontend_lockfile_change_runs_full_tests_build_and_audit(self) -> None:
        self.write("frontend/package-lock.json", '{"lockfileVersion": 3}\n')
        self.commit("frontend dependencies")
        plan = self.run_selector()
        self.assertEqual(plan["frontend_full"], "true")
        self.assertEqual(plan["frontend_build"], "true")
        self.assertEqual(plan["frontend_audit"], "true")
        self.assertEqual(plan["docs_validation"], "false")

    def test_docs_only_change_runs_project_knowledge_validation(self) -> None:
        self.write("docs/README.md", "updated docs\n")
        self.commit("docs only")
        plan = self.run_selector()
        self.assertEqual(plan["docs_validation"], "true")
        self.assertEqual(plan["frontend_tests"], "false")
        self.assertEqual(plan["backend_tests"], "false")

    def test_unknown_path_falls_back_to_full_regression(self) -> None:
        self.write("infra/custom.tf", "resource = true\n")
        self.commit("unknown path")
        plan = self.run_selector()
        for key in ("backend_tests", "backend_full", "backend_container", "backend_audit",
                    "migrations", "frontend_tests", "frontend_full", "frontend_build",
                    "frontend_audit"):
            self.assertEqual(plan[key], "true", key)
        self.assertEqual(plan["docs_validation"], "false")

    def test_deleted_path_falls_back_to_full_regression(self) -> None:
        (self.root / "README.md").unlink()
        self.commit("delete path")
        plan = self.run_selector()
        self.assertEqual(plan["backend_full"], "true")
        self.assertEqual(plan["frontend_full"], "true")

    def test_renamed_path_falls_back_to_full_regression(self) -> None:
        self.git("mv", "README.md", "RENAMED.md")
        self.commit("rename path")
        plan = self.run_selector()
        self.assertEqual(plan["backend_full"], "true")
        self.assertEqual(plan["frontend_full"], "true")

    def test_unavailable_merge_base_falls_back_to_full_regression(self) -> None:
        self.write("frontend/src/app/customer-directory.component.ts", "export const value = 3;\n")
        self.commit("frontend change")
        plan = self.run_selector(base="deadbeef")
        self.assertEqual(plan["backend_full"], "true")
        self.assertEqual(plan["frontend_full"], "true")
        self.assertEqual(plan["backend_container"], "true")


if __name__ == "__main__":
    unittest.main()
