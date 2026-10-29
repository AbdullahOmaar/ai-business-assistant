import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, CashRefund, CreditNote, Customer, Invoice, InvoiceDetail, SalesReturn } from './api.service';

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
      <label class="customer-filter">{{ language === 'ar' ? 'تصفية حسب العميل' : 'Filter by customer' }}
        <select name="creditNoteCustomer" [(ngModel)]="selectedCustomerId" (ngModelChange)="onCustomerFilterChanged()" [disabled]="loading">
          <option value="">{{ language === 'ar' ? 'كل العملاء' : 'All customers' }}</option>
          @for (customer of customers; track customer.id) {
            <option [value]="customer.id">{{ customer.name }}</option>
          }
        </select>
      </label>
      @if (!loading && !notes.length) { <p class="empty">{{ language === 'ar' ? 'لا توجد إشعارات دائنة لهذا الاختيار.' : 'No credit notes match this filter.' }}</p> }
      <div class="records">
        @for (note of notes; track note.id) {
          <article class="record">
            <div class="record-main"><strong>{{ note.credit_note_number }}</strong><small>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(note.sales_return_id) }}</small><small>{{ language === 'ar' ? 'العميل' : 'Customer' }} · {{ customerName(note.customer_id) }}</small></div>
            <div class="record-main credit-balance">
              <strong class="amount">{{ note.total }} {{ note.currency_code }}</strong>
              <small>{{ language === 'ar' ? 'الضريبة ضمن الإشعار' : 'Included tax' }}: {{ note.tax_total ?? '0.00' }} {{ note.currency_code }}</small>
              <small>{{ language === 'ar' ? 'المستخدم من الإشعار' : 'Applied' }}: {{ note.applied_total ?? '0.00' }} {{ note.currency_code }}</small>
              <small>{{ language === 'ar' ? 'المردود نقدًا' : 'Cash refunded' }}: {{ note.refunded_total ?? '0.00' }} {{ note.currency_code }}</small>
              <small>{{ language === 'ar' ? 'الرصيد المتبقي' : 'Remaining credit' }}: {{ remainingCredit(note) }} {{ note.currency_code }}</small>
            </div>
            <span class="issued">{{ language === 'ar' ? 'صادر' : 'Issued' }}</span>
            @if (role === 'owner' && hasRemainingCredit(note)) {
              <button type="button" class="primary" (click)="beginApplyCredit(note)" [disabled]="applyingCredit || loading">
                {{ applicationNoteId === note.id ? (language === 'ar' ? 'إلغاء التطبيق' : 'Cancel application') : (language === 'ar' ? 'تطبيق على المديونية' : 'Apply to receivable') }}
              </button>
            }
            @if (applicationNoteId === note.id) {
              <form class="apply-form" (ngSubmit)="applyCredit(note)">
                <label>{{ language === 'ar' ? 'الفاتورة المستحقة للعميل نفسه' : 'Receivable for the same customer' }}
                  <select name="applicationInvoice" required [(ngModel)]="applicationInvoiceId" (ngModelChange)="onApplicationDraftChanged()" [disabled]="applyingCredit || !eligibleInvoicesFor(note).length">
                    <option value="">{{ language === 'ar' ? 'اختر فاتورة مستحقة' : 'Choose an outstanding invoice' }}</option>
                    @for (invoice of eligibleInvoicesFor(note); track invoice.id) {
                      <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.outstanding_amount ?? '—' }} {{ invoice.currency_code }}</option>
                    }
                  </select>
                </label>
                <label>{{ language === 'ar' ? 'المبلغ المراد تطبيقه' : 'Amount to apply' }}
                  <input type="number" name="applicationAmount" min="0.01" step="0.01" [max]="applicationAmountMax(note)" [(ngModel)]="applicationAmount" (ngModelChange)="onApplicationDraftChanged()" required [disabled]="applyingCredit || !applicationInvoiceId">
                </label>
                <button class="primary" type="submit" [disabled]="applyingCredit || !canApplyToInvoice(note)">
                  {{ applyingCredit ? (language === 'ar' ? 'جارٍ تطبيق الرصيد…' : 'Applying credit…') : (language === 'ar' ? 'تأكيد تطبيق الرصيد' : 'Confirm credit application') }}
                </button>
              </form>
            }
            @if (role === 'owner' && hasRemainingCredit(note)) {
              <form class="refund-form" (ngSubmit)="refundCredit(note)">
                <h4>{{ language === 'ar' ? 'تسجيل رد نقدي منفصل' : 'Record a separate cash refund' }}</h4>
                <p class="footnote">{{ language === 'ar' ? 'لا يمكن رد مبلغ تم تطبيقه على المديونية أو تجاوز الرصيد المتبقي. يجب تسوية الفاتورة الأصلية أولًا.' : 'A refund cannot reuse applied credit or exceed the remaining balance. The original invoice receivable must be settled first.' }}</p>
                <div class="refund-fields">
                  <label>{{ language === 'ar' ? 'المبلغ' : 'Amount' }}
                    <input type="number" [name]="'refundAmount' + note.id" min="0.01" step="0.01" [max]="remainingCredit(note)" [(ngModel)]="refundAmountByNote[note.id]" required [disabled]="refundingNoteId !== null || applyingCredit || loading">
                  </label>
                  <label>{{ language === 'ar' ? 'طريقة الرد' : 'Refund method' }}
                    <select [name]="'refundMethod' + note.id" [ngModel]="refundMethodByNote[note.id] || 'cash'" (ngModelChange)="refundMethodByNote[note.id] = $event" required [disabled]="refundingNoteId !== null || applyingCredit || loading">
                      <option value="cash">{{ language === 'ar' ? 'نقدي' : 'Cash' }}</option>
                      <option value="bank">{{ language === 'ar' ? 'تحويل بنكي' : 'Bank transfer' }}</option>
                      <option value="card">{{ language === 'ar' ? 'بطاقة' : 'Card' }}</option>
                      <option value="other">{{ language === 'ar' ? 'أخرى' : 'Other' }}</option>
                    </select>
                  </label>
                </div>
                <label>{{ language === 'ar' ? 'مرجع العملية (اختياري)' : 'Refund reference (optional)' }}
                  <input [name]="'refundReference' + note.id" maxlength="128" [(ngModel)]="refundReferenceByNote[note.id]" [disabled]="refundingNoteId !== null || applyingCredit || loading">
                </label>
                @if (!canRefund(note)) { <small class="muted">{{ language === 'ar' ? 'رد النقد غير متاح قبل تسوية مديونية الفاتورة الأصلية.' : 'Cash refund is unavailable until the original invoice receivable is settled.' }}</small> }
                <button class="secondary" type="submit" [disabled]="!canRefund(note)">
                  {{ refundingNoteId === note.id ? (language === 'ar' ? 'جارٍ تسجيل الرد…' : 'Recording refund…') : (language === 'ar' ? 'تأكيد رد المبلغ' : 'Confirm cash refund') }}
                </button>
              </form>
            }
            <button type="button" class="secondary" (click)="toggleRefundHistory(note)" [disabled]="refundHistoryLoadingNoteId !== null">
              {{ refundHistoryLoadingNoteId === note.id ? (language === 'ar' ? 'جارٍ تحميل سجل الردود…' : 'Loading refund history…') : (refundHistoryExpanded[note.id] ? (language === 'ar' ? 'إخفاء سجل الردود' : 'Hide refund history') : (language === 'ar' ? 'عرض سجل الردود النقدية' : 'View cash refund history')) }}
            </button>
            @if (refundHistoryExpanded[note.id]) {
              <div class="refund-history">
                <strong>{{ language === 'ar' ? 'سجل الردود النقدية' : 'Cash refund history' }}</strong>
                @for (refund of refundsForNote(note.id); track refund.id) {
                  <div class="refund-row">
                    <span>{{ refund.amount }} {{ note.currency_code }} · {{ refundMethodLabel(refund.method) }}</span>
                    <small>{{ refund.created_at | date:'short' }}{{ refund.reference ? ' · ' + refund.reference : '' }}</small>
                  </div>
                }
                @if (!refundsForNote(note.id).length && refundHistoryLoadingNoteId !== note.id) {
                  <small class="muted">{{ language === 'ar' ? 'لا توجد عمليات رد نقدي مسجلة.' : 'No cash refunds recorded.' }}</small>
                }
                @if (refundHistoryHasMore[note.id]) {
                  <button type="button" class="secondary" (click)="loadMoreRefundHistory(note)" [disabled]="refundHistoryLoadingNoteId !== null">
                    {{ language === 'ar' ? 'تحميل المزيد' : 'Load more' }}
                  </button>
                }
              </div>
            }
          </article>
        }
      </div>
      @if (notesHasMore) {
        <button type="button" (click)="loadMoreCreditNotes()" [disabled]="loading || loadingMoreNotes" class="load-more">
          {{ loadingMoreNotes ? (language === 'ar' ? 'جارٍ تحميل المزيد…' : 'Loading more…') : (language === 'ar' ? 'تحميل المزيد من الإشعارات' : 'Load more credit notes') }}
        </button>
      }
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
    .customer-filter { display: grid; gap: .35rem; max-width: 420px; margin: .6rem 0; }
    .load-more { display: block; margin: .8rem auto; }
    label { display: grid; gap: .35rem; font-size: .92rem; }
    input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: .65rem; border: 1px solid var(--border, #cbd5e1); border-radius: 9px; background: var(--surface, #fff); color: inherit; }
    .return-lines { display: grid; gap: .5rem; }
    .return-line { grid-template-columns: minmax(0, 1fr) minmax(90px, 140px); align-items: center; border: 1px solid var(--border, #dfe5ec); border-radius: 10px; padding: .65rem; }
    .return-line small { display: block; color: var(--muted, #5b6474); }
    .records { display: grid; gap: .6rem; } .record { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; border: 1px solid var(--border, #dfe5ec); border-radius: 12px; padding: .8rem; }
    .record-main { display: grid; gap: .2rem; flex: 1 1 190px; min-width: 0; }
    .credit-balance { display: grid; gap: .2rem; } .apply-form { display: grid; flex: 1 1 100%; gap: .65rem; border-top: 1px solid var(--border, #dfe5ec); padding-top: .8rem; }
    small { color: var(--muted, #5b6474); overflow-wrap: anywhere; }
    .amount { white-space: nowrap; } .issued { color: var(--success, #176b45); font-size: .88rem; font-weight: 600; overflow-wrap: anywhere; }
    button { border: 1px solid var(--border, #cbd5e1); border-radius: 9px; padding: .6rem .8rem; background: var(--surface, #f8fafc); color: inherit; cursor: pointer; }
    button.primary { background: var(--primary, #174ea6); color: white; border-color: transparent; } button:disabled { opacity: .6; cursor: not-allowed; }
    .notice, .error, .empty { padding: .7rem; border-radius: 8px; background: var(--surface, #f8fafc); } .error { color: var(--danger, #a32222); }
    @media (max-width: 480px) { .panel { padding: .75rem; } .record { align-items: flex-start; } .amount { flex-basis: 100%; } .return-line, .refund-fields { grid-template-columns: 1fr; } }
  `],
})
export class CreditNotesComponent implements OnChanges {
  @Input({ required: true }) businessId = '';
  @Input() role = 'staff';
  @Input() language: 'ar' | 'en' = 'ar';

  invoices: Invoice[] = [];
  customers: Customer[] = [];
  returns: SalesReturn[] = [];
  notes: CreditNote[] = [];
  refundsByNote: Record<string, CashRefund[]> = {};
  refundHistoryHasMore: Record<string, boolean> = {};
  refundHistoryExpanded: Record<string, boolean> = {};
  refundHistoryLoadingNoteId: string | null = null;
  private refundHistorySequence = 0;
  refundAmountByNote: Record<string, string> = {};
  refundMethodByNote: Record<string, 'cash' | 'bank' | 'card' | 'other'> = {};
  refundReferenceByNote: Record<string, string> = {};
  refundingNoteId: string | null = null;
  private refundIdempotencyKeys: Record<string, string> = {};
  notesHasMore = false;
  loadingMoreNotes = false;
  selectedCustomerId = '';
  private readonly notesPageSize = 100;
  applicationNoteId: string | null = null;
  applicationInvoiceId = '';
  applicationAmount = '';
  applicationIdempotencyKey = '';
  applyingCredit = false;
  invoiceDetail: InvoiceDetail | null = null;
  returnLines: ReturnDraftLine[] = [];
  selectedInvoiceId = '';
  returnReason = '';
  loading = false;
  detailLoading = false;
  creatingReturn = false;
  approvingId: string | null = null;
  issuingId: string | null = null;
  private applicationIdempotencyKeys: Record<string, string> = {};
  message = '';
  error = '';
  private refreshSequence = 0;
  private invoiceDetailSequence = 0;

  constructor(private readonly api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) {
      // Invalidate in-flight requests before loading the newly selected workspace.
      this.refreshSequence++;
      this.invoiceDetailSequence++;
      this.invoices = [];
      this.customers = [];
      this.returns = [];
      this.notes = [];
      this.refundsByNote = {};
      this.refundHistoryHasMore = {};
      this.refundHistoryExpanded = {};
      this.refundHistoryLoadingNoteId = null;
      this.refundHistorySequence++;
      this.refundAmountByNote = {};
      this.refundMethodByNote = {};
      this.refundReferenceByNote = {};
      this.refundingNoteId = null;
      this.selectedCustomerId = '';
      this.notesHasMore = false;
      this.loadingMoreNotes = false;
      this.applicationNoteId = null;
      this.applicationInvoiceId = '';
      this.applicationAmount = '';
      this.applicationIdempotencyKey = '';
      this.applicationIdempotencyKeys = {};
      this.applyingCredit = false;
      this.refundIdempotencyKeys = {};
      this.selectedInvoiceId = '';
      this.invoiceDetail = null;
      this.returnLines = [];
      this.error = '';
      this.message = '';
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.businessId) return;
    const requestId = ++this.refreshSequence;
    const requestedBusinessId = this.businessId;
    const requestedCustomerId = this.selectedCustomerId;
    this.loading = true;
    this.loadingMoreNotes = false;
    this.error = '';
    try {
      const [returnsPage, notesPage, invoices, customers] = await Promise.all([
        this.api.salesReturns(requestedBusinessId, { limit: 100, offset: 0 }),
        this.api.creditNotes(requestedBusinessId, {
          limit: this.notesPageSize, offset: 0,
          customer_id: requestedCustomerId || undefined,
        }),
        this.api.invoices(requestedBusinessId),
        this.api.customers(requestedBusinessId),
      ]);
      // Ignore responses for an older refresh or a workspace the user has left.
      if (requestId !== this.refreshSequence || requestedBusinessId !== this.businessId || requestedCustomerId !== this.selectedCustomerId) return;
      this.returns = returnsPage.items;
      this.notes = notesPage.items;
      this.notesHasMore = notesPage.items.length === 100;
      this.invoices = invoices.filter(invoice => invoice.status === 'issued');
      this.customers = customers;
      this.message = '';
    } catch {
      if (requestId === this.refreshSequence && requestedBusinessId === this.businessId && requestedCustomerId === this.selectedCustomerId) {
        // Never show a previous customer's result as if it matched the newly selected filter.
        this.notes = [];
        this.notesHasMore = false;
        this.error = this.language === 'ar' ? 'تعذر تحميل الفواتير والمرتجعات. تحقق من الصلاحيات والاتصال ثم أعد المحاولة.' : 'Could not load invoices and returns. Check access and connectivity, then retry.';
      }
    } finally {
      if (requestId === this.refreshSequence) this.loading = false;
    }
  }

  onCustomerFilterChanged(): void {
    this.notes = [];
    this.notesHasMore = false;
    this.applicationNoteId = null;
    this.applicationInvoiceId = '';
    this.applicationAmount = '';
    this.applicationIdempotencyKey = '';
    void this.refresh();
  }

  remainingCredit(note: CreditNote): string {
    return note.remaining_credit ?? note.total;
  }

  hasRemainingCredit(note: CreditNote): boolean {
    return Number(this.remainingCredit(note)) > 0;
  }

  canApplyToInvoice(note: CreditNote): boolean {
    return this.eligibleInvoicesFor(note).some(invoice => invoice.id === this.applicationInvoiceId);
  }

  eligibleInvoicesFor(note: CreditNote): Invoice[] {
    return this.invoices.filter(invoice =>
      invoice.status === 'issued' &&
      invoice.customer_id === note.customer_id &&
      invoice.currency_code.trim().toUpperCase() === note.currency_code.trim().toUpperCase() &&
      (invoice.outstanding_amount === undefined || Number(invoice.outstanding_amount) > 0)
    );
  }

  applicationAmountMax(note: CreditNote): number {
    const invoice = this.eligibleInvoicesFor(note).find(item => item.id === this.applicationInvoiceId);
    const remainingCredit = Number(this.remainingCredit(note));
    const outstanding = invoice?.outstanding_amount === undefined ? remainingCredit : Number(invoice.outstanding_amount);
    return Math.max(0, Math.min(remainingCredit, outstanding));
  }

  beginApplyCredit(note: CreditNote): void {
    if (this.role !== 'owner' || this.applyingCredit) return;
    if (this.applicationNoteId === note.id) {
      this.applicationNoteId = null;
      this.applicationInvoiceId = '';
      this.applicationAmount = '';
      this.applicationIdempotencyKey = '';
      return;
    }
    this.applicationNoteId = note.id;
    this.applicationInvoiceId = this.eligibleInvoicesFor(note)[0]?.id || '';
    this.applicationAmount = '';
    this.applicationIdempotencyKey = '';
    this.error = '';
    this.message = '';
  }

  onApplicationDraftChanged(): void {
    if (!this.applyingCredit) this.applicationIdempotencyKey = '';
  }

  async applyCredit(note: CreditNote): Promise<void> {
    if (this.role !== 'owner' || this.applicationNoteId !== note.id || this.applyingCredit || !this.businessId) return;
    const amount = Number(this.applicationAmount);
    const max = this.applicationAmountMax(note);
    if (!this.eligibleInvoicesFor(note).some(invoice => invoice.id === this.applicationInvoiceId) ||
        !Number.isFinite(amount) || amount <= 0 || amount > max) {
      this.error = this.language === 'ar'
        ? 'المبلغ يجب أن يكون موجبًا وألا يتجاوز الرصيد الدائن أو المديونية المتاحة.'
        : 'Amount must be positive and cannot exceed remaining credit or the outstanding receivable.';
      return;
    }
    const requestedBusinessId = this.businessId;
    const requestedNoteId = note.id;
    const requestedInvoiceId = this.applicationInvoiceId;
    const requestedAmount = amount.toFixed(2);
    this.applyingCredit = true;
    this.error = '';
    this.message = '';
    if (!this.applicationIdempotencyKey) this.applicationIdempotencyKey = crypto.randomUUID();
    const idempotencyKey = this.applicationIdempotencyKey;
    try {
      await this.api.applyCreditNote(requestedBusinessId, {
        credit_note_id: requestedNoteId,
        invoice_id: requestedInvoiceId,
        amount: requestedAmount,
        idempotency_key: idempotencyKey,
      });
      if (requestedBusinessId !== this.businessId || this.applicationNoteId !== requestedNoteId) return;
      this.applicationNoteId = null;
      this.applicationInvoiceId = '';
      this.applicationAmount = '';
      this.applicationIdempotencyKey = '';
      await this.refresh();
      this.message = this.language === 'ar'
        ? 'تم تطبيق الرصيد على المديونية. لم يتم تسجيل رد نقدي ولم يتغير إجمالي الفاتورة الأصلية.'
        : 'Credit applied to the receivable. No cash refund was recorded and the original invoice total was unchanged.';
    } catch {
      if (requestedBusinessId === this.businessId && this.applicationNoteId === requestedNoteId) {
        // Keep the same key/body available for a safe retry if the server committed but the response was lost.
        this.error = this.language === 'ar'
          ? 'تعذر تأكيد تطبيق الرصيد. أعد المحاولة دون تغيير الفاتورة أو المبلغ لتكرار الطلب بأمان.'
          : 'Could not confirm the credit application. Retry without changing invoice or amount to safely replay the request.';
      }
    } finally {
      if (requestedBusinessId === this.businessId) this.applyingCredit = false;
    }
  }

  canRefund(note: CreditNote): boolean {
    if (this.role !== 'owner' || this.loading || this.applyingCredit || this.refundingNoteId !== null || !this.hasRemainingCredit(note)) return false;
    const invoice = this.invoices.find(item => item.id === note.invoice_id);
    const amount = Number(this.refundAmountByNote[note.id]);
    const method = this.refundMethodByNote[note.id] || 'cash';
    return invoice?.status === 'issued'
      && invoice.outstanding_amount !== undefined
      && Number(invoice.outstanding_amount) <= 0
      && Number.isFinite(amount)
      && amount > 0
      && amount <= Number(this.remainingCredit(note))
      && ['cash', 'bank', 'card', 'other'].includes(method);
  }

  async refundCredit(note: CreditNote): Promise<void> {
    if (!this.canRefund(note) || !this.businessId) return;
    const requestedBusinessId = this.businessId;
    const requestedNoteId = note.id;
    const amount = Number(this.refundAmountByNote[note.id]).toFixed(2);
    const method = this.refundMethodByNote[note.id] || 'cash';
    const reference = this.refundReferenceByNote[note.id]?.trim() || undefined;
    const requestKey = `${note.id}|${amount}|${method}|${reference ?? ''}`;
    const idempotencyKey = this.refundIdempotencyKeys[requestKey] ?? crypto.randomUUID();
    this.refundIdempotencyKeys[requestKey] = idempotencyKey;
    this.refundingNoteId = note.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.createCashRefund(requestedBusinessId, note.id, {
        amount, method, reference, idempotency_key: idempotencyKey,
      });
      delete this.refundIdempotencyKeys[requestKey];
      if (requestedBusinessId !== this.businessId) return;
      this.refundAmountByNote[note.id] = '';
      this.refundReferenceByNote[note.id] = '';
      delete this.refundsByNote[note.id];
      delete this.refundHistoryHasMore[note.id];
      await this.refresh();
      if (this.refundHistoryExpanded[note.id]) await this.loadRefundHistory(note, true);
      this.message = this.language === 'ar'
        ? 'تم تسجيل رد النقد كعملية مستقلة. لم يتم تغيير إجمالي الفاتورة الأصلية أو تسجيل خصم مديونية إضافي.'
        : 'Cash refund recorded separately. The invoice was not edited and no extra receivable credit was posted.';
    } catch {
      if (requestedBusinessId === this.businessId) {
        this.error = this.language === 'ar'
          ? 'تعذر تأكيد رد النقد. أعد المحاولة بنفس المبلغ والطريقة والمرجع لتكرار الطلب بأمان.'
          : 'Could not confirm the refund. Retry with the same amount, method, and reference to replay safely.';
      }
    } finally {
      if (requestedBusinessId === this.businessId) this.refundingNoteId = null;
    }
  }

  refundsForNote(noteId: string): CashRefund[] {
    return this.refundsByNote[noteId] ?? [];
  }

  async toggleRefundHistory(note: CreditNote): Promise<void> {
    if (this.refundHistoryExpanded[note.id]) {
      this.refundHistoryExpanded[note.id] = false;
      this.refundHistorySequence++;
      this.refundHistoryLoadingNoteId = null;
      return;
    }
    this.refundHistoryExpanded[note.id] = true;
    if (this.refundsByNote[note.id] === undefined) await this.loadRefundHistory(note, true);
  }

  async loadMoreRefundHistory(note: CreditNote): Promise<void> {
    await this.loadRefundHistory(note, false);
  }

  private async loadRefundHistory(note: CreditNote, reset: boolean): Promise<void> {
    if (!this.businessId || this.refundHistoryLoadingNoteId !== null) return;
    const requestId = ++this.refundHistorySequence;
    const requestedBusinessId = this.businessId;
    const requestedNoteId = note.id;
    const offset = reset ? 0 : (this.refundsByNote[requestedNoteId]?.length ?? 0);
    this.refundHistoryLoadingNoteId = requestedNoteId;
    this.error = '';
    try {
      const page = await this.api.cashRefunds(requestedBusinessId, {
        credit_note_id: requestedNoteId, limit: 100, offset,
      });
      if (requestId !== this.refundHistorySequence
        || requestedBusinessId !== this.businessId
        || !this.refundHistoryExpanded[requestedNoteId]) return;
      const existing = reset ? [] : (this.refundsByNote[requestedNoteId] ?? []);
      const existingIds = new Set(existing.map(refund => refund.id));
      const incoming = page.items.filter(refund => !existingIds.has(refund.id));
      this.refundsByNote[requestedNoteId] = [...existing, ...incoming];
      this.refundHistoryHasMore[requestedNoteId] = page.items.length === 100;
    } catch {
      if (requestId === this.refundHistorySequence && requestedBusinessId === this.businessId) {
        this.error = this.language === 'ar'
          ? 'تعذر تحميل سجل الردود النقدية.'
          : 'Could not load cash refund history.';
      }
    } finally {
      if (requestId === this.refundHistorySequence) this.refundHistoryLoadingNoteId = null;
    }
  }

  refundMethodLabel(method: CashRefund['method']): string {
    const labels = this.language === 'ar'
      ? { cash: 'نقدي', bank: 'تحويل بنكي', card: 'بطاقة', other: 'أخرى' }
      : { cash: 'Cash', bank: 'Bank transfer', card: 'Card', other: 'Other' };
    return labels[method];
  }

  customerName(customerId: string): string {
    return this.customers.find(customer => customer.id === customerId)?.name || this.shortId(customerId);
  }

  async loadMoreCreditNotes(): Promise<void> {
    if (!this.businessId || !this.notesHasMore || this.loading || this.loadingMoreNotes) return;
    const requestedBusinessId = this.businessId;
    const requestedCustomerId = this.selectedCustomerId;
    const requestId = this.refreshSequence;
    const offset = this.notes.length;
    this.loadingMoreNotes = true;
    this.error = '';
    try {
      const page = await this.api.creditNotes(requestedBusinessId, {
        limit: 100, offset, customer_id: requestedCustomerId || undefined,
      });
      if (requestId !== this.refreshSequence || requestedBusinessId !== this.businessId ||
          requestedCustomerId !== this.selectedCustomerId) return;
      const existingIds = new Set(this.notes.map(note => note.id));
      this.notes = [...this.notes, ...page.items.filter(note => !existingIds.has(note.id))];
      this.notesHasMore = page.items.length === 100;
    } catch {
      if (requestId === this.refreshSequence && requestedBusinessId === this.businessId &&
          requestedCustomerId === this.selectedCustomerId) {
        this.error = this.language === 'ar' ? 'تعذر تحميل المزيد من الإشعارات الدائنة.' : 'Could not load more credit notes.';
      }
    } finally {
      if (requestId === this.refreshSequence) this.loadingMoreNotes = false;
    }
  }

  async onInvoiceSelected(invoiceId: string): Promise<void> {
    const requestId = ++this.invoiceDetailSequence;
    const requestedBusinessId = this.businessId;
    this.invoiceDetail = null;
    this.returnLines = [];
    this.error = '';
    if (!invoiceId || !requestedBusinessId) {
      this.detailLoading = false;
      return;
    }
    this.detailLoading = true;
    try {
      const detail = await this.api.invoiceDetail(requestedBusinessId, invoiceId);
      if (requestId !== this.invoiceDetailSequence || requestedBusinessId !== this.businessId || invoiceId !== this.selectedInvoiceId) return;
      if (detail.status !== 'issued') throw new Error('Invoice is no longer issued');
      this.invoiceDetail = detail;
      this.returnLines = detail.lines.map(line => ({
        invoiceLineId: line.id,
        description: line.description,
        invoicedQuantity: line.quantity,
        quantity: '0',
      }));
    } catch {
      if (requestId === this.invoiceDetailSequence && requestedBusinessId === this.businessId && invoiceId === this.selectedInvoiceId) {
        this.error = this.language === 'ar' ? 'تعذر تحميل بنود الفاتورة. اختر فاتورة صادرة أخرى.' : 'Could not load invoice lines. Choose another issued invoice.';
      }
    } finally {
      if (requestId === this.invoiceDetailSequence) this.detailLoading = false;
    }
  }

  async createReturn(): Promise<void> {
    if (!this.businessId || !this.invoiceDetail || this.creatingReturn || this.detailLoading) return;
    const invalidQuantity = this.returnLines.some(line => {
      const quantity = Number(line.quantity);
      return !Number.isFinite(quantity) || quantity < 0 || quantity > Number(line.invoicedQuantity);
    });
    const lines = this.returnLines.filter(line => Number(line.quantity) > 0);
    if (invalidQuantity || !lines.length) {
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
