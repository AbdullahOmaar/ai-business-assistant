import assert from 'node:assert/strict';
import test from 'node:test';
import { moveInvoiceDraftLine, toInvoiceDraftPayload, validateInvoiceDraft, type InvoiceDraftInput, type InvoiceDraftProduct } from './invoice-draft.ts';

const products: InvoiceDraftProduct[] = [
  { id: 'p-1', name: 'Product 1', unit_price: '12.50' },
  { id: 'p-2', name: 'Product 2', unit_price: '8.00' },
];

function input(overrides: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput {
  return {
    invoice_number: ' INV-100 ',
    currency_code: 'egp',
    customer_id: 'customer-1',
    discount_rate: '0',
    tax_rate: '0',
    lines: [{ id: 'line-1', kind: 'product', product_id: 'p-1', description: '', quantity: '2', unit_price: '' }],
    ...overrides,
  };
}

test('accepts a multi-line draft with catalog products and manual services', () => {
  const draft = input({ lines: [
    { id: '1', kind: 'product', product_id: 'p-1', description: '', quantity: '2', unit_price: '' },
    { id: '2', kind: 'manual', product_id: '', description: 'Installation', quantity: '1.5', unit_price: '125.00' },
  ] });
  assert.equal(validateInvoiceDraft(draft, products), null);
  assert.deepEqual(toInvoiceDraftPayload(draft, products).lines, [
    { product_id: 'p-1', quantity: '2' },
    { description: 'Installation', quantity: '1.5', unit_price: '125.00' },
  ]);
});

test('rejects missing customer, invalid catalog product and empty line collection', () => {
  assert.match(validateInvoiceDraft(input({ customer_id: '' }), products) ?? '', /customer/i);
  assert.match(validateInvoiceDraft(input({ lines: [] }), products) ?? '', /at least one/i);
  assert.match(validateInvoiceDraft(input({ lines: [{ id: '1', kind: 'product', product_id: 'foreign', description: '', quantity: '1', unit_price: '' }] }), products) ?? '', /valid catalog product/i);
});

test('rejects zero, negative, non-finite and excessive-precision quantities', () => {
  for (const quantity of ['0', '-1', 'NaN', 'Infinity', '1.0001']) {
    const result = validateInvoiceDraft(input({ lines: [{ id: '1', kind: 'product', product_id: 'p-1', description: '', quantity, unit_price: '' }] }), products);
    assert.ok(result, `expected quantity ${quantity} to be rejected`);
  }
});

test('rejects invalid manual descriptions and unit prices', () => {
  for (const [description, unit_price] of [['', '10.00'], ['x'.repeat(501), '10.00'], ['Service', '-0.01'], ['Service', '1.001'], ['Service', 'Infinity']]) {
    const result = validateInvoiceDraft(input({ lines: [{ id: '1', kind: 'manual', product_id: '', description, quantity: '1', unit_price }] }), products);
    assert.ok(result, 'invalid manual line should be rejected');
  }
});

test('rejects discount and tax rates outside the supported input range', () => {
  for (const value of ['-0.1', '100.01', 'NaN', '']) {
    assert.ok(validateInvoiceDraft(input({ discount_rate: value }), products));
    assert.ok(validateInvoiceDraft(input({ tax_rate: value }), products));
  }
});

test('payload keeps server calculation authority and never adds client totals', () => {
  const payload = toInvoiceDraftPayload(input(), products);
  assert.equal(payload.currency_code, 'EGP');
  assert.equal(payload.invoice_number, 'INV-100');
  assert.equal('subtotal' in payload, false);
  assert.equal('total' in payload, false);
  assert.equal('tax_total' in payload, false);
});

test('payload builder throws instead of serializing invalid input', () => {
  assert.throws(() => toInvoiceDraftPayload(input({ customer_id: '' }), products), RangeError);
});

test('line reorder preserves each line and does not move beyond either boundary', () => {
  const lines = ['first', 'second', 'third'];
  assert.deepEqual(moveInvoiceDraftLine(lines, 1, -1), ['second', 'first', 'third']);
  assert.deepEqual(moveInvoiceDraftLine(lines, 1, 1), ['first', 'third', 'second']);
  assert.deepEqual(moveInvoiceDraftLine(lines, 0, -1), lines);
  assert.deepEqual(moveInvoiceDraftLine(lines, 2, 1), lines);
});

test('all invoice draft validation messages are localized for Arabic and preserve English fallback', async () => {
  const { localizeInvoiceDraftValidationMessage } = await import('./invoice-draft.ts');
  const messages = [
    'Choose a customer before saving the invoice.',
    'A workspace currency is required.',
    'Add at least one invoice line.',
    'Discount and tax rates must be between 0 and 100.',
    'Every line must have a positive quantity with at most three decimal places.',
    'Choose a valid catalog product for every product line.',
    'Every manual line needs a description of 1 to 500 characters.',
    'Every manual line needs a non-negative unit price with at most two decimal places.',
  ];
  for (const message of messages) {
    const arabic = localizeInvoiceDraftValidationMessage(message, 'ar');
    assert.ok(arabic && arabic !== message, 'Arabic translation missing for: ' + message);
    assert.equal(localizeInvoiceDraftValidationMessage(message, 'en'), message);
  }
  assert.equal(localizeInvoiceDraftValidationMessage('Unknown validation error', 'ar'), 'Unknown validation error');
});
