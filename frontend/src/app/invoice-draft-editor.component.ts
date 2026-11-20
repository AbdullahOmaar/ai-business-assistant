import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocalizationService } from './localization.service';
import { removeInvoiceDraftLine, toInvoiceDraftPayload } from './invoice-draft';
import type { InvoiceDraftCustomer, InvoiceDraftLine, InvoiceDraftLineKind, InvoiceDraftPayload, InvoiceDraftProduct, InvoiceDraftServerSummary } from './invoice-draft';

@Component({
  selector: 'aba-invoice-draft-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="invoice-editor-shell" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <header class="editor-topbar">
        <button type="button" class="back-button" (click)="cancel.emit()" [disabled]="saving || blocked" [attr.aria-label]="t('ui.m_1957hpl')">{{ language === 'ar' ? '→' : '←' }}</button>
        <div class="editor-title">
          <h3>{{ editing ? t('ui.m_14af0fe') : t('ui.m_l3826b') }}</h3>
          <p>{{ t('ui.m_gz13w8') }}</p>
        </div>
        <span class="draft-status">{{ t('ui.m_1vbs2bw') }}</span>
      </header>

      <section class="editor-card" aria-labelledby="invoice-details-heading">
        <div class="section-heading"><div>
          <h4 id="invoice-details-heading">{{ t('ui.m_1la02fb') }}</h4>
          <p>{{ t('ui.m_da2qjb') }}</p>
        </div></div>
        <div class="invoice-details-grid">
          <label class="field">
            <span>{{ t('ui.m_1et6j5w') }} *</span>
            <input name="invoiceNumber" [(ngModel)]="invoiceNumber" (ngModelChange)="markDirty()" maxlength="64" autocomplete="off" [disabled]="locked" [placeholder]="t('ui.m_937ke4')" />
          </label>
          <label class="field">
            <span>{{ t('ui.m_1jd5ck6') }}</span>
            <input class="readonly-field" [value]="currencyCode" readonly aria-readonly="true" />
          </label>
          <label class="field customer-field">
            <span>{{ t('ui.m_ubgrc2') }} *</span>
            <select class="invoice-customer-select" name="customerId" [(ngModel)]="customerId" (ngModelChange)="markDirty()" [disabled]="locked">
              <option value="">{{ t('ui.m_1oqobkx') }}</option>
              @for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }
            </select>
          </label>
          @if (hasMoreCustomers) {
            <button type="button" class="subtle-action customer-more" (click)="loadMoreCustomers.emit()" [disabled]="locked || loadingMoreCustomers">
              {{ loadingMoreCustomers ? t('ui.m_14qa8nk') : t('ui.m_1wufohw') }}
            </button>
          }
        </div>
      </section>

      <section class="editor-card lines-card" aria-labelledby="invoice-lines-heading">
        <div class="section-heading">
          <div>
            <h4 id="invoice-lines-heading">{{ t('ui.m_1o7erce') }}</h4>
            <p>{{ t('ui.m_uxykti') }}</p>
          </div>
          <span class="line-count">{{ lines.length }} {{ t('ui.m_1prn1ui') }}</span>
        </div>
        <div class="line-list">
          @for (line of lines; track line.id; let index = $index) {
            <article class="line-card">
              <div class="line-card-heading">
                <strong>{{ t('ui.m_lofxac') }} {{ index + 1 }}</strong>
                <button type="button" class="remove-line" (click)="removeLine(index)" [disabled]="locked || lines.length <= 1" [attr.aria-label]="t('ui.m_1hepg03') + ' ' + (index + 1)">
                  <span aria-hidden="true">×</span><span>{{ t('ui.m_i15g6p') }}</span>
                </button>
              </div>
              <div class="line-kind-switch" role="group" [attr.aria-label]="t('ui.m_8e5oum')">
                <button type="button" class="kind-option" [class.active]="line.kind === 'product'" [attr.aria-pressed]="line.kind === 'product' ? 'true' : 'false'" (click)="changeKind(line, 'product')" [disabled]="locked">{{ t('ui.m_13rez2z') }}</button>
                <button type="button" class="kind-option" [class.active]="line.kind === 'manual'" [attr.aria-pressed]="line.kind === 'manual' ? 'true' : 'false'" (click)="changeKind(line, 'manual')" [disabled]="locked">{{ t('ui.m_1nanu1j') }}</button>
              </div>
              @if (line.kind === 'product') {
                <div class="line-fields product-line">
                  <label class="field product-picker">
                    <span>{{ t('ui.m_1kfbsbf') }} *</span>
                    <select [name]="'product-' + line.id" [(ngModel)]="line.product_id" (ngModelChange)="markDirty()" [disabled]="locked">
                      <option value="">{{ t('ui.m_1dttg5z') }}</option>
                      @for (product of products; track product.id) { <option [value]="product.id">{{ product.name }}</option> }
                    </select>
                  </label>
                  <label class="field catalog-price">
                    <span>{{ t('ui.m_1iz2xk3') }} ({{ currencyCode }})</span>
                    <input class="readonly-field" [value]="productPrice(line.product_id) || '—'" readonly aria-readonly="true" />
                  </label>
                  <label class="field line-description-field">
                    <span>{{ t('ui.m_12gxjqg') }}</span>
                    <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="300" [disabled]="locked" />
                  </label>
                  <label class="field quantity-field">
                    <span>{{ t('ui.m_ocneuo') }} *</span>
                    <input [name]="'quantity-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" (ngModelChange)="markDirty()" placeholder="1" [disabled]="locked" />
                  </label>
                </div>
              } @else {
                <div class="line-fields service-line">
                  <label class="field service-description-field">
                    <span>{{ t('ui.m_1wasllg') }} *</span>
                    <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="300" [disabled]="locked" />
                  </label>
                  <label class="field unit-price-field">
                    <span>{{ t('ui.m_1iz2xk3') }} ({{ currencyCode }}) *</span>
                    <input [name]="'price-' + line.id" inputmode="decimal" [(ngModel)]="line.unit_price" (ngModelChange)="markDirty()" placeholder="0.00" [disabled]="locked" />
                  </label>
                  <label class="field quantity-field">
                    <span>{{ t('ui.m_ocneuo') }} *</span>
                    <input [name]="'quantity-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" (ngModelChange)="markDirty()" placeholder="1" [disabled]="locked" />
                  </label>
                </div>
              }
            </article>
          }
        </div>
        <div class="line-list-footer">
          <button type="button" class="add-line-action" (click)="addLine()" [disabled]="locked"><span aria-hidden="true">＋</span> {{ t('ui.m_13ygch9') }}</button>
          @if (hasMoreProducts) {
            <button type="button" class="subtle-action" (click)="loadMoreProducts.emit()" [disabled]="locked || loadingMoreProducts">
              {{ loadingMoreProducts ? t('ui.m_dm5wol') : t('ui.m_3h0eh6') }}
            </button>
          }
        </div>
      </section>

      @if (error) { <p class="editor-error" role="alert">{{ localize(error) }}</p> }
      @if (blocked) {
        <div class="editor-error blocked-message" role="alert">
          <p>{{ t('ui.m_1cgqwnl') }}</p>
          <button type="button" class="secondary-action" (click)="refreshStatus.emit()" [disabled]="saving">{{ t('ui.m_1k7u2cz') }}</button>
        </div>
      }

      <section class="editor-card summary-card" aria-labelledby="invoice-summary-heading" aria-live="polite">
        <div class="section-heading"><div>
          <h4 id="invoice-summary-heading">{{ t('ui.m_h8mgmz') }}</h4>
          <p>{{ t('ui.m_d7k44x') }}</p>
        </div></div>
        @if (serverSummary && serverSummary.subtotal !== null && serverSummary.subtotal !== undefined) {
          <div class="summary-row"><span>{{ t('ui.m_1qtlbee') }}</span><strong>{{ formatNumber(serverSummary.subtotal) }} {{ serverSummary.currency_code }}</strong></div>
        }
        <div class="readonly-rates">
          <label class="field rate-field">
            <span>{{ t('ui.m_1ihygh1') }} %</span>
            <input name="invoiceDiscountRate" [value]="discountRate || '0'" readonly aria-readonly="true" />
            @if (serverSummary?.discount_total !== null && serverSummary?.discount_total !== undefined) { <small>{{ formatNumber(serverSummary?.discount_total) }} {{ serverSummary?.currency_code }}</small> }
          </label>
          <label class="field rate-field">
            <span>{{ t('ui.m_1qsg5t9') }} %</span>
            <input name="invoiceTaxRate" [value]="taxRate || '0'" readonly aria-readonly="true" />
            @if (serverSummary?.tax_total !== null && serverSummary?.tax_total !== undefined) { <small>{{ formatNumber(serverSummary?.tax_total) }} {{ serverSummary?.currency_code }}</small> }
          </label>
        </div>
        @if (serverSummary) {
          <div class="summary-total"><span>{{ t('ui.m_sqxwdc') }}</span><strong>{{ formatNumber(serverSummary.total) }} {{ serverSummary.currency_code }}</strong></div>
          <button type="button" class="subtle-action new-invoice-action" (click)="startNewDraft()" [disabled]="saving">{{ t('ui.m_4c76v') }}</button>
        } @else {
          <p class="summary-pending-note">{{ t('ui.m_fbcm87') }}</p>
        }
      </section>

      <section class="editor-card notes-card" aria-labelledby="invoice-notes-heading">
        <div class="section-heading"><div>
          <h4 id="invoice-notes-heading">{{ t('ui.m_mpjnzc') }}</h4>
          <p>{{ t('ui.m_1nbo20g') }}</p>
        </div></div>
        <label class="field">
          <span>{{ t('ui.m_f3kt9t') }}</span>
          <textarea name="invoiceNotes" [(ngModel)]="notes" (ngModelChange)="markDirty()" maxlength="2000" rows="3" [disabled]="locked" [placeholder]="t('ui.m_gauklj')"></textarea>
        </label>
        <small class="notes-counter">{{ notes.length }} / 2000</small>
      </section>

      <footer class="editor-actions">
        <p>{{ t('ui.m_1b0glke') }}</p>
        <div class="action-buttons">
          <button type="button" class="secondary-action" (click)="cancel.emit()" [disabled]="saving || blocked">{{ t('ui.m_pw64as') }}</button>
          <button type="button" class="primary-action" (click)="submit()" [disabled]="locked">{{ saving ? t('ui.m_jol8r9') : t('ui.m_1ygqune') }}</button>
        </div>
      </footer>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}.invoice-editor-shell{display:grid;gap:16px;min-width:0;color:var(--aba-color-text-primary,#172033)}
    .editor-topbar{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0}
    .back-button{display:grid;place-items:center;width:42px;height:42px;border:1px solid var(--aba-color-border,#d0d5dd);border-radius:12px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font-size:22px;cursor:pointer}
    .editor-title{min-width:0}.editor-title h3{margin:0;font-size:19px;line-height:1.35;font-weight:750}.editor-title p,.section-heading p{margin:4px 0 0;color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.55}
    .draft-status{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:4px 10px;border:1px solid var(--aba-color-border,#d0d5dd);border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#475569);font-size:11px;font-weight:700;white-space:nowrap}
    .editor-card{display:grid;gap:14px;min-width:0;padding:18px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:16px;background:var(--aba-color-surface,#fff);box-shadow:0 3px 14px rgb(15 23 42 / 3%)}
    .section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.section-heading h4{margin:0;font-size:15px;line-height:1.4;font-weight:750;color:var(--aba-color-text-primary,#172033)}
    .invoice-details-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(140px,.55fr) minmax(0,1.6fr);gap:12px;align-items:end;min-width:0}
    .field{display:grid;gap:7px;min-width:0;color:var(--aba-color-text-secondary,#475569);font-size:12px;font-weight:600}.field>span{line-height:1.4}
    input,select,textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--aba-color-border,#d0d5dd);border-radius:10px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font:inherit;font-size:13px;font-weight:400}
    input,select{min-height:44px;padding:10px 12px}textarea{min-height:92px;padding:11px 12px;resize:vertical;line-height:1.55}
    input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid var(--aba-color-focus,#0f766e);outline-offset:2px}
    .readonly-field,.rate-field input[readonly]{background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#475569)}
    .customer-more{align-self:end;justify-self:start}.line-count{color:var(--aba-color-text-secondary,#64748b);font-size:11px;font-weight:700;white-space:nowrap}
    .line-list{display:grid;gap:12px}.line-card{display:grid;gap:12px;min-width:0;padding:15px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:13px;background:var(--aba-color-surface-subtle,#f8fafc)}
    .line-card-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}.line-card-heading strong{font-size:13px;font-weight:750}
    .remove-line{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:5px 8px;border:0;border-radius:8px;background:transparent;color:var(--aba-color-danger-text,#b42318);font:inherit;font-size:11px;cursor:pointer}.remove-line span[aria-hidden]{font-size:17px;line-height:1}
    .line-kind-switch{display:inline-grid;grid-template-columns:1fr 1fr;width:min(100%,270px);gap:3px;padding:3px;border:1px solid var(--aba-color-border,#d0d5dd);border-radius:10px;background:var(--aba-color-surface,#fff)}
    .kind-option{min-height:36px;padding:7px 12px;border:0;border-radius:7px;background:transparent;color:var(--aba-color-text-secondary,#64748b);font:inherit;font-size:12px;font-weight:650;cursor:pointer}
    .kind-option.active{background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59);box-shadow:inset 0 0 0 1px var(--aba-color-primary-border,#99f6e4)}
    .line-fields{display:grid;gap:11px;min-width:0;align-items:end}.product-line{grid-template-columns:minmax(0,1.25fr) minmax(110px,.65fr) minmax(0,1.2fr) minmax(88px,.55fr)}.service-line{grid-template-columns:minmax(0,1.5fr) minmax(130px,.8fr) minmax(88px,.55fr)}
    .line-list-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.add-line-action,.subtle-action{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:5px 2px;border:0;background:transparent;color:var(--aba-color-primary-strong,#115e59);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.add-line-action span{font-size:18px;line-height:1}
    .readonly-rates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.rate-field{padding:11px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc)}.rate-field small{color:var(--aba-color-text-secondary,#64748b);font-size:11px;font-weight:500}
    .summary-row{display:flex;justify-content:space-between;gap:12px;padding-top:4px;color:var(--aba-color-text-secondary,#64748b);font-size:12px}.summary-row strong{color:var(--aba-color-text-primary,#172033);font-weight:700;font-variant-numeric:tabular-nums;text-align:end}
    .summary-total{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px;padding-top:13px;border-top:1px solid var(--aba-color-border-subtle,#e2e8f0);font-size:15px;font-weight:800}.summary-total strong{color:var(--aba-color-primary-strong,#115e59);font-size:19px;font-variant-numeric:tabular-nums;text-align:end}
    .summary-pending-note{margin:0;color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.55}.notes-counter{justify-self:end;color:var(--aba-color-text-tertiary,#64748b);font-size:10px;font-weight:500}
    .editor-actions{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:14px;background:var(--aba-color-surface,#fff);box-shadow:0 -4px 16px rgb(15 23 42 / 5%)}
    .editor-actions p{margin:0;color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.5}.action-buttons{display:flex;align-items:center;gap:8px}
    .primary-action,.secondary-action{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:9px 16px;border:1px solid transparent;border-radius:10px;font:inherit;font-size:12px;font-weight:750;cursor:pointer;white-space:nowrap}
    .primary-action{background:var(--aba-color-primary,#0f766e);color:#fff}.secondary-action{border-color:var(--aba-color-border,#d0d5dd);background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033)}
    .editor-error{margin:0;padding:12px 14px;border:1px solid var(--aba-color-danger-border,#fecdca);border-radius:10px;background:var(--aba-color-danger-soft,#fef3f2);color:var(--aba-color-danger-text,#b42318);font-size:12px;line-height:1.5}.blocked-message p{margin:0 0 8px}
    button:disabled,input:disabled,select:disabled,textarea:disabled{opacity:.58;cursor:not-allowed}
    @media(max-width:760px){.invoice-details-grid{grid-template-columns:minmax(0,1fr) minmax(110px,.6fr)}.customer-field,.customer-more{grid-column:1/-1}.product-line,.service-line{grid-template-columns:minmax(0,1fr)}.line-kind-switch{width:100%}.editor-actions{align-items:stretch;flex-direction:column}.action-buttons{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)}.primary-action,.secondary-action{width:100%}}
    @media(max-width:380px){.editor-card{padding:13px}.editor-title h3{font-size:16px}.draft-status{padding-inline:7px}.readonly-rates{gap:7px}.rate-field{padding:8px}.rate-field input{padding-inline:8px}}
  @media(max-width:760px){.editor-actions{bottom:calc(92px + env(safe-area-inset-bottom));}}\n    `],
})
export class InvoiceDraftEditorComponent implements OnChanges {
  private readonly localization = inject(LocalizationService);
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() products: InvoiceDraftProduct[] = [];
  @Input() customers: InvoiceDraftCustomer[] = [];
  @Input() currencyCode = '';
  @Input() invoiceNumber = '';
  @Input() customerId = '';
  @Input() discountRate = '0';
  @Input() taxRate = '0';
  @Input() initialNotes: string | null = null;
  @Input() saving = false;
  @Input() blocked = false;
  @Input() serverSummary: InvoiceDraftServerSummary | null = null;
  @Input() initialLines: readonly InvoiceDraftLine[] | null = null;
  @Input() draftRevision = 0;
  @Input() editing = false;
  @Input() hasMoreCustomers = false;
  @Input() hasMoreProducts = false;
  @Input() loadingMoreCustomers = false;
  @Input() loadingMoreProducts = false;
  @Output() saveDraft = new EventEmitter<InvoiceDraftPayload>();
  @Output() newDraft = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() refreshStatus = new EventEmitter<void>();
  @Output() loadMoreCustomers = new EventEmitter<void>();
  @Output() loadMoreProducts = new EventEmitter<void>();

  private lineSequence = 1;
  lines: InvoiceDraftLine[] = [this.newLine('product')];
  notes = '';
  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['draftRevision']) {
      this.lines = this.initialLines?.length ? this.initialLines.map(line => ({ ...line })) : [this.newLine('product')];
      this.notes = this.initialNotes ?? '';
      this.error = '';
      this.serverSummary = null;
    }
  }

  get locked(): boolean { return this.saving || this.blocked || !!this.serverSummary; }

  startNewDraft(): void {
    if (this.saving || this.blocked) return;
    this.invoiceNumber = '';
    this.customerId = '';
    this.notes = '';
    this.lines = [this.newLine('product')];
    this.error = '';
    this.serverSummary = null;
    this.newDraft.emit();
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
  localize(message: string): string { return this.localization.translate(message); }
  formatNumber(value: string | number | null | undefined): string { return this.localization.formatNumber(value, 2, 2); }
  productPrice(productId: string): string { return this.products.find(product => product.id === productId)?.unit_price ?? ''; }

  addLine(kind: InvoiceDraftLineKind = 'product'): void {
    if (this.locked) return;
    this.lines = [...this.lines, this.newLine(kind)];
    this.markDirty();
  }

  removeLine(index: number): void {
    if (this.locked) return;
    this.lines = removeInvoiceDraftLine(this.lines, index);
    this.markDirty();
  }

  changeKind(line: InvoiceDraftLine, kind: InvoiceDraftLineKind): void {
    if (this.locked || line.kind === kind) return;
    line.kind = kind;
    line.product_id = '';
    line.description = '';
    line.unit_price = '';
    this.markDirty();
  }

  markDirty(): void { this.error = ''; this.serverSummary = null; }

  submit(): void {
    if (this.locked) return;
    try {
      const invoiceNumber = this.invoiceNumber.trim() || 'INV-' + Date.now();
      this.invoiceNumber = invoiceNumber;
      const payload = toInvoiceDraftPayload({
        invoice_number: invoiceNumber,
        currency_code: this.currencyCode,
        customer_id: this.customerId,
        lines: this.lines,
        notes: this.notes,
      }, this.products, this.customers);
      this.saveDraft.emit(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invoiceDraft.validation.invalidDraft';
      this.error = message.startsWith('invoiceDraft.validation.') ? this.t(message) : message;
    }
  }

  private newLine(kind: InvoiceDraftLineKind): InvoiceDraftLine {
    const id = 'invoice-line-' + this.lineSequence++;
    return { id, kind, product_id: '', description: '', quantity: '1', unit_price: '' };
  }
}
