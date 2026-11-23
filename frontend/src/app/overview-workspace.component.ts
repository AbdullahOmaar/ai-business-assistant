// 3A-351: the Home (overview) tab, extracted verbatim from the app shell
// as a presentation workspace component so it loads only when the tab is
// opened. The shell keeps owning the dashboard data (it loads it in
// loadWorkspaceData and refreshes it after payroll/invoice flows) and passes
// it down; this component only renders it. Navigation and creation actions
// are outputs back to the shell (navigate / newInvoiceDraft / newCustomer /
// newProduct / invitationsAccepted), and the role-filtered module catalogue
// is computed here from the shared canAccessWorkspaceTab helper, mirroring
// the shell's homeModuleCards getter (the shell keeps its own copy for the
// mobile More menu and the primary navigation). The module-directory search
// state moved with the template; the overview-only layout rules moved into
// this component's styles.
// 3A-650: the .metric-grid rules are defined in this component's styles too.
// The 3A-351 note above assumed the shell's copy would apply, but shell CSS
// cannot cross this component's view-encapsulation boundary, so the KPI
// cards stacked one per row at every width (owner review 2026-11-23). The
// shell keeps its own .metric-grid copy for the grids still rendered inside
// the shell template itself.
import { Component, EventEmitter, inject, input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Dashboard } from './api.service';
import { LocalizationService } from './localization.service';
import { canAccessWorkspaceTab, type WorkspaceModuleTab } from './module-access';
import {
  filterWorkspaceModules,
  selectHomeQuickAccessModules,
  WORKSPACE_MODULE_CATALOG,
  type WorkspaceModuleCard,
} from './workspace-module-catalog';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaMetricCardComponent } from './shared/ui/aba-metric-card.component';
import { AbaSkeletonComponent } from './shared/ui/aba-skeleton.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';
import { AbaQuickAccessCardComponent } from './shared/ui/aba-quick-access-card.component';
import { WorkspaceInvitationsComponent } from './workspace-invitations.component';

@Component({
  selector: 'aba-overview-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaMetricCardComponent, AbaSkeletonComponent, AbaSearchFieldComponent, AbaQuickAccessCardComponent, WorkspaceInvitationsComponent],
  template: `
  <aba-workspace-invitations mode="accept" [businessId]="businessId()" [language]="language()" (accepted)="invitationsAccepted.emit()" />

  @if (dashboard(); as dash) {
    <section class="dashboard-period" [attr.aria-label]="t('ui.m_14yh7ls')">
      <div class="dashboard-period__heading">
        <h2 class="dashboard-period__title">{{ t('ui.m_1wch2zm') }}</h2>
        <strong>{{ t('ui.m_1ql1fm2') }}</strong>
      </div>
      <div class="dashboard-period__details">
        <span>{{ t('ui.m_15qcbwy') }} <bdi dir="ltr">{{ dash.period.start_date || '—' }}</bdi> {{ t('ui.m_8f9vz0') }} <bdi dir="ltr">{{ dash.period.end_date || '—' }}</bdi></span>
        <span>{{ t('ui.m_j805b6') }}: <bdi>{{ dash.period.timezone || '—' }}</bdi></span>
      </div>
    </section>
    <section class="metric-grid" [attr.aria-label]="t('ui.m_1gk81ud')">
      <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_fnf54u')" (click)="navigate.emit('invoices')" (keydown.enter)="navigate.emit('invoices')" (keydown.space)="$event.preventDefault(); navigate.emit('invoices')"><span metricLabel>{{ t('ui.m_fnf54u') }}</span>
        @for (item of dash.invoiced_sales; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('ui.m_18n4mlp') }}</small> } @if (!dash.invoiced_sales.length) { <strong>—</strong><small>{{ t('ui.m_e17yyr') }}</small> }<small class="metric-basis">{{ t('ui.m_zszhha') }}</small></aba-metric-card>
      <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_1ukns6h')" (click)="navigate.emit('payments')" (keydown.enter)="navigate.emit('payments')" (keydown.space)="$event.preventDefault(); navigate.emit('payments')"><span metricLabel>{{ t('ui.m_1ukns6h') }}</span>
        @for (item of dash.collected_payments; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('ui.m_1dedwxn') }}</small> } @if (!dash.collected_payments.length) { <strong>—</strong><small>{{ t('ui.m_5s5eo') }}</small> }<small class="metric-basis">{{ t('ui.m_nbfv39') }}</small></aba-metric-card>
      <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_l71hva')" (click)="navigate.emit('expenses')" (keydown.enter)="navigate.emit('expenses')" (keydown.space)="$event.preventDefault(); navigate.emit('expenses')"><span metricLabel>{{ t('ui.m_l71hva') }}</span>
        @for (item of dash.expenses; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('ui.m_jgq8i') }}</small> } @if (!dash.expenses.length) { <strong>—</strong><small>{{ t('ui.m_53hyf8') }}</small> }<small class="metric-basis">{{ t('ui.m_1mhn6p1') }}</small></aba-metric-card>
      <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_v5uwri')" (click)="navigate.emit('invoices')" (keydown.enter)="navigate.emit('invoices')" (keydown.space)="$event.preventDefault(); navigate.emit('invoices')"><span metricLabel>{{ t('ui.m_v5uwri') }}</span>
        @for (item of dash.outstanding_balances; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small class="metric-basis">{{ t('ui.m_1wagqaw') }}</small> } @if (!dash.outstanding_balances.length) { <strong>—</strong><small>{{ t('ui.m_1k06qyq') }}</small> }</aba-metric-card>
    </section>
    <section class="dashboard-actions" [attr.aria-label]="t('ui.m_1423muo')">
      @if (canAccessTab('invoices')) {
        <button class="dashboard-action dashboard-action--primary" type="button"
          (click)="navigate.emit('invoices'); newInvoiceDraft.emit()">
          <span class="dashboard-action__icon" aria-hidden="true">＋</span>
          <span class="dashboard-action__copy">
            <strong>{{ t('ui.m_12vszs4') }}</strong>
            <small>{{ t('ui.m_61q6l7') }}</small>
          </span>
          <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
        </button>
      }
      @if (canAccessTab('expenses')) {
        <button class="dashboard-action" type="button" (click)="navigate.emit('expenses')">
          <span class="dashboard-action__icon" aria-hidden="true">＋</span>
          <span class="dashboard-action__copy">
            <strong>{{ t('ui.m_p4p38y') }}</strong>
            <small>{{ t('ui.m_ehnfke') }}</small>
          </span>
          <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
        </button>
      }
      @if (canAccessTab('customers')) {
        <button class="dashboard-action" type="button" (click)="navigate.emit('customers'); newCustomer.emit()">
          <span class="dashboard-action__icon" aria-hidden="true">＋</span>
          <span class="dashboard-action__copy">
            <strong>{{ t('ui.m_1yvcfg6') }}</strong>
            <small>{{ t('ui.m_15gmqko') }}</small>
          </span>
          <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
        </button>
      }
      @if (canAccessTab('products')) {
        <button class="dashboard-action" type="button" (click)="navigate.emit('products'); newProduct.emit()">
          <span class="dashboard-action__icon" aria-hidden="true">＋</span>
          <span class="dashboard-action__copy">
            <strong>{{ t('ui.m_1nbakc8') }}</strong>
            <small>{{ t('ui.m_snu8sb') }}</small>
          </span>
          <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
        </button>
      }
    </section>
    <section class="notice dashboard-trust-note" role="note"><strong>{{ t('ui.m_lgrza4') }}</strong><span>{{ t('ui.m_1yfmgqi') }}</span></section>
  } @else if (loading()) {
    <aba-skeleton variant="detail" [title]="t('ui.m_1wch2zm')" [subtitle]="t('ui.m_1ql1fm2')" />
    <section class="metric-grid metric-grid--skeleton" aria-hidden="true">
      <aba-skeleton variant="metric-card" />
      <aba-skeleton variant="metric-card" />
      <aba-skeleton variant="metric-card" />
      <aba-skeleton variant="metric-card" />
    </section>

  } @else if (!error()) {
    <aba-state-message kind="empty" [description]="t('ui.m_1x7j987')" />
  }
  <section abaCard class="panel module-launcher" aria-labelledby="module-launcher-title">
    <aba-section-header [titleId]="'module-launcher-title'" [title]="t('ui.m_1423muo')" [description]="t('ui.m_1srbbxd')" [count]="homeQuickAccessCards.length" />
    <nav class="home-shortcut-list" [attr.aria-label]="t('ui.m_1ufo715')">
      @for (module of homeQuickAccessCards; track module.tab) {
        <button class="home-shortcut-link" type="button" (click)="navigate.emit(module.tab)">
          <span class="home-shortcut-link__icon" aria-hidden="true">{{ module.icon }}</span>
          <span class="home-shortcut-link__label">{{ t(module.titleKey) }}</span>
        </button>
      }
    </nav>
  </section>
  <section abaCard class="panel module-directory" aria-labelledby="module-directory-title">
    <details class="module-directory-disclosure">
      <summary class="module-directory-summary">
        <span class="module-directory-summary__copy">
          <span class="module-directory-summary__title" role="heading" aria-level="2" id="module-directory-title">{{ t('ui.m_1h6gxl7') }}</span>
          <small>{{ t('ui.m_ytvtiu') }}</small>
        </span>
        <span class="count">{{ homeModuleCards.length }}</span>
        <span class="module-directory-toggle" aria-hidden="true">＋</span>
      </summary>
      <aba-search-field class="module-directory-search" name="homeModuleSearch" autocomplete="off"
        [ariaLabel]="t('ui.m_1yd5km1')"
        [placeholder]="t('ui.m_3bdru5')" [placeholderNarrow]="t('ui.m_11ucx5t')"
        [clearLabel]="t('ui.m_4k8q2zr')"
        [(ngModel)]="homeModuleSearch" />
      @if (filteredHomeModuleCards.length) {
      <div class="module-directory-grid">
        @for (module of filteredHomeModuleCards; track module.tab) {
          <aba-quick-access-card
            [icon]="module.icon"
            [title]="t(module.titleKey)"
            [description]="t(module.descriptionKey)"
            (activated)="navigate.emit(module.tab)" />
        }
      </div>
      } @else {
        <p class="module-directory-empty" role="status">{{ t('ui.m_c4eu5t') }}</p>
      }
    </details>
  </section>
  `,
  styles: [`
.dashboard-period{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 18px;margin:0 0 14px;padding:13px 16px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:var(--aba-radius-card,14px);background:var(--aba-color-surface-subtle,#f8fafc)}
.dashboard-period__heading{display:grid;gap:3px;min-width:0}
.dashboard-period__title{margin:0;color:var(--aba-color-text-primary,#172033);font-size:14px;line-height:1.4;font-weight:var(--aba-font-weight-bold,700);overflow-wrap:normal}
.dashboard-period__heading strong{font-size:13px;line-height:1.4;color:var(--aba-color-text-primary,#172033)}
.dashboard-period__details{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;min-width:0;color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.5}
.dashboard-period__details span{overflow-wrap:anywhere}
.dashboard-period__details bdi{font-variant-numeric:tabular-nums;color:var(--aba-color-text-primary,#172033)}
.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:0}
@media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}}
@media(max-width:380px){.metric-grid{gap:7px}}
.metric-grid aba-metric-card small{font-size:12px;line-height:1.55}
.home-shortcut-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;margin-top:15px}
.home-shortcut-link{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;min-width:0;min-height:44px;padding:8px 12px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:var(--aba-radius-control,10px);background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font-size:var(--aba-font-size-base,14px);line-height:var(--aba-line-height-normal,1.5);font-weight:700;text-align:start;cursor:pointer;transition:border-color var(--aba-motion-fast,150ms) var(--aba-easing-standard,ease),background var(--aba-motion-fast,150ms) var(--aba-easing-standard,ease)}
.home-shortcut-link:hover:not(:disabled){border-color:var(--aba-color-primary-border,#99f6e4);background:var(--aba-color-surface-hover,#f1f5f9)}
.home-shortcut-link:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:var(--aba-focus-ring-offset,2px)}
.home-shortcut-link__icon{display:grid;flex:0 0 26px;width:26px;height:26px;place-items:center;border-radius:8px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary,#0f766e);font-size:14px}
.home-shortcut-link__label{min-width:0;overflow-wrap:anywhere}
.module-launcher{margin-top:18px}
.module-directory{margin-top:18px}
.dashboard-trust-note{background:var(--aba-color-surface-subtle,#f8fafc);border-color:var(--aba-color-border,#e5eaf1);color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.65}
.dashboard-trust-note strong{color:var(--aba-color-text-primary,#172033)}
.module-directory-disclosure{display:grid;gap:12px}
.module-directory-summary{display:flex;align-items:center;gap:12px;min-width:0;min-height:44px;cursor:pointer;list-style:none}
.module-directory-summary::-webkit-details-marker{display:none}
.module-directory-summary__copy{display:grid;flex:1;gap:3px;min-width:0}
.module-directory-summary__title{margin:0;color:var(--aba-color-text-primary,#172033);font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.module-directory-summary__copy small{color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.module-directory-toggle{display:grid;flex:0 0 32px;width:32px;height:32px;place-items:center;border-radius:9px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#64748b);font-size:18px;transition:transform var(--aba-motion-fast,150ms) var(--aba-easing-standard,ease)}
.module-directory-disclosure[open] .module-directory-toggle{transform:rotate(45deg)}
.module-directory-search{display:block;min-width:0}
.module-directory-empty{margin:0;padding:14px;border:1px dashed var(--aba-color-border,#e5e7eb);border-radius:10px;color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.6}
.module-directory-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:10px;margin-top:0}
@media(max-width:760px){.home-shortcut-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.home-shortcut-link{width:100%}}
@media(max-width:380px){.home-shortcut-link{gap:6px;padding-inline:7px}.home-shortcut-link__icon{flex-basis:24px;width:24px;height:24px}.module-directory-grid{gap:7px}}
.shell :is(h1,h2,h3,h4,.section-title,.dashboard-period__title){font-family:var(--aiba-font-heading,"Cairo","Tajawal",Inter,"Noto Sans Arabic","Segoe UI",ui-sans-serif,system-ui,sans-serif);letter-spacing:normal}

@media(max-width:360px){.home-shortcut-list{grid-template-columns:minmax(0,1fr)}}
@media(max-width:760px){/* T18 Slice U01 (2026-11-21): remove the mobile duplication — the
   * quick-access launcher repeats destinations already reachable on mobile
   * via the bottom dock (Overview/Invoices/Customers + More) and the
   * module directory below it. Hidden below 760px only; desktop keeps it. */
  .module-launcher{display:none}/* Routine item (A) (2026-11-22, owner direction Nov 20): remove the
   * module-directory search on mobile. display:none (not a visual-only
   * hide) so the field leaves the layout, the accessibility tree and the
   * tab order below 760px; desktop keeps the search. */
  .module-directory-search{display:none}.dashboard-period{gap:7px;margin-block-end:10px;padding:10px 12px;border-radius:12px}.dashboard-period__heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.dashboard-period__title{font-size:13px}.dashboard-period__heading strong{font-size:11px}.dashboard-period__details{gap:5px 9px;font-size:11px;line-height:1.45}.home-shortcut-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-block-start:10px}.home-shortcut-link{min-height:44px;gap:7px;padding:8px 9px;font-size:12px}.home-shortcut-link__icon{flex-basis:28px;width:28px;height:28px;font-size:13px}.module-launcher,.module-directory{margin-block-start:12px}.module-directory-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dashboard-trust-note{display:grid;gap:6px;margin-block-start:10px;padding:10px 12px;font-size:11px;line-height:1.55}.dashboard-trust-note strong{white-space:normal}}
  `],
})
export class OverviewWorkspaceComponent {
  readonly businessId = input<string | null>(null);
  readonly dashboard = input<Dashboard | null>(null);
  readonly loading = input.required<boolean>();
  readonly error = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly platformAdminAvailable = input.required<boolean>();
  readonly language = input.required<'ar' | 'en'>();

  @Output() readonly navigate = new EventEmitter<WorkspaceModuleTab>();
  @Output() readonly newInvoiceDraft = new EventEmitter<void>();
  @Output() readonly newCustomer = new EventEmitter<void>();
  @Output() readonly newProduct = new EventEmitter<void>();
  @Output() readonly invitationsAccepted = new EventEmitter<void>();

  private readonly localization = inject(LocalizationService);

  homeModuleSearch = '';

  get homeModuleCards(): readonly WorkspaceModuleCard[] {
    return WORKSPACE_MODULE_CATALOG.filter(module => this.canAccessTab(module.tab));
  }

  get homeQuickAccessCards(): readonly WorkspaceModuleCard[] {
    return selectHomeQuickAccessModules(this.homeModuleCards);
  }

  get filteredHomeModuleCards(): readonly WorkspaceModuleCard[] {
    return filterWorkspaceModules(
      this.homeModuleCards,
      this.homeModuleSearch,
      this.localization.locale,
      key => this.t(key),
    );
  }

  canAccessTab(tab: WorkspaceModuleTab): boolean {
    return canAccessWorkspaceTab(tab, this.role(), this.platformAdminAvailable());
  }

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
