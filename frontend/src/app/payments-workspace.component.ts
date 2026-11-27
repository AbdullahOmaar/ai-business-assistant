// 3A-921 F1c (Clean Code program): the payments tab region,
// extracted from the app shell as a presentational component.
// Zero behavior change: the shell keeps the payment state, the
// mutation guard, the retry vault and createPayment itself; the
// component renders the same section, owns the list search, the
// table shape and the CSV export, and two-way-binds the form
// fields back to the shell, exactly like the invoice detail
// drawer extraction (F1b).
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Customer, Invoice, Payment } from './api.service';
import { LocalizationService } from './localization.service';
import { filterPayments } from './record-filters';
import { buildCsv } from './csv-export';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaRecordTableComponent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';
import { AbaIconComponent } from './shared/ui/aba-icon.component';

@Component({
  selector: 'aba-payments-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaRecordTableComponent, AbaFilterBarComponent, AbaSearchFieldComponent, AbaIconComponent],
  template: `
@if (role !== 'owner') {
  <section abaCard class="panel"><aba-state-message kind="error" [description]="t('ui.m_1ju8ouz')" /></section>
} @else {
  <section abaCard class="panel"><aba-section-header [title]="t('ui.m_3k0fux')" [description]="t('ui.m_cj3m99')">
      <div class="section-actions"><span class="count">{{ filteredPayments.length }} / {{ payments.length }} {{ t('ui.m_1ouah2m') }}</span><button class="secondary" type="button" (click)="exportPaymentsCsv()" [disabled]="!payments.length"><aba-icon name="export" />{{ t('ui.m_nbsw3y') }}</button><button class="secondary" type="button" (click)="showPaymentFormChange.emit(!showPaymentForm)" [disabled]="paymentRetryPending">{{ showPaymentForm ? t('ui.m_pw64as') : t('ui.m_3k0fux') }}</button></div>
    </aba-section-header>
    @if (showPaymentForm || paymentRetryPending) {
    <form #paymentForm="ngForm" class="inline-form payment-form" (ngSubmit)="(paymentRetryPending || paymentForm.valid) && createRequest.emit()">
      <select #paymentCustomerModel="ngModel" [attr.aria-label]="t('ui.m_edaho8')" name="paymentCustomer" required [(ngModel)]="paymentCustomerId" (ngModelChange)="paymentCustomerIdChange.emit($event)" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'payment-customer-error' : null"><option value="" disabled>{{ t('ui.m_p0vza7') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select>@if (paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted)) { <small id="payment-customer-error" class="field-error" aria-live="polite">{{ t('ui.m_5b5dll') }}</small> }
      <input #paymentAmountModel="ngModel" [attr.aria-label]="t('ui.m_q9mxbb')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_1smcjxm')" required [(ngModel)]="paymentAmount" (ngModelChange)="paymentAmountChange.emit($event)" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'payment-amount-error' : null">@if (paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted)) { <small id="payment-amount-error" class="field-error" aria-live="polite">{{ t('ui.m_me0lkl') }}</small> }
      <select [attr.aria-label]="t('ui.m_h7ngs9')" name="paymentMethod" [(ngModel)]="paymentMethod" (ngModelChange)="paymentMethodChange.emit($event)" [disabled]="paymentRetryPending"><option value="cash">{{ t('ui.m_1xk4i7j') }}</option><option value="bank_transfer">{{ t('ui.m_bof380') }}</option><option value="card">{{ t('ui.m_tq9n36') }}</option><option value="wallet">{{ t('ui.m_1bho9og') }}</option><option value="other">{{ t('ui.m_47rh1w') }}</option></select>
      <select [attr.aria-label]="t('ui.m_vkei9c')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId" [disabled]="paymentRetryPending" (ngModelChange)="paymentInvoiceIdChange.emit($event); invoiceSelectionChange.emit()"><option value="">{{ t('ui.m_1xrgrqj') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
      @if (invoicesHasMore) { <button type="button" class="secondary" (click)="loadMoreInvoicesRequest.emit()" [disabled]="invoicesLoadingMore || paymentRetryPending">{{ invoicesLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_14d2jh7') }}</button> }
      @if (paymentInvoiceId) { <input [attr.aria-label]="t('ui.m_lc0rf5')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_1okokqi')" [(ngModel)]="paymentAllocationAmount" (ngModelChange)="paymentAllocationAmountChange.emit($event)" [disabled]="paymentRetryPending"> }
      <input [attr.aria-label]="t('ui.m_15jj1na')" name="paymentReference" maxlength="128" [placeholder]="t('ui.m_v160u1')" [(ngModel)]="paymentReference" (ngModelChange)="paymentReferenceChange.emit($event)" [disabled]="paymentRetryPending">
      <button class="primary" type="submit" [disabled]="paymentLoading">{{ paymentLoading ? t('ui.m_1ty0fxd') : paymentRetryPending ? t('ui.m_1pvlpdc') : t('ui.m_3k0fux') }}</button>
    </form>
    }
    @if (paymentRetryPending) { <p class="footnote" role="status">{{ t('ui.m_1yhgb5f') }}</p> }
    @if (paymentMessage) { <aba-state-message [kind]="paymentMessageKind" [description]="paymentMessage" /> }
    <p class="footnote">{{ t('ui.m_1c93fyv') }} {{ currencyCode }} {{ t('ui.m_1sweklr') }}</p>
    <div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="paymentSearch" [hasActiveFilter]="paymentSearch.trim() !== ''" (clear)="paymentSearch = ''; paymentSearchChange.emit('')"><aba-search-field name="paymentSearch" [ariaLabel]="t('ui.m_nmj0be')" [placeholder]="t('ui.m_hoei9y')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="paymentSearch" (ngModelChange)="paymentSearchChange.emit($event)" /></aba-filter-bar></div>
    <aba-record-table [ariaLabel]="t('ui.m_mxsp4b')" [columns]="paymentTableColumns" [rows]="paymentTableRows" [loading]="paymentLoading && !payments.length" [loadingDescription]="t('ui.m_1kn1f7h')" [emptyTitle]="t('ui.m_1c2srea')" [emptyDescription]="paymentSearch.trim() ? t('ui.m_1igz78g') : t('ui.m_1nttjd')" />
    @if (paymentsHasMore) { <button class="secondary" type="button" (click)="loadMorePaymentsRequest.emit()" [disabled]="paymentsLoadingMore">{{ paymentsLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_1olqej1') }}</button> }
  </section>
}
  `,
  styles: [`
.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}
  `],
})
export class PaymentsWorkspaceComponent {
  @Input() role: string | null | undefined = undefined;
  @Input() currencyCode = '';
  @Input() customers: Customer[] = [];
  @Input() invoices: Invoice[] = [];
  @Input() invoicesHasMore = false;
  @Input() invoicesLoadingMore = false;
  @Input() payments: Payment[] = [];
  @Input() paymentsHasMore = false;
  @Input() paymentsLoadingMore = false;
  @Input() paymentLoading = false;
  @Input() paymentRetryPending = false;
  @Input() paymentMessage = '';
  @Input() paymentMessageKind: 'info' | 'success' | 'warning' | 'error' = 'info';
  @Input() showPaymentForm = false;
  @Input() paymentCustomerId = '';
  @Input() paymentAmount: string | number = '';
  @Input() paymentAllocationAmount: string | number = '';
  @Input() paymentInvoiceId = '';
  @Input() paymentMethod = 'cash';
  @Input() paymentReference = '';
  @Input() paymentSearch = '';

  @Output() showPaymentFormChange = new EventEmitter<boolean>();
  @Output() paymentCustomerIdChange = new EventEmitter<string>();
  @Output() paymentAmountChange = new EventEmitter<string | number>();
  @Output() paymentAllocationAmountChange = new EventEmitter<string | number>();
  @Output() paymentInvoiceIdChange = new EventEmitter<string>();
  @Output() paymentMethodChange = new EventEmitter<string>();
  @Output() paymentReferenceChange = new EventEmitter<string>();
  @Output() paymentSearchChange = new EventEmitter<string>();
  @Output() invoiceSelectionChange = new EventEmitter<void>();
  @Output() createRequest = new EventEmitter<void>();
  @Output() loadMorePaymentsRequest = new EventEmitter<void>();
  @Output() loadMoreInvoicesRequest = new EventEmitter<void>();

  private readonly localization = inject(LocalizationService);

  get filteredPayments(): Payment[] {
    return filterPayments(
      this.payments,
      this.paymentSearch,
      id => this.customerNameForInvoice(id),
      method => this.paymentMethodLabel(method),
      allocated => this.t(allocated ? 'app.paymentAllocation.allocated' : 'app.paymentAllocation.unallocated'),
      this.localization.locale,
    );
  }

  get paymentTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'customer',label:this.t('ui.m_ubgrc2'),primary:true},
    {key:'amount',label:this.t('ui.m_i3lh6b'),kind:'numeric'},
    {key:'received',label:this.t('ui.m_10i3wh4')},
    {key:'method',label:this.t('ui.m_nic0dr')},
    {key:'reference',label:this.t('ui.m_eimrhe')},
    {key:'allocation',label:this.t('ui.m_1s2dqci'),kind:'status'},
  ]; }
  get paymentTableRows(): readonly AbaRecordTableRow[] { return this.filteredPayments.map(item=>({id:item.id,cells:{
    customer:this.customerNameForInvoice(item.customer_id),amount:`${item.amount} ${item.currency_code}`,
    received:this.formatRecordDate(item.received_at),method:item.method?this.paymentMethodLabel(item.method):this.t('ui.m_1q43mlw'),
    reference:item.reference||'—',allocation:item.allocations.length?`${item.allocations.length} ${this.t('ui.m_3fih4j')}`:this.t('ui.m_lcn3j8'),
  }})); }

  customerNameForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('ui.m_f2sjwn');
    return this.customers.find(customer => customer.id === customerId)?.name
      || this.t('ui.m_30i7q4');
  }

  paymentMethodLabel(method: string): string {
    const keys: Record<string, string> = {
      cash: 'app.paymentMethod.cash', bank_transfer: 'app.paymentMethod.bank_transfer',
      card: 'app.paymentMethod.card', wallet: 'app.paymentMethod.wallet', other: 'app.paymentMethod.other',
    };
    return keys[method] ? this.t(keys[method]) : method;
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

  exportPaymentsCsv(): void {
    if (this.role !== 'owner' || !this.payments.length) return;
    const headers = ['received_at', 'amount', 'currency_code', 'method', 'reference', 'allocation_count'];
    const rows = this.payments.map(payment => [
      payment.received_at,
      payment.amount,
      payment.currency_code,
      payment.method || '',
      payment.reference || '',
      payment.allocations.length,
    ]);
    const csv = buildCsv(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'payments-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
