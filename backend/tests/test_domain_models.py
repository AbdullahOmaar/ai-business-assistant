from sqlalchemy import Numeric

from app.models import (
    AuditEvent,
    BusinessSetting,
    Customer,
    Expense,
    ImportJob,
    Invoice,
    InvoiceLine,
    Notification,
    Payment,
    PaymentAllocation,
    PricingRule,
    PurchaseOrder,
    PurchaseOrderLine,
    RecurringInvoiceSchedule,
    SalesReturn,
    SalesReturnLine,
    Supplier,
)


def test_all_planned_domain_areas_have_schema_models() -> None:
    assert {
        "customers", "suppliers", "invoices", "invoice_lines", "payments",
        "payment_allocations", "expenses", "purchase_orders", "purchase_order_lines",
        "sales_returns", "sales_return_lines", "recurring_invoice_schedules",
        "pricing_rules", "notifications", "audit_events", "data_jobs",
        "business_settings",
    } <= set(Invoice.metadata.tables)


def test_financial_amounts_use_numeric_decimal_storage() -> None:
    for model, column_name in [
        (Invoice, "total"),
        (InvoiceLine, "unit_price"),
        (Payment, "amount"),
        (PaymentAllocation, "amount"),
        (Expense, "amount"),
        (PurchaseOrder, "total"),
        (PurchaseOrderLine, "unit_cost"),
        (SalesReturn, "total"),
        (SalesReturnLine, "amount"),
    ]:
        column_type = model.__table__.c[column_name].type
        assert isinstance(column_type, Numeric), (model.__name__, column_name)
        assert column_type.scale == 2


def test_payment_has_idempotency_key_unique_per_business() -> None:
    assert any(
        getattr(constraint, "name", None) == "uq_payment_idempotency_key"
        for constraint in Payment.__table__.constraints
    )


def test_invoice_lines_cannot_reference_another_business_invoice() -> None:
    assert any(
        constraint.name == "fk_invoice_lines_invoice_business"
        and {element.parent.name for element in constraint.elements}
        == {"invoice_id", "business_id"}
        for constraint in InvoiceLine.__table__.foreign_key_constraints
    )


def test_allocations_are_scoped_to_same_business_invoice_and_payment() -> None:
    names = {constraint.name for constraint in PaymentAllocation.__table__.foreign_key_constraints}
    assert "fk_payment_allocations_payment_business" in names
    assert "fk_payment_allocations_invoice_business" in names


def test_return_lines_reference_original_invoice_lines_in_same_business() -> None:
    assert any(
        constraint.name == "fk_sales_return_lines_invoice_line_business"
        for constraint in SalesReturnLine.__table__.foreign_key_constraints
    )


def test_notification_deduplication_and_business_settings_uniqueness() -> None:
    assert any(
        getattr(constraint, "name", None) == "uq_notification_deduplication"
        for constraint in Notification.__table__.constraints
    )
    assert any(
        getattr(constraint, "name", None) == "uq_business_setting_key"
        for constraint in BusinessSetting.__table__.constraints
    )


def test_audit_events_are_business_scoped() -> None:
    assert AuditEvent.__table__.c.business_id.nullable is False
    assert Customer.__table__.c.business_id.nullable is False
    assert Supplier.__table__.c.business_id.nullable is False
    assert PricingRule.__table__.c.business_id.nullable is False
    assert ImportJob.__table__.c.business_id.nullable is False
    assert RecurringInvoiceSchedule.__table__.c.business_id.nullable is False
