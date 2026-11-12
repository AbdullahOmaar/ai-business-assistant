import type { Customer, Product } from './api.service';

export type SortDirection = 'asc' | 'desc';
export type CustomerSortField = 'name' | 'email' | 'phone';
export type ProductFilter = 'all' | 'stock' | 'non-stock';
export type ProductSortField = 'name' | 'sku' | 'price' | 'stock';

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
      return (Number(left.unit_price) - Number(right.unit_price)) * multiplier;
    }
    if (field === 'stock') {
      // Non-stock items remain after tracked inventory in either direction.
      if (left.is_stock_tracked !== right.is_stock_tracked) return left.is_stock_tracked ? -1 : 1;
      return (Number(left.stock_quantity ?? 0) - Number(right.stock_quantity ?? 0)) * multiplier;
    }
    const leftValue = field === 'name' ? left.name : left.sku || '';
    const rightValue = field === 'name' ? right.name : right.sku || '';
    if (!leftValue && rightValue) return 1;
    if (leftValue && !rightValue) return -1;
    return collator.compare(leftValue, rightValue) * multiplier;
  });
}
