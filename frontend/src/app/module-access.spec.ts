import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessWorkspaceTab, isMobileMoreTab } from './module-access.ts';

test('workspace owners can access owner-only modules', () => {
  for (const tab of ['payments', 'employees', 'taxes', 'audit', 'integrity', 'health'] as const) {
    assert.equal(canAccessWorkspaceTab(tab, 'owner', false), true, tab);
  }
});

test('staff cannot access owner-only modules through direct navigation', () => {
  for (const tab of ['payments', 'employees', 'taxes', 'audit', 'integrity', 'health'] as const) {
    assert.equal(canAccessWorkspaceTab(tab, 'staff', true), false, tab);
  }
});

test('platform admin visibility follows the explicit availability flag', () => {
  assert.equal(canAccessWorkspaceTab('platform-admin', 'owner', false), false);
  assert.equal(canAccessWorkspaceTab('platform-admin', 'staff', false), false);
  assert.equal(canAccessWorkspaceTab('platform-admin', 'staff', true), true);
});

test('ordinary workspace modules remain available to staff', () => {
  for (const tab of ['overview', 'customers', 'products', 'invoices', 'expenses', 'assistant', 'reports', 'suppliers', 'purchases', 'recurring', 'notifications', 'release-guide'] as const) {
    assert.equal(canAccessWorkspaceTab(tab, 'staff', false), true, tab);
  }
});


test('mobile More active state covers every secondary tab and excludes primary tabs', () => {
  for (const tab of [
    'products', 'payments', 'expenses', 'employees', 'assistant', 'reports',
    'audit', 'platform-admin', 'release-guide', 'suppliers', 'purchases',
    'recurring', 'notifications', 'health', 'integrity', 'taxes',
  ] as const) {
    assert.equal(isMobileMoreTab(tab), true, tab);
  }
  for (const tab of ['overview', 'customers', 'invoices'] as const) {
    assert.equal(isMobileMoreTab(tab), false, tab);
  }
});
