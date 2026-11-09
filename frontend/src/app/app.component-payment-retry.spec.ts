import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

function methodBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method: ${startMarker}`);
  return source.slice(start, end);
}

test('payment retry uses the same immutable snapshot and idempotency key after uncertain outcomes', () => {
  const payment = methodBetween('async createPayment(): Promise<void>', 'useAssistantSuggestion(');
  const save = payment.indexOf('this.paymentRetryVault.save(authUid, retrySnapshot)');
  const request = payment.indexOf('await this.api.createPayment(businessId, requestPayload)');
  assert.ok(save >= 0 && request > save);
  assert.match(payment, /this\.paymentRetryVault\.get\(authUid, businessId\)/);
  assert.match(payment, /paymentRequestFromRetrySnapshot\(retrySnapshot\)/);
  assert.match(payment, /error instanceof ApiRequestError && error\.definitiveNoWrite/);
  assert.match(payment, /original payload and idempotency key were preserved/);
});

test('retry state is restored only for the same authenticated user and workspace', () => {
  assert.match(source, /this\.paymentRetryVault\.get\(this\.currentAuthUid, id\)/);
  assert.match(source, /paymentRetryPending \|\| paymentForm\.valid/);
  assert.match(source, /paymentRetryPending\) \{ <p class="footnote"/);
  const switchMethod = methodBetween('async switchBusiness(id: string)', 'private readonly workspaceLoadGuard');
  assert.match(switchMethod, /this\.paymentRetryPending/);
});

test('payment form details are locked while an uncertain request is pending', () => {
  assert.match(source, /\[disabled\]="paymentRetryPending"/);
  assert.match(source, /paymentLoading \? t\('جارٍ التسجيل…'/);
  assert.match(source, /paymentRetryPending \? t\('إعادة المحاولة بنفس الدفعة'/);
});
