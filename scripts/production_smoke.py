#!/usr/bin/env python3
"""Production smoke + release-loop verification for AIBA (3A-701, Phase 2 A1).

Runs the documented production smoke against the LIVE deployments and the
repo version chain, and reports whether the deployed state may be called
"live". Nothing here changes production code or configuration. The only
write is a disposable customer in the public demo business, deleted in
the same run (owner decision 2026-11-15 authorizes synthetic-data CRUD
in the environment labelled Production; the demo business is synthetic).

Two modes:
  --repo-only   only the repo version-chain check (no network; safe in CI).
  (default)     repo chain + 10 live smoke flows + divergence verdict.

Exit 0 only when every flow passes AND the repo chain, the live web
version and the live API version agree. A divergence is reported, never
hidden: at the time of writing the known state is web 1.17.0 vs API
1.13.0, and this script exits non-zero until the API release closes it.
The first demo-session call once took ~116s on a cold serverless
instance (Firebase Admin init); that call therefore gets a 180s timeout
plus one retry, and the runbook records the observation.
"""
from __future__ import annotations

import argparse
import http.client as http_client
import json
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

API_BASE = "https://ai-business-assistant-api.vercel.app"
WEB_BASE = "https://ai-business-assistant-web.vercel.app"
DEMO_BUSINESS_NAME = "Nile Star Trading Demo"

# version field -> (relative path, extractor)
REPO_VERSION_FIELDS = (
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/src/app/build-info.ts",
    "frontend/public/sw.js",
    "backend/pyproject.toml",
    "backend/app/main.py",
    "release-guide.ts version",
    "release-guide.ts apiVersion",
)


def _read_json_version(path: Path) -> str | None:
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("version")
    except (OSError, ValueError, AttributeError):
        return None


def _search_version(path: Path, pattern: str) -> str | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(pattern, text)
    return match.group(1) if match else None


def read_repo_versions(root: Path) -> dict[str, str | None]:
    """Read every version field the release-guide spec pins, from the repo."""
    frontend = root / "frontend"
    backend = root / "backend"
    release_guide = frontend / "src" / "app" / "release-guide.ts"
    return {
        "frontend/package.json": _read_json_version(frontend / "package.json"),
        "frontend/package-lock.json": _read_json_version(frontend / "package-lock.json"),
        "frontend/src/app/build-info.ts": _search_version(
            frontend / "src" / "app" / "build-info.ts",
            r'"version"\s*:\s*"([^"]+)"',
        ),
        "frontend/public/sw.js": _search_version(
            frontend / "public" / "sw.js",
            r"CACHE_NAME\s*=\s*'aba-shell-v([^-']+)-",
        ),
        "backend/pyproject.toml": _search_version(
            backend / "pyproject.toml", r"(?m)^version\s*=\s*\"([^\"]+)\""
        ),
        "backend/app/main.py": _search_version(
            backend / "app" / "main.py", r'(?m)^\s*version="([^"]+)"'
        ),
        "release-guide.ts version": _search_version(
            release_guide, r"RELEASE_HISTORY\s*=\s*\[\s*\{\s*version:\s*'([^']+)'"
        ),
        "release-guide.ts apiVersion": _search_version(
            release_guide, r"RELEASE_HISTORY\s*=\s*\[\s*\{\s*version:\s*'[^']+',\s*apiVersion:\s*'([^']+)'"
        ),
    }


def chain_version(versions: dict[str, str | None]) -> str | None:
    """The agreed version when every readable field agrees, else None."""
    values = {v for v in versions.values() if v is not None}
    return values.pop() if len(values) == 1 else None


def divergence_lines(repo: str | None, web: str | None, api: str | None) -> list[str]:
    """Human-readable divergences between the three version surfaces."""
    lines: list[str] = []
    if repo is None:
        lines.append("repo version chain is inconsistent (see field list)")
    if web is not None and repo is not None and web != repo:
        lines.append(f"live web {web} != repo chain {repo}")
    if api is not None and repo is not None and api != repo:
        lines.append(f"live API {api} != repo chain {repo}")
    if web is not None and api is not None and web != api:
        lines.append(f"live web {web} != live API {api}")
    return lines


@dataclass
class Flow:
    name: str
    ok: bool
    seconds: float
    detail: str


@dataclass
class SmokeResult:
    flows: list[Flow] = field(default_factory=list)
    web_version: str | None = None
    web_commit: str | None = None
    api_version: str | None = None
    api_commit: str | None = None

    def passed(self) -> bool:
        return all(f.ok for f in self.flows)


def http(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    body: dict | None = None,
    timeout: float = 120.0,
    retries: int = 2,
) -> tuple[int, dict[str, str], str, float]:
    """One HTTP call; returns (status, headers, text, seconds).

    Non-2xx statuses are returned, not raised (the caller decides what
    they mean). Transport failures (URLError, RemoteDisconnected,
    IncompleteRead, socket errors — OSError and http_client.HTTPException)
    retry twice by default: a cold serverless instance dropped connections
    outright in the first live runs, and a single dropped connection is
    not evidence the deployment is down. If every attempt fails, the call
    returns status 0 (never raises) so the caller records it as a failed
    flow and the run still reaches its verdict — a smoke script must never
    crash before printing what it did observe.
    """
    payload = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=payload, method=method)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    if payload is not None:
        request.add_header("Content-Type", "application/json")
    attempt = 0
    while True:
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return (
                    response.status,
                    {k.lower(): v for k, v in response.headers.items()},
                    response.read().decode("utf-8", "replace"),
                    time.monotonic() - started,
                )
        except urllib.error.HTTPError as exc:
            return (
                exc.code,
                {k.lower(): v for k, v in exc.headers.items()},
                exc.read().decode("utf-8", "replace"),
                time.monotonic() - started,
            )
        except (OSError, http_client.HTTPException):
            # URLError, RemoteDisconnected, IncompleteRead, timeouts.
            attempt += 1
            if attempt > retries:
                return (0, {}, "", time.monotonic() - started)
            time.sleep(2.0)


def _json(text: str) -> dict | list | None:
    try:
        parsed = json.loads(text)
    except ValueError:
        return None
    return parsed if isinstance(parsed, (dict, list)) else None


def run_live(
    api_base: str, web_base: str, *, timeout: float = 120.0, skip_write: bool = False
) -> SmokeResult:
    """Run the 10 live smoke flows against the production deployments."""
    result = SmokeResult()

    def record(name: str, ok: bool, seconds: float, detail: str) -> None:
        result.flows.append(Flow(name, ok, seconds, detail))

    # 1. Web shell + security headers (one response carries both checks).
    status, headers, _text, secs = http("GET", f"{web_base}/", timeout=timeout)
    expected_headers = {
        "content-security-policy": None,
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": None,
        "permissions-policy": None,
        "strict-transport-security": None,
    }
    missing = [
        name
        for name, want in expected_headers.items()
        if name not in headers or (want is not None and headers[name] != want)
    ]
    record(
        "web-shell",
        status == 200 and not missing,
        secs,
        f"HTTP {status}" + (f"; missing/wrong headers: {', '.join(missing)}" if missing else "; security headers present"),
    )

    # 2. Live web version from the served service worker.
    status, _headers, text, secs = http("GET", f"{web_base}/sw.js", timeout=timeout)
    match = re.search(r"CACHE_NAME\s*=\s*'aba-shell-v([^-']+)-([0-9a-f]+)'", text)
    if match:
        result.web_version, result.web_commit = match.group(1), match.group(2)
    record(
        "web-version",
        status == 200 and match is not None,
        secs,
        f"HTTP {status}; CACHE_NAME v{result.web_version or '?'} commit {result.web_commit or '?'}",
    )

    # 3. API liveness (process only; does not imply database readiness).
    status, _headers, text, secs = http("GET", f"{api_base}/health", timeout=timeout)
    record(
        "api-health",
        status == 200 and _json(text) == {"status": "ok"},
        secs,
        f"HTTP {status}",
    )

    # 4. Live API version.
    status, _headers, text, secs = http("GET", f"{api_base}/version", timeout=timeout)
    body = _json(text)
    if isinstance(body, dict):
        result.api_version = body.get("version")
        result.api_commit = body.get("commit")
    record(
        "api-version",
        status == 200 and isinstance(body, dict) and body.get("environment") == "production",
        secs,
        f"HTTP {status}; version {result.api_version or '?'} commit {result.api_commit or '?'}",
    )

    # 5. API readiness: a real SELECT 1 against the production database.
    status, _headers, text, secs = http("GET", f"{api_base}/readyz", timeout=timeout)
    record(
        "api-readyz",
        status == 200 and _json(text) == {"status": "ready"},
        secs,
        f"HTTP {status}",
    )

    # 6. Interactive API docs must stay gated in production (404 by design).
    docs_statuses = {}
    docs_secs = 0.0
    for path in ("/docs", "/redoc", "/openapi.json"):
        status, _headers, _text, secs = http("GET", f"{api_base}{path}", timeout=timeout)
        docs_statuses[path] = status
        docs_secs += secs
    record(
        "api-docs-gated",
        all(code == 404 for code in docs_statuses.values()),
        docs_secs,
        "; ".join(f"{path} {code}" for path, code in docs_statuses.items()),
    )

    # 7. Demo session: mints a Firebase custom token; the rate-limit upsert
    #    is itself a committed write against the production database.
    #    180s + one retry: the first call once took ~116s on a cold
    #    serverless instance (Firebase Admin init).
    status, _headers, text, secs = http(
        "POST",
        f"{api_base}/api/v1/demo/session",
        timeout=180.0,
    )
    body = _json(text)
    custom_token = body.get("custom_token") if isinstance(body, dict) else None
    record(
        "demo-session",
        status == 200 and bool(custom_token),
        secs,
        f"HTTP {status}" + (f" in {secs:.1f}s" if secs > 10 else ""),
    )
    if not custom_token:
        return result

    # 8. Exchange the custom token and read the demo business.
    #    The Firebase web API key is a public client key, read from the
    #    live public runtime-config.json.
    id_token = None
    demo_business_id = None
    started = time.monotonic()
    status, _headers, text, _secs = http("GET", f"{web_base}/runtime-config.json", timeout=timeout)
    config = _json(text)
    api_key = config.get("firebase", {}).get("apiKey") if isinstance(config, dict) else None
    if api_key:
        status, _headers, text, _secs = http(
            "POST",
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={api_key}",
            body={"token": custom_token, "returnSecureToken": True},
            timeout=timeout,
        )
        exchanged = _json(text)
        id_token = exchanged.get("idToken") if isinstance(exchanged, dict) else None
    auth_headers = {"Authorization": f"Bearer {id_token}"} if id_token else {}
    if id_token:
        status, _headers, text, _secs = http(
            "GET", f"{api_base}/api/v1/businesses", headers=auth_headers, timeout=timeout
        )
        businesses = _json(text)
        if isinstance(businesses, list):
            demo = next((b for b in businesses if b.get("name") == DEMO_BUSINESS_NAME), None)
            demo_business_id = demo.get("id") if demo else None
    record(
        "demo-auth",
        bool(id_token) and bool(demo_business_id),
        time.monotonic() - started,
        f"token {'minted' if id_token else 'missing'}; demo business {'found' if demo_business_id else 'missing'}",
    )
    if not id_token or not demo_business_id:
        return result

    # 9. Authenticated workspace reads (customers + invoices).
    auth_headers = {"Authorization": f"Bearer {id_token}"}
    started = time.monotonic()
    status_c, _h, text_c, _s = http(
        "GET", f"{api_base}/api/v1/businesses/{demo_business_id}/customers",
        headers=auth_headers, timeout=timeout,
    )
    customers = _json(text_c)
    status_i, _h, text_i, _s = http(
        "GET", f"{api_base}/api/v1/businesses/{demo_business_id}/invoices",
        headers=auth_headers, timeout=timeout,
    )
    invoices = _json(text_i)
    record(
        "demo-reads",
        status_c == 200 and isinstance(customers, list)
        and status_i == 200 and isinstance(invoices, list),
        time.monotonic() - started,
        f"customers HTTP {status_c} ({len(customers) if isinstance(customers, list) else '?'} rows); "
        f"invoices HTTP {status_i} ({len(invoices) if isinstance(invoices, list) else '?'} rows)",
    )

    # 10. Synthetic write cycle inside the demo business only: create a
    #    throwaway customer, verify it reads back, delete it in a finally.
    if skip_write:
        record("demo-write-cycle", True, 0.0, "skipped (--skip-write)")
        return result
    started = time.monotonic()
    created_id = None
    try:
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        status, _h, text, _s = http(
            "POST",
            f"{api_base}/api/v1/businesses/{demo_business_id}/customers",
            headers=auth_headers,
            body={"name": f"AIBA-SMOKE throwaway {stamp}"},
            timeout=timeout,
        )
        created = _json(text)
        created_id = created.get("id") if isinstance(created, dict) else None
        if status != 201 or not created_id:
            record("demo-write-cycle", False, time.monotonic() - started, f"create HTTP {status}")
            return result
        status, _h, text, _s = http(
            "GET", f"{api_base}/api/v1/businesses/{demo_business_id}/customers",
            headers=auth_headers, timeout=timeout,
        )
        rows = _json(text)
        present = isinstance(rows, list) and any(r.get("id") == created_id for r in rows)
        if not present:
            record("demo-write-cycle", False, time.monotonic() - started, "created row did not read back")
            return result
        record("demo-write-cycle", True, time.monotonic() - started, f"create 201, read back, id {created_id[:8]}…")
    finally:
        if created_id:
            status, _h, _t, _s = http(
                "DELETE",
                f"{api_base}/api/v1/businesses/{demo_business_id}/customers/{created_id}",
                headers=auth_headers,
                timeout=timeout,
            )
            if status != 204:
                result.flows[-1].ok = False
                result.flows[-1].detail += f"; cleanup DELETE returned HTTP {status} — leftover id {created_id}"
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AIBA production smoke + release-loop verification (3A-701).")
    parser.add_argument("--api", default=API_BASE, help="Production API base URL.")
    parser.add_argument("--web", default=WEB_BASE, help="Production web base URL.")
    parser.add_argument("--repo-root", default=None, help="Repo root (default: parent of scripts/).")
    parser.add_argument("--repo-only", action="store_true", help="Only the repo version-chain check (no network).")
    parser.add_argument("--skip-write", action="store_true", help="Skip the demo write cycle (flow 10).")
    parser.add_argument("--timeout", type=float, default=120.0, help="Per-request timeout in seconds.")
    args = parser.parse_args(argv)

    root = Path(args.repo_root) if args.repo_root else Path(__file__).resolve().parents[1]
    started = time.monotonic()
    versions = read_repo_versions(root)
    repo = chain_version(versions)

    print(f"production-smoke  repo={root}  at {datetime.now(UTC).isoformat()}")
    print("--- repo version chain ---")
    for name in REPO_VERSION_FIELDS:
        print(f"  {name}: {versions.get(name) or 'MISSING'}")
    print(f"  chain: {repo or 'INCONSISTENT'}")
    if args.repo_only:
        print(f"RESULT: {'PASS' if repo else 'FAIL'} — repo chain {'consistent' if repo else 'inconsistent'}")
        return 0 if repo else 1

    result = run_live(args.api, args.web, timeout=args.timeout, skip_write=args.skip_write)
    print("--- live smoke flows ---")
    for flow in result.flows:
        mark = "PASS" if flow.ok else "FAIL"
        print(f"  {mark} {flow.name} ({flow.seconds:.1f}s) — {flow.detail}")
    print("--- divergence verdict ---")
    print(f"  repo chain: {repo or 'INCONSISTENT'}")
    print(f"  live web: {result.web_version or '?'} (commit {result.web_commit or '?'})")
    print(f"  live API: {result.api_version or '?'} (commit {result.api_commit or '?'})")
    divergences = divergence_lines(repo, result.web_version, result.api_version)
    for line in divergences:
        print(f"  DIVERGENCE: {line}")
    ok = result.passed() and not divergences
    total = time.monotonic() - started
    print(f"RESULT: {'PASS' if ok else 'FAIL'} — {len(result.flows)} flows in {total:.1f}s"
          + ("; no divergence" if not divergences else "; divergence present"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
