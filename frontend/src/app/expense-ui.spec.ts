import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('expenses use a typed workspace-scoped API', () => {
  assert.match(api, /export interface Expense\s*\{/);
  assert.match(api, /expenses\(businessId: string\): Promise<Expense\[]>/);
  assert.match(api, /encodeURIComponent\(businessId\)\}\/expenses\?limit=100&offset=0/);
  assert.match(api, /createExpense\(businessId: string, body:/);
  assert.match(api, /encodeURIComponent\(businessId\)\}\/expenses/);
});

test('expense view is reachable from mobile More and has bilingual labels', () => {
  assert.match(ui, /type Tab = [^;]*'expenses'/);
  assert.match(ui, /setTab\('expenses'\)/);
  assert.match(ui, /@if \(tab === 'expenses'\)/);
  assert.match(ui, /t\('تسجيل مصروف', 'Record an expense'\)/);
  assert.match(ui, /t\('حفظ المصروف', 'Save expense'\)/);
  assert.match(ui, /\['products','payments','expenses','assistant'/);
});

test('workspace load and clear paths include expense records', () => {
  assert.match(ui, /this\.api\.payments\(id\), this\.api\.expenses\(id\)/);
  assert.match(ui, /this\.expenses = مصروفات/);
  assert.match(ui, /this\.expenses = \[\]/);
});

test('expense submission rejects invalid amounts and dates and sends current workspace currency', () => {
  const start = ui.indexOf('async createExpense(): Promise<void>');
  const end = ui.indexOf('async createPayment(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = ui.slice(start, end);
  assert.match(method, /Number\.isFinite\(amount\) \|\| amount <= 0/);
  assert.match(method, /Number\.isFinite\(occurredAt\.getTime\(\)\)/);
  assert.match(method, /currency_code: currencyCode/);
  assert.match(method, /incurred_at: occurredAt\.toISOString\(\)/);
  assert.match(method, /this\.business\?\.id !== businessId/);
});
