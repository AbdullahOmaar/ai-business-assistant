#!/usr/bin/env python3
"""Exercise the exact candidate API with disposable PostgreSQL and trusted test principals.

This is an in-process HTTP integration smoke, not a live Firebase/Production test.
The test-only principal resolver is installed through FastAPI dependency_overrides;
the production Firebase verifier is covered separately by backend/tests/test_firebase_auth.py.
All database records live only in the ephemeral GitHub Actions PostgreSQL service.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode

from fastapi import HTTPException, Request
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.dependencies import get_principal
from app.main import app
from app.security import AuthenticatedPrincipal


def fail(message: str) -> None:
    raise RuntimeError(message)


def main() -> None:
    expected_sha = os.environ.get("EXPECTED_API_COMMIT", "").strip()
    actual_sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], text=True
    ).strip()
    if not expected_sha or actual_sha != expected_sha:
        fail("Smoke checkout does not match the expected pull-request head SHA.")

    # version_info uses this deployment metadata variable. Bind it to the
    # already verified checkout so the API's own version route proves the
    # process is serving the exact candidate commit.
    os.environ["VERCEL_GIT_COMMIT_SHA"] = actual_sha
    os.environ["VERCEL_ENV"] = "preview"

    run_suffix = (
        f"{os.environ.get('GITHUB_RUN_ID', 'local')}-"
        f"{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
    )
    owner_token = f"qa-owner-{run_suffix}"
    other_token = f"qa-other-{run_suffix}"
    principals = {
        owner_token: AuthenticatedPrincipal(
            subject=f"qa:release-smoke:owner:{run_suffix}"
        ),
        other_token: AuthenticatedPrincipal(
            subject=f"qa:release-smoke:other:{run_suffix}"
        ),
    }

    def trusted_test_resolver(request: Request) -> AuthenticatedPrincipal:
        authorization = request.headers.get("authorization", "")
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or token not in principals:
            raise HTTPException(status_code=401, detail="A test bearer identity is required.")
        return principals[token]

    app.dependency_overrides[get_principal] = trusted_test_resolver
    headers_owner = {"Authorization": f"Bearer {owner_token}"}
    headers_other = {"Authorization": f"Bearer {other_token}"}

    try:
        with TestClient(app) as client:
            version = client.get("/version")
            if version.status_code != 200:
                fail(f"Candidate /version returned HTTP {version.status_code}.")
            version_body = version.json()
            if version_body.get("commit") != actual_sha[:12]:
                fail("Candidate API /version does not report the exact checked-out SHA.")

            ready = client.get("/readyz")
            if ready.status_code != 200:
                fail(f"Candidate API /readyz returned HTTP {ready.status_code}.")

            unauthenticated = client.get("/api/v1/businesses")
            if unauthenticated.status_code != 401:
                fail("Unauthenticated workspace listing was not rejected with HTTP 401.")

            def create_workspace(name: str, headers: dict[str, str]) -> str:
                response = client.post(
                    "/api/v1/businesses",
                    headers=headers,
                    json={
                        "name": name,
                        "currency_code": "EGP",
                        "locale": "en",
                        "timezone": "Africa/Cairo",
                    },
                )
                if response.status_code != 201:
                    fail(f"Workspace creation failed with HTTP {response.status_code}: {response.text[:300]}")
                workspace_id = response.json().get("id")
                if not workspace_id:
                    fail("Workspace creation response did not include an ID.")
                return workspace_id

            owner_business_id = create_workspace(
                f"AIBA candidate smoke owner {run_suffix}", headers_owner
            )
            other_business_id = create_workspace(
                f"AIBA candidate smoke other {run_suffix}", headers_other
            )

            owner_workspaces = client.get("/api/v1/businesses", headers=headers_owner)
            other_workspaces = client.get("/api/v1/businesses", headers=headers_other)
            if owner_workspaces.status_code != 200 or {
                row.get("id") for row in owner_workspaces.json()
            } != {owner_business_id}:
                fail("Owner workspace listing leaked or omitted workspace membership.")
            if other_workspaces.status_code != 200 or {
                row.get("id") for row in other_workspaces.json()
            } != {other_business_id}:
                fail("Second identity workspace listing leaked or omitted workspace membership.")

            invoice_number = f"AIBA-SMOKE-{run_suffix}"
            invoice_url = f"/api/v1/businesses/{owner_business_id}/invoices"
            invoice_payload = {
                "invoice_number": invoice_number,
                "currency_code": "EGP",
                "discount_rate": "0",
                "tax_rate": "0",
                "notes": "Automated candidate smoke; non-issued QA draft only.",
                "lines": [{
                    "description": "QA smoke item original",
                    "quantity": "1",
                    "unit_price": "10.00",
                }],
            }
            created = client.post(invoice_url, headers=headers_owner, json=invoice_payload)
            if created.status_code != 201:
                fail(f"Draft invoice creation failed with HTTP {created.status_code}: {created.text[:300]}")
            invoice_id = created.json().get("id")
            if not invoice_id:
                fail("Draft invoice creation response did not include an ID.")

            edited_payload = {
                **invoice_payload,
                "notes": "Automated candidate smoke; edited non-issued QA draft only.",
                "lines": [{
                    "description": "QA smoke item updated",
                    "quantity": "1",
                    "unit_price": "12.00",
                }],
            }
            edited = client.patch(
                f"{invoice_url}/{invoice_id}",
                headers=headers_owner,
                json=edited_payload,
            )
            if edited.status_code != 200:
                fail(f"Draft invoice edit failed with HTTP {edited.status_code}: {edited.text[:300]}")

            invoice_query = urlencode({"business_id": owner_business_id})
            reloaded = client.get(
                f"/api/v1/invoices/{invoice_id}?{invoice_query}",
                headers=headers_owner,
            )
            if reloaded.status_code != 200:
                fail(f"Draft invoice reload failed with HTTP {reloaded.status_code}.")
            saved = reloaded.json()
            lines = saved.get("lines", [])
            if not (
                saved.get("status") == "draft"
                and saved.get("invoice_number") == invoice_number
                and saved.get("currency_code") == "EGP"
                and float(saved.get("total", 0)) == 12.0
                and len(lines) == 1
                and lines[0].get("description") == "QA smoke item updated"
                and float(lines[0].get("unit_price", 0)) == 12.0
            ):
                fail("Reloaded candidate draft did not match the persisted edit.")

            audit_query = urlencode({
                "business_id": owner_business_id,
                "target_type": "invoice",
            })
            audit_before = client.get(
                f"/api/v1/audit-events?{audit_query}", headers=headers_owner
            )
            if audit_before.status_code != 200:
                fail(f"Invoice audit read failed with HTTP {audit_before.status_code}.")
            audit_items = audit_before.json().get("items", [])
            actions = {
                item.get("action") for item in audit_items
                if item.get("target_id") == invoice_id
            }
            if actions != {"invoice.created", "invoice.draft_updated"}:
                fail("Invoice create/edit audit events are missing or unexpected.")

            cross_tenant = client.get(
                f"/api/v1/invoices/{invoice_id}?{invoice_query}",
                headers=headers_other,
            )
            if cross_tenant.status_code != 403:
                fail(f"Cross-tenant invoice read returned HTTP {cross_tenant.status_code}, expected 403.")

            foreign_workspace = client.get(
                f"/api/v1/businesses/{owner_business_id}", headers=headers_other
            )
            if foreign_workspace.status_code != 403:
                fail(f"Cross-tenant workspace read returned HTTP {foreign_workspace.status_code}, expected 403.")

            denied_audit = client.get(
                f"/api/v1/audit-events?{audit_query}", headers=headers_other
            )
            if denied_audit.status_code != 403:
                fail(f"Cross-tenant audit read returned HTTP {denied_audit.status_code}, expected 403.")

            audit_after = client.get(
                f"/api/v1/audit-events?{audit_query}", headers=headers_owner
            )
            if audit_after.status_code != 200 or audit_after.json().get("total") != audit_before.json().get("total"):
                fail("Rejected cross-tenant reads changed the owner's audit history.")

            print(
                "PASS: exact candidate API SHA; readiness; unauthenticated denial; "
                "two isolated identities/workspaces; EGP draft create/edit/reload; "
                "invoice audit events; cross-tenant invoice/workspace/audit denial."
            )
            print(
                "All test data is confined to the disposable CI PostgreSQL service. "
                "No live Firebase account, Production database, issue/post/void, "
                "payment, deletion, or external message was used."
            )
    finally:
        app.dependency_overrides.pop(get_principal, None)


if __name__ == "__main__":
    main()
