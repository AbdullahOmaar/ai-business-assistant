import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocalizationService } from './localization.service';
import type { AuditEvent } from './api.service';
import { AbaRecordTableComponent } from './shared/ui/aba-record-table.component';
import type { AbaRecordTableColumn, AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaIconComponent } from './shared/ui/aba-icon.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { auditActionLabel, auditTargetLabel } from './audit-labels';

@Component({
  selector: 'aba-audit-events-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AbaCardComponent,
    AbaSectionHeaderComponent,
    AbaRecordTableComponent,
    AbaStateMessageComponent,
    AbaIconComponent,
    AbaFilterBarComponent,
  ],
  template: `
    <section abaCard class="audit-panel">
      <aba-section-header [title]="t('ui.m_hd46sj')" [description]="t('ui.m_fie4u1')">
        <span class="count">{{ total }} {{ t('ui.m_187o97') }}</span>
      </aba-section-header>
      <form class="audit-filter-form" (ngSubmit)="loadPage.emit(0)">
        <aba-filter-bar variant="selects" [foldExtras]="true" [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [hasActiveFilter]="!!(action || targetType)" [filterSummary]="filterSummaryText" (clear)="resetFilters()">
          <div filterExtras class="audit-filters">
        <label>{{ t('ui.m_16u0xte') }}
          <select name="auditAction" [ngModel]="action" (ngModelChange)="actionChange.emit($event)">
            <option value="">{{ t('ui.m_s5wvrw') }}</option>
            <option value="invoice.issued">{{ t('ui.m_1dgwo7k') }}</option>
            <option value="invoice.created">{{ t('ui.m_s89hy1') }}</option>
            <option value="invoice.draft_updated">{{ t('ui.m_1h1mtay') }}</option>
            <option value="invoice.voided">{{ t('ui.m_1b7zju0') }}</option>
            <option value="payment.recorded">{{ t('ui.m_1fzpn4c') }}</option>
            <option value="expense.created">{{ t('ui.m_1eswv36') }}</option>
            <option value="customer.created">{{ t('ui.m_7ayrnh') }}</option>
            <option value="product.created">{{ t('ui.m_w0ko2p') }}</option>
            <option value="stock.movement_recorded">{{ t('ui.m_1jl8qoq') }}</option>
            <option value="supplier.created">{{ t('ui.m_n1vp0a') }}</option>
            <option value="customer.updated">{{ t('ui.m_1j81wf0') }}</option>
            <option value="customer.deactivated">{{ t('ui.m_11zlj4h') }}</option>
            <option value="product.updated">{{ t('ui.m_bu5930') }}</option>
            <option value="product.deactivated">{{ t('ui.m_8y4ee1') }}</option>
            <option value="purchase_order.created">{{ t('ui.m_1ghnskj') }}</option>
            <option value="purchase_order.approved">{{ t('ui.m_xyjlem') }}</option>
            <option value="purchase_order.received">{{ t('ui.m_5cn0in') }}</option>
            <option value="sales_return.created">{{ t('ui.m_6u7t2s') }}</option>
            <option value="sales_return.approved">{{ t('ui.m_kb0bxp') }}</option>
            <option value="recurring_invoice_schedule.created">{{ t('ui.m_xaohcb') }}</option>
            <option value="data_import.completed">{{ t('ui.m_rs4k6j') }}</option>
            <option value="pricing_rule.created">{{ t('ui.m_yytv5x') }}</option>
            <option value="employee.created">{{ t('audit.actions.m_5gb65j') }}</option>
            <option value="employee.updated">{{ t('audit.actions.m_s6fn06') }}</option>
            <option value="payroll.created">{{ t('audit.actions.m_9py368') }}</option>
            <option value="payroll.updated">{{ t('audit.actions.m_fwgers') }}</option>
            <option value="payroll.approved">{{ t('audit.actions.m_471o6f') }}</option>
            <option value="payroll.paid">{{ t('audit.actions.m_a3700r') }}</option>
            <option value="membership.role_changed">{{ t('audit.actions.m_l1k3nf') }}</option>
            <option value="membership.removed">{{ t('audit.actions.m_1tlmi9r') }}</option>
            <option value="notification.queued">{{ t('audit.actions.m_13n1z3d') }}</option>
            <option value="platform.business.activated">{{ t('audit.actions.m_1yeuyii') }}</option>
            <option value="platform.business.deactivated">{{ t('audit.actions.m_19x7oma') }}</option>
            <option value="platform.user_role.granted">{{ t('audit.actions.m_1g5x0l2') }}</option>
            <option value="platform.user_role.revoked">{{ t('audit.actions.m_1a0g454') }}</option>
          </select>
        </label>
        <label>{{ t('ui.m_1bu5iqp') }}
          <select name="auditTarget" [ngModel]="targetType" (ngModelChange)="targetTypeChange.emit($event)">
            <option value="">{{ t('ui.m_1c69yfk') }}</option>
            <option value="invoice">{{ t('ui.m_1nfhuv2') }}</option>
            <option value="payment">{{ t('ui.m_p9fxzd') }}</option>
            <option value="expense">{{ t('ui.m_q7obp1') }}</option>
            <option value="customer">{{ t('ui.m_1uow5er') }}</option>
            <option value="product">{{ t('ui.m_13rez2z') }}</option>
            <option value="business">{{ t('ui.m_1evo6p1') }}</option>
            <option value="supplier">{{ t('ui.m_1ec9f70') }}</option>
            <option value="stock_movement">{{ t('ui.m_1yixbf5') }}</option>
            <option value="purchase_order">{{ t('ui.m_zu2vq6') }}</option>
            <option value="sales_return">{{ t('ui.m_1b010yp') }}</option>
            <option value="recurring_invoice_schedule">{{ t('ui.m_3pds34') }}</option>
            <option value="import_job">{{ t('ui.m_g2eok7') }}</option>
            <option value="pricing_rule">{{ t('ui.m_9ckn2u') }}</option>
            <option value="employee">{{ t('audit.targets.m_13tf6tx') }}</option>
            <option value="payroll">{{ t('audit.targets.m_xby7uc') }}</option>
            <option value="business_membership">{{ t('audit.targets.m_1ygj3zy') }}</option>
            <option value="membership">{{ t('audit.targets.m_5zgvw5') }}</option>
            <option value="notification">{{ t('audit.targets.m_1cj9t7u') }}</option>
          </select>
        </label>
        <button class="primary audit-filter-submit" type="submit" [disabled]="loading" [attr.aria-label]="t('ui.m_agqz0i')"><aba-icon name="check" /></button>
          </div>
        </aba-filter-bar>
      </form>
      @if (error) { <aba-state-message kind="error" [description]="error" /> }
      <aba-record-table
        [ariaLabel]="t('ui.m_j3pe5o')"
        [columns]="columns"
        [rows]="rows"
        [loading]="loading && !events.length"
        [loadingDescription]="t('ui.m_19p9gnl')"
        [emptyTitle]="t('ui.m_1en86jm')"
        [emptyDescription]="t('ui.m_1f0oymq')" />
      <div class="audit-pagination">
        <span>{{ offset + 1 }}–{{ offset + events.length }} / {{ total }}</span>
        <div class="pagination-actions">
          <button class="secondary" type="button" (click)="loadPage.emit(offset > 50 ? offset - 50 : 0)"
            [disabled]="loading || offset === 0">{{ t('ui.m_14wy3hz') }}</button>
          <button class="secondary" type="button" (click)="loadPage.emit(offset + 50)"
            [disabled]="loading || offset + events.length >= total">{{ t('ui.m_thb9eg') }}</button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .audit-panel{display:grid;gap:16px}
    .audit-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) auto;gap:9px;align-items:end;padding:14px;background:var(--aba-color-surface-subtle,#f8fafc);border:1px solid var(--aba-color-border,#edf0f5);border-radius:11px}
    .audit-filters label{display:grid;gap:7px;min-width:0;font-size:12px;font-weight:700;color:var(--aba-color-text-secondary,#374151)}
    .audit-filters select{width:100%;min-width:0;padding:11px 12px;border:1px solid var(--aba-color-border,#d1d5db);border-radius:11px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#111827);font:inherit}
    .audit-filter-submit{display:inline-grid;place-items:center;min-width:44px;min-height:44px;padding:0}
    .count{font-size:10px;font-weight:700;color:var(--aba-color-primary,#0f766e);background:var(--aba-color-primary-soft,#ecfdf5);padding:7px 9px;border-radius:999px;white-space:nowrap}
    .audit-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;color:var(--aba-color-text-tertiary,#6b7280);font-size:12px}
    .pagination-actions{display:flex;gap:8px;flex-wrap:wrap}
    .pagination-actions button{min-height:44px}
    @media(max-width:760px){.audit-filters{grid-template-columns:minmax(0,1fr)}.audit-pagination{align-items:stretch}.pagination-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.pagination-actions button{min-height:44px}}
  `],
})
export class AuditEventsWorkspaceComponent {
  @Input() total = 0;
  @Input() offset = 0;
  @Input() events: readonly AuditEvent[] = [];
  @Input() loading = false;
  @Input() error = '';
  @Input() action = '';
  @Input() targetType = '';
  @Input() columns: readonly AbaRecordTableColumn[] = [];
  @Input() rows: readonly AbaRecordTableRow[] = [];

  @Output() actionChange = new EventEmitter<string>();
  @Output() targetTypeChange = new EventEmitter<string>();
  @Output() loadPage = new EventEmitter<number>();

  constructor(private readonly localization: LocalizationService) {}

  t(key: string): string {
    return this.localization.translate(key);
  }

  // 3A-699 (U16/G1): the bar's details row names the active filter with the
  // same localized labels the rows use, so the folded state stays readable.
  get filterSummaryText(): string {
    const parts: string[] = [];
    if (this.action) parts.push(this.t(auditActionLabel(this.action)));
    if (this.targetType) parts.push(this.t(auditTargetLabel(this.targetType)));
    return parts.join(' · ');
  }

  resetFilters(): void {
    this.actionChange.emit('');
    this.targetTypeChange.emit('');
    this.loadPage.emit(0);
  }
}
