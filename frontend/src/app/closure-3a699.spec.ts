import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 3A-699 (Phase 1 closure batch 2 of 3): U12 employees & payroll, U16 audit
// log, U14 assistant — the shared system applied, per the 3A-408 derivation
// and the 2026-11-24 verification pass. Source-assertion style, following
// the closure-3a696.spec.ts pattern.

const payrollSource = readFileSync(new URL('./employee-payroll.component.ts', import.meta.url), 'utf8');
const auditSource = readFileSync(new URL('./audit-events-workspace.component.ts', import.meta.url), 'utf8');
const assistantSource = readFileSync(new URL('./assistant-workspace.component.ts', import.meta.url), 'utf8');

test('U12/G1: employee search rides the shared filter bar + search field, like the shell lists', () => {
  assert.ok(payrollSource.includes('AbaFilterBarComponent') && payrollSource.includes('AbaSearchFieldComponent'),
    'payroll component imports the shared filter bar and search field');
  assert.ok(payrollSource.includes('<aba-search-field name="employeeSearch"'),
    'the employee search is the shared search field');
  assert.ok(payrollSource.includes('[hasActiveFilter]="employeeSearch.trim() !== \'\'" (clear)="employeeSearch = \'\'"'),
    'the bar summarises and clears the employee search');
  assert.ok(!payrollSource.includes('<input name="employeeSearch"'),
    'the bespoke search input is gone');
});

test('U12/G1: the payroll period filter folds behind the filter button with a visible summary and a clear that reloads', () => {
  assert.ok(payrollSource.includes('variant="selects" [foldExtras]="true"'),
    'the history filter uses the fold mode');
  assert.ok(payrollSource.includes('[filterSummary]="payrollFilterPeriod ? t(\'ui.m_r58gmw\') + \': \' + payrollFilterPeriod : \'\'"'),
    'the active period stays visible as the summary while folded');
  assert.ok(payrollSource.includes('(clear)="clearPayrollPeriodFilter()"'),
    'clearing goes through the reload path');
  assert.match(payrollSource, /clearPayrollPeriodFilter\(\): void \{\s*if \(!this\.payrollFilterPeriod\) return;\s*this\.payrollFilterPeriod = '';\s*void this\.loadEmployeesAndPayroll\(\);/,
    'clear resets the period and reloads the list');
});

test('U12: every payroll row offers the payslip, and the payslip is a read-only detail of the record', () => {
  assert.ok(payrollSource.includes("{id:'view',label:this.t('app.payslip.title')}"),
    'the view action leads every payroll row action list');
  // 3A-920 step 5 (2026-11-27): viewing also prefills the partial-pay
  // amount with the remainder due — a form field, not a state change;
  // the payslip itself stays a read-only view of the record.
  assert.ok(payrollSource.includes("if(action.actionId==='view'){ this.selectedPayroll = payroll; this.partialPayAmount = payroll.remaining_amount ?? payroll.net_pay; return; }"),
    'viewing selects the record and prefills the partial-pay amount');
  assert.ok(payrollSource.includes('class="payslip-detail"'), 'the payslip detail panel exists');
  assert.ok(payrollSource.includes('{{ selectedPayroll.net_pay }} {{ currencyCode }}'),
    'the payslip net is glued to its currency');
  assert.ok(payrollSource.includes('(click)="selectedPayroll = null"'), 'the payslip closes back to the list');
});

test('U16/G1: the audit filters fold behind the filter button while keeping submit-to-server behaviour', () => {
  assert.ok(auditSource.includes('<aba-filter-bar variant="selects" [foldExtras]="true"'),
    'the audit panel adopts the shared filter bar in fold mode');
  assert.ok(auditSource.includes('<form class="audit-filter-form" (ngSubmit)="loadPage.emit(0)">'),
    'the form still submits to the server — no instant-filter behaviour change');
  assert.ok(auditSource.includes('[filterSummary]="filterSummaryText" (clear)="resetFilters()"'),
    'the active filter is summarised and cleared through the bar');
  assert.ok(auditSource.includes('[attr.aria-label]="t(\'ui.m_agqz0i\')"><aba-icon name="check" />'),
    'the apply action is distinct from the bar toggle');
});

test('U16: the filter offers every mapped action and target, using the audit label keys', () => {
  for (const code of ['employee.created', 'payroll.paid', 'membership.removed', 'notification.queued', 'platform.user_role.revoked']) {
    assert.ok(auditSource.includes(`<option value="${code}">`), `action option ${code} is filterable`);
  }
  for (const code of ['employee', 'payroll', 'membership', 'notification']) {
    assert.ok(auditSource.includes(`<option value="${code}">`), `target option ${code} is filterable`);
  }
  assert.ok(auditSource.includes("t('audit.actions.m_5gb65j')"), 'new options reuse the audit action labels');
  assert.ok(auditSource.includes("t('audit.targets.m_13tf6tx')"), 'new options reuse the audit target labels');
  assert.match(auditSource, /get filterSummaryText\(\): string \{\s*const parts: string\[\] = \[\];\s*if \(this\.action\) parts\.push\(this\.t\(auditActionLabel\(this\.action\)\)\);/,
    'the summary names the active filter with the row labels');
});

test('U14/G4: while a reply is on its way, the chat log itself shows a skeleton message', () => {
  assert.ok(assistantSource.includes('AbaSkeletonComponent'), 'the assistant imports the shared skeleton');
  const sendingIdx = assistantSource.indexOf('@if (chatSending) {');
  // Slice 4: the history/settings/brief panels above the log reuse the
  // same skeleton variant while loading, so search for the skeleton
  // from the sending block, not from the top of the file.
  const skeletonIdx = assistantSource.indexOf('<aba-skeleton variant="list-row" />', sendingIdx);
  assert.ok(sendingIdx >= 0 && skeletonIdx > sendingIdx, 'the skeleton bubble renders inside the log while sending');
  assert.ok(assistantSource.includes('class="chat-message chat-message--pending"'), 'the pending bubble takes the message shape');
  assert.ok(!assistantSource.includes('kind="loading"'), 'the under-log loading message is replaced by the in-log skeleton');
});
