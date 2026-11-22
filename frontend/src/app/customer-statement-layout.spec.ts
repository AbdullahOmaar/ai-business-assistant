import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const componentSource = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const abaCardSource = readFileSync(new URL('./shared/ui/aba-card.component.ts', import.meta.url), 'utf8');

test('customer statement preserves separate currency balances and uses the shared responsive record table', () => {
  assert.match(componentSource, /class="panel statement-panel"/);
  assert.match(componentSource, /<aba-record-table \[ariaLabel\]="t\('كشف حساب العميل'/);
  assert.match(componentSource, /customerStatementTableColumns/);
  assert.match(componentSource, /customerStatementTableRows/);
  assert.match(componentSource, /balance:\x60\$\{event\.balance\} \$\{event\.currency_code\}\x60/);
  assert.match(componentSource, /formatCustomerStatementDate\(event\.occurred_at\)/);
  assert.match(componentSource, /Intl\.DateTimeFormat/);
  assert.match(componentSource, /get statementBalanceEntries\(\)/);
  assert.doesNotMatch(componentSource, /customer statement table, horizontally scrollable/);
});

test('customer statement pagination and date-range limitations remain visible around the responsive records', () => {
  assert.match(componentSource, /loadCustomerStatementPage\(statementOffset > 50 \? statementOffset - 50 : 0\)/);
  assert.match(componentSource, /loadCustomerStatementPage\(statementOffset \+ 50\)/);
  assert.match(componentSource, /Displayed balances sum movements inside the selected range only/);
  assert.match(componentSource, /customerStatement\.limitations/);
});

// T18 Slice G (2026-11-21): statement card redrawn per the owner ruling
// 2026-11-21 15:07 EET (13:42: "the card at the bottom, its look and design
// is not interactive and not good, redo the design and buttons"). The
// filters group dates with dates and actions with actions, the pager groups
// its range text with its buttons, and every action carries an icon — while
// every handler, label and disabled state stays exactly as it was.

test('statement card groups its filters and pager, and every action has an icon', () => {
  assert.ok(componentSource.includes('<div class="statement-filters__dates">'), 'dates must be grouped together');
  assert.ok(componentSource.includes('<div class="statement-filters__actions">'), 'filter actions must be grouped together');
  assert.ok(componentSource.includes('<div class="statement-pager">'), 'pager must group its range text with its buttons');
  assert.ok(componentSource.includes('<div class="statement-pager__actions">'), 'pager buttons must be grouped together');
  assert.ok(componentSource.includes('<aba-icon name="close" />'), 'close action must have an icon');
  assert.ok(componentSource.includes('<aba-icon name="check" />'), 'apply action must have an icon');
  assert.ok(componentSource.includes('<aba-icon name="clear" />'), 'clear action must have an icon');
  assert.ok(componentSource.includes('<aba-icon name="chevron-left" class="statement-pager__chevron" />'), 'previous page must have an icon');
  assert.ok(componentSource.includes('<aba-icon name="chevron-right" class="statement-pager__chevron" />'), 'next page must have an icon');
  assert.ok(componentSource.includes("customerStatement=null; statementVisible=false; statementError=''"),
    'close action must keep its existing handler');
  assert.doesNotMatch(componentSource, /<div class="inline-form"><span class="muted">\{\{ statementOffset/,
    'the pager must no longer be a spread-out inline-form row');
});

test('statement balance cards are content-sized and non-interactive, not tall fixed cards', () => {
  // Owner notes 2026-11-21 14:45 ("the text inside the card is far apart")
  // and 14:47 ("the card is very very very big"): the `.metric` cards forced
  // a 148px height for a label and one value. The height is now the content's.
  assert.doesNotMatch(designSystem, /\.metric-grid > \.metric\s*\{[^}]*min-height/,
    'design system must not force a height on .metric cards');
  assert.doesNotMatch(appStyles, /\.metric\{[^}]*min-height/,
    'component styles must not force a height on .metric cards');
  assert.doesNotMatch(designSystem, /\.metric-grid > \.metric:hover/,
    'a non-interactive .metric card must not lift on hover');
  assert.match(designSystem, /\.metric-grid > \.metric\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--aiba-space-1\)/,
    'label and value must sit close together in a grid');
  // The tappable Overview KPI cards keep their height and hover lift.
  assert.match(designSystem, /\.metric-grid > aba-metric-card\s*\{[^}]*min-height:\s*148px/,
    'KPI card hosts keep their height');
  assert.match(designSystem, /\.metric-grid > aba-metric-card:hover \.aba-metric-card\s*\{[^}]*transform:\s*translateY\(-2px\)/,
    'tappable KPI cards keep their hover lift');
});

test('card contract is documented on abaCard: when each card is used, and that cards stay non-interactive', () => {
  assert.ok(abaCardSource.includes('Card contract (T18 Slice G'), 'contract must be documented on the shared card');
  assert.ok(abaCardSource.includes('aba-metric-card'), 'contract must say when the KPI card is used');
  assert.ok(abaCardSource.includes('NON-interactive'), 'contract must state the non-interactive default');
  assert.ok(abaCardSource.includes('tappable'), 'contract must name the only tappable cards');
});


// T18 Slice U02 (2026-11-21): at 195/220px the statement Apply / Clear
// buttons share one row at ~70px each, so "Apply range" and "Clear range"
// break letter-by-letter, and the pager Previous / Next do the same.
// Below 380px both groups stack full-width.
test('statement filter actions and pager stack full-width below 380px', () => {
  assert.match(designSystem, /@media \(max-width: 380px\) \{[\s\S]*?\.statement-filters > \.statement-filters__actions \{[\s\S]*?flex-direction: column;/);
  assert.match(designSystem, /@media \(max-width: 380px\) \{[\s\S]*?\.statement-filters > \.statement-filters__actions > \* \{[\s\S]*?width: 100%;/);
  assert.match(designSystem, /@media \(max-width: 380px\) \{[\s\S]*?\.statement-pager \{[\s\S]*?flex-direction: column;/);
  assert.match(designSystem, /@media \(max-width: 380px\) \{[\s\S]*?\.statement-pager__actions \{[\s\S]*?flex-direction: column;[\s\S]*?width: 100%;/);
  // At 390px the side-by-side buttons are unchanged (the 600px rule still
  // shares one row for the two filter actions).
  assert.match(designSystem, /\.statement-filters > \.statement-filters__actions > \* \{[\s\S]*?flex: 1 1 0;/);
});
