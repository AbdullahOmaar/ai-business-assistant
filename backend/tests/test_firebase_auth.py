import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app import firebase_auth


def _request(headers=()):
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/businesses",
        "raw_path": b"/api/v1/businesses",
        "query_string": b"",
        "headers": list(headers),
        "client": ("127.0.0.1", 12345),
        "server": ("testserver", 443),
    })


def test_firebase_resolver_requires_bearer_token(monkeypatch):
    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(firebase_auth, "_firebase_app", lambda: object())
    with pytest.raises(HTTPException) as error:
        firebase_auth.firebase_principal_resolver(_request())
    assert error.value.status_code == 401


def test_firebase_resolver_uses_verified_project_qualified_uid(monkeypatch):
    import firebase_admin.auth

    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(firebase_auth, "_firebase_app", lambda: object())
    monkeypatch.setattr(
        firebase_admin.auth, "verify_id_token",
        lambda token, app, check_revoked: {"uid": "user-123", "aud": "test-project"},
    )
    request = _request([(b"authorization", b"Bearer valid-token")])
    principal = firebase_auth.firebase_principal_resolver(request)
    assert principal.subject == "firebase:test-project:user-123"
