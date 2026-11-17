import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import type { Product } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard } from './workspace-load-guard';

export type InventoryMovementType = 'opening' | 'receipt' | 'sale' | 'return' | 'adjustment';
export interface InventoryMovement {
  id: string;
  product_id: string;
  movement_type: InventoryMovementType;
  quantity_delta: string;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by_subject: string | null;
  created_at: string;
  product: { id: string; name: string; sku: string | null; unit: string | null };
}
export interface InventoryMovementPage {
  items: InventoryMovement[];
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface InventoryMovementQuery {
  businessId: string;
  productId: string;
  movementType: InventoryMovementType | '';
  limit: number;
  offset: number;
}
export type InventoryMovementLoader = (query: InventoryMovementQuery) => Promise<InventoryMovementPage>;

type MovementContext = { businessId: string; userId: string; role: 'owner' | 'staff' };

const MOVEMENT_TYPES: InventoryMovementType[] = ['opening', 'receipt', 'sale', 'return', 'adjustment'];

/** Read-only, mobile-first ledger. The host supplies the authenticated API adapter and current products. */
@Component({
  selector: 'aba-inventory-movement-ledger',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="inventory-ledger" [attr.dir]="direction()" [attr.aria-label]="copy().title">
      <header class="inventory-ledger__header">
        <div>
          <p class="inventory-ledger__eyebrow">{{ copy().eyebrow }}</p>
          <h2>{{ copy().title }}</h2>
          <p class="inventory-ledger__muted">{{ copy().subtitle }}</p>
        </div>
        <button type="button" class="inventory-ledger__refresh" (click)="refresh()" [disabled]="loading()">{{ copy().refresh }}</button>
      </header>

      <div class="inventory-ledger__filters" role="group" [attr.aria-label]="copy().filters">
        <label>
          <span>{{ copy().product }}</span>
          <select [value]="productId()" (change)="setProduct(readValue($event))" [disabled]="loading()">
            <option value="">{{ copy().allProducts }}</option>
            @for (product of products(); track product.id) {
              <option [value]="product.id">{{ product.name }}{{ product.sku ? ' · ' + product.sku : '' }}</option>
            }
          </select>
        </label>
        <label>
          <span>{{ copy().movementType }}</span>
          <select [value]="movementType()" (change)="setMovementType(readValue($event) as InventoryMovementType | '')" [disabled]="loading()">
            <option value="">{{ copy().allTypes }}</option>
            @for (type of movementTypes; track type) {
              <option [value]="type">{{ typeLabel(type) }}</option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <div class="inventory-ledger__state inventory-ledger__state--error" role="alert">
          <p>{{ error() }}</p>
          <button type="button" (click)="retry()">{{ copy().retry }}</button>
        </div>
      }

      @if (loading() && !items().length) {
        <div class="inventory-ledger__state" role="status" aria-live="polite">{{ copy().loading }}</div>
      } @else if (!items().length && !error()) {
        <div class="inventory-ledger__state inventory-ledger__state--empty">
          <strong>{{ copy().emptyTitle }}</strong>
          <p>{{ copy().emptyDescription }}</p>
        </div>
      } @else if (items().length) {
        <div class="inventory-ledger__mobile-list" aria-label="{{ copy().movementList }}">
          @for (movement of items(); track movement.id) {
            <article class="inventory-ledger__card">
              <div class="inventory-ledger__card-top">
                <strong>{{ movement.product.name }}</strong>
                <span class="inventory-ledger__type">{{ typeLabel(movement.movement_type) }}</span>
              </div>
              <div class="inventory-ledger__quantity" [class.inventory-ledger__quantity--negative]="isNegative(movement.quantity_delta)" [class.inventory-ledger__quantity--positive]="!isNegative(movement.quantity_delta)">
                {{ formatQuantity(movement.quantity_delta) }} <small>{{ movement.product.unit || copy().unit }}</small>
              </div>
              <p class="inventory-ledger__reason">{{ movement.reason || copy().noReason }}</p>
              <div class="inventory-ledger__meta">
                <time [attr.datetime]="movement.created_at">{{ formatDate(movement.created_at) }}</time>
                @if (movement.product.sku) { <span>{{ copy().sku }}: {{ movement.product.sku }}</span> }
              </div>
            </article>
          }
        </div>

        <div class="inventory-ledger__desktop-table" role="region" [attr.aria-label]="copy().movementList" tabindex="0">
          <table>
            <thead><tr>
              <th scope="col">{{ copy().date }}</th>
              <th scope="col">{{ copy().product }}</th>
              <th scope="col">{{ copy().movementType }}</th>
              <th scope="col">{{ copy().quantity }}</th>
              <th scope="col">{{ copy().reason }}</th>
              <th scope="col">{{ copy().reference }}</th>
            </tr></thead>
            <tbody>
              @for (movement of items(); track movement.id) {
                <tr>
                  <td><time [attr.datetime]="movement.created_at">{{ formatDate(movement.created_at) }}</time></td>
                  <td><strong>{{ movement.product.name }}</strong>@if (movement.product.sku) { <small>{{ movement.product.sku }}</small> }</td>
                  <td>{{ typeLabel(movement.movement_type) }}</td>
                  <td class="inventory-ledger__table-quantity" [class.inventory-ledger__quantity--negative]="isNegative(movement.quantity_delta)" [class.inventory-ledger__quantity--positive]="!isNegative(movement.quantity_delta)">{{ formatQuantity(movement.quantity_delta) }} {{ movement.product.unit || copy().unit }}</td>
                  <td>{{ movement.reason || copy().noReason }}</td>
                  <td>{{ movement.reference_type || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (hasMore()) {
        <footer class="inventory-ledger__footer">
          <span class="inventory-ledger__muted" aria-live="polite">{{ copy().shown }}: {{ formatNumber(items().length) }}</span>
          <button type="button" (click)="loadMore()" [disabled]="loading()">{{ loading() ? copy().loadingMore : copy().loadMore }}</button>
        </footer>
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .inventory-ledger{display:grid;gap:14px;min-width:0;color:var(--aiba-ink,#172033)}
    .inventory-ledger__header{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .inventory-ledger__header h2{margin:3px 0;font-size:19px}
    .inventory-ledger__eyebrow{margin:0;color:var(--aiba-brand,#0f766e);font-size:11px;font-weight:800}
    .inventory-ledger__muted{color:var(--aiba-muted,#64748b);font-size:12px}
    .inventory-ledger__filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .inventory-ledger__filters label{display:grid;gap:6px;min-width:0;font-size:12px;font-weight:700}
    .inventory-ledger select{box-sizing:border-box;width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:10px;background:var(--aiba-surface,#fff);color:inherit;font:inherit}
    .inventory-ledger button{min-height:44px;padding:8px 13px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:10px;background:var(--aiba-surface,#fff);color:inherit;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    .inventory-ledger button:disabled{opacity:.55;cursor:wait}
    .inventory-ledger :is(button,select,[tabindex]):focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    .inventory-ledger__refresh,.inventory-ledger__footer button{border-color:var(--aiba-brand,#0f766e);background:var(--aiba-brand,#0f766e);color:#fff}
    .inventory-ledger__state{padding:24px 14px;border:1px dashed var(--aiba-line-strong,#cbd5e1);border-radius:14px;text-align:center}
    .inventory-ledger__state p{margin:6px 0 0;color:var(--aiba-muted,#64748b);font-size:12px}
    .inventory-ledger__state--error{border-color:var(--aiba-danger,#dc2626);color:var(--aiba-danger,#b91c1c)}
    .inventory-ledger__state--error button{margin-top:8px}
    .inventory-ledger__mobile-list{display:grid;gap:9px}
    .inventory-ledger__card{display:grid;gap:9px;padding:13px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:13px;background:var(--aiba-surface,#fff);min-width:0}
    .inventory-ledger__card-top,.inventory-ledger__meta,.inventory-ledger__footer{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .inventory-ledger__card-top strong{overflow-wrap:anywhere}
    .inventory-ledger__type{padding:4px 8px;border-radius:999px;background:var(--aiba-soft,#f1f5f9);font-size:11px}
    .inventory-ledger__quantity{font-size:20px;font-weight:850;font-variant-numeric:tabular-nums;direction:ltr;text-align:start}
    .inventory-ledger__quantity small{font-size:11px;font-weight:600;color:var(--aiba-muted,#64748b)}
    .inventory-ledger__quantity--negative{color:var(--aiba-danger,#b91c1c)}
    .inventory-ledger__quantity--positive{color:var(--aiba-success,#15803d)}
    .inventory-ledger__reason{margin:0;font-size:12px;overflow-wrap:anywhere}
    .inventory-ledger__meta{flex-wrap:wrap;color:var(--aiba-muted,#64748b);font-size:11px}
    .inventory-ledger__desktop-table{display:none;overflow:auto;border:1px solid var(--aiba-line,#e2e8f0);border-radius:12px}
    .inventory-ledger table{width:100%;border-collapse:collapse;text-align:start;font-size:12px}
    .inventory-ledger th,.inventory-ledger td{padding:11px 12px;border-bottom:1px solid var(--aiba-line,#e2e8f0);text-align:start;white-space:nowrap}
    .inventory-ledger th{background:var(--aiba-soft,#f8fafc);font-weight:800}
    .inventory-ledger td small{display:block;color:var(--aiba-muted,#64748b)}
    .inventory-ledger__table-quantity{direction:ltr;font-weight:800;font-variant-numeric:tabular-nums}
    .inventory-ledger__footer{justify-content:center;flex-wrap:wrap}
    @media(min-width:761px){.inventory-ledger__mobile-list{display:none}.inventory-ledger__desktop-table{display:block}}
    @media(max-width:520px){.inventory-ledger__header{align-items:flex-start}.inventory-ledger__filters{grid-template-columns:1fr}.inventory-ledger__refresh{min-width:84px}}
    @media(prefers-reduced-motion:reduce){.inventory-ledger *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
    @media(forced-colors:active){.inventory-ledger button,.inventory-ledger select,.inventory-ledger__card{border:1px solid CanvasText}.inventory-ledger :is(button,select,[tabindex]):focus-visible{outline-color:Highlight}.inventory-ledger__quantity--negative,.inventory-ledger__quantity--positive{color:CanvasText}}
  `],
})
export class InventoryMovementLedgerComponent {
  private readonly localization = new LocalizationService();
  private readonly guard = new WorkspaceLoadGuard();
  private offset = 0;
  private readonly pageSize = 50;

  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input.required<'owner' | 'staff'>();
  readonly products = input<Product[]>([]);
  readonly language = input<'ar' | 'en'>('ar');
  readonly loadPage = input.required<InventoryMovementLoader>();

  readonly items = signal<InventoryMovement[]>([]);
  readonly productId = signal('');
  readonly movementType = signal<InventoryMovementType | ''>('');
  readonly loading = signal(false);
  readonly hasMore = signal(false);
  readonly error = signal('');
  readonly movementTypes = MOVEMENT_TYPES;

  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => {
        this.guard.invalidate();
        this.offset = 0;
        this.items.set([]);
        this.hasMore.set(false);
        this.error.set('');
        this.loading.set(false);
        if (context.businessId && context.userId) void this.load(true);
      });
    });
  }

  direction(): 'rtl' | 'ltr' { return this.language() === 'ar' ? 'rtl' : 'ltr'; }

  copy() {
    const ar = this.language() === 'ar';
    return ar ? {
      title: 'سجل حركات المخزون', eyebrow: 'المخزون', subtitle: 'عرض تفصيلي لكل حركة مسجلة على المنتجات',
      refresh: 'تحديث', filters: 'تصفية الحركات', product: 'المنتج', allProducts: 'كل المنتجات',
      movementType: 'نوع الحركة', allTypes: 'كل الحركات', retry: 'إعادة المحاولة',
      loading: 'جاري تحميل الحركات…', emptyTitle: 'لا توجد حركات مخزون', emptyDescription: 'ستظهر الحركات هنا عند تسجيل استلام أو صرف أو حركة مخزون.',
      movementList: 'قائمة حركات المخزون', unit: 'وحدة', sku: 'الكود', noReason: 'بدون سبب مسجل',
      date: 'التاريخ', quantity: 'الكمية', reason: 'السبب', reference: 'المرجع',
      shown: 'عدد السجلات', loadingMore: 'جاري التحميل…', loadMore: 'تحميل المزيد',
    } : {
      title: 'Inventory movement ledger', eyebrow: 'Inventory', subtitle: 'A read-only history of recorded product stock movements',
      refresh: 'Refresh', filters: 'Movement filters', product: 'Product', allProducts: 'All products',
      movementType: 'Movement type', allTypes: 'All types', retry: 'Retry',
      loading: 'Loading movements…', emptyTitle: 'No stock movements yet', emptyDescription: 'Recorded receipts, sales and other stock movements will appear here.',
      movementList: 'Inventory movements', unit: 'unit', sku: 'SKU', noReason: 'No reason recorded',
      date: 'Date', quantity: 'Quantity', reason: 'Reason', reference: 'Reference',
      shown: 'Records shown', loadingMore: 'Loading…', loadMore: 'Load more',
    };
  }

  typeLabel(type: InventoryMovementType): string {
    const ar = this.language() === 'ar';
    const labels: Record<InventoryMovementType, [string, string]> = {
      opening: ['رصيد افتتاحي', 'Opening stock'],
      receipt: ['استلام مشتريات', 'Purchase receipt'],
      sale: ['صرف مبيعات', 'Sale'],
      return: ['مرتجع', 'Return'],
      adjustment: ['تسوية مخزون', 'Adjustment'],
    };
    return labels[type]?.[ar ? 0 : 1] ?? type;
  }

  readValue(event: Event): string { return (event.currentTarget as HTMLSelectElement | null)?.value ?? ''; }
  setProduct(value: string): void { this.productId.set(value); void this.load(true); }
  setMovementType(value: InventoryMovementType | ''): void { this.movementType.set(value); void this.load(true); }
  refresh(): void { void this.load(true); }
  retry(): void { void this.load(true); }

  async load(reset: boolean): Promise<void> {
    const requested = this.context();
    if (!requested.businessId || !requested.userId || this.loading()) return;
    const version = this.guard.begin();
    if (reset) {
      this.offset = 0;
      this.items.set([]);
      this.hasMore.set(false);
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.loadPage()({
        businessId: requested.businessId,
        productId: this.productId(),
        movementType: this.movementType(),
        limit: this.pageSize,
        offset: this.offset,
      });
      if (!this.isCurrent(version, requested)) return;
      if (!page || !Array.isArray(page.items) || typeof page.has_more !== 'boolean') {
        throw new Error('Invalid inventory movement response');
      }
      const next = reset ? page.items : [...this.items(), ...page.items];
      const unique = new Map<string, InventoryMovement>();
      for (const item of next) unique.set(item.id, item);
      this.items.set([...unique.values()]);
      this.offset = page.offset + page.items.length;
      this.hasMore.set(page.has_more);
    } catch {
      if (this.isCurrent(version, requested)) this.error.set(this.language() === 'ar'
        ? 'تعذر تحميل سجل الحركات. حاول مرة أخرى.' : 'Could not load inventory movements. Please retry.');
    } finally {
      if (this.isCurrent(version, requested)) this.loading.set(false);
    }
  }

  loadMore(): void { if (this.hasMore() && !this.loading()) void this.load(false); }

  formatDate(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(this.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(date);
  }

  formatQuantity(value: string): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return value;
    return new Intl.NumberFormat(this.language() === 'ar' ? 'ar-EG' : 'en-GB', {
      maximumFractionDigits: 3, signDisplay: 'always',
    }).format(numeric);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat(this.language() === 'ar' ? 'ar-EG' : 'en-GB').format(value);
  }

  isNegative(value: string): boolean { return Number(value) < 0; }

  private context(): MovementContext {
    return { businessId: this.businessId(), userId: this.userId(), role: this.role() };
  }

  private isCurrent(version: number, requested: MovementContext): boolean {
    const current = this.context();
    return this.guard.isCurrent(version, current.businessId, requested.businessId)
      && current.userId === requested.userId && current.role === requested.role;
  }
}
