export type InvoiceSortKey = 'invoice_number' | 'customer' | 'issue_date' | 'status' | 'total';
export type InvoiceSortDirection = 'asc' | 'desc';

export interface InvoiceListRecord {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
  status: string;
  total: string | number;
  issue_date?: string | null;
  created_at?: string | null;
}

/** Compare decimal text without converting financial values through IEEE-754. */
export function compareInvoiceDecimalValues(left: string | number, right: string | number): number {
  const leftMatch = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(left).trim());
  const rightMatch = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(right).trim());
  if (!leftMatch || !rightMatch) return String(left).localeCompare(String(right), undefined, { numeric: true });
  const scale = Math.max(leftMatch[3]?.length || 0, rightMatch[3]?.length || 0);
  const toScaled = (match: RegExpExecArray): bigint => {
    const sign = match[1] === '-' ? '-' : '';
    return BigInt(sign + match[2] + (match[3] || '').padEnd(scale, '0'));
  };
  const a = toScaled(leftMatch);
  const b = toScaled(rightMatch);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortInvoiceRecords<T extends InvoiceListRecord>(
  records: readonly T[],
  key: InvoiceSortKey,
  direction: InvoiceSortDirection,
  customerName: (customerId: string | null | undefined) => string,
  locale = 'en',
): T[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const multiplier = direction === 'asc' ? 1 : -1;
  const compareDate = (left: T, right: T): number => {
    const a = Date.parse(left.issue_date || left.created_at || '');
    const b = Date.parse(right.issue_date || right.created_at || '');
    if (Number.isFinite(a) && Number.isFinite(b)) return a < b ? -1 : a > b ? 1 : 0;
    return collator.compare(left.issue_date || left.created_at || '', right.issue_date || right.created_at || '');
  };
  return [...records].sort((left, right) => {
    let comparison = 0;
    switch (key) {
      case 'invoice_number': comparison = collator.compare(left.invoice_number, right.invoice_number); break;
      case 'customer': comparison = collator.compare(customerName(left.customer_id), customerName(right.customer_id)); break;
      case 'issue_date': comparison = compareDate(left, right); break;
      case 'status': comparison = collator.compare(left.status, right.status); break;
      case 'total': comparison = compareInvoiceDecimalValues(left.total, right.total); break;
    }
    return comparison === 0 ? left.id.localeCompare(right.id) : comparison * multiplier;
  });
}

export interface InvoiceRecordPage<T> {
  items: T[];
  pageIndex: number;
  pageCount: number;
  start: number;
  end: number;
}

export function paginateInvoiceRecords<T>(
  records: readonly T[],
  requestedPageIndex: number,
  pageSize: number,
): InvoiceRecordPage<T> {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const pageCount = Math.max(1, Math.ceil(records.length / safePageSize));
  const pageIndex = Math.max(0, Math.min(pageCount - 1, Math.trunc(requestedPageIndex) || 0));
  const startIndex = pageIndex * safePageSize;
  return {
    items: records.slice(startIndex, startIndex + safePageSize),
    pageIndex,
    pageCount,
    start: records.length ? startIndex + 1 : 0,
    end: Math.min(startIndex + safePageSize, records.length),
  };
}
