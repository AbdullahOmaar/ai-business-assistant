"""Authorization primitives for identities verified by a trusted authentication adapter.

Only the configured Firebase token verifier should construct authenticated principals.
Never construct a principal from user-supplied headers, query parameters, or JSON.
"""
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Business, BusinessMembership, Expense, MembershipRole, PayrollRecord


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
    Firebase ID-token resolver. Callers should translate AuthorizationError to
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



def apply_expense_visibility(statement, *, business_id: UUID, role: MembershipRole):
    """Hide payroll-linked expenses from non-OWNER members across all read surfaces.

    PayrollRecord.expense_id is the authoritative link; mutable category,
    description, vendor or reference text is deliberately not a privacy boundary.
    The business predicate keeps one tenant's payroll links from affecting another.
    """
    if role == MembershipRole.OWNER:
        return statement
    payroll_expense_ids = select(PayrollRecord.expense_id).where(
        PayrollRecord.business_id == business_id,
        PayrollRecord.expense_id.is_not(None),
    )
    return statement.where(~Expense.id.in_(payroll_expense_ids))
