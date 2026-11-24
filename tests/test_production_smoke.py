"""Unit tests for the production smoke script (3A-701, Phase 2 A1).

Only the pure, network-free functions are tested here: the repo version
chain reader and the divergence verdict, plus the HTTP helper against a
mocked urlopen. The live flows themselves are exercised by running the
script against production and recording the result in the evidence
register; they are not faked into passing here.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import production_smoke as smoke


def _write_repo(root: Path, *, version: str = "1.17.0", api_version: str | None = None) -> None:
    (root / "frontend" / "src" / "app").mkdir(parents=True)
    (root / "frontend" / "public").mkdir(parents=True)
    (root / "backend" / "app").mkdir(parents=True)
    (root / "frontend" / "package.json").write_text(json.dumps({"version": version}), encoding="utf-8")
    (root / "frontend" / "package-lock.json").write_text(
        json.dumps({"version": version}), encoding="utf-8"
    )
    (root / "frontend" / "src" / "app" / "build-info.ts").write_text(
        f'export const APP_BUILD_INFO = {{"version":"{version}","commit":"abc123456789"}} as const;\n',
        encoding="utf-8",
    )
    (root / "frontend" / "public" / "sw.js").write_text(
        f"const CACHE_NAME = 'aba-shell-v{version}-abc123456789';\n", encoding="utf-8"
    )
    (root / "backend" / "pyproject.toml").write_text(
        f'[project]\nname = "aiba-api"\nversion = "{version}"\n', encoding="utf-8"
    )
    (root / "backend" / "app" / "main.py").write_text(
        f'from fastapi import FastAPI\n\napp = FastAPI(\n    version="{version}",\n)\n',
        encoding="utf-8",
    )
    (root / "frontend" / "src" / "app" / "release-guide.ts").write_text(
        "export const RELEASE_HISTORY = [\n"
        f"  {{\n    version: '{version}',\n    apiVersion: '{api_version or version}',\n"
        "  },\n];\n",
        encoding="utf-8",
    )


class TestRepoVersionChain(unittest.TestCase):
    def test_real_repo_chain_agrees(self) -> None:
        root = Path(__file__).resolve().parents[1]
        versions = smoke.read_repo_versions(root)
        self.assertEqual(len(versions), 8)
        self.assertTrue(all(versions.values()), f"missing fields: {versions}")
        self.assertEqual(smoke.chain_version(versions), "1.17.0")

    def test_synthetic_repo_chain_agrees(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root)
            versions = smoke.read_repo_versions(root)
            self.assertEqual(smoke.chain_version(versions), "1.17.0")

    def test_one_field_diverges_breaks_chain(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_repo(root, api_version="1.16.0")
            versions = smoke.read_repo_versions(root)
            self.assertEqual(versions["release-guide.ts apiVersion"], "1.16.0")
            self.assertIsNone(smoke.chain_version(versions))

    def test_empty_tree_reports_missing_everywhere(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            versions = smoke.read_repo_versions(Path(tmp))
            self.assertTrue(all(v is None for v in versions.values()))
            self.assertIsNone(smoke.chain_version(versions))


class TestDivergenceVerdict(unittest.TestCase):
    def test_all_agree_is_clean(self) -> None:
        self.assertEqual(smoke.divergence_lines("1.17.0", "1.17.0", "1.17.0"), [])

    def test_api_behind_is_reported_not_hidden(self) -> None:
        lines = smoke.divergence_lines("1.17.0", "1.17.0", "1.13.0")
        self.assertIn("live API 1.13.0 != repo chain 1.17.0", lines)
        self.assertIn("live web 1.17.0 != live API 1.13.0", lines)

    def test_inconsistent_repo_chain_is_reported(self) -> None:
        lines = smoke.divergence_lines(None, "1.17.0", "1.17.0")
        self.assertTrue(any("inconsistent" in line for line in lines))


class TestPageIntegrity(unittest.TestCase):
    """Page-integrity checks (B5, 3A-723): the served page's script inventory."""

    def _csp(self, inline: str = "boot") -> str:
        return (
            "default-src 'self'; script-src 'self' "
            f"'sha256-{smoke.sha256_b64(inline)}' 'unsafe-hashes'"
        )

    def _page(self, *, external: tuple[str, ...] = ("main-AB12CD34.js",), inline: str = "boot") -> str:
        scripts = "".join(f'<script src="{src}" type="module"></script>' for src in external)
        if inline is not None:
            scripts += f"<script>{inline}</script>"
        return f"<!doctype html><html><head>{scripts}</head><body></body></html>"

    def test_clean_page_passes(self) -> None:
        ok, notes = smoke.check_page_scripts(self._page(), self._csp())
        self.assertTrue(ok)
        self.assertEqual(
            notes, ["1 same-origin hashed script(s), 1 inline script(s) pinned by CSP"]
        )

    def test_third_party_script_fails(self) -> None:
        ok, notes = smoke.check_page_scripts(
            self._page(external=("https://cdn.example.com/evil.js",)), self._csp()
        )
        self.assertFalse(ok)
        self.assertTrue(any("third-party" in note for note in notes))

    def test_unhashed_bundle_fails(self) -> None:
        ok, notes = smoke.check_page_scripts(self._page(external=("main.js",)), self._csp())
        self.assertFalse(ok)
        self.assertTrue(any("not a hashed bundle" in note for note in notes))

    def test_unpinned_inline_script_fails(self) -> None:
        ok, _notes = smoke.check_page_scripts(self._page(inline="tampered"), self._csp())
        self.assertFalse(ok)

    def test_missing_csp_fails(self) -> None:
        ok, notes = smoke.check_page_scripts(self._page(), None)
        self.assertFalse(ok)
        self.assertTrue(any("no Content-Security-Policy" in note for note in notes))

    def test_unsafe_inline_in_script_src_fails(self) -> None:
        csp = "script-src 'self' 'unsafe-inline'"
        ok, notes = smoke.check_page_scripts(self._page(inline=None), csp)
        self.assertFalse(ok)
        self.assertTrue(any("unsafe-inline" in note for note in notes))

    def test_orphan_csp_hash_is_a_note_not_a_failure(self) -> None:
        # The live CSP carried a stale hash until the next web deploy;
        # an orphan hash is reported, it does not fail the flow.
        csp = (
            "default-src 'self'; script-src 'self' "
            f"'sha256-{smoke.sha256_b64('boot')}' 'sha256-{smoke.sha256_b64('gone')}' 'unsafe-hashes'"
        )
        ok, notes = smoke.check_page_scripts(self._page(), csp)
        self.assertTrue(ok)
        self.assertTrue(any("orphan CSP hash" in note for note in notes))

    def test_parse_page_scripts_splits_src_and_inline(self) -> None:
        parsed = smoke.parse_page_scripts(
            '<script src="main-AB12CD34.js"></script><script>boot</script>'
        )
        self.assertEqual(parsed["external"], ["main-AB12CD34.js"])
        self.assertEqual(parsed["inline"], ["boot"])


class TestHttpHelper(unittest.TestCase):
    def _mock_response(self, status: int, body: str) -> MagicMock:
        response = MagicMock()
        response.status = status
        response.headers.items.return_value = []
        response.read.return_value = body.encode()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        return response

    def test_success_returns_status_body_and_seconds(self) -> None:
        with patch("urllib.request.urlopen", return_value=self._mock_response(200, '{"status":"ok"}')):
            status, _headers, text, seconds = smoke.http("GET", "https://example.test/health")
        self.assertEqual(status, 200)
        self.assertEqual(text, '{"status":"ok"}')
        self.assertGreaterEqual(seconds, 0.0)

    def test_dropped_connection_retries_once_then_succeeds(self) -> None:
        import http.client

        with patch(
            "urllib.request.urlopen",
            side_effect=[
                http.client.RemoteDisconnected("Remote end closed connection without response"),
                self._mock_response(200, '{"status":"ok"}'),
            ],
        ):
            status, _headers, text, _seconds = smoke.http("GET", "https://example.test/health")
        self.assertEqual(status, 200)
        self.assertEqual(text, '{"status":"ok"}')

    def test_incomplete_read_retries_once_then_succeeds(self) -> None:
        import http.client

        broken = MagicMock()
        broken.status = 200
        broken.headers.items.return_value = []
        broken.read.side_effect = http.client.IncompleteRead(b"", 937)
        broken.__enter__.return_value = broken
        broken.__exit__.return_value = False
        with patch(
            "urllib.request.urlopen",
            side_effect=[broken, self._mock_response(200, '{"status":"ok"}')],
        ):
            status, _headers, text, _seconds = smoke.http("GET", "https://example.test/health")
        self.assertEqual(status, 200)
        self.assertEqual(text, '{"status":"ok"}')

    def test_repeated_transport_failure_returns_status_zero(self) -> None:
        import http.client

        with patch(
            "urllib.request.urlopen",
            side_effect=http.client.RemoteDisconnected("Remote end closed connection without response"),
        ):
            status, _headers, text, _seconds = smoke.http(
                "GET", "https://example.test/health", retries=0
            )
        # A smoke helper never raises on transport failure: status 0 is
        # the caller's signal to record a failed flow and keep going.
        self.assertEqual(status, 0)
        self.assertEqual(text, "")

    def test_non_2xx_is_returned_not_raised(self) -> None:
        import urllib.error

        error = urllib.error.HTTPError("https://example.test/docs", 404, "Not Found", {}, None)
        error.read = lambda: b"Not Found"  # type: ignore[method-assign]
        with patch("urllib.request.urlopen", side_effect=error):
            status, _headers, _text, _seconds = smoke.http("GET", "https://example.test/docs")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
