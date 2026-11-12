import type { WorkspaceModuleTab } from './module-access';

export interface WorkspaceModuleCard {
  tab: WorkspaceModuleTab;
  icon: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
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
  titleAr: string;
  titleEn: string;
}

export const WORKSPACE_MODULE_GROUPS: readonly WorkspaceModuleGroup[] = [
  { id: 'products-purchasing', titleAr: 'المنتجات والمشتريات', titleEn: 'Products & purchasing' },
  { id: 'finance-reports', titleAr: 'المالية والتقارير', titleEn: 'Finance & reports' },
  { id: 'team-admin', titleAr: 'الفريق والإدارة', titleEn: 'Team & administration' },
  { id: 'monitoring-operations', titleAr: 'المتابعة والتشغيل', titleEn: 'Monitoring & operations' },
  { id: 'assistant-tools', titleAr: 'المساعد والأدوات', titleEn: 'Assistant & tools' },
];

/**
 * Data-only UI catalogue for the Home module launcher.
 * The consuming shell filters it through its existing canAccessTab policy;
 * this catalogue is never an authorization or security boundary.
 */
export const WORKSPACE_MODULE_CATALOG: readonly WorkspaceModuleCard[] = [
  { tab: 'overview', icon: '⌂', titleAr: 'الرئيسية', titleEn: 'Overview', descriptionAr: 'ملخص النشاط ومؤشرات العمل', descriptionEn: 'Business summary and activity' },
  { tab: 'customers', icon: '♧', titleAr: 'العملاء', titleEn: 'Customers', descriptionAr: 'سجلات العملاء وبيانات التواصل', descriptionEn: 'Customer records and contact details' },
  { tab: 'products', mobileGroup: 'products-purchasing', icon: '◇', titleAr: 'المنتجات والمخزون', titleEn: 'Products & inventory', descriptionAr: 'كتالوج المنتجات ومعلومات المخزون', descriptionEn: 'Product catalogue and stock information' },
  { tab: 'invoices', icon: '▤', titleAr: 'الفواتير', titleEn: 'Invoices', descriptionAr: 'إنشاء ومراجعة فواتير المبيعات', descriptionEn: 'Create and review sales invoices' },
  { tab: 'payments', mobileGroup: 'finance-reports', icon: '↗', titleAr: 'المدفوعات والتحصيل', titleEn: 'Payments & collections', descriptionAr: 'تسجيل ومراجعة التحصيلات', descriptionEn: 'Record and review collections' },
  { tab: 'expenses', mobileGroup: 'finance-reports', icon: '−', titleAr: 'المصروفات', titleEn: 'Expenses', descriptionAr: 'تسجيل ومراجعة المصروفات', descriptionEn: 'Record and review expenses' },
  { tab: 'employees', mobileGroup: 'team-admin', icon: '♙', titleAr: 'الموظفون والمرتبات', titleEn: 'Employees & payroll', descriptionAr: 'ملفات الموظفين وسجلات المرتبات', descriptionEn: 'Employee records and payroll' },
  { tab: 'assistant', mobileGroup: 'assistant-tools', icon: '✦', titleAr: 'المساعد الذكي', titleEn: 'AI assistant', descriptionAr: 'اسأل عن بيانات نشاطك', descriptionEn: 'Ask about your business data' },
  { tab: 'reports', mobileGroup: 'finance-reports', icon: '∑', titleAr: 'نتيجة التشغيل الأولية', titleEn: 'Preliminary operating result', descriptionAr: 'نتيجة مبدئية للإيرادات والمصروفات مع توضيح حدود التقرير', descriptionEn: 'Preliminary result from issued invoices and expenses, with limitations disclosed' },
  { tab: 'taxes', mobileGroup: 'finance-reports', icon: '%', titleAr: 'ملخص الضرائب', titleEn: 'Tax summary', descriptionAr: 'ملخص ضريبي للقراءة فقط', descriptionEn: 'Read-only tax summary' },
  { tab: 'audit', mobileGroup: 'monitoring-operations', icon: '◷', titleAr: 'سجل العمليات', titleEn: 'Activity log', descriptionAr: 'مراجعة أحداث النشاط', descriptionEn: 'Review business activity events' },
  { tab: 'integrity', mobileGroup: 'monitoring-operations', icon: '⚑', titleAr: 'سلامة البيانات', titleEn: 'Data integrity', descriptionAr: 'مراجعة مؤشرات سلامة البيانات', descriptionEn: 'Review data integrity indicators' },
  { tab: 'release-guide', mobileGroup: 'assistant-tools', icon: 'ⓘ', titleAr: 'دليل التطبيق والإصدارات', titleEn: 'App guide & versions', descriptionAr: 'الخصائص المتاحة وسجل الإصدارات', descriptionEn: 'Available features and release history' },
  { tab: 'platform-admin', mobileGroup: 'team-admin', icon: '◇', titleAr: 'إدارة المنصة', titleEn: 'Platform admin', descriptionAr: 'أدوات الإدارة المصرح بها', descriptionEn: 'Authorized platform tools' },
  { tab: 'suppliers', mobileGroup: 'products-purchasing', icon: '▣', titleAr: 'الموردون', titleEn: 'Suppliers', descriptionAr: 'ملفات الموردين', descriptionEn: 'Supplier records' },
  { tab: 'purchases', mobileGroup: 'products-purchasing', icon: '⇩', titleAr: 'المشتريات', titleEn: 'Purchasing', descriptionAr: 'أوامر الشراء والاستلام', descriptionEn: 'Purchase orders and receiving' },
  { tab: 'recurring', mobileGroup: 'finance-reports', icon: '↻', titleAr: 'الفواتير الدورية', titleEn: 'Recurring invoices', descriptionAr: 'جداول الفوترة الدورية', descriptionEn: 'Recurring billing schedules' },
  { tab: 'notifications', mobileGroup: 'monitoring-operations', icon: '♢', titleAr: 'الإشعارات', titleEn: 'Notifications', descriptionAr: 'قائمة الإشعارات وحالاتها', descriptionEn: 'Notification queue and statuses' },
  { tab: 'health', mobileGroup: 'monitoring-operations', icon: '♥', titleAr: 'الحالة التشغيلية', titleEn: 'Operational health', descriptionAr: 'مؤشرات الحالة التشغيلية', descriptionEn: 'Operational health indicators' },
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
