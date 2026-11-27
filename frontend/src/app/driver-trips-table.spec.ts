// 3A-920 step 6 — the driver trips table inside the employee profile.
//
// The section renders only while the master switch is on AND the
// employee being edited is a flagged driver; its rows come from the
// owner-only driver-trips endpoint (issued invoices only, money trail
// from the wage snapshot + the payments ledger). The date filters are
// the component's own from/to inputs over the loaded rows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const payrollComponent = readFileSync(new URL('./employee-payroll.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../../backend/app/employee_payroll_api.py', import.meta.url), 'utf8');
const ar = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8'));

test('section is gated on the switch and on editing a flagged driver', () => {
  assert.match(payrollComponent, /@if \(transportEnabled && driverTripsEmployeeId\) \{\s*<section class="payroll-section driver-trips">/);
  assert.match(payrollComponent, /if \(this\.transportEnabled && employee\.is_driver\) \{\s*this\.driverTripsEmployeeId = employee\.id;\s*void this\.loadDriverTrips\(employee\.id\);/);
  // Leaving the profile clears the table.
  assert.match(payrollComponent, /this\.driverTrips = \[\];\s*this\.driverTripsEmployeeId = null;\s*this\.tripFrom = '';\s*this\.tripTo = '';/);
});

test('rows render the money trail with date filters', () => {
  assert.match(payrollComponent, /@for \(row of filteredDriverTrips; track row\.invoice_id\)/);
  assert.match(payrollComponent, /t\('ui\.employees\.driverTrips\.due'\)/);
  assert.match(payrollComponent, /t\('ui\.employees\.driverTrips\.paid'\)/);
  assert.match(payrollComponent, /t\('ui\.employees\.driverTrips\.remaining'\)/);
  assert.match(payrollComponent, /\[\(ngModel\)\]="tripFrom"/);
  assert.match(payrollComponent, /\[\(ngModel\)\]="tripTo"/);
  assert.match(payrollComponent, /get filteredDriverTrips\(\): DriverTripRow\[\]/);
  // Confirmed rows derive their paid state; other statuses reuse the
  // step-4 entitlement labels.
  assert.match(payrollComponent, /driverTripStatusLabel\(row: DriverTripRow\)/);
  assert.match(payrollComponent, /ui\.invoices\.transport\.statusProposed/);
  assert.match(payrollComponent, /ui\.employees\.driverTrips\.partiallyPaid/);
  assert.match(payrollComponent, /ui\.employees\.driverTrips\.fullyPaid/);
});

test('api method and backend route agree', () => {
  assert.match(api, /driverTrips\(businessId: string, employeeId: string\): Promise<DriverTripRow\[\]>/);
  assert.match(api, /\/employees\/\$\{encodeURIComponent\(employeeId\)\}\/driver-trips`/);
  assert.match(backend, /@router\.get\("\/employees\/\{employee_id\}\/driver-trips"\)/);
  assert.match(backend, /Invoice\.transport_entitlement_status\.is_not\(None\)/);
});

test('copy exists in both catalogs and carries no trade name', () => {
  const keys = ['title', 'hint', 'from', 'to', 'invoice', 'due', 'paid', 'remaining', 'partiallyPaid', 'fullyPaid', 'empty'];
  for (const key of keys) {
    assert.equal(typeof ar.ui.employees.driverTrips[key], 'string', `ar driverTrips.${key}`);
    assert.equal(typeof en.ui.employees.driverTrips[key], 'string', `en driverTrips.${key}`);
  }
  assert.equal(ar.ui.employees.driverTrips.title, 'مشاوير السائق');
  assert.ok(!JSON.stringify(ar.ui.employees.driverTrips).includes('شونة'), 'no trade name');
});
