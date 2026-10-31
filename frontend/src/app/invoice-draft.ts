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
  unit_price: string;
}

export interface InvoiceDraftInput {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  discount_rate: string;
  tax_rate: string;
  lines: InvoiceDraftLine[];
}

export interface InvoiceDraftPayload {
  invoice_number: string;
  currency_code: string;
  customer_id: string;
  discount_rate: string;
  tax_rate: string;
  lines: Array<{ product_id: string; quantity: string; description?: string } | { description: string; quantity: string; unit_price: string }>;
}

const DECIMAL_QUANTITY = /^\d+(?:\.\d{1,3})?$/;
const DECIMAL_PRICE = /^\d+(?:\.\d{1,2})?$/;

function isRate(value: string): boolean {
  if (!value.trim()) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
}

export function validateInvoiceDraft(input: InvoiceDraftInput, products: readonly InvoiceDraftProduct[]): string | null {
  if (!input.customer_id.trim()) return 'Choose a customer before saving the invoice.';
  if (!input.currency_code.trim()) return 'A workspace currency is required.';
  if (!input.lines.length) return 'Add at least one invoice line.';
  if (!isRate(input.discount_rate) || !isRate(input.tax_rate)) return 'Discount and tax rates must be between 0 and 100.';

  for (const line of input.lines) {
    if (!DECIMAL_QUANTITY.test(line.quantity.trim()) || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
      return 'Every line must have a positive quantity with at most three decimal places.';
    }
    if (line.kind === 'product') {
      if (!line.product_id || !products.some(product => product.id === line.product_id)) {
        return 'Choose a valid catalog product for every product line.';
      }
      continue;
    }
    if (!line.description.trim() || line.description.trim().length > 500) {
      return 'Every manual line needs a description of 1 to 500 characters.';
    }
    if (!DECIMAL_PRICE.test(line.unit_price.trim()) || !Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0) {
      return 'Every manual line needs a non-negative unit price with at most two decimal places.';
    }
  }
  return null;
}

export function localizeInvoiceDraftValidationMessage(message: string, language: 'ar' | 'en'): string {
  if (language !== 'ar') return message;
  const arabic: Record<string, string> = {
    'Choose a customer before saving the invoice.': 'اختَر العميل قبل حفظ الفاتورة.',
    'A workspace currency is required.': 'عملة مساحة العمل مطلوبة.',
    'Add at least one invoice line.': 'أضف بندًا واحدًا على الأقل للفاتورة.',
    'Discount and tax rates must be between 0 and 100.': 'يجب أن تكون نسبتا الخصم والضريبة بين 0 و100.',
    'Every line must have a positive quantity with at most three decimal places.': 'يجب أن تكون كمية كل بند أكبر من صفر وبحد أقصى 3 خانات عشرية.',
    'Choose a valid catalog product for every product line.': 'اختَر منتجًا صحيحًا من قائمة المنتجات لكل بند منتج.',
    'Every manual line needs a description of 1 to 500 characters.': 'يجب أن يحتوي كل بند يدوي على وصف من حرف إلى 500 حرف.',
    'Every manual line needs a non-negative unit price with at most two decimal places.': 'يجب أن يكون سعر الوحدة للبند اليدوي صفرًا أو أكثر وبحد أقصى خانتين عشريتين.',
  };
  return arabic[message] ?? message;
}

export function toInvoiceDraftPayload(input: InvoiceDraftInput, products: readonly InvoiceDraftProduct[]): InvoiceDraftPayload {
  const error = validateInvoiceDraft(input, products);
  if (error) throw new RangeError(error);

  return {
    invoice_number: input.invoice_number.trim() || `INV-${Date.now()}`,
    currency_code: input.currency_code.trim().toUpperCase(),
    customer_id: input.customer_id,
    discount_rate: input.discount_rate.trim(),
    tax_rate: input.tax_rate.trim(),
    lines: input.lines.map(line => line.kind === 'manual'
      ? { description: line.description.trim(), quantity: line.quantity.trim(), unit_price: line.unit_price.trim() }
      : {
          product_id: line.product_id,
          quantity: line.quantity.trim(),
          ...(line.description.trim() ? { description: line.description.trim() } : {}),
        }),
  };
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
