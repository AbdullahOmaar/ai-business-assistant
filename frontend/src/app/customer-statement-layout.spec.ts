import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('customer statement preserves separate currency balances and uses the shared responsive record table', () => {
  assert.match(componentSource, /class="panel statement-panel"/);
  assert.match(componentSource, /<aba-record-table \[ariaLabel\]="t\('كشف حساب العميل'/);
  assert.match(componentSource, /customerStatementTableColumns/);
  assert.match(componentSource, /customerStatementTableRows/);
  assert.match(componentSource, /balance:\x60\$\{event\.balance\} \$\{event\.currency_code\}\x60/);
  assert.match(componentSource, /formatDate\(event\.occurred_at,'short',this\.language==='ar'\?'ar-EG':'en-GB'\)/);
  assert.match(componentSource, /get statementBalanceEntries\(\)/);
  assert.doesNotMatch(componentSource, /customer statement table, horizontally scrollable/);
});

test('customer statement pagination and date-range limitations remain visible around the responsive records', () => {
  assert.match(componentSource, /loadCustomerStatementPage\(statementOffset > 50 \? statementOffset - 50 : 0\)/);
  assert.match(componentSource, /loadCustomerStatementPage\(statementOffset \+ 50\)/);
  assert.match(componentSource, /Displayed balances sum movements inside the selected range only/);
  assert.match(componentSource, /customerStatement\.limitations/);
});
