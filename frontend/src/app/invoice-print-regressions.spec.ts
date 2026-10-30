import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const printMethod = componentSource.match(
  /async printInvoice\(invoice: Invoice\): Promise<void> \{[\s\S]*?\n  \}\n  async editInvoice/
)?.[0] ?? '';

test('invoice print re-fetches persisted detail and refuses invoices no longer issued', () => {
  assert.match(componentSource, /async printInvoice\(invoice: Invoice\): Promise<void> \{[\s\S]*?invoice\.status !== 'issued'[\s\S]*?const businessId = business\.id[\s\S]*?this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(componentSource, /if \(detail\.status !== 'issued'\) \{[\s\S]*?throw new Error/);
});

test('invoice print uses persisted totals and date/note fields instead of recalculating totals', () => {
  assert.match(apiSource, /issue_date\?: string \| null/);
  assert.match(apiSource, /due_date\?: string \| null/);
  assert.match(apiSource, /notes\?: string \| null/);
  assert.match(apiSource, /lines: Array<\{ id: string; product_id: string \| null; description: string; quantity: string; unit_price: string; line_total: string \}>/);
  assert.match(componentSource, /detail\.subtotal \?\? detail\.total/);
  assert.match(componentSource, /detail\.discount_total \?\? '0\.00'/);
  assert.match(componentSource, /detail\.tax_total \?\? '0\.00'/);
  assert.match(componentSource, /detail\.total/);
  assert.match(componentSource, /detail\.issue_date \? detail\.issue_date\.slice\(0, 10\)/);
  assert.match(componentSource, /detail\.due_date \? detail\.due_date\.slice\(0, 10\)/);
  assert.match(componentSource, /detail\.notes\?\.trim\(\)/);
  assert.match(componentSource, /const currency = this\.escapePrintHtml\(detail\.currency_code\)/);
});

test('dynamic invoice print values are HTML-escaped before document insertion', () => {
  for (const expression of [
    /this\.escapePrintHtml\(line\.description\)/,
    /this\.escapePrintHtml\(line\.quantity\)/,
    /this\.escapePrintHtml\(line\.unit_price\)/,
    /this\.escapePrintHtml\(line\.line_total\)/,
    /this\.escapePrintHtml\(detail\.invoice_number\)/,
    /this\.escapePrintHtml\(this\.customerNameForInvoice\(detail\.customer_id\)\)/,
    /this\.escapePrintHtml\(detail\.currency_code\)/,
    /this\.escapePrintHtml\(detail\.subtotal \?\? detail\.total\)/,
    /this\.escapePrintHtml\(detail\.discount_total \?\? '0\.00'\)/,
    /this\.escapePrintHtml\(detail\.tax_total \?\? '0\.00'\)/,
    /this\.escapePrintHtml\(detail\.total\)/,
    /this\.escapePrintHtml\(detail\.notes\)/,
    /this\.escapePrintHtml\(business\.name\)/,
    /escapePrintHtml\(value: unknown\): string/
  ]) assert.match(componentSource, expression);
});

test('invoice print uses the current language direction and excludes action controls from printed output', () => {
  assert.match(componentSource, /const direction = this\.language === 'ar' \? 'rtl' : 'ltr'/);
  assert.match(componentSource, /@media print\{body\{padding:0\}\.actions\{display:none\}/);
});

test('invoice print closes instead of rendering a previous workspace after a workspace switch', () => {
  assert.match(componentSource, /const business = this\.business;[\s\S]*?const businessId = business\.id/);
  assert.match(componentSource, /this\.api\.invoiceDetail\(businessId, invoice\.id\)[\s\S]*?if \(this\.business\?\.id !== businessId\) \{[\s\S]*?printWindow\.close\(\);[\s\S]*?return;/);
  assert.match(componentSource, /this\.escapePrintHtml\(business\.name\)/);
});

test('invoice printing is read-only and only calls the persisted detail endpoint', () => {
  assert.ok(printMethod, 'printInvoice method should remain discoverable for the safety check');
  assert.match(printMethod, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.doesNotMatch(printMethod, /this\.api\.(?:create|update|issue|void|pay|delete)[A-Z]\w*\s*\(/);
});

test('invoice print handles popup blockers and closes the temporary window on failures', () => {
  assert.match(printMethod, /const printWindow = window\.open\('', '_blank'\);[\s\S]*?if \(!printWindow\) \{[\s\S]*?return;/);
  assert.match(printMethod, /catch \(error\) \{[\s\S]*?printWindow\.close\(\);/);
});

test('invoice customer label is resolved from the current directory cache, not an invoice name snapshot', () => {
  assert.match(printMethod, /this\.customerNameForInvoice\(detail\.customer_id\)/);
  assert.match(componentSource, /customerNameForInvoice\(customerId\?: string \| null\): string \{[\s\S]*?this\.customers\.find\(customer => customer\.id === customerId\)/);
});
