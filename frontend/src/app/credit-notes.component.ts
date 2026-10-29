import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, CreditNote, Invoice, InvoiceDetail, SalesReturn } from './api.service';

type ReturnDraftLine = { invoiceLineId: string; description: string; invoicedQuantity: string; quantity: string };

@Component({
  selector: 'aba-credit-notes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="panel" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <div class="heading">
        <div>
          <h2>{{ language === 'ar' ? 'مرتجعات العملاء والإشعارات الدائنة' : 'Customer returns & credit notes' }}</h2>
          <p>{{ language === 'ar' ? 'الإشعار الدائن لا يعني رد أموال نقدية ولا يعدّل إجمالي الفاتورة الأصلية.' : 'A credit note does not refund cash or change the original invoice total.' }}</p>
        </div>
        <button type="button" (click)="refresh()" [disabled]="loading">{{ loading ? (language === 'ar' ? 'جارٍ التحميل…' : 'Loading…') : (language === 'ar' ? 'تحديث' : 'Refresh') }}</button>
      </div>
      @if (message) { <p class="notice" role="status" aria-live="polite">{{ message }}</p> }
      @if (error) { <p class="error" role="alert">{{ error }}</p> }

      <h3>{{ language === 'ar' ? 'إنشاء مرتجع' : 'Create a return' }}</h3>
      <form class="return-form" (ngSubmit)="createReturn()">
        <label>{{ language === 'ar' ? 'الفاتورة الصادرة' : 'Issued invoice' }}
          <select name="returnInvoice" required [(ngModel)]="selectedInvoiceId" (ngModelChange)="onInvoiceSelected($event)" [disabled]="loading || creatingReturn">
            <option value="">{{ language === 'ar' ? 'اختر فاتورة صادرة' : 'Choose an issued invoice' }}</option>
            @for (invoice of invoices; track invoice.id) {
              <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option>
            }
          </select>
        </label>
        <label>{{ language === 'ar' ? 'سبب المرتجع (اختياري)' : 'Return reason (optional)' }}
          <input name="returnReason" maxlength="500" [(ngModel)]="returnReason" [disabled]="creatingReturn">
        </label>
        @if (detailLoading) { <p role="status">{{ language === 'ar' ? 'جارٍ تحميل بنود الفاتورة…' : 'Loading invoice lines…' }}</p> }
        @if (invoiceDetail) {
          <div class="return-lines">
            @for (line of returnLines; track line.invoiceLineId) {
              <label class="return-line">
                <span>{{ line.description }} <small>({{ language === 'ar' ? 'الكمية بالفاتورة' : 'Invoiced qty' }}: {{ line.invoicedQuantity }})</small></span>
                <input type="number" [name]="'returnQty' + line.invoiceLineId" min="0" [max]="line.invoicedQuantity" step="0.001" [(ngModel)]="line.quantity" [disabled]="creatingReturn" [attr.aria-label]="(language === 'ar' ? 'كمية المرتجع: ' : 'Return quantity: ') + line.description">
              </label>
            }
          </div>
          <p class="footnote">{{ language === 'ar' ? 'تُحسب قيمة المرتجع من بيانات الفاتورة المحفوظة في الخادم. اعتماد المرتجع وإصدار الإشعار الدائن منفصلان.' : 'The server derives return amounts from persisted invoice data. Return approval and credit-note issuance are separate actions.' }}</p>
        }
        <button class="primary" type="submit" [disabled]="loading || creatingReturn || detailLoading || !invoiceDetail || !returnLines.length">
          {{ creatingReturn ? (language === 'ar' ? 'جارٍ إنشاء المسودة…' : 'Creating draft…') : (language === 'ar' ? 'حفظ مسودة المرتجع' : 'Save return draft') }}
        </button>
      </form>

      <h3>{{ language === 'ar' ? 'المرتجعات' : 'Sales returns' }}</h3>
      @if (!loading && !returns.length) { <p class="empty">{{ language === 'ar' ? 'لا توجد مرتجعات بعد.' : 'No returns yet.' }}</p> }
      <div class="records">
        @for (ret of returns; track ret.id) {
          <article class="record">
            <div class="record-main">
              <strong>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(ret.id) }}</strong>
              <small>{{ language === 'ar' ? 'الفاتورة' : 'Invoice' }} · {{ shortId(ret.invoice_id) }}</small>
              @if (ret.reason) { <small>{{ ret.reason }}</small> }
              <small>{{ statusLabel(ret.status) }} · {{ ret.created_at | date:'short' }}</small>
            </div>
            <strong class="amount">{{ ret.total }}</strong>
            @if (ret.status === 'draft' && role === 'owner') {
              <button type="button" class="primary" (click)="approve(ret)" [disabled]="loading || creatingReturn || approvingId !== null || issuingId !== null">
                {{ approvingId === ret.id ? (language === 'ar' ? 'جارٍ الاعتماد…' : 'Approving…') : (language === 'ar' ? 'اعتماد المرتجع' : 'Approve return') }}
              </button>
            }
            @if (ret.status === 'approved') {
              @if (creditNoteForReturn(ret.id); as note) { <span class="issued">{{ language === 'ar' ? 'صدر إشعار' : 'Issued' }} · {{ note.credit_note_number }}</span> }
              @else if (role === 'owner') {
                <button type="button" class="primary" (click)="issue(ret)" [disabled]="loading || issuingId !== null || approvingId !== null">
                  {{ issuingId === ret.id ? (language === 'ar' ? 'جارٍ الإصدار…' : 'Issuing…') : (language === 'ar' ? 'إصدار إشعار دائن' : 'Issue credit note') }}
                </button>
              } @else { <span class="muted">{{ language === 'ar' ? 'إصدار الإشعار للمالك فقط' : 'Owner-only issuance' }}</span> }
            }
          </article>
        }
      </div>

      <h3>{{ language === 'ar' ? 'الإشعارات الدائنة الصادرة' : 'Issued credit notes' }}</h3>
      @if (!loading && !notes.length) { <p class="empty">{{ language === 'ar' ? 'لا توجد إشعارات دائنة بعد.' : 'No credit notes have been issued yet.' }}</p> }
      <div class="records">
        @for (note of notes; track note.id) {
          <article class="record">
            <div class="record-main"><strong>{{ note.credit_note_number }}</strong><small>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(note.sales_return_id) }}</small><small>{{ language === 'ar' ? 'العميل' : 'Customer' }} · {{ shortId(note.customer_id) }}</small></div>
            <strong class="amount">{{ note.total }} {{ note.currency_code }}</strong><span class="issued">{{ language === 'ar' ? 'صادر' : 'Issued' }}</span>
          </article>
        }
      </div>
      <p class="footnote">{{ language === 'ar' ? 'إصدار الإشعار موقوف للفواتير ذات الضريبة حتى دعم توزيع الضريبة على بنود المرتجع. لا يتم تسجيل رد نقدي أو خصم رصيد العميل تلقائيًا.' : 'Issuance is blocked for tax-bearing invoices until tax can be allocated to return lines. No cash refund or customer-balance credit is recorded automatically.' }}</p>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .panel { background: var(--panel, #fff); border: 1px solid var(--border, #dfe5ec); border-radius: 16px; padding: 1rem; color: var(--text, #172033); }
    .heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    h2 { margin: 0 0 .4rem; font-size: 1.2rem; } h3 { margin: 1.2rem 0 .6rem; font-size: 1rem; }
    p, .muted, .footnote { color: var(--muted, #5b6474); line-height: 1.5; } .footnote { font-size: .85rem; margin-top: 1rem; }
    .return-form { display: grid; gap: .8rem; margin: .6rem 0 1.2rem; }
    label { display: grid; gap: .35rem; font-size: .92rem; }
    input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: .65rem; border: 1px solid var(--border, #cbd5e1); border-radius: 9px; background: var(--surface, #fff); color: inherit; }
    .return-lines { display: grid; gap: .5rem; }
    .return-line { grid-template-columns: minmax(0, 1fr) minmax(90px, 140px); align-items: center; border: 1px solid var(--border, #dfe5ec); border-radius: 10px; padding: .65rem; }
    .return-line small { display: block; color: var(--muted, #5b6474); }
    .records { display: grid; gap: .6rem; } .record { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; border: 1px solid var(--border, #dfe5ec); border-radius: 12px; padding: .8rem; }
    .record-main { display: grid; gap: .2rem; flex: 1 1 190px; min-width: 0; } small { color: var(--muted, #5b6474); overflow-wrap: anywhere; }
    .amount { white-space: nowrap; } .issued { color: var(--success, #176b45); font-size: .88rem; font-weight: 600; overflow-wrap: anywhere; }
    button { border: 1px solid var(--border, #cbd5e1); border-radius: 9px; padding: .6rem .8rem; background: var(--surface, #f8fafc); color: inherit; cursor: pointer; }
    button.primary { background: var(--primary, #174ea6); color: white; border-color: transparent; } button:disabled { opacity: .6; cursor: not-allowed; }
    .notice, .error, .empty { padding: .7rem; border-radius: 8px; background: var(--surface, #f8fafc); } .error { color: var(--danger, #a32222); }
    @media (max-width: 480px) { .panel { padding: .75rem; } .record { align-items: flex-start; } .amount { flex-basis: 100%; } .return-line { grid-template-columns: 1fr; } }
  `],
})
export class CreditNotesComponent implements OnChanges {
  @Input({ required: true }) businessId = '';
  @Input() role = 'staff';
  @Input() language: 'ar' | 'en' = 'ar';

  invoices: Invoice[] = [];
  returns: SalesReturn[] = [];
  notes: CreditNote[] = [];
  invoiceDetail: InvoiceDetail | null = null;
  returnLines: ReturnDraftLine[] = [];
  selectedInvoiceId = '';
  returnReason = '';
  loading = false;
  detailLoading = false;
  creatingReturn = false;
  approvingId: string | null = null;
  issuingId: string | null = null;
  message = '';
  error = '';

  constructor(private readonly api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) {
      this.selectedInvoiceId = '';
      this.invoiceDetail = null;
      this.returnLines = [];
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.businessId || this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      const [returnsPage, notesPage, invoices] = await Promise.all([
        this.api.salesReturns(this.businessId, { limit: 100, offset: 0 }),
        this.api.creditNotes(this.businessId, { limit: 100, offset: 0 }),
        this.api.invoices(this.businessId),
      ]);
      this.returns = returnsPage.items;
      this.notes = notesPage.items;
      this.invoices = invoices.filter(invoice => invoice.status === 'issued');
      this.message = '';
    } catch {
      this.error = this.language === 'ar' ? 'تعذر تحميل الفواتير والمرتجعات. تحقق من الصلاحيات والاتصال ثم أعد المحاولة.' : 'Could not load invoices and returns. Check access and connectivity, then retry.';
    } finally {
      this.loading = false;
    }
  }

  async onInvoiceSelected(invoiceId: string): Promise<void> {
    this.invoiceDetail = null;
    this.returnLines = [];
    this.error = '';
    if (!invoiceId || !this.businessId) return;
    this.detailLoading = true;
    try {
      const detail = await this.api.invoiceDetail(this.businessId, invoiceId);
      if (detail.status !== 'issued') throw new Error('Invoice is no longer issued');
      this.invoiceDetail = detail;
      this.returnLines = detail.lines.map(line => ({
        invoiceLineId: line.id,
        description: line.description,
        invoicedQuantity: line.quantity,
        quantity: '0',
      }));
    } catch {
      this.error = this.language === 'ar' ? 'تعذر تحميل بنود الفاتورة. اختر فاتورة صادرة أخرى.' : 'Could not load invoice lines. Choose another issued invoice.';
    } finally {
      this.detailLoading = false;
    }
  }

  async createReturn(): Promise<void> {
    if (!this.businessId || !this.invoiceDetail || this.creatingReturn || this.detailLoading) return;
    const lines = this.returnLines.filter(line => Number(line.quantity) > 0);
    if (!lines.length || lines.some(line => !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || Number(line.quantity) > Number(line.invoicedQuantity))) {
      this.error = this.language === 'ar' ? 'أدخل كمية مرتجع صحيحة لا تتجاوز كمية الفاتورة لكل بند.' : 'Enter a valid return quantity that does not exceed the invoiced quantity for each line.';
      return;
    }
    this.creatingReturn = true;
    this.error = '';
    this.message = '';
    try {
      await this.api.createSalesReturn(this.businessId, {
        invoice_id: this.invoiceDetail.id,
        reason: this.returnReason.trim() || undefined,
        lines: lines.map(line => ({ invoice_line_id: line.invoiceLineId, quantity: String(line.quantity) })),
      });
      this.selectedInvoiceId = '';
      this.returnReason = '';
      this.invoiceDetail = null;
      this.returnLines = [];
      await this.refresh();
      this.message = this.language === 'ar' ? 'تم حفظ مسودة المرتجع. يلزم اعتماد المالك قبل إصدار الإشعار الدائن.' : 'Return draft saved. An owner must approve it before a credit note can be issued.';
    } catch {
      this.error = this.language === 'ar' ? 'تعذر حفظ المرتجع. قد تكون الكمية قد أُعيدت سابقًا؛ حدّث البيانات وحاول مجددًا.' : 'Could not save the return. The quantity may already have been returned; refresh and try again.';
    } finally {
      this.creatingReturn = false;
    }
  }

  async approve(ret: SalesReturn): Promise<void> {
    if (this.role !== 'owner' || ret.status !== 'draft' || this.approvingId !== null || this.issuingId !== null) return;
    this.approvingId = ret.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.approveSalesReturn(this.businessId, ret.id);
      await this.refresh();
      this.message = this.language === 'ar' ? 'تم اعتماد المرتجع. إصدار الإشعار الدائن خطوة منفصلة.' : 'Return approved. Credit-note issuance is a separate step.';
    } catch {
      this.error = this.language === 'ar' ? 'تعذر اعتماد المرتجع. راجع حالة الفاتورة والكميات المرتجعة.' : 'Could not approve the return. Check invoice status and returned quantities.';
    } finally {
      this.approvingId = null;
    }
  }

  async issue(ret: SalesReturn): Promise<void> {
    if (this.role !== 'owner' || ret.status !== 'approved' || this.issuingId !== null || this.approvingId !== null || this.creditNoteForReturn(ret.id)) return;
    this.issuingId = ret.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.issueCreditNoteForReturn(this.businessId, ret.id);
      await this.refresh();
      this.message = this.language === 'ar' ? 'تم إصدار الإشعار الدائن. لم يتم تسجيل رد نقدي أو تعديل الفاتورة الأصلية.' : 'Credit note issued. No cash refund was recorded and the original invoice was not changed.';
    } catch {
      this.error = this.language === 'ar' ? 'تعذر إصدار الإشعار. تأكد أن المرتجع معتمد وأن الفاتورة لا تحتوي على ضريبة غير موزعة.' : 'Credit note could not be issued. Confirm the return is approved and the invoice has no unallocated tax.';
    } finally {
      this.issuingId = null;
    }
  }

  creditNoteForReturn(returnId: string): CreditNote | undefined {
    return this.notes.find(note => note.sales_return_id === returnId);
  }

  statusLabel(status: SalesReturn['status']): string {
    const labels = this.language === 'ar'
      ? { draft: 'مسودة', approved: 'معتمد', rejected: 'مرفوض' }
      : { draft: 'Draft', approved: 'Approved', rejected: 'Rejected' };
    return labels[status];
  }

  shortId(value: string): string {
    return value.length > 12 ? value.slice(0, 8) + '…' : value;
  }
}
