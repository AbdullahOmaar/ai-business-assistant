import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const component = readFileSync(new URL('./employee-payroll.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./release-guide.ts', import.meta.url), 'utf8');

test('employee and payroll UI is wired to the owner-only workspace tab on desktop and mobile', () => {
  assert.match(app, /type Tab = [^;]*'employees'/);
  assert.match(app, /business\?\.role === 'owner'[^\n]*tab === 'employees'/);
  assert.match(app, /role="menuitem"[^\n]*tab === 'employees'/);
  assert.match(app, /tab === 'employees' && business\?\.role === 'owner' && business/);
  assert.match(app, /if \(tab === 'employees' && this\.business\?\.role !== 'owner'\)/);
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
  assert.match(api, /employees\(\s*businessId: string,\s*options: \{[^}]*search\?: string/);
  assert.match(api, /active_only/);
  assert.match(api, /params\.set\('search', search\)/);
  assert.match(api, /createEmployee\(businessId: string/);
  assert.match(api, /updateEmployee\(businessId: string, employeeId: string/);
  assert.match(api, /payroll\(\s*businessId: string,\s*period\?: string,\s*limit = 200,\s*offset = 0/);
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


test('employee and payroll lists use independent server-side offset pagination', () => {
  assert.match(component, /employeePageSize = 25/);
  assert.match(component, /payrollPageSize = 25/);
  assert.match(component, /search: this.employeeSearchApplied/);
  assert.match(component, /changeEmployeePage\(direction: number\)/);
  assert.match(component, /changePayrollPage\(direction: number\)/);
  assert.match(component, /onPayrollPeriodChange\(\)/);
  assert.match(component, /this\.employeeOffset = 0/);
  assert.match(component, /this\.payrollOffset = 0/);
  assert.match(component, /employeeHasNext/);
  assert.match(component, /payrollHasNext/);
});

test('payroll employee picker searches the complete active directory independently of the visible page', () => {
  assert.match(component, /activeOnly: true/);
  assert.match(component, /search: this\.payrollEmployeeSearch\.trim\(\)/);
  assert.match(component, /payrollEmployeeOptions/);
  assert.match(component, /selectedPayrollEmployeeFallback/);
  assert.match(component, /pickerLoadSequence/);
  assert.match(component, /searchPayrollEmployees\(\)/);
});
