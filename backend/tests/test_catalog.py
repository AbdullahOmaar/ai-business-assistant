from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.catalog import (
    deactivate_customer, deactivate_product, deactivate_supplier,
    list_customers, list_products, list_suppliers,
)
from app.models import (
    AuditEvent, Base, Business, BusinessMembership, Customer, MembershipRole, Product, Supplier,
)
from app.security import AuthenticatedPrincipal, AuthorizationError
from app.services import WorkflowError, create_customer, create_product


@pytest.fixture()
def catalog_workspace():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        business = Business(name="Catalog Shop", currency_code="EGP")
        other_business = Business(name="Other Shop", currency_code="USD")
        session.add_all([business, other_business])
        session.flush()
        session.add(BusinessMembership(
            business_id=business.id, user_subject="catalog-user",
            role=MembershipRole.OWNER,
        ))
        session.commit()
        yield engine, business.id, other_business.id, AuthenticatedPrincipal(subject="catalog-user")
    engine.dispose()


def test_catalog_lists_search_with_business_scope_and_bounded_pagination(catalog_workspace):
    engine, business_id, other_business_id, principal = catalog_workspace
    with Session(engine) as session:
        create_customer(session, principal=principal, business_id=business_id, name="Ali Hassan", email="ali@example.com")
        create_customer(session, principal=principal, business_id=business_id, name="Mona Saleh")
        create_customer(session, principal=principal, business_id=other_business_id, name="Ali Other")
        create_product(session, principal=principal, business_id=business_id, name="Arabica", unit_price=Decimal("120"), sku="COF-1")
        session.add(Supplier(business_id=business_id, name="Local Beans", email="sales@beans.example"))
        session.flush()

        assert [c.name for c in list_customers(
            session, principal=principal, business_id=business_id, search="ali",
        )] == ["Ali Hassan"]
        assert [p.sku for p in list_products(
            session, principal=principal, business_id=business_id, search="COF",
        )] == ["COF-1"]
        assert [s.name for s in list_suppliers(
            session, principal=principal, business_id=business_id, search="beans",
        )] == ["Local Beans"]
        assert len(list_customers(
            session, principal=principal, business_id=business_id, limit=1, offset=1,
        )) == 1
        with pytest.raises(WorkflowError, match="between 1 and 100"):
            list_customers(session, principal=principal, business_id=business_id, limit=101)


def test_catalog_list_denies_cross_business_access(catalog_workspace):
    engine, _, other_business_id, principal = catalog_workspace
    with Session(engine) as session:
        with pytest.raises(AuthorizationError):
            list_customers(session, principal=principal, business_id=other_business_id)


def test_deactivation_is_scoped_audited_and_idempotent(catalog_workspace):
    engine, business_id, other_business_id, principal = catalog_workspace
    with Session(engine) as session:
        customer = create_customer(
            session, principal=principal, business_id=business_id, name="To deactivate",
        )
        product = create_product(
            session, principal=principal, business_id=business_id,
            name="Old product", unit_price=Decimal("5"),
        )
        supplier = Supplier(business_id=business_id, name="Old supplier")
        foreign_customer = Customer(business_id=other_business_id, name="Foreign")
        session.add_all([supplier, foreign_customer])
        session.flush()

        assert deactivate_customer(
            session, principal=principal, business_id=business_id, customer_id=customer.id,
        ).is_active is False
        deactivate_customer(session, principal=principal, business_id=business_id, customer_id=customer.id)
        assert deactivate_product(
            session, principal=principal, business_id=business_id, product_id=product.id,
        ).is_active is False
        assert deactivate_supplier(
            session, principal=principal, business_id=business_id, supplier_id=supplier.id,
        ).is_active is False
        with pytest.raises(WorkflowError, match="not found in this business"):
            deactivate_customer(
                session, principal=principal, business_id=business_id, customer_id=foreign_customer.id,
            )
        session.commit()
        assert len(session.scalars(select(AuditEvent).where(
            AuditEvent.action == "customer.deactivated",
            AuditEvent.target_id == str(customer.id),
        )).all()) == 1
        assert list_customers(session, principal=principal, business_id=business_id) == []
        assert list_customers(
            session, principal=principal, business_id=business_id, active_only=False,
        )[0].name == "To deactivate"
