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
  const start = source.indexOf('async printInvoice(invoice: Invoice)');
  const end = source.indexOf('async editInvoice(invoice: Invoice)', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const businessSnapshot = this\.business/);
  assert.match(method, /const businessName = businessSnapshot\.name/);
  assert.match(method, /const businessCurrency = businessSnapshot\.currency_code/);
  assert.match(method, /this\.escapePrintHtml\(this\.customerNameForInvoice\(detail\.customer_id\)\)/);
  assert.match(method, /this\.escapePrintHtml\(detail\.invoice_number\)/);
  assert.match(method, /this\.escapePrintHtml\(line\.description\)/);
  assert.match(method, /this\.escapePrintHtml\(line\.quantity\)/);
  assert.match(method, /this\.escapePrintHtml\(line\.unit_price\)/);
  assert.match(method, /this\.escapePrintHtml\(line\.line_total\)/);
  assert.match(method, /this\.escapePrintHtml\(businessName\)/);
  assert.match(method, /this\.escapePrintHtml\(businessCurrency\)/);
  const printWindowStart = method.indexOf("const printWindow = window.open('', '_blank');");
  assert.ok(printWindowStart > 0);
  const printExecution = method.slice(printWindowStart);
  assert.doesNotMatch(printExecution, /this\.business\.name|this\.business\.currency_code/);
  assert.match(printExecution, /printWindow\.document\.write\(/);
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
