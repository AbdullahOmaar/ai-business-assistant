import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./bank-reconciliation.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('bank reconciliation UI is bilingual and only exposes owner mutations', () => {
  assert.match(component, /role === 'owner'/);
  assert.match(component, /مطابقة كشف البنك والصندوق/);
  assert.match(component, /Bank & cash reconciliation/);
  assert.match(app, /tab === 'reconciliation' && business\?\.role === 'owner'/);
});

test('CSV import uses the tenant-scoped bank account endpoint', () => {
  assert.match(component, /this\.api\.importBankStatement\(this\.businessId/);
  assert.match(api, /\/bank-accounts\/\$\{encodeURIComponent\(accountId\)\}\/statement-import/);
  assert.match(api, /transaction_id/);
});

test('matching only links existing payment or expense records', () => {
  assert.match(component, /this\.api\.matchBankStatementRow\(this\.businessId/);
  assert.match(component, /payment_id: target/);
  assert.match(component, /expense_id: target/);
  assert.match(api, /\/bank-reconciliation\/matches/);
});

test('workspace filters eligible targets by exact amount and currency', () => {
  assert.match(component, /item\.currency_code === row\.currency_code/);
  assert.match(component, /Number\(item\.amount\) === Math\.abs\(Number\(row\.amount\)\)/);
});

test('workspace invalidates stale requests when business changes', () => {
  assert.match(component, /private requestVersion = 0/);
  assert.match(component, /version !== this\.requestVersion/);
});
