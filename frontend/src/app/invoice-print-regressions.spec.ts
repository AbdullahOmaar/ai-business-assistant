import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('invoice print re-fetches persisted detail and refuses invoices no longer issued', () => {
  assert.match(componentSource, /async printInvoice\(invoice: Invoice\): Promise<void> \{[\s\S]*?invoice\.status !== 'issued'[\s\S]*?this\.api\.invoiceDetail\(this\.business\.id, invoice\.id\)/);
  assert.match(componentSource, /if \(detail\.status !== 'issued'\) \{[\s\S]*?throw new Error/);
});

test('invoice print uses persisted totals and date/note fields instead of recalculating totals', () => {
  assert.match(apiSource, /issue_date\?: string \| null/);
  assert.match(apiSource, /due_date\?: string \| null/);
  assert.match(apiSource, /notes\?: string \| null/);
  assert.match(componentSource, /detail\.subtotal \?\? detail\.total/);
  assert.match(componentSource, /detail\.discount_total \?\? '0\.00'/);
  assert.match(componentSource, /detail\.tax_total \?\? '0\.00'/);
  assert.match(componentSource, /detail\.issue_date \? detail\.issue_date\.slice\(0, 10\)/);
  assert.match(componentSource, /detail\.due_date \? detail\.due_date\.slice\(0, 10\)/);
  assert.match(componentSource, /detail\.notes\?\.trim\(\)/);
});

test('dynamic invoice print values are HTML-escaped before document insertion', () => {
  assert.match(componentSource, /this\.escapePrintHtml\(line\.description\)/);
  assert.match(componentSource, /this\.escapePrintHtml\(detail\.invoice_number\)/);
  assert.match(componentSource, /this\.escapePrintHtml\(detail\.notes\)/);
  assert.match(componentSource, /this\.escapePrintHtml\(this\.business\.name\)/);
  assert.match(componentSource, /escapePrintHtml\(value: string\): string/);
});

test('invoice print uses the current language direction and excludes action controls from printed output', () => {
  assert.match(componentSource, /const direction = this\.language === 'ar' \? 'rtl' : 'ltr'/);
  assert.match(componentSource, /@media print\{body\{padding:0\}\.actions\{display:none\}/);
});
