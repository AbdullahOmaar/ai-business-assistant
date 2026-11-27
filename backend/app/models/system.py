"""Database models: system domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Notification(Base):
    """Queued notification metadata; delivery provider and workers are separate."""

    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint("business_id", "deduplication_key", name="uq_notification_deduplication"),
        CheckConstraint("status IN ('pending', 'sent', 'failed', 'cancelled')",
                        name="ck_notification_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    deduplication_key: Mapped[str] = mapped_column(String(160), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AuditEvent(Base):
    """Business activity metadata; callers must redact secrets and sensitive values."""

    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    actor_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    change_summary: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ImportJob(Base):
    """CSV import/export job metadata; file processing is implemented separately."""

    __tablename__ = "data_jobs"
    __table_args__ = (
        CheckConstraint("job_type IN ('import', 'export')", name="ck_data_job_type"),
        CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')",
                        name="ck_data_job_status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    job_type: Mapped[str] = mapped_column(String(16), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    row_count: Mapped[int] = mapped_column(nullable=False, default=0)
    error_summary: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BusinessSetting(Base):
    """Typed setting key/value boundary; sensitive integration secrets do not belong here."""

    __tablename__ = "business_settings"
    __table_args__ = (
        UniqueConstraint("business_id", "setting_key", name="uq_business_setting_key"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    setting_key: Mapped[str] = mapped_column(String(100), nullable=False)
    setting_value: Mapped[str] = mapped_column(String(1000), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )



class DemoRateLimitCounter(Base):
    """Shared fixed-window counters for public demo rate limiting."""

    __tablename__ = "demo_rate_limit_counters"
    __table_args__ = (
        CheckConstraint(
            "request_count > 0",
            name="ck_demo_rate_limit_count_positive",
        ),
    )

    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True, nullable=False)
    window_start_epoch: Mapped[int] = mapped_column(BigInteger, nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )

