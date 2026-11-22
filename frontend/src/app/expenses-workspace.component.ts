// 3A-351: the expenses tab, extracted verbatim from the app shell as a
// data-owning workspace component so it loads only when the tab is opened.
// The shell no longer fetches expenses in loadWorkspaceData: this component
// loads them itself (tenant-scoped, on init and on business change) and
// owns the create form, the uncertain-submission retry, the search filter
// and the table. After a create or a retry check it refreshes expenses +
// dashboard itself and emits the fresh dashboard to the shell, which keeps
// owning the dashboard for the Home tab. Validation/uncertain errors are
// emitted to the shell so the shared page-level error banner still shows
// them exactly as before. The workspace loading flag arrives as an input;
// the create/retry flows use a local `submitting` flag instead of the
// shell's loading counter. The expenses-only layout rules moved into this
// component's styles.
import { Component, EventEmitter, inject, input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type Dashboard, type Expense } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { filterExpenses } from './record-filters';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';

@Component({
  selector: 'aba-expenses-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaFilterBarComponent, AbaSearchFieldComponent],
  template: `
  <section abaCard class="panel">
    <aba-section-header [title]="t('ui.m_p4p38y')" [description]="t('ui.m_ehnfke')" [count]="filteredExpenses.length + ' / ' + expenses.length + ' ' + t('ui.m_7rwk8h')"><div class="section-actions"><button class="secondary" type="button" (click)="showExpenseForm = !showExpenseForm">{{ showExpenseForm ? t('ui.m_pw64as') : t('expenseWorkspace.addExpense') }}</button></div></aba-section-header>
    @if (showExpenseForm || expenseSubmissionUncertain) {
    <form #expenseForm="ngForm" class="inline-form expense-form" (ngSubmit)="expenseForm.valid && createExpense()">
      <label class="expense-category-field">{{ t('ui.m_10l7fjw') }}<select #expenseCategoryControl="ngModel" [disabled]="loading() || submitting || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_10l7fjw')" [attr.aria-invalid]="expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted) ? 'expense-category-error' : null" name="expenseCategory" required [(ngModel)]="expenseCategory">
        <option value="General">{{ t('ui.m_uchan8') }}</option>
        <option value="Supplies">{{ t('ui.m_rsaf82') }}</option>
        <option value="Rent">{{ t('ui.m_9liqbp') }}</option>
        <option value="Utilities">{{ t('ui.m_sgynvi') }}</option>
        <option value="Transport">{{ t('ui.m_dby46m') }}</option>
        <option value="Marketing">{{ t('ui.m_1psm7ne') }}</option>
        <option value="Payroll">{{ t('ui.m_vn50om') }}</option>
        <option value="Maintenance">{{ t('ui.m_db4mz5') }}</option>
        <option value="Other">{{ t('ui.m_47rh1w') }}</option>
      </select></label>
      <input #expenseDescriptionControl="ngModel" [disabled]="loading() || submitting || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_tfnzm8')" [attr.aria-invalid]="expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted) ? 'expense-description-error' : null" name="expenseDescription" maxlength="500" [placeholder]="t('ui.m_1552j8m')" required [(ngModel)]="expenseDescription">
      <input #expenseAmountControl="ngModel" [disabled]="loading() || submitting || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_19u7acj')" [attr.aria-invalid]="expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted) ? 'expense-amount-error' : null" name="expenseAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_i3lh6b')" required [(ngModel)]="expenseAmount">
      <input #expenseDateControl="ngModel" [disabled]="loading() || submitting || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_1tz0tea')" [attr.aria-invalid]="expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted) ? 'expense-date-error' : null" name="expenseDate" type="datetime-local" required [(ngModel)]="expenseDate">
      <input [disabled]="loading() || submitting || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_w7k03r')" name="expenseVendor" maxlength="160" [placeholder]="t('ui.m_1klr7r6')" [(ngModel)]="expenseVendor">
      <input [disabled]="loading() || submitting || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_8m31k6')" name="expenseReference" maxlength="128" [placeholder]="t('ui.m_v160u1')" [(ngModel)]="expenseReference">
      <button class="primary" type="submit" [disabled]="loading() || submitting || expenseSubmissionUncertain">{{ t('ui.m_xi9fpn') }}</button>
    </form>
    @if ((expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted)) || (expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted)) || (expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted)) || (expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted))) {
      <div class="expense-validation" aria-live="polite">
        @if (expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted)) { <small id="expense-category-error" class="field-error">{{ t('ui.m_hshr2e') }}</small> }
        @if (expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted)) { <small id="expense-description-error" class="field-error">{{ t('ui.m_pzmh99') }}</small> }
        @if (expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted)) { <small id="expense-amount-error" class="field-error">{{ t('ui.m_1sa72kc') }}</small> }
        @if (expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted)) { <small id="expense-date-error" class="field-error">{{ t('ui.m_17vb8am') }}</small> }
      </div>
    }
    <p class="expense-cash-semantics">{{ t('ui.m_xenywp') }}</p>
    <p class="footnote">{{ t('ui.m_ks5nuz') }} {{ currencyCode() }}. {{ t('ui.m_1r2awxh') }}</p>
    }
    @if (expenseMessage) { <aba-state-message kind="success" [description]="expenseMessage" /> }
    @if (expenseSubmissionUncertain) {
      <aba-state-message kind="error" [description]="t('ui.m_bv3h04')" [actionLabel]="t('ui.m_r6p4yr')" [actionDisabled]="loading() || submitting" (action)="checkExpenseSubmissionOutcome()" />
    }
    <div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="expenseSearch" [hasActiveFilter]="expenseSearch.trim() !== ''" (clear)="expenseSearch = ''"><aba-search-field name="expenseSearch" [ariaLabel]="t('ui.m_qat44q')" [placeholder]="t('ui.m_34prmq')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="expenseSearch" /></aba-filter-bar></div>
    <aba-record-table [ariaLabel]="t('ui.m_zyptez')" [columns]="expenseTableColumns" [rows]="expenseTableRows" [loading]="loading() && !expenses.length" [loadingDescription]="t('ui.m_luj2e5')" [emptyTitle]="t('ui.m_ia2bhy')" [emptyDescription]="expenseSearch.trim() ? t('ui.m_1ow9n49') : t('ui.m_1xx6js5')" />
  </section>
  `,
  styles: [`
.section-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.expense-form{grid-template-columns:repeat(3,minmax(0,1fr))}
.expense-form{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.5fr) minmax(100px,.65fr) minmax(170px,1fr) minmax(130px,.8fr) minmax(120px,.8fr);align-items:end;gap:10px}
.expense-form .expense-category-field{min-width:0}
@media(max-width:900px){.expense-form{grid-template-columns:repeat(2,minmax(0,1fr))}.expense-form input[name="expenseDescription"]{grid-column:1/-1}.expense-form input[name="expenseDate"]{grid-column:1/-1}}
@media(max-width:600px){.expense-form{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.expense-form input[name="expenseDescription"],.expense-form input[name="expenseDate"]{grid-column:1/-1}.expense-cash-semantics{margin:10px 0 0;padding:9px 11px;border-inline-start:3px solid var(--aba-color-info,#3b82f6);border-radius:8px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#475569);font-size:12px;line-height:1.55}}
  `],
})
export class ExpensesWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();
  readonly currencyCode = input.required<string>();
  readonly loading = input.required<boolean>();
  readonly refreshTick = input(0);

  @Output() readonly dashboardChanged = new EventEmitter<Dashboard>();
  @Output() readonly errorNotice = new EventEmitter<string>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly expensesRequestGuard = new WorkspaceLoadGuard();

  expenseSearch = '';
  expenses: Expense[] = [];
  expenseCategory = 'General';
  expenseDescription = '';
  expenseAmount = '';
  expenseDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  expenseVendor = '';
  expenseReference = '';
  expenseMessage = '';
  expenseSubmissionUncertain = false;
  submitting = false;
  /* 3A-354 (2026-11-22): the create form is on-demand (agreement G6),
   * mirroring payments. It also stays open while a submission outcome
   * is uncertain so the retry check remains reachable. */
  showExpenseForm = false;

  ngOnInit(): void {
    void this.loadExpenses();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 3A-351: a business change clears the form state and reloads the list,
    // mirroring the shell's former clearWorkspaceData + loadWorkspaceData.
    // 3A-351: a payroll payment refreshes the dashboard in the shell and
    // bumps refreshTick; reload the list so it never goes stale while mounted.
    if (changes['refreshTick'] && !changes['refreshTick'].firstChange) {
      void this.loadExpenses();
      return;
    }
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.expensesRequestGuard.invalidate();
    this.expenses = [];
    this.expenseSearch = '';
    this.expenseMessage = '';
    this.expenseSubmissionUncertain = false;
    void this.loadExpenses();
  }

  private expenseRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  async loadExpenses(): Promise<void> {
    const requestContext = this.expenseRequestContext();
    // Fail closed if the request cannot be tied to an authenticated user and workspace.
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.workspaceId) return;
    await runTenantScopedRequest(
      this.expensesRequestGuard,
      requestContext,
      () => this.expenseRequestContext(),
      () => this.api.expenses(requestContext.workspaceId),
      {
        onSuccess: expenses => {
          this.expenses = expenses;
        },
        onError: error => {
          this.errorNotice.emit(this.message(error));
        },
        onFinally: () => undefined,
      },
    );
  }

  get filteredExpenses(): Expense[] {
    return filterExpenses(this.expenses, this.expenseSearch, category => this.expenseCategoryLabel(category), this.localization.locale);
  }

  get expenseTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'date',label:this.t('ui.m_1fcm91o')},
    {key:'description',label:this.t('ui.m_1552j8m'),primary:true},
    {key:'category',label:this.t('ui.m_1ebfv92'),kind:'status'},
    {key:'vendor',label:this.t('ui.m_w7k03r')},
    {key:'reference',label:this.t('ui.m_eimrhe')},
    {key:'amount',label:this.t('ui.m_i3lh6b'),kind:'numeric'},
  ]; }

  get expenseTableRows(): readonly AbaRecordTableRow[] { return this.filteredExpenses.map(item=>({id:item.id,cells:{
    date:this.formatRecordDate(item.incurred_at),description:item.description,category:this.expenseCategoryLabel(item.category),
    vendor:item.vendor_name||this.t('ui.m_xt63l4'),reference:item.reference||'—',amount:`${item.amount} ${item.currency_code}`,
  }})); }

  expenseCategoryLabel(category: string): string {
    const keys: Record<string, string> = {
      General: 'app.expenseCategory.general', Supplies: 'app.expenseCategory.supplies',
      Rent: 'app.expenseCategory.rent', Utilities: 'app.expenseCategory.utilities',
      Transport: 'app.expenseCategory.transport', Marketing: 'app.expenseCategory.marketing',
      Payroll: 'app.expenseCategory.payroll', Maintenance: 'app.expenseCategory.maintenance',
      Other: 'app.expenseCategory.other',
    };
    return keys[category] ? this.t(keys[category]) : category;
  }

  async createExpense(): Promise<void> {
    if (!this.businessId() || this.expenseSubmissionUncertain) return;
    const businessId = this.businessId();
    const category = this.expenseCategory.trim();
    const description = this.expenseDescription.trim();
    const amount = Number(this.expenseAmount);
    const occurredAt = new Date(this.expenseDate);
    if (!category || !description || !String(this.expenseAmount ?? '').trim() || !Number.isFinite(amount) || amount <= 0) {
      this.errorNotice.emit(this.t('ui.m_i7atfd'));
      return;
    }
    if (!this.expenseDate || !Number.isFinite(occurredAt.getTime())) {
      this.errorNotice.emit(this.t('ui.m_10t3tvt'));
      return;
    }
    const currencyCode = this.currencyCode();
    this.submitting = true;
    this.errorNotice.emit('');
    this.expenseMessage = '';
    try {
      await this.api.createExpense(businessId, {
        category,
        description,
        amount: String(this.expenseAmount ?? '').trim(),
        currency_code: currencyCode,
        incurred_at: occurredAt.toISOString(),
        vendor_name: this.expenseVendor.trim() || undefined,
        reference: this.expenseReference.trim() || undefined
      });
      if (this.businessId() !== businessId) return;
      this.expenseCategory = 'General';
      this.expenseDescription = '';
      this.expenseAmount = '';
      this.expenseDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      this.expenseVendor = '';
      this.expenseReference = '';
      this.expenseMessage = this.t('ui.m_h0kei5');
      try {
        const [expenses, dashboard] = await Promise.all([
          this.api.expenses(businessId),
          this.api.dashboard(businessId)
        ]);
        if (this.businessId() !== businessId) return;
        this.expenses = expenses;
        this.dashboardChanged.emit(dashboard);
      } catch {
        if (this.businessId() === businessId) {
          this.errorNotice.emit(this.t('ui.m_14xth7t'));
        }
      }
    } catch (error) {
      if (this.businessId() === businessId) {
        this.expenseSubmissionUncertain = true;
        this.errorNotice.emit(this.t('ui.m_1womw08') + ' ' + this.message(error));
      }
    } finally {
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.submitting = false;
    }
  }

  async checkExpenseSubmissionOutcome(): Promise<void> {
    if (!this.businessId()) return;
    const businessId = this.businessId();
    this.submitting = true;
    this.errorNotice.emit('');
    try {
      const [expenses, dashboard] = await Promise.all([
        this.api.expenses(businessId),
        this.api.dashboard(businessId)
      ]);
      if (this.businessId() !== businessId) return;
      this.expenses = expenses;
      this.dashboardChanged.emit(dashboard);
      this.expenseSubmissionUncertain = false;
      this.expenseMessage = this.t('ui.m_1arh565');
    } catch (error) {
      if (this.businessId() === businessId) this.errorNotice.emit(this.message(error));
    } finally {
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.submitting = false;
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
