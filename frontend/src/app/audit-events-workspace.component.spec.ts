import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./audit-events-workspace.component.ts', import.meta.url), 'utf8');
const root = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('audit workspace is standalone and receives parent-owned paginated state', () => {
  assert.match(component, /selector: 'aba-audit-events-workspace'/);
  assert.match(component, /standalone: true/);
  for (const field of ['total', 'offset', 'events', 'loading', 'error', 'action', 'targetType', 'columns', 'rows']) {
    assert.match(component, new RegExp('@Input\\(\\) ' + field + '\\b'));
  }
  assert.match(component, /@Output\(\) actionChange = new EventEmitter<string>\(\)/);
  assert.match(component, /@Output\(\) targetTypeChange = new EventEmitter<string>\(\)/);
  assert.match(component, /@Output\(\) loadPage = new EventEmitter<number>\(\)/);
  assert.doesNotMatch(component, /ApiService|auditEvents\(/);
});

test('audit workspace preserves event filters, owner action types, and responsive pagination', () => {
  for (const action of [
    'invoice.issued', 'invoice.created', 'invoice.draft_updated', 'invoice.voided',
    'payment.recorded', 'expense.created', 'customer.created', 'product.created',
    'stock.movement_recorded', 'supplier.created', 'purchase_order.created',
    'purchase_order.approved', 'purchase_order.received', 'sales_return.created',
    'sales_return.approved', 'recurring_invoice_schedule.created', 'data_import.completed',
    'pricing_rule.created',
  ]) assert.ok(component.includes(`value="${action}"`), `missing audit action ${action}`);
  assert.match(component, /loadPage\.emit\(offset \+ 50\)/);
  assert.match(component, /offset > 50 \? offset - 50 : 0/);
  assert.match(component, /@media\(max-width:760px\)/);
  assert.match(component, /min-height:44px/);
});

test('root app delegates audit presentation while retaining audit data loading and labels', () => {
  assert.match(root, /import \{ AuditEventsWorkspaceComponent \} from '\.\/audit-events-workspace\.component';/);
  assert.match(root, /<aba-audit-events-workspace[\s\S]*\[events\]="auditEvents"/);
  assert.match(root, /\(loadPage\)="loadAuditEvents\(\$event\)"/);
  assert.match(root, /get auditTableRows\(\): readonly AbaRecordTableRow\[\]/);
  assert.match(root, /async loadAuditEvents\(offset = 0\): Promise<void>/);
});
