import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('print action is exposed only for issued invoices', () => {
  const row = source.split('\n').find((line) => line.includes('@for (invoice of filteredInvoices; track invoice.id)'));
  assert.ok(row, 'invoice list template row must exist');
  const draftStart = row.indexOf("invoice.status === 'draft'");
  const issuedStart = row.indexOf("else if (invoice.status === 'issued')");
  assert.ok(draftStart >= 0 && issuedStart > draftStart);
  assert.doesNotMatch(row.slice(draftStart, issuedStart), /printInvoice\(invoice\)/);
  assert.match(row.slice(issuedStart), /printInvoice\(invoice\)/);
});

test('print invoice escapes customer, business, invoice, and line values before writing HTML', () => {
  const helperStart = source.indexOf('private escapePrintHtml(value: unknown): string');
  const printStart = source.indexOf('async printInvoice(invoice: Invoice): Promise<void>');
  const editStart = source.indexOf('async editInvoice(invoice: Invoice): Promise<void>', printStart);
  assert.ok(helperStart >= 0 && printStart > helperStart && editStart > printStart);
  const helper = source.slice(helperStart, printStart);
  const printMethod = source.slice(printStart, editStart);
  for (const encoded of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) {
    assert.ok(helper.includes(encoded), 'missing HTML escape for ' + encoded);
  }
  assert.match(printMethod, /const business = this\.business/);
  assert.match(printMethod, /const businessId = business\.id/);
  assert.match(printMethod, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(printMethod, /this\.business\?\.id !== businessId/);
  assert.match(printMethod, /this\.escapePrintHtml\(line\.description\)/);
  assert.match(printMethod, /this\.escapePrintHtml\(this\.customerNameForInvoice\(detail\.customer_id\)\)/);
  assert.match(printMethod, /this\.escapePrintHtml\(business\.name\)/);
  assert.match(printMethod, /printWindow\.document\.write\(/);
});

test('print popup failures and invoice-detail errors are surfaced safely', () => {
  const start = source.indexOf('async printInvoice(invoice: Invoice): Promise<void>');
  const end = source.indexOf('async editInvoice(invoice: Invoice): Promise<void>', start);
  const method = source.slice(start, end);
  assert.match(method, /if \(!printWindow\)/);
  assert.match(method, /Allow pop-ups for printing/);
  assert.match(method, /catch \(error\)/);
  assert.match(method, /printWindow\.close\(\)/);
  assert.match(method, /this\.error = this\.message\(error\)/);
});
