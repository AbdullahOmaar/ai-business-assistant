import assert from 'node:assert/strict';
import test from 'node:test';
import { compareInvoiceDecimalValues, paginateInvoiceRecords, sortInvoiceRecords, type InvoiceListRecord } from './invoice-list.ts';

const records: InvoiceListRecord[] = [
  { id: 'c', invoice_number: 'INV-10', customer_id: '2', status: 'issued', total: '10.00', issue_date: '2026-11-03' },
  { id: 'a', invoice_number: 'INV-2', customer_id: '1', status: 'draft', total: '9.99', issue_date: '2026-11-01' },
  { id: 'b', invoice_number: 'INV-3', customer_id: '1', status: 'issued', total: '10.0', issue_date: '2026-11-02' },
];

test('invoice total comparison preserves exact decimal ordering', () => {
  assert.equal(compareInvoiceDecimalValues('9.99', '10.00'), -1);
  assert.equal(compareInvoiceDecimalValues('10.000', '10'), 0);
  assert.equal(compareInvoiceDecimalValues('-0.02', '-0.1'), 1);
});

test('invoice sorting supports visible columns without mutating the source list', () => {
  const byNumber = sortInvoiceRecords(records, 'invoice_number', 'asc', () => '', 'en');
  assert.deepEqual(byNumber.map(item => item.invoice_number), ['INV-2', 'INV-3', 'INV-10']);
  const byTotal = sortInvoiceRecords(records, 'total', 'desc', () => '', 'en');
  assert.deepEqual(byTotal.map(item => item.id), ['b', 'c', 'a']);
  const byCustomer = sortInvoiceRecords(records, 'customer', 'asc', id => id === '1' ? 'A' : 'B', 'en');
  assert.deepEqual(byCustomer.map(item => item.id), ['a', 'b', 'c']);
  assert.deepEqual(records.map(item => item.id), ['c', 'a', 'b']);
});

test('invoice sorting uses stable ID ordering for equal keys and supports descending dates', () => {
  const sameTotal = [
    { ...records[0], id: 'z', total: '5.00' },
    { ...records[1], id: 'a', total: '5' },
  ];
  assert.deepEqual(sortInvoiceRecords(sameTotal, 'total', 'asc', () => '').map(item => item.id), ['a', 'z']);
  assert.deepEqual(sortInvoiceRecords(records, 'issue_date', 'desc', () => '').map(item => item.id), ['c', 'b', 'a']);
});

test('invoice pagination clamps indexes and reports empty and final-page ranges', () => {
  const firstPage = paginateInvoiceRecords(records, 0, 2);
  assert.deepEqual(firstPage.items.map(item => item.id), ['c', 'a']);
  assert.deepEqual([firstPage.pageIndex, firstPage.pageCount, firstPage.start, firstPage.end], [0, 2, 1, 2]);
  const lastPage = paginateInvoiceRecords(records, 99, 2);
  assert.deepEqual(lastPage.items.map(item => item.id), ['b']);
  assert.deepEqual([lastPage.pageIndex, lastPage.start, lastPage.end], [1, 3, 3]);
  assert.deepEqual(paginateInvoiceRecords([], 0, 10), { items: [], pageIndex: 0, pageCount: 1, start: 0, end: 0 });
});
