# Product Scope — V0

## Product goal
Build a secure, practical AI business assistant for small retail shops and service providers. The product should turn day-to-day business records into understandable operational and financial visibility, without pretending to be a full accounting or tax system.

## V0 users and access
- **Owner:** configures the business and controls business data and staff access.
- **Staff:** can work with customers, view relevant products/services, create invoices, and record payments only within explicitly authorized business data.
- An account may belong to multiple businesses. Every business's records must remain isolated from every other business.

## V0 capabilities
1. Authentication and business setup, including the business's chosen currency.
2. Customer management.
3. Retail products or service catalog.
4. Invoices with line items, totals, statuses, and a traceable lifecycle.
5. Payment records and payment history.
6. Expense records.
7. Dashboard and basic reports.
8. Low-stock alerts when inventory tracking is enabled.
9. Basic AI chat/insights only after the underlying records and calculations are trustworthy.

## Financial definitions
- **Sales/invoiced:** value of issued invoices, reported separately from cash collected.
- **Collected:** payments actually recorded against invoices.
- **Outstanding:** unpaid invoice balance; must not be presented as cash received.
- **Estimated profit:** use recorded revenue and defensible cost data (product cost/COGS or recorded direct service costs) and recorded expenses. Clearly disclose missing cost data and estimation limits.
- Avoid double-counting inventory costs and expenses.
- Never add or compare amounts from different currencies without an explicit, documented conversion policy. V0 should not silently convert currencies.

## Trust, audit, and AI boundaries
- Important changes to invoices, prices, inventory, and financial records require explicit human confirmation when initiated by AI.
- AI-created content should be a reviewable draft; never silently issue an invoice or mutate a financial record.
- Issued invoices must not be silently overwritten. Corrections/cancellations need an auditable action and a reason.
- Keep an audit trail for important changes, including actor and whether AI was involved.
- AI responses should distinguish recorded facts from estimates, assumptions, and missing data.

## Out of scope for V0
- Voice interfaces and autonomous agents.
- Complex accounting, tax filing, or claims of regulatory compliance.
- Automatic foreign-exchange conversion.
- Advanced inventory forecasting.
- Complex permission matrices.
- Unreviewed AI execution of consequential actions.

## Suggested delivery sequence
1. Confirm architecture and security model.
2. Establish project structure, quality checks, and documentation.
3. Authentication, business membership, and isolation.
4. Customers and products/services.
5. Invoices and payments.
6. Expenses and reliable dashboard/report calculations.
7. AI insights with human approval and audit coverage.

## Acceptance principles
- Business data access is denied by default and enforced server-side/security rules, not only by UI hiding.
- Cross-business access tests prove isolation.
- Financial totals are reproducible from recorded source records.
- Currency is explicit on every monetary record and reports do not mix currencies.
- High-impact actions are traceable and AI never bypasses human approval.
