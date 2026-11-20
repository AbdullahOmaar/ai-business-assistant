import assert from 'node:assert/strict';
import test from 'node:test';
import { auditActionLabel, auditTargetLabel } from './audit-labels.ts';

test('known audit actions resolve to translation dictionary keys', () => {
  assert.match(auditActionLabel('invoice.issued'), /^audit\.actions\.m_/);
  assert.match(auditActionLabel('purchase_order.received'), /^audit\.actions\.m_/);
  assert.match(auditActionLabel('notification.queued'), /^audit\.actions\.m_/);
});

test('known audit targets resolve to translation dictionary keys', () => {
  assert.match(auditTargetLabel('purchase_order'), /^audit\.targets\.m_/);
  assert.match(auditTargetLabel('employee'), /^audit\.targets\.m_/);
});

test('unknown future backend values remain visible', () => {
  assert.equal(auditActionLabel('custom.future.action'), 'custom.future.action');
  assert.equal(auditTargetLabel('custom_future_target'), 'custom_future_target');
});
