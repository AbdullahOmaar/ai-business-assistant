import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const componentSource = readFileSync(new URL('./shared/ui/aba-search-field.component.ts', import.meta.url), 'utf8');
const appSourceRaw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const appSource = expandTranslationCalls(appSourceRaw);
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const customerWorkspaceSource = readFileSync(new URL('./customer-workspace.component.ts', import.meta.url), 'utf8');
const purchasingWorkspaceSource = readFileSync(new URL('./purchasing-workspace.component.ts', import.meta.url), 'utf8');
const platformAdminSource = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

// T18 Slice E: one shared search field (input + search icon + clear button
// + accessible label) for the 7 shell search inputs. The spec lives flat in
// src/app/ like the other specs: `npm test` globs src/app/*.spec.ts, so a
// spec under shared/ui/ would never run. The component is exercised by
// source assertions (no TestBed in the node runner), following the
// aba-icon.spec.ts / aba-skeleton.spec.ts pattern.

// --- Component contract ---

test('search field is a standalone OnPush ControlValueAccessor so the shell keeps its [(ngModel)] bindings', () => {
  assert.ok(componentSource.includes("selector: 'aba-search-field'"), 'missing selector');
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.ok(componentSource.includes('export class AbaSearchFieldComponent implements ControlValueAccessor'),
    'must implement ControlValueAccessor so [(ngModel)] keeps working on the component element');
  assert.match(componentSource, /provide: NG_VALUE_ACCESSOR,/);
  assert.match(componentSource, /useExisting: forwardRef\(\(\) => AbaSearchFieldComponent\),/);
  assert.ok(componentSource.includes("import { AbaIconComponent } from './aba-icon.component';"),
    'icons must come from the shared aba-icon component (Slice D), not a second copy');
  assert.ok(componentSource.includes('imports: [AbaIconComponent]'));
  assert.match(componentSource, /readonly name = input\.required<string>\(\)/);
  assert.match(componentSource, /readonly ariaLabel = input\.required<string>\(\)/);
  assert.match(componentSource, /readonly clearLabel = input\.required<string>\(\)/);
  assert.match(componentSource, /readonly placeholder = input<string>\(''\)/);
  // Narrow-input fix (2026-11-22): optional short placeholder shown at
  // ≤220px instead of `placeholder` — the full per-screen placeholder cannot
  // fit the ~47px text area left after the 48px/42px chrome at that width.
  assert.match(componentSource, /readonly placeholderNarrow = input<string>\(''\)/);
  assert.match(componentSource, /window\.matchMedia\('\(max-width: 220px\)'\)/);
  assert.match(componentSource, /protected readonly effectivePlaceholder = computed\(\(\) =>/);
  assert.match(componentSource, /this\.isNarrow\(\) && this\.placeholderNarrow\(\) \? this\.placeholderNarrow\(\) : this\.placeholder\(\)/);
  assert.match(componentSource, /readonly autocomplete = input<string>\(''\)/);
});

test('search field renders a type=search input with the given accessible label and placeholder plus the search icon', () => {
  assert.match(componentSource, /<input #searchInput type="search"/);
  assert.match(componentSource, /\[name\]="name\(\)"/);
  assert.match(componentSource, /\[attr\.aria-label\]="ariaLabel\(\)"/);
  // CHANGED (narrow-input fix 2026-11-22): was `[placeholder]="placeholder()"`.
  // The template now binds the effective placeholder — the narrow form at
  // ≤220px when the caller provides one, otherwise the full placeholder —
  // so the placeholder can fit the ~47px text area at that width.
  assert.match(componentSource, /\[placeholder\]="effectivePlaceholder\(\)"/);
  assert.match(componentSource, /\[value\]="currentValue\(\)"/);
  assert.match(componentSource, /\(input\)="onInput\(\$event\)"/);
  assert.match(componentSource, /\(blur\)="onTouched\(\)"/);
  assert.ok(componentSource.includes('<aba-icon name="search" class="aba-search-field__icon" />'),
    'magnifier must be the shared search icon, not a re-introduced inline SVG');
  assert.doesNotMatch(componentSource, /<svg/, 'the component must not inline its own SVG copy of the magnifier');
});

test('clear button appears only with a value, carries the clear icon and an accessible label', () => {
  assert.match(componentSource, /@if \(currentValue\(\) && !disabled\(\)\) \{/);
  assert.match(componentSource, /<button type="button" class="aba-search-field__clear" \[attr\.aria-label\]="clearLabel\(\)" \(click\)="clear\(\)">/);
  assert.ok(componentSource.includes('<aba-icon name="clear" />'), 'clear button must use the shared clear icon');
});

test('clear empties the value, notifies the binding, and returns focus to the input', () => {
  const clearStart = componentSource.indexOf('protected clear(): void {');
  assert.ok(clearStart >= 0, 'missing clear method');
  const clearBody = componentSource.slice(clearStart, componentSource.indexOf('\n  }', clearStart));
  assert.ok(clearBody.includes("this.currentValue.set('');"), 'clear must empty the value');
  assert.ok(clearBody.includes("this.onChange('');"), 'clear must notify the ngModel binding');
  assert.ok(clearBody.includes('this.inputRef()?.nativeElement.focus();'), 'clear must return focus to the input');
  assert.ok(componentSource.includes("viewChild<ElementRef<HTMLInputElement>>('searchInput')"),
    'the input must be reachable for the focus return');
});

test('typing updates the value and notifies the binding; writeValue updates the rendered value', () => {
  const inputStart = componentSource.indexOf('protected onInput(event: Event): void {');
  assert.ok(inputStart >= 0, 'missing onInput handler');
  const inputBody = componentSource.slice(inputStart, componentSource.indexOf('\n  }', inputStart));
  assert.ok(inputBody.includes('const value = (event.target as HTMLInputElement).value;'));
  assert.ok(inputBody.includes('this.currentValue.set(value);'));
  assert.ok(inputBody.includes('this.onChange(value);'));
  const writeStart = componentSource.indexOf('writeValue(value: string | null): void {');
  assert.ok(writeStart >= 0, 'missing writeValue');
  const writeBody = componentSource.slice(writeStart, componentSource.indexOf('\n  }', writeStart));
  assert.ok(writeBody.includes("this.currentValue.set(typeof value === 'string' ? value : '');"),
    'a parent-side reset (e.g. workspace switch) must clear the rendered value');
  assert.match(componentSource, /setDisabledState\(isDisabled: boolean\): void \{[\s\S]*?this\.disabled\.set\(isDisabled\);/);
});

test('search field uses the --aiba-* tokens, hides the native search decorations, and ships no provisional brand name', () => {
  assert.doesNotMatch(componentSource, /AIPA/, 'no provisional brand name ships in the search field');
  assert.ok(componentSource.includes('var(--aiba-muted,'), 'icon/clear colours must use the --aiba-* tokens');
  assert.ok(componentSource.includes('var(--aiba-control-md,'), 'field height must use the --aiba-* control token');
  assert.ok(componentSource.includes('var(--aiba-radius-control,'), 'clear-button corners must use the --aiba-* radius token');
  assert.ok(componentSource.includes('var(--aiba-focus,'), 'clear-button focus must use the --aiba-* focus token');
  assert.match(componentSource, /padding-inline-start:48px;padding-inline-end:42px/,
    'input padding must keep the invoice search winning values (48px/42px) for icon/text clearance');
  assert.ok(componentSource.includes('input::-webkit-search-decoration'), 'native search decorations must be hidden');
  assert.ok(componentSource.includes('input::-webkit-search-cancel-button{display:none}'),
    'the native cancel button must be hidden: the component clear button is the only clear affordance');
  assert.doesNotMatch(componentSource, /--aba-color-/, 'new shared pieces use --aiba-* tokens, not the --aba-* set');
});

// --- Shell migration: the 7 inputs use the component ---

// 3A-351: the module-directory search moved with the Home tab into the
// overview workspace; the shell keeps the other six.
const overviewSource = readFileSync(new URL('./overview-workspace.component.ts', import.meta.url), 'utf8');
// 3A-351: the expense and notification searches moved into their workspaces.
const expensesSource = readFileSync(new URL('./expenses-workspace.component.ts', import.meta.url), 'utf8');
const notificationsSource = readFileSync(new URL('./notifications-workspace.component.ts', import.meta.url), 'utf8');
// 3A-376: the supplier search moved into the suppliers workspace.
const suppliersSource = readFileSync(new URL('./suppliers-workspace.component.ts', import.meta.url), 'utf8');
const recurringSource = readFileSync(new URL('./recurring-workspace.component.ts', import.meta.url), 'utf8');
// 3A-921 F1c: the payment search moved with the payments workspace.
const paymentsSource = readFileSync(new URL('./payments-workspace.component.ts', import.meta.url), 'utf8');
const shellSearches: Array<{ name: string; ariaKey: string; placeholderKey: string; binding: string }> = [
  { name: 'invoiceSearch', ariaKey: 'ui.m_qwjq9v', placeholderKey: 'ui.m_2onysz', binding: 'invoiceSearch' },
];
// 3A-351: the expense and notification searches live in their workspaces now.
const movedSearches: Array<{ name: string; ariaKey: string; placeholderKey: string; binding: string; source: string }> = [
  // 3A-921 F1c: the payment search moved with the payments workspace.
  { name: 'paymentSearch', ariaKey: 'ui.m_nmj0be', placeholderKey: 'ui.m_hoei9y', binding: 'paymentSearch', source: paymentsSource },
  { name: 'expenseSearch', ariaKey: 'ui.m_qat44q', placeholderKey: 'ui.m_34prmq', binding: 'expenseSearch', source: expensesSource },
  { name: 'notificationSearch', ariaKey: 'ui.m_1qze32v', placeholderKey: 'ui.m_1aqo4qr', binding: 'notificationSearch', source: notificationsSource },
  { name: 'supplierSearch', ariaKey: 'ui.m_1mc30sn', placeholderKey: 'ui.m_jtec0a', binding: 'supplierSearch', source: suppliersSource },
  { name: 'recurringSearch', ariaKey: 'ui.m_aljqyp', placeholderKey: 'ui.m_z7f6xc', binding: 'recurringSearch', source: recurringSource },
];

test('all 7 search inputs use aba-search-field with their original name, aria-label, placeholder and [(ngModel)] binding', () => {
  // 3A-351: 4 searches stay in the shell; the module-directory search lives
  // in the overview workspace and the expense/notification searches live in
  // their own workspaces, pinned separately below.
  // 3A-376: the supplier search moved too — 3 searches stay in the shell.
  // 3A-376: the recurring search moved as well — 2 stay in the shell.
  // 3A-921 F1c: payments moved too — only the invoice search stays.
  assert.equal((appSourceRaw.match(/<aba-search-field /g) ?? []).length, 1,
    'exactly the 1 shell search migrates; no more, no fewer');
  assert.ok(overviewSource.includes('<aba-search-field class="module-directory-search" name="homeModuleSearch" autocomplete="off"'),
    'the overview search keeps its module-directory-search hook and autocomplete="off"');
  assert.ok(overviewSource.includes("[ariaLabel]=\"t('ui.m_1yd5km1')\""),
    'homeModuleSearch must keep its aria-label key ui.m_1yd5km1');
  assert.ok(overviewSource.includes("[placeholder]=\"t('ui.m_3bdru5')\""),
    'homeModuleSearch must keep its placeholder key ui.m_3bdru5');
  assert.ok(overviewSource.includes('[(ngModel)]="homeModuleSearch"'),
    'homeModuleSearch must keep its [(ngModel)] binding');
  for (const search of shellSearches) {
    assert.ok(appSourceRaw.includes(`<aba-search-field name="${search.name}"`) ||
      appSourceRaw.includes(`<aba-search-field class="module-directory-search" name="${search.name}"`) ||
      appSourceRaw.includes(`<aba-search-field class="invoice-search" name="${search.name}"`),
      `missing aba-search-field usage for ${search.name}`);
    assert.ok(appSourceRaw.includes(`[ariaLabel]="t('${search.ariaKey}')"`),
      `${search.name} must keep its aria-label key ${search.ariaKey}`);
    assert.ok(appSourceRaw.includes(`[placeholder]="t('${search.placeholderKey}')"`),
      `${search.name} must keep its placeholder key ${search.placeholderKey}`);
    // Narrow-input fix (2026-11-22): every shell search also passes the
    // short narrow placeholder ("Search", ui.m_11ucx5t) shown at ≤220px,
    // where the full placeholder cannot fit the ~47px text area.
    assert.ok(appSourceRaw.includes(`[placeholderNarrow]="t('ui.m_11ucx5t')"`),
      `${search.name} must pass the short narrow placeholder key ui.m_11ucx5t`);
    assert.ok(appSourceRaw.includes(`[clearLabel]="t('ui.m_4k8q2zr')"`),
      `${search.name} must label its clear button with the shared clear-search key`);
    assert.ok(appSourceRaw.includes(`[(ngModel)]="${search.binding}"`),
      `${search.name} must keep its [(ngModel)] binding`);
  }
  for (const search of movedSearches) {
    assert.ok(search.source.includes(`<aba-search-field name="${search.name}"`),
      `missing aba-search-field usage for ${search.name} in its workspace`);
    assert.ok(search.source.includes(`[ariaLabel]="t('${search.ariaKey}')"`) ,
      `${search.name} must keep its aria-label key ${search.ariaKey}`);
    assert.ok(search.source.includes(`[placeholder]="t('${search.placeholderKey}')"`),
      `${search.name} must keep its placeholder key ${search.placeholderKey}`);
    assert.ok(search.source.includes(`[placeholderNarrow]="t('ui.m_11ucx5t')"`),
      `${search.name} must pass the short narrow placeholder key ui.m_11ucx5t`);
    assert.ok(search.source.includes(`[clearLabel]="t('ui.m_4k8q2zr')"`),
      `${search.name} must label its clear button with the shared clear-search key`);
    assert.ok(search.source.includes(`[(ngModel)]="${search.binding}"`),
      `${search.name} must keep its [(ngModel)] binding`);
  }
  assert.ok(appSourceRaw.includes('import { AbaSearchFieldComponent } from \'./shared/ui/aba-search-field.component\';'),
    'shell must import the search field component');
  assert.ok(appSourceRaw.includes('AbaSearchFieldComponent, AbaIconComponent, AbaMobileAppHeaderComponent'),
    'shell must list the search field component in its imports (Slice G 2026-11-21: the icon component was added after it for the statement-card buttons)');
});

test('no duplicated raw search input remains in the shell and the old invoice-search markup is gone', () => {
  assert.doesNotMatch(appSourceRaw, /<input[^>]*type="search"/,
    'every shell search input must be the shared component now');
  assert.doesNotMatch(appSourceRaw, /<label class="invoice-search">/,
    'the invoice search label wrapper is replaced by the component');
  assert.doesNotMatch(appSourceRaw, /class="invoice-search-icon"/,
    'the invoice magnifier positioning class lives inside the component now');
  assert.doesNotMatch(appSourceRaw, /<aba-icon name="search"/,
    'the shell no longer renders a bare search icon: the component owns it');
  assert.doesNotMatch(appSourceRaw, /<label class="module-directory-search">/,
    'the module-directory label wrapper is replaced by the component host class');
  assert.ok(overviewSource.includes('<aba-search-field class="module-directory-search" name="homeModuleSearch" autocomplete="off"'),
    'the overview search keeps its module-directory-search hook and autocomplete="off"');
  assert.ok(appSourceRaw.includes('<aba-search-field class="invoice-search" name="invoiceSearch"'),
    'the invoice search keeps its invoice-search hook inside .invoice-controls');
  assert.ok(appSourceRaw.includes('(ngModelChange)="invoicePageIndex = 0"'),
    'the invoice search keeps resetting the page index on change');
});

test('invoice search keeps its .invoice-controls wrapper and status chips (Slice F owns those)', () => {
  const controlsStart = appSource.indexOf('class="invoice-controls"');
  assert.ok(controlsStart >= 0, 'missing .invoice-controls wrapper');
  const controls = appSource.slice(controlsStart, appSource.indexOf('class="invoice-status-chips"', controlsStart));
  assert.ok(controls.includes('<aba-search-field'), 'the search field must sit inside .invoice-controls');
  assert.ok(appSource.includes('class="invoice-status-chips"'), 'status chips must stay');
  assert.match(appSource, /class="invoice-status-chip"[^>]*\(click\)="setInvoiceStatusFilter\('all'\)"/);
  assert.match(appSource, /class="invoice-status-chip"[^>]*\(click\)="setInvoiceStatusFilter\('void'\)"/);
});

test('filter-bar look is unchanged: the component host takes the old input flex and min-height rules', () => {
  assert.match(designSystem, /\.list-tools aba-search-field,[\s\S]*?flex: 1 1 190px;/,
    'the host must stretch like the old .list-tools input did');
  assert.match(designSystem, /\.invoice-controls aba-search-field,[\s\S]*?flex: 1 1 190px;/,
    'the invoice host must stretch like the old .invoice-controls input did');
  assert.match(designSystem, /\.list-tools > aba-search-field,[\s\S]*?min-height: var\(--aiba-control-md\);/,
    'the host must keep the 44px filter-bar control height');
  assert.match(designSystem, /\.list-tools aba-search-field,[\s\S]*?width: 100%;/,
    'the host must go full-width in the mobile single-column filter layout');
  // The old rules stay: the filter-bar look is unchanged for now (Slice F owns the bar).
  assert.match(designSystem, /\.list-tools > input,[\s\S]*?min-height: var\(--aiba-control-md\)/);
  // 3A-921 F1c: the last .list-tools wrapper lives in the payments workspace now.
  assert.ok(paymentsSource.includes('class="list-tools operations-search aba-record-toolbar"'),
    'the .list-tools wrapper class itself is not renamed');
});

// --- What this slice deliberately does NOT change ---

test('workspace searches keep their own behaviour and are NOT forced into the shared component', () => {
  assert.ok(customerWorkspaceSource.includes('<form class="customer-workspace__search" role="search" (submit)="submitSearch($event)">'),
    'customer workspace keeps its submit button + server-side search');
  assert.ok(purchasingWorkspaceSource.includes('<label class="pw__search">'),
    'purchasing workspace keeps its own search label and signal filter');
  assert.ok(platformAdminSource.includes('<label class="search-field"><span>{{ t(\'ui.m_11ucx5t\') }}</span><input name="businessSearch"'),
    'platform admin keeps its type="text" business search');
  assert.ok(platformAdminSource.includes('<input name="userQuery"'),
    'platform admin keeps its type="text" user search');
  assert.doesNotMatch(customerWorkspaceSource, /aba-search-field/, 'customer search must not use the shared field');
  assert.doesNotMatch(purchasingWorkspaceSource, /aba-search-field/, 'purchasing search must not use the shared field');
  assert.doesNotMatch(platformAdminSource, /aba-search-field/, 'platform-admin searches must not use the shared field');
});

test('clear-search label exists in both dictionaries (Slice E, 2026-11-21)', () => {
  assert.equal(english.ui.m_4k8q2zr, 'Clear search');
  assert.equal(arabic.ui.m_4k8q2zr, 'مسح البحث');
  // Narrow-input fix (2026-11-22): the short narrow placeholder is the
  // existing generic "Search" key, so no new key is minted for it.
  assert.equal(english.ui.m_11ucx5t, 'Search');
  assert.equal(arabic.ui.m_11ucx5t, 'بحث');
});
