"""Declarative base and shared types for the models package (3A-921 B2)."""
from enum import Enum

from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.orm import DeclarativeBase


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

