import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentTenantRequest, WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard.ts';

test('accepts only the newest request generation', () => {
  const guard = new WorkspaceLoadGuard();
  const older = guard.begin();
  const newer = guard.begin();

  assert.equal(guard.isLatest(older), false);
  assert.equal(guard.isLatest(newer), true);
});

test('rejects a response when the selected workspace changed', () => {
  const guard = new WorkspaceLoadGuard();
  const request = guard.begin();

  assert.equal(guard.isCurrent(request, 'workspace-b', 'workspace-a'), false);
  assert.equal(guard.isCurrent(request, 'workspace-a', 'workspace-a'), true);
});

test('rejects the previous response after a newer request starts for the same workspace', () => {
  const guard = new WorkspaceLoadGuard();
  const first = guard.begin();
  const second = guard.begin();

  assert.equal(guard.isCurrent(first, 'workspace-a', 'workspace-a'), false);
  assert.equal(guard.isCurrent(second, 'workspace-a', 'workspace-a'), true);
});

test('rejects responses when no workspace is selected', () => {
  const guard = new WorkspaceLoadGuard();
  const request = guard.begin();

  assert.equal(guard.isCurrent(request, null, 'workspace-a'), false);
});


test('invalidates a pending request when workspace state is cleared', () => {
  const guard = new WorkspaceLoadGuard();
  const request = guard.begin();

  guard.invalidate();

  assert.equal(guard.isLatest(request), false);
  assert.equal(guard.isCurrent(request, 'workspace-a', 'workspace-a'), false);
});


test('invalidates a pending same-workspace request when the authenticated identity changes', () => {
  const guard = new WorkspaceLoadGuard();
  const request = guard.begin();

  // Auth identity transitions clear workspace state even when both users share a business.
  guard.invalidate();

  assert.equal(guard.isCurrent(request, 'shared-business', 'shared-business'), false);
});

test('invalidates a pending same-workspace request when owner access is revoked', () => {
  const guard = new WorkspaceLoadGuard();
  const request = guard.begin();

  // Role transitions invalidate requests before the refreshed membership is applied.
  guard.invalidate();

  assert.equal(guard.isCurrent(request, 'business-a', 'business-a'), false);
});



function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function requestContext(overrides: Partial<TenantRequestContext> = {}): TenantRequestContext {
  return {
    workspaceId: 'business-a',
    userId: 'user-a',
    role: 'owner',
    signedIn: true,
    ...overrides,
  };
}

test('discards stale chat success after workspace clear/switch', async () => {
  const guard = new WorkspaceLoadGuard();
  const requested = requestContext();
  const pending = deferred<string>();
  let successes = 0;
  let finalizations = 0;
  const run = runTenantScopedRequest(guard, requested, () => requestContext({ workspaceId: 'business-b' }),
    () => pending.promise, {
      onSuccess: () => { successes += 1; },
      onError: () => assert.fail('stale success path must not become an error'),
      onFinally: () => { finalizations += 1; },
    });
  guard.invalidate();
  pending.resolve('old workspace response');
  await run;
  assert.equal(successes, 0);
  assert.equal(finalizations, 0);
});

test('discards stale chat errors after logout without restoring the old draft', async () => {
  const guard = new WorkspaceLoadGuard();
  const requested = requestContext();
  const pending = deferred<string>();
  let restoredDraft = '';
  let errors = 0;
  const run = runTenantScopedRequest(guard, requested,
    () => requestContext({ signedIn: false, userId: null, role: null }),
    () => pending.promise, {
      onSuccess: () => assert.fail('logged-out request must not succeed'),
      onError: () => { errors += 1; restoredDraft = 'old question'; },
      onFinally: () => assert.fail('stale finally must not mutate state'),
      onStale: () => { restoredDraft = ''; },
    });
  pending.reject(new Error('late network failure'));
  await run;
  assert.equal(errors, 0);
  assert.equal(restoredDraft, '');
});

test('rejects a response when the same business is now authenticated by another UID', async () => {
  const guard = new WorkspaceLoadGuard();
  const requested = requestContext();
  const pending = deferred<string>();
  let accepted = false;
  let stale = false;
  const run = runTenantScopedRequest(guard, requested,
    () => requestContext({ userId: 'user-b' }),
    () => pending.promise, {
      onSuccess: () => { accepted = true; },
      onError: () => assert.fail('identity mismatch is stale, not a current request error'),
      onFinally: () => assert.fail('stale request must not finalize a newer identity'),
      onStale: () => { stale = true; },
    });
  pending.resolve('private response');
  await run;
  assert.equal(accepted, false);
  assert.equal(stale, true);
});

test('rejects a response after the workspace role changes', async () => {
  const guard = new WorkspaceLoadGuard();
  const requested = requestContext({ role: 'owner' });
  const pending = deferred<string>();
  let accepted = false;
  let stale = false;
  const run = runTenantScopedRequest(guard, requested,
    () => requestContext({ role: 'staff' }),
    () => pending.promise, {
      onSuccess: () => { accepted = true; },
      onError: () => assert.fail('role mismatch is stale, not a current request error'),
      onFinally: () => assert.fail('role mismatch must not run current finally'),
      onStale: () => { stale = true; },
    });
  pending.resolve('owner-only response');
  await run;
  assert.equal(accepted, false);
  assert.equal(stale, true);
});

test('an older request finally cannot clear a newer request loading state', async () => {
  const guard = new WorkspaceLoadGuard();
  const context = requestContext();
  const first = deferred<string>();
  const second = deferred<string>();
  let firstFinalized = 0;
  let secondFinalized = 0;
  const runFirst = runTenantScopedRequest(guard, context, () => context, () => first.promise, {
    onSuccess: () => assert.fail('superseded request must not succeed'),
    onError: () => assert.fail('superseded request must not fail current UI'),
    onFinally: () => { firstFinalized += 1; },
    onStale: () => { firstFinalized += 100; },
  });
  const runSecond = runTenantScopedRequest(guard, context, () => context, () => second.promise, {
    onSuccess: () => undefined,
    onError: () => assert.fail('current request should succeed'),
    onFinally: () => { secondFinalized += 1; },
  });
  first.resolve('old');
  await runFirst;
  assert.equal(firstFinalized, 0);
  second.resolve('new');
  await runSecond;
  assert.equal(secondFinalized, 1);
});

test('current chat failure invokes retry handler so the draft can be preserved', async () => {
  const guard = new WorkspaceLoadGuard();
  const context = requestContext();
  let draft = '';
  let finalized = 0;
  await runTenantScopedRequest(guard, context, () => context,
    () => Promise.reject(new Error('temporary network failure')), {
      onSuccess: () => assert.fail('failed request must not succeed'),
      onError: () => { draft = 'retry this question'; },
      onFinally: () => { finalized += 1; },
    });
  assert.equal(draft, 'retry this question');
  assert.equal(finalized, 1);
});


test('rejects a delayed workspace response after an auth transition for the same user and workspace', () => {
  const guard = new WorkspaceLoadGuard();
  const requested = {
    workspaceId: 'business-a', userId: 'owner-a', role: 'owner',
    signedIn: true, authTransitionVersion: 4,
  };
  const current = { ...requested, authTransitionVersion: 5 };
  assert.equal(isCurrentTenantRequest(guard, guard.begin(), requested, current), false);
});
