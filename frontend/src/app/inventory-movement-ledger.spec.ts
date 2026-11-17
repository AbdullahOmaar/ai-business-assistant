import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./inventory-movement-ledger.component.ts', import.meta.url), 'utf8');
const guard = readFileSync(new URL('./workspace-load-guard.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const ar = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8'));

test('inventory ledger is an isolated standalone read-only component', () => {
  assert.match(component, /selector: 'aba-inventory-movement-ledger'/);
  assert.match(component, /standalone: true/);
  assert.match(component, /readonly loadPage = input\.required<InventoryMovementLoader>\(\)/);
  assert.doesNotMatch(component, /createMovement|updateMovement|deleteMovement|adjustStock/);
});

test('component reuses the canonical authenticated API movement DTOs', () => {
  assert.match(component, /StockMovementPage as InventoryMovementPage/);
  assert.match(component, /StockMovementRecord as InventoryMovement/);
  assert.match(component, /StockMovementType as InventoryMovementType/);
  assert.match(api, /export interface StockMovementRecord/);
  assert.match(api, /export interface StockMovementPage/);
});

test('ledger query exposes only supported tenant-scoped read filters and bounded pagination', () => {
  assert.match(component, /productId: string/);
  assert.match(component, /movementType: InventoryMovementType \| ''/);
  assert.match(component, /limit: number/);
  assert.match(component, /offset: number/);
  assert.match(component, /private readonly pageSize = 50/);
  assert.match(component, /businessId: requested\.businessId/);
  assert.match(component, /productId: this\.productId\(\)/);
  assert.match(component, /movementType: this\.movementType\(\)/);
  assert.match(component, /referenceType: this\.referenceType\(\)/);
});

test('movement types match the backend allowlist without inventing filters', () => {
  for (const type of ['opening', 'receipt', 'sale', 'return', 'adjustment']) {
    assert.ok(component.includes(`'${type}'`));
  }
  assert.match(component, /const MOVEMENT_TYPES: InventoryMovementType\[\]/);
  assert.doesNotMatch(component, /supplierId|warehouseId|dateFrom|dateTo/);
});

test('reference filter labels are supplied by the component copy model', () => {
  assert.match(component, /referenceType: this\.t\('referenceType'\)/);
  assert.match(component, /allReferences: this\.t\('allReferences'\)/);
  assert.match(component, /copy\(\)\.referenceType/);
  assert.match(component, /copy\(\)\.allReferences/);
});

test('reference filter is enabled only with the authenticated API adapter contract', () => {
  assert.ok(component.includes('supportsReferenceFilter = input(true)'));
  assert.ok(component.includes('@if (supportsReferenceFilter())'));
  assert.ok(component.includes('referenceType: this.referenceType()'));
  assert.ok(api.includes('referenceType?: string'));
  assert.ok(api.includes("params.set('reference_type', query.referenceType)"));
  assert.ok(shell.includes('referenceType: query.referenceType || undefined'));
});

test('reference filters use only reference types observed in backend stock events', () => {
  for (const type of ['invoice', 'invoice_void', 'purchase_order', 'sales_return', 'stock_count']) {
    assert.ok(component.includes(`'${type}'`));
  }
  assert.match(component, /setReferenceType\(value: string\)/);
  assert.match(component, /referenceTypeLabel\(type: string\)/);
});

test('desktop table and mobile cards present the same read-only movement records', () => {
  assert.match(component, /inventory-ledger__mobile-list/);
  assert.match(component, /inventory-ledger__desktop-table/);
  assert.match(component, /movement\.product\.name/);
  assert.match(component, /movement\.movement_type/);
  assert.match(component, /movement\.quantity_delta/);
  assert.match(component, /movement\.created_at/);
});

test('ledger cards and controls follow the approved mobile design tokens', () => {
  assert.match(component, /var\(--aiba-radius-card,16px\)/);
  assert.match(component, /var\(--aiba-shadow-card/);
  assert.match(component, /@media\(max-width:760px\)/);
  assert.match(component, /min-height:48px;font-size:16px/);
  assert.match(component, /overflow-wrap:anywhere/);
});

test('signed quantities and localized timestamps retain backend values', () => {
  assert.match(component, /signDisplay: 'always'/);
  assert.match(component, /dateStyle: 'medium', timeStyle: 'short'/);
  assert.ok(component.includes("isNegative(value: string): boolean { return /^-\\d/.test(value.trim()); }"));
  assert.match(component, /StockMovementRecord as InventoryMovement/);
  assert.match(api, /created_at: string/);
});

test('quantity formatting preserves arbitrary decimal precision without JS Number conversion', () => {
  const start = component.indexOf('  formatQuantity(value: string): string {');
  const end = component.indexOf('  formatNumber(value: number)', start);
  const formatter = component.slice(start, end);
  assert.match(formatter, /BigInt\(rawInteger\)/);
  assert.match(formatter, /Array\.from\(fraction/);
  assert.doesNotMatch(formatter, /Number\(/);
  assert.match(component, /Array\.from\(\{ length: 10 \}/);
});

test('reference labels are dictionary-backed and include stock count in both locales', () => {
  assert.ok(component.includes("'stock_count'"));
  assert.ok(component.includes("this.t('referenceTypes.' + type)"));
  assert.equal(ar.inventoryLedger.referenceTypes.stock_count, 'جرد مخزون');
  assert.equal(en.inventoryLedger.referenceTypes.stock_count, 'Stock count');
  assert.equal(ar.inventoryLedger.referenceType, 'نوع المرجع');
  assert.equal(en.inventoryLedger.referenceType, 'Reference type');
});

test('feature component contains no inline Arabic UI copy', () => {
  assert.equal([...component].some(character => { const code = character.charCodeAt(0); return code >= 0x0600 && code <= 0x06ff; }), false);
});

test('pagination appends unique records and follows the server has_more flag', () => {
  assert.match(component, /hasMore\.set\(page\.has_more\)/);
  assert.match(component, /reset \? page\.items : \[\.\.\.this\.items\(\), \.\.\.page\.items\]/);
  assert.match(component, /new Map<string, InventoryMovement>\(\)/);
  assert.match(component, /loadMore\(\)/);
});

test('workspace identity changes invalidate pending requests and clear old tenant data', () => {
  assert.match(component, /this\.guard\.invalidate\(\)/);
  assert.match(component, /this\.items\.set\(\[\]\)/);
  assert.match(component, /current\.userId === requested\.userId/);
  assert.match(component, /current\.role === requested\.role/);
  assert.match(guard, /isCurrent\(\s*version: number,\s*currentWorkspaceId/);
});

test('all visible copy is routed through the shared Arabic and English localization dictionary', () => {
  assert.match(component, /inject\(LocalizationService\)/);
  assert.match(component, /this\.localization\.translate\('inventoryLedger\.' \+ key\)/);
  assert.match(component, /this\.t\('loadError'\)/);
  assert.match(component, /this\.t\('type\.' \+ type\)/);
});

test('loading, empty, error, retry and keyboard-accessible controls are present', () => {
  for (const state of ['role="status"', 'role="alert"', 'emptyTitle', 'retry()', 'loadMore()']) {
    assert.ok(component.includes(state), `missing state/control: ${state}`);
  }
  assert.match(component, /:focus-visible/);
  assert.match(component, /forced-colors:active/);
  assert.match(component, /prefers-reduced-motion:reduce/);
  assert.match(component, /aria-label/);
});
