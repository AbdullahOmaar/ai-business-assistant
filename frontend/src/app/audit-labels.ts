export type AuditLanguage = 'ar' | 'en';

const AUDIT_ACTION_LABELS: Record<string, { ar: string; en: string }> = {
  'invoice.issued': { ar: 'إصدار فاتورة', en: 'Invoice issued' },
  'invoice.created': { ar: 'إنشاء فاتورة', en: 'Invoice created' },
  'invoice.draft_updated': { ar: 'تعديل مسودة فاتورة', en: 'Invoice draft updated' },
  'invoice.voided': { ar: 'إلغاء فاتورة', en: 'Invoice voided' },
  'payment.recorded': { ar: 'تسجيل دفعة', en: 'Payment recorded' },
  'expense.created': { ar: 'تسجيل مصروف', en: 'Expense recorded' },
  'customer.created': { ar: 'إضافة عميل', en: 'Customer created' },
  'product.created': { ar: 'إضافة منتج', en: 'Product created' },
  'stock.movement_recorded': { ar: 'تسجيل حركة مخزون', en: 'Stock movement recorded' },
  'supplier.created': { ar: 'إضافة مورد', en: 'Supplier created' },
  'customer.updated': { ar: 'تعديل بيانات عميل', en: 'Customer updated' },
  'customer.deactivated': { ar: 'تعطيل عميل', en: 'Customer deactivated' },
  'product.updated': { ar: 'تعديل منتج', en: 'Product updated' },
  'product.deactivated': { ar: 'تعطيل منتج', en: 'Product deactivated' },
  'purchase_order.created': { ar: 'إنشاء أمر شراء', en: 'Purchase order created' },
  'purchase_order.approved': { ar: 'اعتماد أمر شراء', en: 'Purchase order approved' },
  'purchase_order.received': { ar: 'استلام أمر شراء', en: 'Purchase order received' },
  'sales_return.created': { ar: 'تسجيل مرتجع بيع', en: 'Sales return created' },
  'sales_return.approved': { ar: 'اعتماد مرتجع بيع', en: 'Sales return approved' },
  'recurring_invoice_schedule.created': { ar: 'إنشاء جدول فاتورة دورية', en: 'Recurring invoice schedule created' },
  'data_import.completed': { ar: 'اكتمال استيراد البيانات', en: 'Data import completed' },
  'pricing_rule.created': { ar: 'إنشاء قاعدة تسعير', en: 'Pricing rule created' },
};

const AUDIT_TARGET_LABELS: Record<string, { ar: string; en: string }> = {
  invoice: { ar: 'فاتورة', en: 'Invoice' },
  payment: { ar: 'دفعة', en: 'Payment' },
  expense: { ar: 'مصروف', en: 'Expense' },
  customer: { ar: 'عميل', en: 'Customer' },
  product: { ar: 'منتج', en: 'Product' },
  supplier: { ar: 'مورد', en: 'Supplier' },
  stock_movement: { ar: 'حركة مخزون', en: 'Stock movement' },
  purchase_order: { ar: 'أمر شراء', en: 'Purchase order' },
  sales_return: { ar: 'مرتجع بيع', en: 'Sales return' },
  recurring_invoice_schedule: { ar: 'جدول فاتورة دورية', en: 'Recurring invoice schedule' },
  import_job: { ar: 'عملية استيراد', en: 'Import job' },
  pricing_rule: { ar: 'قاعدة تسعير', en: 'Pricing rule' },
  business: { ar: 'نشاط تجاري', en: 'Business' },
};

export function auditActionLabel(action: string, language: AuditLanguage): string {
  return AUDIT_ACTION_LABELS[action]?.[language] || action;
}

export function auditTargetLabel(target: string, language: AuditLanguage): string {
  return AUDIT_TARGET_LABELS[target]?.[language] || target;
}
