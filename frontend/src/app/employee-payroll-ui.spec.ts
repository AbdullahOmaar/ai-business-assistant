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
  assert.match(component, /\.employee-panel\{min-width:0;background:var\(--aba-color-surface,#fff\);border:1px solid var\(--aba-color-border/);
  assert.match(component, /\.primary,\.secondary\{/);
  assert.match(component, /\.section-head\{/);
  assert.match(component, /\.list-row\{/);
  assert.match(component, /\.warning-notice\{/);
  assert.match(component, /@media\(max-width:760px\)/);
});

test('mobile HR is a task-based workspace while desktop retains the full workflow', () => {
  assert.match(component, /data-mobile-section]="mobileSection"/);
  assert.match(component, /class="mobile-hr-nav"/);
  for (const pane of ['employees', 'prepare', 'history']) {
    assert.ok(component.includes(`data-mobile-pane="${pane}"`), `missing mobile HR pane: ${pane}`);
    assert.ok(component.includes(`setMobileSection('${pane}')`));
  }
  for (const fragment of [
    'employeeFormOpen = false',
    'class="employee-form-shell" [class.is-open]="employeeFormOpen"',
    'aria-controls="employee-profile-form"',
    'this.employeeFormOpen = true',
    "this.mobileSection = 'prepare'",
    "this.mobileSection = 'history'",
    '@media(max-width:760px)',
    '.employee-panel[data-mobile-section="employees"]',
    'grid-template-columns:repeat(2,minmax(0,1fr))',
    '.employee-form{display:none;',
    '.mobile-hr-nav{display:grid',
  ]) assert.ok(component.includes(fragment), `missing mobile HR contract: ${fragment}`);
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


test('a successful payroll payment refreshes workspace data only for the same authenticated OWNER context', () => {
  assert.match(component, /@Output\(\) payrollPaid = new EventEmitter<void>\(\)/);
  const payStart = component.indexOf('async payPayroll(');
  assert.ok(payStart >= 0);
  assert.match(component.slice(payStart), /this\.payrollPaid\.emit\(\)/);
  assert.match(app, /\(payrollPaid\)="refreshAfterPayrollPayment\(\)"/);

  const refreshStart = app.indexOf('async refreshAfterPayrollPayment(): Promise<void>');
  const refreshEnd = app.indexOf('\n  exportReceivablesAgingCsv()', refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart);
  const refresh = app.slice(refreshStart, refreshEnd);
  assert.match(refresh, /requestContext\.role !== 'owner'/);
  assert.match(refresh, /runTenantScopedRequest\(\s*this\.payrollRefreshGuard/);
  assert.match(refresh, /this\.api\.expenses\(requestContext\.workspaceId\)/);
  assert.match(refresh, /this\.api\.dashboard\(requestContext\.workspaceId\)/);
  assert.match(refresh, /this\.expenses = expenses;/);
  assert.match(refresh, /this\.dashboard = dashboard;/);
  assert.match(refresh, /onError: error =>/);
  assert.match(refresh, /this\.dashboard = null;/);
  assert.match(refresh, /this\.homeDashboardError = this\.message\(error\);/);
  assert.match(refresh, /this\.error = this\.homeDashboardError;/);
  assert.match(refresh, /onFinally: \(\) => undefined/);
});


test('payroll payout wording describes an in-app record and never implies a bank transfer', () => {
  assert.match(component, /Record payout in app/);
  assert.match(component, /Payout recorded in the app/);
  assert.match(component, /No bank transfer is sent/);
  assert.match(component, /Payout recorded/);
  assert.doesNotMatch(component, /Mark paid/);
  assert.match(component, /تسجيل الصرف داخل النظام/);
});


test('employee and payroll surfaces consume shared semantic status and control tokens', () => {
  for (const token of [
    '--aba-color-text-primary', '--aba-color-border', '--aba-color-text-tertiary',
    '--aba-color-primary', '--aba-color-on-primary', '--aba-color-primary-strong',
    '--aba-color-danger-text', '--aba-color-danger-soft', '--aba-color-success-text', '--aba-color-success-soft',
    '--aba-color-warning-text', '--aba-color-warning-soft', '--aba-color-info-text', '--aba-control-height',
  ]) assert.ok(component.includes(token), `missing shared payroll token: ${token}`);
  assert.match(component, /\.employee-panel\{min-width:0;background:var\(--aba-color-surface/);
  assert.match(component, /class="notice success-notice"/);
  assert.ok(component.includes('background:var(--aba-color-success-soft,#ecfdf5)'));
  assert.ok(component.includes('background:var(--aba-color-warning-soft,#fffbeb)'));
  assert.equal(component.includes(')beb'), false);
});


test('payroll section headings stack cleanly on narrow screens', () => {
  assert.match(component, /@media\(max-width:600px\)\{\.section-head\{display:grid;grid-template-columns:minmax\(0,1fr\);gap:8px\}/);
  assert.match(component, /\.section-head \.count\{justify-self:start\}/);
});


test('employee search distinguishes an empty directory from no matching results', () => {
  assert.match(component, /employeeSearch\.trim\(\) \? t\('لا يوجد موظفون مطابقون للبحث\.'/);
  assert.match(component, /No matching employees found/);
  assert.match(component, /No employees have been added yet/);
});


test('owner-only payroll view stays behind its deferred loading boundary', () => {
  const start = app.indexOf("@if (tab === 'employees' && business.role === 'owner') {");
  const end = app.indexOf("@if (tab === 'expenses')", start);
  assert.ok(start >= 0 && end > start);
  const block = app.slice(start, end);
  assert.match(block, /@defer \(when tab === 'employees' && business\.role === 'owner'\)/);
  assert.match(block, /@placeholder/);
  assert.match(block, /<aba-state-message kind="loading"/);
  assert.equal((app.match(/<aba-employee-payroll\b/g) || []).length, 1);
  assert.match(app, /import \{ EmployeePayrollComponent \} from '\.\/employee-payroll\.component';/);
  assert.match(component, /standalone: true/);
});


test('employee directory and payroll selector never expose base salary values', () => {
  const directoryStart = component.indexOf('<div class="list">');
  const directoryEnd = component.indexOf('data-mobile-pane="prepare"', directoryStart);
  assert.ok(directoryStart >= 0 && directoryEnd > directoryStart);
  const directory = component.slice(directoryStart, directoryEnd);
  assert.doesNotMatch(directory, /monthly_salary|currencyCode/);
  assert.match(directory, /<strong>\{\{ employee\.name \}\}<\/strong>/);
  assert.match(directory, /employee\.employee_code \|\| t\('بدون كود', 'No code'\)/);

  const selectorStart = component.indexOf('<select name="payrollEmployeeId"');
  const selectorEnd = component.indexOf('</select>', selectorStart);
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart);
  const selector = component.slice(selectorStart, selectorEnd);
  assert.doesNotMatch(selector, /monthly_salary|currencyCode/);
  assert.match(selector, /employee\.name/);
  assert.match(selector, /employee\.employee_code \|\| t\('بدون كود', 'No code'\)/);

  // Compensation remains editable only inside the existing OWNER-only employee form.
  assert.match(component, /الراتب الشهري الأساسي/);
  assert.match(component, /name="employeeMonthlySalary"/);
  assert.match(component, /\[\(ngModel\)\]="employeeMonthlySalary"/);
});
