import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

// 3A-376: the integrity view lives in its own workspace; assertions span
// the shell (which hosts and owner-gates it) and the workspace source.
const ui = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'))
  + expandTranslationCalls(readFileSync(new URL('./integrity-workspace.component.ts', import.meta.url), 'utf8'));
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('data integrity review is owner-gated and read-only', () => {
  assert.match(ui, /@if \(tab === 'integrity' && business\.role === 'owner'\)/);
  assert.match(ui, /loadDataIntegrity\(0\)/);
  assert.match(ui, /Human review required/);
  assert.match(api, /reports\/data-integrity/);
  assert.match(ui, /Dashboard, DataIntegrityReport,/);
  assert.match(api, /dataIntegrity\(businessId: string/);
});

test('data integrity report is cleared when switching workspace', () => {
  assert.match(ui, /this\.dataIntegrityReport = null;/);
  assert.match(ui, /this\.integrityError = '';/);
  // (the two clears above now happen in the workspace's business-change handler)
  assert.match(ui, /if \(this\.business\?\.id !== businessId\) return;/);
});
