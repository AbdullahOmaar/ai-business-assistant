import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const source = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
// 3A-921 F1c: the payment form markup lives in the payments workspace now.
const paymentsSource = expandTranslationCalls(readFileSync(new URL('./payments-workspace.component.ts', import.meta.url), 'utf8'));
const snapshotSource = readFileSync(new URL('./payment-retry-snapshot.ts', import.meta.url), 'utf8');

function methodBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method: ${startMarker}`);
  return source.slice(start, end);
}

test('payment retry uses the same immutable snapshot and idempotency key after uncertain outcomes', () => {
  // 3A-351: the chat methods moved to the assistant workspace; the next
  // shell method after createPayment is now captureTenantRequest.
  const payment = methodBetween('async createPayment(): Promise<void>', 'private captureTenantRequest(');
  const save = payment.indexOf('this.paymentRetryVault.save(authUid, retrySnapshot)');
  const request = payment.indexOf('await this.api.createPayment(businessId, requestPayload)');
  assert.ok(save >= 0 && request > save);
  assert.match(payment, /this\.paymentRetryVault\.get\(authUid, businessId\)/);
  assert.match(payment, /paymentRequestFromRetrySnapshot\(retrySnapshot\)/);
  assert.match(payment, /error instanceof ApiRequestError && error\.definitiveNoWrite/);
  assert.match(payment, /createPaymentRetrySnapshot\(businessId/);
  assert.match(snapshotSource, /idempotency_key/);
  assert.match(snapshotSource, /deepFreeze\(/);
  assert.match(snapshotSource, /Object\.freeze\(value\)/);
});

test('retry state is restored only for the same authenticated user and workspace', () => {
  assert.match(source, /this\.paymentRetryVault\.get\(this\.currentAuthUid, id\)/);
  assert.match(paymentsSource, /paymentRetryPending \|\| paymentForm\.valid/);
  assert.match(paymentsSource, /paymentRetryPending\) \{ <p class="footnote"/);
  const switchMethod = methodBetween('async switchBusiness(id: string)', 'private readonly workspaceLoadGuard');
  assert.match(switchMethod, /this\.paymentRetryPending/);
});

test('payment form details are locked while an uncertain request is pending', () => {
  assert.match(paymentsSource, /\[disabled\]="paymentRetryPending"/);
  assert.match(paymentsSource, /paymentLoading \? t\('جارٍ التسجيل…'/);
  assert.match(paymentsSource, /paymentRetryPending \? t\('إعادة المحاولة بنفس الدفعة'/);
});

test('numeric payment form values are normalized before creating the retry snapshot', () => {
  const payment = methodBetween('async createPayment(): Promise<void>', 'private captureTenantRequest(');
  assert.match(payment, /const amount = String\(this\.paymentAmount \?\? ''\)\.trim\(\)/);
  assert.match(payment, /const allocation = String\(this\.paymentAllocationAmount \?\? ''\)\.trim\(\)/);
  assert.match(payment, /amount,\s*currency_code:/);
  assert.match(payment, /amount: allocation/);
});

test('add-payment form opens on demand next to export and is hidden by default', () => {
  // The form starts closed; it only renders on demand (or while a retry is pending).
  assert.match(source, /showPaymentForm = false;/);
  assert.match(paymentsSource, /@if \(showPaymentForm \|\| paymentRetryPending\) \{\s*<form #paymentForm="ngForm"/);
  // The toggle lives in the payments section actions, next to the Export CSV button.
  // 3A-921 F1c: the section lives in the payments workspace now.
  const sectionStart = paymentsSource.indexOf("@if (role !== 'owner')");
  const actionsStart = paymentsSource.indexOf('<div class="section-actions">', sectionStart);
  const actionsEnd = paymentsSource.indexOf('</div>', actionsStart);
  assert.ok(sectionStart >= 0 && actionsStart > sectionStart && actionsEnd > actionsStart);
  const actions = paymentsSource.slice(actionsStart, actionsEnd);
  assert.ok(actions.includes('(click)="exportPaymentsCsv()"'));
  // 3A-921 F1c: the toggle flips the shell field through the two-way binding.
  assert.ok(actions.includes('(click)="showPaymentFormChange.emit(!showPaymentForm)"'));
  assert.ok(actions.includes('[disabled]="paymentRetryPending"'));
  // Toggle label: "Record payment" when closed, "Cancel" when open (bilingual expansion).
  assert.match(actions, /showPaymentForm \? t\('[^']*', 'Cancel'\) : t\('[^']*', 'Record payment'\)/);
});

test('payment customer field comes before the amount field', () => {
  const formStart = paymentsSource.indexOf('<form #paymentForm="ngForm"');
  const formEnd = paymentsSource.indexOf('</form>', formStart);
  const form = paymentsSource.slice(formStart, formEnd);
  const customer = form.indexOf('name="paymentCustomer"');
  const amount = form.indexOf('name="paymentAmount"');
  assert.ok(customer >= 0 && amount > customer, 'customer select must precede the amount input');
});

test('payment form invents no payment-date field', () => {
  const formStart = paymentsSource.indexOf('<form #paymentForm="ngForm"');
  const formEnd = paymentsSource.indexOf('</form>', formStart);
  const form = paymentsSource.slice(formStart, formEnd);
  assert.equal(form.includes('type="date"'), false);
  assert.equal(form.includes('paymentDate'), false);
});

test('a restored uncertain payment retry reopens the add-payment form', () => {
  // Mirrors the invoice draft: a restored uncertain outcome forces its editor open,
  // so the retry action is never hidden behind the closed on-demand form.
  assert.match(source, /if \(savedPaymentRetry\) \{\s*this\.pendingPaymentRetrySnapshot = savedPaymentRetry;\s*this\.paymentRetryPending = true;\s*this\.showPaymentForm = true;/);
});
