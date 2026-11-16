"""Public synthetic-demo session bootstrap.

The endpoint never accepts or returns a password. It mints a short-lived,
single-use Firebase custom token for one explicitly configured demo identity.
It is disabled unless DEMO_LOGIN_ENABLED=true and DEMO_LOGIN_EMAIL is set.
"""
import os

from fastapi import APIRouter, HTTPException, Response

from app.firebase_auth import get_firebase_admin_app

router = APIRouter(prefix="/api/v1/demo", tags=["demo access"])


@router.post("/session")
def create_demo_session(response: Response) -> dict[str, str]:
    """Issue a Firebase custom token for the configured public demo identity."""
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Pragma"] = "no-cache"

    enabled = os.getenv("DEMO_LOGIN_ENABLED", "").strip().casefold() == "true"
    email = os.getenv("DEMO_LOGIN_EMAIL", "").strip()
    if not enabled:
        raise HTTPException(status_code=404, detail="Demo access is not enabled.")
    if not email:
        raise HTTPException(status_code=503, detail="Demo access is not configured.")

    try:
        from firebase_admin import auth
        app = get_firebase_admin_app()
        user = auth.get_user_by_email(email, app=app)
        custom_token = auth.create_custom_token(user.uid, app=app)
    except HTTPException:
        raise
    except Exception as exc:
        # Keep identity-provider details and account existence out of public errors.
        raise HTTPException(status_code=503, detail="Demo sign-in is temporarily unavailable.") from exc

    token = custom_token.decode("utf-8") if isinstance(custom_token, bytes) else str(custom_token)
    return {"custom_token": token}
