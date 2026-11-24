"""Audit-log anomaly detection (B5, 3A-723) — pure rules over AuditEvent rows.

The detector reads the audit trail the app already writes and flags
patterns a human should look at. It is a report, not a gate: it
never blocks a request and it never claims a finding is an attack.
Each finding carries the rule, the actor, the window, and the sample
events so a reviewer can verify it in one look.

What it CANNOT see (honest limit): denied requests write no
AuditEvent (the denial matrix proves it), so repeated denials are
invisible here — they live only in the platform security logs
(platform_admin_api._log_security_event). A burst of denials is a
finding for the platform log review, not for this detector.

Rules (thresholds are module constants so a review can tune them):
- R1 destructive burst: >=3 destructive actions by one actor in
  10 minutes (a deletion spree is never routine).
- R2 mass export: >=3 full exports by one actor in 60 minutes.
- R3 off-hours: any action outside 06:00-22:00 in the business's
  own timezone (falls back to UTC when unknown).
- R4 cross-business actor: one actor with actions in >=3
  businesses within 60 minutes (a business actor has no reason to
  act in three businesses at once).
- R5 settings churn: >=10 setting creates/updates by one actor in
  60 minutes.

Events are plain mappings with the AuditEvent fields
(action, actor_subject, business_id, target_type, target_id,
created_at); created_at may be naive (treated as UTC).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DESTRUCTIVE_ACTIONS = frozenset({
    "business.deleted",
    "account.deleted",
    "customer.deactivated",
    "product.deactivated",
    "invoice.voided",
    "purchase_order.cancelled",
    "membership.removed",
    "membership.invitation_revoked",
})
SETTING_ACTIONS = frozenset({"setting.created", "setting.updated"})
EXPORT_ACTION = "business.exported"

R1_BURST_COUNT = 3
R1_BURST_WINDOW = timedelta(minutes=10)
R2_EXPORT_COUNT = 3
R2_EXPORT_WINDOW = timedelta(hours=1)
R3_DAY_START = time(6, 0)
R3_DAY_END = time(22, 0)
R4_BUSINESS_COUNT = 3
R4_WINDOW = timedelta(hours=1)
R5_SETTING_COUNT = 10
R5_SETTING_WINDOW = timedelta(hours=1)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _event_fields(event: object) -> dict:
    if isinstance(event, dict):
        return event
    return {
        "action": event.action,
        "actor_subject": event.actor_subject,
        "business_id": event.business_id,
        "target_type": event.target_type,
        "target_id": event.target_id,
        "created_at": event.created_at,
    }


def _windows(
    rows: list[dict], *, window: timedelta
) -> list[tuple[datetime, datetime, list[dict]]]:
    """Sliding windows over time-sorted rows: every maximal run inside `window`."""
    ordered = sorted(rows, key=lambda row: _aware(row["created_at"]))
    found: list[tuple[datetime, datetime, list[dict]]] = []
    start = 0
    for end in range(len(ordered)):
        while _aware(ordered[end]["created_at"]) - _aware(ordered[start]["created_at"]) > window:
            start += 1
        found.append((
            _aware(ordered[start]["created_at"]),
            _aware(ordered[end]["created_at"]),
            ordered[start:end + 1],
        ))
    return found


def _finding(rule: str, actor: str, start: datetime, end: datetime,
             rows: list[dict]) -> dict:
    return {
        "rule": rule,
        "actor_subject": actor,
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "count": len(rows),
        "business_ids": sorted({str(row["business_id"]) for row in rows}),
        "sample_event_ids": [str(row.get("id")) for row in rows[:5]],
    }


def detect_anomalies(events, *, business_timezones: dict | None = None) -> list[dict]:
    """Run all rules over the given AuditEvent rows (or dicts)."""
    rows = [_event_fields(event) for event in events]
    findings: list[dict] = []
    timezones = business_timezones or {}

    by_actor: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_actor[row["actor_subject"]].append(row)

    for actor, actor_rows in by_actor.items():
        # R1 — destructive burst.
        destructive = [row for row in actor_rows if row["action"] in DESTRUCTIVE_ACTIONS]
        for start, end, window_rows in _windows(destructive, window=R1_BURST_WINDOW):
            if len(window_rows) >= R1_BURST_COUNT:
                findings.append(_finding("R1-destructive-burst", actor, start, end, window_rows))
                break
        # R2 — mass export.
        exports = [row for row in actor_rows if row["action"] == EXPORT_ACTION]
        for start, end, window_rows in _windows(exports, window=R2_EXPORT_WINDOW):
            if len(window_rows) >= R2_EXPORT_COUNT:
                findings.append(_finding("R2-mass-export", actor, start, end, window_rows))
                break
        # R5 — settings churn.
        settings = [row for row in actor_rows if row["action"] in SETTING_ACTIONS]
        for start, end, window_rows in _windows(settings, window=R5_SETTING_WINDOW):
            if len(window_rows) >= R5_SETTING_COUNT:
                findings.append(_finding("R5-settings-churn", actor, start, end, window_rows))
                break
        # R4 — one actor across many businesses.
        for start, end, window_rows in _windows(actor_rows, window=R4_WINDOW):
            businesses = {str(row["business_id"]) for row in window_rows}
            if len(businesses) >= R4_BUSINESS_COUNT:
                findings.append(_finding("R4-cross-business", actor, start, end, window_rows))
                break

    # R3 — off-hours (per event, using the business's own timezone).
    for row in rows:
        zone_name = timezones.get(str(row["business_id"]))
        try:
            zone = ZoneInfo(zone_name) if zone_name else ZoneInfo("UTC")
        except ZoneInfoNotFoundError:
            zone = ZoneInfo("UTC")
        local = _aware(row["created_at"]).astimezone(zone)
        if local.time() < R3_DAY_START or local.time() >= R3_DAY_END:
            findings.append(_finding(
                "R3-off-hours", row["actor_subject"],
                _aware(row["created_at"]), _aware(row["created_at"]), [row],
            ))

    findings.sort(key=lambda item: (item["rule"], item["actor_subject"], item["window_start"]))
    return findings
