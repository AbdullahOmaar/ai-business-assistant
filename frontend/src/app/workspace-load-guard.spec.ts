import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceLoadGuard } from './workspace-load-guard.ts';

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
