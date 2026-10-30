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



test('all mutable payment controls are disabled while a payment request is pending', () => {
  const start = componentSource.indexOf('<form class="inline-form payment-form"');
  const end = componentSource.indexOf('</form>', start);
  const form = componentSource.slice(start, end);
  assert.ok(start >= 0 && end > start, 'payment form must exist');

  for (const name of ['paymentAmount', 'paymentCustomer', 'paymentMethod', 'paymentReference']) {
    const control = form.match(new RegExp('<(?:input|select)[^>]*name="' + name + '"[^>]*>'))?.[0] ?? '';
    assert.ok(control.includes('[disabled]="paymentSaving'),
      name + ' must be locked while paymentSaving is true');
  }
  assert.match(form, /\[name\]="'paymentAllocationInvoice'[\s\S]*?\[disabled\]="paymentSaving"/);
  assert.match(form, /\[name\]="'paymentAllocationAmount'[\s\S]*?\[disabled\]="paymentSaving"/);
  assert.match(form, /addPaymentAllocation\(\)" \[disabled\]="paymentSaving \|\| loading/);
  assert.match(form, /removePaymentAllocation\(i\)" \[disabled\]="paymentSaving \|\| loading/);
  assert.match(form, /type="submit" \[disabled\]="paymentSaving \|\| loading/);
});
