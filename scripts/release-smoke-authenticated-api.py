#!/usr/bin/env python3
"""Zero-cost authenticated smoke for the AIBA invoice release candidate.

Creates synthetic Firebase users, two QA workspaces and one EGP draft invoice.
It edits/reloads the draft and verifies cross-tenant denial. It never issues or
voids an invoice, mutates payments, deletes records, or accesses the DB directly.
"""
from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request


WEB_BASE_URL = "https://ai-business-assistant-web.vercel.app"
EXPECTED_API_BASE_URL = "https://ai-business-assistant-api.vercel.app"


def request_json(method: str, url: str, *, token: str | None = None,
                 payload: dict | None = None, expected: tuple[int, ...] = (200,)):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    body = json.loads(raw.decode("utf-8")) if raw else None
    if status not in expected:
        detail = body.get("detail") if isinstance(body, dict) else None
        firebase_error = body.get("error", {}).get("message") if isinstance(body, dict) else None
        safe_detail = detail or firebase_error or "no response detail"
        raise RuntimeError(f"{method} {url.split('?')[0]} returned HTTP {status}; expected {expected}: {safe_detail}")
    return status, body


def firebase_signup(api_key: str, email: str) -> str:
    _, body = request_json(
        "POST",
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}",
        payload={
            "email": email,
            "password": secrets.token_urlsafe(32),
            "returnSecureToken": True,
        },
        expected=(200,),
    )
    token = body.get("idToken") if isinstance(body, dict) else None
    if not token:
        raise RuntimeError("Firebase signup succeeded without an ID token.")
    return token


def main() -> None:
    _, config = request_json("GET", f"{WEB_BASE_URL}/runtime-config.json")
    api_base = config.get("apiBaseUrl")
    firebase_api_key = config.get("firebase", {}).get("apiKey")
    if api_base != EXPECTED_API_BASE_URL or not firebase_api_key:
        raise RuntimeError("Runtime config did not match the expected AIBA API/Firebase project.")

    run_suffix = f"{os.environ.get('GITHUB_RUN_ID', 'local')}-{os.environ.get('GITHUB_RUN_ATTEMPT', '1')}"
    owner_email = f"aiba-release-smoke-{run_suffix}-owner@example.com"
    other_email = f"aiba-release-smoke-{run_suffix}-other@example.com"
    owner_token = firebase_signup(firebase_api_key, owner_email)
    other_token = firebase_signup(firebase_api_key, other_email)

    def create_workspace(name: str, token: str) -> str:
        _, workspace = request_json(
            "POST", f"{api_base}/api/v1/businesses", token=token,
            payload={
                "name": name,
                "currency_code": "EGP",
                "locale": "en",
                "timezone": "Africa/Cairo",
            },
            expected=(201,),
        )
        workspace_id = workspace.get("id") if isinstance(workspace, dict) else None
        if not workspace_id:
            raise RuntimeError("Workspace creation returned no ID.")
        return workspace_id

    owner_business_id = create_workspace(f"AIBA release smoke owner {run_suffix}", owner_token)
    other_business_id = create_workspace(f"AIBA release smoke other {run_suffix}", other_token)
    invoice_number = f"AIBA-SMOKE-{run_suffix}"
    invoice_url = f"{api_base}/api/v1/businesses/{owner_business_id}/invoices"

    _, invoice = request_json(
        "POST", invoice_url, token=owner_token,
        payload={
            "invoice_number": invoice_number,
            "currency_code": "EGP",
            "discount_rate": "0",
            "tax_rate": "0",
            "notes": "Automated release smoke; non-issued QA draft only.",
            "lines": [{
                "description": "QA smoke item original",
                "quantity": "1",
                "unit_price": "10.00",
            }],
        },
        expected=(201,),
    )
    invoice_id = invoice.get("id") if isinstance(invoice, dict) else None
    if not invoice_id:
        raise RuntimeError("Draft invoice creation returned no ID.")

    request_json(
        "PATCH", f"{invoice_url}/{invoice_id}", token=owner_token,
        payload={
            "invoice_number": invoice_number,
            "currency_code": "EGP",
            "discount_rate": "0",
            "tax_rate": "0",
            "notes": "Automated release smoke; edited non-issued QA draft only.",
            "lines": [{
                "description": "QA smoke item updated",
                "quantity": "1",
                "unit_price": "12.00",
            }],
        },
        expected=(200,),
    )
    _, saved = request_json("GET", f"{invoice_url}/{invoice_id}", token=owner_token)
    line_items = saved.get("lines", []) if isinstance(saved, dict) else []
    if not (
        saved.get("status") == "draft"
        and saved.get("invoice_number") == invoice_number
        and saved.get("currency_code") == "EGP"
        and float(saved.get("total", 0)) == 12.0
        and len(line_items) == 1
        and line_items[0].get("description") == "QA smoke item updated"
        and float(line_items[0].get("unit_price", 0)) == 12.0
    ):
        raise RuntimeError("Reloaded draft invoice did not match the expected persisted edit.")

    _, _ = request_json(
        "GET",
        f"{api_base}/api/v1/businesses/{owner_business_id}/invoices/{invoice_id}",
        token=other_token,
        expected=(403, 404),
    )
    print(
        "PASS: Firebase authenticated signup; two workspace creates; "
        "EGP draft create/edit/reload; cross-tenant read denied."
    )
    print(
        "Synthetic QA identities/workspaces/draft remain as test records; "
        "no invoice was issued and no payment, deletion or external message occurred."
    )


if __name__ == "__main__":
    main()
