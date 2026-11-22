import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCsv, CSV_FORMULA_TRIGGER_ASCII, escapeCsvCell, escapeCsvFormulaPrefix } from './csv-export.ts';

test('neutralizes spreadsheet formula prefixes including leading whitespace', () => {
  assert.equal(escapeCsvCell('=1+1'), "'=1+1");
  assert.equal(escapeCsvCell('  @SUM(A1:A2)'), "'  @SUM(A1:A2)");
  assert.equal(escapeCsvCell('\t-10'), "'\t-10");
  assert.equal(escapeCsvCell('+cmd'), "'+cmd");
});

test('quotes commas, quotes, and line breaks using CSV escaping rules', () => {
  assert.equal(escapeCsvCell('A, "B"'), '"A, ""B"""');
  assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"');
});

test('builds UTF-8 BOM-prefixed CSV with CRLF rows', () => {
  const csv = buildCsv(['name', 'amount'], [['customer', 12], ['=cmd', 4]]);
  assert.equal(csv, "\uFEFFname,amount\r\ncustomer,12\r\n'=cmd,4");
});

test('escapeCsvFormulaPrefix shares the formula-prefix logic across exports', () => {
  // Shared (Unicode-whitespace) trigger: prefixes formula cells.
  assert.equal(escapeCsvFormulaPrefix('=1+1'), "'=1+1");
  assert.equal(escapeCsvFormulaPrefix('  @SUM(A1:A2)'), "'  @SUM(A1:A2)");
  assert.equal(escapeCsvFormulaPrefix('\t-10'), "'\t-10");
  assert.equal(escapeCsvFormulaPrefix('plain'), 'plain');
  // The shared trigger also covers Unicode whitespace before a formula char.
  assert.equal(escapeCsvFormulaPrefix('\u00A0=2+2'), "'\u00A0=2+2");
  assert.equal(escapeCsvFormulaPrefix('\u2003@x'), "'\u2003@x");
  // The aging export's ASCII-only trigger does not cover Unicode whitespace.
  assert.equal(escapeCsvFormulaPrefix('\u00A0=2+2', CSV_FORMULA_TRIGGER_ASCII), '\u00A0=2+2');
  assert.equal(escapeCsvFormulaPrefix('\u2003@x', CSV_FORMULA_TRIGGER_ASCII), '\u2003@x');
  // ... but it does cover ASCII space and C0 controls before a formula char.
  assert.equal(escapeCsvFormulaPrefix('  @SUM(A1:A2)', CSV_FORMULA_TRIGGER_ASCII), "'  @SUM(A1:A2)");
  assert.equal(escapeCsvFormulaPrefix('\u0001=1', CSV_FORMULA_TRIGGER_ASCII), "'\u0001=1");
  assert.equal(escapeCsvFormulaPrefix('\u001F-5', CSV_FORMULA_TRIGGER_ASCII), "'\u001F-5");
  assert.equal(escapeCsvFormulaPrefix('plain', CSV_FORMULA_TRIGGER_ASCII), 'plain');
  // escapeCsvCell still uses the shared trigger.
  assert.equal(escapeCsvCell('\u00A0=2+2'), "'\u00A0=2+2");
});
