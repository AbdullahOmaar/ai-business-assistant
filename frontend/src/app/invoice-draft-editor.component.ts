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

      <div class="invoice-fields">
        <label>
          {{ t('رقم الفاتورة', 'Invoice number') }}
          <input name="invoiceNumber" [(ngModel)]="invoiceNumber" (ngModelChange)="markDirty()" maxlength="80" [disabled]="locked" />
        </label>
        <label>
          {{ t('العميل', 'Customer') }}
          <select name="customerId" [(ngModel)]="customerId" (ngModelChange)="markDirty()" [disabled]="locked">
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

      <div class="lines-heading">
        <h4>{{ t('بنود الفاتورة', 'Invoice lines') }}</h4>
        <div class="add-actions">
          <button type="button" class="secondary" (click)="addLine('product')" [disabled]="locked">{{ t('+ منتج', '+ Product') }}</button>
          <button type="button" class="secondary" (click)="addLine('manual')" [disabled]="locked">{{ t('+ خدمة', '+ Service') }}</button>
          @if (hasMoreProducts) {
            <button type="button" class="secondary" (click)="loadMoreProducts.emit()" [disabled]="locked || loadingMoreProducts">
              {{ loadingMoreProducts ? t('جارٍ تحميل المزيد…', 'Loading more…') : t('تحميل منتجات إضافية', 'Load more products') }}
            </button>
          }
        </div>
      </div>

      <div class="line-list">
        @for (line of lines; track line.id; let index = $index) {
          <article class="line-card">
            <div class="line-top">
              <strong>{{ t('بند', 'Line') }} {{ index + 1 }}</strong>
              <div class="line-actions">
                <button type="button" class="icon-button" (click)="moveLine(index, -1)" [disabled]="locked || index === 0" [attr.aria-label]="t('تحريك لأعلى', 'Move up')">↑</button>
                <button type="button" class="icon-button" (click)="moveLine(index, 1)" [disabled]="locked || index === lines.length - 1" [attr.aria-label]="t('تحريك لأسفل', 'Move down')">↓</button>
                <button type="button" class="icon-button danger" (click)="removeLine(index)" [disabled]="locked || lines.length <= 1" [attr.aria-label]="t('حذف البند', 'Remove line')">×</button>
              </div>
            </div>
            <label>
              {{ t('نوع البند', 'Line type') }}
              <select [name]="'kind-' + line.id" [(ngModel)]="line.kind" (ngModelChange)="changeKind(line, $event)" [disabled]="locked">
                <option value="product">{{ t('منتج من الكتالوج', 'Catalog product') }}</option>
                <option value="manual">{{ t('خدمة / بند يدوي', 'Service / manual line') }}</option>
              </select>
            </label>

            @if (line.kind === 'product') {
              <label>
                {{ t('المنتج', 'Product') }}
                <select [name]="'product-' + line.id" [(ngModel)]="line.product_id" (ngModelChange)="markDirty()" [disabled]="locked">
                  <option value="">{{ t('اختَر المنتج', 'Choose product') }}</option>
                  @for (product of products; track product.id) {
                    <option [value]="product.id">{{ product.name }}</option>
                  }
                </select>
              </label>
              <label>
                {{ t('وصف إضافي (اختياري)', 'Description (optional)') }}
                <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="500" [disabled]="locked" />
              </label>
            } @else {
              <label>
                {{ t('وصف الخدمة', 'Service description') }}
                <input [name]="'description-' + line.id" [(ngModel)]="line.description" (ngModelChange)="markDirty()" maxlength="500" [disabled]="locked" />
              </label>
              <label>
                {{ t('سعر الوحدة', 'Unit price') }} ({{ currencyCode }})
                <input [name]="'price-' + line.id" inputmode="decimal" [(ngModel)]="line.unit_price" (ngModelChange)="markDirty()" placeholder="0.00" [disabled]="locked" />
              </label>
            }
            <label>
              {{ t('الكمية', 'Quantity') }}
              <input [name]="'quantity-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" (ngModelChange)="markDirty()" placeholder="1" [disabled]="locked" />
            </label>
          </article>
        }
      </div>

      @if (error) {
        <p class="error" role="alert">{{ localize(error) }}</p>
      }

      @if (serverSummary) {
        <section class="server-summary" aria-live="polite">
          <h4>{{ t('الإجماليات المحسوبة على الخادم', 'Server-calculated totals') }}</h4>
          @if (serverSummary.subtotal !== null && serverSummary.subtotal !== undefined) {
            <div><span>{{ t('الإجمالي قبل الخصم', 'Subtotal') }}</span><strong>{{ serverSummary.subtotal }} {{ serverSummary.currency_code }}</strong></div>
          }
          @if (serverSummary.discount_total !== null && serverSummary.discount_total !== undefined) {
            <div><span>{{ t('الخصم', 'Discount') }}</span><strong>{{ serverSummary.discount_total }} {{ serverSummary.currency_code }}</strong></div>
          }
          @if (serverSummary.tax_total !== null && serverSummary.tax_total !== undefined) {
            <div><span>{{ t('الضريبة', 'Tax') }}</span><strong>{{ serverSummary.tax_total }} {{ serverSummary.currency_code }}</strong></div>
          }
          <div class="total"><span>{{ t('الإجمالي', 'Total') }}</span><strong>{{ serverSummary.total }} {{ serverSummary.currency_code }}</strong></div>
          <button type="button" class="secondary" (click)="startNewDraft()" [disabled]="saving">{{ t('إنشاء فاتورة أخرى', 'Start another invoice') }}</button>
        </section>
      } @else {
        <p class="muted">{{ t('ستظهر الإجماليات بعد حفظ الفاتورة واستلام رد الخادم.', 'Totals appear after saving the invoice and receiving the server response.') }}</p>
      }

      <button type="button" class="primary save" (click)="submit()" [disabled]="locked">
        {{ saving ? t('جارٍ الحفظ…', 'Saving…') : t('حفظ مسودة الفاتورة', 'Save invoice draft') }}
      </button>
    </section>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .invoice-draft { display: grid; gap: 16px; min-width: 0; }
    .editor-heading, .lines-heading, .line-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .editor-heading h3, .lines-heading h4 { margin: 0; }
    .editor-heading p, .muted { color: var(--muted, #667085); margin: 4px 0 0; }
    .currency { font-weight: 700; white-space: nowrap; }
    .invoice-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; min-width: 0; font-size: .92rem; }
    input, select { width: 100%; min-width: 0; box-sizing: border-box; }
    .line-list { display: grid; gap: 10px; }
    .line-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px; border: 1px solid var(--border, #d0d5dd); border-radius: 12px; min-width: 0; }
    .line-top { grid-column: 1 / -1; }
    .line-actions, .add-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .icon-button { min-width: 34px; min-height: 34px; }
    .danger, .error { color: var(--danger, #b42318); }
    .server-summary { border-top: 1px solid var(--border, #d0d5dd); padding-top: 12px; display: grid; gap: 8px; }
    .server-summary h4 { margin: 0 0 4px; }
    .server-summary div { display: flex; justify-content: space-between; gap: 12px; }
    .server-summary .total { font-weight: 800; font-size: 1.08rem; }
    .save { justify-self: start; }
    .picker-more{justify-self:start;align-self:end;max-width:100%}
    @media (max-width: 600px) { .invoice-fields, .line-card { grid-template-columns: minmax(0, 1fr); } .line-top { grid-column: 1; } .save { width: 100%; } }
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
    return this.saving || !!this.serverSummary;
  }

  startNewDraft(): void {
    if (this.saving) return;
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
    if (this.saving) return;
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
