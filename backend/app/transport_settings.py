"""Transport/delivery capability settings (3A-920, foundation).

The master switch + transport unit name are plain BusinessSetting rows,
written through the existing owner-only PUT /settings/{key} endpoint —
the same pattern as the WhatsApp kill switch (whatsapp_linking.py:
CHANNEL_ENABLED_KEY + channel_enabled). This module owns only the
reads + the key/default contract; it never writes settings.

Rules (owner amendments 2026-11-27, registered on 3A-920):
- DEFAULT OFF: only an explicit true value enables transport. A
  business that never configured transport sees zero effect — no
  transport block in invoices, no per-trip wage basis, no driver tag.
- The unit NAME is company data (e.g. "نقلة" or "توصيلة"), editable
  anytime in-app; nothing about it is a code constant. The display
  default below applies only when the company never set a name.
- Turning the switch off after use is safe by construction: rows stay
  stored (this module only reads), past payroll stays as recorded,
  and re-enabling restores everything.

This module also owns the daily-wage divisor read (3A-920 step 2,
manager ruling 2026-11-27): daily pay = monthly salary / divisor,
where the divisor is a per-business setting (default 30) — dynamic
like the rest of the package. Only payroll CREATION reads it: a
stored payroll record keeps the base it was created with, so
changing the divisor never rewrites an existing period.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BusinessSetting

# Configuration keys (BusinessSetting rows, per business).
TRANSPORT_ENABLED_KEY = "transport.enabled"
TRANSPORT_UNIT_NAME_KEY = "transport.unit_name"
DAILY_DIVISOR_KEY = "payroll.daily_divisor"

# Daily-wage divisor (manager ruling 2026-11-27): the default rule is
# monthly / 30; the company may set its own day count (e.g. 26 working
# days). Out-of-range or unparsable stored values fall back to the
# default rather than breaking payroll.
DEFAULT_DAILY_DIVISOR = 30
MIN_DAILY_DIVISOR = 1
MAX_DAILY_DIVISOR = 31

# Display default for the unit name when the company never set one.
# A general word (a delivery/trip), not a trade name — the company
# replaces it with its own unit ("نقلة", "توصيلة", ...) in settings.
DEFAULT_TRANSPORT_UNIT_NAME = "توصيلة"

# A unit name is a short label shown in invoices, products and
# payroll; longer stored values fall back to the default rather than
# stretching the UI (the PUT endpoint itself caps values at 1000).
MAX_TRANSPORT_UNIT_NAME_LENGTH = 40

_TRUE_VALUES = ("true", "1", "yes", "on")


def _setting(session: Session, *, business_id: UUID, key: str) -> str | None:
    return session.scalar(
        select(BusinessSetting.setting_value).where(
            BusinessSetting.business_id == business_id,
            BusinessSetting.setting_key == key,
        )
    )


def transport_enabled(session: Session, *, business_id: UUID) -> bool:
    """The per-business master switch. DEFAULT OFF: only an explicit
    true value enables the transport capability."""
    value = _setting(session, business_id=business_id, key=TRANSPORT_ENABLED_KEY)
    return (value or "").strip().lower() in _TRUE_VALUES


def transport_unit_name(session: Session, *, business_id: UUID) -> str:
    """The company's own transport unit name ("نقلة", "توصيلة", ...),
    or the display default when none was ever set (blank or too long
    values also fall back — a label, never a business rule)."""
    value = (_setting(session, business_id=business_id, key=TRANSPORT_UNIT_NAME_KEY) or "").strip()
    if not value or len(value) > MAX_TRANSPORT_UNIT_NAME_LENGTH:
        return DEFAULT_TRANSPORT_UNIT_NAME
    return value


def transport_settings(session: Session, *, business_id: UUID) -> dict:
    """Both transport settings in one read (the shape the settings
    surfaces use: enabled + the unit name to dress the UI with)."""
    return {
        "enabled": transport_enabled(session, business_id=business_id),
        "unit_name": transport_unit_name(session, business_id=business_id),
    }


def daily_divisor(session: Session, *, business_id: UUID) -> int:
    """The company's daily-wage divisor: daily pay = monthly salary /
    this count. DEFAULT 30 (the manager's ruling); a stored value is
    honored only as a whole number in [1, 31] — anything else falls
    back to the default, so a bad row can never break payroll."""
    raw = (_setting(session, business_id=business_id, key=DAILY_DIVISOR_KEY) or "").strip()
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_DAILY_DIVISOR
    if not MIN_DAILY_DIVISOR <= value <= MAX_DAILY_DIVISOR:
        return DEFAULT_DAILY_DIVISOR
    return value
