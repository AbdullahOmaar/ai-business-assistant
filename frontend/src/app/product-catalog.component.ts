import { ChangeDetectionStrategy, computed, Component, input, signal } from '@angular/core';
import type { Product } from './api.service';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';

type ProductFilter = 'all' | 'stock' | 'non-stock';
type ProductSortField = 'name' | 'sku' | 'price' | 'stock';
type SortDirection = 'asc' | 'desc';

/**
 * Product catalogue presentation. Search is owned by the workspace screen;
 * this component adds local type filtering and deterministic sorting without
 * changing inventory quantities, pricing or stock semantics.
 */
@Component({
  selector: 'aba-product-catalog',
  standalone: true,
  imports: [AbaStateMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="product-catalog" [attr.aria-label]="ariaLabel()">
      @if (loading()) {
        <aba-state-message kind="loading" [description]="loadingDescription()" />
      } @else {
        <div class="product-catalog__toolbar">
          <div class="product-catalog__filters" role="group" [attr.aria-label]="locale() === 'ar' ? 'تصفية نوع الصنف' : 'Filter item type'">
            <button type="button" [class.is-active]="filter() === 'all'" [attr.aria-pressed]="filter() === 'all'" (click)="setFilter('all')">
              {{ locale() === 'ar' ? 'الكل' : 'All' }} <span>{{ products().length }}</span>
            </button>
            <button type="button" [class.is-active]="filter() === 'stock'" [attr.aria-pressed]="filter() === 'stock'" (click)="setFilter('stock')">
              {{ locale() === 'ar' ? 'مخزني' : 'Stock tracked' }} <span>{{ stockCount() }}</span>
            </button>
            <button type="button" [class.is-active]="filter() === 'non-stock'" [attr.aria-pressed]="filter() === 'non-stock'" (click)="setFilter('non-stock')">
              {{ locale() === 'ar' ? 'غير مخزني' : 'Non-stock' }} <span>{{ nonStockCount() }}</span>
            </button>
          </div>
          <label class="product-catalog__mobile-sort">
            <span>{{ locale() === 'ar' ? 'ترتيب' : 'Sort' }}</span>
            <select [value]="mobileSortValue" (change)="onMobileSortChange($event)" [attr.aria-label]="locale() === 'ar' ? 'ترتيب المنتجات' : 'Sort products'">
              <option value="name:asc">{{ locale() === 'ar' ? 'الاسم: أ–ي' : 'Name: A–Z' }}</option>
              <option value="name:desc">{{ locale() === 'ar' ? 'الاسم: ي–أ' : 'Name: Z–A' }}</option>
              <option value="sku:asc">SKU ↑</option>
              <option value="sku:desc">SKU ↓</option>
              <option value="price:asc">{{ locale() === 'ar' ? 'السعر: الأقل أولًا' : 'Price: low to high' }}</option>
              <option value="price:desc">{{ locale() === 'ar' ? 'السعر: الأعلى أولًا' : 'Price: high to low' }}</option>
              <option value="stock:asc">{{ locale() === 'ar' ? 'المخزون: الأقل أولًا' : 'Stock: low to high' }}</option>
              <option value="stock:desc">{{ locale() === 'ar' ? 'المخزون: الأعلى أولًا' : 'Stock: high to low' }}</option>
            </select>
          </label>
        </div>

        @if (visibleProducts().length) {
        <div class="product-catalog__desktop" role="region" tabindex="0" [attr.aria-label]="ariaLabel()">
          <table>
            <caption class="product-catalog__sr-only">{{ ariaLabel() }}</caption>
            <thead><tr>
              <th scope="col" [attr.aria-sort]="ariaSort('name')"><button type="button" (click)="toggleSort('name')">{{ locale() === 'ar' ? 'المنتج / غير مخزني' : 'Product / non-stock' }} <span aria-hidden="true">{{ sortIndicator('name') }}</span></button></th>
              <th scope="col" [attr.aria-sort]="ariaSort('sku')"><button type="button" (click)="toggleSort('sku')">SKU <span aria-hidden="true">{{ sortIndicator('sku') }}</span></button></th>
              <th scope="col" [attr.aria-sort]="ariaSort('price')"><button type="button" (click)="toggleSort('price')">{{ locale() === 'ar' ? 'سعر الوحدة' : 'Unit price' }} <span aria-hidden="true">{{ sortIndicator('price') }}</span></button></th>
              <th scope="col" [attr.aria-sort]="ariaSort('stock')"><button type="button" (click)="toggleSort('stock')">{{ locale() === 'ar' ? 'المخزون' : 'Inventory' }} <span aria-hidden="true">{{ sortIndicator('stock') }}</span></button></th>
            </tr></thead>
            <tbody>
              @for (product of visibleProducts(); track product.id) {
                <tr>
                  <th scope="row" class="product-catalog__name">{{ product.name }}</th>
                  <td><bdi dir="ltr">{{ product.sku || '—' }}</bdi></td>
                  <td class="product-catalog__price"><bdi dir="ltr">{{ product.unit_price }} {{ product.currency_code || currencyCode() }}</bdi></td>
                  <td>
                    @if (product.is_stock_tracked) {
                      <span class="product-catalog__stock"><span class="product-catalog__dot" aria-hidden="true"></span>{{ locale() === 'ar' ? 'متابعة المخزون' : 'Stock tracked' }}</span>
                      <strong class="product-catalog__quantity"><bdi dir="ltr">{{ product.stock_quantity ?? '0' }}</bdi></strong>
                    } @else {
                      <span class="product-catalog__service">{{ locale() === 'ar' ? 'غير مخزني' : 'Non-stock' }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <ol class="product-catalog__mobile-list" [attr.aria-label]="ariaLabel()">
          @for (product of visibleProducts(); track product.id) {
            <li class="product-catalog__mobile-row">
              <div class="product-catalog__main">
                <h3>{{ product.name }}</h3>
                <strong class="product-catalog__mobile-price"><bdi dir="ltr">{{ product.unit_price }} {{ product.currency_code || currencyCode() }}</bdi></strong>
              </div>
              <div class="product-catalog__meta">
                <span class="product-catalog__sku"><span>SKU</span> <bdi dir="ltr">{{ product.sku || '—' }}</bdi></span>
                @if (product.is_stock_tracked) {
                  <span class="product-catalog__stock"><span class="product-catalog__dot" aria-hidden="true"></span>{{ locale() === 'ar' ? 'مخزني' : 'Stock tracked' }}</span>
                  <span class="product-catalog__quantity">{{ locale() === 'ar' ? 'الكمية' : 'Qty' }}: <bdi dir="ltr">{{ product.stock_quantity ?? '0' }}</bdi></span>
                } @else {
                  <span class="product-catalog__service">{{ locale() === 'ar' ? 'غير مخزني' : 'Non-stock' }}</span>
                }
              </div>
            </li>
          }
        </ol>
        } @else {
          <aba-state-message
            kind="empty"
            [title]="filter() !== 'all' ? (locale() === 'ar' ? 'لا توجد أصناف ضمن هذا التصنيف' : 'No items in this category') : emptyTitle()"
            [description]="filter() !== 'all' ? (locale() === 'ar' ? 'جرّب نوعًا آخر أو اعرض كل الأصناف.' : 'Try another type or show all items.') : emptyDescription()"
          />
        }
        @if (filter() !== 'all') {
          <button class="product-catalog__clear-filter" type="button" (click)="setFilter('all')">
            {{ locale() === 'ar' ? 'عرض كل الأصناف' : 'Show all items' }}
          </button>
        }
      }
    </section>
  `,
  styleUrl: './product-catalog.component.css',
})
export class ProductCatalogComponent {
  readonly ariaLabel = input.required<string>();
  readonly products = input<readonly Product[]>([]);
  readonly locale = input<'ar' | 'en'>('ar');
  readonly currencyCode = input('');
  readonly loading = input(false);
  readonly loadingDescription = input('');
  readonly emptyTitle = input('');
  readonly emptyDescription = input('');

  readonly filter = signal<ProductFilter>('all');
  private readonly sortField = signal<ProductSortField>('name');
  private readonly sortDirection = signal<SortDirection>('asc');

  readonly stockCount = computed(() => this.products().filter(product => product.is_stock_tracked).length);
  readonly nonStockCount = computed(() => this.products().length - this.stockCount());
  readonly visibleProducts = computed(() => {
    const filtered = this.products().filter(product => {
      if (this.filter() === 'stock') return product.is_stock_tracked;
      if (this.filter() === 'non-stock') return !product.is_stock_tracked;
      return true;
    });
    const field = this.sortField();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    const collator = new Intl.Collator(this.locale(), { numeric: true, sensitivity: 'base', ignorePunctuation: true });
    return filtered.sort((left, right) => {
      if (field === 'price') {
        const leftCurrency = left.currency_code || this.currencyCode();
        const rightCurrency = right.currency_code || this.currencyCode();
        const currencyOrder = collator.compare(leftCurrency, rightCurrency);
        if (currencyOrder !== 0) return currencyOrder;
        return (Number(left.unit_price) - Number(right.unit_price)) * direction;
      }
      if (field === 'stock') {
        if (left.is_stock_tracked !== right.is_stock_tracked) return left.is_stock_tracked ? -1 : 1;
        return (Number(left.stock_quantity ?? 0) - Number(right.stock_quantity ?? 0)) * direction;
      }
      const leftValue = field === 'name' ? left.name : left.sku || '';
      const rightValue = field === 'name' ? right.name : right.sku || '';
      if (!leftValue && rightValue) return 1;
      if (leftValue && !rightValue) return -1;
      return collator.compare(leftValue, rightValue) * direction;
    });
  });

  get mobileSortValue(): string {
    return this.sortField() + ':' + this.sortDirection();
  }

  setFilter(filter: ProductFilter): void {
    this.filter.set(filter);
  }

  toggleSort(field: ProductSortField): void {
    if (this.sortField() === field) {
      this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortField.set(field);
    this.sortDirection.set('asc');
  }

  onMobileSortChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement | null)?.value || '';
    const [field, direction] = value.split(':');
    if (!['name', 'sku', 'price', 'stock'].includes(field)) return;
    if (direction !== 'asc' && direction !== 'desc') return;
    this.sortField.set(field as ProductSortField);
    this.sortDirection.set(direction);
  }

  ariaSort(field: ProductSortField): 'ascending' | 'descending' | 'none' {
    if (this.sortField() !== field) return 'none';
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  sortIndicator(field: ProductSortField): string {
    if (this.sortField() !== field) return '↕';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }
}
