import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  InvoiceDraftInput,
  InvoiceDraftLine,
  InvoiceDraftPayload,
  InvoiceDraftProduct,
  toInvoiceDraftPayload,
  validateInvoiceDraft,
} from './invoice-draft';

export interface InvoiceDraftCustomer { id: string; name: string; }
export interface InvoiceDraftServerSummary {
  invoice_number: string;
  currency_code: string;
  subtotal?: string;
  discount_total?: string;
  tax_total?: string;
  total: string;
}

@Component({
  selector: 'aba-invoice-draft-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <form class="invoice-draft-editor" (ngSubmit)="submit()" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <div class="grid">
        <label>{{ language === 'ar' ? 'رقم الفاتورة' : 'Invoice number' }}
          <input name="invoiceNumber" maxlength="80" [(ngModel)]="invoiceNumber">
        </label>
        <label>{{ language === 'ar' ? 'العميل' : 'Customer' }}
          <select name="customerId" required [(ngModel)]="customerId">
            <option value="" disabled>{{ language === 'ar' ? 'اختر العميل' : 'Choose a customer' }}</option>
            @for (customer of customers; track customer.id) {
              <option [value]="customer.id">{{ customer.name }}</option>
            }
          </select>
        </label>
      </div>

      <div class="heading">
        <strong>{{ language === 'ar' ? 'بنود الفاتورة' : 'Invoice lines' }}</strong>
        <button type="button" [disabled]="busy" (click)="addProductLine()">{{ language === 'ar' ? 'إضافة منتج +' : 'Add product +' }}</button>
        <button type="button" [disabled]="busy" (click)="addManualLine()">{{ language === 'ar' ? 'إضافة خدمة +' : 'Add service +' }}</button>
      </div>

      @for (line of lines; track line.id; let index = $index) {
        <section class="line">
          <label>{{ language === 'ar' ? 'النوع' : 'Type' }}
            <select [name]="'kind-' + line.id" [(ngModel)]="line.kind" (ngModelChange)="resetLine(line)">
              <option value="product">{{ language === 'ar' ? 'منتج' : 'Product' }}</option>
              <option value="manual">{{ language === 'ar' ? 'خدمة / بند يدوي' : 'Service / manual' }}</option>
            </select>
          </label>
          @if (line.kind === 'product') {
            <label>{{ language === 'ar' ? 'المنتج' : 'Product' }}
              <select [name]="'product-' + line.id" [(ngModel)]="line.product_id">
                <option value="" disabled>{{ language === 'ar' ? 'اختر منتجًا' : 'Choose a product' }}</option>
                @for (product of products; track product.id) {
                  <option [value]="product.id">{{ product.name }} · {{ product.unit_price }} {{ currencyCode }}</option>
                }
              </select>
            </label>
          } @else {
            <label>{{ language === 'ar' ? 'الوصف' : 'Description' }}
              <input [name]="'description-' + line.id" maxlength="500" [(ngModel)]="line.description">
            </label>
            <label>{{ language === 'ar' ? 'سعر الوحدة' : 'Unit price' }}
              <input [name]="'price-' + line.id" type="number" min="0" step="0.01" [(ngModel)]="line.unit_price">
            </label>
          }
          <label>{{ language === 'ar' ? 'الكمية' : 'Quantity' }}
            <input [name]="'quantity-' + line.id" type="number" min="0.001" step="0.001" [(ngModel)]="line.quantity">
          </label>
          <div class="line-actions">
            <button type="button" [disabled]="busy || index === 0" (click)="moveLine(index, -1)" [attr.aria-label]="language === 'ar' ? 'تحريك لأعلى' : 'Move up'">↑</button>
            <button type="button" [disabled]="busy || index === lines.length - 1" (click)="moveLine(index, 1)" [attr.aria-label]="language === 'ar' ? 'تحريك لأسفل' : 'Move down'">↓</button>
            <button type="button" [disabled]="busy || lines.length <= 1" (click)="removeLine(index)">{{ language === 'ar' ? 'حذف' : 'Remove' }}</button>
          </div>
        </section>
      }

      <div class="grid rates">
        <label>{{ language === 'ar' ? 'الخصم (%)' : 'Discount (%)' }}
          <input name="discountRate" type="number" min="0" max="100" step="any" [(ngModel)]="discountRate">
        </label>
        <label>{{ language === 'ar' ? 'الضريبة (%)' : 'Tax (%)' }}
          <input name="taxRate" type="number" min="0" max="100" step="any" [(ngModel)]="taxRate">
        </label>
      </div>

      @if (validationMessage) { <p class="error" role="alert">{{ validationMessage }}</p> }
      @if (serverSummary; as summary) {
        <dl class="server-summary" aria-live="polite">
          <div><dt>{{ language === 'ar' ? 'الإجمالي قبل الخصم' : 'Subtotal' }}</dt><dd>{{ summary.subtotal ?? '—' }} {{ summary.currency_code }}</dd></div>
          <div><dt>{{ language === 'ar' ? 'الخصم' : 'Discount' }}</dt><dd>{{ summary.discount_total ?? '—' }} {{ summary.currency_code }}</dd></div>
          <div><dt>{{ language === 'ar' ? 'الضريبة' : 'Tax' }}</dt><dd>{{ summary.tax_total ?? '—' }} {{ summary.currency_code }}</dd></div>
          <div><dt>{{ language === 'ar' ? 'الإجمالي' : 'Total' }}</dt><dd>{{ summary.total }} {{ summary.currency_code }}</dd></div>
        </dl>
      } @else {
        <p class="hint">{{ language === 'ar' ? 'سيتم عرض الإجماليات بعد حفظ المسودة واستلام نتيجة الخادم.' : 'Totals appear only after the draft is saved and the server response is received.' }}</p>
      }

      <div class="actions">
        <button type="submit" [disabled]="busy || !customers.length">{{ language === 'ar' ? 'حفظ المسودة' : 'Save draft' }}</button>
        <button type="button" [disabled]="busy" (click)="cancel.emit()">{{ language === 'ar' ? 'إلغاء' : 'Cancel' }}</button>
      </div>
    </form>
  `,
  styles: [`
    :host{display:block;min-width:0}.invoice-draft-editor{display:grid;gap:14px;min-width:0}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    label{display:grid;gap:6px;min-width:0;font-size:13px;font-weight:650}
    input,select{box-sizing:border-box;width:100%;min-width:0;min-height:42px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a}
    .heading,.line,.actions,.line-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
    .heading{justify-content:space-between}.line{display:grid;grid-template-columns:1fr 1.5fr 1fr auto;align-items:end;padding:12px;border:1px solid #e2e8f0;border-radius:11px}
    button{min-height:38px;padding:7px 11px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;cursor:pointer}
    button:disabled{opacity:.5;cursor:not-allowed}.line-actions{justify-content:flex-end}.rates{max-width:420px}
    .server-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:12px;border:1px solid #dbeafe;border-radius:10px;background:#f8fafc}
    .server-summary div{display:flex;justify-content:space-between;gap:8px;min-width:0}.server-summary dt{color:#475569}.server-summary dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}
    .hint{margin:0;color:#64748b;font-size:12px}.error{margin:0;color:#b91c1c}
    @media(max-width:650px){.grid,.line,.server-summary{grid-template-columns:minmax(0,1fr)}.line-actions{justify-content:flex-start}}
  `],
})
export class InvoiceDraftEditorComponent {
  @Input() customers: InvoiceDraftCustomer[] = [];
  @Input() products: InvoiceDraftProduct[] = [];
  @Input() currencyCode = '';
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() busy = false;
  @Input() serverSummary: InvoiceDraftServerSummary | null = null;
  @Output() saveDraft = new EventEmitter<InvoiceDraftPayload>();
  @Output() cancel = new EventEmitter<void>();

  invoiceNumber = '';
  customerId = '';
  discountRate = '0';
  taxRate = '0';
  lines: InvoiceDraftLine[] = [this.newLine('product')];
  validationMessage = '';
  private nextId = 1;

  addProductLine(): void { if (!this.busy) this.lines = [...this.lines, this.newLine('product')]; }
  addManualLine(): void { if (!this.busy) this.lines = [...this.lines, this.newLine('manual')]; }
  removeLine(index: number): void {
    if (!this.busy && this.lines.length > 1) this.lines = this.lines.filter((_, i) => i !== index);
  }
  moveLine(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (this.busy || target < 0 || target >= this.lines.length) return;
    const next = [...this.lines];
    [next[index], next[target]] = [next[target], next[index]];
    this.lines = next;
  }
  resetLine(line: InvoiceDraftLine): void {
    line.product_id = '';
    line.description = '';
    line.unit_price = '';
  }
  submit(): void {
    const input: InvoiceDraftInput = {
      invoice_number: this.invoiceNumber,
      currency_code: this.currencyCode,
      customer_id: this.customerId,
      discount_rate: this.discountRate,
      tax_rate: this.taxRate,
      lines: this.lines,
    };
    this.validationMessage = validateInvoiceDraft(input, this.products) ?? '';
    if (this.validationMessage || this.busy) return;
    this.saveDraft.emit(toInvoiceDraftPayload(input, this.products));
  }
  private newLine(kind: 'product' | 'manual'): InvoiceDraftLine {
    return { id: `invoice-line-${this.nextId++}`, kind, product_id: '', description: '', quantity: '1', unit_price: '' };
  }
}
