import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAndSortProducts, sortCustomers } from './directory-sort.ts';
import type { Customer, Product } from './api.service';

const customers: Customer[] = [
  { id: 'c-beta', name: 'Beta', email: 'beta@example.test', phone: null },
  { id: 'c-no-email', name: 'No email', email: null, phone: null },
  { id: 'c-alpha', name: 'Alpha', email: 'alpha@example.test', phone: '0100' },
];

const products: Product[] = [
  { id: 'usd-five', name: 'USD five', sku: 'U5', unit_price: '5', currency_code: 'USD', is_stock_tracked: false },
  { id: 'egp-twenty', name: 'EGP twenty', sku: 'E20', unit_price: '20', currency_code: 'EGP', is_stock_tracked: true, stock_quantity: '20' },
  { id: 'egp-ten', name: 'EGP ten', sku: 'E10', unit_price: '10', currency_code: 'EGP', is_stock_tracked: true, stock_quantity: '10' },
  { id: 'usd-one', name: 'USD one', sku: 'U1', unit_price: '1', currency_code: 'USD', is_stock_tracked: false },
  { id: 'egp-two', name: 'EGP two', sku: null, unit_price: '2', currency_code: 'EGP', is_stock_tracked: true, stock_quantity: '2' },
];

test('customer sorting returns correct IDs in both directions and keeps missing values last', () => {
  assert.deepEqual(sortCustomers(customers, 'name', 'asc', 'en').map(row => row.id), ['c-alpha', 'c-beta', 'c-no-email']);
  assert.deepEqual(sortCustomers(customers, 'name', 'desc', 'en').map(row => row.id), ['c-no-email', 'c-beta', 'c-alpha']);
  assert.deepEqual(sortCustomers(customers, 'email', 'desc', 'en').map(row => row.id), ['c-beta', 'c-alpha', 'c-no-email']);
});

test('customer sorting does not mutate the supplied page array', () => {
  const original = customers.map(row => row.id);
  sortCustomers(customers, 'name', 'asc', 'en');
  assert.deepEqual(customers.map(row => row.id), original);
});

test('product stock filters return only the selected existing stock contract', () => {
  assert.deepEqual(filterAndSortProducts(products, 'stock', 'name', 'asc', 'en', 'EGP').map(row => row.id), ['egp-ten', 'egp-twenty', 'egp-two']);
  assert.deepEqual(filterAndSortProducts(products, 'non-stock', 'name', 'asc', 'en', 'EGP').map(row => row.id), ['usd-five', 'usd-one']);
  assert.equal(filterAndSortProducts(products, 'all', 'name', 'asc', 'en', 'EGP').length, products.length);
});

test('product price sorting groups currencies and sorts amounts in both directions', () => {
  assert.deepEqual(filterAndSortProducts(products, 'all', 'price', 'asc', 'en', 'EGP').map(row => row.id), ['egp-two', 'egp-ten', 'egp-twenty', 'usd-one', 'usd-five']);
  assert.deepEqual(filterAndSortProducts(products, 'all', 'price', 'desc', 'en', 'EGP').map(row => row.id), ['egp-twenty', 'egp-ten', 'egp-two', 'usd-five', 'usd-one']);
});

test('product stock sorting keeps non-stock rows after tracked stock in either direction', () => {
  assert.deepEqual(filterAndSortProducts(products, 'all', 'stock', 'asc', 'en', 'EGP').map(row => row.id), ['egp-two', 'egp-ten', 'egp-twenty', 'usd-five', 'usd-one']);
  assert.deepEqual(filterAndSortProducts(products, 'all', 'stock', 'desc', 'en', 'EGP').map(row => row.id), ['egp-twenty', 'egp-ten', 'egp-two', 'usd-five', 'usd-one']);
});

test('product SKU sorting keeps missing SKU last in both directions', () => {
  assert.deepEqual(filterAndSortProducts(products, 'all', 'sku', 'asc', 'en', 'EGP').map(row => row.id), ['egp-ten', 'egp-twenty', 'usd-one', 'usd-five', 'egp-two']);
  assert.deepEqual(filterAndSortProducts(products, 'all', 'sku', 'desc', 'en', 'EGP').map(row => row.id), ['usd-five', 'usd-one', 'egp-twenty', 'egp-ten', 'egp-two']);
});

test('product sorting uses the workspace currency only when product currency is absent', () => {
  const fallbackCurrency: Product = { id: 'fallback', name: 'Fallback', unit_price: '3', is_stock_tracked: false };
  const result = filterAndSortProducts([...products, fallbackCurrency], 'all', 'price', 'asc', 'en', 'EGP');
  assert.deepEqual(result.map(row => row.id).slice(0, 4), ['egp-two', 'fallback', 'egp-ten', 'egp-twenty']);
});
