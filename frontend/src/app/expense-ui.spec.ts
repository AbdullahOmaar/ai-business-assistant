import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const moduleAccess = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');

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
  assert.match(ui, /isMobileMoreTab\(tab\)/);
  assert.match(moduleAccess, /'products', 'payments', 'expenses', 'employees', 'assistant'/);
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

test('ambiguous expense save outcome blocks another submit until the expense list is refreshed', () => {
  const start = ui.indexOf('async createExpense(): Promise<void>');
  const end = ui.indexOf('async createPayment(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = ui.slice(start, end);
  assert.match(method, /this\.expenseSubmissionUncertain = true/);
  assert.match(method, /if \(!this\.business \|\| this\.expenseSubmissionUncertain\) return;/);
  assert.match(ui, /<button class="primary" type="submit" \[disabled\]="loading \|\| expenseSubmissionUncertain">/);
  assert.match(ui, /\[disabled\]="loading \|\| expenseSubmissionUncertain"/);
  assert.match(ui, /checkExpenseSubmissionOutcome\(\)/);
  const checkStart = ui.indexOf('async checkExpenseSubmissionOutcome(): Promise<void>');
  const checkEnd = ui.indexOf('async createPayment(): Promise<void>', checkStart);
  const checkMethod = ui.slice(checkStart, checkEnd);
  assert.match(checkMethod, /this\.api\.expenses\(businessId\)/);
  assert.match(checkMethod, /this\.expenseSubmissionUncertain = false/);
});

test('numeric amount values are stringified before trimming and local datetime defaults preserve wall time', () => {
  const start = ui.indexOf('async createExpense(): Promise<void>');
  const end = ui.indexOf('async checkExpenseSubmissionOutcome(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = ui.slice(start, end);
  assert.equal(method.includes('this.expenseAmount.trim()'), false);
  assert.match(method, /String\(this\.expenseAmount \?\? ''\)\.trim\(\)/);
  assert.match(ui, /expenseDate = new Date\(Date\.now\(\) - new Date\(\)\.getTimezoneOffset\(\) \* 60_000\)\.toISOString\(\)\.slice\(0, 16\)/);
  assert.match(method, /this\.expenseDate = new Date\(Date\.now\(\) - new Date\(\)\.getTimezoneOffset\(\) \* 60_000\)\.toISOString\(\)\.slice\(0, 16\)/);
});

test('expense form exposes bilingual accessible validation without blocking invalid submit feedback', () => {
  const start = ui.indexOf('<form #expenseForm="ngForm" class="inline-form expense-form"');
  const end = ui.indexOf('</form>', start);
  assert.ok(start >= 0 && end > start);
  const form = ui.slice(start, end);
  const fields = [
    ['expenseCategoryControl', 'expense-category-error'],
    ['expenseDescriptionControl', 'expense-description-error'],
    ['expenseAmountControl', 'expense-amount-error'],
    ['expenseDateControl', 'expense-date-error'],
  ];
  for (const [control, id] of fields) {
    assert.ok(form.includes('#' + control + '="ngModel"'), control);
    assert.ok(form.includes('[attr.aria-invalid]="' + control + '.invalid && (' + control + '.touched || expenseForm.submitted) ? \'true\' : null"'), control + ' invalid state');
    assert.ok(form.includes('[attr.aria-describedby]="' + control + '.invalid && (' + control + '.touched || expenseForm.submitted) ? \'' + id + '\' : null"'), control + ' error association');
    assert.ok(ui.includes('id="' + id + '"'), id + ' message must exist');
  }
  assert.match(ui, /class="expense-validation" aria-live="polite"/);
  assert.match(form, /type="submit" \[disabled\]="loading \|\| expenseSubmissionUncertain"/);
  assert.doesNotMatch(form, /!expenseCategory\.trim\(\)|!expenseDescription\.trim\(\)|!expenseAmount/);
  assert.match(form, /name="expenseDescription" maxlength="500"/);
  assert.match(form, /name="expenseAmount" type="number" min="0\.01" step="0\.01"/);
  assert.match(form, /name="expenseVendor" maxlength="160"/);
  assert.match(form, /name="expenseReference" maxlength="128"/);
  for (const message of [
    "اختر تصنيف المصروف.",
    "Choose an expense category.",
    "اكتب وصف المصروف (بحد أقصى 500 حرف).",
    "Enter an expense description (up to 500 characters).",
    "أدخل مبلغًا أكبر من صفر وبحد أقصى منزلتين عشريتين.",
    "Enter an amount greater than zero with up to two decimal places.",
    "اختر تاريخ ووقت المصروف.",
    "Choose the expense date and time.",
  ]) assert.ok(ui.includes(message), message);
});
