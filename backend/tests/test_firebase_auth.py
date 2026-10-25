import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app import firebase_auth
from app.main import version_info


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
    calls = {}

    def verify(token, *, app, check_revoked):
        calls.update(token=token, app=app, check_revoked=check_revoked)
        return {"uid": "user-123", "aud": "test-project"}

    monkeypatch.setattr(firebase_admin.auth, "verify_id_token", verify)
    request = _request([(b"authorization", b"Bearer valid-token")])
    principal = firebase_auth.firebase_principal_resolver(request)

    assert principal.subject == "firebase:test-project:user-123"
    assert calls["token"] == "valid-token"
    assert calls["check_revoked"] is True


@pytest.mark.parametrize("failure_kind", ["invalid", "expired", "revoked"])
def test_firebase_resolver_rejects_invalid_or_revoked_tokens(monkeypatch, failure_kind):
    import firebase_admin.auth

    monkeypatch.setenv("FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(firebase_auth, "_firebase_app", lambda: object())
    if failure_kind == "revoked":
        token_error = firebase_admin.auth.RevokedIdTokenError("revoked token")
    elif failure_kind == "expired":
        token_error = firebase_admin.auth.ExpiredIdTokenError("expired token", None)
    else:
        token_error = firebase_admin.auth.InvalidIdTokenError("invalid token")

    def reject(token, *, app, check_revoked):
        assert check_revoked is True
        raise token_error

    monkeypatch.setattr(firebase_admin.auth, "verify_id_token", reject)
    request = _request([(b"authorization", b"Bearer untrusted-token")])

    with pytest.raises(HTTPException) as error:
        firebase_auth.firebase_principal_resolver(request)

    assert error.value.status_code == 401
    assert error.value.detail == "Firebase ID token is invalid or expired."



def test_version_info_reports_deployment_commit(monkeypatch):
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "1234567890abcdef")
    monkeypatch.setenv("GITHUB_SHA", "fallback-sha")
    monkeypatch.setenv("VERCEL_ENV", "production")

    info = version_info()

    assert info["version"] == "0.4.0"
    assert info["commit"] == "1234567890ab"
    assert info["environment"] == "production"
