// 3A-920 step 3 — selling by the second unit on invoice lines. A line
// sold in the second unit is priced at unit_price x factor (the server
// prices product lines from the catalogue) and snapshots the sold unit,
// so issue / void / return math stays exact if the product's factor
// changes later. The selector renders only while the transport switch
// is on and only for products that have a second unit. The backend
// pricing + stock math are covered by
// backend/tests/test_invoice_second_unit.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  invoiceDraftLinesFromExisting,
  toInvoiceDraftPayload,
  validateInvoiceDraft,
} from './invoice-draft.ts';
import type {
  InvoiceDraftCustomer,
  InvoiceDraftInput,
  InvoiceDraftLine,
  InvoiceDraftProduct,
} from './invoice-draft.ts';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(resolve(appDirectory, 'invoice-draft-editor.component.ts'), 'utf8');
const shell = readFileSync(resolve(appDirectory, 'app.component.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

const products: InvoiceDraftProduct[] = [{
  id: 'p1', name: 'Sand', unit: 'meter', unit_price: '10.00',
  second_unit_name: 'trip', conversion_factor: '4',
}];
const plainProducts: InvoiceDraftProduct[] = [{ id: 'p2', name: 'Cement', unit: 'bag', unit_price: '50.00' }];
const customers: InvoiceDraftCustomer[] = [{ id: 'c1', name: 'Customer One' }];

const tripLine: InvoiceDraftLine = {
  id: 'l1', kind: 'product', product_id: 'p1', description: '', quantity: '3', unit_price: '', unit: 'trip',
};
const validInput = (lines: readonly InvoiceDraftLine[] = [tripLine]): InvoiceDraftInput => ({
  invoice_number: 'INV-100', currency_code: 'egp', customer_id: 'c1', lines,
});

test('draft payload carries the selling unit for product lines only', () => {
  const payload = toInvoiceDraftPayload(validInput(), products, customers);
  assert.deepEqual(payload.lines, [{ product_id: 'p1', quantity: '3', unit: 'trip' }]);
  const base = toInvoiceDraftPayload(validInput([{ ...tripLine, unit: '' }]), products, customers);
  assert.deepEqual(base.lines, [{ product_id: 'p1', quantity: '3' }]);
  const manual: InvoiceDraftLine = {
    id: 'l2', kind: 'manual', product_id: '', description: 'Delivery', quantity: '1', unit_price: '25.00',
  };
  const manualPayload = toInvoiceDraftPayload(validInput([manual]), products, customers);
  assert.deepEqual(manualPayload.lines, [{ description: 'Delivery', quantity: '1', unit_price: '25.00' }]);
});

test('validation rejects a stale second unit the product no longer has', () => {
  assert.equal(validateInvoiceDraft(validInput(), products, customers), null);
  assert.equal(
    validateInvoiceDraft(validInput(), plainProducts, customers),
    'invoiceDraft.validation.catalogProduct',
  );
  const stale = validateInvoiceDraft(
    validInput([{ ...tripLine, product_id: 'p2' }]),
    [...products, ...plainProducts],
    customers,
  );
  assert.equal(stale, 'invoiceDraft.validation.lineUnit');
  assert.equal(typeof arabic.invoiceDraft.validation.lineUnit, 'string');
  assert.equal(typeof english.invoiceDraft.validation.lineUnit, 'string');
});

test('existing lines restore their sold unit when a draft is re-opened', () => {
  const lines = invoiceDraftLinesFromExisting([{
    product_id: 'p1', description: 'Sand', quantity: '3.000', unit_price: '40.00', sold_unit: 'trip',
  }]);
  assert.equal(lines[0].unit, 'trip');
  assert.equal(lines[0].kind, 'product');
});

test('editor shows the unit selector only while transport is on, for second-unit products', () => {
  assert.ok(editor.includes('@Input() transportEnabled = false;'));
  assert.ok(editor.includes('@if (transportEnabled && lineProduct(line)?.second_unit_name) {'));
  assert.ok(editor.includes(`[name]="'unit-' + line.id"`));
  assert.ok(editor.includes('[(ngModel)]="line.unit"'));
  assert.ok(editor.includes("t('ui.products.secondUnit.sellUnit')"));
  // The base option is the product's own base unit; the second option is its second unit.
  assert.ok(editor.includes('<option value="">{{ lineProduct(line)?.unit || \'unit\' }}</option>'));
  assert.ok(editor.includes('<option [value]="lineProduct(line)?.second_unit_name">'));
});

test('editor prices the line per the chosen unit and resets the unit on product change', () => {
  assert.ok(editor.includes('linePrice(line: InvoiceDraftLine): string'));
  assert.ok(editor.includes('Number(product.unit_price) * Number(product.conversion_factor)'));
  assert.ok(editor.includes('[value]="linePrice(line) || \'—\'"'));
  assert.ok(editor.includes('(ngModelChange)="selectProduct(line)"'));
  assert.ok(editor.includes("line.unit = '';"));
  assert.ok(editor.includes('unit: \'\''));
});

test('shell loads the transport flag and passes it to the editor; detail shows the sold unit', () => {
  assert.ok(shell.includes("from './transport-settings';"));
  assert.ok(shell.includes('transportEnabledFromSettings'));
  assert.ok(shell.includes('transportEnabled = false;'));
  assert.ok(shell.includes('this.api.listSettings(id).catch(() => []),'));
  assert.ok(shell.includes('this.transportEnabled = transportEnabledFromSettings(settings);'));
  assert.ok(shell.includes('[transportEnabled]="transportEnabled"'));
  assert.ok(shell.includes('@if (line.sold_unit) { {{ line.sold_unit }} }'));
  assert.ok(apiService.includes('sold_unit?: string | null; conversion_factor?: string | null;'));
  assert.ok(apiService.includes('unit?: string }'));
});
