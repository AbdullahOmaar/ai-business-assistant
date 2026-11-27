// 3A-920 step 5 — partial salary payment («دفع جزء»).
//
// An approved payroll record can receive partial payments: each is
// its own Payroll expense + payroll_payments ledger row server-side,
// and the remainder stays due until the payments sum reaches the net.
// These specs pin the frontend wiring: the payslip shows the paid /
// remaining progress only once money has moved, the partial-pay form
// renders only for approved records, and the api calls the payments
// route the backend exposes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const payrollComponent = readFileSync(new URL('./employee-payroll.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../../backend/app/employee_payroll_api.py', import.meta.url), 'utf8');
const ar = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8'));

test('payslip shows paid/remaining progress only after money moved', () => {
  assert.match(payrollComponent, /@if \(selectedPayroll\.paid_amount && selectedPayroll\.paid_amount !== '0\.00'\)/);
  assert.match(payrollComponent, /t\('ui\.employees\.partialPayment\.paidSoFar'\)/);
  assert.match(payrollComponent, /t\('ui\.employees\.partialPayment\.remaining'\)/);
  assert.match(api, /paid_amount\?: string; remaining_amount\?: string;/);
});

test('partial-pay form renders only for approved records and posts through the api', () => {
  assert.match(payrollComponent, /@if \(selectedPayroll\.status === 'approved'\) \{\s*<form class="partial-pay-form" \(ngSubmit\)="payPart\(selectedPayroll\)">/);
  assert.match(payrollComponent, /\[\(ngModel\)\]="partialPayAmount"/);
  assert.match(payrollComponent, /async payPart\(record: EmployeePayrollRecord\)/);
  assert.match(payrollComponent, /this\.api\.recordPayrollPayment\(businessId, record\.id, amount\)/);
  // Viewing a record prefills the amount with the remainder due.
  assert.match(payrollComponent, /this\.partialPayAmount = payroll\.remaining_amount \?\? payroll\.net_pay/);
  // The completion message is chosen from the server's verdict.
  assert.match(payrollComponent, /updated\.status === 'paid'[\s\S]{0,120}partialPayment\.completed/);
});

test('api method and backend route agree', () => {
  assert.match(api, /recordPayrollPayment\(businessId: string, payrollId: string, amount: string\)/);
  assert.match(api, /\/payroll\/\$\{encodeURIComponent\(payrollId\)\}\/payments`/);
  assert.match(backend, /@router\.post\("\/payroll\/\{payroll_id\}\/payments", status_code=201\)/);
  assert.match(backend, /class PayrollPaymentCreate/);
});

test('copy exists in both catalogs and carries no trade name', () => {
  const keys = ['paidSoFar', 'remaining', 'amount', 'payPart', 'hint', 'recorded', 'completed'];
  for (const key of keys) {
    assert.equal(typeof ar.ui.employees.partialPayment[key], 'string', `ar partialPayment.${key}`);
    assert.equal(typeof en.ui.employees.partialPayment[key], 'string', `en partialPayment.${key}`);
  }
  assert.equal(ar.ui.employees.partialPayment.payPart, 'دفع جزء');
  const arCopy = JSON.stringify(ar.ui.employees.partialPayment);
  assert.ok(!arCopy.includes('شونة'), 'no trade name in the partial-payment copy');
});
