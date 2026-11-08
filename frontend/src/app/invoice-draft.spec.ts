import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InvoiceDraftOutcomeVault,
  findInvoiceDraftRecoveryMatch,
  invoiceDraftLinesFromExisting,
  localizeInvoiceDraftValidationMessage,
  moveInvoiceDraftLine,
  removeInvoiceDraftLine,
  toInvoiceDraftPayload,
  validateInvoiceDraft,
} from './invoice-draft.ts';
import type {
  InvoiceDraftInput,
  InvoiceDraftLine,
  InvoiceDraftProduct,
  InvoiceDraftCustomer,
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

test('matches the API maximum of 500 invoice lines', () => {
  const lines = Array.from({ length: 501 }, (_, index) => ({
    ...productLine, id: 'line-' + index,
  }));
  assert.match(validateInvoiceDraft(validInput(lines), products, customers) ?? '', /500 lines/i);
});

test('rejects whole-number precision beyond the API decimal limits', () => {
  assert.ok(validateInvoiceDraft(validInput([{ ...productLine, quantity: '100000000000' }]), products, customers));
  assert.ok(validateInvoiceDraft(validInput([{ ...manualLine, unit_price: '1000000000000' }]), products, customers));
  assert.equal(validateInvoiceDraft(validInput([{ ...productLine, quantity: '99999999999.999' }]), products, customers), null);
  assert.equal(validateInvoiceDraft(validInput([{ ...manualLine, unit_price: '999999999999.99' }]), products, customers), null);
});

test('localizes known validation feedback and preserves unknown fallback', () => {
  assert.equal(localizeInvoiceDraftValidationMessage('Choose a valid customer.', 'ar'), 'اختَر عميلًا صحيحًا.');
  assert.equal(localizeInvoiceDraftValidationMessage('An invoice cannot contain more than 500 lines.', 'ar'), 'لا يمكن أن تحتوي الفاتورة على أكثر من 500 بند.');
  assert.equal(localizeInvoiceDraftValidationMessage('unknown', 'ar'), 'unknown');
  assert.equal(localizeInvoiceDraftValidationMessage('Choose a valid customer.', 'en'), 'Choose a valid customer.');
});


test('hydrates persisted product and manual service lines without losing editable fields', () => {
  const lines = invoiceDraftLinesFromExisting([
    { product_id: 'p1', description: 'Catalog item', quantity: '2.00', unit_price: '15.00' },
    { product_id: null, description: 'Delivery service', quantity: '1', unit_price: '25.50' },
  ]);
  assert.deepEqual(lines.map(line => ({ kind: line.kind, product_id: line.product_id, description: line.description, quantity: line.quantity, unit_price: line.unit_price })), [
    { kind: 'product', product_id: 'p1', description: 'Catalog item', quantity: '2.00', unit_price: '' },
    { kind: 'manual', product_id: '', description: 'Delivery service', quantity: '1', unit_price: '25.50' },
  ]);
});


test('invoice outcome vault isolates uncertain writes by authenticated user and workspace', () => {
  const vault = new InvoiceDraftOutcomeVault();
  const snapshot = {
    businessId: 'business-a',
    invoiceNumber: 'INV-100',
    customerId: 'customer-a',
    discountRate: '0',
    taxRate: '0',
    editingInvoiceId: null,
  };
  vault.save('owner-a', snapshot);
  assert.equal(vault.get('owner-a', 'business-a')?.invoiceNumber, 'INV-100');
  assert.equal(vault.get('owner-b', 'business-a'), null);
  assert.equal(vault.get('owner-a', 'business-b'), null);
  vault.delete('owner-a', 'business-a');
  assert.equal(vault.get('owner-a', 'business-a'), null);
});


test('keeps invoice line descriptions within the persisted 300-character column limit', () => {
  const description300 = 'x'.repeat(300);
  const description301 = 'x'.repeat(301);

  assert.equal(
    validateInvoiceDraft(validInput([{ ...productLine, description: description300 }]), products, customers),
    null,
  );
  assert.match(
    validateInvoiceDraft(validInput([{ ...productLine, description: description301 }]), products, customers) ?? '',
    /300 characters/i,
  );
  assert.equal(
    validateInvoiceDraft(validInput([{ ...manualLine, description: description300 }]), products, customers),
    null,
  );
  assert.match(
    validateInvoiceDraft(validInput([{ ...manualLine, description: description301 }]), products, customers) ?? '',
    /300 characters/i,
  );
});


test('recovers an uncertain draft edit by stable invoice ID even when its number changed', () => {
  const invoices = [
    { id: 'invoice-a', invoice_number: 'INV-OLD', customer_id: 'c1' },
    { id: 'invoice-b', invoice_number: 'INV-NEW', customer_id: 'c1' },
  ];
  const pending = { editingInvoiceId: 'invoice-a', invoiceNumber: 'INV-NEW', customerId: 'c1' };
  assert.equal(findInvoiceDraftRecoveryMatch(invoices, pending)?.id, 'invoice-a');
  assert.equal(
    findInvoiceDraftRecoveryMatch(invoices, { ...pending, customerId: 'foreign-customer' }),
    null,
  );
});

test('recovers an uncertain new draft by invoice number and customer', () => {
  const invoices = [
    { id: 'invoice-a', invoice_number: 'INV-100', customer_id: 'c1' },
    { id: 'invoice-b', invoice_number: 'INV-100', customer_id: 'c2' },
  ];
  assert.equal(
    findInvoiceDraftRecoveryMatch(invoices, { editingInvoiceId: null, invoiceNumber: 'INV-100', customerId: 'c1' })?.id,
    'invoice-a',
  );
});
