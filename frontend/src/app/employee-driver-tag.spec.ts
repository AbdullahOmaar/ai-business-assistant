// 3A-920 step 1 — the driver/delivery-agent tag on the employee card
// + the drivers-only filter in the employee list. Both render only
// while the transport switch is on; the flag (not a free-text job
// title) is what enrolls an employee in the invoice drivers list.
// The backend gate (setting the flag while off is a 422, stored flags
// are never cleared) is covered by
// backend/tests/test_employee_driver_flag.py.
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

test('employee form carries the driver checkbox, only while transport is on', () => {
  assert.ok(component.includes("@if (transportEnabled)"));
  assert.ok(component.includes("t('ui.employees.transport.driverTag')"));
  assert.ok(component.includes('[(ngModel)]="employeeIsDriver"'));
  assert.ok(component.includes('name="employeeIsDriver" type="checkbox"'));
  // The checkbox lives in the profile form, after the job title and
  // before the salary — not in a new tab or screen.
  const form = component.slice(component.indexOf('id="employee-profile-form"'), component.indexOf('</form>'));
  assert.ok(form.includes('employeeIsDriver'), 'checkbox must be inside the profile form');
  assert.ok(form.indexOf('employeeIsDriver') > form.indexOf('employeeJobTitle'));
  assert.ok(form.indexOf('employeeIsDriver') < form.indexOf('employeeMonthlySalary'));
});

test('employee list has a drivers-only filter chip, only while transport is on', () => {
  assert.ok(component.includes("t('ui.employees.transport.driversOnly')"));
  assert.ok(component.includes('(click)="driversOnly = !driversOnly"'));
  assert.ok(component.includes('[attr.aria-pressed]="driversOnly"'));
  assert.ok(component.includes('if (this.driversOnly) rows = rows.filter(employee => employee.is_driver);'));
  // The chip is a toggle, not a second search box.
  assert.ok(!component.includes('driversOnlySearch'));
});

test('employee table shows the driver tag as a status cell, only while transport is on', () => {
  assert.ok(component.includes("...(this.transportEnabled ? [{key:'driver',label:this.t('ui.employees.transport.driverTag'),kind:'status'} as const] : []),"));
  assert.ok(component.includes("driver:employee.is_driver?this.t('ui.employees.transport.driverTag'):''"));
});

test('transport flag loads with the employees list and resets per business', () => {
  assert.ok(component.includes('this.api.listSettings(businessId),'));
  assert.ok(component.includes('this.transportEnabled = transportEnabledFromSettings(settings);'));
  assert.ok(component.includes('this.driversOnly = false;'));
  assert.ok(component.includes('this.transportEnabled = false;'));
});

test('save and edit round-trip the driver flag through the existing employee endpoints', () => {
  assert.ok(component.includes('this.employeeIsDriver = employee.is_driver;'));
  assert.ok(component.includes('is_driver: this.employeeIsDriver,'));
  assert.ok(apiService.includes('is_driver: boolean;'));
  assert.ok(apiService.includes('job_title?: string; is_driver?: boolean;'));
  assert.ok(apiService.includes('is_active?: boolean;'));
  assert.ok(apiService.includes('is_driver?: boolean;'));
});

test('ui.employees.transport i18n keys are in exact ar/en parity', () => {
  const arKeys = Object.keys(arabic.ui.employees.transport).sort();
  const enKeys = Object.keys(english.ui.employees.transport).sort();
  assert.deepEqual(arKeys, enKeys);
  assert.deepEqual(arKeys, ['driverTag', 'driversOnly']);
  for (const key of arKeys) {
    assert.ok(typeof arabic.ui.employees.transport[key] === 'string' && arabic.ui.employees.transport[key].length > 0, `empty ar key: ${key}`);
    assert.ok(typeof english.ui.employees.transport[key] === 'string' && english.ui.employees.transport[key].length > 0, `empty en key: ${key}`);
  }
  // General capability, no trade-specific name anywhere in the copy.
  const copy = JSON.stringify(arabic.ui.employees.transport) + JSON.stringify(english.ui.employees.transport);
  assert.ok(!copy.includes('شونة') && !copy.includes('Shouna') && !copy.includes('Elshona'));
});
