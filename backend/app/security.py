"""Provider-neutral authorization primitives.

A Principal may only be constructed by the trusted token-verification adapter
configured by the host application. Never construct it from user-supplied
headers, query params, or JSON.
"""
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Business, BusinessMembership, MembershipRole


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    """Identity claims returned by a verified authentication adapter."""

    subject: str


class AuthorizationError(PermissionError):
    """Raised when a verified principal lacks access to a business."""


def authorize_membership(
    session: Session,
    *,
    principal: AuthenticatedPrincipal,
    business_id: UUID,
    allowed_roles: set[MembershipRole] | None = None,
) -> BusinessMembership:
    """Load and enforce active business membership on the server.

    This function assumes principal.subject was verified upstream by the configured
    Firebase ID-token adapter. Callers should translate AuthorizationError to
    HTTP 403/404.
    """
    if not principal.subject.strip():
        raise AuthorizationError("Authenticated subject is missing")

    statement = (
        select(BusinessMembership)
        .join(Business, Business.id == BusinessMembership.business_id)
        .where(
            BusinessMembership.business_id == business_id,
            BusinessMembership.user_subject == principal.subject,
            Business.is_active.is_(True),
        )
    )
    membership = session.scalars(statement).one_or_none()
    if membership is None:
        raise AuthorizationError("No active membership for this business")
    if allowed_roles is not None and membership.role not in allowed_roles:
        raise AuthorizationError("Business role is not permitted for this operation")
    return membership
