export type WorkspaceModuleTab =
  | 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'expenses'
  | 'employees' | 'assistant' | 'reports' | 'taxes' | 'audit' | 'integrity'
  | 'release-guide' | 'platform-admin' | 'suppliers' | 'purchases' | 'recurring'
  | 'notifications' | 'health';

const OWNER_ONLY_TABS = new Set<WorkspaceModuleTab>([
  'payments', 'employees', 'taxes', 'audit', 'integrity', 'health',
]);

export function canAccessWorkspaceTab(
  tab: WorkspaceModuleTab,
  role: string | null | undefined,
  platformAdminAvailable: boolean,
): boolean {
  if (OWNER_ONLY_TABS.has(tab)) return role === 'owner';
  if (tab === 'platform-admin') return platformAdminAvailable;
  return true;
}
