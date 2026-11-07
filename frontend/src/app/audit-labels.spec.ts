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
