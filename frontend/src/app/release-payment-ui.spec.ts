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
  assert.match(source, /business\?\.role === 'owner'.{0,400}المدفوعات/s);
  assert.match(source, /tab === 'payments' && business\?\.role !== 'owner'/);
  assert.match(source, /tab === 'payments' && business\?\.role === 'owner'/);
  assert.match(source, /Recording payments is restricted to workspace owners/);
});

test('payment retries preserve the idempotency key after an uncertain result', () => {
  const start = source.indexOf('async createPayment(): Promise<void>');
  const end = source.indexOf('\n  useAssistantSuggestion(', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /if \(!this\.paymentIdempotencyKey\)/);
  assert.match(handler, /this\.paymentRetryVault\.save\(authUid, retrySnapshot\)/);
  assert.match(handler, /this\.paymentRetryVault\.get\(authUid, businessId\)/);
  assert.match(handler, /original payload and idempotency key were preserved/);
  assert.ok(
    handler.indexOf('this.paymentRetryVault.save(authUid, retrySnapshot)') <
      handler.indexOf('await this.api.createPayment(businessId, requestPayload)'),
    'the immutable retry record must be stored before the network request',
  );
  assert.match(handler, /this\.paymentRetryVault\.delete\(authUid, businessId\)/);
  assert.match(handler, /this\.paymentIdempotencyKey = ''/);
});


test('payment API failures render a visible accessible alert in the payment panel', () => {
  assert.match(source, /\[attr\.role\]="paymentError \? 'alert' : 'status'"/);
  assert.match(source, /this\.paymentMessage = this\.message\(error\)/);
  assert.match(source, /this\.paymentError = true/);
});
