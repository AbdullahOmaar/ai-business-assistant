import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./shared/ui/aba-date-range.component.ts', import.meta.url), 'utf8');
const appSourceRaw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
// 3A-351: the P&L date range moved with the reports workspace.
const reportsSourceRaw = readFileSync(new URL('./reports-workspace.component.ts', import.meta.url), 'utf8');
const platformAdminSource = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

// T18 Slice J: one shared date-range component (two date inputs + clear;
// presets pending the owner decision, plan section 7.4) for the four from/to
// pairs — Reports P&L, Customers statement, Taxes, Platform-admin audit.
// The spec lives flat in src/app/ like the other specs: `npm test` globs
// src/app/*.spec.ts, so a spec under shared/ui/ would never run. The
// component is exercised by source assertions (no TestBed in the node
// runner), following the aba-icon.spec.ts / aba-filter-bar.spec.ts pattern.
// The two inputs are projected content: each caller keeps its own
// <label><input ... [(ngModel)]> markup verbatim, so the names, labels,
// validation and submit/apply behaviour are preserved by construction and
// pinned here. The ageing agingAsOf stays a single date input and is NOT
// converted to a range.

// --- Component contract ---

test('date range is a standalone OnPush component composing aba-icon, projecting its two inputs, with a clear output', () => {
  assert.ok(componentSource.includes("selector: 'aba-date-range'"), 'missing selector');
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.ok(componentSource.includes('export class AbaDateRangeComponent'), 'missing component class');
  assert.ok(componentSource.includes("import { AbaIconComponent } from './aba-icon.component';"),
    'icons must come from the shared aba-icon component (Slice D), not a second copy');
  assert.ok(componentSource.includes('imports: [AbaIconComponent]'));
  assert.match(componentSource, /readonly clearLabel = input<string>\(''\)/);
  assert.match(componentSource, /readonly showClear = input\(false\)/);
  assert.match(componentSource, /readonly hasValue = input\(false\)/);
  assert.match(componentSource, /readonly clear = output<void>\(\)/);
  assert.ok(componentSource.includes('<ng-content />'),
    'the two date inputs are projected content — the component composes them, it does not own their names or bindings');
  assert.ok(componentSource.includes('<div class="aba-date-range__fields"><ng-content /></div>'),
    'the projected inputs sit in the shared fields row');
  assert.doesNotMatch(componentSource, /import[^;]*api\.service/,
    'the component is presentation-only: it must not call the API (the API already accepts from_date/to_date)');
  assert.doesNotMatch(componentSource, /AIPA/, 'no AIPA string ships (product name stays AIBA)');
  assert.doesNotMatch(componentSource, /<svg/, 'the component must not inline its own SVG copy of an icon');
});

test('no presets: the component ships with just the two inputs + clear, pending the owner decision', () => {
  // The doc comment above names presets only as the pending owner decision,
  // so the assertions run against the code after it: no preset
  // *implementation* may ship — no preset input, chip element, preset list
  // or preset handler in the decorator, template, styles or class.
  const code = componentSource.slice(componentSource.indexOf('@Component({'));
  assert.doesNotMatch(code, /preset/i, 'no preset inputs, chips or logic');
  assert.doesNotMatch(code, /Last 7 days|This month|Last month|This quarter/,
    'no preset choice may be invented');
  assert.doesNotMatch(code, /chip/i, 'no preset chips');
});

test('clear is icon only with an accessible name, shown only when opted in and a value exists, 44px touch area', () => {
  assert.match(componentSource, /@if \(showClear\(\) && hasValue\(\)\) \{/,
    'the clear button renders only when the caller opts in and either date has a value');
  assert.match(componentSource,
    /<button type="button" class="aba-date-range__clear" \[attr\.aria-label\]="clearLabel\(\)" \(click\)="onClear\(\)">/);
  assert.match(componentSource,
    /class="aba-date-range__clear"[\s\S]*?>\s*<aba-icon name="clear" \/>\s*<\/button>/,
    'the clear button must contain only the shared clear icon — no text');
  assert.ok(componentSource.includes('<aba-icon name="clear" />'), 'clear action must use the shared clear icon');
  assert.match(componentSource, /\.aba-date-range__clear\{[^}]*min-height:var\(--aiba-control-md,44px\)/,
    'the clear action must have a comfortable 44px touch area');
  assert.match(componentSource, /\.aba-date-range__clear\{[^}]*width:var\(--aiba-control-md,44px\)/,
    'the clear action must be 44px wide as well as tall');
  assert.match(componentSource, /\.aba-date-range__clear\{[^}]*border-radius:var\(--aiba-radius-control,11px\)/,
    'the clear action must use the 11px control radius (Slice I)');
  assert.match(componentSource, /\.aba-date-range__clear:focus-visible\{[^}]*outline:3px solid var\(--aiba-focus,#2563eb\)/,
    'the clear button must keep a visible keyboard focus outline');
  assert.match(componentSource, /protected onClear\(\): void \{\s*this\.clear\.emit\(\);\s*\}/,
    'clearing lets the caller reset its own two date fields');
});

test('clear label reuses the existing translated "Clear filters" key', () => {
  assert.equal(english.ui.m_1np7zc4, 'Clear filters');
  assert.equal(arabic.ui.m_1np7zc4, 'مسح الفلاتر');
});

// --- Shell migration: exactly 3 date ranges in app.component.ts ---

test('the shell uses aba-date-range exactly 2 times: statement and taxes (P&L moved to the reports workspace)', () => {
  assert.equal((appSourceRaw.match(/<aba-date-range/g) ?? []).length, 2,
    'exactly 2 date ranges in the shell (statement, taxes); the P&L range lives in the deferred reports workspace and the ageing single date is not one');
  assert.equal((reportsSourceRaw.match(/<aba-date-range/g) ?? []).length, 1,
    'the reports workspace keeps the one P&L date range');
  assert.ok(appSourceRaw.includes("import { AbaDateRangeComponent } from './shared/ui/aba-date-range.component';"),
    'shell must import the date-range component');
  assert.ok(appSourceRaw.includes('AbaSkeletonComponent, AbaDateRangeComponent, AbaFilterBarComponent'),
    'shell must list the date-range component in its imports');
});

test('Reports P&L pair keeps its names, required validation and submit, and gains the component clear', () => {
  const profitStart = reportsSourceRaw.indexOf('<form #profitLossForm="ngForm"');
  const profitEnd = reportsSourceRaw.indexOf('</form>', profitStart);
  const profit = reportsSourceRaw.slice(profitStart, profitEnd);
  assert.ok(profit.includes('profitLossForm.valid && loadProfitLoss()'), 'P&L submit behaviour is unchanged');
  assert.match(profit, /name="profitLossStart" required/);
  assert.match(profit, /name="profitLossEnd" required/);
  assert.ok(profit.includes('#profitLossStartControl="ngModel"'), 'P&L start validation control is kept');
  assert.ok(profit.includes('#profitLossEndControl="ngModel"'), 'P&L end validation control is kept');
  assert.ok(profit.includes('id="profit-loss-start-error"'), 'P&L start error id is kept');
  assert.ok(profit.includes('id="profit-loss-end-error"'), 'P&L end error id is kept');
  assert.ok(profit.includes('<aba-date-range [showClear]="true" [hasValue]="profitLossStart !== \'\' || profitLossEnd !== \'\'" [clearLabel]="t(\'ui.m_1np7zc4\')" (clear)="profitLossStart = \'\'; profitLossEnd = \'\'">'),
    'P&L dates sit inside the shared component with its clear wired to reset both fields');
  assert.ok(profit.includes('</aba-date-range>'), 'P&L date-range wrapper is closed inside the form');
});

test('Customers statement pair keeps its names, grouping div and own Apply/Clear buttons, and uses no component clear', () => {
  assert.ok(appSourceRaw.includes('<div class="statement-filters__dates">'), 'statement dates must stay grouped together');
  assert.ok(appSourceRaw.includes('<div class="statement-filters__actions">'), 'statement filter actions must stay grouped together');
  const datesStart = appSourceRaw.indexOf('<div class="statement-filters__dates">');
  const datesEnd = appSourceRaw.indexOf('</div>', datesStart);
  const dates = appSourceRaw.slice(datesStart, datesEnd);
  assert.ok(dates.includes('<aba-date-range>'), 'statement dates sit inside the shared component');
  assert.match(dates, /name="statementFromDate"[^>]*type="date"|type="date"[^>]*name="statementFromDate"/);
  assert.match(dates, /name="statementToDate"[^>]*type="date"|type="date"[^>]*name="statementToDate"/);
  assert.doesNotMatch(dates, /showClear/,
    'the statement pair does NOT use the component clear: it keeps its own Clear button (clearCustomerStatementFilters, which also reloads page 0)');
  assert.match(appSourceRaw, /\(click\)="applyCustomerStatementFilters\(\)"/, 'statement Apply button is kept');
  assert.match(appSourceRaw, /\(click\)="clearCustomerStatementFilters\(\)"/, 'statement Clear button is kept');
});

test('Taxes pair keeps its names and form submit, and gains the component clear', () => {
  const taxStart = appSourceRaw.indexOf("(ngSubmit)=\"loadTaxSummary()\"");
  assert.ok(taxStart >= 0, 'missing tax form');
  const tax = appSourceRaw.slice(taxStart, appSourceRaw.indexOf('</form>', taxStart));
  assert.ok(tax.includes('<aba-date-range [showClear]="true" [hasValue]="taxStartDate !== \'\' || taxEndDate !== \'\'" [clearLabel]="t(\'ui.m_1np7zc4\')" (clear)="taxStartDate = \'\'; taxEndDate = \'\'">'),
    'tax dates sit inside the shared component with its clear wired to reset both fields');
  assert.match(tax, /name="taxStartDate" type="date"/);
  assert.match(tax, /name="taxEndDate" type="date"/);
  assert.ok(tax.includes('[(ngModel)]="taxStartDate"'), 'tax start binding is kept');
  assert.ok(tax.includes('[(ngModel)]="taxEndDate"'), 'tax end binding is kept');
});

test('the ageing agingAsOf stays a single date input and is NOT converted to a range', () => {
  // 3A-351: the ageing form lives in the deferred reports workspace now.
  const agingStart = reportsSourceRaw.indexOf('<form #agingForm="ngForm"');
  const agingEnd = reportsSourceRaw.indexOf('</form>', agingStart);
  const aging = reportsSourceRaw.slice(agingStart, agingEnd);
  assert.doesNotMatch(aging, /aba-date-range/, 'the ageing form must not use the date-range component');
  assert.ok(aging.includes('agingForm.valid && loadReceivablesAging()'), 'ageing submit behaviour is unchanged');
  assert.match(aging, /name="agingAsOf" required/);
  assert.ok(aging.includes('[(ngModel)]="agingAsOf"'), 'ageing keeps its single-date binding');
});

// --- Platform-admin migration: exactly 1 date range, datetime-local kept ---

test('platform-admin audit pair keeps its datetime-local inputs, filter form and submit, and gains the component clear', () => {
  assert.equal((platformAdminSource.match(/<aba-date-range/g) ?? []).length, 1,
    'exactly one date range in platform-admin (audit From/To)');
  assert.ok(platformAdminSource.includes("import { AbaDateRangeComponent } from './shared/ui/aba-date-range.component';"),
    'platform-admin must import the date-range component');
  // 3A-354 (2026-11-22): the audit filter submit became icon-only (agreement
  // G1), so AbaIconComponent joined the imports; the date-range listing and
  // behaviour are unchanged.
  assert.ok(platformAdminSource.includes('imports: [CommonModule, FormsModule, AbaDateRangeComponent, AbaIconComponent]'),
    'platform-admin must list the date-range component in its imports');
  assert.ok(platformAdminSource.includes('class="filters audit-filters"'), 'audit form class is kept');
  const auditStart = platformAdminSource.indexOf('class="filters audit-filters"');
  const audit = platformAdminSource.slice(auditStart, platformAdminSource.indexOf('</form>', auditStart));
  assert.ok(audit.includes('(ngSubmit)="loadAudit(0)"'), 'audit submit behaviour is unchanged');
  assert.ok(audit.includes('class="primary-button icon-only"'), 'the audit filter submit is icon-only');
  assert.ok(audit.includes('[attr.aria-label]="t(\'ui.m_11q6v6c\')"'), 'the icon-only audit submit keeps its accessible name');
  assert.ok(audit.includes('<aba-date-range [showClear]="true" [hasValue]="auditFrom !== \'\' || auditTo !== \'\'" [clearLabel]="t(\'ui.m_1np7zc4\')" (clear)="auditFrom = \'\'; auditTo = \'\'">'),
    'audit dates sit inside the shared component with its clear wired to reset both fields');
  assert.match(audit, /type="datetime-local" name="auditFrom"/);
  assert.match(audit, /type="datetime-local" name="auditTo"/);
  assert.ok(audit.includes('[(ngModel)]="auditFrom"'), 'audit from binding is kept');
  assert.ok(audit.includes('[(ngModel)]="auditTo"'), 'audit to binding is kept');
  assert.ok(audit.includes('name="auditAction"'), 'audit action filter is untouched');
  assert.ok(audit.includes('name="auditActor"'), 'audit actor filter is untouched');
  assert.ok(audit.includes('name="auditBusinessId"'), 'audit business filter is untouched');
});

// --- CSS: the design-system rules that reach the projected labels ---

test('design-system gives the date-range host and its projected labels the shared layout', () => {
  assert.match(designSystem, /:root body \.shell aba-date-range \{\s*display: block;\s*min-width: 0;\s*\}/,
    'the date-range host must be a block that can shrink in its caller layout');
  assert.match(designSystem, /:root body \.shell aba-date-range \.aba-date-range__fields > label \{\s*display: grid;\s*align-content: start;\s*gap: var\(--aiba-space-2\);\s*flex: 1 1 0;\s*min-width: 0;\s*\}/,
    'projected labels keep the grid label layout and share the fields row equally');
  assert.match(designSystem, /:root body \.shell \.statement-filters > \.statement-filters__dates > aba-date-range \{\s*flex: 1 1 auto;\s*min-width: 0;\s*\}/,
    'the statement host fills its Slice G grouping div');
  assert.match(designSystem, /:root body \.shell \.audit-filters aba-date-range \{\s*flex: 2 1 340px;\s*min-width: 0;\s*\}/,
    'the audit host takes about two filter labels of room in the audit filter row');
  assert.ok(designSystem.includes('T18 Slice J'), 'the Slice J design-system rules must be marked');
});


// T18 Slice U02 (2026-11-21): at 195/220px the two date inputs sit side by
// side at ~70px each, so the value is clipped to a single letter ("mr" /
// "n"). Below 380px the fields stack full-width.
test('date-range fields stack full-width below 380px', () => {
  assert.match(componentSource, /@media\(max-width:380px\)\{\.aba-date-range__fields\{flex-direction:column\}\}/);
});
