import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./product-catalog.component.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./product-catalog.component.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('Products uses a dedicated catalogue presentation, not the shared generic record table', () => {
  assert.match(component, /selector: 'aba-product-catalog'/);
  assert.match(app, /<aba-product-catalog[\s\S]*?\[products\]="filteredProducts"/);
  assert.doesNotMatch(app, /productTableRows|productTableColumns/);
});

test('catalogue filters stock-tracked and service items on the current searched result set', () => {
  assert.match(component, /readonly filter = signal<ProductFilter>/);
  assert.match(component, /stockCount = computed/);
  assert.match(component, /serviceCount = computed/);
  assert.match(component, /visibleProducts = computed/);
  assert.match(component, /product\.is_stock_tracked/);
  assert.match(component, /aria-pressed/);
});

test('catalogue sorting is available to desktop keyboard users and mobile touch users', () => {
  assert.match(component, /aria-sort/);
  assert.match(component, /toggleSort\('price'\)/);
  assert.match(component, /onMobileSortChange\(\$event\)/);
  assert.match(component, /new Intl\.Collator\(this\.locale\(\)/);
  assert.match(component, /Number\(left\.unit_price\)/);
  assert.match(component, /leftCurrency/);
});

test('catalogue only renders fields already present in the Product API contract', () => {
  for (const field of ['name', 'sku', 'unit_price', 'currency_code', 'is_stock_tracked', 'stock_quantity']) {
    assert.ok(component.includes('product.' + field) || component.includes('left.' + field), 'missing existing product field: ' + field);
  }
  assert.doesNotMatch(component, /availableQuantity|reservedQuantity|reorderPoint|valuation|costOfGoods/);
});

test('mobile catalogue remains compact and readable in RTL/LTR with visible focus', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /product-catalog__mobile-row/);
  assert.match(css, /min-height:40px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /forced-colors:active/);
});
