import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InvoiceDraftInput,
  InvoiceDraftLine,
  InvoiceDraftProduct,
  InvoiceDraftCustomer,
  localizeInvoiceDraftValidationMessage,
  moveInvoiceDraftLine,
  removeInvoiceDraftLine,
  toInvoiceDraftPayload,
  validateInvoiceDraft,
} from './invoice-draft.ts';

const products: InvoiceDraftProduct[] = [{ id: 'p1', name: 'Coffee' }];
const customers: InvoiceDraftCustomer[] = [{ id: 'c1', name: 'Customer One' }];
const productLine: InvoiceDraftLine = {
  id: 'l1', kind: 'product', product_id: 'p1', description: '', quantity: '2', unit_price: '',
};
const manualLine: InvoiceDraftLine = {
  id: 'l2', kind: 'manual', product_id: '', description: 'Delivery service', quantity: '1', unit_price: '25.50',
};
const validInput = (lines: readonly InvoiceDraftLine[] = [productLine, manualLine]): InvoiceDraftInput => ({
  invoice_number: 'INV-100',
  currency_code: 'egp',
  customer_id: 'c1',
  lines,
});

test('builds a mixed product/service request without client-calculated totals or rate policy', () => {
  const payload = toInvoiceDraftPayload(validInput(), products, customers);
  assert.equal(payload.currency_code, 'EGP');
  assert.deepEqual(payload.lines, [
    { product_id: 'p1', quantity: '2' },
    { description: 'Delivery service', quantity: '1', unit_price: '25.50' },
  ]);
  assert.equal('total' in payload, false);
  assert.equal('subtotal' in payload, false);
  assert.equal('discount_rate' in payload, false);
  assert.equal('tax_rate' in payload, false);
});

test('rejects a missing or overlong invoice number', () => {
  assert.match(validateInvoiceDraft({ ...validInput(), invoice_number: ' ' }, products, customers) ?? '', /invoice number/i);
  assert.match(validateInvoiceDraft({ ...validInput(), invoice_number: 'x'.repeat(81) }, products, customers) ?? '', /invoice number/i);
});

test('rejects missing or foreign customer references', () => {
  assert.match(validateInvoiceDraft({ ...validInput(), customer_id: '' }, products, customers) ?? '', /customer/i);
  assert.match(validateInvoiceDraft({ ...validInput(), customer_id: 'other' }, products, customers) ?? '', /customer/i);
});

test('rejects invalid currency and empty line lists', () => {
  assert.match(validateInvoiceDraft({ ...validInput(), currency_code: 'EG' }, products, customers) ?? '', /currency/i);
  assert.match(validateInvoiceDraft(validInput([]), products, customers) ?? '', /at least one/i);
});

test('rejects non-positive and over-precision quantities', () => {
  for (const quantity of ['0', '-1', '1.1234', '1e2', '']) {
    const line = { ...productLine, quantity };
    assert.ok(validateInvoiceDraft(validInput([line]), products, customers));
  }
});

test('rejects a product that is not in the supplied business catalog', () => {
  assert.match(validateInvoiceDraft(validInput([{ ...productLine, product_id: 'foreign' }]), products, customers) ?? '', /catalog product/i);
});

test('requires manual service description and a non-negative two-decimal unit price', () => {
  for (const unit_price of ['', '-1', '1.001', '1e2']) {
    assert.ok(validateInvoiceDraft(validInput([{ ...manualLine, unit_price }]), products, customers));
  }
  assert.match(validateInvoiceDraft(validInput([{ ...manualLine, description: ' ' }]), products, customers) ?? '', /description/i);
});

test('preserves input strings and order in the server request', () => {
  const lines = [{ ...productLine, quantity: '2.500' }, { ...manualLine, quantity: '1.25', unit_price: '0.00' }];
  const payload = toInvoiceDraftPayload(validInput(lines), products, customers);
  assert.equal(payload.lines[0].quantity, '2.500');
  assert.equal(payload.lines[1].quantity, '1.25');
  assert.equal(payload.lines[1].unit_price, '0.00');
});

test('moves and removes draft rows without mutating the original collection', () => {
  const lines = [productLine, manualLine];
  assert.deepEqual(moveInvoiceDraftLine(lines, 0, 1), [manualLine, productLine]);
  assert.deepEqual(lines, [productLine, manualLine]);
  assert.deepEqual(removeInvoiceDraftLine(lines, 0), [manualLine]);
  assert.deepEqual(removeInvoiceDraftLine(lines, 8), lines);
  assert.deepEqual(removeInvoiceDraftLine([productLine], 0), [productLine]);
});

test('localizes known validation feedback and preserves unknown fallback', () => {
  assert.equal(localizeInvoiceDraftValidationMessage('Choose a valid customer.', 'ar'), 'اختَر عميلًا صحيحًا.');
  assert.equal(localizeInvoiceDraftValidationMessage('unknown', 'ar'), 'unknown');
  assert.equal(localizeInvoiceDraftValidationMessage('Choose a valid customer.', 'en'), 'Choose a valid customer.');
});
