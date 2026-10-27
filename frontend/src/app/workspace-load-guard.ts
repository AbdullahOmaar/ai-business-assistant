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
