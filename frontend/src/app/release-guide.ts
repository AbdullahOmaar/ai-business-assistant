/**
 * User-facing feature catalog and release history.
 *
 * This is the single source used by the in-app "App guide & versions" page.
 * Update it whenever a versioned release is prepared, and list only features
 * that exist in the corresponding shipped code. Mention role/setup restrictions.
 */
export const FEATURE_CATALOG = [
  {
    id: 'workspace',
    titleAr: 'مساحة العمل ولوحة المتابعة',
    titleEn: 'Workspace & overview',
    noteAr: 'كل مساحة عمل لها بياناتها وإعداداتها وصلاحياتها.',
    noteEn: 'Each workspace has its own data, settings, and permissions.',
    features: [
      {
        titleAr: 'ملخص النشاط',
        titleEn: 'Business overview',
        detailAr: 'تابع المبيعات والتحصيلات والمصروفات والأرصدة المستحقة.',
        detailEn: 'Review sales, collected payments, expenses, and outstanding balances.',
      },
      {
        titleAr: 'فصل العملات',
        titleEn: 'Separate currencies',
        detailAr: 'تُعرض الإجماليات لكل عملة على حدة ولا تُجمع العملات المختلفة.',
        detailEn: 'Totals stay separate by currency; unlike currencies are never added together.',
      },
    ],
  },
  {
    id: 'customers',
    titleAr: 'العملاء',
    titleEn: 'Customers',
    noteAr: 'بيانات العميل مرتبطة بالفواتير والدفعات التي تخصه.',
    noteEn: 'Customer records are linked to their invoices and payments.',
    features: [
      {
        titleAr: 'إدارة العملاء',
        titleEn: 'Customer records',
        detailAr: 'أضف العملاء وراجع بياناتهم وسجلاتهم المرتبطة بالنشاط.',
        detailEn: 'Add customers and review their details and related activity.',
      },
      {
        titleAr: 'كشف حساب العميل',
        titleEn: 'Customer statement',
        detailAr: 'راجع الحركات والأرصدة حسب العملة والفترة.',
        detailEn: 'Review transactions and balances by currency and period.',
      },
    ],
  },
  {
    id: 'products',
    titleAr: 'المنتجات والمخزون',
    titleEn: 'Products & inventory',
    noteAr: 'فعّل متابعة المخزون للأصناف التي لها كمية فعلية فقط؛ الخدمات لا تحتاج إلى كمية مخزنية.',
    noteEn: 'Track stock only for items with physical quantities; services do not need stock quantities.',
    features: [
      {
        titleAr: 'منتجات وخدمات',
        titleEn: 'Products and services',
        detailAr: 'سجّل الاسم وسعر الوحدة وحدد هل الصنف مخزني أم غير مخزني.',
        detailEn: 'Save item names and unit prices, and choose stock-tracked or non-stock.',
      },
      {
        titleAr: 'رصيد المخزون',
        titleEn: 'Stock balance',
        detailAr: 'للصنف المخزني، أضف رصيد البداية وشاهد الكمية الناتجة عن حركات المخزون.',
        detailEn: 'For stock-tracked items, enter opening stock and view quantity derived from stock movements.',
      },
      {
        titleAr: 'حماية الكمية',
        titleEn: 'Stock validation',
        detailAr: 'إصدار الفاتورة يخصم الكمية المتابعة ويرفض الإصدار عند عدم كفاية الرصيد.',
        detailEn: 'Issuing an invoice deducts tracked stock and is rejected when stock is insufficient.',
      },
      {
        titleAr: 'استيراد المنتجات',
        titleEn: 'Product import',
        detailAr: 'استورد المنتجات من CSV مع معاينة الأخطاء قبل الحفظ.',
        detailEn: 'Import products from CSV and preview errors before saving.',
      },
    ],
  },
  {
    id: 'invoices',
    titleAr: 'المبيعات والفواتير',
    titleEn: 'Sales & invoices',
    noteAr: 'الخادم هو المرجع النهائي لحساب الإجماليات والتحقق من الفاتورة.',
    noteEn: 'The server is the source of truth for invoice totals and validation.',
    features: [
      {
        titleAr: 'مسودة متعددة البنود',
        titleEn: 'Multi-line draft',
        detailAr: 'أنشئ مسودة، وأضف أو احذف البنود وحدد الكمية.',
        detailEn: 'Create a draft, add or remove lines, and enter quantities.',
      },
      {
        titleAr: 'الخصم والضريبة',
        titleEn: 'Discounts and tax',
        detailAr: 'راجع المعاينة، ويعيد الخادم حساب الإجمالي النهائي.',
        detailEn: 'Preview discounts and tax; the server recalculates the final total.',
      },
      {
        titleAr: 'إصدار وإلغاء الفاتورة',
        titleEn: 'Issue and void',
        detailAr: 'تُطبّق قواعد حالة الفاتورة والصلاحيات قبل تنفيذ العملية.',
        detailEn: 'Invoice state and permissions are checked before the action is applied.',
      },
    ],
  },
  {
    id: 'payments',
    titleAr: 'المدفوعات والتحصيل',
    titleEn: 'Payments & collections',
    noteAr: 'تسجيل المدفوعات متاح لمالك مساحة العمل، وتظل قواعد الخادم هي المرجع.',
    noteEn: 'Payment recording is available to workspace owners; server validation remains authoritative.',
    features: [
      {
        titleAr: 'تسجيل دفعة',
        titleEn: 'Record a payment',
        detailAr: 'سجّل المبلغ والعميل وطريقة الدفع والمرجع الاختياري.',
        detailEn: 'Record amount, customer, payment method, and optional reference.',
      },
      {
        titleAr: 'سداد الفاتورة',
        titleEn: 'Pay an invoice',
        detailAr: 'انتقل من الفاتورة إلى السداد مع تعبئة الرصيد المتبقي، ويمكن السداد جزئيًا.',
        detailEn: 'Start from an invoice with the outstanding amount filled in; partial payments are supported.',
      },
      {
        titleAr: 'مطابقة الدفعة',
        titleEn: 'Payment allocation',
        detailAr: 'يتحقق النظام من العميل والعملة والرصيد ويمنع تسجيل العملية مرتين بالمفتاح نفسه.',
        detailEn: 'The system checks customer, currency, and balance and prevents duplicate processing with the same idempotency key.',
      },
    ],
  },
  {
    id: 'finance',
    titleAr: 'المصروفات والتقارير',
    titleEn: 'Expenses & reports',
    noteAr: 'نتيجة الأرباح والخسائر المعروضة مبدئية ما دامت تكلفة البضاعة غير مرتبطة بالكامل بالمبيعات.',
    noteEn: 'Profit/loss is preliminary while cost of goods sold is not fully linked to sales.',
    features: [
      {
        titleAr: 'تسجيل المصروفات',
        titleEn: 'Record expenses',
        detailAr: 'سجّل التصنيف والوصف والمبلغ والعملة والتاريخ.',
        detailEn: 'Record category, description, amount, currency, and date.',
      },
      {
        titleAr: 'الأرباح والخسائر',
        titleEn: 'Profit & loss',
        detailAr: 'راجع الإيرادات والمصروفات حسب الفترة والعملة، مع توضيح حدود التقرير.',
        detailEn: 'Review revenue and expenses by period and currency, with report limitations shown.',
      },
      {
        titleAr: 'الأرصدة المستحقة',
        titleEn: 'Receivables aging',
        detailAr: 'تابع الفواتير المستحقة حسب مدة التأخير، ويمكن تصدير التقرير إلى CSV.',
        detailEn: 'Review outstanding invoices by age and export the report to CSV.',
      },
    ],
  },
  {
    id: 'assistant',
    titleAr: 'المساعد الذكي',
    titleEn: 'AI assistant',
    noteAr: 'توفّره يعتمد على إعداد خدمة الذكاء الاصطناعي على الخادم.',
    noteEn: 'Availability depends on the AI service being configured on the backend.',
    features: [
      {
        titleAr: 'أسئلة عن النشاط',
        titleEn: 'Ask about the business',
        detailAr: 'اسأل عن السجلات الحديثة، وتظهر المصادر المرتبطة عندما تكون متاحة.',
        detailEn: 'Ask about recent records; linked sources are shown when available.',
      },
    ],
  },
  {
    id: 'admin',
    titleAr: 'الإدارة وسجل العمليات',
    titleEn: 'Administration & activity log',
    noteAr: 'تظهر أدوات الإدارة حسب صلاحية الحساب؛ إدارة المنصة ليست متاحة لكل المستخدمين.',
    noteEn: 'Administrative tools depend on account permissions; platform administration is restricted.',
    features: [
      {
        titleAr: 'سجل العمليات',
        titleEn: 'Activity log',
        detailAr: 'راجع سجل النشاط المتاح لصلاحية مالك مساحة العمل.',
        detailEn: 'Review activity entries available to workspace owners.',
      },
      {
        titleAr: 'إدارة المنصة',
        titleEn: 'Platform administration',
        detailAr: 'قسم مستقل للمسؤولين المصرح لهم بإدارة المنصة.',
        detailEn: 'A separate area for authorized platform administrators.',
      },
    ],
  },
] as const;

export const RELEASE_HISTORY = [
  {
    version: '1.3.3',
    titleAr: 'تحسين موثوقية البناء والإصدار',
    titleEn: 'Build and release reliability',
    changesAr: [
      'إصلاح اختبار بيانات الإصدار ليعمل مع بناء الواجهة من جذر Vercel أو من الريبو الكامل.',
      'الحفاظ على التحقق من تطابق إصدار الواجهة وواجهة API في بيئة الاختبارات الكاملة.',
    ],
    changesEn: [
      'Fixed release-metadata tests for both Vercel frontend-root and full-repository builds.',
      'Preserved frontend/API version-parity checks in full-repository validation.',
    ],
  },
  {
    version: '1.3.2',
    titleAr: 'تقوية الصلاحيات وسلامة العمليات',
    titleEn: 'Authorization and workflow integrity hardening',
    changesAr: [
      'تقوية صلاحيات إدارة المنصة وعزل مساحات العمل والتحقق قبل حفظ التغييرات.',
      'تأمين تصدير CSV وسجل العمليات ومعالجة حالات فشل المعاملات.',
      'توحيد بيانات إصدار الواجهة وواجهة API وتحسين تحديث ذاكرة PWA.',
    ],
    changesEn: [
      'Hardened Platform Admin permissions, workspace isolation, and pre-write authorization.',
      'Strengthened CSV export and audit integrity, including transaction-failure handling.',
      'Aligned frontend/API release metadata and versioned the PWA shell cache.',
    ],
  },
  {
    version: '1.3.1',
    titleAr: 'تحديث إصدار الصيانة',
    titleEn: 'Maintenance release update',
    changesAr: [
      'تحديث رقم إصدار الواجهة وواجهة API إلى 1.3.1 مع الحفاظ على خصائص الإصدار السابق.',
    ],
    changesEn: [
      'Updated the frontend and API release version to 1.3.1 while preserving the previous release features.',
    ],
  },
  {
    version: '1.3.0',
    titleAr: 'السداد والمخزون ودليل التطبيق',
    titleEn: 'Payments, stock, and app guide',
    changesAr: [
      'زر سداد من الفاتورة مع تعبئة الرصيد المستحق ودعم السداد الجزئي.',
      'إدخال الكمية الافتتاحية وعرض رصيد الصنف المخزني؛ الخدمات تظل غير مخزنية.',
      'صفحة داخل التطبيق تجمع الخصائص وسجل الإصدارات بالعربية والإنجليزية.',
    ],
    changesEn: [
      'Pay directly from an invoice with the outstanding balance prefilled and partial payment supported.',
      'Enter opening quantities and view stock balances; services remain non-stock items.',
      'An in-app Arabic/English guide lists current features and version changes.',
    ],
  },
  {
    version: '1.2.1',
    titleAr: 'تحسينات المحاسبة وسلامة العمليات',
    titleEn: 'Accounting and workflow improvements',
    changesAr: [
      'تقوية التحقق من المخزون وتوحيد تقريب بنود الفاتورة وإجمالياتها.',
      'تحسين تسجيل الدفعات ورسائل تحديث البيانات لتقليل خطر إعادة تسجيل دفعة ناجحة.',
      'تقييد إصدار الفاتورة وإلغائها بصلاحية المالك، مع توضيح معلومات إصدار الواجهة وواجهة API.',
    ],
    changesEn: [
      'Strengthened stock validation and aligned invoice line and total rounding.',
      'Improved payment feedback and refresh handling to reduce accidental duplicate submissions.',
      'Restricted invoice issue/void to owners and clarified UI/API release information.',
    ],
  },
  {
    version: '1.2.0',
    titleAr: 'أساس إدارة النشاط والفواتير',
    titleEn: 'Business and invoicing foundation',
    changesAr: [
      'إدارة العملاء والمنتجات، وإنشاء مسودات الفواتير وإصدارها.',
      'تسجيل الدفعات والمصروفات وتقارير مالية تفصل المبالغ حسب العملة.',
      'بدء متابعة المخزون وحركاته واستيراد المنتجات من CSV.',
    ],
    changesEn: [
      'Customer and product management, with invoice drafts and issuing.',
      'Payment and expense recording, with financial reports separated by currency.',
      'Initial stock movement tracking and product CSV import.',
    ],
  },
  {
    version: '1.0.0',
    titleAr: 'الفواتير على الموبايل',
    titleEn: 'Mobile invoicing',
    changesAr: [
      'محرر مسودة فاتورة متعددة البنود مناسب للموبايل.',
      'معاينة الإجماليات والخصم والضريبة قبل الحفظ.',
    ],
    changesEn: [
      'A mobile-friendly multi-line invoice draft editor.',
      'Preview totals, discounts, and tax before saving.',
    ],
  },
] as const;
