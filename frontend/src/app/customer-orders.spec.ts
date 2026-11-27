// 3A-923 C4 step 3 — the «طلبات العملاء» section inside the invoices
// tab: pins the workspace seam (data-owning component, invoices-tab
// placement, convert-opens-draft wiring), the transport gate (the
// delivery block renders only while the switch is on), the horizontal
// row actions, and ar/en parity for the new i18n namespace. Backend
// behavior (state machine, pricing, transport gates, tenant isolation)
// is covered by backend/tests/test_customer_orders.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(appDirectory, 'customer-orders.component.ts'), 'utf8');
const shell = readFileSync(resolve(appDirectory, 'app.component.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

test('orders section is a data-owning workspace (taxes pattern)', () => {
  assert.ok(component.includes("selector: 'aba-customer-orders'"));
  assert.ok(component.includes('readonly businessId = input.required<string>()'));
  assert.ok(component.includes('readonly userId = input.required<string>()'));
  assert.ok(component.includes('readonly signedIn = input.required<boolean>()'));
  assert.ok(component.includes('new WorkspaceLoadGuard()'));
  assert.ok(component.includes('runTenantScopedRequest('));
  assert.ok(component.includes('void this.loadOrders()'));
  // The list loads for every member — orders are not owner-only
  // (unlike the taxes summary); there must be no owner gate on load.
  assert.doesNotMatch(component, /loadOrders\(\)[\s\S]{0,400}role\(\) !== 'owner'/);
});

test('api.service exposes the six order methods', () => {
  for (const method of [
    'customerOrders(businessId: string',
    'createCustomerOrder(businessId: string',
    'updateCustomerOrder(businessId: string',
    'confirmCustomerOrder(businessId: string',
    'cancelCustomerOrder(businessId: string',
    'convertCustomerOrder(businessId: string',
  ]) {
    assert.ok(apiService.includes(method), `missing api method: ${method}`);
  }
  assert.ok(apiService.includes('export interface CustomerOrder {'));
  assert.ok(apiService.includes('export interface CustomerOrderLine {'));
  assert.ok(apiService.includes("status: 'draft' | 'confirmed' | 'fulfilled' | 'cancelled'"));
  assert.ok(apiService.includes('/orders'));
});

test('delivery block renders only while the transport switch is on', () => {
  // Editor delivery fields.
  assert.ok(component.includes('@if (transportEnabled()) {'));
  assert.ok(component.includes("t('ui.customerOrders.delivery')"));
  assert.ok(component.includes("t('ui.customerOrders.driver')"));
  // Delivery fields are only sent while the switch is on.
  assert.ok(component.includes('...(this.transportEnabled() ? {'));
  assert.ok(component.includes('driver_employee_id: this.editorDriverId || null'));
  // The unit selector renders only while the switch is on AND the
  // product actually has a second unit (same rule as the invoice editor).
  assert.ok(component.includes("transportEnabled() && lineProduct(line)?.second_unit_name"));
  // The section itself is NOT switch-gated: plain orders list and work
  // with the switch off.
  assert.doesNotMatch(component, /@if \(transportEnabled\(\)\) \{\s*<aba-section-header/);
});

test('row actions sit in one horizontal row; confirm/cancel are owner-only', () => {
  assert.ok(component.includes('class="order-actions"'));
  assert.ok(component.includes('.order-actions{display:flex'));
  assert.ok(component.includes("t('ui.customerOrders.confirm')"));
  assert.ok(component.includes("t('ui.customerOrders.convert')"));
  assert.ok(component.includes("t('ui.customerOrders.cancelOrder')"));
  assert.ok(component.includes("@if (isOwner && order.status === 'draft')"));
  assert.ok(component.includes("@if (isOwner && (order.status === 'draft' || order.status === 'confirmed'))"));
});

test('convert opens the created invoice draft through the shell', () => {
  assert.ok(component.includes('readonly openInvoice = output<string>()'));
  assert.ok(component.includes('if (converted.converted_invoice_id) this.openInvoice.emit(converted.converted_invoice_id)'));
  assert.ok(shell.includes("import { CustomerOrdersComponent } from './customer-orders.component';"));
  assert.ok(shell.includes('CustomerOrdersComponent, InvoiceDetailDrawerComponent,'));
  assert.ok(shell.includes('<aba-customer-orders'));
  assert.ok(shell.includes("(openInvoice)=\"openConvertedInvoice($event)\""));
  assert.ok(shell.includes('[transportEnabled]="transportEnabled"'));
  assert.ok(shell.includes('[drivers]="invoiceDrivers"'));
  assert.ok(shell.includes('async openConvertedInvoice(invoiceId: string): Promise<void>'));
});

test('every customerOrders key used by the component exists in ar and en', () => {
  const used = new Set<string>();
  for (const match of component.matchAll(/t\('ui\.customerOrders\.([A-Za-z]+)'/g)) used.add(match[1]);
  for (const status of ['statusDraft', 'statusConfirmed', 'statusFulfilled', 'statusCancelled']) used.add(status);
  assert.ok(used.size >= 30, `expected 30+ keys, got ${used.size}`);
  for (const key of used) {
    assert.ok(key in arabic.ui.customerOrders, `missing ar key: ${key}`);
    assert.ok(key in english.ui.customerOrders, `missing en key: ${key}`);
  }
  const arKeys = Object.keys(arabic.ui.customerOrders).sort();
  const enKeys = Object.keys(english.ui.customerOrders).sort();
  assert.deepEqual(arKeys, enKeys, 'ar/en customerOrders key sets must match');
});
