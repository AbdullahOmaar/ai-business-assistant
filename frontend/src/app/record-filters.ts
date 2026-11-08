export interface CustomerSearchItem {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface ProductSearchItem {
  name: string;
  sku?: string | null;
  unit_price: string | number;
}

export interface InvoiceSearchItem {
  invoice_number: string;
  currency_code: string;
  status: string;
  total: string | number;
  customer_id?: string | null;
}

function normalized(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function filterCustomers<T extends CustomerSearchItem>(items: readonly T[], query: string): T[] {
  const q = normalized(query);
  return items.filter(item => !q || [item.name, item.email, item.phone].some(value => normalized(value).includes(q)));
}

export function filterProducts<T extends ProductSearchItem>(
  items: readonly T[],
  query: string,
  currencyCode = '',
): T[] {
  const q = normalized(query);
  return items.filter(item => !q || [item.name, item.sku, item.unit_price, currencyCode].some(value => normalized(value).includes(q)));
}

export function filterInvoices<T extends InvoiceSearchItem>(
  items: readonly T[],
  query: string,
  statusFilter: 'all' | 'draft' | 'issued' | 'paid' | 'overdue' | 'void',
  customerId = '',
  statusLabel: (status: string) => string = status => status,
): T[] {
  const q = normalized(query);
  return items.filter(item =>
    (!customerId || item.customer_id === customerId)
    && (statusFilter === 'all' || item.status === statusFilter)
    && (!q || [item.invoice_number, item.currency_code, item.status, statusLabel(item.status), item.total].some(value => normalized(value).includes(q))),
  );
}


export interface SupplierSearchItem {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface PurchaseOrderLineSearchItem {
  product_id: string;
  quantity: string | number;
  received_quantity: string | number;
  remaining_quantity: string | number;
}

export interface PurchaseOrderSearchItem {
  order_number: string;
  status: string;
  total: string | number;
  currency_code: string;
  supplier_id: string;
  lines: readonly PurchaseOrderLineSearchItem[];
}

export interface RecurringScheduleSearchItem {
  customer_id: string | null;
  interval_days: number;
  timezone: string;
  next_run_at: string;
  is_active: boolean;
}

export interface NotificationSearchItem {
  title: string;
  body: string;
  kind: string;
  status: string;
  scheduled_at?: string | null;
  created_at?: string | null;
}

export function filterSuppliers<T extends SupplierSearchItem>(items: readonly T[], query: string): T[] {
  const q = normalized(query);
  return items.filter(item => !q || [item.name, item.email, item.phone, item.address].some(value => normalized(value).includes(q)));
}

export function filterPurchaseOrders<T extends PurchaseOrderSearchItem>(
  items: readonly T[],
  query: string,
  supplierName: (supplierId: string) => string,
  productName: (productId: string) => string,
  statusLabel: (status: string) => string = status => status,
): T[] {
  const q = normalized(query);
  return items.filter(item => !q || [
    item.order_number, item.status, statusLabel(item.status), item.total, item.currency_code, supplierName(item.supplier_id),
    ...item.lines.flatMap(line => [
      productName(line.product_id), line.quantity, line.received_quantity, line.remaining_quantity,
    ]),
  ].some(value => normalized(value).includes(q)));
}

export function filterRecurringSchedules<T extends RecurringScheduleSearchItem>(
  items: readonly T[],
  query: string,
  customerName: (customerId: string) => string,
): T[] {
  const q = normalized(query);
  return items.filter(item => {
    if (!q) return true;
    const searchable = [
      item.customer_id ? customerName(item.customer_id) : '',
      item.interval_days, item.timezone, item.next_run_at,
    ];
    const stateLabels = item.is_active ? ['active', 'نشطة'] : ['inactive', 'متوقفة'];
    return searchable.some(value => normalized(value).includes(q))
      || stateLabels.some(value => normalized(value) === q);
  });
}

export function filterNotifications<T extends NotificationSearchItem>(
  items: readonly T[],
  query: string,
  kindLabel: (kind: string) => string = kind => kind,
  statusLabel: (status: string) => string = status => status,
): T[] {
  const q = normalized(query);
  return items.filter(item => !q || [
    item.title, item.body, item.kind, kindLabel(item.kind), item.status, statusLabel(item.status), item.scheduled_at, item.created_at,
  ].some(value => normalized(value).includes(q)));
}


export interface ExpenseSearchItem {
  category: string;
  description: string;
  amount: string | number;
  currency_code: string;
  incurred_at: string;
  vendor_name?: string | null;
  reference?: string | null;
}

export interface PaymentSearchItem {
  amount: string | number;
  currency_code: string;
  received_at: string;
  customer_id?: string | null;
  method?: string | null;
  reference?: string | null;
  allocations: readonly { invoice_id: string; amount: string | number }[];
}

export function filterExpenses<T extends ExpenseSearchItem>(
  items: readonly T[],
  query: string,
  categoryLabel: (category: string) => string = category => category,
): T[] {
  const q = normalized(query);
  return items.filter(item => !q || [
    item.category, categoryLabel(item.category), item.description, item.amount, item.currency_code, item.incurred_at, item.vendor_name, item.reference,
  ].some(value => normalized(value).includes(q)));
}

export function filterPayments<T extends PaymentSearchItem>(
  items: readonly T[],
  query: string,
  customerName: (customerId: string) => string,
  methodLabel: (method: string) => string = method => method,
): T[] {
  const q = normalized(query);
  return items.filter(item => {
    if (!q) return true;
    const searchable = [
      item.amount, item.currency_code, item.received_at,
      item.customer_id ? customerName(item.customer_id) : '',
      item.method, item.method ? methodLabel(item.method) : '', item.reference, item.allocations.length,
    ];
    const allocationLabels = item.allocations.length
      ? ['allocated', 'مخصصة']
      : ['unallocated', 'غير مخصصة'];
    return searchable.some(value => normalized(value).includes(q))
      || allocationLabels.some(value => normalized(value) === q);
  });
}

/** Merge an offset-paginated record page without duplicating IDs across overlapping pages. */
export function mergeRecordPage<T extends { id: string }>(
  current: readonly T[],
  page: readonly T[],
  offset: number,
  pageSize: number,
): { records: T[]; nextOffset: number; hasMore: boolean } {
  const seen = new Set(current.map(record => record.id));
  const records = [...current];
  for (const record of page) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    records.push(record);
  }
  return {
    records,
    nextOffset: offset + page.length,
    hasMore: page.length === pageSize,
  };
}
