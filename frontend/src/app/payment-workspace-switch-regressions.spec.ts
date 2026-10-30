import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('workspace selection is disabled while a payment mutation is pending', () => {
  assert.match(componentSource, /\(ngModelChange\)="switchBusiness\(\$event\)" \[disabled\]="paymentSaving"/);
  assert.match(componentSource, /async switchBusiness\(id: string\): Promise<void> \{[\s\S]*?if \(this\.paymentSaving\) return;[\s\S]*?this\.clearWorkspaceData\(\);/);
});

test('payment submission is single-flight and retains its idempotency key until the request settles', () => {
  assert.match(componentSource, /async createPayment\(\): Promise<void> \{\s*if \(this\.paymentSaving\) return;/);
  assert.match(componentSource, /this\.paymentSaving = true;[\s\S]*?await this\.api\.createPayment\(businessId, \{[\s\S]*?idempotency_key: this\.paymentIdempotencyKey/);
  assert.match(componentSource, /\} finally \{\s*this\.paymentSaving = false;\s*this\.loading = false;/);
});
