import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import type {
  Product,
  StockMovementPage as InventoryMovementPage,
  StockMovementRecord as InventoryMovement,
  StockMovementType as InventoryMovementType,
} from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard } from './workspace-load-guard';

export interface InventoryMovementQuery {
  businessId: string;
  productId: string;
  movementType: InventoryMovementType | '';
  referenceType: string;
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
          <select [value]="movementType()" (change)="setMovementTypeFromEvent($event)" [disabled]="loading()">
            <option value="">{{ copy().allTypes }}</option>
            @for (type of movementTypes; track type) {
              <option [value]="type">{{ typeLabel(type) }}</option>
            }
          </select>
        </label>
        @if (supportsReferenceFilter()) {
        <label>
          <span>{{ copy().referenceType }}</span>
          <select [value]="referenceType()" (change)="setReferenceType(readValue($event))" [disabled]="loading()">
            <option value="">{{ copy().allReferences }}</option>
            @for (type of referenceTypes; track type) {
              <option [value]="type">{{ referenceTypeLabel(type) }}</option>
            }
          </select>
        </label>
        }
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
        <div class="inventory-ledger__mobile-list" [attr.aria-label]="copy().movementList">
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
              @if (movement.reference_type) { <p class="inventory-ledger__reference">{{ copy().reference }}: {{ referenceTypeLabel(movement.reference_type) }}</p> }
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
                  <td>{{ movement.reference_type ? referenceTypeLabel(movement.reference_type) : '—' }}</td>
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
    .inventory-ledger{display:grid;gap:var(--aiba-space-4,16px);min-width:0;color:var(--aiba-ink,#172033);font-family:var(--aiba-font-sans,system-ui,sans-serif)}
    .inventory-ledger__header{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .inventory-ledger__header h2{margin:3px 0;font-size:19px}
    .inventory-ledger__eyebrow{margin:0;color:var(--aiba-brand,#0f766e);font-size:11px;font-weight:800}
    .inventory-ledger__muted{color:var(--aiba-muted,#64748b);font-size:12px}
    .inventory-ledger__filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--aiba-space-3,12px);padding:var(--aiba-space-3,12px);border:1px solid var(--aiba-line,#e2e8f0);border-radius:var(--aiba-radius-card,16px);background:var(--aiba-surface-tint,#f6fafb)}
    .inventory-ledger__filters label{display:grid;gap:6px;min-width:0;font-size:12px;font-weight:700}
    .inventory-ledger select{box-sizing:border-box;width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:var(--aiba-radius-control,11px);background:var(--aiba-surface,#fff);color:inherit;font:inherit}
    .inventory-ledger button{min-height:44px;padding:8px 13px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:var(--aiba-radius-control,11px);background:var(--aiba-surface,#fff);color:inherit;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    .inventory-ledger button:disabled{opacity:.55;cursor:wait}
    .inventory-ledger :is(button,select,[tabindex]):focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    .inventory-ledger__refresh,.inventory-ledger__footer button{border-color:var(--aiba-brand,#0f766e);background:var(--aiba-brand,#0f766e);color:#fff}
    .inventory-ledger__state{padding:var(--aiba-space-6,24px) var(--aiba-space-4,16px);border:1px dashed var(--aiba-line-strong,#cbd5e1);border-radius:var(--aiba-radius-card,16px);text-align:center}
    .inventory-ledger__state p{margin:6px 0 0;color:var(--aiba-muted,#64748b);font-size:12px}
    .inventory-ledger__state--error{border-color:var(--aiba-danger,#dc2626);color:var(--aiba-danger,#b91c1c)}
    .inventory-ledger__state--error button{margin-top:8px}
    .inventory-ledger__mobile-list{display:grid;gap:9px}
    .inventory-ledger__card{display:grid;gap:9px;padding:var(--aiba-space-4,16px);border:1px solid var(--aiba-line,#e2e8f0);border-radius:var(--aiba-radius-card,16px);background:var(--aiba-surface,#fff);box-shadow:var(--aiba-shadow-card,0 2px 8px rgb(15 23 42 / 4%));min-width:0;overflow-wrap:anywhere}
    .inventory-ledger__card-top,.inventory-ledger__meta,.inventory-ledger__footer{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .inventory-ledger__card-top strong{overflow-wrap:anywhere}
    .inventory-ledger__type{padding:4px 8px;border-radius:999px;background:var(--aiba-soft,#f1f5f9);font-size:11px}
    .inventory-ledger__quantity{font-size:20px;font-weight:850;font-variant-numeric:tabular-nums;direction:ltr;text-align:start}
    .inventory-ledger__quantity small{font-size:11px;font-weight:600;color:var(--aiba-muted,#64748b)}
    .inventory-ledger__quantity--negative{color:var(--aiba-danger,#b91c1c)}
    .inventory-ledger__quantity--positive{color:var(--aiba-success,#15803d)}
    .inventory-ledger__reason,.inventory-ledger__reference{margin:0;font-size:12px;overflow-wrap:anywhere}
    .inventory-ledger__reference{color:var(--aiba-muted,#64748b)}
    .inventory-ledger__meta{flex-wrap:wrap;color:var(--aiba-muted,#64748b);font-size:11px}
    .inventory-ledger__desktop-table{display:none;overflow:auto;border:1px solid var(--aiba-line,#e2e8f0);border-radius:var(--aiba-radius-card,16px)}
    .inventory-ledger table{width:100%;border-collapse:collapse;text-align:start;font-size:12px}
    .inventory-ledger th,.inventory-ledger td{padding:11px 12px;border-bottom:1px solid var(--aiba-line,#e2e8f0);text-align:start;white-space:nowrap}
    .inventory-ledger th{background:var(--aiba-soft,#f8fafc);font-weight:800}
    .inventory-ledger td small{display:block;color:var(--aiba-muted,#64748b)}
    .inventory-ledger__table-quantity{direction:ltr;font-weight:800;font-variant-numeric:tabular-nums}
    .inventory-ledger__footer{justify-content:center;flex-wrap:wrap}
    @media(min-width:761px){.inventory-ledger__mobile-list{display:none}.inventory-ledger__desktop-table{display:block}}
    @media(max-width:760px){.inventory-ledger__filters{grid-template-columns:1fr}.inventory-ledger select{min-height:48px;font-size:16px}.inventory-ledger__refresh{min-height:48px}}
    @media(max-width:520px){.inventory-ledger__header{align-items:flex-start}.inventory-ledger__refresh{min-width:84px}}
    @media(max-width:760px){.inventory-ledger__filters{gap:10px;padding:14px}.inventory-ledger__card{gap:11px;padding:16px;border-radius:16px}.inventory-ledger__quantity{font-size:22px}.inventory-ledger__refresh,.inventory-ledger__footer button{min-height:48px}.inventory-ledger__meta{font-size:12px}}
    @media(prefers-reduced-motion:reduce){.inventory-ledger *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
    @media(forced-colors:active){.inventory-ledger button,.inventory-ledger select,.inventory-ledger__card{border:1px solid CanvasText}.inventory-ledger :is(button,select,[tabindex]):focus-visible{outline-color:Highlight}.inventory-ledger__quantity--negative,.inventory-ledger__quantity--positive{color:CanvasText}}
  `],
})
export class InventoryMovementLedgerComponent {
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
  readonly supportsReferenceFilter = input(true);
  readonly referenceType = signal('');
  readonly referenceTypes = ['invoice', 'invoice_void', 'purchase_order', 'sales_return', 'stock_count'];
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

  private readonly localization = inject(LocalizationService);

  private t(key: string): string { return this.localization.translate('inventoryLedger.' + key); }

  copy() {
    return {
      title: this.t('title'), eyebrow: this.t('eyebrow'), subtitle: this.t('subtitle'),
      refresh: this.t('refresh'), filters: this.t('filters'), product: this.t('product'),
      allProducts: this.t('allProducts'), movementType: this.t('movementType'), allTypes: this.t('allTypes'),
      referenceType: this.t('referenceType'), allReferences: this.t('allReferences'),
      retry: this.t('retry'), loading: this.t('loading'), emptyTitle: this.t('emptyTitle'),
      emptyDescription: this.t('emptyDescription'), movementList: this.t('movementList'),
      unit: this.t('unit'), sku: this.t('sku'), noReason: this.t('noReason'),
      date: this.t('date'), quantity: this.t('quantity'), reason: this.t('reason'),
      reference: this.t('reference'), shown: this.t('shown'), loadingMore: this.t('loadingMore'),
      loadMore: this.t('loadMore'),
    };
  }

  typeLabel(type: InventoryMovementType): string {
    const label = this.t('type.' + type);
    return label === 'inventoryLedger.type.' + type ? type : label;
  }

  referenceTypeLabel(type: string): string {
    const label = this.t('referenceTypes.' + type);
    return label === 'inventoryLedger.referenceTypes.' + type ? type : label;
  }

  readValue(event: Event): string { return (event.currentTarget as HTMLSelectElement | null)?.value ?? ''; }
  setProduct(value: string): void { this.productId.set(value); void this.load(true); }
  setMovementType(value: InventoryMovementType | ''): void { this.movementType.set(value); void this.load(true); }
  setMovementTypeFromEvent(event: Event): void { this.setMovementType(this.readValue(event) as InventoryMovementType | ''); }
  setReferenceType(value: string): void { this.referenceType.set(value); void this.load(true); }
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
        referenceType: this.referenceType(),
        limit: this.pageSize,
        offset: this.offset,
      });
      if (!this.isCurrent(version, requested)) return;
      if (!page || !Array.isArray(page.items) || typeof page.has_more !== 'boolean'
          || !Number.isInteger(page.offset) || !Number.isInteger(page.limit)) {
        throw new Error('Invalid inventory movement response');
      }
      const next = reset ? page.items : [...this.items(), ...page.items];
      const unique = new Map<string, InventoryMovement>();
      for (const item of next) unique.set(item.id, item);
      this.items.set([...unique.values()]);
      this.offset = page.offset + page.items.length;
      this.hasMore.set(page.has_more);
    } catch {
      if (this.isCurrent(version, requested)) this.error.set(this.t('loadError'));
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
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
    if (!match) return value;
    const [, rawSign, rawInteger, fraction = ''] = match;
    const locale = this.language() === 'ar' ? 'ar-EG' : 'en-GB';
    const integer = BigInt(rawInteger);
    const integerLabel = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(integer);
    const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 });
    const localizedDigits = Array.from({ length: 10 }, (_, digit) => digitFormatter.format(digit));
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.';
    const signParts = new Intl.NumberFormat(locale, { signDisplay: 'always', maximumFractionDigits: 0 })
      .formatToParts(rawSign === '-' ? -0 : 0);
    const sign = signParts.find(part => part.type === 'minusSign' || part.type === 'plusSign')?.value ?? (rawSign === '-' ? '-' : '+');
    const fractionLabel = fraction
      ? decimal + Array.from(fraction, digit => localizedDigits[digit.charCodeAt(0) - 48]).join('')
      : '';
    return sign + integerLabel + fractionLabel;
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat(this.language() === 'ar' ? 'ar-EG' : 'en-GB').format(value);
  }

  isNegative(value: string): boolean { return /^-\d/.test(value.trim()); }

  private context(): MovementContext {
    return { businessId: this.businessId(), userId: this.userId(), role: this.role() };
  }

  private isCurrent(version: number, requested: MovementContext): boolean {
    const current = this.context();
    return this.guard.isCurrent(version, current.businessId, requested.businessId)
      && current.userId === requested.userId && current.role === requested.role;
  }
}
