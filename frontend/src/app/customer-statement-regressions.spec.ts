import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const componentSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('customer statement event labels are localized in Arabic and English', () => {
  assert.match(componentSource, /statementEventLabel\(event\.event_type\)/);
  assert.match(componentSource, /statementEventLabel\(eventType: string\): string \{[\s\S]*?invoice_issued:[\s\S]*?payment_allocation:[\s\S]*?currency_mismatch_allocation:[\s\S]*?unapplied_receipt:[\s\S]*?دفعة غير مخصصة[\s\S]*?Unapplied receipt[\s\S]*?this\.t\(label\.arabic, label\.english\)/);
});
