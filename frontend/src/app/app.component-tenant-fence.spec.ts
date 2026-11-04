import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCurrentTenantRequest,
  WorkspaceLoadGuard,
  type TenantRequestContext,
} from './workspace-load-guard.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

async function applyIfCurrent<T>(
  pending: Promise<T>,
  guard: WorkspaceLoadGuard,
  requestVersion: number,
  requested: TenantRequestContext,
  getCurrent: () => TenantRequestContext,
): Promise<T | null> {
  const value = await pending;
  return isCurrentTenantRequest(guard, requestVersion, requested, getCurrent()) ? value : null;
}

const ownerAuditContext: TenantRequestContext = {
  workspaceId: 'business-a',
  userId: 'uid-a',
  role: 'owner',
  signedIn: true,
};

test('rejects a delayed Audit result after UID changes inside the same workspace', async () => {
  const guard = new WorkspaceLoadGuard();
  const requestVersion = guard.begin();
  const pending = deferred<string>();
  let current = { ...ownerAuditContext, userId: 'uid-a' };

  const result = applyIfCurrent(pending.promise, guard, requestVersion, ownerAuditContext, () => current);
  current = { ...current, userId: 'uid-b' };
  pending.resolve('old audit data');

  assert.equal(await result, null);
});

test('rejects a delayed Audit result after OWNER access is revoked in the same workspace', async () => {
  const guard = new WorkspaceLoadGuard();
  const requestVersion = guard.begin();
  const pending = deferred<string>();
  let current = { ...ownerAuditContext };

  const result = applyIfCurrent(pending.promise, guard, requestVersion, ownerAuditContext, () => current);
  current = { ...current, role: 'staff' };
  pending.resolve('owner-only audit data');

  assert.equal(await result, null);
});

test('rejects a delayed Customer Statement result after selected customer changes', async () => {
  const guard = new WorkspaceLoadGuard();
  const requestVersion = guard.begin();
  const requested: TenantRequestContext = { ...ownerAuditContext, customerId: 'customer-a' };
  const pending = deferred<string>();
  let current: TenantRequestContext = { ...requested };

  const result = applyIfCurrent(pending.promise, guard, requestVersion, requested, () => current);
  current = { ...current, customerId: 'customer-b' };
  pending.resolve('statement for customer-a');

  assert.equal(await result, null);
});

test('rejects delayed tenant data after sign-out or workspace reset', async () => {
  const guard = new WorkspaceLoadGuard();
  const requestVersion = guard.begin();
  const pending = deferred<string>();
  let current: TenantRequestContext = { ...ownerAuditContext };

  const result = applyIfCurrent(pending.promise, guard, requestVersion, ownerAuditContext, () => current);
  current = { ...current, signedIn: false, userId: null };
  guard.invalidate();
  pending.resolve('private tenant data');

  assert.equal(await result, null);
});

test('accepts a delayed response only while identity, role, workspace, and customer context match', async () => {
  const guard = new WorkspaceLoadGuard();
  const requestVersion = guard.begin();
  const requested: TenantRequestContext = { ...ownerAuditContext, customerId: 'customer-a' };
  const current = { ...requested };

  assert.equal(isCurrentTenantRequest(guard, requestVersion, requested, current), true);
  assert.equal(isCurrentTenantRequest(guard, requestVersion, requested, { ...current, workspaceId: 'business-b' }), false);
  assert.equal(isCurrentTenantRequest(guard, requestVersion, requested, { ...current, signedIn: false }), false);
  assert.equal(isCurrentTenantRequest(guard, requestVersion, requested, { ...current, userId: null }), false);
});
