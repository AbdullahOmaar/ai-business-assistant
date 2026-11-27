// 3A-921 F1 (Clean Code program): the taxes tab, extracted verbatim
// from the app shell as a data-owning workspace component so it loads
// only when the tab is opened (the same pattern 3A-351 established
// and 3A-376 continued for integrity). Zero behavior change: the
// summary load keeps its owner gate, its tenant-scoped guard, the
// invalid-range invalidation, and the per-currency stored-totals
// rendering exactly as the shell ran them; the shell no longer
// fetches it on tab switches.
import { Component, inject, input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type TaxSummaryReport } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { reportLimitationKey } from './report-labels';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaDateRangeComponent } from './shared/ui/aba-date-range.component';

@Component({
  selector: 'aba-taxes-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaDateRangeComponent],
  template: `
              <section abaCard class="panel">
                <aba-section-header [title]="t('ui.m_nxo405')" [description]="t('ui.m_1dw63nh')" />
                <form class="inline-form tax-form" (ngSubmit)="loadTaxSummary()">
                  <aba-date-range [showClear]="true" [hasValue]="taxStartDate !== '' || taxEndDate !== ''" [clearLabel]="t('ui.m_1np7zc4')" (clear)="taxStartDate = ''; taxEndDate = ''">
                  <label>{{ t('ui.m_10pndrs') }}<input name="taxStartDate" type="date" [(ngModel)]="taxStartDate"></label>
                  <label>{{ t('ui.m_aulmks') }}<input name="taxEndDate" type="date" [(ngModel)]="taxEndDate"></label>
                  </aba-date-range>
                  <button class="primary" type="submit" [disabled]="taxLoading">{{ taxLoading ? t('ui.m_1k98007') : t('ui.m_10jsbot') }}</button>
                </form>
                <p class="footnote">{{ t('ui.taxOperationalNote') }}</p>
                @if (taxError) { <aba-state-message kind="error" [description]="taxError" /> }
                @if (taxSummaryReport) {
                  <aba-record-table [ariaLabel]="t('ui.m_1ciqipn')" [columns]="taxTableColumns" [rows]="taxTableRows" [loading]="taxLoading" [loadingDescription]="t('ui.m_1oo6dkn')" [emptyTitle]="t('ui.m_1xb2mzp')" [emptyDescription]="t('ui.m_j6qlz4')" />
                  @for (limitation of taxSummaryReport.limitations; track limitation) { <p class="muted">• {{ reportLimitationLabel(limitation) }}</p> }
                }
              </section>
  `,
  styles: [`
    /* 3A-371 (U10), moved verbatim with the template: the tax period range stops stretching across wide screens, like the ageing form (3A-354). */
    @media(min-width:761px){.tax-form aba-date-range{max-width:540px}}
  `],
})
export class TaxesWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly taxSummaryLoadGuard = new WorkspaceLoadGuard();

  taxSummaryReport: TaxSummaryReport | null = null;
  taxLoading = false;
  taxError = '';
  taxStartDate = '';
  taxEndDate = '';

  ngOnInit(): void {
    void this.loadTaxSummary();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // A business change clears the summary and reloads, mirroring the
    // shell's former clearWorkspaceData + tab-switch load.
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.taxSummaryLoadGuard.invalidate();
    this.taxSummaryReport = null;
    this.taxError = '';
    this.taxLoading = false;
    void this.loadTaxSummary();
  }

  private taxesRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  get taxTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'currency',label:this.t('ui.m_1jd5ck6'),primary:true},
    {key:'tax',label:this.t('ui.m_129leiq'),kind:'numeric'},
    {key:'count',label:this.t('ui.m_1dnybga'),kind:'numeric'},
  ]; }
  get taxTableRows(): readonly AbaRecordTableRow[] { return (this.taxSummaryReport?.currencies||[]).map(row=>({id:row.currency_code,cells:{
    currency:row.currency_code,tax:`${row.tax_total} ${row.currency_code}`,count:String(row.invoice_count),
  }})); }

  reportLimitationLabel(value: string): string {
    // Shared with the reports workspace: the key map lives in report-labels.ts.
    const key = reportLimitationKey(value);
    return key ? this.t(key) : value;
  }

  async loadTaxSummary(): Promise<void> {
    if (this.role() !== 'owner') return;
    const requestContext = this.taxesRequestContext();
    if (!requestContext.signedIn || !requestContext.userId ||
        requestContext.role !== 'owner' || !requestContext.workspaceId) return;
    if (this.taxStartDate && this.taxEndDate && this.taxStartDate > this.taxEndDate) {
      this.taxSummaryLoadGuard.invalidate();
      this.taxSummaryReport = null;
      this.taxLoading = false;
      this.taxError = this.t('ui.m_mbbjx0');
      return;
    }
    this.taxLoading = true;
    this.taxError = '';
    await runTenantScopedRequest(
      this.taxSummaryLoadGuard,
      requestContext,
      () => this.taxesRequestContext(),
      () => this.api.taxSummary(requestContext.workspaceId, this.taxStartDate || undefined, this.taxEndDate || undefined),
      {
        onSuccess: report => { this.taxSummaryReport = report; },
        onError: error => {
          this.taxSummaryReport = null;
          this.taxError = this.message(error);
        },
        onFinally: () => { this.taxLoading = false; },
        onStale: () => { this.taxLoading = false; },
      },
    );
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
