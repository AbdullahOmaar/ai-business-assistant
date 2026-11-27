// 3A-921 F1b (Clean Code program): the invoice detail drawer,
// extracted verbatim from the app shell as a presentational component.
// Zero behavior change: the shell keeps the detail state, the load,
// and every action; the drawer renders the same markup, owns the
// focus trap and the close-button focus the shell used to drive
// through template refs, and emits the same actions back. The status
// badge rules are shared with the invoice cards, so they are copied
// here verbatim (the shell keeps its copy for the cards).
import { Component, ElementRef, EventEmitter, inject, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Invoice, InvoiceDetail } from './api.service';
import { LocalizationService } from './localization.service';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';

@Component({
  selector: 'aba-invoice-detail-drawer',
  standalone: true,
  imports: [CommonModule, AbaStateMessageComponent],
  template: `
                <div class="invoice-detail-backdrop" role="presentation" (click)="close.emit()"></div>
                <aside #invoiceDetailDrawer class="invoice-detail-drawer" role="dialog" aria-modal="true" tabindex="-1"
                  aria-labelledby="invoice-detail-heading" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'"
                  (keydown)="handleInvoiceDetailKeydown($event)">
                  <header class="invoice-detail-header">
                    <div><span class="invoice-detail-eyebrow">{{ t('app.invoiceList.detailTitle') }}</span>
                      <h2 id="invoice-detail-heading"><bdi dir="ltr">{{ detail?.invoice_number || invoice.invoice_number }}</bdi></h2></div>
                    <button #invoiceDetailClose class="icon-button invoice-detail-close" type="button"
                      [attr.aria-label]="t('app.invoiceList.close')" [attr.title]="t('app.invoiceList.close')"
                      (click)="close.emit()">×</button>
                  </header>
                  @if (loading) {
                    <aba-state-message kind="loading" [description]="t('app.invoiceList.loadingDetails')" />
                  } @else if (error) {
                    <aba-state-message kind="error" [description]="error" />
                  } @else if (detail; as detail) {
                    <div class="invoice-detail-meta">
                      <div><span>{{ t('app.invoiceList.customer') }}</span><strong>{{ customerName }}</strong></div>
                      <div><span>{{ t('app.invoiceList.date') }}</span><strong><bdi dir="ltr">{{ detail.issue_date ? formatRecordDate(detail.issue_date, 'date') : (detail.created_at ? formatRecordDate(detail.created_at, 'date') : '—') }}</bdi></strong></div>
                      <div><span>{{ t('app.invoiceList.status') }}</span><strong class="invoice-status-badge"
                        [class.status-draft]="statusTone === 'draft'"
                        [class.status-issued]="statusTone === 'issued'"
                        [class.status-void]="statusTone === 'void'"
                        [class.status-paid]="statusTone === 'paid'"
                        [class.status-partial]="statusTone === 'partial'"
                        [class.status-unpaid]="statusTone === 'unpaid'">{{ statusLabel }}</strong></div>
                    </div>
                    <div class="invoice-detail-lines-wrap">
                      <table class="invoice-detail-lines" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
                        <thead><tr><th scope="col">{{ t('app.invoiceList.lineItem') }}</th><th scope="col">{{ t('app.invoiceList.quantity') }}</th><th scope="col">{{ t('app.invoiceList.unitPrice') }}</th><th scope="col">{{ t('app.invoiceList.lineTotal') }}</th></tr></thead>
                        <tbody>@for (line of detail.lines; track line.id) {
                          <tr><td>{{ line.description }}</td><td [attr.data-label]="t('app.invoiceList.quantity')"><bdi dir="ltr">{{ formatNumber(line.quantity) }}@if (line.sold_unit) { {{ line.sold_unit }} }</bdi></td>
                            <td [attr.data-label]="t('app.invoiceList.unitPrice')"><bdi dir="ltr">{{ formatNumber(line.unit_price) }} {{ detail.currency_code }}</bdi></td>
                            <td [attr.data-label]="t('app.invoiceList.lineTotal')"><bdi dir="ltr">{{ formatNumber(line.line_total) }} {{ detail.currency_code }}</bdi></td></tr>
                        }</tbody>
                      </table>
                    </div>
                    <dl class="invoice-detail-totals">
                      <div><dt>{{ t('app.invoiceList.subtotal') }}</dt><dd><bdi dir="ltr">{{ formatNumber(detail.subtotal ?? '0') }} {{ detail.currency_code }}</bdi></dd></div>
                      <div><dt>{{ t('app.invoiceList.discount') }}</dt><dd><bdi dir="ltr">{{ formatNumber(detail.discount_total ?? '0') }} {{ detail.currency_code }}</bdi></dd></div>
                      <div><dt>{{ t('app.invoiceList.tax') }}</dt><dd><bdi dir="ltr">{{ formatNumber(detail.tax_total ?? '0') }} {{ detail.currency_code }}</bdi></dd></div>
                      <div class="invoice-detail-grand-total"><dt>{{ t('app.invoiceList.total') }}</dt><dd><bdi dir="ltr">{{ formatNumber(detail.total) }} {{ detail.currency_code }}</bdi></dd></div>
                    </dl>
                    @if (detail.driver_employee_id) {
                      <section class="invoice-detail-notes">
                        <h3>{{ t('ui.invoices.transport.title') }}</h3>
                        <p>{{ t('ui.invoices.transport.driver') }}: {{ detail.driver_name || '—' }}</p>
                        <p>{{ t('ui.invoices.transport.trips', { unit: transportUnitName }) }}: <bdi dir="ltr">{{ detail.transport_trips ?? '—' }}</bdi></p>
                        @if (detail.transport_from) { <p>{{ t('ui.invoices.transport.from') }}: {{ detail.transport_from }}</p> }
                        @if (detail.transport_to) { <p>{{ t('ui.invoices.transport.to') }}: {{ detail.transport_to }}</p> }
                        @if (detail.transport_entitlement_status) {
                          <p>{{ t('ui.invoices.transport.entitlementStatus') }}: {{ transportStatusLabel(detail.transport_entitlement_status) }}@if (detail.transport_entitlement_amount) { — <bdi dir="ltr">{{ formatNumber(detail.transport_entitlement_amount) }} {{ detail.currency_code }}</bdi> }</p>
                        }
                      </section>
                    }
                    @if (detail.notes) { <section class="invoice-detail-notes"><h3>{{ t('app.invoiceList.notes') }}</h3><p>{{ detail.notes }}</p></section> }
                    <footer class="invoice-detail-actions">
                      @if (detail.status === 'draft') {
                        <button class="primary" type="button" (click)="edit.emit()">{{ t('ui.m_s21yyp') }}</button>
                        @if (role === 'owner') {
                          <button class="secondary" type="button" (click)="issue.emit()">{{ t('ui.m_ninief') }}</button>
                          <button class="secondary danger" type="button" (click)="voidRequest.emit($event)">{{ t('ui.m_lnwycg') }}</button>
                        }
                      } @else if (detail.status === 'issued') {
                        @if (role === 'owner' && hasOutstanding) {
                          <button class="primary" type="button" (click)="pay.emit()">{{ t('ui.m_1r6bzbj') }}</button>
                        }
                        <button class="secondary" type="button" (click)="print.emit()">{{ t('ui.m_qskvru') }}</button>
                        @if (role === 'owner') { <button class="secondary danger" type="button" (click)="voidRequest.emit($event)">{{ t('ui.m_lnwycg') }}</button> }
                      }
                      <button class="secondary" type="button" (click)="duplicate.emit()">{{ t('app.invoiceList.duplicateInvoice') }}</button>
                      <button class="secondary" type="button" (click)="close.emit()">{{ t('app.invoiceList.close') }}</button>
                    </footer>
                  }
                </aside>
  `,
  styles: [`
.invoice-status-badge{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:4px 9px;border:1px solid var(--aba-color-border,#d0d5dd);border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#475569);font-size:11px;font-weight:800;white-space:nowrap}
.invoice-status-badge.status-draft{border-color:#d0d5dd;background:#f2f4f7;color:#344054}
.invoice-status-badge.status-issued{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}
.invoice-status-badge.status-void{border-color:#fecaca;background:#fef2f2;color:#b42318}
.invoice-status-badge.status-paid{border-color:var(--aba-color-success-border,#bbf7d0);background:var(--aba-color-success-soft,#ecfdf5);color:var(--aba-color-success-text,#065f46)}
.invoice-status-badge.status-partial{border-color:var(--aba-color-warning-border,#fde68a);background:var(--aba-color-warning-soft,#fffbeb);color:var(--aba-color-warning-text,#92400e)}
.invoice-status-badge.status-unpaid{border-color:var(--aba-color-danger-border,#fecaca);background:var(--aba-color-danger-soft,#fef2f2);color:var(--aba-color-danger-text,#991b1b)}
.invoice-detail-backdrop{position:fixed;inset:0;z-index:89;background:rgb(15 23 42 / 38%);backdrop-filter:blur(1px);animation:invoice-backdrop-in 150ms ease-out}
.invoice-detail-drawer{position:fixed;inset-block:0;inset-inline-end:0;z-index:90;display:flex;flex-direction:column;gap:16px;width:min(560px,100vw);height:100dvh;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:22px clamp(16px,3vw,28px) max(20px,env(safe-area-inset-bottom));border-inline-start:1px solid #dbe5e7;background:var(--aba-color-surface,#fff);color:#172033;box-shadow:0 18px 60px rgb(15 23 42 / 20%);animation:invoice-drawer-in-ltr 180ms ease-out}
.invoice-detail-drawer[dir="rtl"]{animation-name:invoice-drawer-in-rtl}
.invoice-detail-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block-end:12px;border-bottom:1px solid var(--aba-color-border-subtle,#e2e8f0)}
.invoice-detail-eyebrow{color:var(--aba-color-text-secondary,#64748b);font-size:12px;font-weight:700}
.invoice-detail-header h2{margin:4px 0 0;color:var(--aba-color-text-primary,#172033);font-family:Cairo,Tajawal,sans-serif;font-size:22px;font-weight:800}
.invoice-detail-close{flex:0 0 44px;width:44px;height:44px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-primary,#172033);font-size:22px}
.invoice-detail-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.invoice-detail-meta>div{display:grid;gap:4px;min-width:0;padding:10px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc)}
.invoice-detail-meta span{color:var(--aba-color-text-secondary,#64748b);font-size:11px;font-weight:600}
.invoice-detail-meta strong{min-width:0;overflow-wrap:normal;font-size:13px}
.invoice-detail-meta strong bdi{white-space:nowrap}
.invoice-detail-meta>div:last-child{grid-column:1/-1}
.invoice-detail-lines-wrap{max-width:100%;overflow-x:auto;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px}
.invoice-detail-lines{width:100%;min-width:420px;border-collapse:collapse;direction:inherit;text-align:start}
.invoice-detail-lines th,.invoice-detail-lines td{padding:10px 9px;border-bottom:1px solid #eef2f7;text-align:start;font-size:12px;vertical-align:top}
.invoice-detail-lines th{background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#64748b);font-weight:800}
.invoice-detail-lines td:first-child{min-width:140px;overflow-wrap:break-word}
.invoice-detail-totals{display:grid;gap:0;margin:0;padding:10px 13px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}
.invoice-detail-totals>div{display:flex;justify-content:space-between;gap:14px;padding:8px 0;color:var(--aba-color-text-secondary,#64748b);font-size:13px}
.invoice-detail-totals dt,.invoice-detail-totals dd{margin:0}
.invoice-detail-totals dd{font-variant-numeric:tabular-nums;text-align:end;white-space:nowrap}
.invoice-detail-grand-total{margin-block-start:5px;border-top:1px solid #cbd5e1;color:var(--aba-color-text-primary,#172033)!important;font-size:15px!important;font-weight:800}
.invoice-detail-notes{padding:12px;border-inline-start:3px solid #0d9488;border-radius:8px;background:#f0fdfa}
.invoice-detail-notes h3{margin:0 0 5px;font-size:12px;font-weight:800}
.invoice-detail-notes p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6}
.invoice-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-block-start:auto;padding-block-start:12px;border-top:1px solid var(--aba-color-border-subtle,#e2e8f0)}
.invoice-detail-actions button{min-height:44px;flex:1 1 auto}
@keyframes invoice-backdrop-in{from{opacity:0}to{opacity:1}}
@keyframes invoice-drawer-in-ltr{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes invoice-drawer-in-rtl{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@media(max-width:760px){.invoice-detail-drawer{width:100vw;padding:16px 14px max(18px,env(safe-area-inset-bottom))}.invoice-detail-meta{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.invoice-detail-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.invoice-detail-actions button{width:100%;min-width:0}}
@media(max-width:380px){.invoice-detail-meta{grid-template-columns:minmax(0,1fr)}.invoice-detail-totals>div{display:grid;grid-template-columns:minmax(0,1fr);gap:2px}}
@media(max-width:480px){.invoice-detail-lines-wrap{overflow-x:visible}.invoice-detail-lines{min-width:0}.invoice-detail-lines thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.invoice-detail-lines tbody tr{display:grid;gap:2px;padding:10px 0;border-bottom:1px solid #eef2f7}.invoice-detail-lines tbody tr:last-child{border-bottom:0}.invoice-detail-lines td{display:block;padding:2px 0;border:0;text-align:start}.invoice-detail-lines td:first-child{min-width:0;font-weight:700;font-size:13px}.invoice-detail-lines td[data-label]::before{content:attr(data-label) ": ";color:var(--aba-color-text-secondary,#64748b);font-size:11px;font-weight:700}.invoice-detail-lines td bdi{white-space:nowrap}}
@media(prefers-reduced-motion:reduce){.invoice-detail-backdrop,.invoice-detail-drawer{animation:none}}
  `],
})
export class InvoiceDetailDrawerComponent {
  @Input({ required: true }) invoice!: Invoice;
  @Input() detail: InvoiceDetail | null = null;
  @Input() loading = false;
  @Input() error = '';
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() role: string | null | undefined = undefined;
  @Input() customerName = '';
  @Input() statusTone = '';
  @Input() statusLabel = '';
  @Input() hasOutstanding = false;
  @Input() transportUnitName = '';

  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() issue = new EventEmitter<void>();
  @Output() pay = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() duplicate = new EventEmitter<void>();
  @Output() voidRequest = new EventEmitter<MouseEvent>();

  @ViewChild('invoiceDetailClose') private invoiceDetailCloseButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('invoiceDetailDrawer') private invoiceDetailDrawer?: ElementRef<HTMLElement>;

  private readonly localization = inject(LocalizationService);

  /** The shell calls this on open, exactly where it used to focus the close button itself. */
  focusClose(): void {
    this.invoiceDetailCloseButton?.nativeElement.focus();
  }

  handleInvoiceDetailKeydown(event: KeyboardEvent): void {
    if (!this.invoice || event.key !== 'Tab') return;
    const drawer = this.invoiceDetailDrawer?.nativeElement;
    if (!drawer) return;
    const focusable: HTMLElement[] = Array.from(drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element: HTMLElement) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    const first: HTMLElement = focusable[0];
    const last: HTMLElement = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!drawer.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && (active === first || active === drawer)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  formatRecordDate(value: string | null | undefined, style: 'short' | 'medium' | 'date' = 'medium'): string {
    if (!value) return '—';
    const dateOnly = style === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly ? `${value}T12:00:00` : value);
    if (!Number.isFinite(parsed.getTime())) return '—';
    const options: Intl.DateTimeFormatOptions = style === 'date'
      ? { dateStyle: 'medium' }
      : style === 'short'
        ? { dateStyle: 'short', timeStyle: 'short' }
        : { dateStyle: 'medium', timeStyle: 'short' };
    return this.localization.formatDate(parsed, options);
  }

  formatNumber(value: string | number | null | undefined, fractionDigits = 2): string {
    return this.localization.formatNumber(value, fractionDigits, fractionDigits);
  }

  /** 3A-920 step 4: the proposed-entitlement lifecycle label for the drawer. */
  transportStatusLabel(status: string | null | undefined): string {
    switch (status) {
      case 'proposed': return this.t('ui.invoices.transport.statusProposed');
      case 'confirmed': return this.t('ui.invoices.transport.statusConfirmed');
      case 'dismissed': return this.t('ui.invoices.transport.statusDismissed');
      case 'cancelled': return this.t('ui.invoices.transport.statusCancelled');
      default: return status ?? '';
    }
  }

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
