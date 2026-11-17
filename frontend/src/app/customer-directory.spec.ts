import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./customer-directory.component.ts', import.meta.url), 'utf8');
const sortHelper = readFileSync(new URL('./directory-sort.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./customer-directory.component.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./customer-workspace.component.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./customer-editor.component.ts', import.meta.url), 'utf8');
const editorCss = readFileSync(new URL('./customer-editor.component.css', import.meta.url), 'utf8');

test('Customers uses a feature-specific directory instead of the shared generic record table', () => {
  assert.match(component, /selector: 'aba-customer-directory'/);
  assert.match(app, /<aba-customer-workspace/);
  assert.match(workspace, /<aba-customer-directory[\s\S]*?\[customers\]="customers\(\)"/);
  assert.doesNotMatch(app, /<aba-record-table[^>]*\[ariaLabel\]="t\('جدول العملاء'/);
});

test('customer directory supports accessible sorting in desktop and mobile layouts', () => {
  assert.match(component, /aria-sort/);
  assert.match(component, /toggleSort\('name'\)/);
  assert.match(component, /onMobileSortChange\(\$event\)/);
  assert.match(component, /sortCustomers\(this\.customers\(\)/);
  assert.match(sortHelper, /new Intl\.Collator\(locale/);
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
  assert.match(css, /customer-directory__mobile-sort select\{[^}]*min-height:44px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /forced-colors:active/);
});

test('customer screen preserves workspace search, owner CSV affordance and statement workflow', () => {
  assert.match(workspace, /customer-workspace__search/);
  assert.match(workspace, /this\.api\.customers\(requested\.businessId, this\.offset, this\.pageSize, this\.searchQuery\)/);
  assert.match(app, /business\?\.role === 'owner'[\s\S]*?csv-import-panel/);
  assert.match(app, /<section abaCard class="panel statement-panel">/);
  assert.match(app, /openCustomerStatementById\(customerId: string\)/);
  assert.match(app, /showCustomerInvoices\(customer\.id\)/);
  assert.match(app, /customerStatementTableColumns/);
  assert.match(app, /statementOffset \+ customerStatement\.items\.length/);
});

test('main customer directory exposes guarded pagination beyond the first page', () => {
  assert.match(workspace, /\(click\)="loadMore\(\)"/);
  assert.match(workspace, /loadMore\(\): void/);
  assert.match(workspace, /this\.api\.customers\(requested\.businessId, this\.offset, this\.pageSize, this\.searchQuery\)/);
  assert.match(app, /return this\.loadMoreInvoiceCustomers\(\)/);
  assert.match(app, /fetchPage: \(id, offset\) => this\.api\.customers\(id, offset\)/);
});

test('customer search terms are cleared when the active business or identity changes', () => {
  assert.match(workspace, /this\.searchQuery = '';/);
  assert.match(workspace, /this\.searchDraft\.set\(''\)/);
  assert.match(workspace, /this\.listGuard\.invalidate\(\)/);
  assert.match(workspace, /this\.customers\.set\(\[\]\)/);
});

test('customer create and edit refresh the server-filtered directory after saving', () => {
  const saveStart = workspace.indexOf('async saveCustomer');
  const saveEnd = workspace.indexOf('cancelEditor()', saveStart);
  const saveFlow = workspace.slice(saveStart, saveEnd);
  assert.match(saveFlow, /this\.mode\.set\('profile'\)/);
  assert.match(saveFlow, /void this\.loadCustomers\(true\)/);
});


test('customer editor close is disabled during save and meets the 44px touch target', () => {
  assert.match(editor, /class="customer-editor__close"[\s\S]*?\[disabled\]="busy\(\)"/);
  assert.match(editorCss, /customer-editor__close\{[^}]*flex:0 0 44px;width:44px;height:44px/);
});
