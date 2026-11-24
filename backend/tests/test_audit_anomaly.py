"""Tests for the audit-log anomaly rules (B5, 3A-723).

The rules are pure functions over event dicts, so the tests build
synthetic rows directly — no database, no fixtures, deterministic
timestamps (the SQLite one-second resolution lesson does not apply
here because the rules use explicit datetimes).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest

from app.audit_anomaly import detect_anomalies


def _row(*, action: str, actor: str = "actor-1", business: str = "biz-1",
         minutes: int = 0, day: int = 1, hour: int = 12) -> dict:
    return {
        "id": uuid.uuid4(),
        "action": action,
        "actor_subject": actor,
        "business_id": business,
        "target_type": "business",
        "target_id": str(uuid.uuid4()),
        "created_at": datetime(2026, 11, day, hour, minutes, tzinfo=UTC),
    }


def test_no_events_no_findings() -> None:
    assert detect_anomalies([]) == []


def test_routine_events_no_findings() -> None:
    rows = [
        _row(action="invoice.created", minutes=0),
        _row(action="payment.recorded", minutes=5),
        _row(action="customer.created", minutes=30),
    ]
    assert detect_anomalies(rows) == []


def test_r1_destructive_burst() -> None:
    rows = [
        _row(action="customer.deactivated", minutes=0),
        _row(action="product.deactivated", minutes=4),
        _row(action="invoice.voided", minutes=8),
    ]
    findings = detect_anomalies(rows)
    assert [item["rule"] for item in findings] == ["R1-destructive-burst"]
    assert findings[0]["count"] == 3


def test_r1_spread_out_deletions_are_not_a_burst() -> None:
    rows = [
        _row(action="customer.deactivated", hour=12, minutes=0),
        _row(action="product.deactivated", hour=12, minutes=30),
        _row(action="invoice.voided", hour=13, minutes=0),
    ]
    assert detect_anomalies(rows) == []


def test_r2_mass_export() -> None:
    rows = [_row(action="business.exported", minutes=10 * i) for i in range(3)]
    findings = detect_anomalies(rows)
    assert [item["rule"] for item in findings] == ["R2-mass-export"]
    assert findings[0]["count"] == 3


def test_r3_off_hours_uses_business_timezone() -> None:
    # 02:00 in Cairo is off-hours; the same instant is 00:00 UTC.
    rows = [_row(action="invoice.created", hour=2, minutes=0)]
    findings = detect_anomalies(rows, business_timezones={"biz-1": "Africa/Cairo"})
    assert [item["rule"] for item in findings] == ["R3-off-hours"]


def test_r3_daytime_is_not_off_hours() -> None:
    rows = [_row(action="invoice.created", hour=14, minutes=0)]
    assert detect_anomalies(rows) == []


def test_r4_one_actor_in_three_businesses() -> None:
    rows = [
        _row(action="invoice.created", business="biz-1", minutes=0),
        _row(action="payment.recorded", business="biz-2", minutes=10),
        _row(action="expense.created", business="biz-3", minutes=20),
    ]
    findings = detect_anomalies(rows)
    assert [item["rule"] for item in findings] == ["R4-cross-business"]
    assert findings[0]["business_ids"] == ["biz-1", "biz-2", "biz-3"]


def test_r5_settings_churn() -> None:
    rows = [_row(action="setting.updated", minutes=5 * i) for i in range(10)]
    findings = detect_anomalies(rows)
    assert [item["rule"] for item in findings] == ["R5-settings-churn"]
    assert findings[0]["count"] == 10


def test_r5_nine_settings_is_not_churn() -> None:
    rows = [_row(action="setting.updated", minutes=5 * i) for i in range(9)]
    assert detect_anomalies(rows) == []


def test_findings_carry_actor_and_window() -> None:
    rows = [_row(action="business.exported", minutes=10 * i) for i in range(3)]
    finding = detect_anomalies(rows)[0]
    assert finding["actor_subject"] == "actor-1"
    assert finding["window_start"] == "2026-11-01T12:00:00+00:00"
    assert finding["window_end"] == "2026-11-01T12:20:00+00:00"
    assert len(finding["sample_event_ids"]) == 3


if __name__ == "__main__":
    pytest.main([__file__])
