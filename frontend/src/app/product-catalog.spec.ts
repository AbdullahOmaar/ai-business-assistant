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

test('catalogue filters stock-tracked and non-stock items on the current searched result set', () => {
  assert.match(component, /readonly filter = signal<ProductFilter>/);
  assert.match(component, /stockCount = computed/);
  assert.match(component, /nonStockCount = computed/);
  assert.match(component, /filter\(\) === 'non-stock'/);
  assert.match(component, /'Non-stock'/);
  assert.match(component, /'Item'/);
  assert.doesNotMatch(component, /Product \/ non-stock/);
  assert.doesNotMatch(component, /'Services'/);
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
  assert.match(css, /product-catalog__filters button\{[^}]*min-height:44px/);
  assert.match(css, /product-catalog__mobile-sort select\{[^}]*min-height:44px/);
  assert.match(css, /product-catalog__clear-filter\{[^}]*min-height:44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /forced-colors:active/);
});

test('catalogue keeps filters and a clear-filter action available when the selected filter has no results', () => {
  const toolbar = component.indexOf('<div class="product-catalog__toolbar">');
  const results = component.indexOf('@if (visibleProducts().length)');
  const empty = component.indexOf('<aba-state-message\n            kind="empty"');
  const clear = component.indexOf('class="product-catalog__clear-filter"');
  assert.ok(toolbar >= 0 && results > toolbar && empty > results && clear > empty);
  assert.match(component, /No items in this category/);
  assert.match(component, /Try another type or show all items/);
});

test('main product directory exposes the existing guarded pagination beyond the first page', () => {
  assert.match(app, /\(click\)="loadMoreProducts\(\)"/);
  assert.match(app, /loadMoreProducts\(\): Promise<void>/);
  assert.match(app, /return this\.loadMoreInvoiceProducts\(\)/);
  assert.match(app, /fetchPage: \(id, offset\) => this\.api\.products\(id, offset\)/);
});
