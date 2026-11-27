"""Database models: identity domain (3A-921 B2).

Extracted verbatim from the former app/models.py; the classes
register on the same Base metadata, and app.models re-exports
every name so no import site changes.
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, MembershipRole, membership_role_type


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
    # Soft-deletion marker (B3, 3A-721): set together with is_active=False
    # by DELETE /businesses/{id}; the retention window for the purge is
    # measured from this timestamp. NULL while the business is live.
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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
    # Org assignment (C8): nullable — a member with no assignment is unassigned.
    department_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    team_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("teams.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    business: Mapped[Business] = relationship(back_populates="memberships")


class BusinessInvitation(Base):
    """Single-use, email-bound invitation to join one workspace as STAFF."""

    __tablename__ = "business_invitations"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_business_invitation_token_hash"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'revoked', 'expired')",
            name="ck_business_invitation_status",
        ),
        Index("ix_business_invitations_business_status", "business_id", "status"),
        Index("ix_business_invitations_business_email", "business_id", "target_email"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    target_email: Mapped[str] = mapped_column(String(254), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    invited_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Department(Base):
    """Business-scoped org unit (C8). Departments may nest via parent_id."""

    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("business_id", "name", name="uq_departments_business_name"),
        Index("ix_departments_business_parent", "business_id", "parent_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class Team(Base):
    """Business-scoped team inside exactly one department (C8)."""

    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint(
            "business_id", "department_id", "name",
            name="uq_teams_business_department_name",
        ),
        Index("ix_teams_business_department", "business_id", "department_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    business_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    department_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class PlatformRoleGrant(Base):
    """A delegated platform role assigned by a bootstrap super administrator.

    Root/super-admin membership remains an out-of-band deployment setting and
    cannot be represented or granted through this table.
    """

    __tablename__ = "platform_role_grants"
    __table_args__ = (
        UniqueConstraint("user_subject", "role", name="uq_platform_role_user_role"),
        CheckConstraint(
            "role IN ('platform_viewer', 'workspace_operator', 'user_manager')",
            name="ck_platform_role_grants_allowed_role",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_subject: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    granted_by_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_by_subject: Mapped[str | None] = mapped_column(String(128), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reason: Mapped[str] = mapped_column(String(500), nullable=False)


class PlatformAdminAuditEvent(Base):
    """Append-only audit evidence for platform role grants and revocations."""

    __tablename__ = "platform_admin_audit_events"
    __table_args__ = (Index("ix_platform_admin_audit_events_created_at", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_subject: Mapped[str] = mapped_column(String(128), nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )



