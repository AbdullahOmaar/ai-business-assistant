import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const source = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
// 3A-921 F1c: the payments section markup lives in the payments workspace now.
const paymentsSource = expandTranslationCalls(readFileSync(new URL('./payments-workspace.component.ts', import.meta.url), 'utf8'));

test('workspace navigation shows UI/API versions and build time in the workspace card', () => {
  assert.match(source, /class="workspace-release-meta workspace-release-meta-inline"/);
  assert.match(source, /UI v\{\{ appVersion \}\} · API \{\{ apiVersionLabel \}\}/);
  assert.match(source, /t\('وقت بناء النسخة:', 'Build time:'\).*buildTimeLabel/);
  assert.equal(source.includes('class="mobile-version-strip"'), false);
  assert.equal(source.includes('class="mobile-deploy-time"'), false);
});

test('payment controls are only exposed to workspace owners', () => {
  // 3A-921 F1c: the shell hosts the workspace behind the tab gate and
  // passes the role in; the owner branch renders inside the component.
  assert.match(source, /@if \(tab === 'payments'\)/);
  assert.match(source, /\[role\]="business\.role"/);
  assert.match(paymentsSource, /@if \(role !== 'owner'\)/);
  assert.match(paymentsSource, /Recording payments is restricted to workspace owners/);
});

test('payment retries preserve the idempotency key after an uncertain result', () => {
  const start = source.indexOf('async createPayment(): Promise<void>');
  // 3A-351: the chat methods moved to the assistant workspace; the next
  // shell method after createPayment is now captureTenantRequest.
  const end = source.indexOf('private captureTenantRequest(', start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /this\.paymentRetryVault\.get\(authUid, businessId\)/);
  assert.match(handler, /createPaymentRetrySnapshot\(businessId/);
  assert.match(handler, /this\.paymentRetryVault\.save\(authUid, retrySnapshot\)/);
  assert.match(handler, /paymentRequestFromRetrySnapshot\(retrySnapshot\)/);
  assert.match(handler, /original payload and idempotency key were preserved/);
  assert.match(handler, /if \(error instanceof ApiRequestError && error\.definitiveNoWrite\)/);
  assert.match(handler, /this\.paymentRetryVault\.delete\(authUid, businessId\)/);
  assert.match(handler, /finally \{\s*if \(isCurrent\(\)\) this\.paymentLoading = false;/);
  assert.match(paymentsSource, /name="paymentAmount"[^>]*\[disabled\]="paymentRetryPending"/);
  assert.match(paymentsSource, /name="paymentCustomer"[^>]*\[disabled\]="paymentRetryPending"/);
  assert.match(paymentsSource, /<button class="primary" type="submit" \[disabled\]="paymentLoading"/);
});

test('payment API failures render a visible accessible alert in the payment panel', () => {
  assert.match(paymentsSource, /@if \(paymentMessage\) \{ <aba-state-message \[kind\]="paymentMessageKind" \[description\]="paymentMessage" \/> \}/);
  assert.match(source, /this\.paymentMessage = this\.message\(error\)/);
  assert.match(source, /this\.paymentMessageKind = 'error'/);
});
