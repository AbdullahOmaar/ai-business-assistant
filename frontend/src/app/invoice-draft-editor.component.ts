import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { localizeInvoiceDraftValidationMessage, removeInvoiceDraftLine, toInvoiceDraftPayload } from './invoice-draft';
import type { InvoiceDraftCustomer, InvoiceDraftLine, InvoiceDraftLineKind, InvoiceDraftPayload, InvoiceDraftProduct, InvoiceDraftServerSummary } from './invoice-draft';

@Component({
  selector: 'aba-invoice-draft-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="invoice-editor-shell" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <header class="editor-topbar">
        <button type="button" class="back-button" (click)="cancel.emit()" [disabled]="saving || blocked" [attr.aria-label]="t('العودة إلى الفواتير', 'Back to invoices')">{{ language === 'ar' ? '→' : '←' }}</button>
        <div class="editor-title">
          <h3>{{ editing ? t('تعديل مسودة الفاتورة', 'Edit invoice draft') : t('إنشاء فاتورة جديدة', 'Create a new invoice') }}</h3>
          <p>{{ t('احفظ الفاتورة كمسودة أولاً؛ لن يتم إصدارها من هذه الشاشة.', 'Save the invoice as a draft first; this screen does not issue it.') }}</p>
        </div>
        <span class="draft-status">{{ t('مسودة', 'Draft') }}</span>
      </header>

      <section class="editor-card" aria-labelledby="invoice-details-heading">
        <div class="section-heading"><div>
          <h4 id="invoice-details-heading">{{ t('بيانات الفاتورة', 'Invoice details') }}</h4>
          <p>{{ t('حدد بيانات الفاتورة والعميل.', 'Set the invoice details and customer.') }}</p>
        </div></div>
        <div class="invoice-details-grid">
          <label class="field">
            <span>{{ t('رقم الفاتورة', 'Invoice number') }} *</span>
            <input name="invoiceNumber" [(ngModel)]="invoiceNumber" (ngModelChange)="markDirty()" maxlength="64" autocomplete="off" [disabled]="locked" [placeholder]="t('أدخل رقم الفاتورة', 'Enter invoice number')" />
          </label>
          <label class="field">
            <span>{{ t('العملة', 'Currency') }}</span>
            <input class="readonly-field" [value]="currencyCode" readonly aria-readonly="true" />
          </label>
          <label class="field customer-field">
            <span>{{ t('العميل', 'Customer') }} *</span>
            <select class="invoice-customer-select" name="customerId" [(ngModel)]="customerId" (ngModelChange)="markDirty()" [disabled]="locked">
              <option value="">{{ t('اختَر العميل', 'Choose customer') }}</option>
              @for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }
            </select>
          </label>
          @if (hasMoreCustomers) {
            <button type="button" class="subtle-action customer-more" (click)="loadMoreCustomers.emit()" [disabled]="locked || loadingMoreCustomers">
              {{ loadingMoreCustomers ? t('جارٍ تحميل العملاء…', 'Loading customers…') : t('تحميل عملاء إضافيين', 'Load more customers') }}
            </button>
          }
        </div>
      </section>

      <section class="editor-card lines-card" aria-labelledby="invoice-lines-heading">
        <div class="section-heading">
          <div>
            <h4 id="invoice-lines-heading">{{ t('بنود الفاتورة', 'Invoice items') }}</h4>
            <p>{{ t('اختر منتجًا من الكتالوج أو أضف خدمة بسعر يدوي.', 'Choose a catalog product or add a service with a manual price.') }}</p>
          </div>
          <span class="line-count">{{ lines.length }} {{ t('بنود', 'items') }}</span>
        </div>
        <div class="line-list">
          @for (line of lines; track line.id; let index = $index) {
            <article class="line-card">
              <div class="line-card-heading">
                <strong>{{ t('البند', 'Item') }} {{ index + 1 }}</strong>
                <button type="button" class="remove-line" (click)="removeLine(index)" [disabled]="locked || lines.length <= 1" [attr.aria-label]="t('حذف البند', 'Remove line') + ' ' + (index + 1)">
                  <span aria-hidden="true">×</span><span>{{ t('حذف', 'Remove') }}</span>
                </button>
              </div>
              <div class="line-kind-switch" role="group" [attr.aria-label]="t('نوع البند', 'Line type')">
                <button type="button" class="kind-option" [class.active]="line.kind === 'product'" [attr.aria-pressed]="line.kind === 'product' ? 'true' : 'false'" (click)="changeKind(line, 'product')" [disabled]="locked">{{ t('منتج', 'Product') }}</button>
                <button type="button" class="kind-option" [class.active]="line.kind === 'manual'" [attr.aria-pressed]="line.kind === 'manual' ? 'true' : 'false'" (click)="changeKind(line, 'manual')" [disabled]="locked">{{ t('خدمة', 'Service') }}</button>
              </div>
              @if (line.kind === 'product') {
                <div class="line-fields product-line">
                  <label class="field product-picker">
                    <span>{{ t('المنتج من الكتالوج', 'Catalog product') }} *</span>
                    <select [name]="'product-' + line.id" [(ngModel)]="line.product_id" (ngModelChange)="markDirty()" [disabled]="locked">
                      <option value="">{{ t('اختَر المنتج', 'Choose product') }}</option>
                      @for (product of products; track product.id) { <option [value]="product.id">{{ product.name }}</option> }
                    </select>
                  </label>
                  <label class="field catalog-price">
                    <span>{{ t('سعر الوحدة', 'Unit price') }} ({{ currencyCode }})</span>
                    <input class="readonly-field" [value]="productPrice(line.product_id) || '—'" readonly aria-readonly="true" />
                  </label>
                  <label class="field line-description-field">
                    <span>{{ t('وصف إضافي (اختياري)', 'Additional description (optional)') }}</span>
                    <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="300" [disabled]="locked" />
                  </label>
                  <label class="field quantity-field">
                    <span>{{ t('الكمية', 'Quantity') }} *</span>
                    <input [name]="'quantity-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" (ngModelChange)="markDirty()" placeholder="1" [disabled]="locked" />
                  </label>
                </div>
              } @else {
                <div class="line-fields service-line">
                  <label class="field service-description-field">
                    <span>{{ t('وصف الخدمة', 'Service description') }} *</span>
                    <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="300" [disabled]="locked" />
                  </label>
                  <label class="field unit-price-field">
                    <span>{{ t('سعر الوحدة', 'Unit price') }} ({{ currencyCode }}) *</span>
                    <input [name]="'price-' + line.id" inputmode="decimal" [(ngModel)]="line.unit_price" (ngModelChange)="markDirty()" placeholder="0.00" [disabled]="locked" />
                  </label>
                  <label class="field quantity-field">
                    <span>{{ t('الكمية', 'Quantity') }} *</span>
                    <input [name]="'quantity-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" (ngModelChange)="markDirty()" placeholder="1" [disabled]="locked" />
                  </label>
                </div>
              }
            </article>
          }
        </div>
        <div class="line-list-footer">
          <button type="button" class="add-line-action" (click)="addLine()" [disabled]="locked"><span aria-hidden="true">＋</span> {{ t('إضافة بند آخر', 'Add another line') }}</button>
          @if (hasMoreProducts) {
            <button type="button" class="subtle-action" (click)="loadMoreProducts.emit()" [disabled]="locked || loadingMoreProducts">
              {{ loadingMoreProducts ? t('جارٍ تحميل المنتجات…', 'Loading products…') : t('تحميل منتجات إضافية', 'Load more products') }}
            </button>
          }
        </div>
      </section>

      @if (error) { <p class="editor-error" role="alert">{{ localize(error) }}</p> }
      @if (blocked) {
        <div class="editor-error blocked-message" role="alert">
          <p>{{ t('نتيجة حفظ المسودة غير مؤكدة. لا تعاود الإرسال؛ تحقّق من حالة الفاتورة أولاً.', 'The draft save outcome is uncertain. Do not submit again; check the invoice status first.') }}</p>
          <button type="button" class="secondary-action" (click)="refreshStatus.emit()" [disabled]="saving">{{ t('التحقق من حالة الفاتورة', 'Check invoice status') }}</button>
        </div>
      }

      <section class="editor-card summary-card" aria-labelledby="invoice-summary-heading" aria-live="polite">
        <div class="section-heading"><div>
          <h4 id="invoice-summary-heading">{{ t('ملخص الفاتورة', 'Invoice summary') }}</h4>
          <p>{{ t('الخصم والضريبة للعرض فقط؛ الحساب النهائي من الخادم.', 'Discount and tax are display-only; the server calculates final totals.') }}</p>
        </div></div>
        @if (serverSummary && serverSummary.subtotal !== null && serverSummary.subtotal !== undefined) {
          <div class="summary-row"><span>{{ t('الإجمالي قبل الخصم', 'Subtotal') }}</span><strong>{{ serverSummary.subtotal | number:'1.2-2' }} {{ serverSummary.currency_code }}</strong></div>
        }
        <div class="readonly-rates">
          <label class="field rate-field">
            <span>{{ t('الخصم', 'Discount') }} %</span>
            <input name="invoiceDiscountRate" [value]="discountRate || '0'" readonly aria-readonly="true" />
            @if (serverSummary?.discount_total !== null && serverSummary?.discount_total !== undefined) { <small>{{ serverSummary?.discount_total | number:'1.2-2' }} {{ serverSummary?.currency_code }}</small> }
          </label>
          <label class="field rate-field">
            <span>{{ t('الضريبة', 'Tax') }} %</span>
            <input name="invoiceTaxRate" [value]="taxRate || '0'" readonly aria-readonly="true" />
            @if (serverSummary?.tax_total !== null && serverSummary?.tax_total !== undefined) { <small>{{ serverSummary?.tax_total | number:'1.2-2' }} {{ serverSummary?.currency_code }}</small> }
          </label>
        </div>
        @if (serverSummary) {
          <div class="summary-total"><span>{{ t('الإجمالي النهائي', 'Grand total') }}</span><strong>{{ serverSummary.total | number:'1.2-2' }} {{ serverSummary.currency_code }}</strong></div>
          <button type="button" class="subtle-action new-invoice-action" (click)="startNewDraft()" [disabled]="saving">{{ t('إنشاء فاتورة أخرى', 'Create another invoice') }}</button>
        } @else {
          <p class="summary-pending-note">{{ t('ستظهر الإجماليات بعد حفظ المسودة. لا يتم تقدير أي مبلغ داخل المتصفح.', 'Totals appear after saving the draft. No amounts are estimated in the browser.') }}</p>
        }
      </section>

      <section class="editor-card notes-card" aria-labelledby="invoice-notes-heading">
        <div class="section-heading"><div>
          <h4 id="invoice-notes-heading">{{ t('ملاحظات', 'Notes') }}</h4>
          <p>{{ t('أضف أي تفاصيل إضافية مرتبطة بالمسودة.', 'Add any additional details for this draft.') }}</p>
        </div></div>
        <label class="field">
          <span>{{ t('ملاحظات الفاتورة (اختياري)', 'Invoice notes (optional)') }}</span>
          <textarea name="invoiceNotes" [(ngModel)]="notes" (ngModelChange)="markDirty()" maxlength="2000" rows="3" [disabled]="locked" [placeholder]="t('اكتب ملاحظاتك هنا…', 'Write your notes here…')"></textarea>
        </label>
        <small class="notes-counter">{{ notes.length }} / 2000</small>
      </section>

      <footer class="editor-actions">
        <p>{{ t('سيتم حفظها كمسودة دون إصدار الفاتورة.', 'This saves a draft; it does not issue the invoice.') }}</p>
        <div class="action-buttons">
          <button type="button" class="secondary-action" (click)="cancel.emit()" [disabled]="saving || blocked">{{ t('إلغاء', 'Cancel') }}</button>
          <button type="button" class="primary-action" (click)="submit()" [disabled]="locked">{{ saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ المسودة', 'Save draft') }}</button>
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

  t(arabic: string, english: string): string { return this.language === 'ar' ? arabic : english; }
  localize(message: string): string { return localizeInvoiceDraftValidationMessage(message, this.language); }
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
      this.error = error instanceof Error ? error.message : 'The invoice draft is invalid.';
    }
  }

  private newLine(kind: InvoiceDraftLineKind): InvoiceDraftLine {
    const id = 'invoice-line-' + this.lineSequence++;
    return { id, kind, product_id: '', description: '', quantity: '1', unit_price: '' };
  }
}
