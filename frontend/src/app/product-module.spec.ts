import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./product-editor.component.ts', import.meta.url), 'utf8');
const profile = readFileSync(new URL('./product-profile.component.ts', import.meta.url), 'utf8');

test('product API exposes typed list, detail and safe descriptive PATCH fields', () => {
  assert.match(api, /products\(businessId: string, offset = 0, limit = 50\)/);
  assert.match(api, /product\(businessId: string, productId: string\)/);
  assert.match(api, /updateProduct\([\s\S]*?Partial<Pick<Product, 'name' \| 'sku' \| 'description' \| 'unit'>>/);
  assert.match(api, /'\/api\/v1\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/products\/\$\{encodeURIComponent\(productId\)\}'/);
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
  assert.match(profile, /product\(\)\.unit_price/);
  assert.match(profile, /product\(\)\.stock_quantity/);
  assert.match(profile, /product\(\)\.is_stock_tracked/);
  assert.doesNotMatch(profile, /quantity_delta|StockMovement|opening_quantity/);
});
