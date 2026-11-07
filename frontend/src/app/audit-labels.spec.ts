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
