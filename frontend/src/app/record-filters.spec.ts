import assert from 'node:assert/strict';
import test from 'node:test';

import { filterCustomers, filterInvoices, filterProducts } from './record-filters.ts';

test('filters customers by name, email, and phone case-insensitively', () => {
  const customers = [
    { id: '1', name: 'Nour Shop', email: 'nour@example.test', phone: '+201001234567' },
    { id: '2', name: 'Delta Store', email: null, phone: null },
  ];
  assert.deepEqual(filterCustomers(customers, 'NOUR').map(x => x.id), ['1']);
  assert.deepEqual(filterCustomers(customers, 'example.test').map(x => x.id), ['1']);
  assert.deepEqual(filterCustomers(customers, '1234567').map(x => x.id), ['1']);
  assert.deepEqual(filterCustomers(customers, 'missing'), []);
});

test('filters products by name, SKU, price, or currency', () => {
  const products = [
    { id: '1', name: 'Coffee', sku: 'CF-10', unit_price: '45.00' },
    { id: '2', name: 'Tea', sku: null, unit_price: '30.00' },
  ];
  assert.deepEqual(filterProducts(products, 'cf-10', 'EGP').map(x => x.id), ['1']);
  assert.deepEqual(filterProducts(products, '45.00', 'EGP').map(x => x.id), ['1']);
  assert.deepEqual(filterProducts(products, 'egp', 'EGP').map(x => x.id), ['1', '2']);
});

test('combines invoice text, status, and customer filters', () => {
  const invoices = [
    { id: '1', invoice_number: 'INV-001', currency_code: 'EGP', status: 'issued', total: '100', customer_id: 'c1' },
    { id: '2', invoice_number: 'INV-002', currency_code: 'USD', status: 'paid', total: '50', customer_id: 'c2' },
    { id: '3', invoice_number: 'INV-003', currency_code: 'EGP', status: 'issued', total: '70', customer_id: 'c1' },
  ];
  assert.deepEqual(filterInvoices(invoices, 'inv-00', 'issued', 'c1').map(x => x.id), ['1', '3']);
  assert.deepEqual(filterInvoices(invoices, 'usd', 'all').map(x => x.id), ['2']);
  assert.deepEqual(filterInvoices(invoices, '', 'paid').map(x => x.id), ['2']);
});
