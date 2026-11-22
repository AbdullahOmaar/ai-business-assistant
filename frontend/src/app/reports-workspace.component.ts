import { Component, inject, input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type ProfitLossReport, type ReceivablesAgingReport } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard } from './workspace-load-guard';
import { CSV_FORMULA_TRIGGER_ASCII, escapeCsvFormulaPrefix } from './csv-export';
import { reportLimitationKey } from './report-labels';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaDateRangeComponent } from './shared/ui/aba-date-range.component';

/**
 * Reports workspace (extracted from the shell in the 3A-351 bundle batch).
 *
 * The P&L and receivables-ageing sections lived inline in `app.component.ts`
 * (template + state + loaders + label maps). They are a self-contained
 * workspace: they only need the business id and the language, load their own
 * data, and own their own load guards — exactly like the other deferred
 * workspaces. The shell renders this component behind `@defer (when tab ===
 * 'reports')`, so its code leaves the initial bundle and loads on first
 * visit to the tab. Behaviour is unchanged: the P&L loads when the tab is
 * entered (the shell used to call `loadProfitLoss()` from `setTab`), the
 * ageing report loads only from its form, and a business change resets the
 * state and reloads the P&L, mirroring the shell's resets.
 */
@Component({
  selector: 'aba-reports-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaDateRangeComponent],
  // Default change detection, like the shell this was extracted from (and
  // like employee-payroll): the loaders assign plain fields after await, so
  // OnPush would leave the view stale. The newer signal workspaces use
  // OnPush; this faithful port does not.
  template: `
<section abaCard class="panel">
  <aba-section-header [title]=" t('ui.m_1k2jewg') " [description]=" t('ui.m_7hhfvq') "><span class="count">{{ t('ui.m_7xexd4') }}</span></aba-section-header>
  <form #profitLossForm="ngForm" class="inline-form" (ngSubmit)="profitLossForm.valid && loadProfitLoss()">
    <select name="profitLossPeriod" [attr.aria-label]="t('ui.m_cwfche')" [(ngModel)]="profitLossPeriod"><option value="30d">{{ t('ui.m_1ql1fm2') }}</option><option value="month">{{ t('ui.m_1sm3j94') }}</option><option value="all">{{ t('ui.m_bp8vk5') }}</option><option value="custom">{{ t('ui.m_57v6ro') }}</option></select>
    @if (profitLossPeriod === 'custom') {
      <aba-date-range [showClear]="true" [hasValue]="profitLossStart !== '' || profitLossEnd !== ''" [clearLabel]="t('ui.m_1np7zc4')" (clear)="profitLossStart = ''; profitLossEnd = ''">
      <label>{{ t('ui.m_15qcbwy') }}<input #profitLossStartControl="ngModel" type="date" name="profitLossStart" required [attr.aria-invalid]="profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted) ? 'true' : null" [attr.aria-describedby]="profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted) ? 'profit-loss-start-error' : null" [(ngModel)]="profitLossStart">@if (profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted)) { <small id="profit-loss-start-error" class="field-error" role="alert">{{ t('ui.m_c9vs17') }}</small> }</label>
      <label>{{ t('ui.m_8ibmd8') }}<input #profitLossEndControl="ngModel" type="date" name="profitLossEnd" required [attr.aria-invalid]="profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted) ? 'true' : null" [attr.aria-describedby]="profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted) ? 'profit-loss-end-error' : null" [(ngModel)]="profitLossEnd">@if (profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted)) { <small id="profit-loss-end-error" class="field-error" role="alert">{{ t('ui.m_146gz4o') }}</small> }</label>
      </aba-date-range>
    }
    <button class="primary" type="submit" [disabled]="reportLoading">{{ reportLoading ? t('ui.m_1k98007') : t('ui.m_10jsbot') }}</button>
  </form>
  @if (reportError) { <aba-state-message kind="error" [description]="reportError" /> }
  @if (profitLoss) {
    <p class="muted">{{ profitLoss.period.start_date || t('ui.m_ixi82b') }} — {{ profitLoss.period.end_date || t('ui.m_1pfkmow') }} · {{ profitLoss.period.timezone || 'UTC' }}</p>
    <p class="muted"><strong>{{ t('ui.m_8hpy6m') }}</strong> {{ revenueBasisLabel(profitLoss.revenue_basis) }}</p>
    <aba-record-table [ariaLabel]="t('ui.m_1irq6mk')" [columns]="profitLossTableColumns" [rows]="profitLossTableRows" [emptyTitle]="t('ui.m_zlnr36')" [emptyDescription]="t('ui.m_q1rdjf')" />
    <div class="notice"><strong>{{ t('ui.m_1tz1k9k') }}</strong><span>{{ t('ui.m_ujpaej') }}</span></div>
  }
  <div class="divider"></div>
  <aba-section-header [level]="3" [title]="t('ui.m_2oaefr')" [description]="t('ui.m_1dmo8qz')" />
  <form #agingForm="ngForm" class="inline-form aging-form" (ngSubmit)="agingForm.valid && loadReceivablesAging()"><label>{{ t('ui.m_tyw1lj') }}<input #agingAsOfControl="ngModel" type="date" name="agingAsOf" required [attr.aria-invalid]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'true' : null" [attr.aria-describedby]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'aging-as-of-error' : null" [(ngModel)]="agingAsOf">@if (agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted)) { <small id="aging-as-of-error" class="field-error" role="alert">{{ t('ui.m_4apqf4') }}</small> }</label><button class="primary" type="submit" [disabled]="agingLoading">{{ agingLoading ? t('ui.m_1rza5t5') : t('ui.m_1gsyti0') }}</button></form>
  @if (agingError) { <aba-state-message kind="error" [description]="agingError" /> }
  @if (agingReport) {
    <div class="section-head"><p class="muted">{{ t('ui.m_vnv6l5') }} {{ agingReport.as_of_date }} · {{ agingReport.invoice_count }} {{ t('ui.m_pe8fvb') }}</p><button class="secondary" type="button" (click)="exportReceivablesAgingCsv()" [disabled]="!agingReport.invoices.length">{{ t('ui.m_nbsw3y') }}</button></div>
    @for (summary of agingReport.by_currency; track summary.currency_code) {
      <article class="metric"><span>{{ t('ui.m_1dusybc') }} · {{ summary.currency_code }}</span><strong>{{ summary.total_outstanding }} {{ summary.currency_code }}</strong><div class="aging-buckets">@for (bucket of summary.buckets; track bucket.bucket) { <div><small>{{ agingBucketLabel(bucket.bucket) }}</small><strong>{{ bucket.outstanding_amount }} {{ summary.currency_code }}</strong></div> }</div></article>
    }
    @if (agingReport.data_quality_warnings.length) {
      <div class="notice warning-notice"><strong>{{ t('ui.m_fhk738') }}</strong>
        @for (warning of agingReport.data_quality_warnings; track warning.invoice_id + warning.type) {
          <p><strong>{{ warning.invoice_number }}</strong> — {{ agingWarningLabel(warning.type) }}</p>
          @if (warning.excess_allocated) { <p>{{ t('ui.m_29qoiu') }} <span class="amount-pair">{{ warning.excess_allocated }} {{ warning.invoice_currency || '' }}</span></p> }
          @if (warning.mismatched_allocations_amount) { <p>{{ t('ui.m_1hrsgrk') }} {{ warning.mismatched_allocations_amount }}</p> }
        }
      </div>
    }
    <aba-record-table [ariaLabel]="t('ui.m_15doge2')" [columns]="agingTableColumns" [rows]="agingTableRows" [emptyTitle]="t('ui.m_1fbb4i1')" [emptyDescription]="t('ui.m_18nc6st')" />
    @if (agingReport.limitations.length) { <div class="notice"><strong>{{ t('ui.m_akne82') }}</strong>@for (limitation of agingReport.limitations; track limitation) { <p>{{ reportLimitationLabel(limitation) }}</p> }</div> }
  }
</section>
  `,
  styles: [`
    .aging-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin-top:12px}
    .aging-buckets>div{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid #e5e7eb;border-radius:9px;background:var(--aba-color-surface-subtle,#f8fafc)}
    .warning-notice .amount-pair{white-space:nowrap;overflow-wrap:normal}
    @media(min-width:761px){.aging-form label{flex:0 1 230px}}
  `],
})
export class ReportsWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly language = input<'ar' | 'en'>('ar');

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);

  profitLoss: ProfitLossReport | null = null;
  profitLossPeriod: '30d' | 'month' | 'all' | 'custom' = '30d';
  profitLossStart = '';
  profitLossEnd = '';
  reportLoading = false;
  reportError = '';
  agingReport: ReceivablesAgingReport | null = null;
  agingLoading = false;
  agingError = '';
  agingAsOf = new Date().toISOString().slice(0, 10);

  private readonly profitLossLoadGuard = new WorkspaceLoadGuard();
  private readonly receivablesAgingLoadGuard = new WorkspaceLoadGuard();

  private lastErrorKind: 'session-expired' | 'access-denied' | null = null;
  private lastErrorMessage: string | null = null;

  ngOnInit(): void {
    void this.loadProfitLoss();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.resetReportsState();
    void this.loadProfitLoss();
  }

  private resetReportsState(): void {
    this.profitLoss = null;
    this.profitLossPeriod = '30d';
    this.profitLossStart = '';
    this.profitLossEnd = '';
    this.reportLoading = false;
    this.reportError = '';
    this.agingReport = null;
    this.agingLoading = false;
    this.agingError = '';
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }

  get agingTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('ui.m_rblc1v'),primary:true},
    {key:'outstanding',label:this.t('ui.m_11hlijv'),kind:'numeric'},
    {key:'bucket',label:this.t('ui.m_bgcabs'),kind:'status'},
    {key:'dueDate',label:this.t('ui.m_1i1a5f0')},
    {key:'customer',label:this.t('ui.m_1c1fxy9'),kind:'status'},
  ]; }
  get agingTableRows(): readonly AbaRecordTableRow[] { return (this.agingReport?.invoices||[]).map(invoice=>({id:invoice.invoice_id,cells:{
    invoice:invoice.invoice_number,outstanding:`${invoice.outstanding_amount} ${invoice.currency_code}`,
    bucket:this.agingBucketLabel(invoice.aging_bucket),dueDate:invoice.due_date?this.formatRecordDate(invoice.due_date,'date'):this.t('ui.m_frwrnt'),
    customer:invoice.customer_link_missing?this.t('ui.m_15owwjm'):this.t('ui.m_e1gxkn'),
  }})); }
  get profitLossTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'currency',label:this.t('ui.m_1jd5ck6'),primary:true},
    {key:'revenue',label:this.t('ui.m_4635nj'),kind:'numeric'},
    {key:'returns',label:this.t('ui.m_x5f4g8'),kind:'numeric'},
    {key:'expenses',label:this.t('ui.m_l71hva'),kind:'numeric'},
    {key:'result',label:this.t('ui.m_1jzh8n6'),kind:'numeric'},
  ]; }
  get profitLossTableRows(): readonly AbaRecordTableRow[] { return (this.profitLoss?.currencies||[]).map(row=>({id:row.currency_code,cells:{
    currency:row.currency_code,revenue:`${row.revenue} · ${row.revenue_invoice_count} ${this.t('ui.m_pe8fvb')}`,
    returns:`${row.approved_return_total} · ${row.approved_return_count} ${this.t('ui.m_1wap8ub')}`,
    expenses:`${row.expenses} · ${row.expense_count} ${this.t('ui.m_1ghkia')}`,
    result:row.operating_result_before_cost_of_goods,
  }})); }
  exportReceivablesAgingCsv(): void {
    if (!this.agingReport || !this.agingReport.invoices.length) return;
    const warnings = new Map<string, string[]>();
    for (const warning of this.agingReport.data_quality_warnings) {
      const current = warnings.get(warning.invoice_id) || [];
      current.push(this.agingWarningLabel(warning.type));
      warnings.set(warning.invoice_id, current);
    }
    const rows: string[][] = [[
      'as_of_date', 'invoice_number', 'customer_id', 'currency_code', 'due_date', 'aging_bucket',
      'invoice_total', 'allocated_payments', 'outstanding_amount', 'customer_link_missing', 'accounting_warnings'
    ]];
    for (const invoice of this.agingReport.invoices) {
      rows.push([
        this.agingReport.as_of_date, invoice.invoice_number, invoice.customer_id || '', invoice.currency_code,
        invoice.due_date || '', invoice.aging_bucket, invoice.invoice_total, invoice.allocated_payments,
        invoice.outstanding_amount, invoice.customer_link_missing ? 'true' : 'false',
        (warnings.get(invoice.invoice_id) || []).join('; ')
      ]);
    }
    const csv = '\uFEFF' + rows.map(row => row.map(value => {
      const raw = String(value);
      // Prevent spreadsheet formula execution for user-controlled cells such as invoice numbers.
      // Uses the shared helper with the ASCII-only trigger so this export's output is unchanged.
      const safe = escapeCsvFormulaPrefix(raw, CSV_FORMULA_TRIGGER_ASCII);
      return '"' + safe.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'receivables-aging-' + this.agingReport.as_of_date + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  agingBucketLabel(bucket: string): string {
    const keys: Record<string, string> = {
      not_due: 'app.agingBucket.not_due',
      '1_30_days': 'app.agingBucket.1_30_days',
      '31_60_days': 'app.agingBucket.31_60_days',
      '61_90_days': 'app.agingBucket.61_90_days',
      over_90_days: 'app.agingBucket.over_90_days',
      no_due_date: 'app.agingBucket.no_due_date',
    };
    return keys[bucket] ? this.t(keys[bucket]) : bucket;
  }

  agingWarningLabel(type: string): string {
    const keys: Record<string, string> = {
      payment_currency_mismatch: 'app.agingWarning.payment_currency_mismatch',
      allocations_exceed_invoice_total: 'app.agingWarning.allocations_exceed_invoice_total',
    };
    return keys[type] ? this.t(keys[type]) : type;
  }

  revenueBasisLabel(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (normalized.includes('gross issued invoice totals before sales returns')) return this.t('ui.m_19xyqei');
    if (normalized === 'gross issued invoice total' || normalized === 'gross issued invoice totals') return this.t('ui.m_rms1b9');
    if (normalized === 'issued invoices' || normalized === 'issued invoice total') return this.t('ui.m_9mwoh2');
    return value;
  }

  reportLimitationLabel(value: string): string {
    const key = reportLimitationKey(value);
    return key ? this.t(key) : value;
  }

  async loadReceivablesAging(): Promise<void> {
    if (!this.businessId()) return;
    const loadVersion = this.receivablesAgingLoadGuard.begin();
    const businessId = this.businessId();
    this.agingLoading = true;
    this.agingError = '';
    try {
      const report = await this.api.receivablesAging(businessId, this.agingAsOf);
      if (!this.receivablesAgingLoadGuard.isCurrent(loadVersion, this.businessId(), businessId)) return;
      this.agingReport = report;
    } catch (error) {
      if (this.receivablesAgingLoadGuard.isCurrent(loadVersion, this.businessId(), businessId)) {
        this.agingError = this.message(error);
      }
    } finally {
      if (this.receivablesAgingLoadGuard.isLatest(loadVersion)) this.agingLoading = false;
    }
  }

  async loadProfitLoss(): Promise<void> {
    if (!this.businessId()) return;
    if (this.profitLossPeriod === 'custom' && (!this.profitLossStart || !this.profitLossEnd)) {
      this.profitLossLoadGuard.invalidate();
      this.profitLoss = null;
      this.reportLoading = false;
      this.reportError = this.t('ui.m_unhyh1');
      return;
    }
    const loadVersion = this.profitLossLoadGuard.begin();
    const businessId = this.businessId();
    this.reportLoading = true;
    this.reportError = '';
    try {
      const report = await this.api.profitLoss(
        businessId,
        this.profitLossPeriod,
        this.profitLossPeriod === 'custom' ? this.profitLossStart : undefined,
        this.profitLossPeriod === 'custom' ? this.profitLossEnd : undefined
      );
      if (!this.profitLossLoadGuard.isCurrent(loadVersion, this.businessId(), businessId)) return;
      this.profitLoss = report;
    } catch (error) {
      if (this.profitLossLoadGuard.isCurrent(loadVersion, this.businessId(), businessId)) {
        this.reportError = this.message(error);
      }
    } finally {
      if (this.profitLossLoadGuard.isLatest(loadVersion)) this.reportLoading = false;
    }
  }

  formatRecordDate(value: string | null | undefined, style: 'short' | 'medium' | 'date' = 'medium'): string {
    if (!value) return '—';
    const dateOnly = style === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly ? `${value}T12:00:00` : value);
    if (!Number.isFinite(parsed.getTime())) return '—';
    const locale = this.localization.locale;
    const options: Intl.DateTimeFormatOptions = style === 'date'
      ? { dateStyle: 'medium' }
      : style === 'short'
        ? { dateStyle: 'short', timeStyle: 'short' }
        : { dateStyle: 'medium', timeStyle: 'short' };
    return this.localization.formatDate(parsed, options);
  }

  private message(error: unknown, context: 'auth' | 'api' = 'api'): string {
    const value = error as { code?: string; message?: string };
    const code = typeof value?.code === 'string' ? value.code : '';
    const message = typeof value?.message === 'string' ? value.message : '';
    this.lastErrorKind = null;
    this.lastErrorMessage = null;

    const authKeys: Record<string, string> = {
      'auth/email-already-in-use': 'app.authError.auth_email_already_in_use',
      'auth/invalid-email': 'app.authError.auth_invalid_email',
      'auth/weak-password': 'app.authError.auth_weak_password',
      'auth/operation-not-allowed': 'app.authError.auth_operation_not_allowed',
      'auth/unauthorized-domain': 'app.authError.auth_unauthorized_domain',
      'auth/network-request-failed': 'app.authError.auth_network_request_failed',
      'auth/too-many-requests': 'app.authError.auth_too_many_requests',
    };
    if (code && authKeys[code]) return this.t(authKeys[code]);

    const deniedMessage = message.trim();
    if (deniedMessage === 'Authentication required' || deniedMessage === 'Authenticated subject is missing') {
      this.lastErrorKind = 'session-expired';
      const translated = this.t('ui.m_agj0gj');
      this.lastErrorMessage = translated;
      return translated;
    }
    if (deniedMessage === 'Platform administrator access is not granted.') {
      this.lastErrorKind = 'access-denied';
      const translated = this.t('ui.m_1404mrg');
      this.lastErrorMessage = translated;
      return translated;
    }
    if ([
      'No active membership for this business',
      'Business role is not permitted for this operation',
      'No access to this business workspace.',
    ].includes(deniedMessage) || /^(?:forbidden|permission denied|not authorized|access denied)\b/i.test(deniedMessage)) {
      this.lastErrorKind = 'access-denied';
      const translated = this.t('ui.m_1nbaoyf');
      this.lastErrorMessage = translated;
      return translated;
    }
    if (/AI chat is not configured/i.test(message)) return this.t('ui.m_1kpvtc1');
    if (/timed out/i.test(message)) return this.t('ui.m_1wa8x7o');
    if (message.startsWith('API_CONNECTION_FAILED:')) return this.t('ui.m_1qj0ayu');
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return context === 'auth' ? this.t('ui.m_jjvwnu') : this.t('ui.m_g15vmh');
    }
    if (message) return message;
    return this.t('ui.m_s1b5tm');
  }
}
