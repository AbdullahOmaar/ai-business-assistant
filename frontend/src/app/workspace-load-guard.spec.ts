import { describe, expect, it } from 'vitest';
import { WorkspaceLoadGuard } from './workspace-load-guard';

describe('WorkspaceLoadGuard', () => {
  it('accepts only the newest request generation', () => {
    const guard = new WorkspaceLoadGuard();
    const older = guard.begin();
    const newer = guard.begin();

    expect(guard.isLatest(older)).toBe(false);
    expect(guard.isLatest(newer)).toBe(true);
  });

  it('rejects a response when the selected workspace changed', () => {
    const guard = new WorkspaceLoadGuard();
    const request = guard.begin();

    expect(guard.isCurrent(request, 'workspace-b', 'workspace-a')).toBe(false);
    expect(guard.isCurrent(request, 'workspace-a', 'workspace-a')).toBe(true);
  });

  it('rejects the previous response after a newer request starts for the same workspace', () => {
    const guard = new WorkspaceLoadGuard();
    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first, 'workspace-a', 'workspace-a')).toBe(false);
    expect(guard.isCurrent(second, 'workspace-a', 'workspace-a')).toBe(true);
  });

  it('rejects responses when no workspace is selected', () => {
    const guard = new WorkspaceLoadGuard();
    const request = guard.begin();

    expect(guard.isCurrent(request, null, 'workspace-a')).toBe(false);
  });
});
