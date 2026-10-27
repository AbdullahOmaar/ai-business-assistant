import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ui = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('data integrity review is owner-gated and read-only', () => {
  assert.match(ui, /tab === 'integrity' && business\?\.role === 'owner'/);
  assert.match(ui, /loadDataIntegrity\(0\)/);
  assert.match(ui, /Manual review only/);
  assert.match(api, /reports\/data-integrity/);
});

test('data integrity report is cleared when switching workspace', () => {
  assert.match(ui, /this\.dataIntegrityReport = null;/);
  assert.match(ui, /this\.integrityError = '';/);
  assert.match(ui, /if \(this\.business\?\.id !== businessId\) return;/);
});
