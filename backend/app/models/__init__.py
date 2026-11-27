"""SQLAlchemy models package (3A-921 B2).

Formerly a single app/models.py; the classes now live in per-domain
modules and are all re-exported here, so `from app.models import X`
works exactly as before and Alembic sees the same metadata.
"""
from app.models.assistant import (
    AssistantConfirmationOptOut,
    AssistantConversation,
    AssistantMessage,
    AssistantProposal,
    WhatsAppLink,
    WhatsAppLinkCode,
    WhatsAppMessage,
)
from app.models.base import Base, MembershipRole, membership_role_type
from app.models.catalog import (
    Product,
    StockMovement,
    StockMovementIdempotency,
    Supplier,
)
from app.models.finance import (
    CashboxClosing,
    CashboxEntry,
    Expense,
    PricingRule,
    PurchaseOrder,
    PurchaseOrderLine,
    PurchaseReceiptIdempotency,
    RecurringInvoiceSchedule,
)
from app.models.identity import (
    Business,
    BusinessInvitation,
    BusinessMembership,
    Department,
    PlatformAdminAuditEvent,
    PlatformRoleGrant,
    Team,
)
from app.models.people import (
    Employee,
    PayrollPayment,
    PayrollRecord,
)
from app.models.sales import (
    CreditNote,
    Customer,
    CustomerOrder,
    CustomerOrderLine,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    SalesReturn,
    SalesReturnLine,
)
from app.models.system import (
    AuditEvent,
    BusinessSetting,
    DemoRateLimitCounter,
    ImportJob,
    Notification,
)

__all__ = [
    "AssistantConfirmationOptOut",
    "AssistantConversation",
    "AssistantMessage",
    "AssistantProposal",
    "AuditEvent",
    "Base",
    "Business",
    "BusinessInvitation",
    "BusinessMembership",
    "BusinessSetting",
    "CashboxClosing",
    "CashboxEntry",
    "CreditNote",
    "Customer",
    "CustomerOrder",
    "CustomerOrderLine",
    "DemoRateLimitCounter",
    "Department",
    "Employee",
    "Expense",
    "ImportJob",
    "Invoice",
    "InvoiceLine",
    "MembershipRole",
    "Notification",
    "Payment",
    "PaymentAllocation",
    "PayrollPayment",
    "PayrollRecord",
    "PlatformAdminAuditEvent",
    "PlatformRoleGrant",
    "PricingRule",
    "Product",
    "PurchaseOrder",
    "PurchaseOrderLine",
    "PurchaseReceiptIdempotency",
    "RecurringInvoiceSchedule",
    "SalesReturn",
    "SalesReturnLine",
    "StockMovement",
    "StockMovementIdempotency",
    "Supplier",
    "Team",
    "WhatsAppLink",
    "WhatsAppLinkCode",
    "WhatsAppMessage",
    "membership_role_type",
]