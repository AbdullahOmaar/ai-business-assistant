# Notion source snapshot: 🛡️ 05 — Architecture / Security / Data

- Source: https://app.notion.com/p/407bbf2bc2c5812d8da4ff6398ead205?pvs=204
- Page ID: 407bbf2b-c2c5-812d-8da4-ff6398ead205
- Last edited reported by Notion: 2026-10-28T22:16:51.672Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/407bbf2bc2c5812d8da4ff6398ead205 as of 2026-10-28T22:16:51.781Z:
<page url="https://app.notion.com/p/407bbf2bc2c5812d8da4ff6398ead205" icon="🛡️">
<ancestor-path>
<parent-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-2-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"title":"05 — Architecture / Security / Data"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"🛡️"}</iconMetadata>
<content>
## Canonical architecture references

- Product/technical baseline and constraints: <mention url="https://app.notion.com/p/401bbf2bc2c581348ff3ed65b2367c1a" />
- Code, migrations, tests and implementation-coupled contracts: [GitHub repository](https://github.com/AbdullahOmaar/ai-business-assistant)
- Implementation queue and verified checkpoint: [TASKS.md](https://github.com/AbdullahOmaar/ai-business-assistant/blob/main/TASKS.md)

This section routes to canonical artifacts; it does not invent a second architecture specification. Record an architecture decision in the repository when it materially changes APIs, schema, migrations, data ownership or security.

## Non-negotiable safety properties

1. Server-side authentication and authorization on every business-scoped API.
2. Tenant/business isolation enforced server-side; never trust a client-supplied business ID or role.
3. Server-derived totals, payment state, inventory valuation, payroll amounts and report calculations.
4. Idempotency and auditable state transitions for money-moving and posting operations.
5. Input validation, safe failure behavior, rate/usage controls and secrets kept out of clients/logs.
6. Sensitive payroll and customer data restricted by role and excluded from test fixtures/logs unless safely synthetic.
7. Cross-feature changes use approved shared contracts and migration sequencing.
8. CI and security evidence must be linked to exact commits; a passing unrelated workflow is not sufficient.

## Review gate

For any critical workflow, verify permitted access, unauthorized access, cross-tenant access, invalid/duplicate requests, partial failure and retry behavior. Mark checks NOT RUN rather than implying they passed.
</content>
</page>
