// 3A-351: the notifications tab, extracted verbatim from the app shell as
// a data-owning workspace component so it loads only when the tab is opened.
// The shell no longer triggers the load from setTab: this component loads on
// init and on business change, and reloads whenever the active tab becomes
// 'notifications' (mirroring the old setTab trigger). The operations
// message/error/warning state is a per-component copy — the shell keeps its
// own copy for the suppliers/purchases/recurring tabs. When the active tab
// switches away from notifications, the component clears its own success
// message and warning exactly as setTab cleared the shell's. The create form
// stays owner-gated through the role input.
import { Component, inject, input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type NotificationRecord } from './api.service';
import { LocalizationService } from './localization.service';
import { filterNotifications } from './record-filters';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';

@Component({
  selector: 'aba-notifications-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaFilterBarComponent, AbaSearchFieldComponent],
  template: `
  <section abaCard class="panel">
    <aba-section-header [title]=" t('ui.m_6wit46') " [description]=" t('ui.m_1a21njv') "><span class="count">{{ filteredNotifications.length }} / {{ notifications.length }}</span></aba-section-header>
    @if (role() === 'owner') {
    <form #notificationForm="ngForm" class="stack" (ngSubmit)="notificationForm.valid && createNotification()">
      <label>{{ t('ui.m_1ulxyq2') }}<select #notificationKindControl="ngModel" name="notificationKind" required [attr.aria-invalid]="notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted) ? 'true' : null" [attr.aria-describedby]="notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted) ? 'notification-kind-error' : null" [(ngModel)]="notificationKind">
        <option value="business">{{ t('ui.m_1821fhb') }}</option>
        <option value="invoices">{{ t('ui.m_1h7f08p') }}</option>
        <option value="payments">{{ t('ui.m_14ms9re') }}</option>
        <option value="expenses">{{ t('ui.m_l71hva') }}</option>
        <option value="inventory">{{ t('ui.m_1w4exkr') }}</option>
        <option value="reminders">{{ t('ui.m_1f2h79i') }}</option>
        <option value="reports">{{ t('ui.m_zmcikc') }}</option>
        <option value="suppliers">{{ t('ui.m_1yzd6rs') }}</option>
        <option value="purchases">{{ t('ui.m_57w0yx') }}</option>
        <option value="recurring">{{ t('ui.m_11lck86') }}</option>
        <option value="assistant">{{ t('ui.m_dzn3ev') }}</option>
        <option value="system">{{ t('ui.m_kl4jvd') }}</option>
      </select></label>
      <label>{{ t('ui.m_1m8bms') }}<input #notificationTitleControl="ngModel" name="notificationTitle" required maxlength="160" [attr.aria-invalid]="notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted) ? 'true' : null" [attr.aria-describedby]="notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted) ? 'notification-title-error' : null" [(ngModel)]="notificationTitle"></label>
      <label>{{ t('ui.m_cjak9a') }}<textarea #notificationBodyControl="ngModel" name="notificationBody" required maxlength="1000" rows="3" [attr.aria-invalid]="notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted) ? 'true' : null" [attr.aria-describedby]="notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted) ? 'notification-body-error' : null" [(ngModel)]="notificationBody"></textarea></label>
      <label>{{ t('ui.m_1ocecai') }}<input name="notificationScheduledAt" type="datetime-local" [(ngModel)]="notificationScheduledAt"></label>
      <button class="primary" type="submit" [disabled]="notificationsLoading">{{ t('ui.m_d76gji') }}</button>
    </form>
    @if ((notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted)) || (notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted)) || (notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted))) {
      <div class="form-validation" aria-live="polite">
        @if (notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted)) { <small id="notification-kind-error" class="field-error">{{ t('ui.m_guqotm') }}</small> }
        @if (notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted)) { <small id="notification-title-error" class="field-error">{{ t('ui.m_92hmvu') }}</small> }
        @if (notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted)) { <small id="notification-body-error" class="field-error">{{ t('ui.m_1qli6jw') }}</small> }
      </div>
    }
    } @else { <aba-state-message kind="info" [description]="t('ui.m_1oi5fhe')" /> }
    @if (operationsError && operationsErrorTab === 'notifications') { <aba-state-message kind="error" [description]="operationsError" /> }
    @if (operationsWarning && operationsMessageTab === 'notifications') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
    @if (operationsMessageTab === 'notifications' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
    <div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="notificationSearch" [hasActiveFilter]="notificationSearch.trim() !== ''" (clear)="notificationSearch = ''"><aba-search-field name="notificationSearch" [ariaLabel]="t('ui.m_1qze32v')" [placeholder]="t('ui.m_1aqo4qr')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="notificationSearch" /></aba-filter-bar></div>
    <aba-record-table [ariaLabel]="t('ui.m_1qfr3uw')" [columns]="notificationTableColumns" [rows]="notificationTableRows" [loading]="notificationsLoading && !notifications.length" [loadingDescription]="t('ui.m_fwia2s')" [emptyTitle]="t('ui.m_1mw6u5')" [emptyDescription]="notificationSearch.trim() ? t('ui.m_23ba9u') : t('ui.m_1yt5n1a')" />
  </section>
  `,
})
export class NotificationsWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();
  readonly activeTab = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);

  notificationSearch = '';
  notifications: NotificationRecord[] = [];
  notificationsLoading = false;
  notificationKind = 'business';
  notificationTitle = '';
  notificationBody = '';
  notificationDeduplicationKey = 'manual-' + Date.now();
  notificationScheduledAt = '';
  operationsError = '';
  operationsErrorTab: 'notifications' | null = null;
  operationsMessage = '';
  operationsMessageTab: 'notifications' | null = null;
  operationsWarning = '';

  ngOnInit(): void {
    void this.loadNotifications();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 3A-351: a business change clears the form and list state and reloads,
    // mirroring the shell's former clearWorkspaceData + loadWorkspaceData.
    if (changes['businessId'] && !changes['businessId'].firstChange) {
      this.notifications = [];
      this.notificationSearch = '';
      this.notificationTitle = '';
      this.notificationBody = '';
      this.notificationScheduledAt = '';
      this.notificationDeduplicationKey = 'manual-' + Date.now();
      this.notificationsLoading = false;
      this.operationsError = '';
      this.operationsErrorTab = null;
      this.operationsMessage = '';
      this.operationsMessageTab = null;
      this.operationsWarning = '';
      void this.loadNotifications();
      return;
    }
    // 3A-351: mirror setTab — entering the tab reloads the list, leaving it
    // clears the success message and warning.
    if (changes['activeTab'] && !changes['activeTab'].firstChange) {
      if (this.activeTab() !== 'notifications' && this.operationsMessageTab === 'notifications') {
        this.operationsMessage = '';
        this.operationsMessageTab = null;
        this.operationsWarning = '';
      }
      if (this.activeTab() === 'notifications') void this.loadNotifications();
    }
  }

  get filteredNotifications(): NotificationRecord[] {
    return filterNotifications(this.notifications, this.notificationSearch, kind => this.notificationKindLabel(kind), status => this.notificationStatusLabel(status), this.localization.locale);
  }

  get notificationTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'title',label:this.t('ui.m_r04zvh'),primary:true},
    {key:'kind',label:this.t('ui.m_1uc2roh'),kind:'status'},
    {key:'status',label:this.t('ui.m_jnmvwl'),kind:'status'},
    {key:'scheduled',label:this.t('ui.m_15oe042')},
    {key:'created',label:this.t('ui.m_1pb5uxl')},
    {key:'body',label:this.t('ui.m_cjak9a')},
  ]; }

  get notificationTableRows(): readonly AbaRecordTableRow[] { return this.filteredNotifications.map(item=>({id:item.id,cells:{
    title:item.title,kind:this.notificationKindLabel(item.kind),status:this.notificationStatusLabel(item.status),
    scheduled:item.scheduled_at?this.formatRecordDate(item.scheduled_at):this.t('ui.m_6apaf4'),created:this.formatRecordDate(item.created_at,'short'),body:item.body,
  }})); }

  notificationKindLabel(kind: string): string {
    const keys: Record<string, string> = {
      business: 'app.notificationKind.business', businesses: 'app.notificationKind.businesses',
      invoices: 'app.notificationKind.invoices', payments: 'app.notificationKind.payments',
      expenses: 'app.notificationKind.expenses', inventory: 'app.notificationKind.inventory',
      reminders: 'app.notificationKind.reminders', reports: 'app.notificationKind.reports',
      suppliers: 'app.notificationKind.suppliers', purchases: 'app.notificationKind.purchases',
      recurring: 'app.notificationKind.recurring', assistant: 'app.notificationKind.assistant',
      system: 'app.notificationKind.system',
    };
    return keys[kind] ? this.t(keys[kind]) : kind;
  }

  notificationStatusLabel(status: string): string {
    const keys: Record<string, string> = {
      pending: 'app.notificationStatus.pending', sent: 'app.notificationStatus.sent',
      failed: 'app.notificationStatus.failed', cancelled: 'app.notificationStatus.cancelled',
    };
    return keys[status] ? this.t(keys[status]) : status || this.t('app.labels.unknownStatus');
  }

  private beginOperationsAction(): void {
    this.operationsError = '';
    this.operationsErrorTab = null;
    this.operationsMessage = '';
    this.operationsMessageTab = null;
    this.operationsWarning = '';
  }

  private setOperationsSuccess(tab: 'notifications', message: string): void {
    this.operationsErrorTab = null;
    this.operationsMessage = message;
    this.operationsMessageTab = tab;
  }

  private setOperationsFailure(tab: 'notifications', error: unknown): void {
    if (this.operationsMessageTab === tab && this.operationsMessage) {
      this.operationsWarning = this.t('ui.m_1ngg92z') + ' ' + this.message(error);
      return;
    }
    this.operationsError = this.message(error);
    this.operationsErrorTab = tab;
  }

  private async loadNotifications(): Promise<void> {
    if (!this.businessId()) return;
    const businessId = this.businessId();
    this.notificationsLoading = true;
    this.operationsError = '';
    this.operationsErrorTab = null;
    try {
      const items = await this.api.notifications(businessId);
      if (this.businessId() === businessId) this.notifications = items;
    } catch (error) {
      if (this.businessId() === businessId) {
        this.operationsError = this.message(error);
        this.operationsErrorTab = 'notifications';
      }
    } finally {
      if (this.businessId() === businessId) this.notificationsLoading = false;
    }
  }

  async createNotification(): Promise<void> {
    if (!this.businessId() || this.role() !== 'owner' || !this.notificationTitle.trim() || !this.notificationBody.trim()) return;
    const businessId = this.businessId();
    this.beginOperationsAction();
    this.notificationsLoading = true;
    try {
      await this.api.createNotification(businessId, {
        kind: this.notificationKind.trim() || 'business',
        title: this.notificationTitle.trim(),
        body: this.notificationBody.trim(),
        deduplication_key: this.notificationDeduplicationKey,
        scheduled_at: this.notificationScheduledAt ? new Date(this.notificationScheduledAt).toISOString() : undefined,
      });
      if (this.businessId() !== businessId) return;
      this.setOperationsSuccess('notifications', this.t('ui.m_1618gqb'));
      this.notificationTitle = '';
      this.notificationBody = '';
      this.notificationScheduledAt = '';
      this.notificationDeduplicationKey = 'manual-' + Date.now();
      const items = await this.api.notifications(businessId);
      if (this.businessId() === businessId) this.notifications = items;
    } catch (error) {
      if (this.businessId() === businessId) this.setOperationsFailure('notifications', error);
    } finally {
      if (this.businessId() === businessId) this.notificationsLoading = false;
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

  private lastErrorKind: 'session-expired' | 'access-denied' | null = null;
  private lastErrorMessage: string | null = null;

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
