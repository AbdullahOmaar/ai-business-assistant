import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKSPACE_MODULE_CATALOG, WORKSPACE_MODULE_GROUPS } from './workspace-module-catalog.ts';
import { canAccessWorkspaceTab, isMobileMoreTab } from './module-access.ts';

const visibleModules = (role: string, platformAdminAvailable: boolean) =>
  WORKSPACE_MODULE_CATALOG.filter(module => canAccessWorkspaceTab(module.tab, role, platformAdminAvailable));

test('the Home launcher catalogue has one unique entry for every existing workspace tab', () => {
  const tabs = WORKSPACE_MODULE_CATALOG.map(module => module.tab);
  assert.equal(tabs.length, 19);
  assert.equal(new Set(tabs).size, tabs.length, 'module destinations must not be duplicated');
  for (const module of WORKSPACE_MODULE_CATALOG) {
    assert.ok(module.titleAr.trim(), `${module.tab} needs an Arabic label`);
    assert.ok(module.titleEn.trim(), `${module.tab} needs an English label`);
    assert.ok(module.descriptionAr.trim(), `${module.tab} needs an Arabic description`);
    assert.ok(module.descriptionEn.trim(), `${module.tab} needs an English description`);
  }
});

test('workspace OWNER module count follows the central permission catalogue', () => {
  assert.equal(visibleModules('owner', false).length, 18);
  assert.equal(visibleModules('owner', true).length, 19);
  for (const tab of ['payments', 'employees', 'taxes', 'audit', 'integrity', 'health'] as const) {
    assert.ok(visibleModules('owner', false).some(module => module.tab === tab), tab);
  }
});

test('STAFF sees ordinary modules only and cannot discover owner-only modules through Home cards', () => {
  const staffModules = visibleModules('staff', false);
  assert.equal(staffModules.length, 12);
  for (const tab of ['payments', 'employees', 'taxes', 'audit', 'integrity', 'health', 'platform-admin'] as const) {
    assert.equal(staffModules.some(module => module.tab === tab), false, tab);
  }
  assert.ok(staffModules.some(module => module.tab === 'customers'));
  assert.ok(staffModules.some(module => module.tab === 'products'));
});

test('platform admin is listed only when its explicit availability flag is true', () => {
  assert.equal(visibleModules('owner', false).some(module => module.tab === 'platform-admin'), false);
  assert.equal(visibleModules('staff', true).some(module => module.tab === 'platform-admin'), true);
});

test('the More menu groups every secondary destination once and keeps dock destinations out', () => {
  const primaryTabs = ['overview', 'customers', 'invoices'];
  const secondaryModules = WORKSPACE_MODULE_CATALOG.filter(module => module.mobileGroup);
  assert.equal(secondaryModules.length, 16);
  assert.equal(WORKSPACE_MODULE_CATALOG.filter(module => !module.mobileGroup).length, 3);
  for (const tab of primaryTabs) {
    assert.equal(WORKSPACE_MODULE_CATALOG.find(module => module.tab === tab)?.mobileGroup, undefined);
  }
  for (const group of WORKSPACE_MODULE_GROUPS) {
    assert.ok(secondaryModules.some(module => module.mobileGroup === group.id), group.id);
  }
  assert.equal(new Set(secondaryModules.map(module => module.tab)).size, 16);
});

test('catalogue grouping and the mobile More active-state policy stay in sync', () => {
  for (const module of WORKSPACE_MODULE_CATALOG) {
    assert.equal(isMobileMoreTab(module.tab), Boolean(module.mobileGroup), module.tab);
  }
});

test('More menu visibility is derived from the same role policy as the Home catalogue', () => {
  const secondaryCount = (role: string, platformAdminAvailable: boolean) =>
    visibleModules(role, platformAdminAvailable).filter(module => module.mobileGroup).length;
  assert.equal(secondaryCount('staff', false), 9);
  assert.equal(secondaryCount('owner', false), 15);
  assert.equal(secondaryCount('owner', true), 16);
});
