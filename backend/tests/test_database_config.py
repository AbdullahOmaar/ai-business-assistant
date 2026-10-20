import pytest

from app.database import get_database_url
from app.models import BusinessMembership, MembershipRole, membership_role_type


def test_database_url_requires_explicit_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        get_database_url()


def test_database_url_must_be_postgresql(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./local.db")

    with pytest.raises(RuntimeError, match="must point to PostgreSQL"):
        get_database_url()


def test_database_url_accepts_psycopg_postgresql(monkeypatch: pytest.MonkeyPatch) -> None:
    url = "postgresql+psycopg://user:local-only@127.0.0.1:5432/business_db"
    monkeypatch.setenv("DATABASE_URL", url)

    assert get_database_url() == url


def test_membership_enum_persists_documented_values() -> None:
    assert membership_role_type.enums == ["owner", "staff"]
    assert MembershipRole.OWNER.value == "owner"
    assert MembershipRole.STAFF.value == "staff"


def test_membership_has_business_scoped_identity_uniqueness() -> None:
    constraints = list(BusinessMembership.__table__.constraints)
    assert any(
        getattr(constraint, "name", None) == "uq_business_user_subject"
        for constraint in constraints
    )


def test_business_workspace_has_profile_and_currency_fields() -> None:
    from app.models import Business

    columns = Business.__table__.c
    assert columns["name"].nullable is False
    assert columns["currency_code"].type.length == 3
    assert columns["locale"].nullable is False
    assert columns["timezone"].nullable is False
    assert columns["is_active"].nullable is False
    assert columns["contact_email"].nullable is True
