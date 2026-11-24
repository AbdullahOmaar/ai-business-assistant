// 3A-376: the data-integrity tab, extracted verbatim from the app shell
// as a data-owning workspace component so it loads only when the tab is
// opened (the same pattern 3A-351 established, continued for suppliers
// and recurring in this batch). The report load keeps its tenant-scoped
// guard and owner gate; the shell no longer fetches it on tab switches.
// The view is read-only, exactly as before: totals, the two mismatch
// tables and offset paging, with the manual-review warning label mapping
// unchanged.
import { Component, inject, input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type DataIntegrityReport } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';

@Component({
  selector: 'aba-integrity-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent],
  template: `
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_3j4vfw') " [description]=" t('ui.m_rq55ji') "><span class="count">{{ formatRecordDate(dataIntegrityReport?.generated_at, 'short') || t('ui.m_xo2kma') }}</span></aba-section-header>
                <button class="primary" type="button" (click)="loadDataIntegrity(0)" [disabled]="integrityLoading">{{ integrityLoading ? t('ui.m_1v22gnm') : t('ui.m_t1s0tt') }}</button>
                @if (integrityError) { <aba-state-message kind="error" [description]="integrityError" /> }
                @if (integrityLoading && !dataIntegrityReport) {
                  <aba-record-table [ariaLabel]="t('ui.m_1muvs8z')" [columns]="integrityInvoiceColumns" [rows]="[]" [loading]="true" [loadingDescription]="t('ui.m_19p9gnl')" [emptyTitle]="t('ui.m_ej8yte')" [emptyDescription]="t('ui.m_ydex7x')" />
                  <aba-record-table [ariaLabel]="t('ui.m_xbtfmu')" [columns]="integrityAllocationColumns" [rows]="[]" [loading]="true" [loadingDescription]="t('ui.m_19p9gnl')" [emptyTitle]="t('ui.m_hrqqij')" [emptyDescription]="t('ui.m_uxsaek')" />
                }
                @if (dataIntegrityReport) {
                  <div class="notice warning-notice"><strong>{{ t('ui.m_8kfz56') }}</strong><span>{{ integrityWarningLabel(dataIntegrityReport.warning) }}</span></div>
                  <div class="metric-grid">
                    <article class="metric"><span>{{ t('ui.m_r33nse') }}</span><strong>{{ dataIntegrityReport.unlinked_issued_invoices.total }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_56uiuq') }}</span><strong>{{ dataIntegrityReport.currency_mismatched_allocations.total }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_15jyanv') }}</span><strong>{{ dataIntegrityReport.customer_mismatched_allocations.total }}</strong></article>
                  </div>
                  <aba-section-header [level]="3" [title]="t('ui.m_h5fuqc')" />
                  <aba-record-table [ariaLabel]="t('ui.m_1muvs8z')" [columns]="integrityInvoiceColumns" [rows]="integrityInvoiceRows" [loading]="integrityLoading && !integrityInvoiceRows.length" [loadingDescription]="t('ui.m_19p9gnl')" [emptyTitle]="t('ui.m_ej8yte')" [emptyDescription]="t('ui.m_ydex7x')" />
                  <aba-section-header [level]="3" [title]="t('ui.m_ord1a3')" />
                  <aba-record-table [ariaLabel]="t('ui.m_xbtfmu')" [columns]="integrityAllocationColumns" [rows]="integrityAllocationRows" [loading]="integrityLoading && !integrityAllocationRows.length" [loadingDescription]="t('ui.m_19p9gnl')" [emptyTitle]="t('ui.m_hrqqij')" [emptyDescription]="t('ui.m_uxsaek')" />
                  <div class="inline-form"><span class="muted">{{ t('ui.m_3dypht') }} {{ dataIntegrityReport.offset }} · {{ t('ui.m_1o0uw0o') }} {{ dataIntegrityReport.limit }}</span><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset > 0 ? dataIntegrityReport.offset - dataIntegrityReport.limit : 0)" [disabled]="integrityLoading || dataIntegrityReport.offset === 0">{{ t('ui.m_14wy3hz') }}</button><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset + dataIntegrityReport.limit)" [disabled]="integrityLoading || dataIntegrityReport.offset + dataIntegrityReport.limit >= maxIntegrityTotal">{{ t('ui.m_thb9eg') }}</button></div>
                }
              </section>
  `,
})
export class IntegrityWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly dataIntegrityLoadGuard = new WorkspaceLoadGuard();

  dataIntegrityReport: DataIntegrityReport | null = null;
  integrityError = '';
  integrityLoading = false;
  integrityOffset = 0;

  ngOnInit(): void {
    void this.loadDataIntegrity(0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 3A-376: a business change clears the report and reloads, mirroring
    // the shell's former clearWorkspaceData + tab-switch load.
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.dataIntegrityLoadGuard.invalidate();
    this.dataIntegrityReport = null;
    this.integrityError = '';
    this.integrityOffset = 0;
    void this.loadDataIntegrity(0);
  }

  private integrityRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  async loadDataIntegrity(offset = 0): Promise<void> {
    if (this.role() !== 'owner') return;
    const requestContext = this.integrityRequestContext();
    if (!requestContext.signedIn || !requestContext.userId ||
        requestContext.role !== 'owner' || !requestContext.workspaceId) return;
    this.integrityLoading = true;
    this.integrityError = '';
    this.integrityOffset = offset;
    await runTenantScopedRequest(
      this.dataIntegrityLoadGuard,
      requestContext,
      () => this.integrityRequestContext(),
      () => this.api.dataIntegrity(requestContext.workspaceId, offset),
      {
        onSuccess: result => { this.dataIntegrityReport = result; },
        onError: error => {
          this.dataIntegrityReport = null;
          this.integrityError = this.message(error);
        },
        onFinally: () => { this.integrityLoading = false; },
        onStale: () => { this.integrityLoading = false; },
      },
    );
  }

  integrityWarningLabel(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (normalized.startsWith('this report identifies records for manual review only.')) return this.t('ui.m_jm2qpm');
    if (normalized === 'manual review only' || normalized === 'report is for manual review only') return this.t('ui.m_5watgl');
    return value;
  }

  get maxIntegrityTotal(): number {
    const report = this.dataIntegrityReport;
    return report ? Math.max(report.unlinked_issued_invoices.total, report.currency_mismatched_allocations.total, report.customer_mismatched_allocations.total) : 0;
  }

  get integrityInvoiceColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('ui.m_1cuzqu5'),primary:true},
    {key:'total',label:this.t('ui.m_l97slj'),kind:'numeric'},
    {key:'date',label:this.t('ui.m_1pb5uxl')},
    {key:'record',label:this.t('ui.m_356wdy')},
  ]; }

  get integrityInvoiceRows(): readonly AbaRecordTableRow[] { return (this.dataIntegrityReport?.unlinked_issued_invoices.items||[]).map(row=>({id:row.invoice_id,cells:{
    invoice:row.invoice_number,total:`${row.total} ${row.currency_code}`,date:this.formatRecordDate(row.created_at,'short'),record:row.invoice_id,
  }})); }

  get integrityAllocationColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('ui.m_1cuzqu5'),primary:true},
    {key:'issue',label:this.t('ui.m_1jiia8p'),kind:'status'},
    {key:'amount',label:this.t('ui.m_i3lh6b'),kind:'numeric'},
    {key:'paymentCurrency',label:this.t('ui.m_1ghw6ju')},
    {key:'invoiceCurrency',label:this.t('ui.m_uoq0dn')},
    {key:'customers',label:this.t('ui.m_xwq7hv')},
    {key:'reference',label:this.t('ui.m_15jj1na')},
  ]; }

  get integrityAllocationRows(): readonly AbaRecordTableRow[] {
    const currency=(this.dataIntegrityReport?.currency_mismatched_allocations.items||[]).map(row=>({id:`currency-${row.allocation_id}`,cells:{
      invoice:row.invoice_number,issue:this.t('ui.m_4oned'),
      amount:`${row.allocated_amount} ${row.payment_currency}`,paymentCurrency:row.payment_currency,
      invoiceCurrency:row.invoice_currency,customers:'—',reference:row.payment_reference||row.payment_id,
    }}));
    const customer=(this.dataIntegrityReport?.customer_mismatched_allocations.items||[]).map(row=>({id:`customer-${row.allocation_id}`,cells:{
      invoice:row.invoice_number,issue:this.t('ui.m_1pczd49'),
      amount:`${row.allocated_amount} ${row.invoice_currency}`,paymentCurrency:row.payment_currency,
      invoiceCurrency:row.invoice_currency,
      customers:`${this.t('ui.m_1i2qel0')} ${row.payment_customer_id||'—'} · ${this.t('ui.m_1k6zcv')} ${row.invoice_customer_id||'—'}`,
      reference:row.payment_reference||row.payment_id,
    }}));
    return [...currency,...customer];
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

  private lastErrorKind: 'session-expired' | 'access-denied' | null = null;
  private lastErrorMessage: string | null = null;

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
