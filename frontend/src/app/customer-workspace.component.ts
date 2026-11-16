import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ApiService, type Customer } from './api.service';
import type { CustomerEditorValue } from './customer-editor.component';
import { CustomerDirectoryComponent } from './customer-directory.component';
import { CustomerEditorComponent } from './customer-editor.component';
import { CustomerProfileComponent } from './customer-profile.component';
import type { AbaRecordTableActionEvent } from './shared/ui/aba-record-table.component';
import { WorkspaceLoadGuard } from './workspace-load-guard';
import { LocalizationService } from './localization.service';

type CustomerWorkspaceContext = { businessId: string; userId: string; role: 'owner' | 'staff' };

/** Complete, shell-independent customer list/detail/create/edit workflow for the workspace host. */
@Component({
  selector: 'aba-customer-workspace',
  standalone: true,
  imports: [CustomerDirectoryComponent, CustomerEditorComponent, CustomerProfileComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="customer-workspace" aria-label="Customer workspace">
      @if (mode() === 'list') {
        <header class="customer-workspace__toolbar">
          <form class="customer-workspace__search" role="search" (submit)="submitSearch($event)">
            <label class="customer-workspace__sr-only" for="customer-workspace-search">{{ t('customerWorkspace.searchPlaceholder') }}</label>
            <input id="customer-workspace-search" type="search" maxlength="120" autocomplete="off"
              [value]="searchDraft()" (input)="searchDraft.set(readValue($event))"
              [placeholder]="t('customerWorkspace.searchPlaceholder')">
            <button type="submit" [disabled]="loading()">{{ t('customerWorkspace.search') }}</button>
          </form>
          <button class="customer-workspace__create" type="button" (click)="createCustomer()">{{ t('customerWorkspace.newCustomer') }}</button>
        </header>
        <aba-customer-directory
          [ariaLabel]="t('customerWorkspace.directory')"
          [customers]="customers()"
          [locale]="locale()"
          [loading]="loading()"
          [error]="error()"
          (retry)="retry()"
          [emptyTitle]="t('customerProfile.emptyTitle')"
          [emptyDescription]="t('customerWorkspace.emptyDescription')"
          (rowAction)="handleRowAction($event)"
          (select)="openCustomer($event)" />
        @if (hasMore() && !error()) {
          <button class="customer-workspace__load-more" type="button" [disabled]="loading()" (click)="loadMore()" [attr.aria-live]="'polite'">
            {{ loadingMore() ? t('ui.m_1dwk1vm') : t('ui.m_iziq6h') }}
          </button>
        }
      } @else if (mode() === 'create' || mode() === 'edit') {
        <aba-customer-editor
          [customer]="mode() === 'edit' ? selectedCustomer() : null"
          [busy]="saving()"
          [error]="editorError()"
          (save)="saveCustomer($event)"
          (cancel)="cancelEditor()" />
      } @else {
        <button class="customer-workspace__back" type="button" (click)="backToDirectory()">{{ t('customerWorkspace.back') }}</button>
        <aba-customer-profile
          [customer]="selectedCustomer()"
          [loading]="detailLoading()"
          [error]="detailError()"
          (retry)="retryProfile()"
          (edit)="editCustomer()"
          (invoices)="openInvoices()"
          (statement)="openStatement()" />
      }
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}.customer-workspace{display:grid;gap:12px;min-width:0}
    .customer-workspace__toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
    .customer-workspace__search{display:flex;flex:1;gap:7px;min-width:0}
    .customer-workspace__search input{box-sizing:border-box;flex:1;min-width:0;min-height:44px;padding:9px 12px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:10px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:13px}
    .customer-workspace button{min-height:44px;padding:8px 13px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:10px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:12px;font-weight:750;cursor:pointer}
    .customer-workspace__search button,.customer-workspace__create{border-color:var(--aiba-brand,#0f766e)!important;background:var(--aiba-brand,#0f766e)!important;color:#fff!important}
    .customer-workspace__load-more{justify-self:center;min-width:min(100%,220px)}
    .customer-workspace__back{justify-self:start}
    .customer-workspace button:disabled{opacity:.55;cursor:wait}
    .customer-workspace :is(button,input):focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    .customer-workspace__sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
    @media(max-width:520px){.customer-workspace__toolbar{align-items:stretch;flex-direction:column}.customer-workspace__create{width:100%}.customer-workspace__search{width:100%}}
    @media(forced-colors:active){.customer-workspace button,.customer-workspace input{border:1px solid CanvasText}.customer-workspace :is(button,input):focus-visible{outline-color:Highlight}}
  `],
})
export class CustomerWorkspaceComponent {
  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly listGuard = new WorkspaceLoadGuard();
  private readonly detailGuard = new WorkspaceLoadGuard();
  private readonly saveGuard = new WorkspaceLoadGuard();

  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input.required<'owner' | 'staff'>();
  readonly locale = input<'ar' | 'en'>('ar');
  readonly invoicesRequested = output<string>();
  readonly statementRequested = output<string>();

  readonly mode = signal<'list' | 'profile' | 'create' | 'edit'>('list');
  readonly customers = signal<Customer[]>([]);
  readonly selectedCustomer = signal<Customer | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly detailLoading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly editorError = signal('');
  readonly hasMore = signal(false);
  readonly searchDraft = signal('');
  private offset = 0;
  private searchQuery = '';
  private readonly pageSize = 100;
  private selectedCustomerId: string | null = null;

  constructor() {
    effect(() => {
      const context = this.context();
      untracked(() => {
        this.listGuard.invalidate();
        this.detailGuard.invalidate();
        this.saveGuard.invalidate();
        this.customers.set([]);
        this.selectedCustomer.set(null);
        this.selectedCustomerId = null;
        this.offset = 0;
        this.hasMore.set(false);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.detailLoading.set(false);
        this.saving.set(false);
        this.mode.set('list');
        this.error.set('');
        this.detailError.set('');
        this.editorError.set('');
        if (context.businessId && context.userId) void this.loadCustomers(true);
      });
    });
  }

  t(key: string): string { return this.localization.translate(key); }
  readValue(event: Event): string { return (event.currentTarget as HTMLInputElement | null)?.value ?? ''; }

  private context(): CustomerWorkspaceContext {
    return { businessId: this.businessId(), userId: this.userId(), role: this.role() };
  }

  private isCurrent(guard: WorkspaceLoadGuard, version: number, requested: CustomerWorkspaceContext): boolean {
    const current = this.context();
    return guard.isCurrent(version, current.businessId, requested.businessId)
      && current.userId === requested.userId && current.role === requested.role;
  }

  async loadCustomers(reset = false): Promise<void> {
    const requested = this.context();
    if (!requested.businessId || !requested.userId) return;
    const version = this.listGuard.begin();
    if (reset) {
      this.offset = 0;
      this.customers.set([]);
      this.hasMore.set(false);
    }
    this.loading.set(true);
    this.loadingMore.set(!reset);
    this.error.set('');
    try {
      const records = await this.api.customers(requested.businessId, this.offset, this.pageSize, this.searchQuery);
      if (!this.isCurrent(this.listGuard, version, requested)) return;
      const combined = reset ? records : [...this.customers(), ...records];
      const unique = new Map<string, Customer>();
      for (const record of combined) unique.set(record.id, record);
      this.customers.set([...unique.values()]);
      this.offset = reset ? records.length : this.offset + records.length;
      this.hasMore.set(records.length === this.pageSize);
    } catch {
      if (this.isCurrent(this.listGuard, version, requested)) this.error.set(this.t('customerWorkspace.loadError'));
    } finally {
      if (this.isCurrent(this.listGuard, version, requested)) {
        this.loading.set(false);
        this.loadingMore.set(false);
      }
    }
  }

  submitSearch(event: Event): void {
    event.preventDefault();
    this.searchQuery = this.searchDraft().trim().slice(0, 120);
    void this.loadCustomers(true);
  }

  loadMore(): void { if (this.hasMore() && !this.loading()) void this.loadCustomers(false); }
  retry(): void { void this.loadCustomers(true); }
  createCustomer(): void {
    this.selectedCustomer.set(null);
    this.selectedCustomerId = null;
    this.editorError.set('');
    this.mode.set('create');
  }

  async openCustomer(customerId: string): Promise<void> {
    const requested = this.context();
    const version = this.detailGuard.begin();
    this.selectedCustomerId = customerId;
    this.selectedCustomer.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    this.mode.set('profile');
    try {
      const record = await this.api.customer(requested.businessId, customerId);
      if (!this.isCurrent(this.detailGuard, version, requested) || this.selectedCustomerId !== customerId) return;
      this.selectedCustomer.set(record);
    } catch {
      if (this.isCurrent(this.detailGuard, version, requested) && this.selectedCustomerId === customerId) {
        this.detailError.set(this.t('customerWorkspace.profileError'));
      }
    } finally {
      if (this.isCurrent(this.detailGuard, version, requested) && this.selectedCustomerId === customerId) this.detailLoading.set(false);
    }
  }

  editCustomer(): void {
    if (!this.selectedCustomer()) return;
    this.editorError.set('');
    this.mode.set('edit');
  }

  async saveCustomer(value: CustomerEditorValue): Promise<void> {
    const requested = this.context();
    const editingId = this.mode() === 'edit' ? this.selectedCustomerId : null;
    const version = this.saveGuard.begin();
    this.saving.set(true);
    this.editorError.set('');
    try {
      const record = editingId
        ? await this.api.updateCustomer(requested.businessId, editingId, value)
        : await this.api.createCustomer(requested.businessId, value);
      if (!this.isCurrent(this.saveGuard, version, requested)) return;
      this.selectedCustomer.set(record);
      this.selectedCustomerId = record.id;
      this.customers.update(rows => {
        const exists = rows.some(row => row.id === record.id);
        return exists ? rows.map(row => row.id === record.id ? record : row) : [record, ...rows];
      });
      this.mode.set('profile');
    } catch {
      if (this.isCurrent(this.saveGuard, version, requested)) this.editorError.set(this.t('customerWorkspace.saveError'));
    } finally {
      if (this.isCurrent(this.saveGuard, version, requested)) this.saving.set(false);
    }
  }

  cancelEditor(): void {
    this.editorError.set('');
    if (this.mode() === 'edit' && this.selectedCustomerId) this.mode.set('profile');
    else this.mode.set('list');
  }

  backToDirectory(): void {
    this.detailGuard.invalidate();
    this.detailLoading.set(false);
    this.detailError.set('');
    this.mode.set('list');
  }

  retryProfile(): void { if (this.selectedCustomerId) void this.openCustomer(this.selectedCustomerId); }
  openInvoices(): void { if (this.selectedCustomerId) this.invoicesRequested.emit(this.selectedCustomerId); }
  openStatement(): void { if (this.selectedCustomerId) this.statementRequested.emit(this.selectedCustomerId); }

  handleRowAction(event: AbaRecordTableActionEvent): void {
    if (event.actionId === 'invoices') this.invoicesRequested.emit(event.rowId);
    if (event.actionId === 'statement') this.statementRequested.emit(event.rowId);
  }
}
