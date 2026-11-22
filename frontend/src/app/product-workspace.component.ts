import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ApiService, type Product } from './api.service';
import type { ProductEditorValue } from './product-editor.component';
import { ProductCatalogComponent } from './product-catalog.component';
import { ProductEditorComponent } from './product-editor.component';
import { ProductProfileComponent } from './product-profile.component';
import { WorkspaceLoadGuard } from './workspace-load-guard';
import { LocalizationService } from './localization.service';

type ProductWorkspaceContext = { businessId: string; userId: string; role: 'owner' | 'staff' };

/** Tenant-scoped product list/detail/edit workflow; create and financial mutations remain separately gated. */
@Component({
  selector: 'aba-product-workspace',
  standalone: true,
  imports: [ProductCatalogComponent, ProductEditorComponent, ProductProfileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="product-workspace" [attr.aria-label]="t('productEditor.eyebrow')">
      @if (mode() === 'list') {
        <aba-product-catalog
          [ariaLabel]="t('productEditor.eyebrow')"
          [products]="products()"
          [locale]="locale()"
          [currencyCode]="currencyCode()"
          [loading]="loading()"
          [error]="error()"
          (retry)="retry()"
          [emptyTitle]="t('ui.m_12dkqai')"
          [emptyDescription]="''"
          (select)="openProduct($event)" />
        @if (hasMore() && !error()) {
          <button class="product-workspace__load-more" type="button" [disabled]="loading()" (click)="loadMore()" [attr.aria-live]="'polite'">
            {{ loadingMore() ? t('ui.m_1dwk1vm') : t('ui.m_iziq6h') }}
          </button>
        }
      } @else if (mode() === 'edit') {
        <aba-product-editor
          [product]="selectedProduct()"
          [busy]="saving()"
          [error]="editorError()"
          (save)="saveProduct($event)"
          (cancel)="cancelEditor()" />
      } @else {
        <button class="product-workspace__back" type="button" (click)="backToCatalog()">
          {{ t('productEditor.cancel') }}
        </button>
        <aba-product-profile
          [product]="selectedProduct()"
          [loading]="detailLoading()"
          [error]="detailError()"
          [currencyCode]="currencyCode()"
          (retry)="retryProfile()"
          (edit)="editProduct()" />
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}.product-workspace{display:grid;gap:12px;min-width:0}
    .product-workspace button{min-height:44px;padding:8px 13px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:10px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    .product-workspace__load-more{justify-self:center;min-width:min(100%,220px)}
    .product-workspace__back{justify-self:start}
    .product-workspace :is(button):focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    @media(max-width:760px){.product-workspace button{min-height:48px}}@media(forced-colors:active){.product-workspace button{border:1px solid CanvasText}.product-workspace button:focus-visible{outline-color:Highlight}}
  `],
})
export class ProductWorkspaceComponent {
  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly listGuard = new WorkspaceLoadGuard();
  private readonly detailGuard = new WorkspaceLoadGuard();
  private readonly saveGuard = new WorkspaceLoadGuard();

  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input.required<'owner' | 'staff'>();
  readonly locale = input<'ar' | 'en'>('ar');
  readonly currencyCode = input('');
  /** Incremented by the host shell to request a list refresh (e.g. after a CSV import). */
  readonly refreshRequest = input(0);

  readonly mode = signal<'list' | 'profile' | 'edit'>('list');
  readonly products = signal<Product[]>([]);
  readonly selectedProduct = signal<Product | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly detailLoading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly editorError = signal('');
  readonly hasMore = signal(false);

  private offset = 0;
  private readonly pageSize = 50;
  private selectedProductId: string | null = null;

  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => {
        this.listGuard.invalidate();
        this.detailGuard.invalidate();
        this.saveGuard.invalidate();
        this.products.set([]);
        this.selectedProduct.set(null);
        this.selectedProductId = null;
        this.offset = 0;
        this.hasMore.set(false);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.detailLoading.set(false);
        this.saving.set(false);
        this.mode.set('list');
        this.error.set('');
        this.detailError.set('');
        this.editorError.set('');
        if (context.businessId && context.userId) void this.loadProducts(true);
      });
    });
    effect(() => {
      const request = this.refreshRequest();
      untracked(() => {
        if (request > 0) void this.loadProducts(true);
      });
    });
  }

  t(key: string): string { return this.localization.translate(key); }

  private context(): ProductWorkspaceContext {
    return { businessId: this.businessId(), userId: this.userId(), role: this.role() };
  }

  private isCurrent(guard: WorkspaceLoadGuard, version: number, requested: ProductWorkspaceContext): boolean {
    const current = this.context();
    return guard.isCurrent(version, current.businessId, requested.businessId)
      && current.userId === requested.userId
      && current.role === requested.role;
  }

  async loadProducts(reset = false): Promise<void> {
    const requested = this.context();
    if (!requested.businessId || !requested.userId) return;
    const version = this.listGuard.begin();
    if (reset) {
      this.offset = 0;
      this.products.set([]);
      this.hasMore.set(false);
    }
    this.loading.set(true);
    this.loadingMore.set(!reset);
    this.error.set('');
    try {
      const records = await this.api.products(requested.businessId, this.offset, this.pageSize);
      if (!this.isCurrent(this.listGuard, version, requested)) return;
      const combined = reset ? records : [...this.products(), ...records];
      const unique = new Map<string, Product>();
      for (const record of combined) unique.set(record.id, record);
      this.products.set([...unique.values()]);
      this.offset = reset ? records.length : this.offset + records.length;
      this.hasMore.set(records.length === this.pageSize);
    } catch {
      if (this.isCurrent(this.listGuard, version, requested)) this.error.set(this.t('ui.m_g15vmh'));
    } finally {
      if (this.isCurrent(this.listGuard, version, requested)) {
        this.loading.set(false);
        this.loadingMore.set(false);
      }
    }
  }

  loadMore(): void {
    if (this.hasMore() && !this.loading()) void this.loadProducts(false);
  }

  retry(): void { void this.loadProducts(true); }

  async openProduct(productId: string): Promise<void> {
    const requested = this.context();
    const version = this.detailGuard.begin();
    this.selectedProductId = productId;
    this.selectedProduct.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.mode.set('profile');
    try {
      const record = await this.api.product(requested.businessId, productId);
      if (!this.isCurrent(this.detailGuard, version, requested) || this.selectedProductId !== productId) return;
      this.selectedProduct.set(record);
    } catch {
      if (this.isCurrent(this.detailGuard, version, requested) && this.selectedProductId === productId) {
        this.detailError.set(this.t('ui.m_g15vmh'));
      }
    } finally {
      if (this.isCurrent(this.detailGuard, version, requested) && this.selectedProductId === productId) {
        this.detailLoading.set(false);
      }
    }
  }

  editProduct(): void {
    if (!this.selectedProduct()) return;
    this.editorError.set('');
    this.mode.set('edit');
  }

  async saveProduct(value: ProductEditorValue): Promise<void> {
    const requested = this.context();
    const productId = this.selectedProductId;
    if (!productId || this.mode() !== 'edit') return;
    const version = this.saveGuard.begin();
    this.saving.set(true);
    this.editorError.set('');
    try {
      const record = await this.api.updateProduct(requested.businessId, productId, value);
      if (!this.isCurrent(this.saveGuard, version, requested) || this.selectedProductId !== productId) return;
      this.selectedProduct.set(record);
      this.products.update(rows => rows.map(row => row.id === record.id ? record : row));
      this.mode.set('profile');
    } catch {
      if (this.isCurrent(this.saveGuard, version, requested)) this.editorError.set(this.t('ui.m_g15vmh'));
    } finally {
      if (this.isCurrent(this.saveGuard, version, requested)) this.saving.set(false);
    }
  }

  cancelEditor(): void {
    this.editorError.set('');
    this.mode.set('profile');
  }

  backToCatalog(): void {
    this.detailGuard.invalidate();
    this.detailLoading.set(false);
    this.detailError.set('');
    this.mode.set('list');
  }

  retryProfile(): void {
    if (this.selectedProductId) void this.openProduct(this.selectedProductId);
  }
}
