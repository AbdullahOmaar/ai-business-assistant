# AI Business Assistant — Live Demo Runbook

**Live URL:** https://ai-business-assistant-web.vercel.app/demo/  
**Release:** Web 1.3.8 · API 1.3.5  
**Verified production Web SHA:** `65e431d8fa7e77aa136fca91f8cfba234c03ec08`  
**Deployment:** `dpl_8QKr85KdFWMUj6tV3tbF7piF2aPK` (Vercel READY)

## Purpose and safety boundary

This is a standalone, interactive feature preview. It uses fictional data stored only in the page's JavaScript memory. It does not call the ERP API or database, does not authenticate users, and does not persist changes. Do not enter real customer, employee, financial, or business data.

## Suggested 5-minute walkthrough

1. Open the live URL. Point out the banner explaining that this is not a production system and all data is fictional/local.
2. Switch between **مخبز النور** and **مكتبة المستقبل** to show isolated mock workspace fixtures. Use the customer search to filter the local sample names.
3. Add/remove invoice lines and change quantity. Explain that the displayed total is a client-side illustration, not a persisted invoice or server calculation.
4. Click **محاكاة استلام دفعة** to toggle the mock payment status. Explain that no payment record or allocation is created.
5. Change current stock and alert threshold, then use CSV preview to show validation. The preview does not import data; the CSV download exports fictional demo values only.
6. Show the invoice print preview. If the browser blocks the popup, allow popups for this site and retry. The printed page is explicitly not a tax invoice.
7. Show recurring invoice and supplier receipt previews, the mock role selector, backup JSON download, and the tax-policy notice.
8. Click **إعادة ضبط الديمو** to restore the initial sample state.

## Feature truth table

| Area | What is actually demonstrated | Not demonstrated |
|---|---|---|
| Workspaces / customers | Local fixture switching and filtering | Auth, tenant isolation, server reads |
| Invoices | Local line editing and arithmetic | Invoice persistence, server totals, issuance |
| Payments | Visual status toggle | Payment creation, allocation, reconciliation |
| Inventory | Local threshold alert | Stock ledger or stock movement |
| CSV | Validation preview and fictional export | Import job, database writes |
| AI | Static explanatory answer and source label | Model call, grounding or live ERP query |
| Roles | Visual selector | Permission enforcement |
| Purchasing / recurring | Static preview text | Supplier/order/schedule persistence |
| Tax | Explicitly disabled | Tax calculation or policy |
| PWA / health | Static explanatory status | Service-worker update or live monitoring |

## Release verification

- Web alias `https://ai-business-assistant-web.vercel.app`: production deployment READY on the SHA above.
- `/demo/`: HTTP 200 and readback verified.
- API alias `https://ai-business-assistant-api.vercel.app`: `/health` and `/readyz` HTTP 200; `/version` confirms 1.3.5.
- CircleCI: PR #340 exact head 7/7 PASS; post-merge main 7/7 PASS.

## What is required for a connected ERP demo

A separate isolated staging environment is required, with synthetic Owner and Staff accounts, two synthetic tenants, a documented reset/rollback procedure, and authenticated browser journeys. Production customer or payroll data must never be used. This runbook does not claim those prerequisites are complete.
