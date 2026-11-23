import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AbaSkeletonComponent } from './shared/ui/aba-skeleton.component';
import {
  ApiService,
  type Product,
  type PurchaseOrder,
  type PurchaseOrderActivity,
  type PurchaseOrderDetail,
  type PurchaseOrderInput,
  type PurchaseOrderReceipt,
  type Supplier,
} from './api.service';
import { WorkspaceLoadGuard } from './workspace-load-guard';
import { LocalizationService } from './localization.service';
import { isValidPurchaseDecimalInput, normalizePurchaseDecimalInput } from './purchasing-decimal';

type PurchasingContext = { businessId: string; userId: string; role: 'owner' | 'staff' };
type PurchaseDraftLine = { product_id: string; quantity: string; unit_cost: string };
type PurchaseAction = 'approve' | 'cancel';



@Component({
  selector: 'aba-purchasing-workspace',
  standalone: true,
  imports: [FormsModule, AbaSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="purchasing-workspace" [attr.dir]="language() === 'ar' ? 'rtl' : 'ltr'" [attr.aria-label]="t('title')">
      <header class="pw__heading">
        <div>
          <p class="pw__eyebrow">{{ t('title') }}</p>
          <h2>{{ t('title') }}</h2>
          <p class="pw__muted">{{ t('subtitle') }}</p>
        </div>
        @if (mode() === 'list') {
          <button class="pw__primary" type="button" (click)="startCreate()" [disabled]="loading()">{{ t('newOrder') }}</button>
        }
      </header>
      @if (success()) { <p class="pw__notice pw__notice--success" role="status">{{ success() }}</p> }

      @if (mode() === 'list') {
        <div class="pw__toolbar">
          <label class="pw__search">
            <span class="pw__sr-only">{{ t('search') }}</span>
            <input type="search" [value]="search()" (input)="search.set(readValue($event))" [placeholder]="isNarrow() ? t('searchShort') : t('search')" />
          </label>
          @if (loading()) { <span class="pw__muted" role="status">{{ t('loading') }}</span> }
        </div>
        @if (error()) { <p class="pw__notice pw__notice--error" role="alert">{{ error() }} <button type="button" (click)="load()">{{ t('retry') }}</button></p> }
        @if (loading() && !orders().length) {
          <div class="pw__state pw__skeletons" role="status"><span class="pw__sr-only">{{ t('loading') }}</span>@for (row of [1, 2, 3, 4]; track row) { <aba-skeleton variant="list-row" /> }</div>
        } @else if (filteredOrders().length) {
          <div class="pw__cards">
            @for (order of filteredOrders(); track order.id) {
              <article class="pw__card">
                <div class="pw__card-head">
                  <strong>{{ order.order_number }}</strong>
                  <span class="pw__status" [class]="'pw__status pw__status--' + order.status">{{ statusLabel(order.status) }}</span>
                </div>
                <p>{{ supplierName(order.supplier_id) }}</p>
                <div class="pw__card-meta">
                  <span>{{ order.lines.length }} {{ t('lineCount') }}</span>
                  <strong>{{ order.total }} {{ order.currency_code }}</strong>
                </div>
                <button class="pw__secondary" type="button" (click)="openOrder(order.id)">{{ t('view') }}</button>
              </article>
            }
          </div>
        } @else if (!error()) {
          <div class="pw__state">
            <strong>{{ search().trim() ? t('noMatches') : t('emptyTitle') }}</strong>
            @if (!search().trim()) { <p>{{ t('emptyDescription') }}</p> }
          </div>
        }
      } @else if (mode() === 'create' || mode() === 'edit') {
        <button class="pw__back" type="button" (click)="cancelEditor()">{{ t('cancel') }}</button>
        <section class="pw__panel">
          <h3>{{ mode() === 'edit' ? t('edit') : t('create') }}</h3>
          @if (!activeSuppliers().length) { <p class="pw__notice pw__notice--error">{{ t('noSuppliers') }}</p> }
          @if (!stockProducts().length) { <p class="pw__notice pw__notice--error">{{ t('noProducts') }}</p> }
          <form class="pw__form" (ngSubmit)="saveDraft()">
            <div class="pw__form-grid">
              <label>{{ t('orderNumber') }}
                <input name="orderNumber" maxlength="64" required [(ngModel)]="draft.order_number" [disabled]="saving()" />
              </label>
              <label>{{ t('supplier') }}
                <select name="supplier" required [(ngModel)]="draft.supplier_id" [disabled]="saving()">
                  <option value="" disabled>{{ t('supplier') }}</option>
                  @for (supplier of activeSuppliers(); track supplier.id) { <option [value]="supplier.id">{{ supplier.name }}</option> }
                </select>
              </label>
              <label>{{ t('currency') }}
                <input name="currency" [value]="draft.currency_code" readonly />
              </label>
            </div>
            <div class="pw__line-heading">
              <strong>{{ t('lines') }}</strong>
              <button class="pw__secondary" type="button" (click)="addLine()" [disabled]="saving()">{{ t('addLine') }}</button>
            </div>
            @for (line of formLines; track $index) {
              <div class="pw__line-form">
                <label>{{ t('product') }}
                  <select [name]="'product-' + $index" required [(ngModel)]="line.product_id" [disabled]="saving()">
                    <option value="" disabled>{{ t('product') }}</option>
                    @for (product of stockProducts(); track product.id) {
                      <option [value]="product.id">{{ product.name }}@if (product.sku) { · {{ product.sku }} }</option>
                    }
                  </select>
                </label>
                <label>{{ t('quantity') }}
                  <input [name]="'quantity-' + $index" type="text" inputmode="decimal" autocomplete="off" required [(ngModel)]="line.quantity" [disabled]="saving()" />
                </label>
                <label>{{ t('unitCost') }}
                  <input [name]="'cost-' + $index" type="text" inputmode="decimal" autocomplete="off" required [(ngModel)]="line.unit_cost" [disabled]="saving()" />
                </label>
                <button class="pw__remove" type="button" (click)="removeLine($index)" [disabled]="saving() || formLines.length <= 1" [attr.aria-label]="t('removeLine')">×</button>
              </div>
            }
            @if (formError()) { <p class="pw__notice pw__notice--error" role="alert">{{ formError() }}</p> }
            <div class="pw__actions">
              <button class="pw__primary" type="submit" [disabled]="saving()">{{ saving() ? t('loading') : t('save') }}</button>
              <button class="pw__secondary" type="button" (click)="cancelEditor()" [disabled]="saving()">{{ t('cancel') }}</button>
            </div>
          </form>
        </section>
      } @else {
        <button class="pw__back" type="button" (click)="backToList()">{{ t('back') }}</button>
        @if (detailLoading()) { <div class="pw__state pw__skeletons" role="status"><span class="pw__sr-only">{{ t('loading') }}</span>@for (row of [1, 2, 3]; track row) { <aba-skeleton variant="list-row" /> }</div> }
        @if (detailError()) { <p class="pw__notice pw__notice--error" role="alert">{{ detailError() }} <button type="button" (click)="retryDetail()">{{ t('retry') }}</button></p> }
        @if (selectedOrder(); as order) {
          <section class="pw__panel">
            <header class="pw__detail-head">
              <div><p class="pw__eyebrow">{{ t('details') }}</p><h3>{{ order.order_number }}</h3><p class="pw__muted">{{ order.supplier.name }}</p></div>
              <span class="pw__status" [class]="'pw__status pw__status--' + order.status">{{ statusLabel(order.status) }}</span>
            </header>
            <div class="pw__summary">
              <div><small>{{ t('supplier') }}</small><strong>{{ order.supplier.name }}</strong></div>
              <div><small>{{ t('currency') }}</small><strong>{{ order.currency_code }}</strong></div>
              <div><small>{{ t('total') }}</small><strong class="pw__summary-total">{{ order.total }} {{ order.currency_code }}</strong></div>
            </div>
            <div class="pw__table">
              <div class="pw__table-head"><span>{{ t('product') }}</span><span>{{ t('ordered') }}</span><span>{{ t('received') }}</span><span>{{ t('remaining') }}</span><span>{{ t('unitCost') }}</span></div>
              @for (line of order.lines; track line.id) {
                <div class="pw__table-row">
                  <strong>{{ line.product?.name || productName(line.product_id) }}</strong>
                  <span [attr.data-label]="t('ordered')">{{ line.quantity }}</span><span [attr.data-label]="t('received')">{{ line.received_quantity }}</span><span [attr.data-label]="t('remaining')">{{ line.remaining_quantity }}</span><span [attr.data-label]="t('unitCost')">{{ line.unit_cost }} {{ order.currency_code }}</span>
                </div>
              }
            </div>

            @if (isOwner()) {
              <div class="pw__actions">
                @if (canEdit(order)) { <button class="pw__secondary" type="button" (click)="startEdit()">{{ t('edit') }}</button> }
                @if (canApprove(order)) { <button class="pw__primary" type="button" (click)="requestAction('approve')">{{ t('approve') }}</button> }
                @if (canCancel(order)) { <button class="pw__danger" type="button" (click)="requestAction('cancel')">{{ t('cancelOrder') }}</button> }
                <button class="pw__secondary" type="button" (click)="duplicateOrder()">{{ t('duplicateOrder') }}</button>
                @if (canReceive(order)) { <button class="pw__primary" type="button" (click)="startReceipt()">{{ t('receive') }}</button> }
              </div>
              @if (pendingAction()) {
                <div class="pw__confirm" role="group">
                  <p>{{ confirmationPrompt() }}</p>
                  <button class="pw__primary" type="button" (click)="confirmAction()" [disabled]="actionLoading()">{{ confirmationConfirmLabel() }}</button>
                  <button class="pw__secondary" type="button" (click)="pendingAction.set(null)" [disabled]="actionLoading()">{{ confirmationCancelLabel() }}</button>
                </div>
              }
              @if (receiptMode()) {
                <form class="pw__receipt" (ngSubmit)="submitReceipt()">
                  <h4>{{ t('receive') }}</h4>
                  @for (line of order.lines; track line.id) {
                    @if (hasRemaining(line)) {
                      <label>{{ line.product?.name || productName(line.product_id) }} · {{ t('remaining') }} {{ line.remaining_quantity }}
                        <span>{{ t('receiptQuantity') }}</span>
                        <input [name]="'receipt-' + line.id" type="number" min="0" [max]="line.remaining_quantity" step="0.001" [(ngModel)]="receiptDraft[line.id]" [disabled]="actionLoading()" />
                      </label>
                    }
                  }
                  @if (receiptError()) { <p class="pw__notice pw__notice--error" role="alert">{{ receiptError() }}</p> }
                  <div class="pw__actions">
                    <button class="pw__primary" type="submit" [disabled]="actionLoading()">{{ t('submitReceipt') }}</button>
                    <button class="pw__secondary" type="button" (click)="cancelReceipt()" [disabled]="actionLoading()">{{ t('cancel') }}</button>
                  </div>
                </form>
              }
              <div class="pw__history">
                <div class="pw__history-grid">
                  <section>
                    <h4>{{ t('receipts') }}</h4>
                    @if (historyLoading()) { <p class="pw__muted">{{ t('historyLoading') }}</p> }
                    @if (historyError()) { <p class="pw__notice pw__notice--error">{{ historyError() }} <button type="button" (click)="retryHistory()">{{ t('retry') }}</button></p> }
                    @if (!historyLoading() && !historyError() && receipts().length) {
                      @for (receipt of receipts(); track receipt.id) {
                        <article class="pw__history-item">
                          <strong>{{ receipt.product?.name || productName(receipt.product_id) }} · {{ receipt.quantity_delta }}</strong>
                          <small>{{ formatDate(receipt.created_at) }} · {{ receipt.reason || '—' }}</small>
                        </article>
                      }
                    } @else if (!historyLoading() && !historyError()) { <p class="pw__muted">{{ t('noReceipts') }}</p> }
                  </section>
                  <section>
                    <h4>{{ t('activity') }}</h4>
                    @if (historyLoading()) { <p class="pw__muted">{{ t('historyLoading') }}</p> }
                    @if (!historyLoading() && !historyError() && activities().length) {
                      @for (event of activities(); track event.id) {
                        <article class="pw__history-item">
                          <strong>{{ activityLabel(event) }}</strong>
                          <small>{{ formatDate(event.created_at) }}@if (activitySummary(event)) { · {{ activitySummary(event) }} }</small>
                        </article>
                      }
                    } @else if (!historyLoading() && !historyError()) { <p class="pw__muted">{{ t('noActivity') }}</p> }
                  </section>
                </div>
              </div>
            }
          </section>
        }
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .purchasing-workspace{display:grid;gap:14px;min-width:0;color:var(--aba-color-text-primary,#172033)}
    .pw__heading,.pw__detail-head,.pw__card-head,.pw__line-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
    .pw__heading h2,.pw__detail-head h3,.pw__panel h3{margin:3px 0;font-size:19px;line-height:1.35}
    .pw__eyebrow{margin:0;color:var(--aba-color-primary-strong,#0f766e);font-size:11px;font-weight:800}
    .pw__muted{color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.55}
    .pw__heading p{margin:3px 0}
    .pw__toolbar{display:flex;align-items:center;gap:10px;min-width:0}
    .pw__search{display:block;flex:1;min-width:0}
    .pw__search input{width:100%;min-height:44px;box-sizing:border-box}
    .pw__cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:10px}
    .pw__card,.pw__panel{display:grid;gap:13px;min-width:0;padding:14px;border:1px solid var(--aba-color-border,#dbe3ec);border-radius:14px;background:var(--aba-color-surface,#fff);box-shadow:0 2px 8px #0f172a08}
    .pw__card p{margin:0;color:var(--aba-color-text-secondary,#64748b);font-size:13px;overflow-wrap:normal}
    .pw__card-meta{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--aba-color-text-secondary,#64748b)}
    .pw__card-meta strong{white-space:nowrap}
    .pw__status{display:inline-flex;align-items:center;min-height:27px;padding:4px 9px;border-radius:999px;border:1px solid var(--aba-color-border,#dbe3ec);background:var(--aba-color-surface-subtle,#f8fafc);font-size:11px;font-weight:800;white-space:nowrap}
    .pw__status--draft{color:#475569}.pw__status--approved{color:#1d4ed8}.pw__status--partially_received{color:#92400e}.pw__status--received{color:#047857}.pw__status--cancelled{color:#991b1b}
    .pw__form{display:grid;gap:13px}
    .pw__form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .pw__line-form{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(100px,.7fr) minmax(110px,.8fr) 42px;align-items:end;gap:9px;padding:10px;border:1px solid var(--aba-color-border,#dbe3ec);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}
    .pw__line-form label,.pw__form-grid label,.pw__receipt label{display:grid;gap:5px;min-width:0;font-size:11px;font-weight:700}
    .pw__line-form input,.pw__line-form select,.pw__form-grid input,.pw__form-grid select,.pw__receipt input,.pw__search input{width:100%;min-width:0;min-height:44px;box-sizing:border-box;padding:9px 10px;border:1px solid var(--aba-color-border-strong,#cbd5e1);border-radius:11px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font:inherit;font-size:13px}
    .pw__remove{min-width:42px;min-height:44px;border:1px solid #fecaca!important;background:#fff7f7!important;color:#b42318!important;font-size:20px!important}
    .pw__table{display:grid;min-width:0;overflow-x:auto;border:1px solid var(--aba-color-border,#dbe3ec);border-radius:12px}
    .pw__table-head,.pw__table-row{display:grid;grid-template-columns:minmax(130px,1.5fr) repeat(4,minmax(78px,.7fr));gap:8px;align-items:center;min-width:590px;padding:10px 12px;font-size:12px}
    .pw__table-head{background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#64748b);font-size:10px;font-weight:800}
    .pw__table-row{border-top:1px solid var(--aba-color-border-subtle,#edf1f5);font-variant-numeric:tabular-nums}
    .pw__table-row strong{overflow-wrap:normal}
    .pw__summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .pw__summary>div{display:grid;gap:5px;min-width:0;padding:10px;border-radius:10px;background:var(--aba-color-surface-subtle,#f8fafc)}
    .pw__summary small{color:var(--aba-color-text-secondary,#64748b);font-size:10px}
    .pw__summary strong{font-size:13px;overflow-wrap:normal}
    .pw__summary-total{white-space:nowrap}
    .pw__actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .purchasing-workspace button{min-height:42px;padding:8px 12px;border:1px solid var(--aba-color-border-strong,#cbd5e1);border-radius:10px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    .purchasing-workspace button:disabled{opacity:.55;cursor:wait}
    .pw__primary{border-color:var(--aba-color-primary-strong,#0f766e)!important;background:var(--aba-color-primary-strong,#0f766e)!important;color:#fff!important}
    .pw__danger{border-color:#fecaca!important;background:#fff7f7!important;color:#b42318!important}
    .pw__back{justify-self:start}
    .pw__state{padding:22px;border:1px dashed var(--aba-color-border-strong,#cbd5e1);border-radius:12px;color:var(--aba-color-text-secondary,#64748b);text-align:center}
    .pw__notice{padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.5}
    .pw__notice--success{background:#ecfdf5;color:#065f46}.pw__notice--error{background:#fef2f2;color:#991b1b}
    .pw__confirm,.pw__receipt{display:grid;gap:10px;padding:12px;border:1px solid var(--aba-color-border,#dbe3ec);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}
    .pw__receipt{grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))}
    .pw__receipt h4,.pw__history h4{grid-column:1/-1;margin:0;font-size:14px}
    .pw__history{padding-top:12px;border-top:1px solid var(--aba-color-border,#dbe3ec)}
    .pw__history-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .pw__history-item{display:grid;gap:4px;padding:9px 0;border-bottom:1px solid var(--aba-color-border-subtle,#edf1f5);min-width:0}
    .pw__history-item strong{font-size:12px;overflow-wrap:normal}.pw__history-item small{font-size:10px;color:var(--aba-color-text-secondary,#64748b);overflow-wrap:normal}
    .pw__sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    .pw__skeletons{display:grid;gap:10px}
    .purchasing-workspace :is(button,input,select):focus-visible{outline:3px solid var(--aba-color-focus,#2563eb);outline-offset:2px}
    @media(max-width:760px){.pw__form-grid{grid-template-columns:minmax(0,1fr)}.pw__line-form{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:end}.pw__line-form label:first-child{grid-column:1/-1}.pw__remove{grid-column:2;justify-self:end}.pw__summary{grid-template-columns:repeat(2,minmax(0,1fr))}.pw__history-grid{grid-template-columns:minmax(0,1fr)}.pw__heading{align-items:flex-start;flex-direction:column}.pw__heading .pw__primary{width:100%}.pw__actions button{flex:1 1 auto;min-height:44px}}
    @media(max-width:380px){.pw__summary{grid-template-columns:minmax(0,1fr)}.pw__line-form{grid-template-columns:minmax(0,1fr)}.pw__remove{grid-column:1;justify-self:start}}
    @media(prefers-reduced-motion:reduce){.purchasing-workspace *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
    @media(forced-colors:active){.purchasing-workspace button,.purchasing-workspace input,.purchasing-workspace select{border:1px solid CanvasText}.purchasing-workspace :is(button,input,select):focus-visible{outline-color:Highlight}}
    @media(max-width:480px){.pw__table-head{display:none}.pw__table-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0}.pw__table-row>span{display:grid;gap:2px;min-width:0;white-space:nowrap}.pw__table-row>span::before{content:attr(data-label);color:var(--aba-color-text-secondary,#64748b);font-size:10px;font-weight:800}}
    @media(max-width:380px){.pw__card-head,.pw__detail-head{flex-direction:column;align-items:flex-start;gap:6px}}
  `],
})
export class PurchasingWorkspaceComponent {
  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly listGuard = new WorkspaceLoadGuard();
  private readonly detailGuard = new WorkspaceLoadGuard();
  private readonly actionGuard = new WorkspaceLoadGuard();

  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input.required<'owner' | 'staff'>();
  readonly currencyCode = input.required<string>();
  readonly language = input<'ar' | 'en'>('ar');

  readonly mode = signal<'list' | 'detail' | 'create' | 'edit'>('list');

  /** Tracks the ≤220px breakpoint for the narrow search placeholder
   * (narrow-input fix 2026-11-22): the full "Search order, supplier or
   * status" placeholder is ~165px at the 11px placeholder size and still
   * clips the 151px area at 195px, so the short form shows there. Guarded
   * for the node unit runner, which has no `window`. */
  private readonly narrowQuery = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 220px)') : null;
  protected readonly isNarrow = signal(this.narrowQuery?.matches ?? false);
  readonly orders = signal<PurchaseOrder[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedOrder = signal<PurchaseOrderDetail | null>(null);
  readonly receipts = signal<PurchaseOrderReceipt[]>([]);
  readonly activities = signal<PurchaseOrderActivity[]>([]);
  readonly loading = signal(false);
  readonly detailLoading = signal(false);
  readonly historyLoading = signal(false);
  readonly saving = signal(false);
  readonly actionLoading = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly historyError = signal('');
  readonly formError = signal('');
  readonly receiptError = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly pendingAction = signal<PurchaseAction | null>(null);
  readonly receiptMode = signal(false);

  readonly filteredOrders = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) return this.orders();
    return this.orders().filter(order =>
      order.order_number.toLocaleLowerCase().includes(query)
      || this.supplierName(order.supplier_id).toLocaleLowerCase().includes(query)
      || this.statusLabel(order.status).toLocaleLowerCase().includes(query)
    );
  });
  readonly activeSuppliers = computed(() => this.suppliers().filter(supplier => supplier.is_active));
  readonly stockProducts = computed(() => this.products().filter(product => product.is_stock_tracked));
  readonly confirmationPrompt = signal('');
  readonly confirmationConfirmLabel = signal('');
  readonly confirmationCancelLabel = signal('');

  draft = { supplier_id: '', order_number: '', currency_code: '' };
  formLines: PurchaseDraftLine[] = [this.emptyLine()];
  receiptDraft: Record<string, string> = {};
  private editingOrderId: string | null = null;

  constructor() {
    this.narrowQuery?.addEventListener('change', (event) => this.isNarrow.set(event.matches));
    effect(() => {
      const context = this.context();
      untracked(() => {
        this.listGuard.invalidate();
        this.detailGuard.invalidate();
        this.actionGuard.invalidate();
        this.orders.set([]);
        this.suppliers.set([]);
        this.products.set([]);
        this.selectedOrder.set(null);
        this.receipts.set([]);
        this.activities.set([]);
        this.mode.set('list');
        this.loading.set(false);
        this.detailLoading.set(false);
        this.historyLoading.set(false);
        this.saving.set(false);
        this.actionLoading.set(false);
        this.error.set('');
        this.detailError.set('');
        this.historyError.set('');
        this.formError.set('');
        this.receiptError.set('');
        this.success.set('');
        this.pendingAction.set(null);
        this.receiptMode.set(false);
        this.editingOrderId = null;
        this.draft = { supplier_id: '', order_number: '', currency_code: context.currencyCode || this.currencyCode() };
        this.formLines = [this.emptyLine()];
        this.receiptDraft = {};
        if (context.businessId && context.userId) void this.load();
      });
    });
  }

  t(key: string): string { return this.localization.translate('purchasingWorkspace.' + key); }
  isOwner(): boolean { return this.role() === 'owner'; }

  private context(): PurchasingContext & { currencyCode: string } {
    return { businessId: this.businessId(), userId: this.userId(), role: this.role(), currencyCode: this.currencyCode() };
  }

  private isCurrent(guard: WorkspaceLoadGuard, version: number, requested: PurchasingContext): boolean {
    const current = this.context();
    return guard.isCurrent(version, current.businessId, requested.businessId)
      && current.userId === requested.userId
      && current.role === requested.role;
  }

  private emptyLine(): PurchaseDraftLine { return { product_id: '', quantity: '1', unit_cost: '0' }; }
  readValue(event: Event): string { return (event.target as HTMLInputElement).value; }

  /** Validate API Decimal constraints and localized keyboard input without Number coercion. */
  isValidDecimal(value: string, maxScale: number, allowZero: boolean): boolean {
    return isValidPurchaseDecimalInput(value, maxScale, allowZero);
  }

  hasRemaining(line: PurchaseOrderDetail['lines'][number]): boolean { return Number(line.remaining_quantity) > 0; }

  supplierName(id: string): string { return this.suppliers().find(supplier => supplier.id === id)?.name || id; }
  productName(id: string): string {
    const detailLine = this.selectedOrder()?.lines.find(line => line.product_id === id);
    return detailLine?.product?.name || this.products().find(product => product.id === id)?.name || id;
  }

  statusLabel(status: string): string {
    const keys: Record<string, string> = {
      draft: 'statusDraft', approved: 'statusApproved', partially_received: 'statusPartial',
      received: 'statusReceived', cancelled: 'statusCancelled',
    };
    return this.t(keys[status] || 'status');
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return this.localization.formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });
  }

  /** 3A-371 (U08): activity shows a localized, human-readable label mapped
   * from the audit action — never the raw technical key. */
  activityLabel(event: PurchaseOrderActivity): string {
    const labels: Record<string, string> = {
      'purchase_order.created': 'activityCreated',
      'purchase_order.approved': 'activityApproved',
      'purchase_order.received': 'activityReceived',
    };
    return this.t(labels[event.action] ?? 'activityRecorded');
  }

  activitySummary(event: PurchaseOrderActivity): string {
    // Known actions are fully described by their localized label, and a
    // structured change_summary is never rendered as raw JSON. Unknown
    // actions keep the server sentence when one exists.
    if (event.action === 'purchase_order.created' || event.action === 'purchase_order.approved' || event.action === 'purchase_order.received') return '';
    return typeof event.change_summary === 'string' ? event.change_summary : '';
  }

  canEdit(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }
  canApprove(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }
  canCancel(order: PurchaseOrder): boolean { return this.isOwner() && order.status === 'draft'; }
  canReceive(order: PurchaseOrderDetail): boolean {
    return this.isOwner() && (order.status === 'approved' || order.status === 'partially_received')
      && order.lines.some(line => Number(line.remaining_quantity) > 0);
  }

  async load(): Promise<void> {
    const requested = this.context();
    if (!requested.businessId || !requested.userId) return;
    const version = this.listGuard.begin();
    this.loading.set(true);
    this.error.set('');
    try {
      const [orders, suppliers, products] = await Promise.all([
        this.api.purchaseOrders(requested.businessId),
        this.api.suppliers(requested.businessId),
        this.api.products(requested.businessId, 0, 100),
      ]);
      if (!this.isCurrent(this.listGuard, version, requested)) return;
      this.orders.set(orders);
      this.suppliers.set(suppliers);
      this.products.set(products);
    } catch (error) {
      if (this.isCurrent(this.listGuard, version, requested)) this.error.set(this.message(error));
    } finally {
      if (this.isCurrent(this.listGuard, version, requested)) this.loading.set(false);
    }
  }

  async openOrder(orderId: string): Promise<void> {
    const requested = this.context();
    const version = this.detailGuard.begin();
    this.mode.set('detail');
    this.selectedOrder.set(null);
    this.receipts.set([]);
    this.activities.set([]);
    this.detailLoading.set(true);
    this.detailError.set('');
    this.historyError.set('');
    this.receiptMode.set(false);
    try {
      const detail = await this.api.purchaseOrderDetail(requested.businessId, orderId);
      if (!this.isCurrent(this.detailGuard, version, requested)) return;
      this.selectedOrder.set(detail);
      this.receiptDraft = Object.fromEntries(detail.lines.map(line => [line.id, line.remaining_quantity]));
      if (this.isOwner()) await this.loadHistory(orderId, requested, version);
    } catch (error) {
      if (this.isCurrent(this.detailGuard, version, requested)) this.detailError.set(this.message(error));
    } finally {
      if (this.isCurrent(this.detailGuard, version, requested)) this.detailLoading.set(false);
    }
  }

  private async loadHistory(orderId: string, requested: PurchasingContext, version: number): Promise<void> {
    this.historyLoading.set(true);
    this.historyError.set('');
    try {
      const [receipts, activity] = await Promise.all([
        this.api.purchaseOrderReceipts(requested.businessId, orderId),
        this.api.purchaseOrderActivity(requested.businessId, orderId),
      ]);
      if (!this.isCurrent(this.detailGuard, version, requested)) return;
      if (!Array.isArray(receipts?.items) || !Array.isArray(activity?.items)) {
        throw new Error(this.t('loadError'));
      }
      this.receipts.set(receipts.items);
      this.activities.set(activity.items);
    } catch (error) {
      if (this.isCurrent(this.detailGuard, version, requested)) this.historyError.set(this.message(error));
    } finally {
      if (this.isCurrent(this.detailGuard, version, requested)) this.historyLoading.set(false);
    }
  }

  retryDetail(): void { const id = this.selectedOrder()?.id; if (id) void this.openOrder(id); }
  retryHistory(): void {
    const id = this.selectedOrder()?.id;
    if (!id) return;
    const requested = this.context();
    const version = this.detailGuard.begin();
    void this.loadHistory(id, requested, version);
  }

  backToList(): void {
    this.mode.set('list');
    this.selectedOrder.set(null);
    this.pendingAction.set(null);
    this.receiptMode.set(false);
    this.detailError.set('');
  }

  startCreate(): void {
    this.editingOrderId = null;
    this.draft = { supplier_id: '', order_number: '', currency_code: this.currencyCode() };
    this.formLines = [this.emptyLine()];
    this.formError.set('');
    this.mode.set('create');
  }

  startEdit(): void {
    const order = this.selectedOrder();
    if (!order || !this.canEdit(order)) return;
    this.editingOrderId = order.id;
    this.draft = { supplier_id: order.supplier_id, order_number: order.order_number, currency_code: order.currency_code };
    this.formLines = order.lines.map(line => ({ product_id: line.product_id, quantity: line.quantity, unit_cost: line.unit_cost }));
    this.formError.set('');
    this.mode.set('edit');
  }

  addLine(): void { if (this.mode() === 'create' || this.isOwner()) this.formLines = [...this.formLines, this.emptyLine()]; }
  removeLine(index: number): void {
    if ((this.mode() === 'create' || this.isOwner()) && this.formLines.length > 1) this.formLines = this.formLines.filter((_, i) => i !== index);
  }

  cancelEditor(): void {
    this.formError.set('');
    this.mode.set(this.editingOrderId ? 'detail' : 'list');
    if (!this.editingOrderId) this.selectedOrder.set(null);
    this.editingOrderId = null;
  }

  async saveDraft(): Promise<void> {
    if (this.mode() !== 'create' && this.mode() !== 'edit') return;
    if (this.mode() === 'edit' && !this.isOwner()) return;
    const lines = this.formLines.map(line => ({ product_id: line.product_id, quantity: normalizePurchaseDecimalInput(line.quantity), unit_cost: normalizePurchaseDecimalInput(line.unit_cost) }));
    if (!this.draft.order_number.trim() || !this.draft.supplier_id) {
      this.formError.set(this.t('invalidOrder'));
      return;
    }
    const validProducts = new Set(this.stockProducts().map(product => product.id));
    if (!lines.length || lines.some(line =>
      !validProducts.has(line.product_id)
      || !this.isValidDecimal(line.quantity, 3, false)
      || !this.isValidDecimal(line.unit_cost, 2, true)
    )) {
      this.formError.set(this.t('invalidLines'));
      return;
    }
    const body: PurchaseOrderInput = {
      supplier_id: this.draft.supplier_id,
      order_number: this.draft.order_number.trim(),
      currency_code: this.draft.currency_code || this.currencyCode(),
      lines,
    };
    const requested = this.context();
    const version = this.actionGuard.begin();
    const editingId = this.editingOrderId;
    this.saving.set(true);
    this.formError.set('');
    try {
      const saved = editingId
        ? await this.api.updatePurchaseOrder(requested.businessId, editingId, body)
        : await this.api.createPurchaseOrder(requested.businessId, body);
      if (!this.isCurrent(this.actionGuard, version, requested)) return;
      this.success.set(this.t(editingId ? 'updated' : 'created'));
      this.editingOrderId = null;
      await this.load();
      if (this.isCurrent(this.actionGuard, version, requested)) await this.openOrder(saved.id);
    } catch (error) {
      if (this.isCurrent(this.actionGuard, version, requested)) this.formError.set(this.message(error));
    } finally {
      if (this.isCurrent(this.actionGuard, version, requested)) this.saving.set(false);
    }
  }

  requestAction(action: PurchaseAction): void {
    const order = this.selectedOrder();
    if (!order || !(action === 'approve' ? this.canApprove(order) : this.canCancel(order))) return;
    this.pendingAction.set(action);
    const promptKey = action === 'approve' ? 'approveConfirmationPrompt' : 'cancelConfirmationPrompt';
    const legacyPromptKey = action === 'approve' ? 'confirmApprove' : 'confirmCancel';
    this.confirmationPrompt.set(this.t(promptKey) || this.t(legacyPromptKey));
    this.confirmationConfirmLabel.set(this.t('confirmActionButton') || this.t('confirm'));
    this.confirmationCancelLabel.set(this.t('cancelConfirmationButton') || this.t('cancel'));
  }

  async confirmAction(): Promise<void> {
    const action = this.pendingAction();
    const order = this.selectedOrder();
    if (!action || !order || !this.isOwner()) return;
    const requested = this.context();
    const version = this.actionGuard.begin();
    this.actionLoading.set(true);
    try {
      if (action === 'approve') await this.api.approvePurchaseOrder(requested.businessId, order.id);
      else await this.api.cancelPurchaseOrder(requested.businessId, order.id);
      if (!this.isCurrent(this.actionGuard, version, requested)) return;
      this.pendingAction.set(null);
      this.success.set(this.t(action === 'approve' ? 'approved' : 'cancelled'));
      await this.load();
      if (this.isCurrent(this.actionGuard, version, requested)) await this.openOrder(order.id);
    } catch (error) {
      if (this.isCurrent(this.actionGuard, version, requested)) this.detailError.set(this.message(error));
    } finally {
      if (this.isCurrent(this.actionGuard, version, requested)) this.actionLoading.set(false);
    }
  }

  async duplicateOrder(): Promise<void> {
    const order = this.selectedOrder();
    if (!order || !this.isOwner()) return;
    const requested = this.context();
    const version = this.actionGuard.begin();
    this.actionLoading.set(true);
    try {
      const copy = await this.api.duplicatePurchaseOrder(requested.businessId, order.id);
      if (!this.isCurrent(this.actionGuard, version, requested)) return;
      this.success.set(this.t('created'));
      await this.load();
      if (this.isCurrent(this.actionGuard, version, requested)) await this.openOrder(copy.id);
    } catch (error) {
      if (this.isCurrent(this.actionGuard, version, requested)) this.detailError.set(this.message(error));
    } finally {
      if (this.isCurrent(this.actionGuard, version, requested)) this.actionLoading.set(false);
    }
  }

  startReceipt(): void {
    const order = this.selectedOrder();
    if (!order || !this.canReceive(order)) return;
    this.receiptDraft = Object.fromEntries(order.lines.map(line => [line.id, line.remaining_quantity]));
    this.receiptError.set('');
    this.receiptMode.set(true);
  }

  cancelReceipt(): void { this.receiptMode.set(false); this.receiptError.set(''); }

  async submitReceipt(): Promise<void> {
    const order = this.selectedOrder();
    if (!order || !this.canReceive(order)) return;
    const lines: Array<{ line_id: string; quantity: string }> = [];
    for (const line of order.lines) {
      const quantity = Number(this.receiptDraft[line.id] ?? '0');
      const remaining = Number(line.remaining_quantity);
      if (!Number.isFinite(quantity) || quantity < 0 || quantity > remaining) {
        this.receiptError.set(this.t('invalidReceipt'));
        return;
      }
      if (quantity > 0) lines.push({ line_id: line.id, quantity: String(this.receiptDraft[line.id]).trim() });
    }
    if (!lines.length) { this.receiptError.set(this.t('emptyReceipt')); return; }
    const requested = this.context();
    const version = this.actionGuard.begin();
    this.actionLoading.set(true);
    this.receiptError.set('');
    try {
      await this.api.receivePurchaseOrder(requested.businessId, order.id, lines);
      if (!this.isCurrent(this.actionGuard, version, requested)) return;
      this.receiptMode.set(false);
      this.success.set(this.t('receivedSaved'));
      await this.load();
      if (this.isCurrent(this.actionGuard, version, requested)) await this.openOrder(order.id);
    } catch (error) {
      if (this.isCurrent(this.actionGuard, version, requested)) this.receiptError.set(this.message(error));
    } finally {
      if (this.isCurrent(this.actionGuard, version, requested)) this.actionLoading.set(false);
    }
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : this.t('retry'); }
}
