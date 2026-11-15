import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./purchasing-workspace.component.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('purchase order API client covers tenant-scoped detail, draft update, cancel and histories', () => {
  assert.match(api, /purchaseOrderDetail\(businessId: string, orderId: string\)/);
  assert.match(api, /updatePurchaseOrder\(businessId: string, orderId: string, body: PurchaseOrderInput\)/);
  assert.match(api, /'PUT'/);
  assert.match(api, /cancelPurchaseOrder\(businessId: string, orderId: string\)/);
  assert.match(api, /\/cancel/);
  assert.match(api, /purchaseOrderReceipts\(businessId: string, orderId: string/);
  assert.match(api, /\/receipts\?/);
  assert.match(api, /purchaseOrderActivity\(businessId: string, orderId: string/);
  assert.match(api, /\/activity\?/);
});

test('purchasing workspace supports multi-line create and draft edit with finite positive quantities', () => {
  assert.match(workspace, /formLines: PurchaseDraftLine\[\]/);
  assert.match(workspace, /addLine\(\)/);
  assert.match(workspace, /removeLine\(index: number\)/);
  assert.match(workspace, /updatePurchaseOrder/);
  assert.match(workspace, /Number\(line\.quantity\) <= 0/);
  assert.match(workspace, /Number\(line\.unit_cost\) < 0/);
  assert.match(workspace, /is_stock_tracked/);
});

test('members can create drafts while owner-only lifecycle controls remain fail-closed', () => {
  assert.ok(workspace.includes('startCreate(): void'));
  assert.ok(workspace.includes('this.api.createPurchaseOrder'));
  assert.match(workspace, /isOwner\(\): boolean/);
  assert.match(workspace, /canEdit\(order: PurchaseOrder\): boolean \{ return this\.isOwner\(\) && order\.status === 'draft'/);
  assert.match(workspace, /canApprove\(order: PurchaseOrder\): boolean \{ return this\.isOwner\(\) && order\.status === 'draft'/);
  assert.match(workspace, /canCancel\(order: PurchaseOrder\): boolean \{ return this\.isOwner\(\) && order\.status === 'draft'/);
  assert.match(workspace, /canReceive\(order: PurchaseOrderDetail\)/);
  assert.match(workspace, /this\.api\.approvePurchaseOrder/);
  assert.match(workspace, /this\.api\.cancelPurchaseOrder/);
  assert.match(workspace, /this\.api\.receivePurchaseOrder/);
});

test('partial receipt validates against each line remaining quantity and uses idempotent API', () => {
  assert.match(workspace, /quantity > remaining/);
  assert.match(workspace, /this\.api\.receivePurchaseOrder\(requested\.businessId, order\.id, lines\)/);
  assert.match(workspace, /receiptDraft/);
  assert.match(workspace, /remaining_quantity/);
});

test('detail and read-only receipt/activity history are tenant fenced and responsive', () => {
  assert.match(workspace, /purchaseOrderDetail/);
  assert.match(workspace, /purchaseOrderReceipts/);
  assert.match(workspace, /purchaseOrderActivity/);
  assert.match(workspace, /WorkspaceLoadGuard/);
  assert.match(workspace, /current\.userId === requested\.userId/);
  assert.match(workspace, /current\.role === requested\.role/);
  assert.match(workspace, /@media\(max-width:760px\)/);
  assert.match(workspace, /forced-colors:active/);
  assert.match(workspace, /prefers-reduced-motion:reduce/);
});

test('history responses are validated before templates read paginated item lengths', () => {
  assert.ok(workspace.includes("if (!Array.isArray(receipts?.items) || !Array.isArray(activity?.items))"));
  assert.ok(workspace.includes("throw new Error(this.t('loadError'));"));
});

test('purchasing action confirmations use dedicated localized prompt and button keys', () => {
  assert.match(workspace, /approveConfirmationPrompt/);
  assert.match(workspace, /cancelConfirmationPrompt/);
  assert.match(workspace, /confirmActionButton/);
  assert.match(workspace, /cancelConfirmationButton/);
  assert.match(workspace, /pw__confirm/);
});

test('purchasing workspace is mounted in the authenticated app shell', () => {
  assert.match(shell, /import \{ PurchasingWorkspaceComponent \}/);
  assert.match(shell, /<aba-purchasing-workspace/);
  assert.match(shell, /\[role\]="business\.role === 'owner' \? 'owner' : 'staff'"/);
});
