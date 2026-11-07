import assert from 'node:assert/strict';
import test from 'node:test';
import { auditActionLabel, auditTargetLabel } from './audit-labels.ts';

test('audit actions are localized for Arabic and English', () => {
  assert.equal(auditActionLabel('invoice.issued', 'ar'), 'إصدار فاتورة');
  assert.equal(auditActionLabel('purchase_order.received', 'en'), 'Purchase order received');
});

test('audit targets are localized and unknown values remain visible', () => {
  assert.equal(auditTargetLabel('purchase_order', 'ar'), 'أمر شراء');
  assert.equal(auditTargetLabel('notification', 'en'), 'Notification');
  assert.equal(auditTargetLabel('custom_future_target', 'en'), 'custom_future_target');
  assert.equal(auditActionLabel('custom.future.action', 'ar'), 'custom.future.action');
});

test('notification queue audit events use bilingual action labels', () => {
  assert.equal(auditActionLabel('notification.queued', 'ar'), 'إضافة إشعار إلى القائمة');
  assert.equal(auditActionLabel('notification.queued', 'en'), 'Notification queued');
});

test('membership, employee, payroll, and workspace-admin audit events use bilingual labels', () => {
  assert.equal(auditActionLabel('membership.role_changed', 'ar'), 'تغيير دور العضوية');
  assert.equal(auditActionLabel('membership.removed', 'en'), 'Workspace membership removed');
  assert.equal(auditActionLabel('employee.created', 'ar'), 'إضافة موظف');
  assert.equal(auditActionLabel('employee.updated', 'en'), 'Employee updated');
  assert.equal(auditActionLabel('payroll.created', 'ar'), 'إنشاء مسودة مرتب');
  assert.equal(auditActionLabel('payroll.updated', 'en'), 'Payroll draft updated');
  assert.equal(auditActionLabel('payroll.approved', 'ar'), 'اعتماد المرتب');
  assert.equal(auditActionLabel('payroll.paid', 'en'), 'Payroll payout recorded');
  assert.equal(auditActionLabel('platform.business.activated', 'ar'), 'تفعيل مساحة عمل');
  assert.equal(auditActionLabel('platform.business.deactivated', 'en'), 'Workspace deactivated');
  assert.equal(auditTargetLabel('membership', 'ar'), 'عضوية');
  assert.equal(auditTargetLabel('employee', 'en'), 'Employee');
  assert.equal(auditTargetLabel('payroll', 'ar'), 'مرتب');
});

test('all current backend audit action and target values have bilingual labels', () => {
  const actions = ["invoice.issued","invoice.created","invoice.draft_updated","invoice.voided","payment.recorded","expense.created","customer.created","customer.updated","customer.deactivated","product.created","product.updated","product.deactivated","stock.movement_recorded","supplier.created","purchase_order.created","purchase_order.approved","purchase_order.received","sales_return.created","sales_return.approved","recurring_invoice_schedule.created","data_import.completed","pricing_rule.created","notification.queued","membership.role_changed","membership.removed","employee.created","employee.updated","payroll.created","payroll.updated","payroll.approved","payroll.paid","platform.business.activated","platform.business.deactivated","platform.user_role.granted","platform.user_role.revoked"];
  const targets = ["invoice","payment","expense","customer","product","supplier","stock_movement","purchase_order","sales_return","recurring_invoice_schedule","import_job","pricing_rule","business","notification","membership","employee","payroll"];
  for (const action of actions) {
    assert.notEqual(auditActionLabel(action, 'ar'), action, `Missing Arabic audit action label: ${action}`);
    assert.notEqual(auditActionLabel(action, 'en'), action, `Missing English audit action label: ${action}`);
  }
  for (const target of targets) {
    assert.notEqual(auditTargetLabel(target, 'ar'), target, `Missing Arabic audit target label: ${target}`);
    assert.notEqual(auditTargetLabel(target, 'en'), target, `Missing English audit target label: ${target}`);
  }
});
