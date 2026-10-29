import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ApiService, CreditNote, SalesReturn } from './api.service';

@Component({
  selector: 'aba-credit-notes',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="panel" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <div class="heading">
        <div>
          <h2>{{ language === 'ar' ? 'مرتجعات العملاء والإشعارات الدائنة' : 'Customer returns & credit notes' }}</h2>
          <p>{{ language === 'ar' ? 'إصدار الإشعار الدائن لا يعني رد أموال نقدية ولا يعدّل إجمالي الفاتورة الأصلية.' : 'Issuing a credit note does not refund cash or change the original invoice total.' }}</p>
        </div>
        <button type="button" (click)="refresh()" [disabled]="loading">
          {{ loading ? (language === 'ar' ? 'جارٍ التحميل…' : 'Loading…') : (language === 'ar' ? 'تحديث' : 'Refresh') }}
        </button>
      </div>

      @if (message) { <p class="notice" role="status" aria-live="polite">{{ message }}</p> }
      @if (error) { <p class="error" role="alert">{{ error }}</p> }

      <h3>{{ language === 'ar' ? 'المرتجعات المعتمدة' : 'Approved returns' }}</h3>
      @if (!loading && !returns.length) {
        <p class="empty">{{ language === 'ar' ? 'لا توجد مرتجعات معتمدة متاحة.' : 'No approved returns are available.' }}</p>
      }
      <div class="records">
        @for (ret of returns; track ret.id) {
          <article class="record">
            <div class="record-main">
              <strong>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(ret.id) }}</strong>
              <small>{{ language === 'ar' ? 'الفاتورة' : 'Invoice' }} · {{ shortId(ret.invoice_id) }}</small>
              @if (ret.reason) { <small>{{ ret.reason }}</small> }
            </div>
            <strong class="amount">{{ ret.total }} </strong>
            @if (creditNoteForReturn(ret.id); as note) {
              <span class="issued">{{ language === 'ar' ? 'صدر إشعار' : 'Issued' }} · {{ note.credit_note_number }}</span>
            } @else if (role === 'owner') {
              <button type="button" class="primary" (click)="issue(ret)" [disabled]="loading || issuingId !== null">
                {{ issuingId === ret.id ? (language === 'ar' ? 'جارٍ الإصدار…' : 'Issuing…') : (language === 'ar' ? 'إصدار إشعار دائن' : 'Issue credit note') }}
              </button>
            } @else {
              <span class="muted">{{ language === 'ar' ? 'إصدار الإشعار للمالك فقط' : 'Owner-only issuance' }}</span>
            }
          </article>
        }
      </div>

      <h3>{{ language === 'ar' ? 'الإشعارات الدائنة الصادرة' : 'Issued credit notes' }}</h3>
      @if (!loading && !notes.length) {
        <p class="empty">{{ language === 'ar' ? 'لا توجد إشعارات دائنة بعد.' : 'No credit notes have been issued yet.' }}</p>
      }
      <div class="records">
        @for (note of notes; track note.id) {
          <article class="record">
            <div class="record-main">
              <strong>{{ note.credit_note_number }}</strong>
              <small>{{ language === 'ar' ? 'مرتجع' : 'Return' }} · {{ shortId(note.sales_return_id) }}</small>
              <small>{{ language === 'ar' ? 'العميل' : 'Customer' }} · {{ shortId(note.customer_id) }}</small>
            </div>
            <strong class="amount">{{ note.total }} {{ note.currency_code }}</strong>
            <span class="issued">{{ language === 'ar' ? 'صادر' : 'Issued' }}</span>
          </article>
        }
      </div>
      <p class="footnote">{{ language === 'ar' ? 'حاليًا، إصدار الإشعار موقوف للفواتير ذات الضريبة حتى يتم دعم توزيع الضريبة على بنود المرتجع. لا يتم تسجيل رد نقدي أو خصم رصيد العميل تلقائيًا.' : 'Issuance is currently blocked for tax-bearing invoices until tax can be allocated to returned lines. No cash refund or customer-balance credit is recorded automatically.' }}</p>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .panel { background: var(--panel, #fff); border: 1px solid var(--border, #dfe5ec); border-radius: 16px; padding: 1rem; color: var(--text, #172033); }
    .heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    h2 { margin: 0 0 .4rem; font-size: 1.2rem; }
    h3 { margin: 1.2rem 0 .6rem; font-size: 1rem; }
    p, .muted, .footnote { color: var(--muted, #5b6474); line-height: 1.5; }
    .footnote { font-size: .85rem; margin-top: 1.2rem; }
    .records { display: grid; gap: .6rem; }
    .record { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; border: 1px solid var(--border, #dfe5ec); border-radius: 12px; padding: .8rem; }
    .record-main { display: grid; gap: .2rem; flex: 1 1 190px; min-width: 0; }
    small { color: var(--muted, #5b6474); overflow-wrap: anywhere; }
    .amount { white-space: nowrap; }
    .issued { color: var(--success, #176b45); font-size: .88rem; font-weight: 600; overflow-wrap: anywhere; }
    button { border: 1px solid var(--border, #cbd5e1); border-radius: 9px; padding: .6rem .8rem; background: var(--surface, #f8fafc); color: inherit; cursor: pointer; }
    button.primary { background: var(--primary, #174ea6); color: white; border-color: transparent; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .notice, .error, .empty { padding: .7rem; border-radius: 8px; background: var(--surface, #f8fafc); }
    .error { color: var(--danger, #a32222); }
    @media (max-width: 480px) { .panel { padding: .75rem; } .record { align-items: flex-start; } .amount { flex-basis: 100%; } }
  `],
})
export class CreditNotesComponent implements OnChanges {
  @Input({ required: true }) businessId = '';
  @Input() role = 'staff';
  @Input() language: 'ar' | 'en' = 'ar';

  returns: SalesReturn[] = [];
  notes: CreditNote[] = [];
  loading = false;
  issuingId: string | null = null;
  message = '';
  error = '';

  constructor(private readonly api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) void this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.businessId || this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      const [returnsPage, notesPage] = await Promise.all([
        this.api.salesReturns(this.businessId, { limit: 100, offset: 0, status: 'approved' }),
        this.api.creditNotes(this.businessId, { limit: 100, offset: 0 }),
      ]);
      this.returns = returnsPage.items;
      this.notes = notesPage.items;
      this.message = '';
    } catch {
      this.error = this.language === 'ar'
        ? 'تعذر تحميل المرتجعات والإشعارات. تحقق من الصلاحيات والاتصال ثم أعد المحاولة.'
        : 'Could not load returns and credit notes. Check access and connectivity, then retry.';
    } finally {
      this.loading = false;
    }
  }

  async issue(ret: SalesReturn): Promise<void> {
    if (this.role !== 'owner' || this.issuingId !== null || this.creditNoteForReturn(ret.id)) return;
    this.issuingId = ret.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.issueCreditNoteForReturn(this.businessId, ret.id);
      this.message = this.language === 'ar'
        ? 'تم إصدار الإشعار الدائن. لم يتم تسجيل رد نقدي أو تعديل الفاتورة الأصلية.'
        : 'Credit note issued. No cash refund was recorded and the original invoice was not changed.';
      await this.refresh();
    } catch {
      this.error = this.language === 'ar'
        ? 'تعذر إصدار الإشعار. تأكد أن المرتجع معتمد وأن الفاتورة لا تحتوي على ضريبة غير موزعة.'
        : 'Credit note could not be issued. Confirm the return is approved and the invoice has no unallocated tax.';
    } finally {
      this.issuingId = null;
    }
  }

  creditNoteForReturn(returnId: string): CreditNote | undefined {
    return this.notes.find(note => note.sales_return_id === returnId);
  }

  shortId(value: string): string {
    return value.length > 12 ? value.slice(0, 8) + '…' : value;
  }
}
