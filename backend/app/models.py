"""Initial SQLAlchemy models for business workspaces and memberships.

The schema is groundwork only; authentication and request-level tenant
authorization must be implemented before business-data endpoints are exposed.
"""
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for application database models."""


class MembershipRole(str, Enum):
    OWNER = "owner"
    STAFF = "staff"


membership_role_type = SqlEnum(
    MembershipRole,
    name="business_membership_role",
    values_callable=lambda enum_type: [member.value for member in enum_type],
)


class Business(Base):
    """Business workspace and configurable profile."""

    __tablename__ = "businesses"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    contact_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    memberships: Mapped[list["BusinessMembership"]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )


class BusinessMembership(Base):
    """Membership between an external identity and a business workspace."""

    __tablename__ = "business_memberships"
    __table_args__ = (
        UniqueConstraint("business_id", "user_subject", name="uq_business_user_subject"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    # Provider-neutral external identity reference; never a password.
    # The identity provider and token-verification design remain separate decisions.
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(membership_role_type, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    business: Mapped[Business] = relationship(back_populates="memberships")
