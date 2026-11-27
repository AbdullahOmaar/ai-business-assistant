import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
// 3A-921 F1c: the payments region was extracted into its own component;
// the export handler lives there now (the shell keeps createPayment).
const paymentsSource = readFileSync(new URL('./payments-workspace.component.ts', import.meta.url), 'utf8');
const csvHelper = readFileSync(new URL('./csv-export.ts', import.meta.url), 'utf8');

function paymentExportHandler(): string {
  const start = paymentsSource.indexOf('exportPaymentsCsv(): void');
  const end = paymentsSource.indexOf('\n  // Public: the template calls t(', start);
  assert.ok(start >= 0 && end > start, 'payment CSV export handler is missing');
  return paymentsSource.slice(start, end);
}

test('payment CSV export is owner-only and disabled when there are no payments', () => {
  // 3A-921 F1c: the shell hosts the payments workspace behind the tab gate
  // and passes the role in; the section itself renders for owners only.
  assert.match(source, /@if \(tab === 'payments'\)/);
  assert.match(source, /<aba-payments-workspace/);
  assert.match(source, /\[role\]="business\.role"/);
  assert.match(paymentsSource, /@if \(role !== 'owner'\)/);
  assert.match(paymentsSource, /\(click\)="exportPaymentsCsv\(\)" \[disabled\]="!payments\.length"/);
  assert.match(paymentExportHandler(), /if \(this\.role !== 'owner' \|\| !this\.payments\.length\) return;/);
});

test('payment CSV export includes the full ledger fields and uses the shared safe serializer', () => {
  const handler = paymentExportHandler();
  assert.match(handler, /const headers = \['received_at', 'amount', 'currency_code', 'method', 'reference', 'allocation_count'\]/);
  assert.match(handler, /payment\.allocations\.length/);
  assert.match(handler, /const csv = buildCsv\(headers, rows\)/);
  assert.match(handler, /payments-' \+ new Date\(\)\.toISOString\(\)\.slice\(0, 10\) \+ '\.csv'/);
  // 3A-351: the shell imports only buildCsv now; the formula-escape
  // helpers moved with the reports workspace (its ageing CSV still uses
  // them), so the shared safe serializer stays covered from both homes.
  assert.match(source, /import \{ buildCsv \} from '\.\/csv-export'/);
  assert.match(readFileSync(new URL('./reports-workspace.component.ts', import.meta.url), 'utf8'),
    /import \{ CSV_FORMULA_TRIGGER_ASCII, escapeCsvFormulaPrefix \} from '\.\/csv-export'/);
  assert.match(csvHelper, /Prevent spreadsheet formula execution/);
});
