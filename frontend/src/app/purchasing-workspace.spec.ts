import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./purchasing-workspace.component.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

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
  assert.match(workspace, /isValidDecimal\(line\.quantity, 3, false\)/);
  assert.match(workspace, /isValidDecimal\(line\.unit_cost, 2, true\)/);
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


test('purchase order workspace exposes a localized accessible region name', () => {
  assert.ok(workspace.includes("[attr.aria-label]=\"t('title')\""));
  assert.doesNotMatch(workspace, /aria-label="Purchase order workspace"/);
});

test('purchase order card keeps totals intact and wraps supplier names on words', () => {
  assert.doesNotMatch(workspace, /overflow-wrap:anywhere/);
  assert.match(workspace, /\.pw__card-meta strong\{white-space:nowrap\}/);
  assert.match(workspace, /\.pw__card p\{[^}]*overflow-wrap:normal\}/);
});

test('purchase order detail stacks table rows with labels at narrow widths', () => {
  assert.match(workspace, /\[attr\.data-label\]="t\('ordered'\)"/);
  assert.match(workspace, /\[attr\.data-label\]="t\('received'\)"/);
  assert.match(workspace, /\[attr\.data-label\]="t\('remaining'\)"/);
  assert.match(workspace, /\[attr\.data-label\]="t\('unitCost'\)"/);
  assert.doesNotMatch(workspace, /data-label="\{\{/);
  assert.match(workspace, /@media\(max-width:480px\)\{\.pw__table-head\{display:none\}/);
  assert.match(workspace, /\.pw__table-row>span::before\{content:attr\(data-label\)/);
  assert.match(workspace, /\.pw__table-row>span\{[^}]*white-space:nowrap\}/);
  // Narrow rules must sit AFTER the base table grid (same specificity, later wins).
  assert.ok(workspace.indexOf('@media(max-width:480px)') > workspace.indexOf('.pw__table-head,.pw__table-row{display:grid'));
});

test('purchase order summary keeps the recorded total intact', () => {
  assert.match(workspace, /<strong class="pw__summary-total">\{\{ order\.total \}\} \{\{ order\.currency_code \}\}<\/strong>/);
  assert.match(workspace, /\.pw__summary-total\{white-space:nowrap\}/);
  assert.match(workspace, /\.pw__summary strong\{[^}]*overflow-wrap:normal\}/);
});

test('purchase order heads do not squeeze the order number at narrow widths', () => {
  assert.match(workspace, /@media\(max-width:380px\)\{\.pw__card-head,\.pw__detail-head\{flex-direction:column;align-items:flex-start/);
  // The narrow stack must sit AFTER the base flex row (same specificity, later wins).
  assert.ok(workspace.indexOf('@media(max-width:380px){.pw__card-head,.pw__detail-head') > workspace.indexOf('.pw__heading,.pw__detail-head,.pw__card-head,.pw__line-heading{display:flex'));
});

test('receipt and activity history wrap on words', () => {
  assert.match(workspace, /\.pw__history-item strong\{[^}]*overflow-wrap:normal\}/);
  assert.match(workspace, /\.pw__history-item small\{[^}]*overflow-wrap:normal\}/);
});

test('purchase order actions are shown only for the order current state', () => {
  assert.match(workspace, /@if \(canEdit\(order\)\) \{ <button[^>]*>{{ t\('edit'\) }}<\/button> \}/);
  assert.match(workspace, /@if \(canApprove\(order\)\) \{ <button[^>]*>{{ t\('approve'\) }}<\/button> \}/);
  assert.match(workspace, /@if \(canCancel\(order\)\) \{ <button[^>]*>{{ t\('cancelOrder'\) }}<\/button> \}/);
  assert.match(workspace, /@if \(canReceive\(order\)\) \{ <button[^>]*>{{ t\('receive'\) }}<\/button> \}/);
});

test('purchase line inputs preserve decimal strings and match backend precision constraints', () => {
  assert.ok(workspace.includes('type="text" inputmode="decimal" autocomplete="off"'));
  assert.ok(workspace.includes('[(ngModel)]="line.quantity"'));
  assert.ok(workspace.includes('[(ngModel)]="line.unit_cost"'));
  assert.ok(workspace.includes('isValidDecimal(line.quantity, 3, false)'));
  assert.ok(workspace.includes('isValidDecimal(line.unit_cost, 2, true)'));
  assert.ok(workspace.includes("import { isValidPurchaseDecimalInput, normalizePurchaseDecimalInput } from './purchasing-decimal';"));
  assert.ok(workspace.includes('quantity: normalizePurchaseDecimalInput(line.quantity)'));
  assert.ok(workspace.includes('unit_cost: normalizePurchaseDecimalInput(line.unit_cost)'));
  assert.ok(workspace.includes('return isValidPurchaseDecimalInput(value, maxScale, allowZero)'));
  assert.doesNotMatch(workspace, /Number\(line\.(?:quantity|unit_cost)\)/);
});

// Narrow-input fix (2026-11-22): the purchasing search is a plain input, not
// the shared component, so it tracks the ≤220px breakpoint itself and shows
// the short "Search orders" placeholder there — the full "Search order,
// supplier or status" is ~165px at the 11px placeholder size and still clips
// the 151px area at 195px. The sr-only label keeps the full search string.
test('purchasing search shows the short placeholder at narrow widths', () => {
  assert.match(workspace, /\[placeholder\]="isNarrow\(\) \? t\('searchShort'\) : t\('search'\)"/);
  assert.match(workspace, /window\.matchMedia\('\(max-width: 220px\)'\)/);
  assert.equal(english.purchasingWorkspace.searchShort, 'Search orders');
  assert.equal(arabic.purchasingWorkspace.searchShort, 'ابحث في الطلبات');
  assert.equal(english.purchasingWorkspace.search, 'Search order, supplier or status');
  assert.equal(arabic.purchasingWorkspace.search, 'ابحث برقم الأمر أو المورد أو الحالة');
});

test('3A-371: purchasing activity shows localized labels, never raw action keys or JSON', () => {
  assert.match(workspace, /<strong>\{\{ activityLabel\(event\) \}\}<\/strong>/);
  assert.doesNotMatch(workspace, /<strong>\{\{ event\.action \}\}<\/strong>/);
  assert.match(workspace, /'purchase_order\.created': 'activityCreated'/);
  assert.match(workspace, /'purchase_order\.approved': 'activityApproved'/);
  assert.match(workspace, /'purchase_order\.received': 'activityReceived'/);
  assert.doesNotMatch(workspace, /JSON\.stringify\(event\.change_summary\)/);
  assert.equal(english.purchasingWorkspace.activityCreated, 'Order draft created');
  assert.equal(arabic.purchasingWorkspace.activityCreated, 'أُنشئت مسودة الأمر');
  assert.equal(english.purchasingWorkspace.activityReceived, 'Receipt recorded');
  assert.equal(arabic.purchasingWorkspace.activityReceived, 'سُجّل استلام');
});
