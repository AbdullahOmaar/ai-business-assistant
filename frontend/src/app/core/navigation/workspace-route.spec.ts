import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WORKSPACE_TABS,
  WORKSPACE_BASE_PATH,
  resolveWorkspacePath,
  workspacePathFor,
  workspaceTabFromPathname,
  workspaceUrlFor,
} from './workspace-route.ts';

test('all existing workspace destinations have unique canonical URLs', () => {
  assert.equal(new Set(WORKSPACE_TABS).size, WORKSPACE_TABS.length);
  for (const tab of WORKSPACE_TABS) assert.equal(workspaceTabFromPathname(workspacePathFor(tab)), tab);
  assert.equal(workspacePathFor('overview'), WORKSPACE_BASE_PATH);
});

test('root, base path and trailing slash resolve to overview', () => {
  assert.equal(workspaceTabFromPathname('/'), 'overview');
  assert.equal(workspaceTabFromPathname('/workspace'), 'overview');
  assert.equal(workspaceTabFromPathname('/workspace/'), 'overview');
});

test('unknown, malformed and nested paths fail closed', () => {
  for (const path of [
    '/unknown', '/workspace/not-a-tab', '/workspace/customers/detail/1',
    '/workspace/%E0%A4%A', 'workspace/customers',
  ]) assert.equal(workspaceTabFromPathname(path), null, path);
});

test('matching is exact and encoded path separators cannot escape a destination', () => {
  assert.equal(workspaceTabFromPathname('/workspace/customer'), null);
  assert.equal(workspaceTabFromPathname('/workspace/platform-admin'), 'platform-admin');
  assert.equal(workspaceTabFromPathname('/workspace/customers%2F..%2Fteam'), null);
});

test('direct navigation applies the supplied access predicate', () => {
  const restricted = new Set(['payments', 'employees', 'taxes', 'audit', 'integrity', 'health', 'platform-admin']);
  const canAccess = (tab: (typeof WORKSPACE_TABS)[number]) => !restricted.has(tab);

  assert.deepEqual(resolveWorkspacePath('/workspace/customers', canAccess), {
    tab: 'customers', path: '/workspace/customers', status: 'matched',
  });
  assert.deepEqual(resolveWorkspacePath('/workspace/payments', canAccess), {
    tab: 'overview', path: '/workspace', status: 'forbidden',
  });
  assert.deepEqual(resolveWorkspacePath('/workspace/missing', canAccess), {
    tab: 'overview', path: '/workspace', status: 'not-found',
  });
});

test('URL builder preserves valid search and fragment context only', () => {
  assert.equal(
    workspaceUrlFor('customers', '?search=Ali&status=active', '#results'),
    '/workspace/customers?search=Ali&status=active#results',
  );
  assert.equal(workspaceUrlFor('overview', 'search=Ali', 'results'), '/workspace');
});
