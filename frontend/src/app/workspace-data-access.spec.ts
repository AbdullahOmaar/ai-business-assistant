import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
// 3A-351: the expense and notification lists moved into their workspaces.
const expensesSource = readFileSync(new URL('./expenses-workspace.component.ts', import.meta.url), 'utf8');
const notificationsSource = readFileSync(new URL('./notifications-workspace.component.ts', import.meta.url), 'utf8');
const suppliersSource = readFileSync(new URL('./suppliers-workspace.component.ts', import.meta.url), 'utf8');
const recurringSource = readFileSync(new URL('./recurring-workspace.component.ts', import.meta.url), 'utf8');
const integritySource = readFileSync(new URL('./integrity-workspace.component.ts', import.meta.url), 'utf8');

test('workspace bootstrap fetches payment records only for roles authorized to open Payments', () => {
  const start = source.indexOf('async loadWorkspaceData(): Promise<void>');
  const end = source.indexOf('\n  async refreshAfterPayrollPayment()', start);
  assert.ok(start >= 0 && end > start, 'workspace bootstrap method must exist');
  const method = source.slice(start, end);
  assert.match(method, /const paymentsRequest = this\.canAccessTab\('payments'\) \? this\.api\.payments\(id\) : Promise\.resolve\(\[\]\);/);
  // 3A-351: the shell no longer fetches expenses in the bootstrap; the
  // expenses workspace loads them itself (tenant-scoped, on init and on
  // business change).
  assert.match(method, /this\.api\.invoices\(id\), paymentsRequest/);
  assert.doesNotMatch(method, /this\.api\.expenses\(id\)/);
  assert.doesNotMatch(method, /this\.api\.invoices\(id\), this\.api\.payments\(id\), this\.api\.expenses\(id\)/);
  assert.match(expensesSource, /async loadExpenses\(\): Promise<void>/);
  assert.match(expensesSource, /\(\) => this\.api\.expenses\(requestContext\.workspaceId\)/);
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
  // 3A-351: loadProfitLoss() left setTab with the reports workspace — the
  // workspace loads the P&L in its own ngOnInit, and it is only instantiated
  // behind @defer after setTab passes the guard, so the same ordering holds.
  // 3A-376: the integrity tab self-loads inside its workspace now; the
  // shell route loads that remain are pinned here.
  const routeLoads = ['loadTaxSummary()', 'loadAuditEvents(0)', 'loadOperationalHealth()'];
  for (const load of routeLoads) {
    assert.ok(method.indexOf(load) > selectedTabMutation, `${load} must run only after the access guard`);
  }
  assert.ok(source.includes("@defer (when tab === 'reports')"),
    'the reports workspace renders only behind a defer that setTab guards');
});

test('payroll post-payment refresh discards responses after owner role, identity, or workspace changes', () => {
  const start = source.indexOf('async refreshAfterPayrollPayment(): Promise<void>');
  // 3A-351: the CSV export moved out with the reports workspace; the next
  // method after the payroll refresh is the workspace-route applier.
  const end = source.indexOf('\n  private applyInitialWorkspaceRoute()', start);
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
  const end = source.indexOf('\n  async loadOperationalHealth()', start);
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
  // 3A-376: loadDataIntegrity lives in the integrity workspace now, with
  // the same owner gate and tenant-scoped guard.
  const integrityStart = integritySource.indexOf('async loadDataIntegrity(offset = 0): Promise<void>');
  const integrityEnd = integritySource.indexOf('\n  integrityWarningLabel(', integrityStart);
  assert.ok(integrityStart >= 0 && integrityEnd > integrityStart);
  const integrity = integritySource.slice(integrityStart, integrityEnd);
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
  // 3A-376: the integrity guard invalidates in its workspace's
  // business-change handler now.
  assert.ok(integritySource.includes('this.dataIntegrityLoadGuard.invalidate()'));
  assert.ok(reset.includes('this.operationalHealthLoadGuard.invalidate()'));
});

test('workspace changes clear local operation-list searches with the previous workspace data', () => {
  const start = source.indexOf('private clearWorkspaceData(): void');
  const end = source.indexOf('\n  }', start);
  const method = source.slice(start, end);
  for (const field of ['purchaseSearch']) {
    assert.ok(method.includes(`this.${field} = '';`), `${field} is reset on workspace change`);
  }
  // 3A-351: the notification search resets in the notifications workspace's
  // business-change handler now.
  assert.ok(notificationsSource.includes("this.notificationSearch = '';"),
    'notificationSearch is reset on workspace change in its workspace');
  // 3A-376: the supplier search resets in the suppliers workspace's
  // business-change handler now.
  assert.ok(suppliersSource.includes("this.supplierSearch = '';"),
    'supplierSearch is reset on workspace change in its workspace');
  // 3A-376: the recurring search resets in the recurring workspace's
  // business-change handler now.
  assert.ok(recurringSource.includes("this.recurringSearch = '';"),
    'recurringSearch is reset on workspace change in its workspace');
});


test('workspace changes also clear payment and expense search state', () => {
  const start = source.indexOf('private clearWorkspaceData(): void');
  const end = source.indexOf('\n  }', start);
  const method = source.slice(start, end);
  assert.ok(method.includes("this.paymentSearch = '';"));
  // 3A-351: the expense search resets in the expenses workspace's
  // business-change handler now.
  assert.ok(expensesSource.includes("this.expenseSearch = '';"),
    'expenseSearch is reset on workspace change in its workspace');
});
