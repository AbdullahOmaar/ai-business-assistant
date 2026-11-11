import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('print action is exposed only for issued invoices in desktop rows and mobile cards', () => {
  const containers = [
    { selector: 'class="invoice-table"', endTag: '</tr>' },
    { selector: 'class="invoice-cards"', endTag: '</article>' },
  ];
  for (const container of containers) {
    const containerStart = source.indexOf(container.selector);
    const loopStart = source.indexOf('@for (invoice of filteredInvoices; track invoice.id)', containerStart);
    const blockEnd = source.indexOf(container.endTag, loopStart);
    assert.ok(containerStart >= 0 && loopStart > containerStart && blockEnd > loopStart,
      `invoice template loop must exist inside ${container.selector}`);
    const block = source.slice(loopStart, blockEnd);
    const draftStart = block.indexOf("invoice.status === 'draft'");
    const issuedStart = block.indexOf("@else if (invoice.status === 'issued')", draftStart);
    assert.ok(draftStart >= 0 && issuedStart > draftStart);
    assert.ok(!block.slice(draftStart, issuedStart).includes('printInvoice(invoice)'));
    assert.ok(block.slice(issuedStart).includes('printInvoice(invoice)'));
  }
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


test('print refuses stale invoice details and closes the popup before writing HTML', () => {
  const start = source.indexOf('async printInvoice(invoice: Invoice): Promise<void>');
  const end = source.indexOf('async editInvoice(invoice: Invoice): Promise<void>', start);
  const method = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(method, /const requestContext = this\.captureTenantRequest\(businessId\)/);
  assert.match(method, /this\.isCurrentTenantOperation\(this\.printRequestGuard, requestVersion, requestContext\)/);

  const staleCheck = method.indexOf('if (!isCurrent())');
  const statusCheck = method.indexOf("if (detail.status !== 'issued')");
  const htmlWrite = method.indexOf('printWindow.document.write(');
  assert.ok(staleCheck >= 0 && statusCheck > staleCheck && htmlWrite > statusCheck);
  const staleBranch = method.slice(staleCheck, statusCheck);
  const nonIssuedBranch = method.slice(statusCheck, htmlWrite);
  assert.match(staleBranch, /printWindow\.close\(\);\s*return;/);
  assert.match(nonIssuedBranch, /if \(detail\.status !== 'issued'\) \{\s*throw new Error\(/);
  assert.match(method.slice(method.indexOf('} catch (error) {')), /printWindow\.close\(\)/);
  assert.match(method, /printWindow\.onload = \(\) => printWindow\.print\(\)/);
});
