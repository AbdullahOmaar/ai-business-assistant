"""Tests for the assistant write-governance policy (B6, 3A-724).

The policy is a closed list: the assistant may execute only the
actions named in it, with the caller's role, and the sensitive ones
only after a second owner approval. The tests prove the list maps
to real routes, the verdicts, and — the tripwire — that the
assistant router exposes write routes ONLY through the policy gate:
every non-chat route must delegate to ``app.assistant_execution``
(the only place ``verdict()`` is called for assistant writes), so
a direct-write endpoint added to this router fails the suite.
"""
from __future__ import annotations

from pathlib import Path

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


_CHAT_ROUTE = ("POST", "/api/v1/businesses/{business_id}/assistant/chat")

# Slice 1 execution routes — the complete set. A new route on this
# router fails the suite until it is added here AND proven policy-gated.
_EXECUTION_ROUTES = {
    ("POST", "/api/v1/businesses/{business_id}/assistant/proposals"),
    ("GET", "/api/v1/businesses/{business_id}/assistant/proposals/{proposal_id}"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/proposals/{proposal_id}/approve"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/proposals/{proposal_id}/execute"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/proposals/{proposal_id}/cancel"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/confirmation-opt-outs"),
    ("DELETE", "/api/v1/businesses/{business_id}/assistant/confirmation-opt-outs/{action}"),
    ("GET", "/api/v1/businesses/{business_id}/assistant/confirmation-opt-outs"),
}

# Slice 4 persistence routes — the complete set. These write NO
# business data (they bookkeep the chat itself: conversations and
# their messages), so they do not go through the policy gate; each
# handler must delegate to app.assistant_persistence instead, and a
# handler that writes business data directly still fails this test.
_PERSISTENCE_ROUTES = {
    ("GET", "/api/v1/businesses/{business_id}/assistant/conversations"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/conversations"),
    ("GET", "/api/v1/businesses/{business_id}/assistant/conversations/{conversation_id}"),
    ("POST", "/api/v1/businesses/{business_id}/assistant/conversations/{conversation_id}/messages"),
}

# Slice 4 morning brief — read-only, from real business records.
_BRIEF_ROUTES = {
    ("GET", "/api/v1/businesses/{business_id}/assistant/brief"),
}

# W-foundation (WhatsApp channel): the app-side linking surface.
# These routes live on their own router (app.whatsapp_api) and write
# NO business data — they bookkeep the channel's own links — so each
# handler must delegate to app.whatsapp_linking, the same named-set
# discipline as the Slice 4 persistence routes above.
_WHATSAPP_ROUTES = {
    ("POST", "/api/v1/businesses/{business_id}/assistant/whatsapp/link-codes"),
    ("GET", "/api/v1/businesses/{business_id}/assistant/whatsapp/links"),
    ("GET", "/api/v1/businesses/{business_id}/assistant/whatsapp/status"),
    ("DELETE", "/api/v1/businesses/{business_id}/assistant/whatsapp/links/{link_id}"),
}

# W-foundation: the provider webhook — public by design (providers
# cannot sign in), signature-verified and fail-closed in the
# handler, covered by test_whatsapp_channel.py. It is the channel's
# only public route; a second one fails this set.
_WHATSAPP_WEBHOOK_ROUTES = {
    ("POST", "/api/v1/assistant/whatsapp/webhook"),
}


def test_assistant_router_exposes_only_policy_gated_execution_routes() -> None:
    """Tripwire: the assistant router may expose write routes only
    through the policy gate. Every non-chat route must delegate to
    app.assistant_execution — the module that calls verdict() — so a
    handler that writes directly fails this test. The Slice 4
    persistence/brief routes are the named exception: they write no
    business data, and each must delegate to app.assistant_persistence
    or app.assistant_brief instead."""
    seen: set[tuple[str, str]] = set()
    for route in assistant_router.routes:
        for method in getattr(route, "methods", set()):
            seen.add((method, route.path))
    assert seen == {_CHAT_ROUTE} | _EXECUTION_ROUTES | _PERSISTENCE_ROUTES | _BRIEF_ROUTES, (
        f"unexpected assistant route set: {sorted(seen)}"
    )
    for route in assistant_router.routes:
        if route.path.endswith("/chat"):
            continue
        endpoint = route.endpoint
        assert {"execution", "persistence", "brief"} & set(endpoint.__code__.co_names), (
            f"{route.path} does not delegate to app.assistant_execution, "
            "app.assistant_persistence or app.assistant_brief — assistant "
            "writes must go through the policy gate"
        )


def test_whatsapp_routers_expose_only_the_named_foundation_routes() -> None:
    """W-foundation tripwire: the WhatsApp routers expose exactly the
    named route sets. The app-side handlers delegate to
    app.whatsapp_linking (channel bookkeeping only — no business
    writes, so no policy gate applies, exactly like the Slice 4
    persistence set); the webhook delegates inbound text to the
    existing chat pipeline in app.assistant_api instead of growing a
    parallel one."""
    from app.whatsapp_api import router as whatsapp_router
    from app.whatsapp_api import webhook_router

    seen: set[tuple[str, str]] = set()
    for route in whatsapp_router.routes:
        for method in getattr(route, "methods", set()):
            seen.add((method, route.path))
    assert seen == _WHATSAPP_ROUTES, f"unexpected whatsapp route set: {sorted(seen)}"
    for route in whatsapp_router.routes:
        assert "linking" in route.endpoint.__code__.co_names, (
            f"{route.path} does not delegate to app.whatsapp_linking"
        )

    seen_hook: set[tuple[str, str]] = set()
    for route in webhook_router.routes:
        for method in getattr(route, "methods", set()):
            seen_hook.add((method, route.path))
    assert seen_hook == _WHATSAPP_WEBHOOK_ROUTES, (
        f"unexpected whatsapp webhook route set: {sorted(seen_hook)}"
    )
    for route in webhook_router.routes:
        assert "assistant_api" in route.endpoint.__code__.co_names or (
            "_process_message" in route.endpoint.__code__.co_names
        ), f"{route.path} does not route inbound text into the existing chat pipeline"


def test_execution_module_gates_through_verdict() -> None:
    """The gate itself: both the proposal-creation role check and the
    execution check must call verdict(). Removing either fails here."""
    source = (Path(__file__).parent.parent / "app" / "assistant_execution.py").read_text()
    assert source.count("policy.verdict(") >= 2


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


def test_draft_invoice_edit_is_allowed_without_second_approval() -> None:
    """Formal B6 amendment (owner decision 2026-11-25, DESIGN.md §7.3):
    editing a DRAFT invoice joins the allowed list — same PATCH route,
    STAFF, no second approval. An issued invoice stays in the 19."""
    item = policy.verdict("invoice.update_draft", "STAFF")
    assert item.action == "invoice.update_draft"
    assert item.second_approval is False
    assert policy.requires_second_approval("invoice.update_draft") is False
    assert policy.requires_second_approval("invoice.update") is True
    with pytest.raises(policy.AssistantWriteNeedsApproval):
        policy.verdict("invoice.update", "OWNER")


if __name__ == "__main__":
    pytest.main([__file__])
