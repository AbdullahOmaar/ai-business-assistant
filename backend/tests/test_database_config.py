import pytest
from sqlalchemy import Numeric

from app.database import get_database_url
from app.models import (
    BusinessMembership,
    MembershipRole,
    Product,
    StockMovement,
    membership_role_type,
)


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


def test_product_price_uses_exact_decimal_and_rejects_negative_values() -> None:
    columns = Product.__table__.c
    price_type = columns["unit_price"].type
    assert isinstance(price_type, Numeric)
    assert price_type.precision == 14
    assert price_type.scale == 2
    assert any(
        getattr(constraint, "name", None) == "ck_products_unit_price_nonnegative"
        for constraint in Product.__table__.constraints
    )


def test_product_sku_is_unique_within_a_business() -> None:
    constraints = list(Product.__table__.constraints)
    assert any(
        getattr(constraint, "name", None) == "uq_products_business_sku"
        for constraint in constraints
    )


def test_stock_quantity_uses_decimal_precision_and_nonzero_check() -> None:
    columns = StockMovement.__table__.c
    quantity_type = columns["quantity_delta"].type
    assert isinstance(quantity_type, Numeric)
    assert quantity_type.precision == 14
    assert quantity_type.scale == 3
    assert any(
        getattr(constraint, "name", None) == "ck_stock_movements_nonzero_quantity"
        for constraint in StockMovement.__table__.constraints
    )


def test_stock_movement_product_reference_is_business_scoped() -> None:
    foreign_keys = list(StockMovement.__table__.foreign_key_constraints)
    assert any(
        constraint.name == "fk_stock_movements_product_business"
        and {element.parent.name for element in constraint.elements}
        == {"product_id", "business_id"}
        and {element.target_fullname for element in constraint.elements}
        == {"products.id", "products.business_id"}
        for constraint in foreign_keys
    )


def test_stock_movement_types_are_limited_to_documented_values() -> None:
    assert any(
        getattr(constraint, "name", None) == "ck_stock_movements_type"
        for constraint in StockMovement.__table__.constraints
    )
