from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base, Business, BusinessMembership, MembershipRole
from app.security import (
    AuthenticatedPrincipal,
    AuthorizationError,
    authorize_membership,
)


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        business = Business(name="Test shop", currency_code="EGP")
        db.add(business)
        db.flush()
        db.add(
            BusinessMembership(
                business_id=business.id,
                user_subject="verified-subject-1",
                role=MembershipRole.STAFF,
            )
        )
        db.commit()
        yield db, business.id
    engine.dispose()


def test_authorization_allows_member_of_requested_active_business(session) -> None:
    db, business_id = session
    membership = authorize_membership(
        db,
        principal=AuthenticatedPrincipal(subject="verified-subject-1"),
        business_id=business_id,
    )
    assert membership.role is MembershipRole.STAFF


def test_authorization_denies_cross_business_access(session) -> None:
    db, _ = session
    with pytest.raises(AuthorizationError, match="No active membership"):
        authorize_membership(
            db,
            principal=AuthenticatedPrincipal(subject="verified-subject-1"),
            business_id=uuid4(),
        )


def test_authorization_denies_role_escalation(session) -> None:
    db, business_id = session
    with pytest.raises(AuthorizationError, match="role is not permitted"):
        authorize_membership(
            db,
            principal=AuthenticatedPrincipal(subject="verified-subject-1"),
            business_id=business_id,
            allowed_roles={MembershipRole.OWNER},
        )


def test_authorization_denies_inactive_business(session) -> None:
    db, business_id = session
    business = db.get(Business, business_id)
    business.is_active = False
    db.commit()
    with pytest.raises(AuthorizationError, match="No active membership"):
        authorize_membership(
            db,
            principal=AuthenticatedPrincipal(subject="verified-subject-1"),
            business_id=business_id,
        )
