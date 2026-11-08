"""Request dependencies for database sessions and verified identities.

The host application must configure session_factory and principal_resolver.
No identity is ever accepted from user-controlled headers or request bodies.
"""
from collections.abc import Generator
from typing import cast

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session, sessionmaker

from app.security import AuthenticatedPrincipal


def get_session(request: Request) -> Generator[Session, None, None]:
    """Yield one request-scoped session; transaction commits are route-owned."""
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:
        raise HTTPException(
            status_code=503,
            detail="Database is not configured. Configure a PostgreSQL session_factory.",
        )
    session = cast(sessionmaker[Session], factory)()
    try:
        yield session
    finally:
        session.close()


def get_principal(request: Request) -> AuthenticatedPrincipal:
    """Resolve a principal only through a trusted host-provided verifier."""
    resolver = getattr(request.app.state, "principal_resolver", None)
    if resolver is None:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured. No business data was accessed.",
        )
    principal = resolver(request)
    if not isinstance(principal, AuthenticatedPrincipal):
        raise HTTPException(status_code=401, detail="Authentication required")
    return principal
