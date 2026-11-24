"""Tests for the assistant write-governance policy (B6, 3A-724).

The policy is a closed list: the assistant may execute only the
actions named in it, with the caller's role, and the sensitive ones
only after a second owner approval. The tests prove the list maps
to real routes, the verdicts, and — the tripwire — that the
assistant router today exposes no write route at all, so any future
execution path must go through this policy or fail the suite.
"""
from __future__ import annotations

import pytest

from app import assistant_write_policy as policy
from app.assistant_api import router as assistant_router
from app.main import app


def _route_table() -> set[tuple[str, str]]:
    """Every (method, path) the app serves, unwrapping the lazy
    _IncludedRouter objects the app uses for its feature routers."""
    routes: set[tuple[str, str]] = set()

    def collect(route: object) -> None:
        original = getattr(route, "original_router", None)
        if original is not None:
            for nested in original.routes:
                collect(nested)
            return
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if path and methods:
            for method in methods:
                routes.add((method, path))

    for route in app.routes:
        collect(route)
    return routes


def test_every_policy_action_maps_to_a_real_route() -> None:
    routes = _route_table()
    for item in policy.ASSISTANT_WRITABLE + policy.NEEDS_SECOND_APPROVAL:
        assert (item.method, item.route) in routes, f"policy action {item.action} has no route"


def test_closed_list_has_no_duplicates_or_overlap() -> None:
    actions = [item.action for item in policy.ASSISTANT_WRITABLE]
    approval = [item.action for item in policy.NEEDS_SECOND_APPROVAL]
    assert len(actions) == len(set(actions))
    assert len(approval) == len(set(approval))
    assert not (set(actions) & set(approval))


def test_assistant_router_exposes_no_write_route() -> None:
    """Tripwire: the assistant answers questions only. If a future
    execution endpoint is added to this router, this test fails until
    the endpoint is routed through the write policy."""
    routes = list(assistant_router.routes)
    assert len(routes) == 1
    methods = getattr(routes[0], "methods", set())
    path = getattr(routes[0], "path", "")
    assert path == "/api/v1/businesses/{business_id}/assistant/chat" and methods == {"POST"}, (
        f"unexpected assistant route: {methods} {path}"
    )


def test_allowed_action_passes_for_staff() -> None:
    item = policy.verdict("customer.create", "STAFF")
    assert item.action == "customer.create"
    assert item.second_approval is False


def test_owner_only_action_denied_for_staff() -> None:
    with pytest.raises(policy.AssistantWriteRoleDenied):
        policy.verdict("invoice.issue", "STAFF", second_approved=True)


def test_needs_approval_action_requires_second_approval() -> None:
    with pytest.raises(policy.AssistantWriteNeedsApproval):
        policy.verdict("payment.record", "OWNER")
    item = policy.verdict("payment.record", "OWNER", second_approved=True)
    assert item.action == "payment.record"


def test_forbidden_actions_are_closed_by_default() -> None:
    for action in (
        "business.delete",
        "account.delete",
        "customer.delete",
        "product.delete",
        "setting.update",
        "membership.remove",
        "membership.role_change",
        "platform.business.status",
        "employee.create",
        "invoice.delete",
        "unknown.action",
    ):
        assert policy.is_forbidden(action)
        with pytest.raises(policy.AssistantWriteForbidden):
            policy.verdict(action, "OWNER", second_approved=True)


def test_requires_second_approval_classification() -> None:
    assert policy.requires_second_approval("invoice.issue") is True
    assert policy.requires_second_approval("customer.create") is False
    assert policy.requires_second_approval("business.delete") is False


if __name__ == "__main__":
    pytest.main([__file__])
