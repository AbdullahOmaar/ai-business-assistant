"""Conversational setup (B7, 3A-725) — setting proposals from the assistant.

The assistant never applies a setting itself (B6: settings writes
are FORBIDDEN for the assistant). What it may do is PROPOSE: the
chat endpoint returns up to 3 validated setting suggestions, the
user sees a preview (old value -> new value), confirms, and applies
them through the existing owner-only PUT /settings/{key}. A
financial setting — anything whose value is a number that affects
money — is flagged requires_confirmation and must never change
without an explicit confirmation. That is the financial-numbers
guard, enforced here, not by the model's goodwill.

One-tap rollback: every proposal carries the previous value
(current_value, or None when the key does not exist yet). Restoring
a previous value is a PUT; removing a key a proposal created is the
DELETE /settings/{key} endpoint added in this task. The assistant
itself never calls either.
"""
from __future__ import annotations

import re

MAX_SUGGESTIONS = 3

# Key terms (compacted the same way _validated_setting_key does)
# whose presence marks a setting as financial. A financial setting's
# value is a number that affects money: tax, prices, discounts,
# currency, fees, commissions, salaries.
FINANCIAL_KEY_TERMS = (
    "tax", "vat", "rate", "price", "discount", "currency", "amount",
    "fee", "commission", "salary", "payroll", "charge", "cost",
)


def _compact(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def is_financial_setting(setting_key: str) -> bool:
    """True when the key names a financial number (the guard)."""
    compact = _compact(setting_key)
    return any(term in compact for term in FINANCIAL_KEY_TERMS)


def build_proposal(setting_key: str, setting_value: str,
                   current_value: str | None, reason: str) -> dict:
    """One validated setting proposal (preview + guard + rollback data).

    The key is validated with the same rule the PUT endpoint uses
    (identifier shape, no secret-like names); a bad key raises
    WorkflowError and the caller drops the suggestion.
    """
    from app.extended_api import _validated_setting_key

    safe_key = _validated_setting_key(setting_key)
    if not isinstance(setting_value, str) or not setting_value.strip():
        raise ValueError("A setting suggestion needs a non-empty string value.")
    if len(setting_value) > 1000:
        raise ValueError("A setting suggestion value is at most 1000 characters.")
    financial = is_financial_setting(safe_key)
    return {
        "setting_key": safe_key,
        "current_value": current_value,
        "proposed_value": setting_value.strip(),
        "is_financial": financial,
        "requires_confirmation": financial,
        "reason": (reason or "").strip()[:280],
    }


def validate_suggestions(raw: object, current_settings: dict[str, str]) -> list[dict]:
    """Validate the model's raw suggestions into at most 3 proposals.

    Drops anything malformed, any bad key, any duplicate key, and
    anything beyond the third proposal. A financial suggestion is
    kept — flagged requires_confirmation — never silently applied
    (application is the user's explicit act, through PUT).
    """
    if not isinstance(raw, list):
        return []
    proposals: list[dict] = []
    seen: set[str] = set()
    for item in raw:
        if len(proposals) >= MAX_SUGGESTIONS:
            break
        if not isinstance(item, dict):
            continue
        key = item.get("setting_key")
        value = item.get("setting_value")
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        try:
            proposal = build_proposal(
                key, value,
                current_settings.get(key.strip()),
                item.get("reason") if isinstance(item.get("reason"), str) else "",
            )
        except ValueError:
            # _validated_setting_key raises WorkflowError (a ValueError)
            # for secret-like or malformed keys; an empty or overlong
            # value raises ValueError. Either way the suggestion drops.
            continue
        if proposal["setting_key"] in seen:
            continue
        seen.add(proposal["setting_key"])
        proposals.append(proposal)
    return proposals
