export type InvoiceDraftLineKind = 'product' | 'manual';

export interface InvoiceDraftLine {
  id: string;
  kind: InvoiceDraftLineKind;
  product_id: string;
  description: string;
  quantity: string;
  unit_price: string;
}

export interface InvoiceDraftProduct {
  id: string;
  name: string;
  unit_price?: string;
}

export interface InvoiceDraftCustomer {
  id: string;
  name: string;
}

export interface InvoiceDraftInput {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  lines: readonly InvoiceDraftLine[];
  notes?: string;
}

export type InvoiceDraftLinePayload =
  | { product_id: string; quantity: string; description?: string }
  | { description: string; quantity: string; unit_price: string };

export interface InvoiceDraftPayload {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  lines: InvoiceDraftLinePayload[];
  notes?: string | null;
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
  if (!input.lines.length) return "invoiceDraft.validation.atLeastOneLine";
  if (input.lines.length > 500) return "invoiceDraft.validation.lineLimit";

  for (const line of input.lines) {
    const quantity = line.quantity.trim();
    if (!DECIMAL_QUANTITY.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 ||
        exceedsInvoiceDecimalPrecision(quantity, 11)) {
      return "invoiceDraft.validation.quantity";
    }
    if (line.kind === 'product') {
      if (!line.product_id || !products.some(product => product.id === line.product_id)) {
        return "invoiceDraft.validation.catalogProduct";
      }
      if (line.description.trim().length > 300) return "invoiceDraft.validation.descriptionLength";
      continue;
    }
    if (!line.description.trim() || line.description.trim().length > 300) {
      return "invoiceDraft.validation.manualDescription";
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

  return {
    invoice_number: input.invoice_number.trim(),
    currency_code: input.currency_code.trim().toUpperCase(),
    customer_id: input.customer_id,
    notes: input.notes?.trim() || null,
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
        }),
  };
}
