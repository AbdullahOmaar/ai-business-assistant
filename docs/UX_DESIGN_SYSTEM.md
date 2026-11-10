# AIBA Design System

**Status:** Owner-directed visual direction for the Web UI, 11 November 2026  
**Scope:** Presentation layer only. This document does not change API contracts, authorization, tenant rules, financial semantics, stock behavior, or persistence.

## 1. Visual direction

AIBA uses an **Arabic-first, modern business workspace** visual language:

- Calm light workspace surfaces framed by a deep navy navigation system.
- Teal is the primary action and active-state color; blue is reserved for focus and neutral informational feedback.
- Dense business information is grouped into clear cards and compact, readable tables rather than decorative dashboards.
- RTL and LTR share the same components. Layout uses logical CSS properties so direction changes do not require duplicate styles.
- Inter / system UI is the Latin stack; Arabic uses the system Arabic fallback. There is no remote font dependency.

## 2. Color foundations

| Role | Value | Usage |
|---|---|---|
| Brand | `#0F766E` | Primary actions, active emphasis |
| Brand strong | `#115E59` | Hover and high-emphasis text |
| Brand bright | `#0D9488` | Restrained brand gradient highlight |
| Brand soft | `#ECFDF5` | Selected/soft brand surfaces |
| Navigation | `#101B2C` | Main navigation shell |
| Navigation raised | `#1B2D42` | Raised navigation surfaces |
| Page | `#F4F7FB` | Application canvas |
| Surface | `#FFFFFF` | Cards, dialogs and controls |
| Surface tint | `#F6FAFB` | Forms and filter bands |
| Text | `#172033` | Primary text |
| Muted | `#5F6E83` | Supporting text and placeholders; contrast-safe on the page surface |
| Border | `#E2E8F0` | Separation and control outlines |
| Focus | `#2563EB` | Visible keyboard focus |
| Success / warning / error | Existing semantic palette | Status only; never color-only meaning |

This preserves the existing AIBA teal/navy identity and improves separation, contrast and surface hierarchy. Status colors remain semantic; business state labels remain visible text.

## 3. Typography

| Token | Size | Intended use |
|---|---:|---|
| `--aiba-text-xs` | 12px | Metadata, helper text |
| `--aiba-text-sm` | 13px | Labels, table cells, actions |
| `--aiba-text-md` | 14px | Default controls and body copy |
| `--aiba-text-lg` | 16px | Card and section subheads |
| `--aiba-text-xl` | 19px | Emphasized values |
| `--aiba-heading-sm` | 22px | Compact section heading |
| `--aiba-heading-md` | 28px | Page heading |
| `--aiba-heading-lg` | 32px | Large desktop heading |

Body line-height is 1.5; supporting copy uses 1.65. Numeric values use tabular numerals where already represented as numeric data. No font is fetched remotely.

## 4. Spacing and shape

Spacing uses a 4px base scale: 4, 8, 12, 16, 20, 24, 32, 40 and 48px.

- Controls: 11px radius; 44px standard minimum height; 48px for text-entry fields.
- Cards: 16px radius; larger page panels: 20px radius.
- Pills: fully rounded, used for counts, versions and compact statuses only.
- Elevation is quiet: a fine border plus low-opacity shadow. Hover adds a small lift, not a large animation.

## 5. Component contracts

### Buttons
- Primary: teal gradient, white text, 44px minimum height; used for the main action in a section.
- Secondary: white surface, neutral border, ink text; used for cancel, navigation and supporting actions.
- Destructive actions retain their existing danger classes and copy. Disabled states reduce emphasis and prevent hover lift.
- Focus is always visible; hover is not the only feedback.

### Fields and forms
- Persistent labels remain the source of field meaning; placeholders are examples only.
- Shared form layouts cover expenses, payments, invoice drafts, employee/payroll, Platform Admin status/role forms and the assistant composer.
- Text, date, number, select and textarea controls share height, radius, border and focus treatment.
- Invalid fields use the existing `aria-invalid` contract and inline error copy. The design layer does not alter validation rules or submission behavior.
- Inline forms flow into a responsive grid; stacked forms retain a single vertical rhythm.
- Checkbox/radio controls retain native semantics with the AIBA accent color.

### Filters
- Search, select and period controls sit in a shared tinted filter surface.
- The same layout contract covers invoice and statement filters, employee tools, Platform Admin filters and audit filters.
- Search fields may grow; select controls remain shrink-safe.
- On phones, filters become a single vertical stack with full-width actions. Clearing filters remains the responsibility of each feature.

### Cards and metrics
- Shared card surfaces use the same border, radius, padding and shadow.
- Home KPIs and Platform Admin metrics, permission cards, detail panels and empty states use the same surface geometry.
- KPI values are visually prominent but remain separated by currency and the existing server-provided meaning. No new sums, ratios or client calculations are introduced.
- Empty, loading, warning and error states keep their semantic state components.

### Tables
- Tables use a quiet header tint, clear row separators, and a restrained hover state.
- Table wrappers preserve keyboard focus and horizontal touch scrolling when a table has more columns than the viewport.
- Numeric values remain tabular; no columns, data or totals are changed.

## 6. Reference screen: Home / Dashboard

The Home screen is the first complete implementation of this direction:

1. A dark navy-to-teal reporting-period hero with clear period/date/timezone metadata.
2. Four currency-separated KPI cards with stronger hierarchy and consistent surface geometry.
3. A distinct metric-meaning note that preserves the existing difference between invoiced sales, collected payments, expenses and outstanding balances.
4. Quick Access as touch-friendly action cards.
5. The existing module directory remains available under its current disclosure and permission-aware catalog.

No data, navigation, permissions, API requests or business meaning is altered by this screen treatment.

## 7. Responsive and accessibility rules

- Desktop: multi-column KPI and form layouts; card content stays shrink-safe.
- Tablet: KPI cards flow to two columns; forms and filter groups reflow rather than overflow.
- Mobile (760px and below): single-column forms, stacked filters, compact hero metadata, and touch-friendly controls.
- Narrow mobile (380px and below): KPI and quick-access cards retain two columns with shrink-safe content, compact padding and readable labels; verify at 320px.
- RTL/LTR: use logical properties (`margin-inline`, `padding-inline`, `border-inline`) and keep identifiers, dates and currency codes directionally isolated where the data already uses `bdi`.
- Reduced motion and forced-colors modes retain their native accessibility behavior.

## 8. Implementation boundaries

This design layer is loaded after the current base stylesheet through Angular's global style list. It is deliberately isolated while another open invoice PR owns `frontend/src/styles.css` and `frontend/src/app/app.component.ts`.

The design layer must not:
- Introduce new API fields or change request/response payloads.
- Add, remove or reorder accounting, invoice, payment, stock or payroll actions.
- Change permission visibility or tenant scoping.
- Add fake sample business data or client-side calculations.
- Replace feature-specific validation, loading, retry or uncertain-write behavior.

The CSS and source-level checks verify the visual contract. They do not replace rendered Preview review on desktop and mobile.
