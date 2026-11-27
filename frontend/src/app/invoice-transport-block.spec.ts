// 3A-920 step 4 — the invoice transport block + the proposed driver
// entitlement. The block renders in the invoice editor only while the
// master switch is on; issuing an invoice with a driver + trips raises
// a PROPOSED entitlement that payroll confirms into an ordinary draft
// record — nothing is ever posted automatically. The backend behavior
// is covered by backend/tests/test_invoice_transport_block.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { toInvoiceDraftPayload, validateInvoiceDraft } from './invoice-draft.ts';
import type {
  InvoiceDraftCustomer,
  InvoiceDraftInput,
  InvoiceDraftLine,
  InvoiceDraftProduct,
} from './invoice-draft.ts';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const editor = readFileSync(resolve(appDirectory, 'invoice-draft-editor.component.ts'), 'utf8');
const shell = readFileSync(resolve(appDirectory, 'app.component.ts'), 'utf8');
// 3A-921 F1b: the detail drawer lives in its own component now.
const drawer = readFileSync(resolve(appDirectory, 'invoice-detail-drawer.component.ts'), 'utf8');
const payroll = readFileSync(resolve(appDirectory, 'employee-payroll.component.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const backendPayroll = readFileSync(resolve(appDirectory, '../../../backend/app/employee_payroll_api.py'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

const products: InvoiceDraftProduct[] = [{ id: 'p1', name: 'Sand', unit: 'meter', unit_price: '10.00' }];
const customers: InvoiceDraftCustomer[] = [{ id: 'c1', name: 'Customer One' }];
const line: InvoiceDraftLine = {
  id: 'l1', kind: 'product', product_id: 'p1', description: '', quantity: '3', unit_price: '',
};
const baseInput = (extra: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput => ({
  invoice_number: 'INV-100', currency_code: 'egp', customer_id: 'c1', lines: [line], ...extra,
});

test('draft payload carries the transport block, or explicit nulls without one', () => {
  const withBlock = toInvoiceDraftPayload(baseInput({
    driver_employee_id: 'e1', transport_trips: '3', transport_from: ' Depot ', transport_to: 'Site',
  }), products, customers);
  assert.equal(withBlock.driver_employee_id, 'e1');
  assert.equal(withBlock.transport_trips, 3);
  assert.equal(withBlock.transport_from, 'Depot');
  assert.equal(withBlock.transport_to, 'Site');

  const without = toInvoiceDraftPayload(baseInput(), products, customers);
  assert.equal(without.driver_employee_id, null);
  assert.equal(without.transport_trips, null);
  assert.equal(without.transport_from, null);
  assert.equal(without.transport_to, null);
});

test('validation keeps the transport block all-or-nothing', () => {
  assert.equal(validateInvoiceDraft(baseInput(), products, customers), null);
  assert.equal(
    validateInvoiceDraft(baseInput({ driver_employee_id: 'e1', transport_trips: '3' }), products, customers),
    null,
  );
  assert.equal(
    validateInvoiceDraft(baseInput({ driver_employee_id: 'e1' }), products, customers),
    'invoiceDraft.validation.transportPair',
  );
  assert.equal(
    validateInvoiceDraft(baseInput({ transport_trips: '3' }), products, customers),
    'invoiceDraft.validation.transportPair',
  );
  assert.equal(
    validateInvoiceDraft(baseInput({ transport_from: 'Depot' }), products, customers),
    'invoiceDraft.validation.transportPair',
  );
  assert.equal(
    validateInvoiceDraft(baseInput({ driver_employee_id: 'e1', transport_trips: '0' }), products, customers),
    'invoiceDraft.validation.transportTrips',
  );
  assert.equal(
    validateInvoiceDraft(baseInput({ driver_employee_id: 'e1', transport_trips: '2.5' }), products, customers),
    'invoiceDraft.validation.transportTrips',
  );
  assert.equal(
    validateInvoiceDraft(baseInput({
      driver_employee_id: 'e1', transport_trips: '1', transport_from: 'x'.repeat(201),
    }), products, customers),
    'invoiceDraft.validation.transportPlaceLength',
  );
  for (const key of ['transportPair', 'transportTrips', 'transportPlaceLength']) {
    assert.equal(typeof arabic.invoiceDraft.validation[key], 'string');
    assert.equal(typeof english.invoiceDraft.validation[key], 'string');
  }
});

test('editor renders the block only while the switch is on and submits it gated', () => {
  assert.ok(editor.includes('@if (transportEnabled) {'));
  assert.ok(editor.includes("t('ui.invoices.transport.title')"));
  assert.ok(editor.includes('@Input() drivers: InvoiceDraftDriver[] = [];'));
  assert.ok(editor.includes('@Input() transportUnitName = \'\';'));
  assert.ok(editor.includes('[(ngModel)]="driverId"'));
  assert.ok(editor.includes('[(ngModel)]="transportTrips"'));
  assert.ok(editor.includes("t('ui.invoices.transport.trips', { unit: transportUnitName })"));
  assert.ok(editor.includes('driver_employee_id: this.transportEnabled ? (this.driverId || null) : null'));
  assert.ok(editor.includes('this.transportOpen = !!this.driverId;'));
});

test('shell feeds drivers + initials to the editor and shows the block in the drawer', () => {
  assert.ok(shell.includes('[drivers]="invoiceDrivers"'));
  assert.ok(shell.includes('[initialDriverId]="invoiceDraftDriverId"'));
  assert.ok(shell.includes('[transportUnitName]="transportUnitName"'));
  assert.ok(shell.includes('employee.is_driver && employee.is_active'));
  assert.ok(shell.includes('setInvoiceDraftTransport(detail);'));
  assert.ok(drawer.includes('@if (detail.driver_employee_id) {'));
  assert.ok(drawer.includes('transportStatusLabel(detail.transport_entitlement_status)'));
  // The wage reaches the client only through the owner-only detail fields.
  assert.ok(apiService.includes('transport_trip_wage?: string | null; transport_entitlement_amount?: string | null;'));
});

test('payroll queue is switch-gated and confirms into payroll; api matches the backend routes', () => {
  assert.ok(payroll.includes('@if (transportEnabled && entitlements.length) {'));
  assert.ok(payroll.includes('this.transportEnabled ? await this.api.transportEntitlements(businessId) : []'));
  assert.ok(payroll.includes('confirmEntitlement(item: TransportEntitlement)'));
  assert.ok(payroll.includes('dismissEntitlement(item: TransportEntitlement)'));
  assert.ok(payroll.includes("t('ui.employees.transportEntitlements.title')"));
  assert.ok(apiService.includes('transportEntitlements(businessId: string): Promise<TransportEntitlement[]>'));
  assert.ok(apiService.includes('confirmTransportEntitlement(businessId: string, invoiceId: string, period?: string)'));
  assert.ok(apiService.includes('dismissTransportEntitlement(businessId: string, invoiceId: string)'));
  assert.ok(apiService.includes('/transport-entitlements/${encodeURIComponent(invoiceId)}/confirm'));
  assert.ok(backendPayroll.includes('"/transport-entitlements"'));
  assert.ok(backendPayroll.includes('"/transport-entitlements/{invoice_id}/confirm"'));
  assert.ok(backendPayroll.includes('"/transport-entitlements/{invoice_id}/dismiss"'));
});

test('transport copy exists in both catalogs and names no trade', () => {
  for (const catalog of [arabic, english]) {
    assert.equal(typeof catalog.ui.invoices.transport.title, 'string');
    assert.equal(typeof catalog.ui.invoices.transport.driver, 'string');
    assert.equal(typeof catalog.ui.employees.transportEntitlements.title, 'string');
    assert.equal(typeof catalog.ui.employees.transportEntitlements.confirm, 'string');
  }
  const serialized = JSON.stringify(arabic.ui.invoices.transport) + JSON.stringify(arabic.ui.employees.transportEntitlements);
  assert.ok(!serialized.includes('شونة'));
});
