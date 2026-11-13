import type { WorkspaceModuleTab } from './module-access';

export interface WorkspaceModuleCard {
  tab: WorkspaceModuleTab;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  mobileGroup?: WorkspaceModuleGroupId;
}

export type WorkspaceModuleGroupId =
  | 'products-purchasing'
  | 'finance-reports'
  | 'team-admin'
  | 'monitoring-operations'
  | 'assistant-tools';

export interface WorkspaceModuleGroup {
  id: WorkspaceModuleGroupId;
  titleKey: string;
}

export const WORKSPACE_MODULE_GROUPS: readonly WorkspaceModuleGroup[] = [
  { id: 'products-purchasing', titleKey: "catalog.m_1341u8e" },
  { id: 'finance-reports', titleKey: "catalog.m_2h49lq" },
  { id: 'team-admin', titleKey: "catalog.m_8ogsj9" },
  { id: 'monitoring-operations', titleKey: "catalog.m_lkukj5" },
  { id: 'assistant-tools', titleKey: "catalog.m_18paotq" },
];

/**
 * Data-only UI catalogue for the Home module launcher.
 * The consuming shell filters it through its existing canAccessTab policy;
 * this catalogue is never an authorization or security boundary.
 */
export const WORKSPACE_MODULE_CATALOG: readonly WorkspaceModuleCard[] = [
  { tab: 'overview', icon: '⌂', titleKey: "catalog.m_19e7wuq", descriptionKey: "catalog.m_1yqmwns" },
  { tab: 'customers', icon: '♧', titleKey: "catalog.m_tvy79l", descriptionKey: "catalog.m_1aovv4u" },
  { tab: 'products', mobileGroup: 'products-purchasing', icon: '◇', titleKey: "catalog.m_xpe4pk", descriptionKey: "catalog.m_1r6s0dd" },
  { tab: 'invoices', icon: '▤', titleKey: "catalog.m_1h7f08p", descriptionKey: "catalog.m_1qb7a9x" },
  { tab: 'payments', mobileGroup: 'finance-reports', icon: '↗', titleKey: "catalog.m_y1gowi", descriptionKey: "catalog.m_1uighj4" },
  { tab: 'expenses', mobileGroup: 'finance-reports', icon: '−', titleKey: "catalog.m_l71hva", descriptionKey: "catalog.m_1wkl48e" },
  { tab: 'employees', mobileGroup: 'team-admin', icon: '♙', titleKey: "catalog.m_4h0vw6", descriptionKey: "catalog.m_y7tfpx" },
  { tab: 'assistant', mobileGroup: 'assistant-tools', icon: '✦', titleKey: "catalog.m_dzn3ev", descriptionKey: "catalog.m_3pvkiv" },
  { tab: 'reports', mobileGroup: 'finance-reports', icon: '∑', titleKey: "catalog.m_1k2jewg", descriptionKey: "catalog.m_3v76d2" },
  { tab: 'taxes', mobileGroup: 'finance-reports', icon: '%', titleKey: "catalog.m_nxo405", descriptionKey: "catalog.m_18eozy2" },
  { tab: 'audit', mobileGroup: 'monitoring-operations', icon: '◷', titleKey: "catalog.m_hd46sj", descriptionKey: "catalog.m_xa1dp8" },
  { tab: 'integrity', mobileGroup: 'monitoring-operations', icon: '⚑', titleKey: "catalog.m_shdbnl", descriptionKey: "catalog.m_1731gqj" },
  { tab: 'release-guide', mobileGroup: 'assistant-tools', icon: 'ⓘ', titleKey: "catalog.m_a3qirn", descriptionKey: "catalog.m_vfwvgm" },
  { tab: 'platform-admin', mobileGroup: 'team-admin', icon: '◇', titleKey: "catalog.m_1gkme2m", descriptionKey: "catalog.m_qchn6g" },
  { tab: 'suppliers', mobileGroup: 'products-purchasing', icon: '▣', titleKey: "catalog.m_1yzd6rs", descriptionKey: "catalog.m_vhqn8a" },
  { tab: 'purchases', mobileGroup: 'products-purchasing', icon: '⇩', titleKey: "catalog.m_s8z24b", descriptionKey: "catalog.m_10k7813" },
  { tab: 'recurring', mobileGroup: 'finance-reports', icon: '↻', titleKey: "catalog.m_11lck86", descriptionKey: "catalog.m_1tqh38n" },
  { tab: 'notifications', mobileGroup: 'monitoring-operations', icon: '♢', titleKey: "catalog.m_vlrg7", descriptionKey: "catalog.m_14nrzc4" },
  { tab: 'health', mobileGroup: 'monitoring-operations', icon: '♥', titleKey: "catalog.m_18z2l5z", descriptionKey: "catalog.m_j8aadc" },
];

/** Canonical high-value Home shortcuts; navigation still exposes every authorized destination. */
export const HOME_QUICK_ACCESS_TABS: readonly WorkspaceModuleTab[] = [
  'invoices',
  'customers',
  'products',
  'expenses',
  'reports',
];

/** Selects only the approved Home shortcuts, in a stable product-defined order. */
export function selectHomeQuickAccessModules(
  modules: readonly WorkspaceModuleCard[],
): readonly WorkspaceModuleCard[] {
  const byTab = new Map(modules.map(module => [module.tab, module] as const));
  return HOME_QUICK_ACCESS_TABS.flatMap(tab => {
    const module = byTab.get(tab);
    return module ? [module] : [];
  });
}

/** Filters a pre-authorized module list by bilingual names and descriptions. */
export function filterWorkspaceModules(
  modules: readonly WorkspaceModuleCard[],
  query: string,
  locale: string,
): readonly WorkspaceModuleCard[] {
  const normalizedQuery = query.trim().normalize('NFKC').toLocaleLowerCase(locale);
  if (!normalizedQuery) return modules;
  return modules.filter(module =>
    `${module.titleAr} ${module.titleEn} ${module.descriptionAr} ${module.descriptionEn}`
      .normalize('NFKC')
      .toLocaleLowerCase(locale)
      .includes(normalizedQuery),
  );
}
