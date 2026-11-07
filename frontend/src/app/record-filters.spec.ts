import assert from 'node:assert/strict';
import test from 'node:test';

import { filterCustomers, filterExpenses, filterInvoices, filterNotifications, filterPayments, filterProducts, filterPurchaseOrders, filterRecurringSchedules, filterSuppliers } from './record-filters.ts';

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
  assert.deepEqual(filterInvoices(invoices, 'صادرة', 'all', '', status => status === 'issued' ? 'صادرة' : status).map(x => x.id), ['1', '3']);
});


test('filters suppliers by name and optional contact fields', () => {
  const suppliers = [
    { id: 's1', name: 'Nile Trading', email: 'sales@nile.test', phone: '+201001112222', address: 'Giza' },
    { id: 's2', name: 'Delta Supply', email: null, phone: null, address: null },
  ];
  assert.deepEqual(filterSuppliers(suppliers, 'NILE').map(x => x.id), ['s1']);
  assert.deepEqual(filterSuppliers(suppliers, '2010011').map(x => x.id), ['s1']);
  assert.deepEqual(filterSuppliers(suppliers, 'giza').map(x => x.id), ['s1']);
  assert.deepEqual(filterSuppliers(suppliers, 'missing'), []);
});

test('filters purchase orders by order, supplier, product, status and line quantities', () => {
  const orders = [
    { id: 'p1', order_number: 'PO-100', status: 'partial', total: '1250', currency_code: 'EGP', supplier_id: 's1',
      lines: [{ product_id: 'prod-1', quantity: '10', received_quantity: '4', remaining_quantity: '6' }] },
    { id: 'p2', order_number: 'PO-200', status: 'received', total: '75', currency_code: 'USD', supplier_id: 's2',
      lines: [{ product_id: 'prod-2', quantity: '1', received_quantity: '1', remaining_quantity: '0' }] },
  ];
  const supplier = (id: string) => id === 's1' ? 'Nile Trading' : 'Delta Supply';
  const product = (id: string) => id === 'prod-1' ? 'Coffee Beans' : 'Tea';
  assert.deepEqual(filterPurchaseOrders(orders, 'nile', supplier, product).map(x => x.id), ['p1']);
  assert.deepEqual(filterPurchaseOrders(orders, 'coffee', supplier, product).map(x => x.id), ['p1']);
  assert.deepEqual(filterPurchaseOrders(orders, 'partial', supplier, product).map(x => x.id), ['p1']);
  assert.deepEqual(filterPurchaseOrders(orders, '6', supplier, product).map(x => x.id), ['p1']);
  assert.deepEqual(filterPurchaseOrders(orders, 'مستلم جزئيًا', supplier, product, status => status === 'partial' ? 'مستلم جزئيًا' : status).map(x => x.id), ['p1']);
});

test('filters recurring schedules by customer, interval, timezone and state', () => {
  const schedules = [
    { id: 'r1', customer_id: 'c1', interval_days: 30, timezone: 'Africa/Cairo', next_run_at: '2026-12-01T09:00:00', is_active: true },
    { id: 'r2', customer_id: null, interval_days: 7, timezone: 'UTC', next_run_at: '2026-12-02T09:00:00', is_active: false },
  ];
  const customer = (id: string) => id === 'c1' ? 'Nour Shop' : '';
  assert.deepEqual(filterRecurringSchedules(schedules, 'nour', customer).map(x => x.id), ['r1']);
  assert.deepEqual(filterRecurringSchedules(schedules, 'africa/cairo', customer).map(x => x.id), ['r1']);
  assert.deepEqual(filterRecurringSchedules(schedules, 'inactive', customer).map(x => x.id), ['r2']);
  assert.deepEqual(filterRecurringSchedules(schedules, 'active', customer).map(x => x.id), ['r1']);
  assert.deepEqual(filterRecurringSchedules(schedules, 'نشطة', customer).map(x => x.id), ['r1']);
  assert.deepEqual(filterRecurringSchedules(schedules, 'متوقفة', customer).map(x => x.id), ['r2']);
});

test('filters notifications by title, message, kind and delivery status', () => {
  const notifications = [
    { id: 'n1', title: 'Invoice reminder', body: 'Payment due tomorrow', kind: 'invoices', status: 'queued', scheduled_at: null, created_at: '2026-11-01' },
    { id: 'n2', title: 'Stock alert', body: 'Coffee is low', kind: 'inventory', status: 'failed', scheduled_at: null, created_at: '2026-11-02' },
  ];
  assert.deepEqual(filterNotifications(notifications, 'invoice').map(x => x.id), ['n1']);
  assert.deepEqual(filterNotifications(notifications, 'coffee').map(x => x.id), ['n2']);
  assert.deepEqual(filterNotifications(notifications, 'failed').map(x => x.id), ['n2']);
  assert.deepEqual(filterNotifications(notifications, 'فواتير', kind => kind === 'invoices' ? 'الفواتير' : kind).map(x => x.id), ['n1']);
});


test('filters expenses by category, description, amount, currency, vendor and reference', () => {
  const expenses = [
    { id: 'e1', category: 'Transport', description: 'Delivery fuel', amount: '450.00', currency_code: 'EGP', incurred_at: '2026-11-01', vendor_name: 'Nile Station', reference: 'TR-1' },
    { id: 'e2', category: 'Rent', description: 'Office rent', amount: '5000.00', currency_code: 'EGP', incurred_at: '2026-11-02', vendor_name: null, reference: null },
  ];
  assert.deepEqual(filterExpenses(expenses, 'delivery').map(x => x.id), ['e1']);
  assert.deepEqual(filterExpenses(expenses, 'nile station').map(x => x.id), ['e1']);
  assert.deepEqual(filterExpenses(expenses, 'TR-1').map(x => x.id), ['e1']);
  assert.deepEqual(filterExpenses(expenses, '5000').map(x => x.id), ['e2']);
});

test('filters payments by visible receipt details and allocation state without changing records', () => {
  const payments = [
    { id: 'p1', amount: '120', currency_code: 'EGP', received_at: '2026-11-01', customer_id: 'c1', method: 'cash', reference: 'RC-1', allocations: [{ invoice_id: 'i1', amount: '120' }] },
    { id: 'p2', amount: '50', currency_code: 'USD', received_at: '2026-11-02', customer_id: null, method: 'bank_transfer', reference: null, allocations: [] },
  ];
  const customer = (id: string) => id === 'c1' ? 'Nour Shop' : '';
  assert.deepEqual(filterPayments(payments, 'nour', customer).map(x => x.id), ['p1']);
  assert.deepEqual(filterPayments(payments, 'RC-1', customer).map(x => x.id), ['p1']);
  assert.deepEqual(filterPayments(payments, 'unallocated', customer).map(x => x.id), ['p2']);
  assert.deepEqual(filterPayments(payments, 'allocated', customer).map(x => x.id), ['p1']);
  assert.deepEqual(filterPayments(payments, 'bank_transfer', customer).map(x => x.id), ['p2']);
});
