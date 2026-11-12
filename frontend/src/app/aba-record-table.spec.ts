import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const component=readFileSync(new URL('./shared/ui/aba-record-table.component.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../design-system.css',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.component.ts',import.meta.url),'utf8');
const customerDirectory=readFileSync(new URL('./customer-directory.component.ts',import.meta.url),'utf8');
test('shared record table exposes semantic columns and stable row actions',()=>{
  assert.match(component,/<table>/);assert.match(component,/<caption class="aba-record-table__visually-hidden">/);
  assert.match(component,/<th scope="col">/);assert.match(component,/<th scope="row"/);
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
test('Customers and Products use dedicated presentations while Suppliers and Purchasing retain the shared record contract',()=>{
  assert.match(app,/<aba-customer-directory[^>]*\[customers\]="filteredCustomers"/);
  assert.doesNotMatch(app,/customerTableRows|customerTableColumns/);
  assert.match(app,/<aba-product-catalog[^>]*\[products\]="filteredProducts"/);
  assert.doesNotMatch(app,/productTableRows|productTableColumns/);
  for(const key of ['supplierTableRows','purchaseTableRows'])assert.ok(app.includes('[rows]="'+key+'"'));
  assert.match(app,/business\?\.role==='owner'&&this\.canReceivePurchaseOrder\(order\)/);
  assert.match(app,/this\.requestPurchaseOrderReceipt\(order,action\.anchor\)/);
});

test('record table labels and loading states follow the selected app locale',()=>{
  for(const fragment of [
    "[loadingDescription]=\"t('جارٍ تحميل الموردين…', 'Loading suppliers…')\"",
    "[loadingDescription]=\"t('جارٍ تحميل أوامر الشراء…', 'Loading purchase orders…')\"",
    "[actionsHeading]=\"t('الإجراءات', 'Actions')\"",
    "{{ t('إضافة عميل جديد', 'Add new customer') }}",
    "{{ t('إضافة منتج أو خدمة', 'Add product or service') }}",
    "{{ t('إضافة مورد', 'Add supplier') }}",
    "{{ t('إنشاء أمر شراء', 'Create purchase order') }}",
    "{{ t('استيراد العملاء من CSV', 'Import customers from CSV') }}",
    "{{ t('استيراد المنتجات من CSV', 'Import products from CSV') }}",
  ]) assert.ok(app.includes(fragment), 'missing localized record label: '+fragment);
});


test('record dates remain localized after moving legacy lists into tables', () => {
  for (const fragment of [
    'formatRecordDate(item.received_at)',
    'formatRecordDate(item.incurred_at)',
    'formatRecordDate(item.next_run_at)',
    'formatRecordDate(item.scheduled_at)',
    "formatRecordDate(item.created_at,'short')",
    "formatRecordDate(invoice.due_date,'date')",
    'map((event,index)=>({',
    'event.source_id',
    "event.invoice_id||''",
    'event.occurred_at',
  ]) assert.ok(app.includes(fragment), 'missing localized date or stable key: '+fragment);
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
