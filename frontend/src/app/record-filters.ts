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
): T[] {
  const q = normalized(query);
  return items.filter(item =>
    (!customerId || item.customer_id === customerId)
    && (statusFilter === 'all' || item.status === statusFilter)
    && (!q || [item.invoice_number, item.currency_code, item.status, item.total].some(value => normalized(value).includes(q))),
  );
}
