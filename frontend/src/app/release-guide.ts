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
      {
        titleAr: 'تخطي إلى المحتوى الرئيسي',
        titleEn: 'Skip to main content',
        detailAr: 'داخل مساحة العمل، اضغط Tab لإظهار رابط ينقلك مباشرة إلى المحتوى الرئيسي.',
        detailEn: 'In a signed-in workspace, press Tab to reveal a link that moves keyboard focus directly to the main content.',
      },
      {
        titleAr: 'البحث في أقسام الموبايل',
        titleEn: 'Search mobile navigation',
        detailAr: 'ابحث من دليل الأقسام في الرئيسية أو افتح «المزيد» على الموبايل واكتب اسم القسم أو وصفه بالعربية أو الإنجليزية؛ النتائج تقتصر على الأقسام المتاحة لدورك الحالي.',
        detailEn: 'Search the Home module directory or open More on mobile and search by an Arabic or English module name or description; results include only destinations available to your current role.',
      },
      {
        titleAr: 'التنقل على الشاشات اللوحية',
        titleEn: 'Tablet navigation',
        detailAr: 'على الشاشات بعرض 761 إلى 900 بكسل، تتحول القائمة الجانبية إلى شريط أيقونات مضغوط لتوفير مساحة للمحتوى. تظهر أسماء الأقسام عند المرور بالمؤشر، وتظل متاحة لقارئات الشاشة؛ مرّر داخل الشريط للوصول إلى بقية الأقسام.',
        detailEn: 'At 761–900px widths, the sidebar becomes a compact icon rail to leave more room for content. Module names appear on hover and remain available to screen readers; scroll within the rail to reach the remaining sections.',
      },
      {
        titleAr: 'جداول التقارير والمراجعة', titleEn: 'Reporting and review tables',
        detailAr: 'أصبحت نتيجة التشغيل والملخص الضريبي وتقارير سلامة البيانات تعرض جداول واضحة مع إبقاء العملات منفصلة والمرتجعات والتخصيصات في تصنيفاتها الأصلية.',
        detailEn: 'Operating result, tax summary, and data-integrity findings now use clear tables while preserving separate currencies and the original classification of returns and allocations.',
      },
      {
        titleAr: 'شاشات التشغيل الأساسية', titleEn: 'Core operational record screens',
        detailAr: 'تم توحيد عرض المدفوعات والمصروفات والجداول الدورية والإشعارات وسجل العمليات باستخدام مكوّن الجداول المشترك؛ مع حقول واضحة على الموبايل والبحث وحالات التحميل والفراغ.',
        detailEn: 'Payments, expenses, recurring schedules, notifications, and activity log now share the record-table component, with labeled mobile fields, search, loading, and empty states.',
      },
      {
        titleAr: 'جداول موحدة وإجراءات السجل', titleEn: 'Consistent record tables and actions',
        detailAr: 'تعرض شاشات العملاء والمنتجات والموردين والمشتريات جداول موحدة على الشاشات الكبيرة وصفوفًا منظمة على الموبايل، مع بحث وحالات فارغة وإجراءات مرتبطة بالسجل. نماذج الإضافة واستيراد CSV قابلة للفتح عند الحاجة.',
        detailEn: 'Customers, products, suppliers, and purchasing use consistent desktop tables and structured mobile record cards, with search, empty states, and row-specific actions. Create forms and CSV imports open only when needed.',
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
        titleAr: 'البحث والترتيب وتحميل المزيد',
        titleEn: 'Search, sorting, and load more',
        detailAr: 'ابحث بالاسم أو البريد أو الهاتف ورتّب السجلات؛ استخدم «تحميل المزيد» لإضافة الصفحة التالية عند تجاوز أول 100 سجل.',
        detailEn: 'Search by name, email, or phone and sort the directory; use Load more to append the next page when the list exceeds the first 100 records.',
      },
      {
        titleAr: 'كشف حساب العميل',
        titleEn: 'Customer statement',
        detailAr: 'راجع الحركات والأرصدة حسب العملة والفترة، مع عرض أنواع الحركات باللغة المختارة.',
        detailEn: 'Review transactions and balances by currency and period, with event types shown in the selected language.',
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
        titleAr: 'البحث والتصفية والترتيب',
        titleEn: 'Search, filters, and sorting',
        detailAr: 'ابحث بالاسم أو رمز SKU، وفلتر بين الأصناف المخزنية وغير المخزنية، ورتّب بالاسم أو الرمز أو السعر أو المخزون. استخدم «تحميل المزيد» للوصول إلى الصفحات التالية؛ ويمكنك مسح الفلتر حتى لو لم تظهر نتائج.',
        detailEn: 'Search by item name or SKU, filter stock-tracked vs non-stock items, and sort by name, SKU, price, or stock. Use Load more to reach later pages; you can clear a filter even when it has no matches.',
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
        detailAr: 'تظهر حالة الفاتورة باللغة المختارة، وتُطبّق قواعد الحالة والصلاحيات قبل التنفيذ.',
        detailEn: 'Invoice statuses use the selected language; state and permissions are checked before actions are applied.',
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
        titleAr: 'طرق الدفع',
        titleEn: 'Payment method labels',
        detailAr: 'تظهر طرق الدفع باللغة المختارة ويمكن البحث باسم الطريقة المعروض.',
        detailEn: 'Payment methods use the selected language and can be searched by their displayed labels.',
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
    noteAr: 'نتيجة التشغيل المعروضة مبدئية: تعتمد على إيرادات الفواتير الصادرة والمصروفات المسجلة، ولا تخصم تكلفة البضاعة المباعة ولا تمثل النقد المحصل.',
    noteEn: 'The operating result is preliminary: it uses issued-invoice revenue and recorded expenses; it does not deduct cost of goods sold or represent cash collected.',
    features: [
      {
        titleAr: 'تسجيل المصروفات',
        titleEn: 'Record expenses',
        detailAr: 'سجّل التصنيف والوصف والمبلغ والعملة والتاريخ؛ تظهر أسماء التصنيفات باللغة المختارة، وتسجيل المصروف لا يعني أنه تم دفعه.',
        detailEn: 'Record category, description, amount, currency, and date; category names use the selected language, and this does not mark the expense as paid.',
      },
      {
        titleAr: 'نتيجة التشغيل الأولية',
        titleEn: 'Preliminary operating result',
        detailAr: 'راجع إيرادات الفواتير الصادرة والمصروفات المسجلة حسب الفترة والعملة؛ التقرير لا يمثل صافي الربح أو النقد المحصل.',
        detailEn: 'Review issued-invoice revenue and recorded expenses by period and currency; this is not a net-profit or cash-collection report.',
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
    id: 'suppliers',
    titleAr: 'الموردون',
    titleEn: 'Suppliers',
    noteAr: 'دليل الموردين مرتبط بمساحة العمل الحالية ويُستخدم لاختيار المورد في أوامر الشراء. لا يتضمن هذا القسم فواتير موردين أو تسجيل مدفوعات لهم.',
    noteEn: 'The supplier directory belongs to the current workspace and supplies vendor choices for purchase orders. It does not include supplier bills or supplier payments.',
    features: [
      {
        titleAr: 'دليل الموردين',
        titleEn: 'Supplier directory',
        detailAr: 'أضف اسم المورد وبيانات التواصل الاختيارية، وراجع السجلات المرتبطة بمساحة العمل.',
        detailEn: 'Add a supplier name and optional contact details, then review records for the current workspace.',
      },
    ],
  },
  {
    id: 'purchasing',
    titleAr: 'أوامر الشراء',
    titleEn: 'Purchase orders',
    noteAr: 'تُسجل أوامر الشراء المورد والمنتجات والكميات والتكلفة. استلام الكميات المتبقية يسجل حركة مخزون ومتاح للمالك فقط؛ لا يعرض هذا القسم فواتير موردين أو مدفوعات لهم.',
    noteEn: 'Purchase orders record suppliers, products, quantities, and unit cost. Receiving remaining quantities records stock movements and is owner-only; this section does not provide supplier bills or supplier payments.',
    features: [
      {
        titleAr: 'إنشاء ومراجعة أمر شراء',
        titleEn: 'Create and review purchase orders',
        detailAr: 'اربط الأمر بمورد ومنتج، وراجع الكمية والتكلفة والإجمالي والكميات المستلمة والمتبقية.',
        detailEn: 'Link an order to a supplier and product, then review quantity, unit cost, total, received quantity, and remaining quantity.',
      },
      {
        titleAr: 'اعتماد أوامر الشراء المسودة',
        titleEn: 'Approve draft purchase orders',
        detailAr: 'يمكن للمالك اعتماد المسودة بعد مراجعة المورد والأصناف والكميات والتكلفة. الاعتماد يغير حالة الأمر فقط؛ لا يسجل الاستلام أو حركة المخزون ولا ينشئ فاتورة مورد أو مستحقات أو مدفوعات.',
        detailEn: 'Owners can approve a draft after reviewing its supplier, items, quantities and unit costs. Approval changes the order status only; it does not record receipt or a stock movement, nor create supplier bills, payables or payments.',
      },
      {
        titleAr: 'حالات أوامر الشراء',
        titleEn: 'Purchase-order status labels',
        detailAr: 'تظهر الحالات المعروفة باللغة المختارة، وتظل القيم غير المعروفة ظاهرة للمراجعة.',
        detailEn: 'Known statuses use the selected language; unknown values remain visible for diagnosis.',
      },
      {
        titleAr: 'استلام الكميات المتبقية',
        titleEn: 'Receive remaining quantities',
        detailAr: 'تسجيل الاستلام ينشئ حركة مخزون، ويظل الإجراء متاحًا للمالك فقط.',
        detailEn: 'Recording receipt creates a stock movement; this action is restricted to workspace owners.',
      },
    ],
  },
  {
    id: 'notifications',
    titleAr: 'قائمة الإشعارات',
    titleEn: 'Notification queue',
    noteAr: 'القائمة تحفظ بيانات الإشعار وحالته فقط. إضافة إشعار متاحة للمالك، أما التسليم الفعلي فيحتاج مزود إرسال وعامل تسليم منشورًا.',
    noteEn: 'The queue stores notification metadata and status only. Owners can queue notifications; actual delivery requires a configured provider and deployed delivery worker.',
    features: [
      {
        titleAr: 'إضافة إشعار إلى القائمة',
        titleEn: 'Queue a notification',
        detailAr: 'حدد النوع والعنوان والمحتوى، ويمكنك إضافة موعد اختياري.',
        detailEn: 'Choose a type, title, and message, with an optional scheduled time.',
      },
      {
        titleAr: 'متابعة الحالة المحفوظة',
        titleEn: 'Review stored status',
        detailAr: 'راجع الإشعارات وحالتها وموعدها باللغة المختارة دون اعتبار ذلك تأكيدًا على وصولها للمستلم.',
        detailEn: 'Review notification types and statuses in the selected language; this does not confirm delivery to a recipient.',
      },
    ],
  },
  {
    id: 'recurring',
    titleAr: 'الفواتير الدورية',
    titleEn: 'Recurring invoices',
    noteAr: 'هذا القسم يحفظ إعدادات الجدولة فقط. إنشاء الفواتير تلقائيًا يحتاج عامل جدولة منشورًا، لذلك حفظ الجدول لا يعني تنفيذ فاتورة.',
    noteEn: 'This section stores schedule settings only. Automatic invoice generation requires a deployed scheduler worker, so saving a schedule does not mean an invoice was generated.',
    features: [
      {
        titleAr: 'إعداد الجدولة',
        titleEn: 'Configure a schedule',
        detailAr: 'حدد الفاصل بالأيام وموعد التشغيل التالي والمنطقة الزمنية، ويمكن ربط الجدول بعميل اختياري.',
        detailEn: 'Set the interval in days, next run time, and timezone, with an optional customer.',
      },
      {
        titleAr: 'صلاحية إنشاء الجداول',
        titleEn: 'Schedule permissions',
        detailAr: 'إنشاء جداول الفواتير الدورية متاح لمالك مساحة العمل فقط.',
        detailEn: 'Only workspace owners can create recurring invoice schedules.',
      },
    ],
  },
  {
    id: 'taxes',
    titleAr: 'ملخص الضرائب',
    titleEn: 'Tax summary',
    noteAr: 'يعرض إجماليات الضرائب المحفوظة على الفواتير الصادرة مع فصل العملات. لا يعيد حساب الضرائب التاريخية ولا يمثل إقرارًا ضريبيًا.',
    noteEn: 'Shows saved tax totals on issued invoices with currencies kept separate. It does not recalculate historical taxes or provide a tax filing.',
    features: [
      {
        titleAr: 'تقرير حسب الفترة',
        titleEn: 'Period summary',
        detailAr: 'حدد فترة التقرير وراجع إجمالي الضريبة وعدد الفواتير الصادرة لكل عملة.',
        detailEn: 'Choose a reporting period and review saved tax totals and issued-invoice counts for each currency.',
      },
      {
        titleAr: 'صلاحية الوصول',
        titleEn: 'Access permissions',
        detailAr: 'ملخص الضرائب متاح لمالك مساحة العمل فقط.',
        detailEn: 'The tax summary is available to workspace owners only.',
      },
    ],
  },
  {
    id: 'integrity',
    titleAr: 'مراجعة سلامة البيانات',
    titleEn: 'Data integrity review',
    noteAr: 'تقرير قراءة فقط يحدد سجلات تحتاج مراجعة بشرية. لا يصحح البيانات أو يغير السجلات تلقائيًا، وهو متاح للمالك فقط.',
    noteEn: 'A read-only report identifies records that need human review. It does not correct or mutate records automatically and is available to owners only.',
    features: [
      {
        titleAr: 'فحص السجلات',
        titleEn: 'Record checks',
        detailAr: 'اعرض الفواتير الصادرة غير المرتبطة بعميل والتخصيصات التي تختلف فيها العملة أو هوية العميل.',
        detailEn: 'Review issued invoices without a customer and payment allocations with currency or customer mismatches.',
      },
      {
        titleAr: 'مراجعة النتائج',
        titleEn: 'Review findings',
        detailAr: 'تنقل بين صفحات النتائج وتعامل معها كمؤشرات للمراجعة، وليس كإصلاح تلقائي.',
        detailEn: 'Navigate result pages and treat findings as review indicators, not automatic repairs.',
      },
    ],
  },
  {
    id: 'health',
    titleAr: 'الحالة التشغيلية',
    titleEn: 'Operational health',
    noteAr: 'فحص قراءة فقط لحالة الاتصال وإعدادات الخدمات الأساسية. لا يكشف الأسرار ولا يغير بيانات النشاط، وهو متاح للمالك فقط.',
    noteEn: 'A read-only check of connectivity and core service configuration. It reveals no secrets and changes no business data; access is owner-only.',
    features: [
      {
        titleAr: 'فحص الخدمات الأساسية',
        titleEn: 'Core service checks',
        detailAr: 'راجع اتصال قاعدة البيانات وإعدادات الخدمات، مع عرض الحالة التشغيلية باللغة المختارة.',
        detailEn: 'Review database connectivity and service settings, with operational status shown in the selected language.',
      },
    ],
  },
  {
    id: 'employees-payroll',
    titleAr: 'الموظفون والمرتبات',
    titleEn: 'Employees & payroll',
    noteAr: 'متاح لمالك مساحة العمل فقط. يُحفظ سجل الموظف منفصلًا عن صلاحيات حساب الدخول، وتُحسب المرتبات على الخادم.',
    noteEn: 'Available to workspace owners only. Employee profiles are separate from login permissions, and payroll totals are calculated by the server.',
    features: [
      {
        titleAr: 'ملفات الموظفين',
        titleEn: 'Employee directory',
        detailAr: 'أضف الموظفين وعدّل بياناتهم وفعّلهم أو أوقفهم دون حذف تاريخهم المالي.',
        detailEn: 'Create and edit employees and deactivate them without deleting financial history.',
      },
      {
        titleAr: 'حساب المرتب',
        titleEn: 'Payroll calculation',
        detailAr: 'يُحسب الصافي من الأساسي والبدلات والمكافآت والخصومات، وتُرفض القيم غير الصالحة والمرتب الصافي غير الموجب.',
        detailEn: 'Net pay is calculated from base salary, allowances, bonuses, and deductions; invalid values and non-positive totals are rejected.',
      },
      {
        titleAr: 'اعتماد وصرف آمن',
        titleEn: 'Controlled approval and payment',
        detailAr: 'يلزم اعتماد مالك مختلف عن منشئ المسودة. الصرف يسجل مصروف رواتب واحدًا ولا يسمح بصرف السجل مرتين.',
        detailEn: 'A different owner must approve the draft. Payment creates one linked Payroll expense and cannot be repeated.',
      },
      {
        titleAr: 'جداول الموظفين والمرتبات', titleEn: 'Employee and payroll tables',
        detailAr: 'دليل الموظفين وسجل المرتبات يعرضان أعمدة منظمة على الويب وكروت سجلات على الهاتف. بيانات الراتب لا تظهر في دليل الموظفين؛ تفاصيل التعويضات تظل داخل سجل المرتبات المخصص للمالك.',
        detailEn: 'The employee directory and payroll history use structured desktop columns and mobile record cards. Salary is excluded from the employee directory; compensation details remain in the owner-only payroll history.',
      },
      {
        titleAr: 'مساحات عمل مخصصة للهاتف',
        titleEn: 'Task-focused mobile workspaces',
        detailAr: 'على الهاتف، تنقّل بين دليل الموظفين وتجهيز المرتب وسجل المرتبات من شريط أقسام مستقل. نموذج الموظف يظل مغلقًا حتى تطلب إضافته أو تعديله.',
        detailEn: 'On phones, switch between the employee directory, payroll preparation and payroll history using dedicated section navigation. The employee form stays collapsed until you add or edit a profile.',
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
      {
        titleAr: 'إدارة المحادثة',
        titleEn: 'Manage the conversation',
        detailAr: 'ابدأ محادثة جديدة لمسح سياق الجلسة الحالية محليًا، مع الاحتفاظ بإمكانية متابعة السؤال عند تعذر الرد.',
        detailEn: 'Start a new conversation to clear the current in-memory session, while keeping failed questions available for retry.',
      },
      {
        titleAr: 'نسخ الردود ومتابعتها',
        titleEn: 'Copy and follow responses',
        detailAr: 'انسخ رد المساعد بضغطة واحدة مع بديل للمتصفحات التي لا تدعم الحافظة، ويظل موضع قراءتك ثابتًا عند استعراض الرسائل القديمة.',
        detailEn: 'Copy assistant responses with a fallback for browsers without Clipboard API support; preserve your reading position when reviewing older messages.',
      },
      {
        titleAr: 'كتابة السؤال بسرعة',
        titleEn: 'Faster question entry',
        detailAr: 'اضغط Enter للإرسال وShift + Enter لإضافة سطر جديد، مع عدّاد أحرف واضح وحد أقصى 2000 حرف.',
        detailEn: 'Press Enter to send and Shift + Enter for a new line, with a visible character counter and a 2,000-character limit.',
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
        detailAr: 'راجع سجل النشاط المتاح لمالك مساحة العمل؛ تظهر أسماء العمليات والكيانات باللغة المختارة.',
        detailEn: 'Review activity entries available to workspace owners; action and target labels use the selected language.',
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
    version: '1.4.1',
    apiVersion: '1.3.5',
    titleAr: 'تحسين شريط التطبيق على الموبايل',
    titleEn: 'Mobile App Bar refinement',
    changes: ["release.changes.m_19csuxk", "release.changes.m_iugfip", "release.changes.m_1ig2ax2"],
  },
  {
    version: '1.4.0',
    apiVersion: '1.3.5',
    titleAr: 'تحسين تجربة مساحة العمل والموبايل',
    titleEn: 'Workspace and mobile experience improvements',
    changes: ["release.changes.m_16xgs48", "release.changes.m_15ng565", "release.changes.m_1ccyq57", "release.changes.m_1061cyg"],
  },
  {
    version: '1.3.9',
    apiVersion: '1.3.5',
    titleAr: 'إزالة المعاينة التجريبية المستقلة',
    titleEn: 'Standalone preview removal',
    changes: ["release.changes.m_1e2qljj", "release.changes.m_6ygd0p", "release.changes.m_1vq0w0p"],
  },

  {
    version: '1.3.8',
    apiVersion: '1.3.5',
    titleAr: 'تحسين معاينة الميزات التجريبية',
    titleEn: 'Feature demo preview improvements',
    changes: ["release.changes.m_149w058", "release.changes.m_fnvkkm", "release.changes.m_ae14nt"],
  },
  {
    version: '1.3.7',
    apiVersion: '1.3.5',
    titleAr: 'تحسين وضوح النصوص وإمكانية الوصول',
    titleEn: 'Accessibility and text contrast improvements',
    changes: ["release.changes.m_1jkpdkb", "release.changes.m_155pln6", "release.changes.m_13plqvq"],
  },
  {
    version: '1.3.6',
    apiVersion: '1.3.5',
    titleAr: 'موثوقية التشغيل والتنقل بين الأقسام',
    titleEn: 'Startup reliability and workspace navigation',
    changes: ["release.changes.m_w34n8e", "release.changes.m_1iklnis", "release.changes.m_1kvdy97", "release.changes.m_adj2ly"],
  },
  {
    version: '1.3.5',
    titleAr: 'مزامنة الجلسة وحماية بيانات مساحة العمل',
    titleEn: 'Session synchronization and workspace data protection',
    changes: ["release.changes.m_1h5suq8", "release.changes.m_1siao2", "release.changes.m_5n568g"],
  },
  {
    version: '1.3.4',
    titleAr: 'توحيد بيانات الإصدار وتحديث التطبيق المثبّت',
    titleEn: 'Release metadata alignment and installed-app updates',
    changes: ["release.changes.m_zwuzox", "release.changes.m_1f7syyg"],
  },
  {
    version: '1.3.3',
    titleAr: 'تحسين موثوقية البناء والإصدار',
    titleEn: 'Build and release reliability',
    changes: ["release.changes.m_wxlbd5", "release.changes.m_lw6g1a"],
  },
  {
    version: '1.3.2',
    titleAr: 'تقوية الصلاحيات وسلامة العمليات',
    titleEn: 'Authorization and workflow integrity hardening',
    changes: ["release.changes.m_xjbwe2", "release.changes.m_5eftzo", "release.changes.m_poq3r6"],
  },
  {
    version: '1.3.1',
    titleAr: 'تحديث إصدار الصيانة',
    titleEn: 'Maintenance release update',
    changes: ["release.changes.m_1ispv5h"],
  },
  {
    version: '1.3.0',
    titleAr: 'السداد والمخزون ودليل التطبيق',
    titleEn: 'Payments, stock, and app guide',
    changes: ["release.changes.m_3nzs6h", "release.changes.m_fkovqz", "release.changes.m_1q9dsqo"],
  },
  {
    version: '1.2.1',
    titleAr: 'تحسينات المحاسبة وسلامة العمليات',
    titleEn: 'Accounting and workflow improvements',
    changes: ["release.changes.m_1cn8d7n", "release.changes.m_17mk06i", "release.changes.m_1orhf78"],
  },
  {
    version: '1.2.0',
    titleAr: 'أساس إدارة النشاط والفواتير',
    titleEn: 'Business and invoicing foundation',
    changes: ["release.changes.m_1snb1nd", "release.changes.m_l45aln", "release.changes.m_1a7j5yu"],
  },
  {
    version: '1.0.0',
    titleAr: 'الفواتير على الموبايل',
    titleEn: 'Mobile invoicing',
    changes: ["release.changes.m_118l28j", "release.changes.m_vj2szz"],
  },
] as const;
