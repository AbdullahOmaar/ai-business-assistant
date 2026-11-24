import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./shared/ui/aba-filter-bar.component.ts', import.meta.url), 'utf8');
const appSourceRaw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
// 3A-351: the expense and notification searches moved into their deferred workspaces.
const expensesWorkspaceSource = readFileSync(new URL('./expenses-workspace.component.ts', import.meta.url), 'utf8');
const notificationsWorkspaceSource = readFileSync(new URL('./notifications-workspace.component.ts', import.meta.url), 'utf8');
const suppliersWorkspaceSource = readFileSync(new URL('./suppliers-workspace.component.ts', import.meta.url), 'utf8');
const recurringWorkspaceSource = readFileSync(new URL('./recurring-workspace.component.ts', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const ledgerSource = readFileSync(new URL('./inventory-movement-ledger.component.ts', import.meta.url), 'utf8');
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

// T18 Slice F: one shared filter bar (icon-only filter button with an
// accessible name and a 44px touch area, current-filter summary, clear
// action) for the 5 shell `.list-tools` instances, with variants/slots for
// the invoices status chips and the inventory 3-select grid. The spec lives
// flat in src/app/ like the other specs: `npm test` globs
// src/app/*.spec.ts, so a spec under shared/ui/ would never run. The
// component is exercised by source assertions (no TestBed in the node
// runner), following the aba-icon.spec.ts / aba-search-field.spec.ts
// pattern. The bar does no filtering: `record-filters.ts` still owns the
// filter logic, and each caller keeps its own [(ngModel)] binding.

// --- Component contract ---

test('filter bar is a standalone OnPush component composing aba-icon, with variants and a clear output', () => {
  assert.ok(componentSource.includes("selector: 'aba-filter-bar'"), 'missing selector');
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.ok(componentSource.includes('export class AbaFilterBarComponent'), 'missing component class');
  assert.ok(componentSource.includes("import { AbaIconComponent } from './aba-icon.component';"),
    'icons must come from the shared aba-icon component (Slice D), not a second copy');
  assert.ok(componentSource.includes('imports: [AbaIconComponent]'));
  assert.match(componentSource, /readonly variant = input<AbaFilterBarVariant>\('search'\)/);
  assert.ok(componentSource.includes("export type AbaFilterBarVariant = 'search' | 'chips' | 'selects';"),
    'the invoices chips and the inventory 3-select grid are variants, not a forced single shape');
  assert.match(componentSource, /readonly filterLabel = input\.required<string>\(\)/);
  assert.match(componentSource, /readonly clearLabel = input\.required<string>\(\)/);
  assert.match(componentSource, /readonly filterSummary = input<string>\(''\)/);
  assert.match(componentSource, /readonly emptyFilterLabel = input<string>\(''\)/);
  assert.match(componentSource, /readonly hasActiveFilter = input\(false\)/);
  assert.match(componentSource, /readonly clear = output<void>\(\)/);
  assert.doesNotMatch(componentSource, /import[^;]*record-filters/,
    'the bar does no filtering: it must not import the record-filters.ts functions');
  assert.doesNotMatch(componentSource, /AIPA/, 'no AIPA string ships (product name stays AIBA)');
  assert.doesNotMatch(componentSource, /<svg/, 'the component must not inline its own SVG copy of an icon');
});

test('filter control is icon only: the filter icon with an accessible name, no text, 44px touch area', () => {
  // 3A-696: aria-expanded/aria-controls now bind through toggleExpanded()/
  // toggleControlsId() so fold mode can point them at the extras panel;
  // in the default mode they resolve to the details row exactly as before.
  assert.match(componentSource,
    /<button type="button" class="aba-filter-bar__filter"[^>]*\[attr\.aria-label\]="filterLabel\(\)"[^>]*\[attr\.aria-expanded\]="toggleExpanded\(\)"[^>]*\[attr\.aria-controls\]="toggleControlsId\(\)"[^>]*\(click\)="toggle\(\)">/);
  assert.match(componentSource,
    /class="aba-filter-bar__filter"[\s\S]*?>\s*<aba-icon name="filter" \/>\s*<\/button>/,
    'the filter button must contain only the shared filter icon — no text, no huge visual button');
  assert.ok(componentSource.includes('<aba-icon name="filter" />'), 'filter icon must be the shared aba-icon filter mark');
  assert.match(componentSource, /\.aba-filter-bar__filter\{[^}]*min-height:var\(--aiba-control-md,44px\)/,
    'the filter button must have a comfortable 44px touch area');
  assert.match(componentSource, /\.aba-filter-bar__filter\{[^}]*width:var\(--aiba-control-md,44px\)/,
    'the filter button must be 44px wide as well as tall');
  assert.match(componentSource, /\.aba-filter-bar__filter--active\{[^}]*border-color:var\(--aiba-brand,#0f766e\)/,
    'an active filter must be visible on the filter button itself');
  assert.match(componentSource, /\.aba-filter-bar__filter:focus-visible\{[^}]*outline:3px solid var\(--aiba-focus,#2563eb\)/,
    'the filter button must keep a visible keyboard focus outline');
});

test('bar shows the current filter and a clear action; the details row auto-reveals when a filter becomes active', () => {
  assert.match(componentSource, /@if \(detailsVisible\(\)\) \{/);
  assert.match(componentSource, /<div class="aba-filter-bar__details" \[id\]="detailsId" aria-live="polite">/,
    'the current filter is announced politely, not on every keystroke');
  assert.match(componentSource, /\{\{ filterSummary\(\) \}\}/, 'the current filter is shown as text');
  assert.match(componentSource, /@if \(hasActiveFilter\(\)\) \{/);
  assert.match(componentSource,
    /<button type="button" class="aba-filter-bar__clear" \[attr\.aria-label\]="clearLabel\(\)" \(click\)="onClear\(\)">/);
  assert.ok(componentSource.includes('<aba-icon name="clear" />'), 'clear action must use the shared clear icon');
  assert.match(componentSource, /\.aba-filter-bar__clear\{[^}]*min-height:var\(--aiba-control-md,44px\)/,
    'the clear action must also have a 44px touch area');
  assert.match(componentSource, /protected readonly detailsVisible = computed\(/,
    'the details row renders only when expanded and there is something to show');
  assert.match(componentSource, /if \(active\) this\.expanded\.set\(true\);/,
    'the row auto-reveals when a filter becomes active');
  assert.match(componentSource, /protected onClear\(\): void \{\s*this\.expanded\.set\(false\);\s*this\.clear\.emit\(\);\s*\}/,
    'clearing collapses the details row and lets the caller reset its own filters');
});

test('variants are slots: the search field is projected, chips and selects go through [filterExtras]', () => {
  assert.ok(componentSource.includes('<ng-content />'),
    'the search field is projected content — the bar composes aba-search-field, it does not replace it');
  assert.ok(componentSource.includes('<ng-content select="[filterExtras]" />'),
    'extra controls (chips, selects) are projected through the [filterExtras] slot');
  // 3A-696: the extras wrapper is additionally gated on extrasVisible() so
  // fold mode can hide the controls; with foldExtras off (the default) the
  // gate is always true and the rendering is unchanged.
  assert.match(componentSource, /@if \(variant\(\) !== 'search' && extrasVisible\(\)\) \{/,
    'the search-only variant renders no extras slot');
  assert.match(componentSource, /@if \(variant\(\) !== 'selects'\) \{/,
    'the selects variant has no search field to project');
  assert.match(componentSource, /\.aba-filter-bar--chips \.aba-filter-bar__extras\{flex:1 1 100%\}/,
    'the chips variant keeps the chips on their own row below the search, as today');
  assert.match(componentSource, /\.aba-filter-bar--selects \.aba-filter-bar__extras\{flex:1 1 260px\}/,
    'the selects variant keeps the 3-select grid beside the filter button, wrapping below it when narrow');
});

test('filter and clear labels come from existing translated keys', () => {
  assert.equal(english.ui.m_11q6v6c, 'Filter');
  assert.equal(arabic.ui.m_11q6v6c, 'تصفية');
  assert.equal(english.ui.m_1np7zc4, 'Clear filters');
  assert.equal(arabic.ui.m_1np7zc4, 'مسح الفلاتر');
});

// --- 3A-696: fold mode (G1 closure) ---

test('fold mode: foldExtras input gates the extras panel behind the filter button, details row untouched', () => {
  assert.match(componentSource, /readonly foldExtras = input\(false\)/,
    'fold mode is opt-in and off by default, so existing callers keep their behaviour');
  assert.match(componentSource, /protected readonly panelOpen = signal\(false\)/,
    'the extras panel starts folded');
  assert.match(componentSource, /protected readonly extrasVisible = computed\(\(\) => !this\.foldExtras\(\) \|\| this\.panelOpen\(\)\)/,
    'extras render unless fold mode is on and the panel is closed');
  assert.match(componentSource, /protected readonly toggleExpanded = computed\(\(\) => \(this\.foldExtras\(\) \? this\.panelOpen\(\) : this\.detailsVisible\(\)\)\)/,
    'aria-expanded reports the panel in fold mode and the details row otherwise');
  assert.match(componentSource, /protected readonly toggleControlsId = computed\(\(\) => \(this\.foldExtras\(\) \? this\.extrasId : this\.detailsId\)\)/,
    'aria-controls points at the element the button actually toggles');
  assert.match(componentSource, /protected toggle\(\): void \{\s*if \(this\.foldExtras\(\)\) \{\s*this\.panelOpen\.update\(\(value\) => !value\);\s*return;\s*\}\s*this\.expanded\.update\(\(value\) => !value\);\s*\}/,
    'the button toggles the panel in fold mode and the details row otherwise');
  assert.match(componentSource, /<div class="aba-filter-bar__extras" \[id\]="extrasId">/,
    'the extras wrapper carries the panel id the button controls');
});

// --- Shell migration: the 5 .list-tools instances use the bar ---

const shellFilters: Array<{ search: string; ariaKey: string; placeholderKey: string }> = [
  { search: 'paymentSearch', ariaKey: 'ui.m_nmj0be', placeholderKey: 'ui.m_hoei9y' },
];
// 3A-351: the expense and notification searches live in their deferred
// workspaces now; the same wrapper and binding contract is pinned there.
const movedFilters: Array<{ search: string; ariaKey: string; placeholderKey: string; source: string }> = [
  { search: 'expenseSearch', ariaKey: 'ui.m_qat44q', placeholderKey: 'ui.m_34prmq', source: expensesWorkspaceSource },
  { search: 'notificationSearch', ariaKey: 'ui.m_1qze32v', placeholderKey: 'ui.m_1aqo4qr', source: notificationsWorkspaceSource },
  // 3A-376: the supplier search moved with the suppliers workspace.
  { search: 'supplierSearch', ariaKey: 'ui.m_1mc30sn', placeholderKey: 'ui.m_jtec0a', source: suppliersWorkspaceSource },
  // 3A-376: the recurring search moved with the recurring workspace.
  { search: 'recurringSearch', ariaKey: 'ui.m_aljqyp', placeholderKey: 'ui.m_z7f6xc', source: recurringWorkspaceSource },
];

test('the shell .list-tools instances use aba-filter-bar with their original search bindings preserved', () => {
  // 3A-351: 3 .list-tools instances stay in the shell plus the invoices chips
  // variant; the expense and notification bars moved into their workspaces.
  // 3A-376: the supplier bar moved too — 2 .list-tools instances remain.
  // 3A-376: the recurring bar moved as well — only payments remains.
  assert.equal((appSourceRaw.match(/<aba-filter-bar/g) ?? []).length, 2,
    'exactly 2 filter bars in the shell: the 1 remaining .list-tools instance plus the invoices chips variant');
  assert.equal((appSourceRaw.match(/<aba-search-field /g) ?? []).length, 2,
    'still exactly the 2 shell searches; the bar wraps them, it does not add or remove one');
  for (const filter of shellFilters) {
    assert.ok(appSourceRaw.includes(`<div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="${filter.search}" [hasActiveFilter]="${filter.search}.trim() !== ''" (clear)="${filter.search} = ''">`),
      `${filter.search} must sit inside the bar in its .list-tools wrapper`);
    // CHANGED (narrow-input fix 2026-11-22): was the same substring without
    // `[placeholderNarrow]="t('ui.m_11ucx5t')"` — every shell search now also
    // passes the short narrow placeholder shown at ≤220px.
    assert.ok(appSourceRaw.includes(`<aba-search-field name="${filter.search}" [ariaLabel]="t('${filter.ariaKey}')" [placeholder]="t('${filter.placeholderKey}')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="${filter.search}"`),
      `${filter.search} must keep its name, aria-label, placeholder and [(ngModel)] binding`);
  }
  for (const filter of movedFilters) {
    assert.ok(filter.source.includes(`<div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="${filter.search}" [hasActiveFilter]="${filter.search}.trim() !== ''" (clear)="${filter.search} = ''">`),
      `${filter.search} must sit inside the bar in its .list-tools wrapper in its workspace`);
    assert.ok(filter.source.includes(`<aba-search-field name="${filter.search}" [ariaLabel]="t('${filter.ariaKey}')" [placeholder]="t('${filter.placeholderKey}')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="${filter.search}"`),
      `${filter.search} must keep its name, aria-label, placeholder and [(ngModel)] binding in its workspace`);
  }
  assert.ok(appSourceRaw.includes("import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';"),
    'shell must import the filter bar component');
  assert.ok(appSourceRaw.includes('AbaFilterBarComponent, AbaSearchFieldComponent'),
    'shell must list the filter bar component in its imports');
  assert.ok(appSourceRaw.includes('class="list-tools operations-search aba-record-toolbar"'),
    'the .list-tools wrapper class itself is not renamed');
});

// --- Invoices chips variant ---

test('invoices use the chips variant: search plus status chips inside the bar, behaviour and labels kept', () => {
  const controlsStart = appSourceRaw.indexOf('class="invoice-controls"');
  assert.ok(controlsStart >= 0, 'missing .invoice-controls wrapper');
  const controls = appSourceRaw.slice(controlsStart, appSourceRaw.indexOf('class="invoice-status-chips"', controlsStart));
  assert.ok(controls.includes('<aba-filter-bar variant="chips"'), 'the invoices bar must be the chips variant');
  assert.ok(controls.includes('<aba-search-field'), 'the search field must sit inside .invoice-controls');
  assert.ok(appSourceRaw.includes('class="invoice-status-chips"'), 'status chips must stay');
  assert.match(appSourceRaw, /class="invoice-status-chip"[^>]*\(click\)="setInvoiceStatusFilter\('all'\)"/);
  assert.match(appSourceRaw, /class="invoice-status-chip"[^>]*\(click\)="setInvoiceStatusFilter\('void'\)"/);
  assert.ok(appSourceRaw.includes('filterExtras'), 'the chips group is projected through the [filterExtras] slot');
  assert.ok(appSourceRaw.includes('[filterSummary]="invoiceFilterSummary()"'),
    'the bar shows the current invoice filters (status, search, customer)');
  assert.ok(appSourceRaw.includes('(clear)="clearInvoiceFilters()"'),
    'the bar clear action resets the invoice filters');
  assert.match(appSourceRaw, /clearInvoiceFilters\(\): void \{\s*this\.invoiceSearch = '';\s*this\.invoiceStatusFilter = 'all';\s*this\.invoiceFilterCustomerId = '';\s*this\.invoicePageIndex = 0;\s*\}/,
    'clearing the invoice filters resets search, status and customer and the page index');
  assert.match(appSourceRaw, /invoiceFilterSummary\(\): string \{/);
  assert.match(appSourceRaw, /if \(this\.invoiceStatusFilter !== 'all'\) parts\.push\(this\.t\(statusKeys\[this\.invoiceStatusFilter\]\)\);/);
  assert.match(appSourceRaw, /if \(this\.invoiceSearch\.trim\(\)\) parts\.push\(this\.invoiceSearch\.trim\(\)\);/);
});

// --- Inventory 3-select variant ---

test('inventory ledger uses the selects variant: the 3-select grid is projected, its bindings kept, with a clear action', () => {
  assert.equal((ledgerSource.match(/<aba-filter-bar/g) ?? []).length, 1, 'exactly one filter bar in the ledger');
  assert.ok(ledgerSource.includes("import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';"));
  assert.ok(ledgerSource.includes('imports: [AbaFilterBarComponent]'));
  assert.ok(ledgerSource.includes('<aba-filter-bar variant="selects"'),
    'the ledger bar must be the selects variant, not the search shape');
  assert.ok(ledgerSource.includes('[filterLabel]="copy().filters"'), 'the filter button is named from the ledger copy');
  assert.ok(ledgerSource.includes('[clearLabel]="copy().clearFilters"'));
  assert.ok(ledgerSource.includes('[filterSummary]="activeFilterSummary()"'));
  assert.ok(ledgerSource.includes('[hasActiveFilter]="hasActiveFilters()"'));
  assert.ok(ledgerSource.includes('(clear)="clearFilters()"'));
  assert.ok(ledgerSource.includes('<div class="inventory-ledger__filters" role="group" [attr.aria-label]="copy().filters" filterExtras>'),
    'the 3-select grid keeps its class, group role and label inside the [filterExtras] slot');
  assert.ok(ledgerSource.includes('(change)="setProduct(readValue($event))"'), 'product select binding kept');
  assert.ok(ledgerSource.includes('(change)="setMovementTypeFromEvent($event)"'), 'movement-type select binding kept');
  assert.ok(ledgerSource.includes('(change)="setReferenceType(readValue($event))"'), 'reference-type select binding kept');
  assert.match(ledgerSource, /hasActiveFilters\(\): boolean \{\s*return this\.productId\(\) !== '' \|\| this\.movementType\(\) !== '' \|\| this\.referenceType\(\) !== '';\s*\}/);
  assert.match(ledgerSource, /activeFilterSummary\(\): string \{/);
  assert.match(ledgerSource, /clearFilters\(\): void \{\s*this\.productId\.set\(''\);\s*this\.movementType\.set\(''\);\s*this\.referenceType\.set\(''\);\s*void this\.load\(true\);\s*\}/,
    'clearing resets all three selects and reloads once');
  assert.ok(ledgerSource.includes("clearFilters: this.localization.translate('ui.m_1np7zc4')"),
    'the ledger clear label reuses the shared "Clear filters" key');
});

// --- CSS: the bar host takes the old filter-bar sizing rules ---

test('design-system and shell CSS give the bar host the old filter-bar sizing so the look is unchanged', () => {
  assert.match(designSystem, /\.list-tools aba-filter-bar,/,
    'the bar host must stretch like the old .list-tools input did');
  assert.match(designSystem, /\.list-tools aba-filter-bar,[\s\S]*?flex: 1 1 190px;/,
    'the bar host must take the 190px flex basis of the old filter input');
  assert.match(designSystem, /\.list-tools > aba-filter-bar,/,
    'the bar host must keep the 44px filter-bar control height');
  assert.match(designSystem, /\.invoice-controls aba-filter-bar,/,
    'the invoice bar host sits in the same flex rule as the invoice search host');
  assert.match(appCss, /\.invoice-controls>aba-filter-bar\{grid-column:1\/-1;min-width:0\}/,
    'the invoice bar spans the full .invoice-controls row, as the search + chips did');
  assert.match(designSystem, /\.list-tools > input,[\s\S]*?min-height: var\(--aiba-control-md\)/,
    'the old .list-tools rules stay: the filter-bar look is unchanged for now');
});
