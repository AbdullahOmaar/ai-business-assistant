import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eligiblePaymentInvoices,
  formatMoneyCents,
  moneyToCents,
  paymentAllocationTotals,
  paymentInvoicesForAllocation,
  suggestPaymentAllocationAmount,
  validatePaymentAllocations,
  type PaymentAllocationDraft,
  type PaymentAllocationInvoice,
} from './payment-allocation.ts';

const invoices: PaymentAllocationInvoice[] = [
  { id: 'i1', status: 'issued', customer_id: 'c1', currency_code: 'EGP', outstanding_amount: '8.00' },
  { id: 'i2', status: 'issued', customer_id: 'c1', currency_code: 'EGP', outstanding_amount: '12.00' },
  { id: 'i3', status: 'paid', customer_id: 'c1', currency_code: 'EGP', outstanding_amount: '0.00' },
  { id: 'i4', status: 'issued', customer_id: 'c2', currency_code: 'EGP', outstanding_amount: '5.00' },
  { id: 'i5', status: 'issued', customer_id: 'c1', currency_code: 'USD', outstanding_amount: '5.00' },
];

test('parses and formats money with integer cents rather than floating-point arithmetic', () => {
  assert.equal(moneyToCents('12.34'), 1234n);
  assert.equal(moneyToCents('12'), 1200n);
  assert.equal(moneyToCents('1.234'), null);
  assert.equal(moneyToCents('1e2'), null);
  assert.equal(moneyToCents('-1'), null);
  assert.equal(formatMoneyCents(123456n), '1234.56');
});

test('eligible invoices are issued, outstanding, same-customer, same-currency and not already selected', () => {
  const allocations: PaymentAllocationDraft[] = [{ invoiceId: 'i1', amount: '1.00' }];
  assert.deepEqual(eligiblePaymentInvoices(invoices, 'c1', 'EGP', allocations).map(x => x.id), ['i2']);
});

test('current allocation keeps its selected invoice while excluding invoices used by other rows', () => {
  const first = { invoiceId: 'i1', amount: '2.00' };
  const second = { invoiceId: 'i2', amount: '3.00' };
  assert.deepEqual(paymentInvoicesForAllocation(invoices, 'c1', 'EGP', [first, second], first).map(x => x.id), ['i1']);
});

test('suggested allocation is capped by both remaining receipt and invoice outstanding balance', () => {
  const first = { invoiceId: 'i1', amount: '4.00' };
  const second = { invoiceId: '', amount: '' };
  assert.equal(suggestPaymentAllocationAmount(invoices[1], [first, second], second, '10.00'), '6.00');
  assert.equal(suggestPaymentAllocationAmount(invoices[0], [], first, '20.00'), '8.00');
  assert.equal(suggestPaymentAllocationAmount(undefined, [], first, '10.00'), '');
});

test('allocation totals use exact cents and expose the unallocated receipt remainder', () => {
  assert.deepEqual(paymentAllocationTotals('10.00', [
    { invoiceId: 'i1', amount: '3.10' },
    { invoiceId: 'i2', amount: '4.20' },
  ]), { total: '7.30', remaining: '2.70' });
  assert.deepEqual(paymentAllocationTotals('5.00', [
    { invoiceId: 'i1', amount: '3.00' },
    { invoiceId: 'i2', amount: '4.00' },
  ]), { total: '7.00', remaining: null });
});

test('unallocated receipts remain allowed without any allocation rows', () => {
  assert.equal(validatePaymentAllocations('10.00', [], invoices, 'c1', 'EGP'), null);
});

test('validates multiple invoices for the same customer and currency within the receipt amount', () => {
  assert.equal(validatePaymentAllocations('15.00', [
    { invoiceId: 'i1', amount: '8.00' },
    { invoiceId: 'i2', amount: '7.00' },
  ], invoices, 'c1', 'EGP'), null);
});

test('rejects invalid receipt, incomplete rows, duplicate invoice, and invalid amounts', () => {
  assert.equal(validatePaymentAllocations('0', [{ invoiceId: 'i1', amount: '1.00' }], invoices, 'c1', 'EGP'), 'invalid-receipt');
  assert.equal(validatePaymentAllocations('10.00', [{ invoiceId: '', amount: '1.00' }], invoices, 'c1', 'EGP'), 'incomplete');
  assert.equal(validatePaymentAllocations('10.00', [
    { invoiceId: 'i1', amount: '1.00' }, { invoiceId: 'i1', amount: '1.00' },
  ], invoices, 'c1', 'EGP'), 'duplicate-invoice');
  assert.equal(validatePaymentAllocations('10.00', [{ invoiceId: 'i1', amount: '1.001' }], invoices, 'c1', 'EGP'), 'invalid-amount');
});

test('rejects cross-customer, cross-currency, non-issued, and over-outstanding allocations', () => {
  assert.equal(validatePaymentAllocations('10.00', [{ invoiceId: 'i4', amount: '1.00' }], invoices, 'c1', 'EGP'), 'invoice-mismatch');
  assert.equal(validatePaymentAllocations('10.00', [{ invoiceId: 'i5', amount: '1.00' }], invoices, 'c1', 'EGP'), 'invoice-mismatch');
  assert.equal(validatePaymentAllocations('10.00', [{ invoiceId: 'i3', amount: '1.00' }], invoices, 'c1', 'EGP'), 'invoice-mismatch');
  assert.equal(validatePaymentAllocations('10.00', [{ invoiceId: 'i1', amount: '8.01' }], invoices, 'c1', 'EGP'), 'exceeds-outstanding');
});

test('rejects aggregate allocations larger than the received payment', () => {
  assert.equal(validatePaymentAllocations('10.00', [
    { invoiceId: 'i1', amount: '8.00' }, { invoiceId: 'i2', amount: '3.00' },
  ], invoices, 'c1', 'EGP'), 'allocations-exceed-receipt');
});
