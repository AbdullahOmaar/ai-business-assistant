import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const component=readFileSync(new URL('./shared/ui/aba-record-table.component.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../design-system.css',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.component.ts',import.meta.url),'utf8');
test('shared record table exposes semantic columns and stable row actions',()=>{
  assert.match(component,/<table>/);assert.match(component,/<caption class="aba-record-table__visually-hidden">/);
  assert.match(component,/<th scope="col">/);assert.match(component,/\[attr\.data-label\]="column\.label"/);
  assert.match(component,/rowAction\.emit\(\{rowId,actionId,anchor\}\)/);
});
test('record table includes loading and empty recovery states',()=>{
  assert.match(component,/kind="loading"/);assert.match(component,/kind="empty"/);assert.match(component,/rows\(\)\.length/);
});
test('phone layout renders labeled record cards with touch-sized row actions',()=>{
  assert.match(css,/\.aba-record-table tbody tr\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.aba-record-table tbody td::before\{content:attr\(data-label\)/);
  assert.match(css,/\.aba-record-table table\{display:block;min-width:0/);
  assert.match(css,/\.aba-record-table__action\{[^}]*min-height:44px/);
});
test('Customers, Products, Suppliers and Purchasing use the shared record contract',()=>{
  for(const key of ['customerTableRows','productTableRows','supplierTableRows','purchaseTableRows'])assert.ok(app.includes('[rows]="'+key+'"'));
  assert.match(app,/business\?\.role==='owner'&&this\.canReceivePurchaseOrder\(order\)/);
  assert.match(app,/this\.requestPurchaseOrderReceipt\(order,action\.anchor\)/);
});
