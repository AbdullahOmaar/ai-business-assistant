import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./product-editor.component.ts', import.meta.url), 'utf8');
const profile = readFileSync(new URL('./product-profile.component.ts', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('./product-catalog.component.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('./product-workspace.component.ts', import.meta.url), 'utf8');
const catalogCss = readFileSync(new URL('./product-catalog.component.css', import.meta.url), 'utf8');

test('product API exposes typed list, detail and safe descriptive PATCH fields', () => {
  assert.match(api, /products\(businessId: string, offset = 0, limit = 100\)/);
  assert.match(api, /product\(businessId: string, productId: string\)/);
  assert.match(api, /createProduct\(businessId: string, body: \{[\s\S]*?sku\?: string; description\?: string; unit\?: string/);
  assert.match(api, /updateProduct\([\s\S]*?Partial<Pick<Product, 'name' \| 'sku' \| 'description' \| 'unit'>>/);
  assert.ok(api.includes('/products/${encodeURIComponent(productId)}'));
});

test('product editor never exposes price or stock mutation and validates required descriptive fields', () => {
  assert.match(editor, /name="name"/);
  assert.match(editor, /name="unit"/);
  assert.match(editor, /name="sku"/);
  assert.match(editor, /name="description"/);
  assert.match(editor, /if \(!this\.name\(\)\.trim\(\) \|\| !this\.unit\(\)\.trim\(\) \|\| this\.busy\(\)\) return/);
  assert.doesNotMatch(editor, /unit_price|stock_quantity|is_stock_tracked/);
});

test('product profile presents API-backed price and derived stock without exposing stock editing', () => {
  assert.match(profile, /record\.unit_price/);
  assert.match(profile, /record\.stock_quantity/);
  assert.doesNotMatch(profile, /stock_quantity \?\? '0'/);
  assert.match(profile, /stock_quantity \?\? '—'/);
  assert.match(profile, /record\.is_stock_tracked/);
  assert.doesNotMatch(profile, /quantity_delta|StockMovement|opening_quantity/);
  assert.match(profile, /loading\(\)/);
  assert.match(catalog, /error\(\)/);
  assert.match(catalog, /retry\.emit\(\)/);
  assert.match(profile, /retry\.emit\(\)/);
});

test('product catalogue exposes keyboard-accessible record navigation on desktop and mobile', () => {
  assert.match(catalog, /select = output<string>\(\)/);
  assert.equal((catalog.match(/select\.emit\(product\.id\)/g) || []).length, 2);
  assert.match(catalogCss, /product-catalog__open/);
  assert.match(catalogCss, /focus-visible/);
});

test('product workspace provides tenant-scoped list, detail, descriptive edit and pagination', () => {
  assert.match(workspace, /input\.required<string>\(\)/);
  assert.match(workspace, /readonly role = input\.required<'owner' \| 'staff'>\(\)/);
  assert.match(workspace, /this\.api\.products\(requested\.businessId, this\.offset, this\.pageSize\)/);
  assert.match(workspace, /this\.api\.product\(requested\.businessId, productId\)/);
  assert.match(workspace, /this\.api\.updateProduct\(requested\.businessId, productId, value\)/);
  assert.match(workspace, /this\.isCurrent\(this\.listGuard/);
  assert.match(workspace, /this\.isCurrent\(this\.detailGuard/);
  assert.match(workspace, /this\.isCurrent\(this\.saveGuard/);
  assert.match(workspace, /current\.userId === requested\.userId/);
  assert.match(workspace, /current\.role === requested\.role/);
  assert.match(workspace, /this\.selectedProductId !== productId/);
  assert.match(workspace, /pageSize = 50/);
  assert.match(workspace, /@if \(hasMore\(\) && !error\(\)\)/);
  assert.match(workspace, /\[disabled\]="loading\(\)"/);
  assert.match(workspace, /loadingMore\(\) \? t\('ui\.m_1dwk1vm'\)/);
  assert.match(workspace, /readonly refreshRequest = input\(0\)/);
  assert.match(workspace, /if \(request > 0\) void this\.loadProducts\(true\)/);
  assert.doesNotMatch(workspace, /createProduct|unit_price|opening_quantity|stock_quantity/);
});
