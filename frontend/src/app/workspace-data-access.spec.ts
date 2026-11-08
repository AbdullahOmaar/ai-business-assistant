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
  const end = source.indexOf('\n  get statementBalanceEntries():', start);
  assert.ok(start >= 0 && end > start, 'central tab navigation method must exist');
  const method = source.slice(start, end);
  const guard = method.indexOf('if (!this.canAccessTab(tab))');
  const deniedReturn = method.indexOf('return;', guard);
  const selectedTabMutation = method.indexOf('this.tab = tab;');
  assert.ok(guard >= 0 && deniedReturn > guard && selectedTabMutation > deniedReturn,
    'denied navigation must exit before selecting a tab');
  const routeLoads = ['loadProfitLoss()', 'loadTaxSummary()', 'loadAuditEvents(0)', 'loadDataIntegrity(0)', 'loadOperationalHealth()'];
  for (const load of routeLoads) {
    assert.ok(method.indexOf(load) > selectedTabMutation, `${load} must run only after the access guard`);
  }
});

test('payroll post-payment refresh discards responses after owner role, identity, or workspace changes', () => {
  const start = source.indexOf('async refreshAfterPayrollPayment(): Promise<void>');
  const end = source.indexOf('\n  exportReceivablesAgingCsv()', start);
  assert.ok(start >= 0 && end > start, 'payroll refresh method must exist');
  const method = source.slice(start, end);
  assert.match(method, /const requestContext = this\.currentChatRequestContext\(\)/);
  assert.match(method, /requestContext\.role !== 'owner'/);
  assert.match(method, /runTenantScopedRequest\(\s*this\.payrollRefreshGuard,\s*requestContext,\s*\(\) => this\.currentChatRequestContext\(\)/);

  const clearStart = source.indexOf('private clearWorkspaceData(): void');
  const clearEnd = source.indexOf('\n  }', clearStart);
  const reset = source.slice(clearStart, clearEnd);
  assert.ok(reset.includes('this.payrollRefreshGuard.invalidate()'),
    'workspace/role changes must invalidate pending payroll refresh responses');
});

test('owner-only tax summary discards stale responses and invalidates pending ranges', () => {
  const start = source.indexOf('async loadTaxSummary(): Promise<void>');
  const end = source.indexOf('\n  async loadDataIntegrity(offset = 0)', start);
  assert.ok(start >= 0 && end > start);
  const method = source.slice(start, end);
  assert.match(method, /requestContext\.role !== 'owner'/);
  assert.match(method, /runTenantScopedRequest\(\s*this\.taxSummaryLoadGuard/);
  assert.match(method, /this\.taxSummaryLoadGuard\.invalidate\(\)/,
    'invalid date ranges must invalidate older pending report responses');

  const clearStart = source.indexOf('private clearWorkspaceData(): void');
  const clearEnd = source.indexOf('\n  }', clearStart);
  assert.ok(source.slice(clearStart, clearEnd).includes('this.taxSummaryLoadGuard.invalidate()'));
});

test('owner-only integrity and health loads discard late responses after role or identity changes', () => {
  const integrityStart = source.indexOf('async loadDataIntegrity(offset = 0): Promise<void>');
  const integrityEnd = source.indexOf('\n  async loadOperationalHealth()', integrityStart);
  assert.ok(integrityStart >= 0 && integrityEnd > integrityStart);
  const integrity = source.slice(integrityStart, integrityEnd);
  assert.match(integrity, /requestContext\.role !== 'owner'/);
  assert.match(integrity, /runTenantScopedRequest\(\s*this\.dataIntegrityLoadGuard/);

  const healthStart = source.indexOf('async loadOperationalHealth(): Promise<void>');
  const healthEnd = source.indexOf('\n  private beginOperationsAction()', healthStart);
  assert.ok(healthStart >= 0 && healthEnd > healthStart);
  const health = source.slice(healthStart, healthEnd);
  assert.match(health, /requestContext\.role !== 'owner'/);
  assert.match(health, /runTenantScopedRequest\(\s*this\.operationalHealthLoadGuard/);

  const clearStart = source.indexOf('private clearWorkspaceData(): void');
  const clearEnd = source.indexOf('\n  }', clearStart);
  const reset = source.slice(clearStart, clearEnd);
  assert.ok(reset.includes('this.dataIntegrityLoadGuard.invalidate()'));
  assert.ok(reset.includes('this.operationalHealthLoadGuard.invalidate()'));
});

test('workspace changes clear local operation-list searches with the previous workspace data', () => {
  const start = source.indexOf('private clearWorkspaceData(): void');
  const end = source.indexOf('\n  }', start);
  const method = source.slice(start, end);
  for (const field of ['supplierSearch', 'purchaseSearch', 'recurringSearch', 'notificationSearch']) {
    assert.ok(method.includes(`this.${field} = '';`), `${field} is reset on workspace change`);
  }
});


test('workspace changes also clear payment and expense search state', () => {
  const start = source.indexOf('private clearWorkspaceData(): void');
  const end = source.indexOf('\n  }', start);
  const method = source.slice(start, end);
  assert.ok(method.includes("this.paymentSearch = '';"));
  assert.ok(method.includes("this.expenseSearch = '';"));
});
