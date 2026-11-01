import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

function methodBetween(startMarker: string, endMarker: string): string {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method range: ${startMarker}`);
  return app.slice(start, end);
}

const createSupplier = methodBetween(
  'async createSupplier(): Promise<void>',
  'async createPurchaseOrder(): Promise<void>',
);
const createPurchaseOrder = methodBetween(
  'async createPurchaseOrder(): Promise<void>',
  'hasRemainingQuantity(line:',
);
const receivePurchaseOrder = methodBetween(
  'async receivePurchaseOrder(order: PurchaseOrder): Promise<void>',
  'async createRecurringSchedule(): Promise<void>',
);
const clearWorkspaceData = methodBetween('clearWorkspaceData(): void', 'private captureTenantRequest(');

test('supplier creation fences delayed completion before clearing the next workspace form', () => {
  assert.match(createSupplier, /this\.supplierMutationGuard\.begin\(\)/);
  assert.match(createSupplier, /this\.captureTenantRequest\(businessId\)/);
  const save = createSupplier.indexOf('await this.api.createSupplier(businessId, payload)');
  const afterSaveGuard = createSupplier.indexOf('if (!isCurrent()) return;', save);
  const clearForm = createSupplier.indexOf("this.supplierName = ''", save);
  assert.ok(save >= 0 && afterSaveGuard > save && clearForm > afterSaveGuard);
  const refresh = createSupplier.indexOf('await this.api.suppliers(businessId)');
  const beforeUpdate = createSupplier.indexOf('if (!isCurrent()) return;', refresh);
  const update = createSupplier.indexOf('this.suppliers = items', refresh);
  assert.ok(refresh >= 0 && beforeUpdate > refresh && update > beforeUpdate);
});

test('purchase-order creation fences delayed completion before clearing the next workspace form', () => {
  assert.match(createPurchaseOrder, /this\.purchaseOrderMutationGuard\.begin\(\)/);
  assert.match(createPurchaseOrder, /this\.captureTenantRequest\(businessId\)/);
  const save = createPurchaseOrder.indexOf('await this.api.createPurchaseOrder(businessId, payload)');
  const afterSaveGuard = createPurchaseOrder.indexOf('if (!isCurrent()) return;', save);
  const clearForm = createPurchaseOrder.indexOf("this.purchaseOrderNumber = ''", save);
  assert.ok(save >= 0 && afterSaveGuard > save && clearForm > afterSaveGuard);
  const refresh = createPurchaseOrder.indexOf('await this.api.purchaseOrders(businessId)');
  const beforeUpdate = createPurchaseOrder.indexOf('if (!isCurrent()) return;', refresh);
  const update = createPurchaseOrder.indexOf('this.purchaseOrders = items', refresh);
  assert.ok(refresh >= 0 && beforeUpdate > refresh && update > beforeUpdate);
});

test('purchase receiving remains Owner-only and fences both the mutation and refresh', () => {
  assert.match(receivePurchaseOrder, /this\.business\.role !== 'owner'/);
  assert.match(receivePurchaseOrder, /this\.purchaseReceivingGuard\.begin\(\)/);
  assert.match(receivePurchaseOrder, /this\.captureTenantRequest\(businessId\)/);
  const receive = receivePurchaseOrder.indexOf('await this.api.receivePurchaseOrder(businessId, order.id, lines)');
  const afterReceiveGuard = receivePurchaseOrder.indexOf('if (!isCurrent()) return;', receive);
  const refresh = receivePurchaseOrder.indexOf('const [orders, products, dashboard] = await Promise.all', receive);
  const afterRefreshGuard = receivePurchaseOrder.indexOf('if (!isCurrent()) return;', refresh);
  const update = receivePurchaseOrder.indexOf('this.purchaseOrders = orders', refresh);
  assert.ok(receive >= 0 && afterReceiveGuard > receive && refresh > afterReceiveGuard);
  assert.ok(afterRefreshGuard > refresh && update > afterRefreshGuard);
});

test('workspace reset invalidates every pending supplier and purchasing operation', () => {
  assert.match(clearWorkspaceData, /this\.supplierMutationGuard\.invalidate\(\)/);
  assert.match(clearWorkspaceData, /this\.purchaseOrderMutationGuard\.invalidate\(\)/);
  assert.match(clearWorkspaceData, /this\.purchaseReceivingGuard\.invalidate\(\)/);
});

test('supplier and purchasing API methods remain explicitly workspace-scoped', () => {
  for (const method of ['suppliers', 'createSupplier', 'purchaseOrders', 'createPurchaseOrder', 'receivePurchaseOrder']) {
    const start = api.indexOf(`${method}(businessId: string`);
    assert.ok(start >= 0, `Missing workspace-scoped API method: ${method}`);
    const end = api.indexOf('\n  }', start);
    assert.ok(end > start);
    assert.match(api.slice(start, end), /encodeURIComponent\(businessId\)/);
  }
});
