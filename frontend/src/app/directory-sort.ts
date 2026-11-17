import type { Customer, Product } from './api.service';

export type SortDirection = 'asc' | 'desc';
export type CustomerSortField = 'name' | 'email' | 'phone';
export type ProductFilter = 'all' | 'stock' | 'non-stock';
export type ProductSortField = 'name' | 'sku' | 'price' | 'stock';

type DecimalParts = { sign: -1 | 1; integer: string; fraction: string };

function parseDecimal(value: string): DecimalParts | null {
  const match = /^([+-]?)(\\d+)(?:\\.(\\d+))?$/.exec(value.trim());
  if (!match) return null;
  const integer = match[2].replace(/^0+(?=\\d)/, '');
  const fraction = (match[3] || '').replace(/0+$/, '');
  const isZero = integer === '0' && fraction.length === 0;
  return {
    sign: isZero || match[1] !== '-' ? 1 : -1,
    integer,
    fraction,
  };
}

/** Compares decimal strings exactly, without converting money or stock to IEEE-754 numbers. */
function compareDecimalStrings(leftValue: string, rightValue: string): number | null {
  const left = parseDecimal(leftValue);
  const right = parseDecimal(rightValue);
  if (!left || !right) return null;
  if (left.sign !== right.sign) return left.sign < right.sign ? -1 : 1;

  let magnitude = left.integer.length - right.integer.length;
  if (magnitude === 0) {
    magnitude = left.integer < right.integer ? -1 : left.integer > right.integer ? 1 : 0;
  }
  if (magnitude === 0) {
    const length = Math.max(left.fraction.length, right.fraction.length);
    const leftFraction = left.fraction.padEnd(length, '0');
    const rightFraction = right.fraction.padEnd(length, '0');
    magnitude = leftFraction < rightFraction ? -1 : leftFraction > rightFraction ? 1 : 0;
  }
  return magnitude * left.sign;
}

export function sortCustomers(customers: readonly Customer[], field: CustomerSortField, direction: SortDirection, locale: 'ar' | 'en'): Customer[] {
  const multiplier = direction === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base', ignorePunctuation: true });
  return [...customers].sort((left, right) => {
    const leftValue = (left[field] || '').trim();
    const rightValue = (right[field] || '').trim();
    if (!leftValue && rightValue) return 1;
    if (leftValue && !rightValue) return -1;
    return collator.compare(leftValue, rightValue) * multiplier;
  });
}

export function filterAndSortProducts(
  products: readonly Product[],
  filter: ProductFilter,
  field: ProductSortField,
  direction: SortDirection,
  locale: 'ar' | 'en',
  currencyCode: string,
): Product[] {
  const filtered = products.filter(product => {
    if (filter === 'stock') return product.is_stock_tracked;
    if (filter === 'non-stock') return !product.is_stock_tracked;
    return true;
  });
  const multiplier = direction === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base', ignorePunctuation: true });
  return filtered.sort((left, right) => {
    if (field === 'price') {
      // Keep unlike currencies in separate groups; never compare their amounts.
      const leftCurrency = left.currency_code || currencyCode;
      const rightCurrency = right.currency_code || currencyCode;
      const currencyOrder = collator.compare(leftCurrency, rightCurrency);
      if (currencyOrder !== 0) return currencyOrder;
      return (compareDecimalStrings(left.unit_price, right.unit_price) ?? collator.compare(left.unit_price, right.unit_price)) * multiplier;
    }
    if (field === 'stock') {
      // Non-stock items remain after tracked inventory in either direction.
      if (left.is_stock_tracked !== right.is_stock_tracked) return left.is_stock_tracked ? -1 : 1;
      const leftQuantity = left.stock_quantity ?? '0';
      const rightQuantity = right.stock_quantity ?? '0';
      return (compareDecimalStrings(leftQuantity, rightQuantity) ?? collator.compare(leftQuantity, rightQuantity)) * multiplier;
    }
    const leftValue = field === 'name' ? left.name : left.sku || '';
    const rightValue = field === 'name' ? right.name : right.sku || '';
    if (!leftValue && rightValue) return 1;
    if (leftValue && !rightValue) return -1;
    return collator.compare(leftValue, rightValue) * multiplier;
  });
}
