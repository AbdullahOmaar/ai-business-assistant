#!/usr/bin/env python3
"""Best-effort, secret-safe Slack notification for failed GitHub Actions runs.

This script runs only from the trusted workflow_run notifier workflow. It never
checks out or executes the source commit that failed CI; it reads run metadata
and logs through the GitHub CLI, redacts the excerpt, and posts plain text.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any, Iterable

ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
PRIVATE_KEY = re.compile(
    r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----",
    re.IGNORECASE,
)
SIGNED_URL = re.compile(
    r"https?://[^\s<>]+[?&](?:token|access_token|signature|sig|x-amz-signature|"
    r"x-amz-security-token|awsaccesskeyid|x-goog-signature)=[^\s<>]+",
    re.IGNORECASE,
)
URL_CREDENTIALS = re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^:/\s@]+:[^@\s/]+@")
AUTH_HEADER = re.compile(r"(?im)(authorization\s*:\s*)(?:bearer|basic)\s+[^\r\n]+")
BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{6,}")
JWT = re.compile(r"\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
TOKEN_SHAPES = re.compile(
    r"(?i)\b(?:xox[baprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|"
    r"github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16})\b"
)
JSON_CREDENTIAL = re.compile(
    r'''(?i)("(?:password|passwd|token|secret|api[_-]?key|access[_-]?token|'''
    r'''refresh[_-]?token|client[_-]?secret|private[_-]?key)"\s*:\s*")[^"]*(")'''
)
QUOTED_CREDENTIAL = re.compile(
    r'''(?im)(\b(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?access[_-]?key|password|passwd|token|secret|api[_-]?key|access[_-]?token|'''
    r'''refresh[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["'])[^ \r\n]*?[^ \r\n]*?(["'])'''
)
UNQUOTED_CREDENTIAL = re.compile(
    r"(?im)(\b(?:aws[_-]?secret[_-]?access[_-]?key|aws[_-]?access[_-]?key|password|passwd|token|secret|api[_-]?key|access[_-]?token|"
    r"refresh[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*)(?![\"'])([^\r\n,;}]+)"
)

SENSITIVE_ENV_NAME = re.compile(
    r"(?i)(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|"
    r"DATABASE_URL|CREDENTIAL)"
)


def redact_text(value: str, secret_values: Iterable[str] | None = None) -> str:
    """Redact common credentials and exact secret values before excerpts leave CI."""
    text = ANSI_ESCAPE.sub("", value or "")
    secrets = list(secret_values or [])
    if secret_values is None:
        secrets = [
            item
            for name, item in os.environ.items()
            if SENSITIVE_ENV_NAME.search(name) and len(item) >= 4
        ]
    for secret in sorted((s for s in secrets if s), key=len, reverse=True):
        text = text.replace(secret, "[REDACTED]")

    text = PRIVATE_KEY.sub("[REDACTED PRIVATE KEY]", text)
    text = SIGNED_URL.sub("[REDACTED SIGNED URL]", text)
    text = URL_CREDENTIALS.sub("[REDACTED URL CREDENTIALS]@", text)
    text = AUTH_HEADER.sub(r"\1[REDACTED]", text)
    text = BEARER.sub(r"\1 [REDACTED]", text)
    text = JWT.sub("[REDACTED JWT]", text)
    text = TOKEN_SHAPES.sub("[REDACTED TOKEN]", text)
    text = JSON_CREDENTIAL.sub(r"\1[REDACTED]\2", text)
    text = QUOTED_CREDENTIAL.sub(r"\1[REDACTED]\2", text)
    text = UNQUOTED_CREDENTIAL.sub(r"\1[REDACTED]", text)
    return text


def bounded_excerpt(log_text: str, *, max_chars: int = 1200, max_lines: int = 12) -> str:
    cleaned = redact_text(log_text)
    lines = [line.rstrip() for line in cleaned.splitlines() if line.strip()]
    excerpt = "\n".join(lines[-max_lines:])
    if len(excerpt) > max_chars:
        excerpt = "… [earlier output omitted]\n" + excerpt[-(max_chars - 28) :]
    return excerpt or "GitHub did not return failed-step log output. Open the run for details."


def summarize_failed_jobs(payload: str) -> tuple[list[str], list[str]]:
    try:
        decoded: Any = json.loads(payload)
    except (TypeError, json.JSONDecodeError):
        return (["Failed-job metadata unavailable"], [])
    jobs = decoded.get("jobs", []) if isinstance(decoded, dict) else []
    failed_jobs: list[str] = []
    failed_steps: list[str] = []
    for job in jobs if isinstance(jobs, list) else []:
        if not isinstance(job, dict) or job.get("conclusion") != "failure":
            continue
        name = safe_label(job.get("name"), "Unnamed job")
        failed_jobs.append(name)
        for step in job.get("steps", []) if isinstance(job.get("steps"), list) else []:
            if isinstance(step, dict) and step.get("conclusion") == "failure":
                failed_steps.append(f"{name}: {safe_label(step.get('name'), 'Unnamed step')}")
    return (failed_jobs or ["Failed job metadata unavailable"], failed_steps)


def safe_label(value: Any, fallback: str) -> str:
    text = str(value or fallback)
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", text)
    return text[:180].strip() or fallback


def build_message(
    *,
    repository: str,
    workflow: str,
    event: str,
    branch: str,
    sha: str,
    run_url: str,
    failed_jobs: list[str],
    failed_steps: list[str],
    excerpt: str,
) -> str:
    jobs_text = ", ".join(safe_label(item, "Unknown job") for item in failed_jobs)
    steps_text = "; ".join(safe_label(item, "Unknown step") for item in failed_steps)
    if not steps_text:
        steps_text = "Failed step name unavailable"
    return "\n".join(
        [
            "AI Business Assistant — GitHub Actions failure",
            f"Repository: {safe_label(repository, 'Unknown repository')}",
            f"Workflow: {safe_label(workflow, 'Unknown workflow')}",
            f"Event: {safe_label(event, 'Unknown event')}",
            f"Branch: {safe_label(branch, 'Unknown branch')}",
            f"Commit: {safe_label(sha, 'Unknown SHA')}",
            f"Failed jobs: {jobs_text}",
            f"Failed steps: {steps_text}",
            f"Run: {safe_label(run_url, 'Run URL unavailable')}",
            "Redacted failure excerpt:",
            excerpt,
        ]
    )


def gh_output(args: list[str]) -> tuple[int, str]:
    try:
        result = subprocess.run(
            ["gh", *args],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired):
        return (1, "")
    return (result.returncode, result.stdout or "")


def notify() -> int:
    token = os.environ.get("SLACK_BOT_TOKEN", "")
    channel = os.environ.get("SLACK_CHANNEL_ID", "C0CFWGM87HC")
    run_id = os.environ.get("GH_RUN_ID", "")
    repository = os.environ.get("GH_REPOSITORY", "AbdullahOmaar/ai-business-assistant")

    if not token:
        print("::warning::SLACK_BOT_TOKEN is not configured; CI failure alert was not sent.")
        return 0
    if not run_id.isdigit() or not channel:
        print("::warning::Slack alert context is incomplete; CI failure alert was not sent.")
        return 0

    code, jobs_json = gh_output(["run", "view", run_id, "--repo", repository, "--json", "jobs"])
    failed_jobs, failed_steps = summarize_failed_jobs(jobs_json if code == 0 else "")
    log_code, logs = gh_output(["run", "view", run_id, "--repo", repository, "--log-failed"])
    excerpt = bounded_excerpt(logs if log_code == 0 else "")

    message = build_message(
        repository=repository,
        workflow=os.environ.get("GH_WORKFLOW_NAME", "Verify backend and frontend"),
        event=os.environ.get("GH_EVENT_NAME", "unknown"),
        branch=os.environ.get("GH_HEAD_BRANCH", "unknown"),
        sha=os.environ.get("GH_HEAD_SHA", "unknown"),
        run_url=os.environ.get("GH_RUN_URL", ""),
        failed_jobs=failed_jobs,
        failed_steps=failed_steps,
        excerpt=excerpt,
    )
    payload = json.dumps(
        {"channel": channel, "text": message, "mrkdwn": False, "unfurl_links": False},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
        if not result.get("ok"):
            error = safe_label(result.get("error"), "Slack API rejected the request")
            print(f"::warning::Slack notification was not delivered: {error}")
            return 0
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        print("::warning::Slack notification request failed; original CI result is unchanged.")
        return 0

    print("Slack failure notification delivered.")
    return 0


if __name__ == "__main__":
    sys.exit(notify())
