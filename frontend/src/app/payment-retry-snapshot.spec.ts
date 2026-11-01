import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPaymentRetrySnapshot,
  paymentRequestFromRetrySnapshot,
  type PaymentRequestPayload,
} from './payment-retry-snapshot.ts';

function paymentPayload(): PaymentRequestPayload {
  return {
    amount: '7.00',
    currency_code: 'EGP',
    idempotency_key: 'payment-business-a-unique',
    customer_id: 'customer-a',
    method: 'cash',
    reference: 'receipt-7',
    allocations: [{ invoice_id: 'invoice-a', amount: '4.00' }],
  };
}

test('retry snapshot is detached from later edits to payment form state', () => {
  const source = paymentPayload();
  const snapshot = createPaymentRetrySnapshot(' business-a ', source);

  source.amount = '70.00';
  source.customer_id = 'customer-b';
  source.reference = 'changed';
  source.allocations![0].amount = '40.00';
  source.allocations!.push({ invoice_id: 'invoice-b', amount: '30.00' });

  assert.equal(snapshot.businessId, 'business-a');
  assert.equal(snapshot.payload.amount, '7.00');
  assert.equal(snapshot.payload.customer_id, 'customer-a');
  assert.equal(snapshot.payload.reference, 'receipt-7');
  assert.deepEqual(snapshot.payload.allocations, [
    { invoice_id: 'invoice-a', amount: '4.00' },
  ]);
});

test('retry snapshot deeply freezes the payload and allocation rows', () => {
  const snapshot = createPaymentRetrySnapshot('business-a', paymentPayload());

  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.payload), true);
  assert.equal(Object.isFrozen(snapshot.payload.allocations), true);
  assert.equal(Object.isFrozen(snapshot.payload.allocations?.[0]), true);
  assert.throws(() => {
    (snapshot.payload as any).amount = '99.00';
  }, TypeError);
  assert.throws(() => {
    (snapshot.payload.allocations as any[]).push({ invoice_id: 'invoice-b', amount: '1.00' });
  }, TypeError);
});

test('API retry payload is identical but independently mutable on every attempt', () => {
  const snapshot = createPaymentRetrySnapshot('business-a', paymentPayload());
  const firstAttempt = paymentRequestFromRetrySnapshot(snapshot);
  const secondAttempt = paymentRequestFromRetrySnapshot(snapshot);

  assert.deepEqual(secondAttempt, firstAttempt);
  assert.notEqual(secondAttempt, firstAttempt);
  assert.notEqual(secondAttempt.allocations, firstAttempt.allocations);
  firstAttempt.amount = '999.00';
  firstAttempt.allocations![0].amount = '999.00';

  assert.equal(snapshot.payload.amount, '7.00');
  assert.equal(snapshot.payload.allocations?.[0].amount, '4.00');
  assert.deepEqual(paymentRequestFromRetrySnapshot(snapshot), {
    amount: '7.00',
    currency_code: 'EGP',
    idempotency_key: 'payment-business-a-unique',
    customer_id: 'customer-a',
    method: 'cash',
    reference: 'receipt-7',
    allocations: [{ invoice_id: 'invoice-a', amount: '4.00' }],
  });
});

test('retry snapshot rejects missing business identity or idempotency key', () => {
  assert.throws(() => createPaymentRetrySnapshot('  ', paymentPayload()), RangeError);
  const payload = paymentPayload();
  payload.idempotency_key = ' ';
  assert.throws(() => createPaymentRetrySnapshot('business-a', payload), RangeError);
});
