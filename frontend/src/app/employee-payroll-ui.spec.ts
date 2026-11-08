import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const component = readFileSync(new URL('./employee-payroll.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./release-guide.ts', import.meta.url), 'utf8');
const access = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');
const catalogue = readFileSync(new URL('./workspace-module-catalog.ts', import.meta.url), 'utf8');

test('employee and payroll UI is wired to the owner-only workspace tab on desktop and mobile', () => {
  assert.match(app, /type Tab = [^;]*'employees'/);
  assert.match(app, /canAccessTab\('employees'\)/);
  assert.match(app, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(app, /get mobileMoreGroups\(\): readonly/);
  assert.match(access, /'employees'/);
  assert.match(access, /if \(OWNER_ONLY_TABS\.has\(tab\)\) return role === 'owner';/);
  assert.match(catalogue, /tab: 'employees', mobileGroup: 'team-admin'/);
  assert.match(app, /canAccessTab\(tab: Tab\): boolean/);
  assert.match(app, /canAccessWorkspaceTab\(tab, this\.business\?\.role, this\.platformAdminAvailable\)/);
  assert.match(app, /if \(!this\.canAccessTab\(tab\)\)/);
  assert.match(app, /@if \(canAccessTab\('employees'\)\)/);
  assert.match(app, /<aba-employee-payroll \[businessId\]="business\.id"/);
});

test('employee workflows expose localized create, edit, deactivate, search, and payroll lifecycle controls', () => {
  for (const phrase of ['saveEmployee()', 'editEmployee(employee)', 'toggleEmployeeActive(employee)', 'preparePayroll(employee)', 'savePayroll()', 'approvePayroll(payroll)', 'payPayroll(payroll)']) {
    assert.ok(component.includes(phrase), `Missing UI action: ${phrase}`);
  }
  assert.match(component, /employeeSearch/);
  assert.match(component, /t\('الموظفون والمرتبات', 'Employees & payroll'\)/);
  assert.match(component, /Net pay is calculated on the server/);
  assert.match(component, /A different owner must approve the payroll draft/);
  assert.match(component, /one linked Payroll expense/);
});

test('employee/payroll styles are component-local and responsive instead of relying on parent encapsulated CSS', () => {
  assert.match(component, /\.employee-panel\{min-width:0;background:#fff;border:1px solid/);
  assert.match(component, /\.primary,\.secondary\{/);
  assert.match(component, /\.section-head\{/);
  assert.match(component, /\.list-row\{/);
  assert.match(component, /\.warning-notice\{/);
  assert.match(component, /@media\(max-width:760px\)/);
});

test('employee and payroll client methods use business-scoped API paths and never accept a client net-pay value', () => {
  assert.match(api, /employees\(businessId: string\): Promise<EmployeeRecord\[]>/);
  assert.match(api, /createEmployee\(businessId: string/);
  assert.match(api, /updateEmployee\(businessId: string, employeeId: string/);
  assert.match(api, /payroll\(businessId: string, period\?: string\)/);
  assert.match(api, /createPayroll\(businessId: string, employeeId: string/);
  assert.match(api, /approvePayroll\(businessId: string, payrollId: string\)/);
  assert.match(api, /payPayroll\(businessId: string, payrollId: string\)/);
  assert.match(api, /\/api\/v1\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/employees/);
  const createPayrollStart = api.indexOf('createPayroll(');
  const updatePayrollStart = api.indexOf('updatePayroll(', createPayrollStart);
  assert.ok(createPayrollStart >= 0 && updatePayrollStart > createPayrollStart);
  assert.doesNotMatch(api.slice(createPayrollStart, updatePayrollStart), /net_pay/);
});

test('payroll period validation accepts a real YYYY-MM pattern instead of a literal backslash', () => {
  assert.ok(
    component.includes("if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(this.payrollPeriod))"),
    'Payroll period validation must match digits for the year',
  );
});

test('in-app feature catalogue documents employee/payroll permissions and one-time expense posting', () => {
  assert.match(guide, /id: 'employees-payroll'/);
  assert.match(guide, /متاح لمالك مساحة العمل فقط/);
  assert.match(guide, /A different owner must approve the draft/);
  assert.match(guide, /cannot be repeated/);
});


test('a successful payroll payment refreshes the workspace expense list and dashboard', () => {
  assert.match(component, /@Output\(\) payrollPaid = new EventEmitter<void>\(\)/);
  const payStart = component.indexOf('async payPayroll(');
  assert.ok(payStart >= 0);
  assert.match(component.slice(payStart), /this\.payrollPaid\.emit\(\)/);
  assert.match(app, /\(payrollPaid\)="refreshAfterPayrollPayment\(\)"/);
  const refreshStart = app.indexOf('async refreshAfterPayrollPayment(): Promise<void>');
  assert.ok(refreshStart >= 0);
  const refresh = app.slice(refreshStart, refreshStart + 1200);
  assert.match(refresh, /this\.api\.expenses\(businessId\)/);
  assert.match(refresh, /this\.api\.dashboard\(businessId\)/);
  assert.match(refresh, /if \(this\.business\?\.id !== businessId\) return/);
  assert.match(refresh, /if \(this\.business\?\.id === businessId\) this\.error = this\.message\(error\)/);
});
