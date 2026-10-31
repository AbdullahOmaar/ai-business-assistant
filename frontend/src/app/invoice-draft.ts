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
}

export type InvoiceDraftLinePayload =
  | { product_id: string; quantity: string; description?: string }
  | { description: string; quantity: string; unit_price: string };

export interface InvoiceDraftPayload {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  lines: InvoiceDraftLinePayload[];
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

export function validateInvoiceDraft(
  input: InvoiceDraftInput,
  products: readonly InvoiceDraftProduct[],
  customers: readonly InvoiceDraftCustomer[],
): string | null {
  if (!input.invoice_number.trim() || input.invoice_number.trim().length > 80) {
    return 'Enter an invoice number of 1 to 80 characters.';
  }
  if (!input.customer_id || !customers.some(customer => customer.id === input.customer_id)) {
    return 'Choose a valid customer.';
  }
  if (!/^[A-Za-z]{3}$/.test(input.currency_code.trim())) {
    return 'Enter a valid three-letter currency code.';
  }
  if (!input.lines.length) return 'Add at least one invoice line.';

  for (const line of input.lines) {
    const quantity = line.quantity.trim();
    if (!DECIMAL_QUANTITY.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      return 'Every line needs a positive quantity with at most three decimal places.';
    }
    if (line.kind === 'product') {
      if (!line.product_id || !products.some(product => product.id === line.product_id)) {
        return 'Choose a valid catalog product for every product line.';
      }
      if (line.description.trim().length > 500) return 'A line description cannot exceed 500 characters.';
      continue;
    }
    if (!line.description.trim() || line.description.trim().length > 500) {
      return 'Every manual line needs a description of 1 to 500 characters.';
    }
    const price = line.unit_price.trim();
    if (!DECIMAL_PRICE.test(price) || !Number.isFinite(Number(price)) || Number(price) < 0) {
      return 'Every manual line needs a non-negative unit price with at most two decimal places.';
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

export function localizeInvoiceDraftValidationMessage(message: string, language: 'ar' | 'en'): string {
  if (language !== 'ar') return message;
  const arabic: Record<string, string> = {
    'Enter an invoice number of 1 to 80 characters.': 'أدخل رقم فاتورة من حرف إلى 80 حرفًا.',
    'Choose a valid customer.': 'اختَر عميلًا صحيحًا.',
    'Enter a valid three-letter currency code.': 'أدخل رمز عملة صحيحًا من ثلاثة أحرف.',
    'Add at least one invoice line.': 'أضف بندًا واحدًا على الأقل للفاتورة.',
    'Every line needs a positive quantity with at most three decimal places.': 'يجب أن تكون كمية كل بند أكبر من صفر وبحد أقصى 3 خانات عشرية.',
    'Choose a valid catalog product for every product line.': 'اختَر منتجًا صحيحًا من قائمة المنتجات لكل بند.',
    'A line description cannot exceed 500 characters.': 'لا يمكن أن يتجاوز وصف البند 500 حرف.',
    'Every manual line needs a description of 1 to 500 characters.': 'يجب أن يحتوي كل بند يدوي على وصف من حرف إلى 500 حرف.',
    'Every manual line needs a non-negative unit price with at most two decimal places.': 'يجب أن يكون سعر الوحدة للبند اليدوي صفرًا أو أكثر وبحد أقصى خانتين عشريتين.',
  };
  return arabic[message] ?? message;
}

export function moveInvoiceDraftLine<T>(lines: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= lines.length || target < 0 || target >= lines.length) return [...lines];
  const next = [...lines];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function removeInvoiceDraftLine<T>(lines: readonly T[], index: number): T[] {
  if (index < 0 || index >= lines.length || lines.length <= 1) return [...lines];
  return lines.filter((_, currentIndex) => currentIndex !== index);
}
