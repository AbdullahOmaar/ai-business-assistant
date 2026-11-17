import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const component = expandTranslationCalls(readFileSync(new URL('./product-catalog.component.ts', import.meta.url), 'utf8'));
const sortHelper = readFileSync(new URL('./directory-sort.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('./product-catalog.component.css', import.meta.url), 'utf8');
const app = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
const workspace = expandTranslationCalls(readFileSync(new URL('./product-workspace.component.ts', import.meta.url), 'utf8'));
const workspaceSource = readFileSync(new URL('./product-workspace.component.ts', import.meta.url), 'utf8');
const productEditor = readFileSync(new URL('./product-editor.component.ts', import.meta.url), 'utf8');

test('Products uses a dedicated catalogue presentation, not the shared generic record table', () => {
  assert.match(component, /selector: 'aba-product-catalog'/);
  assert.match(app, /<aba-product-workspace/);
  assert.match(workspace, /<aba-product-catalog[\s\S]*?\[products\]="products\(\)"/);
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
  assert.match(component, /filterAndSortProducts\(/);
  assert.match(sortHelper, /new Intl\.Collator\(locale/);
  assert.match(sortHelper, /compareDecimalStrings/);
  assert.doesNotMatch(sortHelper, /Number\(left\.(unit_price|stock_quantity)/);
  assert.match(sortHelper, /leftCurrency/);
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

test('main product directory exposes guarded pagination beyond the first page', () => {
  assert.match(workspace, /\(click\)="loadMore\(\)"/);
  assert.match(workspace, /loadMore\(\): void/);
  assert.match(workspace, /this\.api\.products\(requested\.businessId, this\.offset, this\.pageSize\)/);
  assert.match(app, /return this\.loadMoreInvoiceProducts\(\)/);
  assert.match(app, /fetchPage: \(id, offset\) => this\.api\.products\(id, offset\)/);
});



test('product editor close is disabled during save and meets the 44px touch target', () => {
  assert.match(productEditor, /class="product-editor__close"[\s\S]*?\[disabled\]="busy\(\)"/);
  assert.match(productEditor, /product-editor__close\{flex:0 0 44px;width:44px;height:44px/);
  assert.match(productEditor, /product-editor button:disabled/);
});


test('product workspace landmark uses a localized accessible name', () => {
  assert.ok(workspaceSource.includes("[attr.aria-label]=\"t('productEditor.eyebrow')\""));
  assert.doesNotMatch(workspaceSource, /aria-label="Product workspace"/);
});


test('mobile product cards label their price in both supported locales', () => {
  const start = component.indexOf('class="product-catalog__mobile-price"');
  const end = component.indexOf('</strong>', start);
  const mobilePrice = component.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(mobilePrice, /Unit price/);
  assert.match(mobilePrice, /سعر الوحدة/);
  assert.match(mobilePrice, /product\.unit_price/);
  assert.match(css, /product-catalog__mobile-price-label/);
});
