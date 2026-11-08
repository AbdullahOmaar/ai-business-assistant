"""Firebase ID-token verification adapter for FastAPI.

A Firebase project is only used when FIREBASE_PROJECT_ID is configured.
Credentials are loaded from FIREBASE_SERVICE_ACCOUNT_JSON or Google ADC; no
client-supplied UID/header is accepted as an identity.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

from fastapi import HTTPException, Request

from app.security import AuthenticatedPrincipal


@lru_cache(maxsize=1)
def _firebase_app():
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        return None

    import firebase_admin
    from firebase_admin import credentials

    raw_credentials = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw_credentials:
        try:
            service_account = json.loads(raw_credentials)
        except json.JSONDecodeError as exc:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.") from exc
        credential = credentials.Certificate(service_account)
    else:
        credential = credentials.ApplicationDefault()

    app_name = f"ai-business-assistant-{project_id}"
    try:
        return firebase_admin.get_app(app_name)
    except ValueError:
        return firebase_admin.initialize_app(
            credential,
            options={"projectId": project_id},
            name=app_name,
        )


def firebase_principal_resolver(request: Request) -> AuthenticatedPrincipal:
    """Verify a Firebase ID token and return a project-qualified subject."""
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    app = _firebase_app()
    if not project_id or app is None:
        raise HTTPException(status_code=503, detail="Firebase Authentication is not configured.")

    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="A Firebase ID token is required.")

    from firebase_admin import auth
    from firebase_admin.exceptions import FirebaseError
    from google.auth.exceptions import DefaultCredentialsError, GoogleAuthError

    try:
        claims = auth.verify_id_token(token.strip(), app=app, check_revoked=True)
    except (DefaultCredentialsError, GoogleAuthError) as exc:
        # Do not turn missing server credentials into an opaque 500. This is a
        # deployment configuration fault, not a bad user token.
        raise HTTPException(
            status_code=503,
            detail=(
                "Firebase Admin credentials are missing or invalid. Configure "
                "FIREBASE_SERVICE_ACCOUNT_JSON in the backend production environment."
            ),
        ) from exc
    except (ValueError, FirebaseError) as exc:
        raise HTTPException(status_code=401, detail="Firebase ID token is invalid or expired.") from exc

    # The Admin SDK verifies signatures and token validity; explicitly bind the
    # accepted claims to the configured Firebase project as a defense-in-depth
    # check so a token from another project can never become a local principal.
    expected_issuer = f"https://securetoken.google.com/{project_id}"
    if claims.get("aud") != project_id or claims.get("iss") != expected_issuer:
        raise HTTPException(status_code=401, detail="Firebase ID token belongs to another project.")

    uid = claims.get("uid")
    if not isinstance(uid, str) or not uid.strip():
        raise HTTPException(status_code=401, detail="Firebase ID token has no valid user subject.")

    return AuthenticatedPrincipal(subject=f"firebase:{project_id}:{uid}")


def configure_firebase_auth(app) -> bool:
    """Attach the resolver when a project is configured; fail closed otherwise."""
    if not os.getenv("FIREBASE_PROJECT_ID", "").strip():
        return False
    # Initialize now so bad credentials fail during startup, not on first request.
    _firebase_app()
    app.state.principal_resolver = firebase_principal_resolver
    return True

def get_firebase_admin_app():
    """Return the configured Firebase Admin app for authorized user-directory calls.

    This helper deliberately exposes the app object only to trusted backend
    modules; HTTP responses must never include credentials or token data.
    """
    app = _firebase_app()
    if app is None:
        raise HTTPException(
            status_code=503,
            detail="Firebase Authentication is not configured for the user directory.",
        )
    return app

