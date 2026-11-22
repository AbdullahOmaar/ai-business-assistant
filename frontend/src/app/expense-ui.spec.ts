import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const ui = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
const overviewUi = expandTranslationCalls(readFileSync(new URL('./overview-workspace.component.ts', import.meta.url), 'utf8'));
// 3A-351: the expenses tab moved into its own deferred workspace component.
const expensesUi = expandTranslationCalls(readFileSync(new URL('./expenses-workspace.component.ts', import.meta.url), 'utf8'));
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
  // 3A-351: the Home KPI card and dashboard action that navigate to expenses
  // live in the overview workspace and emit through its navigate output.
  assert.match(overviewUi, /navigate\.emit\('expenses'\)/);
  assert.match(ui, /@if \(tab === 'expenses'\)/);
  // 3A-351: the expense form labels live in the expenses workspace now.
  assert.match(expensesUi, /t\('تسجيل مصروف', 'Record an expense'\)/);
  assert.match(expensesUi, /t\('حفظ المصروف', 'Save expense'\)/);
  assert.match(ui, /isMobileMoreTab\(tab\)/);
  assert.match(moduleAccess, /'products', 'payments', 'expenses', 'employees', 'assistant'/);
});

test('workspace load and clear paths include expense records', () => {
  assert.match(ui, /const paymentsRequest = this\.canAccessTab\('payments'\) \? this\.api\.payments\(id\) : Promise\.resolve\(\[\]\)/);
  // 3A-351: the shell bootstrap no longer fetches expenses; the expenses
  // workspace loads them itself on init and on business change, and clears
  // them when the workspace changes.
  assert.doesNotMatch(ui, /this\.api\.expenses\(id\)/);
  assert.match(expensesUi, /async loadExpenses\(\): Promise<void>/);
  assert.match(expensesUi, /\(\) => this\.api\.expenses\(requestContext\.workspaceId\)/);
  assert.match(expensesUi, /this\.expenses = \[\];/);
});

test('expense submission rejects invalid amounts and dates and sends current workspace currency', () => {
  // 3A-351: createExpense lives in the expenses workspace now; the check
  // method follows it there.
  const start = expensesUi.indexOf('async createExpense(): Promise<void>');
  const end = expensesUi.indexOf('async checkExpenseSubmissionOutcome(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = expensesUi.slice(start, end);
  assert.match(method, /Number\.isFinite\(amount\) \|\| amount <= 0/);
  assert.match(method, /Number\.isFinite\(occurredAt\.getTime\(\)\)/);
  assert.match(method, /currency_code: currencyCode/);
  assert.match(method, /incurred_at: occurredAt\.toISOString\(\)/);
  assert.match(method, /this\.businessId\(\) !== businessId/);
});

test('ambiguous expense save outcome blocks another submit until the expense list is refreshed', () => {
  const start = expensesUi.indexOf('async createExpense(): Promise<void>');
  const end = expensesUi.indexOf('async checkExpenseSubmissionOutcome(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = expensesUi.slice(start, end);
  assert.match(method, /this\.expenseSubmissionUncertain = true/);
  assert.match(method, /if \(!this\.businessId\(\) \|\| this\.expenseSubmissionUncertain\) return;/);
  // 3A-351: the submit button also disables while a create/retry is in
  // flight (the workspace's local submitting flag, not the shell counter).
  assert.match(expensesUi, /<button class="primary" type="submit" \[disabled\]="loading\(\) \|\| submitting \|\| expenseSubmissionUncertain">/);
  assert.match(expensesUi, /\[disabled\]="loading\(\) \|\| submitting \|\| expenseSubmissionUncertain"/);
  assert.match(expensesUi, /checkExpenseSubmissionOutcome\(\)/);
  const checkStart = expensesUi.indexOf('async checkExpenseSubmissionOutcome(): Promise<void>');
  const checkEnd = expensesUi.indexOf('  formatRecordDate(', checkStart);
  const checkMethod = expensesUi.slice(checkStart, checkEnd);
  assert.match(checkMethod, /this\.api\.expenses\(businessId\)/);
  assert.match(checkMethod, /this\.expenseSubmissionUncertain = false/);
});

test('numeric amount values are stringified before trimming and local datetime defaults preserve wall time', () => {
  const start = expensesUi.indexOf('async createExpense(): Promise<void>');
  const end = expensesUi.indexOf('async checkExpenseSubmissionOutcome(): Promise<void>', start);
  assert.ok(start >= 0 && end > start);
  const method = expensesUi.slice(start, end);
  assert.equal(method.includes('this.expenseAmount.trim()'), false);
  assert.match(method, /String\(this\.expenseAmount \?\? ''\)\.trim\(\)/);
  assert.match(expensesUi, /expenseDate = new Date\(Date\.now\(\) - new Date\(\)\.getTimezoneOffset\(\) \* 60_000\)\.toISOString\(\)\.slice\(0, 16\)/);
  assert.match(method, /this\.expenseDate = new Date\(Date\.now\(\) - new Date\(\)\.getTimezoneOffset\(\) \* 60_000\)\.toISOString\(\)\.slice\(0, 16\)/);
});

test('expense form exposes bilingual accessible validation without blocking invalid submit feedback', () => {
  // 3A-351: the expense form lives in the expenses workspace now.
  const start = expensesUi.indexOf('<form #expenseForm="ngForm" class="inline-form expense-form"');
  const end = expensesUi.indexOf('</form>', start);
  assert.ok(start >= 0 && end > start);
  const form = expensesUi.slice(start, end);
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
    assert.ok(expensesUi.includes('id="' + id + '"'), id + ' message must exist');
  }
  assert.match(expensesUi, /class="expense-validation" aria-live="polite"/);
  assert.match(form, /type="submit" \[disabled\]="loading\(\) \|\| submitting \|\| expenseSubmissionUncertain"/);
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
  ]) assert.ok(expensesUi.includes(message), message);
});
