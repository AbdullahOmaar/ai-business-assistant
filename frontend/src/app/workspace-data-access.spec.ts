import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('workspace bootstrap fetches payment records only for roles authorized to open Payments', () => {
  const start = source.indexOf('async loadWorkspaceData(): Promise<void>');
  const end = source.indexOf('\n  async refreshAfterPayrollPayment()', start);
  assert.ok(start >= 0 && end > start, 'workspace bootstrap method must exist');
  const method = source.slice(start, end);
  assert.match(method, /const paymentsRequest = this\.canAccessTab\('payments'\) \? this\.api\.payments\(id\) : Promise\.resolve\(\[\]\);/);
  assert.match(method, /this\.api\.invoices\(id\), paymentsRequest, this\.api\.expenses\(id\)/);
  assert.doesNotMatch(method, /this\.api\.invoices\(id\), this\.api\.payments\(id\), this\.api\.expenses\(id\)/);
});

test('denied direct tab navigation returns before changing the selected tab or loading route data', () => {
  const start = source.indexOf('setTab(tab: Tab): void {');
  const end = source.indexOf('\n  }', start);
  assert.ok(start >= 0 && end > start, 'central tab navigation method must exist');
  const method = source.slice(start, end);
  const guard = method.indexOf('if (!this.canAccessTab(tab))');
  const deniedReturn = method.indexOf('return;', guard);
  const selectedTabMutation = method.indexOf('this.tab = tab;');
  assert.ok(guard >= 0 && deniedReturn > guard && selectedTabMutation > deniedReturn,
    'denied navigation must exit before selecting a tab');
  const routeLoads = ['loadProfitLoss()', 'loadTaxSummary()', 'loadAuditEvents(0)', 'loadDataIntegrity(0)'];
  for (const load of routeLoads) {
    assert.ok(method.indexOf(load) > selectedTabMutation, `${load} must run only after the access guard`);
  }
});
