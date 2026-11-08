import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('workspace navigation shows UI/API versions and build time in the workspace card', () => {
  assert.match(source, /class="workspace-release-meta workspace-release-meta-inline"/);
  assert.match(source, /UI v\{\{ appVersion \}\} · API \{\{ apiVersionLabel \}\}/);
  assert.match(source, /t\('وقت بناء النسخة:', 'Build time:'\).*buildTimeLabel/);
  assert.equal(source.includes('class="mobile-version-strip"'), false);
  assert.equal(source.includes('class="mobile-deploy-time"'), false);
});

test('payment controls are only exposed to workspace owners', () => {
  assert.match(source, /@if \(tab === 'payments' && business\.role === 'owner'\)/);
  assert.match(source, /tab === 'payments' && business\?\.role !== 'owner'/);
  assert.match(source, /tab === 'payments' && business\.role === 'owner'/);
  assert.match(source, /Recording payments is restricted to workspace owners/);
});

test('payment retries preserve the idempotency key after an uncertain result', () => {
  const start = source.indexOf('async createPayment(): Promise<void>');
  const end = source.indexOf('useAssistantSuggestion(', start);
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
  assert.match(source, /\[disabled\]="paymentRetryPending \|\| paymentLoading"/);
});

test('payment API failures render a visible accessible alert in the payment panel', () => {
  assert.match(source, /@if \(paymentMessage\) \{ <aba-state-message \[kind\]="paymentMessageKind" \[description\]="paymentMessage" \/> \}/);
  assert.match(source, /this\.paymentMessage = this\.message\(error\)/);
  assert.match(source, /this\.paymentMessageKind = 'error'/);
});
