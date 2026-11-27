// 3A-920 step 2 — the wage basis (monthly / daily / per-trip) on the
// employee card + the trips / work-days units in the payroll form.
// The net formula never changes and the base is always server-computed
// (monthly = salary; daily = salary / 30 x days; per-trip = trip wage
// x trips). The per-trip option exists only while the transport switch
// is on; a stored trip wage stays stored (hidden, never deleted) when
// the basis is monthly or daily. The backend math + gates are covered
// by backend/tests/test_employee_wage_basis.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(appDirectory, 'employee-payroll.component.ts'), 'utf8');
const apiService = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const publicDirectory = resolve(appDirectory, '../../public/i18n');
const arabic = JSON.parse(readFileSync(resolve(publicDirectory, 'ar.json'), 'utf8'));
const english = JSON.parse(readFileSync(resolve(publicDirectory, 'en.json'), 'utf8'));

test('employee form carries the wage-basis select; per-trip only while transport is on', () => {
  assert.ok(component.includes("t('ui.employees.wageBasis.label')"));
  assert.ok(component.includes('[(ngModel)]="employeeWageBasis"'));
  assert.ok(component.includes('<option value="monthly">{{ t(\'ui.employees.wageBasis.monthly\') }}</option>'));
  assert.ok(component.includes('<option value="daily">{{ t(\'ui.employees.wageBasis.daily\') }}</option>'));
  // The option renders while the switch is on, or for an employee whose
  // stored basis already is per-trip (disabled then — the stored value
  // stays visible while off, but cannot be newly chosen).
  assert.ok(component.includes("@if (transportEnabled || employeeWageBasis === 'per_trip') {"));
  assert.ok(component.includes('<option value="per_trip" [disabled]="!transportEnabled">'));
  // The select lives in the profile form, between the driver checkbox
  // and the salary — not in a new tab or screen.
  const form = component.slice(component.indexOf('id="employee-profile-form"'), component.indexOf('</form>'));
  assert.ok(form.includes('employeeWageBasis'), 'select must be inside the profile form');
  assert.ok(form.indexOf('employeeWageBasis') > form.indexOf('employeeIsDriver'));
  assert.ok(form.indexOf('employeeWageBasis') < form.indexOf('employeeMonthlySalary'));
});

test('trip-wage field appears only for the per-trip basis, only while transport is on', () => {
  assert.ok(component.includes("@if (transportEnabled && employeeWageBasis === 'per_trip') {"));
  assert.ok(component.includes("t('ui.employees.wageBasis.tripWage')"));
  assert.ok(component.includes('[(ngModel)]="employeeTripWage"'));
  assert.ok(component.includes('name="employeeTripWage" type="number"'));
  // A per-trip employee without a positive trip wage cannot be saved.
  assert.ok(component.includes('get employeeWageValid(): boolean {'));
  assert.ok(component.includes("if (this.employeeWageBasis !== 'per_trip') return true;"));
  assert.ok(component.includes('!employeeWageValid'));
});

test('payroll form asks for trips or work days only for the matching basis', () => {
  assert.ok(component.includes("selectedPayrollEmployee?.wage_basis === 'per_trip'"));
  assert.ok(component.includes("t('ui.employees.wageBasis.trips')"));
  assert.ok(component.includes('[(ngModel)]="payrollTrips"'));
  assert.ok(component.includes('name="payrollTrips" type="number"'));
  assert.ok(component.includes("selectedPayrollEmployee?.wage_basis === 'daily'"));
  assert.ok(component.includes("t('ui.employees.wageBasis.workDays')"));
  assert.ok(component.includes('[(ngModel)]="payrollWorkDays"'));
  assert.ok(component.includes('name="payrollWorkDays" type="number"'));
  assert.ok(component.includes('max="31"'));
  // The rate hints show what the base is computed from.
  assert.ok(component.includes('dailyWageOf(selectedPayrollEmployee!)'));
  assert.ok(component.includes('return (Number(employee.monthly_salary) / 30).toFixed(2);'));
  // The units are creation-time facts: they ride createPayroll only,
  // never updatePayroll — a closed period can never be recomputed.
  assert.ok(component.includes("...(basis === 'per_trip' ? {trips} : {}),"));
  assert.ok(component.includes("...(basis === 'daily' ? {work_days: workDays} : {})"));
  const updateCall = component.slice(component.indexOf('await this.api.updatePayroll('));
  assert.ok(!updateCall.slice(0, 400).includes('trips'));
});

test('payslip detail shows the units the base was computed from', () => {
  assert.ok(component.includes("@if (selectedPayroll.trips !== null) {"));
  assert.ok(component.includes("@if (selectedPayroll.work_days !== null) {"));
});

test('save and edit round-trip the wage basis and trip wage', () => {
  assert.ok(component.includes('this.employeeWageBasis = employee.wage_basis;'));
  assert.ok(component.includes("this.employeeTripWage = employee.trip_wage ?? '';"));
  assert.ok(component.includes('wage_basis: this.employeeWageBasis,'));
  assert.ok(component.includes("...(this.employeeWageBasis === 'per_trip' ? {trip_wage: this.employeeTripWage.trim() || null} : {}),"));
  assert.ok(apiService.includes('wage_basis: string; trip_wage: string | null;'));
  assert.ok(apiService.includes('trips: number | null; work_days: number | null;'));
  assert.ok(apiService.includes('wage_basis?: string; trip_wage?: string | null;'));
  assert.ok(apiService.includes('trips?: number; work_days?: number;'));
});

test('ui.employees.wageBasis i18n keys are in exact ar/en parity', () => {
  const arKeys = Object.keys(arabic.ui.employees.wageBasis).sort();
  const enKeys = Object.keys(english.ui.employees.wageBasis).sort();
  assert.deepEqual(arKeys, enKeys);
  assert.deepEqual(arKeys, ['daily', 'label', 'monthly', 'perTrip', 'tripWage', 'trips', 'workDays']);
  for (const key of arKeys) {
    assert.ok(typeof arabic.ui.employees.wageBasis[key] === 'string' && arabic.ui.employees.wageBasis[key].length > 0, `empty ar key: ${key}`);
    assert.ok(typeof english.ui.employees.wageBasis[key] === 'string' && english.ui.employees.wageBasis[key].length > 0, `empty en key: ${key}`);
  }
  // General capability, no trade-specific name anywhere in the copy.
  const copy = JSON.stringify(arabic.ui.employees.wageBasis) + JSON.stringify(english.ui.employees.wageBasis);
  assert.ok(!copy.includes('شونة') && !copy.includes('Shouna') && !copy.includes('Elshona'));
});
