import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('platform admin has a dedicated global user directory, separate from workspace memberships', () => {
  assert.match(source, /section === 'users' && canViewUsers/);
  assert.match(source, /All Firebase accounts/);
  assert.match(source, /membership\.business_name/);
  assert.match(source, /Platform Super Admin/);
  assert.match(apiSource, /\/api\/v1\/platform-admin\/users/);
});

test('platform role grants and revocations require a reason and cannot be self-administered', () => {
  assert.match(source, /canManagePlatformRoles/);
  assert.match(source, /hasMeaningfulPlatformAdminReason\(roleReason\)/);
  assert.match(source, /user\.subject === this\.access\?\.subject/);
  assert.match(source, /savePlatformRole\(\)/);
  assert.match(apiSource, /platformAdminChangeUserRole/);
});

test('the UI exposes only delegated roles and keeps root management out of band', () => {
  assert.match(source, /value="platform_viewer"/);
  assert.match(source, /value="workspace_operator"/);
  assert.match(source, /value="user_manager"/);
  assert.doesNotMatch(source, /value="platform_super_admin"/);
  assert.match(source, /Root access cannot be granted, changed, or revoked from this UI/);
  assert.match(source, /APPEND-ONLY ACCESS HISTORY/);
  assert.match(source, /identity-access-summary/);
  assert.match(source, /platformPermissionLabel/);
  assert.match(source, /canManageWorkspaceStatus/);
  assert.match(source, /Read-only access: you can inspect workspace status/);
});

test('the user directory supports narrow-screen scrolling and mobile navigation', () => {
  assert.match(source, /user-directory-table\{min-width:850px\}/);
  assert.match(source, /@media\(max-width:760px\)/);
});


test('platform activity audit uses the shared bilingual action and target labels', () => {
  assert.match(source, /auditActionLabel\(event\.action\)/);
  assert.match(source, /auditTargetLabel\(event\.target_type\)/);
});


test('platform role audit uses the shared bilingual action vocabulary', () => {
  assert.match(source, /auditActionLabel\(event\.action\)/);
  assert.doesNotMatch(source, /event\.action === 'platform\.user_role\.granted'/);
});


test('user directory distinguishes an empty directory from an exact-search miss', () => {
  assert.match(source, /userQuery\.trim\(\) \? t\('لا توجد حسابات مطابقة'/);
  assert.match(source, /No matching accounts/);
  assert.match(source, /No user accounts are registered yet/);
  assert.match(source, /Registered Firebase accounts will appear here when available/);
});
