import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./customer-directory.component.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./customer-directory.component.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('Customers uses a feature-specific directory instead of the shared generic record table', () => {
  assert.match(component, /selector: 'aba-customer-directory'/);
  assert.match(app, /<aba-customer-directory[\s\S]*?\[customers\]="filteredCustomers"/);
  assert.doesNotMatch(app, /<aba-record-table[^>]*\[ariaLabel\]="t\('جدول العملاء'/);
});

test('customer directory supports accessible sorting in desktop and mobile layouts', () => {
  assert.match(component, /aria-sort/);
  assert.match(component, /toggleSort\('name'\)/);
  assert.match(component, /onMobileSortChange\(\$event\)/);
  assert.match(component, /new Intl\.Collator\(this\.locale\(\)/);
  assert.match(component, /ariaSort\(field: CustomerSortField\)/);
  assert.match(component, /sortIndicator\(field: CustomerSortField\)/);
});

test('customer directory keeps compact mobile contact rows and visible existing actions', () => {
  assert.match(component, /customer-directory__mobile-list/);
  assert.match(component, /customer\.phone/);
  assert.match(component, /customer\.email/);
  assert.match(component, /emitAction\(customer\.id, 'invoices'/);
  assert.match(component, /emitAction\(customer\.id, 'statement'/);
  assert.match(component, /rowAction\.emit\(\{ rowId, actionId, anchor \}\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /forced-colors:active/);
});

test('customer screen preserves workspace search, owner CSV affordance and statement workflow', () => {
  assert.match(app, /name="customerSearch"[^>]*\[\(ngModel\)\]="customerSearch"/);
  assert.match(app, /business\?\.role === 'owner'[\s\S]*?exportCurrentList\(\)/);
  assert.match(app, /loadCustomerStatement\(customer\)/);
  assert.match(app, /showCustomerInvoices\(customer\.id\)/);
  assert.match(app, /customerStatementTableColumns/);
  assert.match(app, /statementOffset \+ customerStatement\.items\.length/);
});

test('main customer directory exposes the existing guarded pagination beyond the first page', () => {
  assert.match(app, /\(click\)="loadMoreCustomers\(\)"/);
  assert.match(app, /loadMoreCustomers\(\): Promise<void>/);
  assert.match(app, /return this\.loadMoreInvoiceCustomers\(\)/);
  assert.match(app, /fetchPage: \(id, offset\) => this\.api\.customers\(id, offset\)/);
});
