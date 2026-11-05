import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('customer statement exposes accessible date-range controls and clear/apply actions', () => {
  assert.match(componentSource, /name="statementFromDate"[^>]*type="date"|type="date"[^>]*name="statementFromDate"/);
  assert.match(componentSource, /name="statementToDate"[^>]*type="date"|type="date"[^>]*name="statementToDate"/);
  assert.match(componentSource, /\(click\)="applyCustomerStatementFilters\(\)"/);
  assert.match(componentSource, /\(click\)="clearCustomerStatementFilters\(\)"/);
});

test('customer statement rejects reversed ranges before issuing a request', () => {
  assert.match(componentSource, /this\.statementFromDate > this\.statementToDate/);
  assert.match(componentSource, /Start date must be on or before end date\./);
  assert.match(componentSource, /if \(this\.statementFromDate && this\.statementToDate && this\.statementFromDate > this\.statementToDate\) \{[\s\S]*?return;[\s\S]*?\}/);
});

test('applying or clearing statement dates reloads from the first page', () => {
  assert.match(componentSource, /async applyCustomerStatementFilters\(\): Promise<void> \{[\s\S]*?loadCustomerStatementPage\(0\)/);
  assert.match(componentSource, /async clearCustomerStatementFilters\(\): Promise<void> \{[\s\S]*?this\.statementFromDate = '';[\s\S]*?this\.statementToDate = '';[\s\S]*?loadCustomerStatementPage\(0\)/);
  assert.match(componentSource, /this\.statementFromDate = '';[\s\S]*?this\.statementToDate = '';[\s\S]*?async applyCustomerStatementFilters/);
});

test('statement requests send only supplied date filters using URLSearchParams', () => {
  assert.match(apiSource, /customerStatement\([\s\S]*?fromDate\?: string,[\s\S]*?toDate\?: string/);
  assert.match(apiSource, /if \(fromDate\) params\.set\('from_date', fromDate\)/);
  assert.match(apiSource, /if \(toDate\) params\.set\('to_date', toDate\)/);
  assert.match(apiSource, /customers\/\$\{encodeURIComponent\(customerId\)\}\/statement\?\$\{params\.toString\(\)\}/);
});

test('statement requests retain tenant and request-version stale-response protection', () => {
  assert.match(componentSource, /const requestVersion = this\.statementLoadGuard\.begin\(\)/);
  assert.match(componentSource, /isCurrentTenantRequest\(/);
  assert.match(componentSource, /if \(!isCurrentRequest\(\)\) return;/);
  assert.match(componentSource, /this\.statementLoadGuard\.isLatest\(requestVersion\)/);
});
