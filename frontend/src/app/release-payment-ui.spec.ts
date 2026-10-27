import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('workspace navigation shows UI/API versions and the build/deploy timestamp', () => {
  assert.match(source, /class="workspace-release-meta"/);
  assert.match(source, /UI v\{\{ appVersion \}\} · API \{\{ apiVersionLabel \}\}/);
  assert.match(source, /Last deployment \(build time\):/);
  assert.match(source, /\{\{ buildTimeLabel \}\}/);
  assert.match(source, /class="mobile-deploy-time"/);
});

test('payment controls are only exposed to workspace owners', () => {
  assert.match(source, /business\?\.role === 'owner'.{0,400}المدفوعات/s);
  assert.match(source, /tab === 'payments' && business(?:\?\.|\.)role !== 'owner'/);
  assert.match(source, /tab === 'payments' && business(?:\?\.|\.)role === 'owner'/);
  assert.match(source, /Recording payments is restricted to workspace owners/);
});

test('payment retries preserve the idempotency key after an uncertain result', () => {
  const start = source.indexOf('async createPayment(): Promise<void>');
  const end = source.indexOf('\n  useAssistantSuggestion(', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /if \(!this\.paymentIdempotencyKey\)/);
  assert.match(handler, /Preserve entered values and the idempotency key if the save failed or its outcome is uncertain/);
  assert.match(handler, /this\.paymentIdempotencyKey = ''/);
});
