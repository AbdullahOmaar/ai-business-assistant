"""Verifiable full-business data export (B3, 3A-721).

«بياناتك ليك» — the owner can download EVERYTHING the business owns in
one JSON document, and can verify it: the manifest carries the row
count of every entity and a SHA-256 over the canonical form of the
data section, so a recipient can recompute both and prove nothing
was added or dropped after export.

Deliberately excluded (documented in docs/RETENTION_AND_DELETION.md):
the idempotency-key tables (operational internals holding no business
data beyond a key + a response snapshot reference), the demo
rate-limit counters (not business-scoped), and the platform tables
(role grants / platform audit — the platform's records, not the
business's data).
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    Business,
    BusinessInvitation,
    BusinessMembership,
    BusinessSetting,
    CreditNote,
    Customer,
    Employee,
    Expense,
    ImportJob,
    Invoice,
    InvoiceLine,
    Notification,
    Payment,
    PaymentAllocation,
    PayrollRecord,
    PricingRule,
    Product,
    PurchaseOrder,
    PurchaseOrderLine,
    RecurringInvoiceSchedule,
    SalesReturn,
    SalesReturnLine,
    StockMovement,
    Supplier,
)

# Entity name -> model. Every model here carries business_id (except
# Business itself, exported as the single "business" object).
EXPORT_ENTITIES: dict[str, type] = {
    "memberships": BusinessMembership,
    "invitations": BusinessInvitation,
    "settings": BusinessSetting,
    "customers": Customer,
    "suppliers": Supplier,
    "products": Product,
    "stock_movements": StockMovement,
    "invoices": Invoice,
    "invoice_lines": InvoiceLine,
    "payments": Payment,
    "payment_allocations": PaymentAllocation,
    "expenses": Expense,
    "purchase_orders": PurchaseOrder,
    "purchase_order_lines": PurchaseOrderLine,
    "sales_returns": SalesReturn,
    "sales_return_lines": SalesReturnLine,
    "credit_notes": CreditNote,
    "employees": Employee,
    "payroll_records": PayrollRecord,
    "recurring_schedules": RecurringInvoiceSchedule,
    "pricing_rules": PricingRule,
    "notifications": Notification,
    "audit_events": AuditEvent,
    "import_jobs": ImportJob,
}


def _json_value(value: object) -> object:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (bytes, bytearray)):
        return None
    return value


def _row(obj: object) -> dict[str, object]:
    return {
        column.name: _json_value(getattr(obj, column.name))
        for column in obj.__table__.columns
    }


def build_business_export(
    session: Session, business: Business, *, exported_by: str
) -> dict[str, object]:
    """Return the full export document (manifest + data) for a business."""
    data: dict[str, object] = {"business": _row(business)}
    counts: dict[str, int] = {}
    for name, model in EXPORT_ENTITIES.items():
        rows = session.scalars(
            select(model).where(model.business_id == business.id)
        ).all()
        serialized = [_row(row) for row in rows]
        data[name] = serialized
        counts[name] = len(serialized)
    canonical = json.dumps(
        data, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    manifest = {
        "format_version": 1,
        "business_id": str(business.id),
        "business_name": business.name,
        "exported_at": datetime.now(UTC).isoformat(),
        "exported_by": exported_by,
        "counts": counts,
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
    }
    return {"manifest": manifest, "data": data}
