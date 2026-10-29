# Notion source snapshot: ⚖️ 03 — Decisions

- Source: https://app.notion.com/p/407bbf2bc2c58175a3e4dd7118244f7e?pvs=204
- Page ID: 407bbf2b-c2c5-8175-a3e4-dd7118244f7e
- Last edited reported by Notion: 2026-10-28T22:16:51.672Z
- Captured: 2026-10-29
- Truncation metadata: {"truncated":null,"unknown_block_count":null,"unknown_block_ids":null}

> Archive snapshot for migration/recovery only. Notion remains the source for comments, relations, views, permissions, and live edits until the new workspace is reconciled. This is the connector's rendered page representation, not a native workspace export.

---

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/407bbf2bc2c58175a3e4dd7118244f7e as of 2026-10-28T22:16:51.727Z:
<page url="https://app.notion.com/p/407bbf2bc2c58175a3e4dd7118244f7e" icon="⚖️">
<ancestor-path>
<parent-page url="https://app.notion.com/p/407bbf2bc2c58133bebef9f60d0d6955" title="AI Business Assistant — Product Home"/>
<ancestor-2-page url="https://app.notion.com/p/3d1bbf2bc2c58117a48bdd16e06af822" title="Products"/>
</ancestor-path>
<properties>
{"title":"03 — Decisions"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"⚖️"}</iconMetadata>
<content>
## Decision rule

Keep product decisions in the canonical BRD/PRD decision area or a linked repository ADR when the decision affects implementation. This page is an index, not a second mutable decision log.

## Record each material decision with

- decision and date;
- owner / authority;
- alternatives considered;
- rationale and evidence;
- scope and affected features;
- security, money/data and migration impact;
- reversibility and rollback;
- exact implementation/PR/CI evidence when implemented;
- status: proposed, accepted, rejected, superseded.

## Cross-feature decision gate

Master owns decisions that change shared monetary semantics, invoice/payment contracts, inventory movements and costing, expenses/reporting definitions, payroll posting, authorization, tenant boundaries, migrations, or the implementation sequence. Feature owners can propose changes but must not independently establish competing shared truth.

Canonical product document: <mention url="https://app.notion.com/p/401bbf2bc2c581348ff3ed65b2367c1a" />.
</content>
</page>
