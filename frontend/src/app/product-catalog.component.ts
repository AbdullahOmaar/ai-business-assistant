import { ChangeDetectionStrategy, computed, Component, input, signal } from '@angular/core';
import type { Product } from './api.service';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { inject } from '@angular/core';
import { LocalizationService } from './localization.service';
import { filterAndSortProducts, type ProductFilter, type ProductSortField, type SortDirection } from './directory-sort';


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
          <div class="product-catalog__filters" role="group" [attr.aria-label]="t("productCatalog.m_47v71n")">
            <button type="button" [class.is-active]="filter() === 'all'" [attr.aria-pressed]="filter() === 'all'" (click)="setFilter('all')">
              {{ t("productCatalog.m_1vmpuau") }} <span>{{ products().length }}</span>
            </button>
            <button type="button" [class.is-active]="filter() === 'stock'" [attr.aria-pressed]="filter() === 'stock'" (click)="setFilter('stock')">
              {{ t("productCatalog.m_j15h0g") }} <span>{{ stockCount() }}</span>
            </button>
            <button type="button" [class.is-active]="filter() === 'non-stock'" [attr.aria-pressed]="filter() === 'non-stock'" (click)="setFilter('non-stock')">
              {{ t("productCatalog.m_1c1wx97") }} <span>{{ nonStockCount() }}</span>
            </button>
          </div>
          <label class="product-catalog__mobile-sort">
            <span>{{ t("productCatalog.m_im1kwk") }}</span>
            <select [value]="mobileSortValue" (change)="onMobileSortChange($event)" [attr.aria-label]="t("productCatalog.m_c0h96b")">
              <option value="name:asc">{{ t("productCatalog.m_zh6wie") }}</option>
              <option value="name:desc">{{ t("productCatalog.m_1iina3u") }}</option>
              <option value="sku:asc">SKU ↑</option>
              <option value="sku:desc">SKU ↓</option>
              <option value="price:asc">{{ t("productCatalog.m_wwezy0") }}</option>
              <option value="price:desc">{{ t("productCatalog.m_1xbenai") }}</option>
              <option value="stock:asc">{{ t("productCatalog.m_2swnvr") }}</option>
              <option value="stock:desc">{{ t("productCatalog.m_1i9lwtp") }}</option>
            </select>
          </label>
        </div>

        @if (visibleProducts().length) {
        <div class="product-catalog__desktop" role="region" tabindex="0" [attr.aria-label]="ariaLabel()">
          <table>
            <caption class="product-catalog__sr-only">{{ ariaLabel() }}</caption>
            <thead><tr>
              <th scope="col" [attr.aria-sort]="ariaSort('name')"><button type="button" (click)="toggleSort('name')">{{ t("productCatalog.m_pamfhv") }} <span aria-hidden="true">{{ sortIndicator('name') }}</span></button></th>
              <th scope="col" [attr.aria-sort]="ariaSort('sku')"><button type="button" (click)="toggleSort('sku')">SKU <span aria-hidden="true">{{ sortIndicator('sku') }}</span></button></th>
              <th scope="col" [attr.aria-sort]="ariaSort('price')"><button type="button" (click)="toggleSort('price')">{{ t("productCatalog.m_1iz2xk3") }} <span aria-hidden="true">{{ sortIndicator('price') }}</span></button></th>
              <th scope="col" [attr.aria-sort]="ariaSort('stock')"><button type="button" (click)="toggleSort('stock')">{{ t("productCatalog.m_1w4exkr") }} <span aria-hidden="true">{{ sortIndicator('stock') }}</span></button></th>
            </tr></thead>
            <tbody>
              @for (product of visibleProducts(); track product.id) {
                <tr>
                  <th scope="row" class="product-catalog__name">{{ product.name }}</th>
                  <td><bdi dir="ltr">{{ product.sku || '—' }}</bdi></td>
                  <td class="product-catalog__price"><bdi dir="ltr">{{ product.unit_price }} {{ product.currency_code || currencyCode() }}</bdi></td>
                  <td>
                    @if (product.is_stock_tracked) {
                      <span class="product-catalog__stock"><span class="product-catalog__dot" aria-hidden="true"></span>{{ t("productCatalog.m_1abb5if") }}</span>
                      <strong class="product-catalog__quantity"><bdi dir="ltr">{{ product.stock_quantity ?? '0' }}</bdi></strong>
                    } @else {
                      <span class="product-catalog__service">{{ t("productCatalog.m_1c1wx97") }}</span>
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
                  <span class="product-catalog__stock"><span class="product-catalog__dot" aria-hidden="true"></span>{{ t("productCatalog.m_j15h0g") }}</span>
                  <span class="product-catalog__quantity">{{ t("productCatalog.m_j49abf") }}: <bdi dir="ltr">{{ product.stock_quantity ?? '0' }}</bdi></span>
                } @else {
                  <span class="product-catalog__service">{{ t("productCatalog.m_1c1wx97") }}</span>
                }
              </div>
            </li>
          }
        </ol>
        } @else {
          <aba-state-message
            kind="empty"
            [title]="filter() !== 'all' ? (t("productCatalog.m_82udzb")) : emptyTitle()"
            [description]="filter() !== 'all' ? (t("productCatalog.m_m1cwj0")) : emptyDescription()"
          />
        }
        @if (filter() !== 'all') {
          <button class="product-catalog__clear-filter" type="button" (click)="setFilter('all')">
            {{ t("productCatalog.m_9qo8uh") }}
          </button>
        }
      }
    </section>
  `,
  styleUrl: './product-catalog.component.css',
})
export class ProductCatalogComponent {
  private readonly localization = inject(LocalizationService);
  t(key: string): string { return this.localization.translate(key); }
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
  readonly visibleProducts = computed(() =>
    filterAndSortProducts(this.products(), this.filter(), this.sortField(), this.sortDirection(), this.locale(), this.currencyCode())
  );

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
