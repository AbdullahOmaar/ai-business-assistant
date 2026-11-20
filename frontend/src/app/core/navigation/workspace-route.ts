/**
 * Canonical URL mapping for the existing AIBA workspace destinations.
 *
 * Framework-agnostic by design: domain screens can adopt stable URLs without
 * coupling route parsing to Angular or changing their current component state.
 * This is presentation navigation only; API authorization remains authoritative.
 */
export const WORKSPACE_TABS = [
  'overview', 'customers', 'products', 'invoices', 'payments', 'expenses',
  'employees', 'assistant', 'reports', 'taxes', 'audit', 'integrity',
  'release-guide', 'platform-admin', 'suppliers', 'purchases', 'recurring',
  'notifications', 'health', 'team',
] as const;

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
export const WORKSPACE_BASE_PATH = '/workspace';

const WORKSPACE_TAB_SET: ReadonlySet<string> = new Set(WORKSPACE_TABS);

export type WorkspaceRouteResolution =
  | { tab: WorkspaceTab; path: string; status: 'matched' }
  | { tab: 'overview'; path: string; status: 'not-found' | 'forbidden' };

/** Stable, shareable path for a known workspace destination. */
export function workspacePathFor(tab: WorkspaceTab): string {
  return tab === 'overview' ? WORKSPACE_BASE_PATH : `${WORKSPACE_BASE_PATH}/${tab}`;
}

/** Resolve only pathname; query parameters and fragments are caller-owned context. */
export function workspaceTabFromPathname(pathname: string): WorkspaceTab | null {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null;

  const normalized = pathname.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  if (normalized === '/' || normalized === WORKSPACE_BASE_PATH) return 'overview';

  const prefix = `${WORKSPACE_BASE_PATH}/`;
  if (!normalized.startsWith(prefix)) return null;

  const segment = normalized.slice(prefix.length);
  if (!segment || segment.includes('/')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }

  return WORKSPACE_TAB_SET.has(decoded) ? (decoded as WorkspaceTab) : null;
}

/**
 * Apply the shell's existing access predicate to direct URLs.
 * A denied path resolves to overview; this is not a security boundary.
 */
export function resolveWorkspacePath(
  pathname: string,
  canAccess: (tab: WorkspaceTab) => boolean,
): WorkspaceRouteResolution {
  const tab = workspaceTabFromPathname(pathname);
  if (!tab) return { tab: 'overview', path: workspacePathFor('overview'), status: 'not-found' };
  if (!canAccess(tab)) return { tab: 'overview', path: workspacePathFor('overview'), status: 'forbidden' };
  return { tab, path: workspacePathFor(tab), status: 'matched' };
}

/** Change destination while retaining valid search/hash context. */
export function workspaceUrlFor(tab: WorkspaceTab, search = '', hash = ''): string {
  const safeSearch = search.startsWith('?') ? search : '';
  const safeHash = hash.startsWith('#') ? hash : '';
  return `${workspacePathFor(tab)}${safeSearch}${safeHash}`;
}
