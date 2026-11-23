// 3A-376: the suppliers tab, extracted verbatim from the app shell as a
// data-owning workspace component so it loads only when the tab is opened
// (the same pattern 3A-351 established for expenses/purchasing/reports).
// This component loads the list itself (tenant-scoped, on init and on
// business change) and owns the create form, the search filter and the
// table. The shell's per-tab operations notices (error / warning /
// success) are owned locally with identical semantics: starting an action
// clears all three, a success sets the message, and a failure becomes a
// warning when a success message is already showing for the tab. The
// shell keeps only a read-only supplier cache for purchase-order name
// resolution (supplierNameFor, used by its purchase approval details);
// the purchasing workspace fetches its own supplier list as before.
import { Component, inject, input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type Supplier } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { filterSuppliers } from './record-filters';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';

@Component({
  selector: 'aba-suppliers-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaFilterBarComponent, AbaSearchFieldComponent],
  template: `
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_3w60yt') " [description]=" t('ui.m_6u1nke') "><span class="count">{{ filteredSuppliers.length }} / {{ suppliers.length }}</span></aba-section-header>
<details class="aba-record-create">
                  <summary><span>{{ t('ui.m_p2zqz3') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #supplierForm="ngForm" class="inline-form" (ngSubmit)="supplierForm.valid && createSupplier()">
                  <input #supplierNameControl="ngModel" name="supplierName" required maxlength="160" [attr.aria-label]="t('ui.m_jj4jgj')" [attr.aria-invalid]="supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted) ? 'true' : null" [attr.aria-describedby]="supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted) ? 'supplier-name-error' : null" [placeholder]="t('ui.m_jj4jgj')" [(ngModel)]="supplierName">
                  <input #supplierEmailControl="ngModel" name="supplierEmail" type="email" maxlength="254" [attr.aria-label]="t('ui.m_112c7vo')" [attr.aria-invalid]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'true' : null" [attr.aria-describedby]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'supplier-email-error' : null" [placeholder]="t('ui.m_u2wvbv')" [(ngModel)]="supplierEmail">
                  <input name="supplierPhone" maxlength="32" [attr.aria-label]="t('ui.m_19jxea1')" [placeholder]="t('ui.m_1fpllb8')" [(ngModel)]="supplierPhone">
                  <input name="supplierAddress" maxlength="500" [attr.aria-label]="t('ui.m_1d6x93e')" [placeholder]="t('ui.m_1dvmwnl')" [(ngModel)]="supplierAddress">
                  <button class="primary" type="submit" [disabled]="suppliersLoading">{{ t('ui.m_p2zqz3') }}</button>
                </form>
                @if ((supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted)) || (supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted)) { <small id="supplier-name-error" class="field-error">{{ t('ui.m_1840rkw') }}</small> }
                    @if (supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted)) { <small id="supplier-email-error" class="field-error">{{ t('ui.m_stzy3f') }}</small> }
                  </div>
                }

                  </div>
                </details>
                @if (noticeError) { <aba-state-message kind="error" [description]="noticeError" /> }
                @if (noticeWarning) { <aba-state-message kind="warning" [description]="noticeWarning" /> }
                @if (noticeMessage) { <aba-state-message kind="success" [description]="noticeMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="supplierSearch" [hasActiveFilter]="supplierSearch.trim() !== ''" (clear)="supplierSearch = ''"><aba-search-field name="supplierSearch" [ariaLabel]="t('ui.m_1mc30sn')" [placeholder]="t('ui.m_jtec0a')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="supplierSearch" /></aba-filter-bar></div>
                <aba-record-table [ariaLabel]="t('ui.m_13lj997')" [columns]="supplierTableColumns" [rows]="supplierTableRows" [loading]="suppliersLoading && !suppliers.length" [loadingDescription]="t('ui.m_16wb349')" [emptyTitle]="t('ui.m_1u3jkgy')" [emptyDescription]="supplierSearch.trim() ? t('ui.m_ka2uzv') : t('ui.m_9e3ceh')" />

              </section>
  `,
})
export class SuppliersWorkspaceComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly suppliersRequestGuard = new WorkspaceLoadGuard();

  suppliers: Supplier[] = [];
  suppliersLoading = false;
  supplierSearch = '';
  supplierName = '';
  supplierEmail = '';
  supplierPhone = '';
  supplierAddress = '';
  noticeError = '';
  noticeMessage = '';
  noticeWarning = '';

  ngOnInit(): void {
    void this.loadSuppliers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 3A-376: a business change clears the form state and reloads the list,
    // mirroring the shell's former clearWorkspaceData + loadWorkspaceData.
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.suppliersRequestGuard.invalidate();
    this.suppliers = [];
    this.supplierSearch = '';
    this.supplierName = '';
    this.supplierEmail = '';
    this.supplierPhone = '';
    this.supplierAddress = '';
    this.noticeError = '';
    this.noticeMessage = '';
    this.noticeWarning = '';
    void this.loadSuppliers();
  }

  private supplierRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  async loadSuppliers(): Promise<void> {
    const requestContext = this.supplierRequestContext();
    // Fail closed if the request cannot be tied to an authenticated user and workspace.
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.workspaceId) return;
    this.suppliersLoading = true;
    await runTenantScopedRequest(
      this.suppliersRequestGuard,
      requestContext,
      () => this.supplierRequestContext(),
      () => this.api.suppliers(requestContext.workspaceId),
      {
        onSuccess: suppliers => {
          this.suppliers = suppliers;
        },
        onError: error => {
          this.noticeError = this.message(error);
        },
        onFinally: () => {
          this.suppliersLoading = false;
        },
      },
    );
  }

  get filteredSuppliers(): Supplier[] {
    return filterSuppliers(this.suppliers, this.supplierSearch, this.localization.locale);
  }

  get supplierTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'name',label:this.t('ui.m_x27ir1'),primary:true},
    {key:'email',label:this.t('ui.m_112c7vo')},
    {key:'phone',label:this.t('ui.m_19jxea1')},
    {key:'address',label:this.t('ui.m_1d6x93e')},
    {key:'status',label:this.t('ui.m_jnmvwl'),kind:'status'},
  ]; }

  get supplierTableRows(): readonly AbaRecordTableRow[] { return this.filteredSuppliers.map(supplier=>({
    id:supplier.id,cells:{
      name:supplier.name,email:supplier.email||this.t('ui.m_2wkjj4'),
      phone:supplier.phone||this.t('ui.m_2wkjj4'),
      address:supplier.address||this.t('ui.m_2wkjj4'),
      status:supplier.is_active?this.t('ui.m_sjpv56'):this.t('ui.m_1200s7g'),
    },
  })); }

  async createSupplier(): Promise<void> {
    if (!this.supplierName.trim()) return;
    const requestContext = this.supplierRequestContext();
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.workspaceId) return;
    const businessId = requestContext.workspaceId;
    this.beginAction();
    this.suppliersLoading = true;
    try {
      await this.api.createSupplier(businessId, {
        name: this.supplierName.trim(),
        email: this.supplierEmail.trim() || undefined,
        phone: this.supplierPhone.trim() || undefined,
        address: this.supplierAddress.trim() || undefined,
      });
      if (this.businessId() !== businessId) return;
      this.noticeMessage = this.t('ui.m_oddjud');
      this.supplierName = '';
      this.supplierEmail = '';
      this.supplierPhone = '';
      this.supplierAddress = '';
      const items = await this.api.suppliers(businessId);
      if (this.businessId() !== businessId) return;
      this.suppliers = items;
    } catch (error) {
      if (this.businessId() === businessId) this.setFailure(error);
    } finally {
      if (this.businessId() === businessId) this.suppliersLoading = false;
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
