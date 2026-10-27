import csv
import io
import json
import logging
from uuid import UUID

from sqlalchemy.orm import Session

from test_platform_admin_api import ADMIN_SUBJECT, OWNER_SUBJECT, platform_admin_environment
from app.models import AuditEvent


def test_platform_audit_export_is_bounded_redacted_and_logged(platform_admin_environment, caplog):
    client = platform_admin_environment["client"]
    business_id = UUID(platform_admin_environment["alpha_id"])
    action = chr(61) + "1+1"
    actor = chr(61) + "SUM(1,1)"
    target_type = chr(43) + "cmd"
    target_id = chr(64) + "SUM(1,1)"
    with Session(platform_admin_environment["engine"]) as session:
        session.add_all([
            AuditEvent(business_id=business_id, actor_subject=actor, action=action, target_type=target_type, target_id=target_id, change_summary="sensitive summary"),
            AuditEvent(business_id=business_id, actor_subject=OWNER_SUBJECT, action="invoice.paid", target_type="invoice", target_id="EGP-2", change_summary="another summary"),
        ])
        session.commit()

    with caplog.at_level(logging.INFO):
        response = client.get("/api/v1/platform-admin/audit-events/export.csv", params={"action": action, "limit": 5})
        bounded = client.get("/api/v1/platform-admin/audit-events/export.csv", params={"limit": 1})

    assert response.status_code == 200
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[1][1] == "'" + action
    assert rows[1][2] == "'" + actor
    assert rows[1][5] == "'" + target_type
    assert rows[1][6] == "'" + target_id
    assert "sensitive summary" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-export-truncated"] == "false"
    assert bounded.headers["x-export-row-count"] == "1"
    assert bounded.headers["x-export-truncated"] == "true"
    records = [json.loads(r.getMessage()) for r in caplog.records if r.getMessage().startswith("{")]
    assert any(r["event"] == "platform_admin.audit_exported" and r["actor_subject"] == ADMIN_SUBJECT for r in records)


def test_platform_audit_export_denies_non_admin(platform_admin_environment, monkeypatch):
    monkeypatch.setenv("PLATFORM_SUPER_ADMIN_UIDS", OWNER_SUBJECT)
    response = platform_admin_environment["client"].get("/api/v1/platform-admin/audit-events/export.csv")
    assert response.status_code == 403
