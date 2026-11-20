/** Protects workspace state from late responses belonging to an older request. */
export class WorkspaceLoadGuard {
  private version = 0;

  /** Starts a request generation and invalidates every earlier generation. */
  begin(): number {
    this.version += 1;
    return this.version;
  }

  isLatest(version: number): boolean {
    return version === this.version;
  }

  /** Invalidates every pending request without starting a replacement request. */
  invalidate(): void {
    this.version += 1;
  }

  isCurrent(
    version: number,
    currentWorkspaceId: string | null | undefined,
    requestedWorkspaceId: string,
  ): boolean {
    return this.isLatest(version) && currentWorkspaceId === requestedWorkspaceId;
  }
}

export interface TenantRequestContext {
  workspaceId: string;
  userId: string | null;
  role: string | null;
  signedIn: boolean;
  customerId?: string;
  /** Auth observer generation captured when the request started. */
  authTransitionVersion?: number;
}

/** Validates that a delayed tenant-scoped response still belongs to the active identity and view. */
export function isCurrentTenantRequest(
  guard: WorkspaceLoadGuard,
  requestVersion: number,
  requested: TenantRequestContext,
  current: TenantRequestContext,
): boolean {
  return guard.isCurrent(requestVersion, current.workspaceId, requested.workspaceId)
    && requested.signedIn
    && current.signedIn
    && Boolean(requested.userId)
    && requested.userId === current.userId
    && requested.role !== null
    && requested.role === current.role
    && (requested.authTransitionVersion === undefined || requested.authTransitionVersion === current.authTransitionVersion)
    && (requested.customerId === undefined || requested.customerId === current.customerId);
}


export interface TenantRequestCallbacks<T> {
  onSuccess(value: T): void;
  onError(error: unknown): void;
  onFinally(): void;
  /** Runs only when this request is still the latest, but its identity/role context changed. */
  onStale?(): void;
}

/**
 * Runs a tenant-scoped async operation and permits state callbacks only while
 * its generation, workspace, authenticated UID, role, and signed-in state match.
 */
export async function runTenantScopedRequest<T>(
  guard: WorkspaceLoadGuard,
  requested: TenantRequestContext,
  currentContext: () => TenantRequestContext,
  operation: () => Promise<T>,
  callbacks: TenantRequestCallbacks<T>,
): Promise<void> {
  const requestVersion = guard.begin();
  const isCurrent = (): boolean =>
    isCurrentTenantRequest(guard, requestVersion, requested, currentContext());

  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await operation() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  try {
    if (isCurrent()) {
      if (outcome.ok) callbacks.onSuccess(outcome.value);
      else callbacks.onError(outcome.error);
    }
  } finally {
    if (isCurrent()) callbacks.onFinally();
    else if (guard.isLatest(requestVersion)) callbacks.onStale?.();
  }
}
