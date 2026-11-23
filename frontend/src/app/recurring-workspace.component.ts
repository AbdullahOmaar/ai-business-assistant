// 3A-376: the recurring-schedules tab, extracted verbatim from the app
// shell as a data-owning workspace component so it loads only when the
// tab is opened (the same pattern 3A-351 established, continued for
// suppliers in this batch). This component loads the schedules itself
// (tenant-scoped, on init and on business change) and owns the create
// form, the search filter and the table. The customer options and names
// come from the shell's customer list as an input (the same list the
// shell's own invoice surfaces use). The shell's per-tab operations
// notices (error / warning / success) are owned locally with identical
// semantics: starting an action clears all three, a success sets the
// message, and a failure becomes a warning when a success message is
// already showing for the tab.
import { Component, inject, input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type Customer, type RecurringInvoiceSchedule } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { filterRecurringSchedules } from './record-filters';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';

@Component({
  selector: 'aba-recurring-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaFilterBarComponent, AbaSearchFieldComponent],
  template: `
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_slegw7') " [description]=" t('ui.m_1e0c20g') "><div class="section-actions"><span class="count">{{ filteredRecurringSchedules.length }} / {{ recurringSchedules.length }}</span>@if (role() === 'owner') { <button class="secondary" type="button" (click)="showRecurringForm = !showRecurringForm">{{ showRecurringForm ? t('ui.m_pw64as') : t('ui.m_slegw7') }}</button> }</div></aba-section-header>
                @if (role() === 'owner') {
                @if (showRecurringForm) {
                <form #recurringForm="ngForm" class="stack recurring-form" (ngSubmit)="recurringForm.valid && createRecurringSchedule()">
                  <label>{{ t('ui.m_eoh95l') }}<select name="recurringCustomerId" [(ngModel)]="recurringCustomerId"><option value="">{{ t('ui.m_8pt45d') }}</option>@for (customer of customers(); track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select></label>
                  <div class="inline-form"><label>{{ t('ui.m_py5g30') }}<input #recurringIntervalControl="ngModel" name="recurringIntervalDays" type="number" min="1" max="3650" required [attr.aria-invalid]="recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted) ? 'true' : null" [attr.aria-describedby]="recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted) ? 'recurring-interval-error' : null" [(ngModel)]="recurringIntervalDays"></label><label>{{ t('ui.m_1e7ftdu') }}<input #recurringNextRunControl="ngModel" name="recurringNextRunAt" type="datetime-local" required [attr.aria-invalid]="recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted) ? 'true' : null" [attr.aria-describedby]="recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted) ? 'recurring-next-run-error' : null" [(ngModel)]="recurringNextRunAt"></label></div>
                  <label>{{ t('ui.m_z76sxh') }}<input #recurringTimezoneControl="ngModel" name="recurringTimezone" required maxlength="64" [attr.aria-invalid]="recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted) ? 'true' : null" [attr.aria-describedby]="recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted) ? 'recurring-timezone-error' : null" [(ngModel)]="recurringTimezone"></label>
                  <button class="primary" type="submit" [disabled]="recurringLoading">{{ t('ui.m_r0fiju') }}</button>
                </form>
                @if ((recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted)) || (recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted)) || (recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted)) { <small id="recurring-interval-error" class="field-error">{{ t('ui.m_9goc5p') }}</small> }
                    @if (recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted)) { <small id="recurring-next-run-error" class="field-error">{{ t('ui.m_1husn1x') }}</small> }
                    @if (recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted)) { <small id="recurring-timezone-error" class="field-error">{{ t('ui.m_1t55sm0') }}</small> }
                  </div>
                }
                }
                } @else { <aba-state-message kind="info" [description]="t('ui.m_t5zhtj')" /> }
                @if (noticeError) { <aba-state-message kind="error" [description]="noticeError" /> }
                @if (noticeWarning) { <aba-state-message kind="warning" [description]="noticeWarning" /> }
                @if (noticeMessage) { <aba-state-message kind="success" [description]="noticeMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="recurringSearch" [hasActiveFilter]="recurringSearch.trim() !== ''" (clear)="recurringSearch = ''"><aba-search-field name="recurringSearch" [ariaLabel]="t('ui.m_aljqyp')" [placeholder]="t('ui.m_z7f6xc')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="recurringSearch" /></aba-filter-bar></div>
                <aba-record-table [ariaLabel]="t('ui.m_uxwqg9')" [columns]="recurringTableColumns" [rows]="recurringTableRows" [loading]="recurringLoading && !recurringSchedules.length" [loadingDescription]="t('ui.m_10b19k6')" [emptyTitle]="t('ui.m_4r8x8c')" [emptyDescription]="recurringSearch.trim() ? t('ui.m_11cvrt7') : t('ui.m_kxnfs6')" />
              </section>
  `,
  styles: [`
/* 3A-371 (U11): recurring-schedule fields sized to their meaning on wide screens.
 * 3A-376: moved with the tab into this component (shell CSS no longer reaches it). */
@media(min-width:761px){.recurring-form>label{max-width:340px}}
  `],
})
export class RecurringWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();
  readonly customers = input.required<readonly Customer[]>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly recurringRequestGuard = new WorkspaceLoadGuard();

  recurringSchedules: RecurringInvoiceSchedule[] = [];
  recurringLoading = false;
  recurringSearch = '';
  showRecurringForm = false;
  recurringCustomerId = '';
  recurringIntervalDays = '30';
  recurringNextRunAt = new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  recurringTimezone = 'UTC';
  noticeError = '';
  noticeMessage = '';
  noticeWarning = '';

  ngOnInit(): void {
    void this.loadRecurringSchedules();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 3A-376: a business change clears the form state and reloads the list,
    // mirroring the shell's former clearWorkspaceData + loadWorkspaceData.
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.recurringRequestGuard.invalidate();
    this.recurringSchedules = [];
    this.recurringSearch = '';
    this.recurringCustomerId = '';
    this.recurringIntervalDays = '30';
    this.recurringNextRunAt = new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    this.recurringTimezone = 'UTC';
    this.noticeError = '';
    this.noticeMessage = '';
    this.noticeWarning = '';
    void this.loadRecurringSchedules();
  }

  private recurringRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  async loadRecurringSchedules(): Promise<void> {
    const requestContext = this.recurringRequestContext();
    // Fail closed if the request cannot be tied to an authenticated user and workspace.
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.workspaceId) return;
    this.recurringLoading = true;
    await runTenantScopedRequest(
      this.recurringRequestGuard,
      requestContext,
      () => this.recurringRequestContext(),
      () => this.api.recurringSchedules(requestContext.workspaceId),
      {
        onSuccess: schedules => {
          this.recurringSchedules = schedules;
        },
        onError: error => {
          this.noticeError = this.message(error);
        },
        onFinally: () => {
          this.recurringLoading = false;
        },
      },
    );
  }

  get filteredRecurringSchedules(): RecurringInvoiceSchedule[] {
    return filterRecurringSchedules(
      this.recurringSchedules,
      this.recurringSearch,
      id => this.customerNameForInvoice(id),
      active => this.t(active ? 'app.recurringSchedule.active' : 'app.recurringSchedule.inactive'),
      this.localization.locale,
    );
  }

  get recurringTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'customer',label:this.t('ui.m_ubgrc2'),primary:true},
    {key:'interval',label:this.t('ui.m_soswtl')},
    {key:'nextRun',label:this.t('ui.m_1e7ftdu')},
    {key:'timezone',label:this.t('ui.m_z76sxh')},
    {key:'status',label:this.t('ui.m_jnmvwl'),kind:'status'},
  ]; }

  get recurringTableRows(): readonly AbaRecordTableRow[] { return this.filteredRecurringSchedules.map(item=>({id:item.id,cells:{
    customer:item.customer_id?this.customerNameForInvoice(item.customer_id):this.t('ui.m_j3ewjv'),
    interval:`${item.interval_days} ${this.t('ui.m_5mk40x')}`,nextRun:this.formatRecordDate(item.next_run_at),timezone:item.timezone,
    status:item.is_active?this.t('ui.m_1vhpjk3'):this.t('ui.m_vspcsf'),
  }})); }

  customerNameForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('ui.m_f2sjwn');
    return this.customers().find(customer => customer.id === customerId)?.name
      || this.t('ui.m_30i7q4');
  }

  async createRecurringSchedule(): Promise<void> {
    if (this.role() !== 'owner') return;
    const requestContext = this.recurringRequestContext();
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.workspaceId) return;
    const businessId = requestContext.workspaceId;
    this.beginAction();
    const interval = Number(this.recurringIntervalDays);
    if (!Number.isInteger(interval) || interval < 1 || interval > 3650) {
      this.noticeError = this.t('ui.m_1jvv49p');
      return;
    }
    this.recurringLoading = true;
    try {
      await this.api.createRecurringSchedule(businessId, {
        customer_id: this.recurringCustomerId || null,
        interval_days: interval,
        timezone: this.recurringTimezone.trim() || 'UTC',
        next_run_at: new Date(this.recurringNextRunAt).toISOString(),
      });
      if (this.businessId() !== businessId) return;
      this.noticeMessage = this.t('ui.m_6a3p89');
      const items = await this.api.recurringSchedules(businessId);
      if (this.businessId() !== businessId) return;
      this.recurringSchedules = items;
    } catch (error) {
      if (this.businessId() === businessId) this.setFailure(error);
    } finally {
      if (this.businessId() === businessId) this.recurringLoading = false;
    }
  }

  private beginAction(): void {
    this.noticeError = '';
    this.noticeMessage = '';
    this.noticeWarning = '';
  }

  private setFailure(error: unknown): void {
    if (this.noticeMessage) {
      this.noticeWarning = this.t('ui.m_1ngg92z') + ' ' + this.message(error);
      return;
    }
    this.noticeError = this.message(error);
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
