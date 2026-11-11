from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch

from scripts.ci.github_actions_slack_failure import (
    bounded_excerpt,
    build_message,
    redact_text,
    summarize_failed_jobs,
    notify,
)


class RedactionTests(unittest.TestCase):
    def test_redacts_authorization_and_bearer_values(self) -> None:
        value = "Authorization: Bearer abcdef123456\nBearer bearer-secret-value-123456"
        redacted = redact_text(value)
        self.assertNotIn("abcdef123456", redacted)
        self.assertNotIn("bearer-secret-value-123456", redacted)
        self.assertIn("Authorization: [REDACTED]", redacted)

    def test_redacts_credentials_and_signed_urls(self) -> None:
        value = (
            "postgres://dbuser:dbpass@localhost/db\n"
            "password=hunter2\n"
            "password: unquoted value with spaces\n"
            "AWS_SECRET_ACCESS_KEY=SyntheticAWSSecretForTestsValue\n"
            "GET https://storage.example/log?X-Amz-Signature=abc123&X-Amz-Security-Token=def456"
        )
        redacted = redact_text(value)
        for secret in ("dbpass", "hunter2", "unquoted value with spaces", "SyntheticAWSSecretForTestsValue", "abc123", "def456"):
            self.assertNotIn(secret, redacted)
        self.assertIn("[REDACTED URL CREDENTIALS]", redacted)
        self.assertIn("[REDACTED SIGNED URL]", redacted)

    def test_redacts_common_provider_tokens_jwts_and_private_keys(self) -> None:
        jwt = ".".join(("synthetic-header-segment", "synthetic-payload-segment", "synthetic-signature-segment"))
        private_key = "-----BEGIN PRIVATE KEY-----\nprivate-key-body\n-----END PRIVATE KEY-----"
        value = "xoxb-fake-slack-token-1234567890 ghp_123456789012345678901234567890123456 AKIA1234567890ABCDEF " + jwt + "\n" + private_key
        redacted = redact_text(value)
        for secret in ("xoxb-fake-slack-token-1234567890", "ghp_123456789012345678901234567890123456", "AKIA1234567890ABCDEF", jwt, "private-key-body"):
            self.assertNotIn(secret, redacted)
        self.assertIn("[REDACTED PRIVATE KEY]", redacted)

    def test_redacts_exact_environment_secret_values(self) -> None:
        self.assertEqual(redact_text("prefix:short-test-secret:suffix", ["short-test-secret"]), "prefix:[REDACTED]:suffix")

    def test_strips_ansi_before_redaction(self) -> None:
        value = "prefix:secret-\033[31mvalue-123456:suffix"
        redacted = redact_text(value, ["secret-value-123456"])
        self.assertEqual(redacted, "prefix:[REDACTED]:suffix")

    def test_excerpt_keeps_final_failure_marker_and_is_bounded(self) -> None:
        log = "\n".join(f"diagnostic line {index:02d} " + ("x" * 180) for index in range(1, 13))
        log += "\nFINAL_ERROR_MARKER"
        excerpt = bounded_excerpt(log, max_chars=600, max_lines=12)
        self.assertIn("FINAL_ERROR_MARKER", excerpt)
        self.assertNotIn("diagnostic line 01", excerpt)
        self.assertLessEqual(len(excerpt), 600)


class GitHubSummaryTests(unittest.TestCase):
    def test_selects_failed_jobs_and_failed_steps_only(self) -> None:
        payload = json.dumps(
            {
                "jobs": [
                    {"name": "frontend-unit-tests", "conclusion": "success", "steps": []},
                    {
                        "name": "frontend-browser-smoke",
                        "conclusion": "failure",
                        "steps": [
                            {"name": "Checkout", "conclusion": "success"},
                            {"name": "Run Chromium smoke", "conclusion": "failure"},
                        ],
                    },
                ]
            }
        )
        jobs, steps = summarize_failed_jobs(payload)
        self.assertEqual(jobs, ["frontend-browser-smoke"])
        self.assertEqual(steps, ["frontend-browser-smoke: Run Chromium smoke"])

    def test_invalid_job_json_returns_safe_fallback(self) -> None:
        jobs, steps = summarize_failed_jobs("not-json")
        self.assertEqual(jobs, ["Failed-job metadata unavailable"])
        self.assertEqual(steps, [])

    def test_message_contains_run_context_and_redacted_excerpt(self) -> None:
        message = build_message(
            repository="AbdullahOmaar/ai-business-assistant",
            workflow="Verify backend and frontend",
            event="pull_request",
            branch="feature/mobile-ui",
            sha="a" * 40,
            run_url="https://github.com/AbdullahOmaar/ai-business-assistant/actions/runs/123",
            failed_jobs=["frontend-browser-smoke"],
            failed_steps=["frontend-browser-smoke: Run Chromium smoke"],
            excerpt="AssertionError: [REDACTED]",
        )
        self.assertIn("frontend-browser-smoke", message)
        self.assertIn("Run Chromium smoke", message)
        self.assertIn("actions/runs/123", message)
        self.assertIn("AssertionError: [REDACTED]", message)

    def test_control_characters_are_removed_from_untrusted_labels(self) -> None:
        message = build_message(
            repository="repo",
            workflow="Verify\nInjected line",
            event="pull_request",
            branch="feature\nmalicious",
            sha="abc",
            run_url="https://github.com/example/run",
            failed_jobs=["job"],
            failed_steps=[],
            excerpt="safe",
        )
        self.assertNotIn("\nInjected line", message)
        self.assertNotIn("\nmalicious", message)

    def test_missing_slack_secret_skips_safely_without_reading_logs(self) -> None:
        with patch.dict(os.environ, {"SLACK_BOT_TOKEN": "", "GH_RUN_ID": "123"}, clear=True):
            with patch("scripts.ci.github_actions_slack_failure.subprocess.run") as run_gh:
                with patch("builtins.print") as log:
                    self.assertEqual(notify(), 0)
        run_gh.assert_not_called()
        self.assertIn("SLACK_BOT_TOKEN is not configured", log.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
