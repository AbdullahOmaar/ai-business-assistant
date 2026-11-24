"""Tests for conversational setup (B7, 3A-725): setting proposals
and the financial-numbers guard.

The proposal module is pure: it validates keys with the same rule
the PUT endpoint uses, flags financial settings as requiring
confirmation, and caps the list at 3. It never applies anything.
"""
from __future__ import annotations

import pytest

from app.assistant_settings import (
    MAX_SUGGESTIONS,
    build_proposal,
    is_financial_setting,
    validate_suggestions,
)
from app.services import WorkflowError


def test_financial_keys_are_flagged() -> None:
    for key in ("tax_rate", "default_currency", "discount_percent", "delivery_fee",
                "price_markup", "vat_percentage", "commission_rate"):
        assert is_financial_setting(key), key
    for key in ("locale", "invoice_prefix", "business_hours", "reminder_days"):
        assert not is_financial_setting(key), key


def test_proposal_carries_preview_guard_and_rollback() -> None:
    proposal = build_proposal("locale", "ar", "en", "Switch the workspace language.")
    assert proposal == {
        "setting_key": "locale",
        "current_value": "en",
        "proposed_value": "ar",
        "is_financial": False,
        "requires_confirmation": False,
        "reason": "Switch the workspace language.",
    }


def test_financial_proposal_requires_confirmation() -> None:
    proposal = build_proposal("tax_rate", "14", "5", "Raise the tax rate.")
    assert proposal["is_financial"] is True
    assert proposal["requires_confirmation"] is True
    assert proposal["current_value"] == "5"


def test_new_key_proposal_has_no_previous_value() -> None:
    proposal = build_proposal("invoice_prefix", "INV-", None, "Add an invoice prefix.")
    assert proposal["current_value"] is None


def test_secret_like_key_is_rejected() -> None:
    with pytest.raises(WorkflowError):
        build_proposal("api_token", "x", None, "Store a token.")


def test_empty_value_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_proposal("locale", "   ", None, "Empty.")


def test_validate_suggestions_caps_at_three_and_drops_bad_keys() -> None:
    raw = [
        {"setting_key": "locale", "setting_value": "ar", "reason": "Language."},
        {"setting_key": "api_token", "setting_value": "x", "reason": "Secret — dropped."},
        {"setting_key": "invoice_prefix", "setting_value": "INV-", "reason": "Prefix."},
        {"setting_key": "locale", "setting_value": "en", "reason": "Duplicate — dropped."},
        {"setting_key": "reminder_days", "setting_value": "3", "reason": "Reminders."},
        {"setting_key": "business_hours", "setting_value": "9-5", "reason": "Extra — beyond the cap."},
    ]
    proposals = validate_suggestions(raw, {"locale": "en"})
    assert [item["setting_key"] for item in proposals] == [
        "locale", "invoice_prefix", "reminder_days",
    ]
    assert len(proposals) == MAX_SUGGESTIONS
    assert proposals[0]["current_value"] == "en"


def test_validate_suggestions_rejects_non_list() -> None:
    assert validate_suggestions("not a list", {}) == []
    assert validate_suggestions(None, {}) == []


if __name__ == "__main__":
    pytest.main([__file__])
