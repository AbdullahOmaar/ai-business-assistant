from sqlalchemy import UniqueConstraint

from app.models import Base, Business, BusinessMembership, MembershipRole


def test_required_tenant_tables_are_declared() -> None:
    assert {"businesses", "business_memberships"} <= set(Base.metadata.tables)


def test_all_current_domain_tables_are_declared() -> None:
    expected = {
        "businesses", "business_memberships", "products", "stock_movements",
        "customers", "suppliers", "invoices", "invoice_lines", "payments",
        "payment_allocations", "expenses", "purchase_orders", "purchase_order_lines",
        "sales_returns", "sales_return_lines", "recurring_invoice_schedules",
        "pricing_rules", "notifications", "audit_events", "data_jobs",
        "business_settings",
    }
    assert expected <= set(Base.metadata.tables)


def test_membership_is_unique_per_business_and_identity() -> None:
    constraints = [
        c for c in BusinessMembership.__table__.constraints
        if isinstance(c, UniqueConstraint)
    ]
    assert any(
        tuple(column.name for column in c.columns) == ("business_id", "user_subject")
        for c in constraints
    )


def test_membership_roles_are_owner_and_staff() -> None:
    assert {role.value for role in MembershipRole} == {"owner", "staff"}


def test_business_name_is_required() -> None:
    assert Business.__table__.c.name.nullable is False
