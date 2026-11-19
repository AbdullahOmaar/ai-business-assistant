import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, CreditNote, Invoice, InvoiceDetail, SalesReturn } from './api.service';

type ReturnDraftLine = {
  invoiceLineId: string;
  description: string;
  invoicedQuantity: string;
  quantity: string;
};

@Component({
  selector: 'aba-credit-note-issuance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="panel" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'"
      aria-labelledby="credit-note-heading">
      <header class="heading">
        <div>
          <h2 id="credit-note-heading">{{ language === 'ar' ? 'مرتجعات العملاء والإشعارات الدائنة' : 'Customer returns & credit notes' }}</h2>
          <p>{{ language === 'ar'
            ? 'الإشعار الدائن مستند مستقل؛ لا يخصم المديونية ولا يثبت رد أموال نقدية.'
            : 'A credit note is a separate document; it does not apply receivable credit or prove a cash refund.' }}</p>
        </div>
        <button type="button" (click)="refresh()" [disabled]="loading">
          {{ loading ? (language === 'ar' ? 'جارٍ التحميل…' : 'Loading…') : (language === 'ar' ? 'تحديث' : 'Refresh') }}
        </button>
      </header>

      @if (message) { <p class="notice" role="status" aria-live="polite">{{ message }}</p> }
      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      @if (loading && !returns.length && !notes.length) {
        <p role="status">{{ language === 'ar' ? 'جارٍ تحميل البيانات…' : 'Loading records…' }}</p>
      }

      <h3>{{ language === 'ar' ? 'إنشاء مسودة مرتجع' : 'Create a return draft' }}</h3>
      <form class="return-form" (ngSubmit)="createReturn()">
        <label>
          {{ language === 'ar' ? 'الفاتورة الصادرة' : 'Issued invoice' }}
          <select name="returnInvoice" required [(ngModel)]="selectedInvoiceId"
            (ngModelChange)="onInvoiceSelected($event)" [disabled]="loading || creatingReturn">
            <option value="">{{ language === 'ar' ? 'اختر فاتورة صادرة' : 'Choose an issued invoice' }}</option>
            @for (invoice of issuedInvoices; track invoice.id) {
              <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option>
            }
          </select>
        </label>
        <label>
          {{ language === 'ar' ? 'سبب المرتجع (اختياري)' : 'Return reason (optional)' }}
          <input name="returnReason" maxlength="500" [(ngModel)]="returnReason" [disabled]="creatingReturn">
        </label>
        @if (detailLoading) {
          <p role="status">{{ language === 'ar' ? 'جارٍ تحميل بنود الفاتورة…' : 'Loading invoice lines…' }}</p>
        }
        @if (invoiceDetail) {
          <div class="return-lines">
            @for (line of returnLines; track line.invoiceLineId) {
              <label class="return-line">
                <span>{{ line.description }} <small>({{ language === 'ar' ? 'الكمية بالفاتورة' : 'Invoiced qty' }}: {{ line.invoicedQuantity }})</small></span>
                <input type="number" [name]="'returnQty' + line.invoiceLineId" min="0" [max]="line.invoicedQuantity"
                  step="0.001" [(ngModel)]="line.quantity" [disabled]="creatingReturn"
                  [attr.aria-label]="(language === 'ar' ? 'كمية المرتجع: ' : 'Return quantity: ') + line.description">
              </label>
            }
          </div>
          <p class="footnote">{{ language === 'ar'
            ? 'الخادم يحسب قيمة المرتجع من بيانات الفاتورة المحفوظة. اعتماد المرتجع وإصدار الإشعار الدائن عمليتان منفصلتان.'
            : 'The server derives return amounts from persisted invoice data. Return approval and credit-note issuance are separate actions.' }}</p>
        }
        <button class="primary" type="submit"
          [disabled]="loading || creatingReturn || detailLoading || !invoiceDetail || !returnLines.length">
          {{ creatingReturn ? (language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (language === 'ar' ? 'حفظ مسودة المرتجع' : 'Save return draft') }}
        </button>
      </form>

      <h3>{{ language === 'ar' ? 'المرتجعات' : 'Sales returns' }}</h3>
      @if (!loading && !returns.length) {
        <p class="empty">{{ language === 'ar' ? 'لا توجد مرتجعات بعد.' : 'No returns yet.' }}</p>
      }
      <div class="records">
        @for (ret of returns; track ret.id) {
          <article class="record">
            <div class="record-main">
              <strong>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(ret.id) }}</strong>
              <small>{{ language === 'ar' ? 'الفاتورة' : 'Invoice' }} · {{ invoiceNumber(ret.invoice_id) }}</small>
              @if (ret.reason) { <small>{{ ret.reason }}</small> }
              <small>{{ statusLabel(ret.status) }} · {{ ret.created_at | date:'short' }}</small>
            </div>
            <strong class="amount">{{ ret.total }}</strong>
            @if (ret.status === 'draft' && role === 'owner') {
              <button type="button" class="primary" (click)="approve(ret)"
                [disabled]="loading || creatingReturn || actionId !== null">
                {{ actionId === ret.id ? (language === 'ar' ? 'جارٍ الاعتماد…' : 'Approving…') : (language === 'ar' ? 'اعتماد المرتجع' : 'Approve return') }}
              </button>
            }
            @if (ret.status === 'approved') {
              @if (creditNoteForReturn(ret.id); as note) {
                <span class="issued">{{ language === 'ar' ? 'صدر الإشعار' : 'Issued' }} · {{ note.credit_note_number }}</span>
              } @else if (role === 'owner') {
                <button type="button" class="primary" (click)="issue(ret)"
                  [disabled]="loading || actionId !== null">
                  {{ actionId === ret.id ? (language === 'ar' ? 'جارٍ الإصدار…' : 'Issuing…') : (language === 'ar' ? 'إصدار إشعار دائن' : 'Issue credit note') }}
                </button>
              } @else {
                <span class="muted">{{ language === 'ar' ? 'إصدار الإشعار للمالك فقط' : 'Owner-only issuance' }}</span>
              }
            }
          </article>
        }
      </div>

      <h3>{{ language === 'ar' ? 'الإشعارات الدائنة الصادرة' : 'Issued credit notes' }}</h3>
      @if (!loading && !notes.length) {
        <p class="empty">{{ language === 'ar' ? 'لا توجد إشعارات دائنة صادرة.' : 'No credit notes issued.' }}</p>
      }
      <div class="records">
        @for (note of notes; track note.id) {
          <article class="record">
            <div class="record-main">
              <strong>{{ note.credit_note_number }}</strong>
              <small>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(note.sales_return_id) }}</small>
              <small>{{ language === 'ar' ? 'العميل' : 'Customer' }} · {{ customerName(note.customer_id) }}</small>
              <small>{{ note.created_at | date:'short' }}</small>
            </div>
            <strong class="amount">{{ note.total }} {{ note.currency_code }}</strong>
            <span class="issued">{{ language === 'ar' ? 'صادر' : 'Issued' }}</span>
          </article>
        }
      </div>

      <p class="footnote">{{ language === 'ar'
        ? 'المرحلة الحالية تصدر المستند فقط. لا يتم تطبيق الرصيد على المديونية أو تسجيل رد نقدي. الفواتير ذات الضريبة موقوفة حتى اعتماد توزيع الضريبة.'
        : 'This phase issues the document only. It does not apply credit to receivables or record a cash refund. Tax-bearing invoices remain blocked until tax allocation is approved.' }}</p>
    </section>
  `,
  styles: [`
    :host { display: block; margin-block-start: 1rem; }
    .panel { background: var(--panel, #fff); border: 1px solid var(--border, #dfe5ec); border-radius: 16px; padding: 1rem; color: var(--text, #172033); }
    .heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    h2 { margin: 0 0 .4rem; font-size: 1.2rem; } h3 { margin: 1.2rem 0 .6rem; font-size: 1rem; }
    p, .muted, .footnote { color: var(--muted, #5b6474); line-height: 1.5; } .footnote { font-size: .85rem; margin-block-start: 1rem; }
    .return-form { display: grid; gap: .8rem; margin: .6rem 0 1.2rem; }
    label { display: grid; gap: .35rem; font-size: .92rem; min-width: 0; }
    input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: .65rem; border: 1px solid var(--border, #cbd5e1); border-radius: 9px; background: var(--surface, #fff); color: inherit; }
    .return-lines, .records { display: grid; gap: .6rem; }
    .return-line { grid-template-columns: minmax(0, 1fr) minmax(90px, 140px); align-items: center; border: 1px solid var(--border, #dfe5ec); border-radius: 10px; padding: .65rem; }
    .return-line small, .record small { display: block; color: var(--muted, #5b6474); overflow-wrap: anywhere; }
    .record { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; border: 1px solid var(--border, #dfe5ec); border-radius: 12px; padding: .8rem; }
    .record-main { display: grid; gap: .2rem; flex: 1 1 190px; min-width: 0; }
    .amount { white-space: nowrap; } .issued { color: var(--success, #176b45); font-size: .88rem; font-weight: 600; overflow-wrap: anywhere; }
    button { min-height: 44px; border: 1px solid var(--border, #cbd5e1); border-radius: 9px; padding: .6rem .8rem; background: var(--surface, #f8fafc); color: inherit; cursor: pointer; }
    button.primary { background: var(--primary, #174ea6); color: white; border-color: transparent; } button:disabled { opacity: .6; cursor: not-allowed; }
    .notice, .error, .empty { padding: .7rem; border-radius: 8px; background: var(--surface, #f8fafc); } .error { color: var(--danger, #a32222); }
    @media (max-width: 480px) { .panel { padding: .75rem; } .record { align-items: flex-start; } .amount { flex-basis: 100%; } .return-line { grid-template-columns: 1fr; } }
  `],
})
export class CreditNoteIssuanceComponent implements OnChanges {
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
  actionId: string | null = null;
  message = '';
  error = '';
  private refreshSequence = 0;
  private detailSequence = 0;

  constructor(private readonly api: ApiService) {}

  get issuedInvoices(): Invoice[] {
    return this.invoices.filter(invoice => invoice.status === 'issued');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) {
      this.refreshSequence++;
      this.detailSequence++;
      this.invoices = [];
      this.returns = [];
      this.notes = [];
      this.invoiceDetail = null;
      this.returnLines = [];
      this.selectedInvoiceId = '';
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    const businessId = this.businessId;
    const sequence = ++this.refreshSequence;
    this.loading = true;
    this.error = '';
    try {
      const [invoices, returns, notes] = await Promise.all([
        this.api.invoices(businessId, 0, 100),
        this.api.salesReturns(businessId),
        this.api.creditNotes(businessId),
      ]);
      if (sequence !== this.refreshSequence || businessId !== this.businessId) return;
      this.invoices = invoices;
      this.returns = returns.items;
      this.notes = notes.items;
    } catch (error) {
      if (sequence === this.refreshSequence && businessId === this.businessId) {
        this.error = this.messageFor(error);
      }
    } finally {
      if (sequence === this.refreshSequence && businessId === this.businessId) this.loading = false;
    }
  }

  async onInvoiceSelected(invoiceId: string): Promise<void> {
    const sequence = ++this.detailSequence;
    this.invoiceDetail = null;
    this.returnLines = [];
    if (!invoiceId) return;
    this.detailLoading = true;
    this.error = '';
    try {
      const detail = await this.api.invoiceDetail(this.businessId, invoiceId);
      if (sequence !== this.detailSequence || invoiceId !== this.selectedInvoiceId) return;
      if (detail.status !== 'issued') throw new Error('Only issued invoices can be returned.');
      this.invoiceDetail = detail;
      this.returnLines = detail.lines.map(line => ({
        invoiceLineId: line.id,
        description: line.description,
        invoicedQuantity: line.quantity,
        quantity: '0',
      }));
    } catch (error) {
      if (sequence === this.detailSequence) this.error = this.messageFor(error);
    } finally {
      if (sequence === this.detailSequence) this.detailLoading = false;
    }
  }

  async createReturn(): Promise<void> {
    if (!this.businessId || !this.invoiceDetail || this.creatingReturn) return;
    const lines = this.returnLines
      .map(line => ({ invoice_line_id: line.invoiceLineId, quantity: String(line.quantity).trim() }))
      .filter(line => line.quantity && Number(line.quantity) > 0);
    if (!lines.length || lines.some(line => !Number.isFinite(Number(line.quantity)))) {
      this.error = this.language === 'ar' ? 'أدخل كمية مرتجع صحيحة لبند واحد على الأقل.' : 'Enter a valid return quantity for at least one line.';
      return;
    }
    const quantities = new Map(this.returnLines.map(line => [line.invoiceLineId, Number(line.invoicedQuantity)]));
    if (lines.some(line => Number(line.quantity) > (quantities.get(line.invoice_line_id) ?? 0))) {
      this.error = this.language === 'ar' ? 'كمية المرتجع تتجاوز الكمية بالفاتورة.' : 'Return quantity exceeds the invoiced quantity.';
      return;
    }
    this.creatingReturn = true;
    this.error = '';
    this.message = '';
    try {
      await this.api.createSalesReturn(this.businessId, {
        invoice_id: this.invoiceDetail.id,
        reason: this.returnReason.trim() || undefined,
        lines,
      });
      this.selectedInvoiceId = '';
      this.invoiceDetail = null;
      this.returnLines = [];
      this.returnReason = '';
      this.message = this.language === 'ar' ? 'تم حفظ مسودة المرتجع. يلزم اعتماد المالك قبل إصدار الإشعار.' : 'Return draft saved. An owner must approve it before credit-note issuance.';
      await this.refresh();
    } catch (error) {
      this.error = this.messageFor(error);
    } finally {
      this.creatingReturn = false;
    }
  }

  async approve(ret: SalesReturn): Promise<void> {
    if (this.role !== 'owner' || this.actionId || ret.status !== 'draft') return;
    this.actionId = ret.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.approveSalesReturn(this.businessId, ret.id);
      this.message = this.language === 'ar' ? 'تم اعتماد المرتجع.' : 'Return approved.';
      await this.refresh();
    } catch (error) {
      this.error = this.messageFor(error);
    } finally {
      this.actionId = null;
    }
  }

  async issue(ret: SalesReturn): Promise<void> {
    if (this.role !== 'owner' || this.actionId || ret.status !== 'approved' || this.creditNoteForReturn(ret.id)) return;
    this.actionId = ret.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.issueCreditNote(this.businessId, ret.id);
      this.message = this.language === 'ar' ? 'تم إصدار الإشعار الدائن. لم يتم تطبيقه على المديونية أو رد أموال نقدية.' : 'Credit note issued. No receivable application or cash refund was recorded.';
      await this.refresh();
    } catch (error) {
      this.error = this.messageFor(error);
    } finally {
      this.actionId = null;
    }
  }

  creditNoteForReturn(returnId: string): CreditNote | undefined {
    return this.notes.find(note => note.sales_return_id === returnId);
  }

  invoiceNumber(invoiceId: string): string {
    return this.invoices.find(invoice => invoice.id === invoiceId)?.invoice_number ?? this.shortId(invoiceId);
  }

  customerName(customerId: string): string {
    return customerId ? this.notes.find(note => note.customer_id === customerId)?.customer_id ?? this.shortId(customerId) : '—';
  }

  shortId(value: string): string {
    return value ? value.slice(0, 8).toUpperCase() : '—';
  }

  statusLabel(status: SalesReturn['status']): string {
    if (this.language === 'ar') {
      return status === 'approved' ? 'معتمد' : status === 'rejected' ? 'مرفوض' : 'مسودة';
    }
    return status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Draft';
  }

  private messageFor(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return this.language === 'ar' ? 'تعذر تنفيذ العملية. حاول التحديث أو راجع صلاحياتك.' : 'The operation failed. Refresh or check your permissions.';
  }
}
