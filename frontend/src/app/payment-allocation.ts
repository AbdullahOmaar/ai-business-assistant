export interface PaymentAllocationDraft {
  invoiceId: string;
  amount: string;
}

export interface PaymentAllocationInvoice {
  id: string;
  status: string;
  customer_id?: string | null;
  currency_code: string;
  outstanding_amount?: string | null;
}

export type PaymentAllocationValidationCode =
  | 'invalid-receipt'
  | 'incomplete'
  | 'duplicate-invoice'
  | 'invalid-amount'
  | 'invoice-mismatch'
  | 'exceeds-outstanding'
  | 'allocations-exceed-receipt';

export function moneyToCents(raw: string | number | null | undefined): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw ?? '').trim());
  if (!match || match[1].length > 12) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
}

export function formatMoneyCents(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

export function eligiblePaymentInvoices(
  invoices: readonly PaymentAllocationInvoice[],
  customerId: string,
  currencyCode: string,
  allocations: readonly PaymentAllocationDraft[],
): PaymentAllocationInvoice[] {
  if (!customerId || !currencyCode) return [];
  return invoices.filter(invoice =>
    invoice.status === 'issued' &&
    invoice.customer_id === customerId &&
    invoice.currency_code === currencyCode &&
    (moneyToCents(invoice.outstanding_amount) ?? 0n) > 0n &&
    !allocations.some(allocation => allocation.invoiceId === invoice.id)
  );
}

export function paymentInvoicesForAllocation(
  invoices: readonly PaymentAllocationInvoice[],
  customerId: string,
  currencyCode: string,
  allocations: readonly PaymentAllocationDraft[],
  current: PaymentAllocationDraft,
): PaymentAllocationInvoice[] {
  if (!customerId || !currencyCode) return [];
  return invoices.filter(invoice =>
    invoice.status === 'issued' &&
    invoice.customer_id === customerId &&
    invoice.currency_code === currencyCode &&
    (moneyToCents(invoice.outstanding_amount) ?? 0n) > 0n &&
    (invoice.id === current.invoiceId ||
      !allocations.some(allocation => allocation !== current && allocation.invoiceId === invoice.id))
  );
}

export function suggestPaymentAllocationAmount(
  invoice: PaymentAllocationInvoice | undefined,
  allocations: readonly PaymentAllocationDraft[],
  current: PaymentAllocationDraft,
  receiptAmount: string,
): string {
  if (!invoice) return '';
  const outstanding = moneyToCents(invoice.outstanding_amount);
  if (outstanding === null || outstanding <= 0n) return '';
  const receipt = moneyToCents(receiptAmount);
  let alreadyAssigned = 0n;
  for (const item of allocations) {
    if (item === current || !item.amount.trim()) continue;
    const cents = moneyToCents(item.amount);
    if (cents !== null) alreadyAssigned += cents;
  }
  const receiptRemaining = receipt === null ? outstanding : receipt - alreadyAssigned;
  const selected = receiptRemaining > 0n && receiptRemaining < outstanding ? receiptRemaining : outstanding;
  return selected > 0n ? formatMoneyCents(selected) : '';
}

export function paymentAllocationTotals(
  receiptAmount: string,
  allocations: readonly PaymentAllocationDraft[],
): { total: string | null; remaining: string | null } {
  let total = 0n;
  for (const allocation of allocations) {
    const cents = moneyToCents(allocation.amount);
    if (cents === null) return { total: null, remaining: null };
    total += cents;
  }
  const receipt = moneyToCents(receiptAmount);
  if (receipt === null || total > receipt) return { total: formatMoneyCents(total), remaining: null };
  return { total: formatMoneyCents(total), remaining: formatMoneyCents(receipt - total) };
}

export function validatePaymentAllocations(
  receiptRaw: string,
  allocations: readonly PaymentAllocationDraft[],
  invoices: readonly PaymentAllocationInvoice[],
  customerId: string,
  currencyCode: string,
): PaymentAllocationValidationCode | null {
  if (!allocations.length) return null;
  const receipt = moneyToCents(receiptRaw);
  if (receipt === null || receipt <= 0n) return 'invalid-receipt';
  const seen = new Set<string>();
  let total = 0n;
  for (const allocation of allocations) {
    if (!allocation.invoiceId || !allocation.amount.trim()) return 'incomplete';
    if (seen.has(allocation.invoiceId)) return 'duplicate-invoice';
    seen.add(allocation.invoiceId);
    const amount = moneyToCents(allocation.amount);
    if (amount === null || amount <= 0n) return 'invalid-amount';
    const invoice = invoices.find(item => item.id === allocation.invoiceId);
    if (!invoice || invoice.status !== 'issued' || !invoice.customer_id ||
        invoice.customer_id !== customerId || invoice.currency_code !== currencyCode) {
      return 'invoice-mismatch';
    }
    const outstanding = moneyToCents(invoice.outstanding_amount);
    if (outstanding === null || outstanding <= 0n || amount > outstanding) return 'exceeds-outstanding';
    total += amount;
  }
  if (total > receipt) return 'allocations-exceed-receipt';
  return null;
}
