import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const csvHelper = readFileSync(new URL('./csv-export.ts', import.meta.url), 'utf8');

function paymentExportHandler(): string {
  const start = source.indexOf('exportPaymentsCsv(): void');
  const end = source.indexOf('\n  async createPayment(): Promise<void>', start);
  assert.ok(start >= 0 && end > start, 'payment CSV export handler is missing');
  return source.slice(start, end);
}

test('payment CSV export is owner-only and disabled when there are no payments', () => {
  assert.match(source, /@if \(tab === 'payments' && business\.role === 'owner'\)/);
  assert.match(source, /\(click\)="exportPaymentsCsv\(\)" \[disabled\]="!payments\.length"/);
  assert.match(paymentExportHandler(), /if \(!this\.business \|\| this\.business\.role !== 'owner' \|\| !this\.payments\.length\) return;/);
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
