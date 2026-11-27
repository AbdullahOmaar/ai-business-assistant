export type InvoiceDraftLineKind = 'product' | 'manual';

export interface InvoiceDraftLine {
  id: string;
  kind: InvoiceDraftLineKind;
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
  /** 3A-920 step 3: the unit the line is sold in — '' = the product's base unit. */
  unit?: string;
}

export interface InvoiceDraftProduct {
  id: string;
  name: string;
  unit_price?: string;
  unit?: string | null;
  second_unit_name?: string | null;
  conversion_factor?: string | null;
}

export interface InvoiceDraftCustomer {
  id: string;
  name: string;
}

/** 3A-920 step 4: an employee offered in the transport block's driver list. */
export interface InvoiceDraftDriver {
  id: string;
  name: string;
}

export interface InvoiceDraftInput {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  lines: readonly InvoiceDraftLine[];
  notes?: string;
  /** 3A-920 step 4: the optional transport block (driver + trips + route). */
  driver_employee_id?: string | null;
  transport_trips?: string | null;
  transport_from?: string | null;
  transport_to?: string | null;
}

export type InvoiceDraftLinePayload =
  | { product_id: string; quantity: string; description?: string; unit?: string }
  | { description: string; quantity: string; unit_price: string };

export interface InvoiceDraftPayload {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  lines: InvoiceDraftLinePayload[];
  notes?: string | null;
  driver_employee_id?: string | null;
  transport_trips?: number | null;
  transport_from?: string | null;
  transport_to?: string | null;
}

export interface InvoiceDraftServerSummary {
  currency_code: string;
  subtotal?: string | null;
  discount_total?: string | null;
  tax_total?: string | null;
  total: string;
}

const DECIMAL_QUANTITY = /^\d+(?:\.\d{1,3})?$/;
const DECIMAL_PRICE = /^\d+(?:\.\d{1,2})?$/;

function exceedsInvoiceDecimalPrecision(value: string, maximumWholeDigits: number): boolean {
  const [whole = ''] = value.split('.');
  return whole.replace(/^0+/, '').length > maximumWholeDigits;
}

export function validateInvoiceDraft(
  input: InvoiceDraftInput,
  products: readonly InvoiceDraftProduct[],
  customers: readonly InvoiceDraftCustomer[],
): string | null {
  if (!input.invoice_number.trim() || input.invoice_number.trim().length > 64) {
    return "invoiceDraft.validation.invoiceNumber";
  }
  if (!input.customer_id || !customers.some(customer => customer.id === input.customer_id)) {
    return "invoiceDraft.validation.customer";
  }
  if (!/^[A-Za-z]{3}$/.test(input.currency_code.trim())) {
    return "invoiceDraft.validation.currency";
  }
  if ((input.notes?.length ?? 0) > 2000) return "invoiceDraft.validation.notesLength";
  // 3A-920 step 4: the transport block is all-or-nothing — a driver and a
  // trip count travel together; a route alone still needs both.
  const transportDriver = input.driver_employee_id?.trim() || '';
  const transportTrips = (input.transport_trips ?? '').trim();
  const transportFrom = input.transport_from?.trim() || '';
  const transportTo = input.transport_to?.trim() || '';
  if (transportDriver || transportTrips || transportFrom || transportTo) {
    if (!transportDriver || !transportTrips) return "invoiceDraft.validation.transportPair";
    if (!/^\d+$/.test(transportTrips) || Number(transportTrips) < 1) {
      return "invoiceDraft.validation.transportTrips";
    }
    if (transportFrom.length > 200 || transportTo.length > 200) {
      return "invoiceDraft.validation.transportPlaceLength";
    }
  }
  if (!input.lines.length) return "invoiceDraft.validation.atLeastOneLine";
  if (input.lines.length > 500) return "invoiceDraft.validation.lineLimit";

  for (const line of input.lines) {
    const quantity = line.quantity.trim();
    if (!DECIMAL_QUANTITY.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 ||
        exceedsInvoiceDecimalPrecision(quantity, 11)) {
      return "invoiceDraft.validation.quantity";
    }
    if (line.kind === 'product') {
      const product = products.find(candidate => candidate.id === line.product_id);
      if (!line.product_id || !product) {
        return "invoiceDraft.validation.catalogProduct";
      }
      // 3A-920 step 3: a stale second unit (removed from the product
      // after the draft loaded) is caught here, not by the server.
      const unit = line.unit?.trim() || '';
      if (unit && unit !== product.unit && unit !== (product.second_unit_name ?? '')) {
        return "invoiceDraft.validation.lineUnit";
      }
      if (line.description.trim().length > 300) return "invoiceDraft.validation.descriptionLength";
      continue;
    }
    if (!line.description.trim()) {
      return "invoiceDraft.validation.manualDescription";
    }
    if (line.description.trim().length > 300) {
      return "invoiceDraft.validation.descriptionLength";
    }
    const price = line.unit_price.trim();
    if (!DECIMAL_PRICE.test(price) || !Number.isFinite(Number(price)) || Number(price) < 0 ||
        exceedsInvoiceDecimalPrecision(price, 12)) {
      return "invoiceDraft.validation.manualPrice";
    }
  }
  return null;
}

export function toInvoiceDraftPayload(
  input: InvoiceDraftInput,
  products: readonly InvoiceDraftProduct[],
  customers: readonly InvoiceDraftCustomer[],
): InvoiceDraftPayload {
  const error = validateInvoiceDraft(input, products, customers);
  if (error) throw new RangeError(error);

  const transportDriver = input.driver_employee_id?.trim() || '';
  return {
    invoice_number: input.invoice_number.trim(),
    currency_code: input.currency_code.trim().toUpperCase(),
    customer_id: input.customer_id,
    notes: input.notes?.trim() || null,
    // 3A-920 step 4: always sent (nulls when unused) so a draft edit that
    // clears the block clears it on the server too.
    driver_employee_id: transportDriver || null,
    transport_trips: transportDriver ? Number((input.transport_trips ?? '').trim()) : null,
    transport_from: transportDriver ? (input.transport_from?.trim() || null) : null,
    transport_to: transportDriver ? (input.transport_to?.trim() || null) : null,
    lines: input.lines.map(line => line.kind === 'manual'
      ? {
          description: line.description.trim(),
          quantity: line.quantity.trim(),
          unit_price: line.unit_price.trim(),
        }
      : {
          product_id: line.product_id,
          quantity: line.quantity.trim(),
          ...(line.description.trim() ? { description: line.description.trim() } : {}),
          ...(line.unit?.trim() ? { unit: line.unit.trim() } : {}),
        }),
  };
}

export function removeInvoiceDraftLine<T>(lines: readonly T[], index: number): T[] {
  if (index < 0 || index >= lines.length || lines.length <= 1) return [...lines];
  return lines.filter((_, currentIndex) => currentIndex !== index);
}

/** Converts persisted draft lines into editable catalog/manual editor rows. */
export function invoiceDraftLinesFromExisting(lines: readonly {
  product_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  sold_unit?: string | null;
}[]): InvoiceDraftLine[] {
  return lines.map((line, index) => ({
    id: 'existing-invoice-line-' + (index + 1),
    kind: line.product_id ? 'product' : 'manual',
    product_id: line.product_id || '',
    description: line.description || '',
    quantity: line.quantity,
    unit_price: line.product_id ? '' : line.unit_price,
    unit: line.sold_unit || '',
  }));
}


export interface InvoiceDraftOutcomeSnapshot {
  readonly businessId: string;
  readonly invoiceNumber: string;
  readonly customerId: string;
  readonly discountRate: string;
  readonly taxRate: string;
  readonly editingInvoiceId: string | null;
}

/** Identity-scoped, memory-only recovery marker for an uncertain invoice mutation. */
export class InvoiceDraftOutcomeVault {
  private readonly records = new Map<string, InvoiceDraftOutcomeSnapshot>();

  private key(authUid: string, businessId: string): string {
    const uid = authUid.trim();
    const business = businessId.trim();
    if (!uid || !business) throw new RangeError('An authenticated user and business are required for an invoice draft outcome.');
    return JSON.stringify([uid, business]);
  }

  save(authUid: string, snapshot: InvoiceDraftOutcomeSnapshot): void {
    const copy = Object.freeze({ ...snapshot, businessId: snapshot.businessId.trim() });
    this.records.set(this.key(authUid, copy.businessId), copy);
  }

  get(authUid: string, businessId: string): InvoiceDraftOutcomeSnapshot | null {
    return this.records.get(this.key(authUid, businessId)) ?? null;
  }

  delete(authUid: string, businessId: string): void {
    this.records.delete(this.key(authUid, businessId));
  }
}


/** Resolve an uncertain invoice write without relying on a mutable invoice number for edits. */
export function findInvoiceDraftRecoveryMatch<T extends {
  id: string;
  invoice_number: string;
  customer_id?: string | null;
}>(
  invoices: readonly T[],
  pending: Pick<InvoiceDraftOutcomeSnapshot, 'editingInvoiceId' | 'invoiceNumber' | 'customerId'>,
): T | null {
  if (pending.editingInvoiceId) {
    return invoices.find(invoice => invoice.id === pending.editingInvoiceId) ?? null;
  }
  return invoices.find(invoice =>
    invoice.invoice_number === pending.invoiceNumber && invoice.customer_id === pending.customerId
  ) ?? null;
}
