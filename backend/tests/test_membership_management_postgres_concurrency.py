"""PostgreSQL-only race regression for last-owner membership protection.

SQLite ignores SELECT ... FOR UPDATE, so this test deliberately requires the
disposable PostgreSQL service configured by CircleCI. It never creates schema
or connects to a production database.
"""
from concurrent.futures import ThreadPoolExecutor
import os
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.models import AuditEvent, Business, BusinessMembership, MembershipRole
from app.security import AuthenticatedPrincipal


@pytest.fixture()
def postgres_membership_client():
    database_url = os.getenv("TEST_DATABASE_URL", "")
    if (
        os.getenv("CI_ALLOW_DATABASE_SCHEMA_TESTS") != "true"
        or not database_url.startswith(("postgresql://", "postgresql+psycopg://"))
    ):
        pytest.skip("requires the disposable PostgreSQL test service")

    engine = create_engine(database_url, pool_size=5, max_overflow=2)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    previous_factory = getattr(app.state, "session_factory", None)
    previous_resolver = getattr(app.state, "principal_resolver", None)
    app.state.session_factory = factory
    app.state.principal_resolver = lambda request: AuthenticatedPrincipal("race-owner-a")
    business_id = None
    try:
        with factory() as session:
            business = Business(
                name=f"Owner race {uuid4()}",
                currency_code="EGP",
                locale="en",
                timezone="Africa/Cairo",
            )
            session.add(business)
            session.flush()
            business_id = business.id
            session.add_all([
                BusinessMembership(
                    business_id=business.id,
                    user_subject="race-owner-a",
                    role=MembershipRole.OWNER,
                ),
                BusinessMembership(
                    business_id=business.id,
                    user_subject="race-owner-b",
                    role=MembershipRole.OWNER,
                ),
            ])
            session.commit()
            owner_ids = {
                row.user_subject: str(row.id)
                for row in session.scalars(
                    select(BusinessMembership).where(
                        BusinessMembership.business_id == business.id
                    )
                ).all()
            }
        yield TestClient(app), str(business_id), owner_ids, factory
    finally:
        if business_id is not None:
            with factory() as session:
                session.query(AuditEvent).filter(
                    AuditEvent.business_id == business_id
                ).delete(synchronize_session=False)
                session.query(BusinessMembership).filter(
                    BusinessMembership.business_id == business_id
                ).delete(synchronize_session=False)
                session.query(Business).filter(Business.id == business_id).delete(
                    synchronize_session=False
                )
                session.commit()
        if previous_factory is None:
            if hasattr(app.state, "session_factory"):
                del app.state.session_factory
        else:
            app.state.session_factory = previous_factory
        if previous_resolver is None:
            if hasattr(app.state, "principal_resolver"):
                del app.state.principal_resolver
        else:
            app.state.principal_resolver = previous_resolver
        engine.dispose()


def test_concurrent_last_owner_demotion_and_removal_preserve_one_owner(
    postgres_membership_client,
):
    _client, business_id, owner_ids, factory = postgres_membership_client
    business_uuid = UUID(business_id)
    start = Barrier(2)

    def demote_owner_a():
        thread_client = TestClient(app)
        start.wait(timeout=10)
        return thread_client.patch(
                f"/api/v1/businesses/{business_id}/memberships/"
                f"{owner_ids['race-owner-a']}",
                json={"role": "staff"},
            )

    def remove_owner_b():
        thread_client = TestClient(app)
        start.wait(timeout=10)
        return thread_client.delete(
                f"/api/v1/businesses/{business_id}/memberships/"
                f"{owner_ids['race-owner-b']}"
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        demote_future = pool.submit(demote_owner_a)
        remove_future = pool.submit(remove_owner_b)
        demote_response = demote_future.result(timeout=30)
        remove_response = remove_future.result(timeout=30)

    assert demote_response.status_code in (200, 422), demote_response.text
    assert remove_response.status_code in (204, 422), remove_response.text
    assert sum(response.status_code in (200, 204) for response in (
        demote_response, remove_response
    )) == 1, "exactly one concurrent mutation may succeed"

    rejected_response = (
        remove_response if demote_response.status_code == 200 else demote_response
    )
    assert rejected_response.status_code == 422
    assert rejected_response.json()["detail"] == (
        "A workspace must retain at least one owner"
    ), "the losing mutation must be rejected specifically by the last-owner guard"

    with factory() as session:
        remaining_owners = session.scalar(
            select(func.count()).select_from(BusinessMembership).where(
                BusinessMembership.business_id == business_uuid,
                BusinessMembership.role == MembershipRole.OWNER,
            )
        )
        remaining_members = session.scalar(
            select(func.count()).select_from(BusinessMembership).where(
                BusinessMembership.business_id == business_uuid
            )
        )
        audit_count = session.scalar(
            select(func.count()).select_from(AuditEvent).where(
                AuditEvent.business_id == business_uuid,
                AuditEvent.action.in_([
                    "membership.role_changed", "membership.removed"
                ]),
            )
        )

    assert remaining_owners == 1
    expected_members = 2 if demote_response.status_code == 200 else 1
    assert remaining_members == expected_members
    assert audit_count == 1, "the successful mutation and its audit event must commit together"