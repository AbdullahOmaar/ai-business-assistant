import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCsv, escapeCsvCell } from './csv-export.ts';

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
