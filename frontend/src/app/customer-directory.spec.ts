import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./customer-directory.component.ts', import.meta.url), 'utf8');
const sortHelper = readFileSync(new URL('./directory-sort.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./customer-directory.component.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
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
  assert.match(component, /emitAction\(customer\.id, 'edit'/);
  assert.match(component, /t\('customerProfile\.edit'\)/);
  assert.match(workspace, /event\.actionId === 'edit'[\s\S]*?editCustomerFromDirectory/);
  assert.match(component, /rowAction\.emit\(\{ rowId, actionId, anchor \}\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /customer-directory__contact a\{[^}]*min-height:44px/);
  assert.match(css, /customer-directory__mobile-sort select\{[^}]*min-height:44px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /forced-colors:active/);
});

test('customer screen preserves workspace search, owner CSV affordance and statement workflow', () => {
  assert.match(workspace, /customer-workspace__search/);
  assert.match(workspace, /this\.api\.customers\(requested\.businessId, this\.offset, this\.pageSize, this\.searchQuery\(\)\)/);
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
  assert.match(workspace, /this\.api\.customers\(requested\.businessId, this\.offset, this\.pageSize, this\.searchQuery\(\)\)/);
  assert.match(app, /return this\.loadMoreInvoiceCustomers\(\)/);
  assert.match(app, /fetchPage: \(id, offset\) => this\.api\.customers\(id, offset\)/);
});

test('customer search terms are cleared when the active business or identity changes', () => {
  assert.match(workspace, /this\.searchQuery\.set\(''\);/);
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


test('customer workspace landmark uses a localized accessible name', () => {
  assert.ok(workspace.includes("[attr.aria-label]=\"t('customerWorkspace.directory')\""));
  assert.doesNotMatch(workspace, /aria-label="Customer workspace"/);
});


test('customer directory distinguishes an empty list from a no-match search', () => {
  assert.match(workspace, /\[emptyTitle\]="searchQuery\(\) \? t\('ui\.m_1lfpojf'\) : t\('ui\.m_v7mhxb'\)"/);
  assert.match(workspace, /\[emptyDescription\]="searchQuery\(\) \? '' : t\('customerWorkspace\.emptyDescription'\)"/);
});


// T18 Slice U02 (2026-11-21): every customer card action has an icon, the
// actions stay readable at 195/220px, the phone number never splits, and the
// sort control stays readable at 220px.
test('customer directory card actions carry icons and stay readable at 195/220px', () => {
  assert.ok(component.includes("import { AbaIconComponent } from './shared/ui/aba-icon.component';"));
  assert.ok(component.includes('imports: [AbaStateMessageComponent, AbaIconComponent]'));
  // One icon per action in each of the two layouts (desktop table + mobile list).
  for (const name of ['document', 'statement', 'edit']) {
    assert.equal((component.match(new RegExp('<aba-icon name="' + name + '" />', 'g')) ?? []).length, 2,
      name + ' icon must render in both layouts');
  }
  // The icon sits next to the label; the buttons keep their 44px touch target.
  assert.match(css, /\.customer-directory__action aba-icon\{width:15px;height:15px\}/);
  assert.match(css, /\.customer-directory__action\{[^}]*gap:5px/);
  // At 195/220px the 3-column grid gives each button ~50px, so the labels
  // break letter-by-letter; below 400px the actions stack full-width.
  // The 400px bound (not 360px) also covers 390px, where "Statement" +
  // icon needs ~82px and the 3-column cell only gives ~80px, so it broke
  // mid-word ("Stateme/nt") at 390px.
  assert.match(css, /@media\(max-width:400px\)\{[\s\S]*?\.customer-directory__actions\{grid-template-columns:minmax\(0,1fr\)\}/);
  // The 3-column grid above 400px is unchanged.
  assert.match(css, /@media\(max-width:480px\)\{[\s\S]*?\.customer-directory__actions\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test('customer directory keeps the phone number on one line and the sort control readable at 220px', () => {
  assert.match(css, /\.customer-directory a\[href\^="tel:"\]\{white-space:nowrap\}/);
  // The email keeps anywhere wrapping: at 195px it cannot fit on one line.
  assert.match(css, /\.customer-directory__contact a\{[^}]*overflow-wrap:anywhere/);
  // At 220px the sort select showed only "Name: A"; below 360px it stacks full-width.
  assert.match(css, /@media\(max-width:360px\)\{[\s\S]*?\.customer-directory__mobile-sort label\{flex-direction:column;align-items:stretch;gap:6px\}/);
  assert.match(css, /@media\(max-width:360px\)\{[\s\S]*?\.customer-directory__mobile-sort select\{flex:1 1 auto;width:100%\}/);
});
