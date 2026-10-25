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

  isCurrent(
    version: number,
    currentWorkspaceId: string | null | undefined,
    requestedWorkspaceId: string,
  ): boolean {
    return this.isLatest(version) && currentWorkspaceId === requestedWorkspaceId;
  }
}
