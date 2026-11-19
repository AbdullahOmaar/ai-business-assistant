import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidPurchaseDecimalInput,
  normalizePurchaseDecimalInput,
} from './purchasing-decimal.ts';

test('normalizes Arabic-Indic and Eastern Arabic digits for API decimal strings', () => {
  assert.equal(normalizePurchaseDecimalInput('١٢٣٫٤٥'), '123.45');
  assert.equal(normalizePurchaseDecimalInput('۱۲۳٫۴۵'), '123.45');
});

test('normalizes leading decimal shorthand without passing through Number', () => {
  assert.equal(normalizePurchaseDecimalInput('.5'), '0.5');
  assert.equal(normalizePurchaseDecimalInput('٫٥'), '0.5');
  assert.equal(isValidPurchaseDecimalInput('٫٥', 3, false), true);
});

test('rejects grouping separators and ambiguous numeric formats', () => {
  assert.equal(isValidPurchaseDecimalInput('١٬٢٣٤', 3, false), false);
  assert.equal(isValidPurchaseDecimalInput('1,234', 3, false), false);
  assert.equal(isValidPurchaseDecimalInput('-1.00', 2, true), false);
  assert.equal(isValidPurchaseDecimalInput('1e3', 3, false), false);
  assert.equal(isValidPurchaseDecimalInput('1.', 3, false), false);
});

test('enforces backend scale and 14-digit precision boundaries', () => {
  assert.equal(isValidPurchaseDecimalInput('99999999999.999', 3, false), true);
  assert.equal(isValidPurchaseDecimalInput('100000000000.999', 3, false), false);
  assert.equal(isValidPurchaseDecimalInput('1.2345', 3, false), false);
  assert.equal(isValidPurchaseDecimalInput('12.34', 2, true), true);
  assert.equal(isValidPurchaseDecimalInput('12.345', 2, true), false);
});

test('applies positive quantity and non-negative unit-cost rules', () => {
  assert.equal(isValidPurchaseDecimalInput('٠٫٠٠١', 3, false), true);
  assert.equal(isValidPurchaseDecimalInput('0.000', 3, false), false);
  assert.equal(isValidPurchaseDecimalInput('٠٫٠٠', 2, true), true);
  assert.equal(isValidPurchaseDecimalInput('0.00', 2, false), false);
});
