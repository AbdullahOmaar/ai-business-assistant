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
  assert.ok(component.includes(`[attr.dir]="language === 'ar' ? 'rtl' : 'ltr'"`), 'Arabic UI must declare RTL direction');
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

test('employee pagination uses a lookahead row instead of a total-count API', () => {
  assert.match(component, /limit: this\.employeePageSize \+ 1/);
  assert.match(component, /this\.payrollPageSize \+ 1,\s*this\.payrollOffset/);
  assert.match(component, /this\.employeeHasNext = employeeRows\.length > this\.employeePageSize/);
  assert.match(component, /this\.employees = employeeRows\.slice\(0, this\.employeePageSize\)/);
  assert.match(component, /this\.payrollHasNext = payrollRows\.length > this\.payrollPageSize/);
  assert.match(component, /this\.payrollRecords = payrollRows\.slice\(0, this\.payrollPageSize\)/);
});

test('payroll employee picker searches the complete active directory independently of the visible page', () => {
  assert.match(component, /activeOnly: true/);
  assert.match(component, /search: this\.payrollEmployeeSearch\.trim\(\)/);
  assert.match(component, /payrollEmployeeOptions/);
  assert.match(component, /selectedPayrollEmployeeFallback/);
  assert.match(component, /pickerLoadSequence/);
  assert.match(component, /searchPayrollEmployees\(\)/);
});



test('employee directory and payroll history remain available when the optional payroll picker request fails', () => {
  const loadStart = component.indexOf('async loadEmployeesAndPayroll(): Promise<void>');
  const loadEnd = component.indexOf('\n  searchEmployees(): void', loadStart);
  assert.ok(loadStart >= 0 && loadEnd > loadStart, 'Expected employee/payroll loader');
  const loader = component.slice(loadStart, loadEnd);
  assert.match(loader, /const \[employeeRows, payrollRows\] = await Promise\.all\(\[/);
  assert.doesNotMatch(loader, /const \[employeeRows, payrollRows, pickerRows\]/);
  assert.match(loader, /const pickerRows = await this\.api\.employees/);
  assert.match(loader, /catch \(error\) \{[\s\S]*this\.error = this\.errorMessage\(error\)/);
  assert.match(loader, /finally \{[\s\S]*this\.pickerBusy = false/);
});


test('clears all workspace-scoped employee and payroll state when the workspace selection is removed', () => {
  const changeStart = component.indexOf('ngOnChanges(changes: SimpleChanges): void');
  const changeEnd = component.indexOf('\n  t(arabic: string', changeStart);
  assert.ok(changeStart >= 0 && changeEnd > changeStart, 'Expected workspace change handler');
  const handler = component.slice(changeStart, changeEnd);
  assert.ok(handler.includes("if (changes['businessId'])"));
  assert.ok(!handler.includes("if (changes['businessId'] && this.businessId)"));
  for (const state of [
    'this.employees = []',
    'this.payrollEmployeeOptions = []',
    'this.payrollRecords = []',
    "this.payrollEmployeeId = ''",
    "this.payrollEmployeeSearch = ''",
    "this.employeeSearchApplied = ''",
  ]) {
    assert.ok(handler.includes(state), `Workspace change must clear ${state}`);
  }
  assert.ok(handler.includes('if (this.businessId) void this.loadEmployeesAndPayroll()'));
});


test('employee and payroll load failures expose a retry action for the current workspace', () => {
  assert.ok(component.includes('(click)="retryLoad()"'));
  assert.ok(component.includes("t('إعادة المحاولة', 'Retry')"));
  assert.ok(component.includes('retryLoad(): void {'));
  assert.ok(component.includes('void this.loadEmployeesAndPayroll();'));
});


test('employee and payroll UI expose accessible loading, empty, error, and success states in both locales', () => {
  assert.ok(component.includes('@if (busy) { <p class="muted" role="status">'));
  assert.match(component, /Loading employee and payroll data/);
  assert.match(component, /لا يوجد موظفون مطابقون للبحث/);
  assert.match(component, /No matching employees found/);
  assert.match(component, /لا توجد مرتبات في الفترة المحددة/);
  assert.match(component, /No payroll records for this period/);
  assert.match(component, /<div class="error" role="alert">/);
  assert.match(component, /<p class="notice" role="status">/);
  assert.match(component, /لا يؤكد ذلك تحويلًا بنكيًا خارجيًا/);
  assert.match(component, /this does not confirm an external bank transfer/);
});

test('payroll creation requires an explicit employee choice instead of defaulting to the first active employee', () => {
  assert.doesNotMatch(component, /const firstActive = this\.payrollEmployeeOptions\[0\]/);
  assert.match(component, /!payrollEmployeeId/);
  assert.match(component, /this\.payrollEmployeeId = ''/);
  assert.match(component, /previouslySelected && !this\.payrollEmployeeOptions\.some/);
});


test('late employee and picker responses cannot repopulate a different workspace', () => {
  const changeStart = component.indexOf('ngOnChanges(changes: SimpleChanges): void');
  const changeEnd = component.indexOf('\n  t(arabic: string', changeStart);
  assert.ok(changeStart >= 0 && changeEnd > changeStart);
  const workspaceChange = component.slice(changeStart, changeEnd);
  assert.match(workspaceChange, /this\.loadSequence\+\+/);
  assert.match(workspaceChange, /this\.pickerLoadSequence\+\+/);
  assert.match(workspaceChange, /this\.employees = \[\]/);
  assert.match(workspaceChange, /this\.payrollRecords = \[\]/);

  const loadStart = component.indexOf('async loadEmployeesAndPayroll(): Promise<void>');
  const loadEnd = component.indexOf('\n  searchEmployees(): void', loadStart);
  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  const loader = component.slice(loadStart, loadEnd);
  assert.match(loader, /const businessId = this\.businessId/);
  assert.match(loader, /const sequence = \+\+this\.loadSequence/);
  assert.match(loader, /if \(sequence !== this\.loadSequence \|\| this\.businessId !== businessId\) return/);
  assert.match(loader, /if \(pickerSequence !== this\.pickerLoadSequence \|\| this\.businessId !== businessId\) return/);
  assert.match(loader, /if \(sequence === this\.loadSequence && this\.businessId === businessId\) this\.busy = false/);

  const pickerStart = component.indexOf('async searchPayrollEmployees(): Promise<void>');
  const pickerEnd = component.indexOf('\n  onPayrollEmployeeChange(', pickerStart);
  assert.ok(pickerStart >= 0 && pickerEnd > pickerStart);
  const picker = component.slice(pickerStart, pickerEnd);
  assert.match(picker, /if \(sequence !== this\.pickerLoadSequence \|\| this\.businessId !== businessId\) return/);
  assert.match(picker, /if \(sequence === this\.pickerLoadSequence && this\.businessId === businessId\) \{\\s*this\.pickerBusy = false;/);
});
