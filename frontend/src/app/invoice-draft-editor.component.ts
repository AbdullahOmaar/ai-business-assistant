import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  localizeInvoiceDraftValidationMessage,
  moveInvoiceDraftLine,
  removeInvoiceDraftLine,
  toInvoiceDraftPayload,
} from './invoice-draft';
import type {
  InvoiceDraftCustomer,
  InvoiceDraftLine,
  InvoiceDraftLineKind,
  InvoiceDraftPayload,
  InvoiceDraftProduct,
  InvoiceDraftServerSummary,
} from './invoice-draft';

@Component({
  selector: 'aba-invoice-draft-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="invoice-draft" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <header class="editor-heading">
        <div>
          <h3>{{ editing ? t('تعديل مسودة الفاتورة', 'Edit invoice draft') : t('فاتورة جديدة', 'New invoice') }}</h3>
          <p>{{ t('أضف المنتجات أو الخدمات، وسيتم حساب الإجماليات على الخادم.', 'Add products or services; totals are calculated by the server.') }}</p>
        </div>
        <span class="currency">{{ currencyCode }}</span>
        @if (editing && !serverSummary) {
          <button type="button" class="secondary" (click)="newDraft.emit()" [disabled]="saving">
            {{ t('إلغاء التعديل', 'Cancel edit') }}
          </button>
        }
      </header>

      <section class="invoice-section invoice-details-section" aria-labelledby="invoice-details-heading">
        <div class="invoice-section-heading">
          <div>
            <h4 id="invoice-details-heading">{{ t('بيانات الفاتورة', 'Invoice details') }}</h4>
            <p>{{ t('أدخل رقم الفاتورة وحدد العميل المرتبط بها.', 'Set the invoice number and select its customer.') }}</p>
          </div>
        </div>
        <div class="invoice-fields">
          <label class="invoice-number-field">
            <span class="field-label">{{ t('رقم الفاتورة', 'Invoice number') }} *</span>
            <input name="invoiceNumber" [(ngModel)]="invoiceNumber" (ngModelChange)="markDirty()" maxlength="64" [disabled]="locked" />
          </label>
          <label class="customer-field">
            <span class="field-label">{{ t('العميل', 'Customer') }} *</span>
            <select class="invoice-customer-select" name="customerId" [(ngModel)]="customerId" (ngModelChange)="markDirty()" [disabled]="locked">
              <option value="">{{ t('اختَر العميل', 'Choose customer') }}</option>
              @for (customer of customers; track customer.id) {
                <option [value]="customer.id">{{ customer.name }}</option>
              }
            </select>
          </label>
          @if (hasMoreCustomers) {
            <button type="button" class="secondary picker-more" (click)="loadMoreCustomers.emit()" [disabled]="locked || loadingMoreCustomers">
              {{ loadingMoreCustomers ? t('جارٍ تحميل المزيد…', 'Loading more…') : t('تحميل عملاء إضافيين', 'Load more customers') }}
            </button>
          }
        </div>
      </section>

      <section class="invoice-section invoice-lines-section" aria-labelledby="invoice-lines-heading">
        <div class="lines-heading">
          <div class="invoice-section-heading-copy">
            <h4 id="invoice-lines-heading">{{ t('بنود الفاتورة', 'Invoice lines') }}</h4>
            <p class="section-help">{{ t('أضف منتجًا من الكتالوج أو خدمة بسعر يدوي.', 'Add a catalog product or a service with a manual price.') }}</p>
          </div>
          <div class="add-actions">
            <button type="button" class="secondary" (click)="addLine('product')" [disabled]="locked">{{ t('+ منتج', '+ Product') }}</button>
            <button type="button" class="secondary" (click)="addLine('manual')" [disabled]="locked">{{ t('+ خدمة', '+ Service') }}</button>
            @if (hasMoreProducts) {
              <button type="button" class="secondary picker-more-products" (click)="loadMoreProducts.emit()" [disabled]="locked || loadingMoreProducts">
                {{ loadingMoreProducts ? t('جارٍ تحميل المزيد…', 'Loading more…') : t('تحميل منتجات إضافية', 'Load more products') }}
              </button>
            }
          </div>
        </div>

        <div class="line-list">
          @for (line of lines; track line.id; let index = $index) {
            <article class="line-card">
              <div class="line-top">
                <strong class="line-number">{{ t('بند', 'Line') }} {{ index + 1 }}</strong>
                <label class="line-kind-picker">
                  <span class="field-hint">{{ t('نوع البند', 'Line type') }}</span>
                  <select class="line-kind-select" [name]="'kind-' + line.id" [(ngModel)]="line.kind" (ngModelChange)="changeKind(line, $event)" [disabled]="locked" [attr.aria-label]="t('نوع البند', 'Line type')">
                    <option value="product">{{ t('منتج من الكتالوج', 'Catalog product') }}</option>
                    <option value="manual">{{ t('خدمة / بند يدوي', 'Service / manual line') }}</option>
                  </select>
                </label>
                <div class="line-actions">
                  <button type="button" class="icon-button" (click)="moveLine(index, -1)" [disabled]="locked || index === 0" [attr.aria-label]="t('تحريك لأعلى', 'Move up')">↑</button>
                  <button type="button" class="icon-button" (click)="moveLine(index, 1)" [disabled]="locked || index === lines.length - 1" [attr.aria-label]="t('تحريك لأسفل', 'Move down')">↓</button>
                  <button type="button" class="icon-button danger" (click)="removeLine(index)" [disabled]="locked || lines.length <= 1" [attr.aria-label]="t('حذف البند', 'Remove line')">×</button>
                </div>
              </div>
              <div class="line-fields" [class.product-line]="line.kind === 'product'" [class.service-line]="line.kind === 'manual'">
                @if (line.kind === 'product') {
                  <label class="product-picker">
                    <span class="field-hint">Product / Service</span>
                    <select [name]="'product-' + line.id" [(ngModel)]="line.product_id" (ngModelChange)="markDirty()" [disabled]="locked">
                      <option value="">{{ t('اختَر المنتج', 'Choose product') }}</option>
                      @for (product of products; track product.id) {
                        <option [value]="product.id">{{ product.name }}</option>
                      }
                    </select>
                  </label>
                  <label class="line-description-field">
                    <span class="field-label">{{ t('وصف إضافي (اختياري)', 'Description (optional)') }}</span>
                    <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="300" [disabled]="locked" />
                  </label>
                } @else {
                  <label class="service-description-field">
                    <span class="field-label">{{ t('وصف الخدمة', 'Service description') }} *</span>
                    <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="300" [disabled]="locked" />
                  </label>
                  <label class="unit-price-field">
                    <span class="field-label">{{ t('سعر الوحدة', 'Unit price') }} ({{ currencyCode }}) *</span>
                    <input [name]="'price-' + line.id" inputmode="decimal" [(ngModel)]="line.unit_price" (ngModelChange)="markDirty()" placeholder="0.00" [disabled]="locked" />
                  </label>
                }
                <label class="quantity-field">
                  <span class="field-label">{{ t('الكمية', 'Quantity') }} *</span>
                  <input [name]="'quantity-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" (ngModelChange)="markDirty()" placeholder="1" [disabled]="locked" />
                </label>
              </div>
            </article>
          }
        </div>
      </section>

      @if (error) {
        <p class="error" role="alert">{{ localize(error) }}</p>
      }

      @if (blocked) {
        <div class="error" role="alert">
          <p>{{ t('نتيجة حفظ المسودة غير مؤكدة. لا تعاود الإرسال؛ تحقّق من حالة الفاتورة أولًا.', 'The draft save outcome is uncertain. Do not submit again; check the invoice status first.') }}</p>
          <button type="button" class="secondary" (click)="refreshStatus.emit()" [disabled]="saving">{{ t('التحقق من حالة الفاتورة', 'Check invoice status') }}</button>
        </div>
      }

      @if (serverSummary) {
        <section class="server-summary invoice-summary" aria-live="polite" [attr.aria-label]="t('ملخص الفاتورة', 'Invoice summary')">
          <div class="summary-heading">
            <div>
              <h4>{{ t('ملخص الفاتورة', 'Invoice summary') }}</h4>
              <p>{{ t('الإجماليات المعروضة محسوبة من الخادم.', 'These totals are calculated by the server.') }}</p>
            </div>
          </div>
          @if (serverSummary.subtotal !== null && serverSummary.subtotal !== undefined) {
            <div><span>{{ t('الإجمالي قبل الخصم', 'Subtotal') }}</span><strong>{{ serverSummary.subtotal | number:'1.2-2' }}</strong></div>
          }
          @if (serverSummary.discount_total !== null && serverSummary.discount_total !== undefined) {
            <div><span>{{ t('الخصم', 'Discount') }}</span><strong>{{ serverSummary.discount_total | number:'1.2-2' }}</strong></div>
          }
          @if (serverSummary.tax_total !== null && serverSummary.tax_total !== undefined) {
            <div><span>{{ t('الضريبة', 'Tax') }}</span><strong>{{ serverSummary.tax_total | number:'1.2-2' }}</strong></div>
          }
          <div class="total"><span>{{ t('الإجمالي النهائي', 'Grand total') }}</span><strong>{{ serverSummary.total | number:'1.2-2' }}</strong></div>
          <button type="button" class="secondary" (click)="startNewDraft()" [disabled]="saving">{{ t('إنشاء فاتورة أخرى', 'Start another invoice') }}</button>
        </section>
      } @else {
        <section class="server-summary invoice-summary invoice-summary-pending" [attr.aria-label]="t('إجماليات الفاتورة بعد الحفظ', 'Invoice totals after save')">
          <div class="summary-heading">
            <div>
              <h4>{{ t('ملخص الفاتورة', 'Invoice summary') }}</h4>
              <p>{{ t('سيظهر الإجمالي بعد حفظ المسودة واستلام رد الخادم.', 'The total appears after saving the draft and receiving the server response.') }}</p>
            </div>
          </div>
          <p class="summary-pending-note">{{ t('لا يتم تقدير الإجماليات محليًا؛ مصدرها رد الخادم.', 'Totals are not estimated locally; the server response is the source of truth.') }}</p>
        </section>
      }

      <div class="invoice-submit-row">
        <p>{{ t('سيتم حفظها كمسودة دون إصدار الفاتورة.', 'This saves a draft; it does not issue the invoice.') }}</p>
        <button type="button" class="primary save" (click)="submit()" [disabled]="locked">
          {{ saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ مسودة الفاتورة', 'Save invoice draft') }}
        </button>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .invoice-draft { display: grid; gap: 14px; min-width: 0; }
    .editor-heading, .lines-heading, .line-top, .summary-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .editor-heading h3, .lines-heading h4, .summary-heading h4 { margin: 0; color: var(--aba-color-text-primary, #172033); }
    .editor-heading p, .summary-heading p, .muted { color: var(--aba-color-text-secondary, #64748b); margin: 4px 0 0; font-size: 12px; line-height: 1.55; }
    .currency { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 5px 10px; border: 1px solid var(--aba-color-primary-border, #99f6e4); border-radius: 999px; background: var(--aba-color-primary-soft, #ecfdf5); color: var(--aba-color-primary-strong, #115e59); font-size: 11px; font-weight: 600; white-space: nowrap; }
    .invoice-section { display: grid; gap: 12px; min-width: 0; padding: 14px; border: 1px solid var(--aba-color-border-subtle, #e2e8f0); border-radius: 14px; background: var(--aba-color-surface, #fff); }
    .invoice-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
    .invoice-section-heading h4 { margin: 0; color: var(--aba-color-text-primary, #172033); font-size: 14px; }
    .invoice-section-heading p, .section-help { margin: 4px 0 0; color: var(--aba-color-text-secondary, #64748b); font-size: 11px; line-height: 1.5; }
    .invoice-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 12px; min-width: 0; }
    label { display: grid; gap: 6px; min-width: 0; color: var(--aba-color-text-secondary, #475569); font-size: 12px; font-weight: 500; }
    .field-label { color: var(--aba-color-text-secondary, #475569); font-size: 12px; font-weight: 500; line-height: 1.4; }
    input, select { width: 100%; min-width: 0; min-height: 42px; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--aba-color-border, #d0d5dd); border-radius: 10px; background: var(--aba-color-surface, #fff); color: var(--aba-color-text-primary, #172033); font: inherit; font-size: 13px; font-weight: 400; }
    input:focus, select:focus { border-color: var(--aba-color-primary, #0f766e); }
    .invoice-fields .customer-field { grid-column: auto; }
    .invoice-fields select, .invoice-fields input, .line-fields select, .line-fields input { font-weight: 400; }
    .picker-more { justify-self: start; align-self: end; max-width: 100%; font-weight: 500; }
    .lines-heading { align-items: flex-start; flex-wrap: wrap; }
    .invoice-section-heading-copy { min-width: 0; }
    .add-actions, .line-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .add-actions button { min-height: 36px; padding: 7px 10px; font-weight: 600; }
    .picker-more-products { font-size: 11px; }
    .line-list { display: grid; gap: 10px; }
    .line-card { display: grid; gap: 12px; min-width: 0; padding: 13px; border: 1px solid var(--aba-color-border-subtle, #e2e8f0); border-radius: 12px; background: var(--aba-color-surface-subtle, #f8fafc); }
    .line-top { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }
    .line-number { color: var(--aba-color-text-primary, #172033); font-size: 12px; font-weight: 600; }
    .line-kind-picker { display: grid; gap: 4px; justify-self: start; width: min(100%, 210px); font-weight: 400; }
    .line-kind-select { min-height: 36px !important; height: 36px; max-width: 210px; padding: 7px 10px !important; border-radius: 9px !important; background: var(--aba-color-surface, #fff) !important; color: var(--aba-color-text-secondary, #475569) !important; font-size: 12px !important; font-weight: 400 !important; }
    .field-hint { color: var(--aba-color-text-tertiary, #64748b); font-size: 10px; font-weight: 500; line-height: 1.2; }
    .line-fields { display: grid; gap: 10px; min-width: 0; }
    .line-fields.product-line, .line-fields.service-line { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1.15fr) minmax(90px, .55fr); align-items: end; }
    .product-picker, .service-description-field { gap: 5px; }
    .line-actions { justify-self: end; }
    .line-actions .icon-button { min-width: 34px; min-height: 34px; padding: 5px 8px; }
    .danger, .error { color: var(--aba-color-danger-text, #b42318); }
    .server-summary { display: grid; gap: 9px; min-width: 0; padding: 14px; border: 1px solid var(--aba-color-border, #d0d5dd); border-radius: 14px; background: var(--aba-color-surface, #fff); }
    .server-summary h4 { margin: 0; color: var(--aba-color-text-primary, #172033); font-size: 14px; }
    .server-summary > div:not(.summary-heading) { display: flex; justify-content: space-between; gap: 12px; color: var(--aba-color-text-secondary, #64748b); font-size: 12px; }
    .server-summary div strong { color: var(--aba-color-text-primary, #172033); font-weight: 600; text-align: end; font-variant-numeric: tabular-nums; }
    .server-summary .total { margin-top: 2px; padding-top: 10px; border-top: 1px solid var(--aba-color-border-subtle, #e2e8f0); font-size: 14px; font-weight: 700; }
    .server-summary .total strong { color: var(--aba-color-primary-strong, #115e59); font-size: 17px; font-weight: 700; }
    .summary-pending-note { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--aba-color-surface-subtle, #f8fafc); color: var(--aba-color-text-secondary, #64748b); font-size: 11px; line-height: 1.55; }
    .save { justify-self: end; min-width: 190px; }
    .invoice-submit-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .invoice-submit-row p { margin: 0; color: var(--aba-color-text-secondary, #64748b); font-size: 11px; line-height: 1.5; }
    @media (max-width: 760px) {
      .invoice-fields { grid-template-columns: minmax(0, 1fr); }
      .line-fields.product-line, .line-fields.service-line { grid-template-columns: minmax(0, 1fr); }
      .line-top { grid-template-columns: minmax(0, 1fr) auto; }
      .line-kind-picker { grid-column: 1 / -1; grid-row: 2; width: 100%; max-width: none; }
      .line-kind-select { max-width: none; }
      .add-actions { width: 100%; }
      .add-actions button { flex: 1 1 auto; }
      .invoice-submit-row { display: grid; grid-template-columns: minmax(0, 1fr); }
      .save { width: 100%; min-width: 0; }
    }
  `],
})
export class InvoiceDraftEditorComponent implements OnChanges {
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() products: InvoiceDraftProduct[] = [];
  @Input() customers: InvoiceDraftCustomer[] = [];
  @Input() currencyCode = 'EGP';
  @Input() invoiceNumber = '';
  @Input() customerId = '';
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
  @Output() refreshStatus = new EventEmitter<void>();
  @Output() loadMoreCustomers = new EventEmitter<void>();
  @Output() loadMoreProducts = new EventEmitter<void>();

  private lineSequence = 1;
  lines: InvoiceDraftLine[] = [this.newLine('product')];
  error = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['draftRevision']) {
      this.lines = this.initialLines?.length
        ? this.initialLines.map(line => ({ ...line }))
        : [this.newLine('product')];
      this.error = '';
      this.serverSummary = null;
    }
  }

  get locked(): boolean {
    return this.saving || this.blocked || !!this.serverSummary;
  }

  startNewDraft(): void {
    if (this.saving || this.blocked) return;
    this.invoiceNumber = '';
    this.customerId = '';
    this.lines = [this.newLine('product')];
    this.error = '';
    this.serverSummary = null;
    this.newDraft.emit();
  }

  t(arabic: string, english: string): string {
    return this.language === 'ar' ? arabic : english;
  }

  localize(message: string): string {
    return localizeInvoiceDraftValidationMessage(message, this.language);
  }

  addLine(kind: InvoiceDraftLineKind): void {
    if (this.saving) return;
    this.lines = [...this.lines, this.newLine(kind)];
    this.markDirty();
  }

  removeLine(index: number): void {
    if (this.saving) return;
    this.lines = removeInvoiceDraftLine(this.lines, index);
    this.markDirty();
  }

  moveLine(index: number, direction: -1 | 1): void {
    if (this.saving) return;
    this.lines = moveInvoiceDraftLine(this.lines, index, direction);
    this.markDirty();
  }

  changeKind(line: InvoiceDraftLine, kind: InvoiceDraftLineKind): void {
    if (this.saving) return;
    line.kind = kind;
    line.product_id = '';
    line.description = '';
    line.unit_price = '';
    this.markDirty();
  }

  markDirty(): void {
    this.error = '';
    this.serverSummary = null;
  }

  submit(): void {
    if (this.saving || this.blocked) return;
    try {
      const invoiceNumber = this.invoiceNumber.trim() || 'INV-' + Date.now();
      this.invoiceNumber = invoiceNumber;
      const payload = toInvoiceDraftPayload({
        invoice_number: invoiceNumber,
        currency_code: this.currencyCode,
        customer_id: this.customerId,
        lines: this.lines,
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
