import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';
const component=readFileSync(new URL('./shared/ui/aba-record-table.component.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../design-system.css',import.meta.url),'utf8');
const appRaw=readFileSync(new URL('./app.component.ts',import.meta.url),'utf8')+'\n'+readFileSync(new URL('./app.component.css',import.meta.url),'utf8');
const app=expandTranslationCalls(appRaw);
const customerDirectory=readFileSync(new URL('./customer-directory.component.ts',import.meta.url),'utf8');
const productCatalog=readFileSync(new URL('./product-catalog.component.ts',import.meta.url),'utf8');
const customerWorkspace=readFileSync(new URL('./customer-workspace.component.ts',import.meta.url),'utf8');
const productWorkspace=readFileSync(new URL('./product-workspace.component.ts',import.meta.url),'utf8');
const purchasingWorkspace=readFileSync(new URL('./purchasing-workspace.component.ts',import.meta.url),'utf8');
// 3A-351: the ageing due-date call site moved with the reports workspace.
const reportsWorkspace=expandTranslationCalls(readFileSync(new URL('./reports-workspace.component.ts',import.meta.url),'utf8'));
test('shared record table exposes semantic columns and stable row actions',()=>{
  assert.match(component,/<table>/);assert.match(component,/<caption class="aba-record-table__visually-hidden">/);
  assert.match(component,/<th scope="col" \[attr\.aria-sort\]="sortAria\(column\.key\)"/);assert.match(component,/<th scope="row"/);
  assert.match(component,/\[attr\.data-label\]="column\.label"/);
  assert.match(component,/\[attr\.aria-label\]="actionAriaLabel\(row,action\)"/);
  assert.match(component,/actionAriaLabel\(row:AbaRecordTableRow,action:AbaRecordTableAction\)/);
  assert.match(component,/rowAction\.emit\(\{rowId,actionId,anchor\}\)/);
});
test('record table includes loading and empty recovery states',()=>{
  assert.match(component,/kind="loading"/);assert.match(component,/kind="empty"/);assert.match(component,/rows\(\)\.length/);
});
test('phone layout renders labeled record cards with touch-sized row actions',()=>{
  assert.match(css,/\.aba-record-table tbody tr\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.aba-record-table tbody :is\(td,th\)::before\{content:attr\(data-label\)/);
  assert.match(css,/\.aba-record-table tbody :is\(td,th\)\.aba-record-table__primary-cell/);
  assert.match(css,/\.aba-record-table table\{display:block;min-width:0/);
  assert.match(css,/\.aba-record-table__action\{[^}]*min-height:44px/);
});
test('Customers, Products and Purchasing use dedicated workspaces while Suppliers retain the shared record contract',()=>{
  assert.match(app,/<aba-customer-workspace/);assert.match(customerWorkspace,/<aba-customer-directory[\s\S]*?\[customers\]="customers\(\)"/);
  assert.doesNotMatch(app,/customerTableRows|customerTableColumns/);
  assert.match(app,/<aba-product-workspace/);assert.match(productWorkspace,/<aba-product-catalog[\s\S]*?\[products\]="products\(\)"/);
  assert.doesNotMatch(app,/productTableRows|productTableColumns/);
  assert.ok(app.includes('[rows]="supplierTableRows"'));
  assert.match(app,/<aba-purchasing-workspace/);
  assert.ok(purchasingWorkspace.includes('this.api.purchaseOrders'));
  assert.ok(purchasingWorkspace.includes('this.api.purchaseOrderDetail'));
  assert.ok(purchasingWorkspace.includes('this.api.purchaseOrderReceipts'));
  assert.ok(purchasingWorkspace.includes('this.api.purchaseOrderActivity'));
  assert.ok(purchasingWorkspace.includes('this.api.approvePurchaseOrder'));
  assert.ok(purchasingWorkspace.includes('this.api.receivePurchaseOrder'));
});

test('record table labels and loading states follow the selected app locale',()=>{
  assert.ok(app.includes('Loading customers') || app.includes('Loading suppliers'));
  assert.ok(purchasingWorkspace.includes("t('loading')"));
  assert.ok(purchasingWorkspace.includes("this.localization.translate('purchasingWorkspace.' + key)"));
  assert.match(component, /resolvedActionsHeading/);
  assert.match(component, /this\.localization\.translate\('ui\.actions'\)/);
  assert.match(customerDirectory, /t\('customerDirectory\.m_/);
  assert.match(productCatalog, /t\('productCatalog\.m_/);
  assert.match(appRaw, /t\('ui\.m_/);
  assert.match(customerDirectory, /customerDirectory\.m_/);
  assert.match(productCatalog, /productCatalog\.m_/);
});

test('record dates remain localized after moving legacy lists into tables', () => {
  for (const fragment of [
    'formatRecordDate(item.received_at)',
    'formatRecordDate(item.incurred_at)',
    'formatRecordDate(item.next_run_at)',
    'formatRecordDate(item.scheduled_at)',
    "formatRecordDate(item.created_at,'short')",
    'map((event,index)=>({',
    'event.source_id',
    "event.invoice_id||''",
    'event.occurred_at',
  ]) assert.ok(app.includes(fragment), 'missing localized date or stable key: '+fragment);
  // 3A-351: the ageing due date formats inside the reports workspace now.
  assert.ok(reportsWorkspace.includes("formatRecordDate(invoice.due_date,'date')"),
    'missing localized date or stable key: formatRecordDate(invoice.due_date,\'date\')');
});


test('customer directory exposes only supported customer details and existing navigation actions', () => {
  assert.doesNotMatch(customerDirectory, /customerInvoiceCount|invoiceCount/);
  assert.match(customerDirectory, /customer\.name/);
  assert.match(customerDirectory, /customer\.email/);
  assert.match(customerDirectory, /customer\.phone/);
  assert.match(customerDirectory, /emitAction\(customer\.id, 'invoices'/);
  assert.match(customerDirectory, /emitAction\(customer\.id, 'statement'/);
  assert.match(app, /item\.allocations\.length/);
});


test('shared motion uses short purposeful feedback and honors reduced-motion preferences',()=>{
  assert.match(css,/--aiba-motion-fast:/);
  assert.match(css,/--aiba-motion-standard:/);
  assert.match(css,/--aiba-motion-standard-duration: 190ms/);
  assert.match(css,/transition-duration: var\(--aiba-motion-standard-duration\)/);
  assert.match(css,/transition-timing-function: var\(--aiba-motion-standard-easing\)/);
  assert.match(css,/--aiba-motion-spring:/);
  assert.match(css,/@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css,/\.nav-item\.active \.nav-icon/);
  assert.match(css,/\.home-shortcut-link:active/);
  assert.match(css,/@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(css,/aiba-motion-menu-enter/);
  assert.match(css,/animation: none !important/);
});


test('mobile record cards surface primary fields before secondary date metadata', () => {
  assert.match(css, /\.aba-record-table tbody :is\(td,th\)\.aba-record-table__primary-cell\{grid-column:1\/-1;order:-1;/);

  const contracts = [
    ['expenseTableColumns', 'date', 'description'],
    ['auditTableColumns', 'date', 'action'],
    ['customerStatementTableColumns', 'date', 'event'],
  ];

  for (const [getter, dateKey, primaryKey] of contracts) {
    const start = app.indexOf('get ' + getter);
    assert.ok(start >= 0, 'missing column contract: ' + getter);
    const next = app.indexOf('\n  get ', start + 4);
    const block = app.slice(start, next < 0 ? app.length : next);
    const datePosition = block.indexOf("key:'" + dateKey + "'");
    const primaryPosition = block.indexOf("key:'" + primaryKey + "'");
    assert.ok(datePosition >= 0 && primaryPosition > datePosition, 'expected date-first source order: ' + getter);
    assert.match(block.slice(primaryPosition, primaryPosition + 100), /primary:true/);
  }
});


test('shared record tables sort locally with keyboard-accessible, semantic direction feedback',()=>{
  assert.match(component, /\[attr\.aria-sort\]="sortAria\(column\.key\)"/);
  assert.match(component, /\(click\)="toggleSort\(column\)"/);
  assert.match(component, /\[attr\.aria-pressed\]="isSortActive\(column\.key\)"/);
  assert.match(component, /get sortedRows\(\)/);
  assert.match(component, /isSortActive\(key:string\):boolean/);
  assert.match(component, /new Intl\.Collator\(undefined,\{numeric:true,sensitivity:'base'\}\)/);
  assert.match(component, /this\.sortDirection==='asc'\?result:-result/);
});


// Routine (B) revision 2026-11-22: the chip row was 288px tall at 195px
// EN (320px AR) — five stacked chips before the first record — which
// conflicts with the owner's compact-cards direction. It is replaced by
// one compact native sort select, the same mobile-sort pattern
// customer-directory and product-catalog already use
// (__mobile-sort select, min-height 44px). The thead buttons still leave
// the tab order when stacked (tabindex=-1, still in the accessibility
// tree for screen-reader browse mode). Sorting itself is unchanged.
test('stacked record tables keep sorting reachable without invisible tab stops', () => {
  assert.match(component, /matchMedia\('\(max-width: 760px\)'\)/);
  assert.match(component, /\[attr\.tabindex\]="isStacked\(\) \? -1 : null"/);
  assert.match(component, /this\.localization\.translate\('ui\.m_tpfmbp'\)/);
  // One compact select, inside the rows branch (no control for
  // empty/loading states), before the table viewport. Its aria-label is
  // the "Sort by" key; the placeholder option clears the sort, and each
  // column offers both directions explicitly — a select fires no change
  // event for re-selecting the same value, so direction cannot rely on
  // toggle-on-repeat here.
  const mobileStart = component.indexOf('aba-record-table__mobile-sort');
  assert.ok(mobileStart >= 0, 'missing mobile sort control');
  const mobileBlock = component.slice(mobileStart, component.indexOf('aba-record-table__viewport', mobileStart));
  assert.match(mobileBlock, /<select class="aba-record-table__mobile-sort-select" \[attr\.aria-label\]="sortByLabel\(\)" \[value\]="mobileSortValue" \(change\)="onMobileSortChange\(\$event\)">/);
  assert.match(mobileBlock, /<option value="">\{\{ sortByLabel\(\) \}\}<\/option>/);
  assert.match(mobileBlock, /\[value\]="column\.key \+ ':asc'"/);
  assert.match(mobileBlock, /\[value\]="column\.key \+ ':desc'"/);
  assert.match(mobileBlock, /\{\{column\.label\}\} ↑/);
  assert.match(mobileBlock, /\{\{column\.label\}\} ↓/);
  // The change handler drives the same sort state the thead buttons use;
  // the value is a plain getter (not a computed) because the sort fields
  // are plain fields, so a computed would never re-evaluate.
  assert.match(component, /onMobileSortChange\(event:Event\):void\{/);
  assert.match(component, /get mobileSortValue\(\):string\{/);
  // CSS: control hidden by default, shown as one compact row at ≤760px;
  // the thead clip itself is unchanged (screen readers still get the headers).
  assert.match(css, /\.aba-record-table__mobile-sort\{display:none\}/);
  assert.match(css, /@media\(max-width:760px\)\{[\s\S]*?\.aba-record-table__mobile-sort\{display:block/);
  assert.match(css, /\.aba-record-table__mobile-sort-select\{[^}]*min-height:44px/);
  assert.match(css, /\.aba-record-table thead\{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect\(0,0,0,0\);white-space:nowrap;border:0\}/);
  // No chip row left anywhere in the component or the CSS.
  assert.doesNotMatch(component, /aba-record-table__mobile-sort-button/);
  assert.doesNotMatch(css, /aba-record-table__mobile-sort-button/);
});

// each numeric cell ~70px, so "548525.00 EGP" splits mid-number ("548525.0
// 0 EGP") and the date splits ("10/11/20 26"). Below 320px the card is a
// single column and numeric cells keep white-space:nowrap.
// T18 Slice U02 (2026-11-21): at 195/220px a two-column record card gives
// each numeric cell ~70px, so "548525.00 EGP" splits mid-number ("548525.0
// 0 EGP") and the date splits ("10/11/20 26"). Below 320px the card is a
// single column and numeric cells keep white-space:nowrap.
test('record cards become a single column below 320px and keep amounts intact', () => {
  assert.match(css, /@media\(max-width:320px\)\{[\s\S]*?\.aba-record-table tbody tr\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /@media\(max-width:320px\)\{[\s\S]*?\.aba-record-table tbody td\[data-kind="numeric"\]\{white-space:nowrap;overflow-wrap:normal;text-align:start\}/);
  // The two-column card and the normal-wrapping numeric cells at 390px are
  // unchanged (the 760px rule still applies there).
  assert.match(css, /\.aba-record-table tbody tr\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.aba-record-table tbody td\[data-kind="numeric"\]\{white-space:normal;text-align:start\}/);
});
