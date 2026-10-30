from decimal import Decimal
from uuid import UUID

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.extended_api import PricingRuleInput, list_pricing_rules, post_pricing_rule
from app.models import AuditEvent, Base, Business, BusinessMembership, MembershipRole, PricingRule
from app.security import AuthenticatedPrincipal, AuthorizationError


@pytest.fixture()
def pricing_workspaces():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Pricing Shop", currency_code="EGP")
        foreign = Business(name="Foreign Pricing Shop", currency_code="USD")
        session.add_all([business, foreign])
        session.flush()
        session.add_all([
            BusinessMembership(
                business_id=business.id, user_subject="pricing-owner",
                role=MembershipRole.OWNER,
            ),
            BusinessMembership(
                business_id=business.id, user_subject="pricing-staff",
                role=MembershipRole.STAFF,
            ),
            BusinessMembership(
                business_id=foreign.id, user_subject="pricing-owner",
                role=MembershipRole.OWNER,
            ),
        ])
        session.commit()
        yield engine, business.id, foreign.id
    engine.dispose()


def _create_rule(session, business_id, principal, *, name, rule_type, rate):
    return post_pricing_rule(
        business_id=business_id,
        body=PricingRuleInput(name=name, rule_type=rule_type, rate=Decimal(rate)),
        session=session,
        principal=principal,
    )


def test_pricing_rule_list_is_owner_only_and_has_no_read_side_effects(pricing_workspaces):
    engine, business_id, _ = pricing_workspaces
    owner = AuthenticatedPrincipal(subject="pricing-owner")
    staff = AuthenticatedPrincipal(subject="pricing-staff")
    with Session(engine) as session:
        _create_rule(session, business_id, owner, name="VAT", rule_type="tax", rate="14.0000")
        before_rules = session.scalar(select(func.count()).select_from(PricingRule))
        before_audits = session.scalar(select(func.count()).select_from(AuditEvent))
        with pytest.raises(HTTPException) as error:
            list_pricing_rules(
                business_id=business_id, session=session, principal=staff,
                limit=50, offset=0, rule_type=None, is_active=None,
            )
        assert error.value.status_code == 403
        assert 'role is not permitted' in error.value.detail.lower()
        assert session.scalar(select(func.count()).select_from(PricingRule)) == before_rules
        assert session.scalar(select(func.count()).select_from(AuditEvent)) == before_audits


def test_pricing_rule_list_filters_and_pagination_are_business_scoped(pricing_workspaces):
    engine, business_id, foreign_business_id = pricing_workspaces
    owner = AuthenticatedPrincipal(subject="pricing-owner")
    with Session(engine) as session:
        tax = _create_rule(session, business_id, owner, name="VAT", rule_type="tax", rate="14.0000")
        discount = _create_rule(session, business_id, owner, name="Promo", rule_type="discount", rate="5.0000")
        _create_rule(session, foreign_business_id, owner, name="Foreign VAT", rule_type="tax", rate="20.0000")
        discount_row = session.get(PricingRule, UUID(discount["id"]))
        discount_row.is_active = False
        session.commit()

        tax_page = list_pricing_rules(
            business_id=business_id, session=session, principal=owner,
            limit=1, offset=0, rule_type="tax", is_active=True,
        )
        inactive_page = list_pricing_rules(
            business_id=business_id, session=session, principal=owner,
            limit=50, offset=0, rule_type="discount", is_active=False,
        )
        next_page = list_pricing_rules(
            business_id=business_id, session=session, principal=owner,
            limit=1, offset=1, rule_type=None, is_active=None,
        )

        assert tax_page["limit"] == 1 and tax_page["offset"] == 0
        assert [item["id"] for item in tax_page["items"]] == [tax["id"]]
        assert [item["id"] for item in inactive_page["items"]] == [discount["id"]]
        assert len(next_page["items"]) == 1
        assert all(item["business_id"] == str(business_id) for item in next_page["items"])
        assert all(item["name"] != "Foreign VAT" for item in next_page["items"])
