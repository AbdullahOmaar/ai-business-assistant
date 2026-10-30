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
    && (requested.customerId === undefined || requested.customerId === current.customerId);
}
