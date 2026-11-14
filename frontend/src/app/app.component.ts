import { CommonModule } from '@angular/common';
import { LocalizationService } from './localization.service';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiRequestError, AuditEvent, Business, ChatReply, Customer, CustomerStatement, Dashboard, DataIntegrityReport, Expense, Invoice, Payment, Product, ProfitLossReport, ReceivablesAgingReport, NotificationRecord, OperationalHealth, PurchaseOrder, RecurringInvoiceSchedule, Supplier, TaxSummaryReport } from './api.service';
import { AuthService, type AuthUserSnapshot } from './auth.service';
import { createServiceWorkerUpdateHandler } from './service-worker-update';
import { WorkspaceLoadGuard, isCurrentTenantRequest, type TenantRequestContext, runTenantScopedRequest } from './workspace-load-guard';
import { APP_BUILD_INFO } from './build-info';
import { buildCsv } from './csv-export';
import { auditActionLabel as formatAuditActionLabel, auditTargetLabel as formatAuditTargetLabel } from './audit-labels';
import { filterCustomers, filterExpenses, filterInvoices, filterNotifications, filterPayments, filterProducts, filterPurchaseOrders, filterRecurringSchedules, filterSuppliers, firstRecordPage, mergeRecordPage } from './record-filters';
import { PlatformAdminComponent } from './platform-admin.component';
import { EmployeePayrollComponent } from './employee-payroll.component';
import { ReleaseGuideComponent } from './release-guide.component';
import { CustomerDirectoryComponent } from './customer-directory.component';
import { ProductCatalogComponent } from './product-catalog.component';
import { canAccessWorkspaceTab, isMobileMoreTab as isMobileMoreTabValue } from './module-access';
import { filterWorkspaceModules, selectHomeQuickAccessModules, WORKSPACE_MODULE_CATALOG, WORKSPACE_MODULE_GROUPS, type WorkspaceModuleCard, type WorkspaceModuleGroup } from './workspace-module-catalog';
import { AbaConfirmDialogComponent } from './shared/ui/aba-confirm-dialog.component';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaMetricCardComponent } from './shared/ui/aba-metric-card.component';
import { AbaQuickAccessCardComponent } from './shared/ui/aba-quick-access-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaRecordTableComponent, type AbaRecordTableActionEvent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaMobileAppHeaderComponent } from './shared/ui/aba-mobile-app-header.component';
import { InvoiceDraftEditorComponent } from './invoice-draft-editor.component';
import { findInvoiceDraftRecoveryMatch, invoiceDraftLinesFromExisting } from './invoice-draft';
import type { InvoiceDraftLine, InvoiceDraftPayload, InvoiceDraftServerSummary, InvoiceDraftOutcomeSnapshot } from './invoice-draft';
import { InvoiceDraftOutcomeVault } from './invoice-draft';
import { createPaymentRetrySnapshot, paymentRequestFromRetrySnapshot, PaymentRetryVault } from './payment-retry-snapshot';
import type { PaymentRetrySnapshot } from './payment-retry-snapshot';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'expenses' | 'employees' | 'assistant' | 'reports' | 'taxes' | 'audit' | 'integrity' | 'release-guide' | 'platform-admin' | 'suppliers' | 'purchases' | 'recurring' | 'notifications' | 'health';
type OperationsMessageTab = 'notifications' | 'suppliers' | 'purchases' | 'recurring';

const WORKSPACE_RECORD_PAGE_SIZE = 100;

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PlatformAdminComponent, EmployeePayrollComponent, ReleaseGuideComponent, CustomerDirectoryComponent, ProductCatalogComponent, InvoiceDraftEditorComponent, AbaConfirmDialogComponent, AbaCardComponent, AbaMetricCardComponent, AbaQuickAccessCardComponent, AbaSectionHeaderComponent, AbaRecordTableComponent, AbaStateMessageComponent, AbaMobileAppHeaderComponent],
  template: `
    <div class="shell" [class.auth-shell]="!signedIn" [class.english]="language === 'en'" [class.keyboard-open]="keyboardOpen" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'" (keydown.escape)="closeMobileMoreOnEscape()">
      @if (initialized && signedIn && !startupFailed && !setupNeeded) {
        <a class="skip-link" href="#main-content">{{ t('ui.m_1561v1f') }}</a>
      }
      @if (loading) { <div class="global-loading" role="status" aria-live="polite"><span></span><span class="loading-label">{{ t('ui.m_1rza5t5') }}</span></div> }
      @if (appUpdateAvailable) {
        <aside class="app-update-notice" role="status" aria-live="polite">
          <span>{{ t('ui.m_4cplhg') }}</span>
          <button class="secondary" type="button" (click)="reloadAppAfterUpdate()">{{ t('ui.m_16hli7m') }}</button>
        </aside>
      }
      @if (!initialized) {
        <main class="auth-card" role="status" aria-live="polite">
          <div class="brand-mark">A</div>
          <span class="version-pill splash-version" [attr.title]="t('ui.m_g3351m') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel + ' · Build time (Cairo): ' + buildTimeLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
          <small class="splash-build-time">{{ t('ui.m_1y28k2h') }} {{ buildTimeLabel }}</small>
          <h1>{{ t('ui.m_1dygc0g') }}</h1>
          <p class="muted">{{ t('ui.m_1uzdlys') }}</p>
        </main>
      } @else if (startupFailed) {
        <main class="auth-card">
          <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button></div>
          <div class="brand-mark">A</div>
          <h1>{{ t('ui.m_tee7tu') }}</h1>
          <aba-state-message kind="error" [description]="error" />
          <button class="secondary auth-retry" type="button" (click)="initializeApp()" [disabled]="loading">{{ loading ? t('ui.m_1dc4cbo') : t('ui.m_lr6ezy') }}</button>
        </main>
      } @else if (setupNeeded) {
        <main class="setup-card">
          <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button></div>
          <div class="brand-mark">A</div>
          <p class="eyebrow">{{ t('ui.m_1yxyqru') }}</p>
          <h1>{{ t('ui.m_11t8fki') }}</h1>
          <p>{{ t('ui.m_1pg99q7') }}</p>
          <div class="setup-steps">
            <p><strong>1.</strong> {{ t('ui.m_1ltjr2f') }} <code>frontend/public/runtime-config.json</code> {{ t('ui.m_11mqt0a') }}</p>
            <p><strong>2.</strong> {{ t('ui.m_1lj5n4d') }} <code>apiBaseUrl</code> {{ t('ui.m_1aj80o5') }}</p>
            <p><strong>3.</strong> {{ t('ui.m_15vm5ge') }} <code>apiKey</code>, <code>authDomain</code>, <code>projectId</code>, {{ t('ui.m_57gsye') }} <code>appId</code>.</p>
            <p><strong>4.</strong> {{ t('ui.m_1rirx3l') }}</p>
          </div>
          <p class="footnote">{{ t('ui.m_1uk988r') }}</p>
        </main>
      } @else if (!signedIn) {
        <main class="auth-card">
          <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button></div>
          <div class="brand-mark">A</div>
          <p class="eyebrow">{{ t('ui.m_ll4uy7') }}</p>
          <h1 id="auth-form-heading">{{ signingUp ? t('ui.m_1cuf5gq') : t('ui.m_cfel9w') }}</h1>
          <p class="muted">{{ t('ui.m_1euk0tm') }}</p>
          <form #authForm="ngForm" aria-labelledby="auth-form-heading" (ngSubmit)="authForm.valid && submitAuth()" class="stack">
            <label>{{ t('ui.m_1jc8kzg') }}<input #emailModel="ngModel" name="email" type="email" autocomplete="email" required [(ngModel)]="email" [attr.aria-invalid]="emailModel.invalid && (emailModel.touched || authForm.submitted) ? 'true' : null" [attr.aria-describedby]="emailModel.invalid && (emailModel.touched || authForm.submitted) ? 'auth-email-error' : null">
              @if (emailModel.invalid && (emailModel.touched || authForm.submitted)) {
                <small id="auth-email-error" class="field-error" aria-live="polite">{{ emailModel.errors?.['required'] ? t('ui.m_gxa0df') : t('ui.m_1afx9c8') }}</small>
              }
            </label>
            <label>{{ t('ui.m_eklfkj') }}<input #passwordModel="ngModel" name="password" type="password" [attr.autocomplete]="signingUp ? 'new-password' : 'current-password'" minlength="6" required [(ngModel)]="password" [attr.aria-invalid]="passwordModel.invalid && (passwordModel.touched || authForm.submitted) ? 'true' : null" [attr.aria-describedby]="passwordModel.invalid && (passwordModel.touched || authForm.submitted) ? 'auth-password-error' : null">
              @if (passwordModel.invalid && (passwordModel.touched || authForm.submitted)) {
                <small id="auth-password-error" class="field-error" aria-live="polite">{{ passwordModel.errors?.['required'] ? t('ui.m_pfxpuv') : t('ui.m_1vnk3nk') }}</small>
              }
            </label>
            <button class="primary" type="submit" [disabled]="loading">{{ loading ? t('ui.m_jxz3f3') : (signingUp ? t('ui.m_1hggna5') : t('ui.m_h8edye')) }}</button>
          </form>
          <button class="text-button" type="button" (click)="signingUp = !signingUp">{{ signingUp ? t('ui.m_1uh3cl9') : t('ui.m_1fdki9f') }}</button>
          @if (error) { <aba-state-message kind="error" [description]="error" /> }
          @if (!isInstalled) {
            <section class="mobile-install-card auth-mobile-install" [attr.aria-label]="t('ui.m_1ig5s72')">
              <div class="mobile-install-copy">
                <span class="mobile-install-icon" aria-hidden="true">⇧</span>
                <div>
                  <strong>{{ t('ui.m_1i6f7xh') }}</strong>
                  <small>{{ t('ui.m_1ggnkh3') }}</small>
                </div>
              </div>
              <button class="secondary install-button mobile-install-button" type="button" (click)="installApp()">{{ t('ui.m_76lwbh') }}</button>
            </section>
          }
          @if (installHelp && !isInstalled) {
            <div class="install-help install-help-inline" role="status">
              {{ t('ui.m_14cdic2') }}
              <button type="button" class="secondary" (click)="installHelp = false">{{ t('ui.m_1av23fu') }}</button>
            </div>
          }
        </main>
      } @else {
        <aside class="sidebar" role="navigation" [attr.aria-label]="t('ui.m_9jbcg2')">
          <a class="brand" href="#" (click)="$event.preventDefault(); setTab('overview')"><span class="brand-mark small">A</span><span>{{ t('common.app_title') }}</span></a>
          <p class="nav-label">{{ t('ui.m_criw1m') }}</p>
          <button class="nav-item" [attr.aria-label]="t('ui.m_1sgyd06')" [attr.title]="t('ui.m_1sgyd06')" [class.active]="tab === 'overview'" [attr.aria-current]="tab === 'overview' ? 'page' : null" (click)="setTab('overview')"><span class="nav-icon overview-icon" aria-hidden="true">⌂</span><span>{{ t('ui.m_1sgyd06') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_1k2jewg')" [attr.title]="t('ui.m_1k2jewg')" [class.active]="tab === 'reports'" [attr.aria-current]="tab === 'reports' ? 'page' : null" (click)="setTab('reports')"><span class="nav-icon" aria-hidden="true">∑</span><span>{{ t('ui.m_1k2jewg') }}</span></button>
          @if (canAccessTab('taxes')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_17hm8dv')" [attr.title]="t('ui.m_17hm8dv')" [class.active]="tab === 'taxes'" [attr.aria-current]="tab === 'taxes' ? 'page' : null" (click)="setTab('taxes')"><span class="nav-icon" aria-hidden="true">%</span><span>{{ t('ui.m_17hm8dv') }}</span></button> }
          <button class="nav-item" [attr.aria-label]="t('ui.m_1h7f08p')" [attr.title]="t('ui.m_1h7f08p')" [class.active]="tab === 'invoices'" [attr.aria-current]="tab === 'invoices' ? 'page' : null" (click)="setTab('invoices')"><span class="nav-icon invoices-icon" aria-hidden="true">▤</span><span>{{ t('ui.m_1h7f08p') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_xpe4pk')" [attr.title]="t('ui.m_xpe4pk')" [class.active]="tab === 'products'" [attr.aria-current]="tab === 'products' ? 'page' : null" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>{{ t('ui.m_xpe4pk') }}</span></button>
          <button class="nav-item" [attr.aria-label]="t('ui.m_tvy79l')" [attr.title]="t('ui.m_tvy79l')" [class.active]="tab === 'customers'" [attr.aria-current]="tab === 'customers' ? 'page' : null" (click)="setTab('customers')"><span class="nav-icon customers-icon" aria-hidden="true">♧</span><span>{{ t('ui.m_tvy79l') }}</span></button>
          @if (canAccessTab('employees')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_1whxhp7')" [attr.title]="t('ui.m_1whxhp7')" [class.active]="tab === 'employees'" [attr.aria-current]="tab === 'employees' ? 'page' : null" (click)="setTab('employees')"><span class="nav-icon" aria-hidden="true">♙</span><span>{{ t('ui.m_1whxhp7') }}</span></button> }
          @if (canAccessTab('platform-admin')) { <button class="nav-item platform-admin-nav" [attr.aria-label]="t('ui.m_1gkme2m')" [attr.title]="t('ui.m_1gkme2m')" [class.active]="tab === 'platform-admin'" [attr.aria-current]="tab === 'platform-admin' ? 'page' : null" (click)="setTab('platform-admin')"><span class="nav-icon" aria-hidden="true">◇</span><span>{{ t('ui.m_1gkme2m') }}</span></button> }
@if (canAccessTab('audit')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_hd46sj')" [attr.title]="t('ui.m_hd46sj')" [class.active]="tab === 'audit'" [attr.aria-current]="tab === 'audit' ? 'page' : null" (click)="setTab('audit')"><span class="nav-icon" aria-hidden="true">◷</span><span>{{ t('ui.m_hd46sj') }}</span></button> }
                    @if (canAccessTab('payments')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_14ms9re')" [attr.title]="t('ui.m_14ms9re')" [class.active]="tab === 'payments'" [attr.aria-current]="tab === 'payments' ? 'page' : null" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>{{ t('ui.m_14ms9re') }}</span></button> }
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_l71hva')" [attr.title]="t('ui.m_l71hva')" [class.active]="tab === 'expenses'" [attr.aria-current]="tab === 'expenses' ? 'page' : null" (click)="setTab('expenses')"><span class="nav-icon expense-icon" aria-hidden="true">−</span><span>{{ t('ui.m_l71hva') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_vlrg7')" [attr.title]="t('ui.m_vlrg7')" [class.active]="tab === 'notifications'" [attr.aria-current]="tab === 'notifications' ? 'page' : null" (click)="setTab('notifications')"><span class="nav-icon" aria-hidden="true">♢</span><span>{{ t('ui.m_vlrg7') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_1yzd6rs')" [attr.title]="t('ui.m_1yzd6rs')" [class.active]="tab === 'suppliers'" [attr.aria-current]="tab === 'suppliers' ? 'page' : null" (click)="setTab('suppliers')"><span class="nav-icon" aria-hidden="true">▣</span><span>{{ t('ui.m_1yzd6rs') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_s8z24b')" [attr.title]="t('ui.m_s8z24b')" [class.active]="tab === 'purchases'" [attr.aria-current]="tab === 'purchases' ? 'page' : null" (click)="setTab('purchases')"><span class="nav-icon" aria-hidden="true">⇩</span><span>{{ t('ui.m_s8z24b') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_11lck86')" [attr.title]="t('ui.m_11lck86')" [class.active]="tab === 'recurring'" [attr.aria-current]="tab === 'recurring' ? 'page' : null" (click)="setTab('recurring')"><span class="nav-icon" aria-hidden="true">↻</span><span>{{ t('ui.m_ccqp2u') }}</span></button>
          @if (canAccessTab('health')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_18z2l5z')" [attr.title]="t('ui.m_18z2l5z')" [class.active]="tab === 'health'" [attr.aria-current]="tab === 'health' ? 'page' : null" (click)="setTab('health')"><span class="nav-icon" aria-hidden="true">♥</span><span>{{ t('ui.m_3lp8ed') }}</span></button> }
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_dzn3ev')" [attr.title]="t('ui.m_dzn3ev')" [class.active]="tab === 'assistant'" [attr.aria-current]="tab === 'assistant' ? 'page' : null" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>{{ t('ui.m_dzn3ev') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('ui.m_a3qirn')" [attr.title]="t('ui.m_a3qirn')" [class.active]="tab === 'release-guide'" [attr.aria-current]="tab === 'release-guide' ? 'page' : null" (click)="setTab('release-guide')"><span class="nav-icon" aria-hidden="true">ⓘ</span><span>{{ t('ui.m_a3qirn') }}</span></button>
          <button #mobileMoreTrigger class="nav-item mobile-more" type="button" [class.active]="mobileMoreOpen || isMobileMoreTab(tab)" [attr.aria-label]="t('ui.m_nxf6ap')" [attr.aria-expanded]="mobileMoreOpen" [attr.aria-controls]="mobileMoreOpen ? 'mobile-more-menu' : null" (click)="toggleMobileMore()"><span class="nav-icon" aria-hidden="true">•••</span><span>{{ t('ui.m_dh4eov') }}</span></button>
          @if (mobileMoreOpen) {
            <nav #mobileMoreMenu id="mobile-more-menu" class="mobile-more-menu" [attr.aria-label]="t('ui.m_1c7twvy')">
              <label class="mobile-more-search">
                <span class="sr-only">{{ t('ui.m_1eu8swe') }}</span>
                <input type="search" name="mobileMoreSearch" autocomplete="off" enterkeyhint="search"
                  [attr.aria-label]="t('ui.m_1eu8swe')"
                  [placeholder]="t('ui.m_1uhhx5z')"
                  [(ngModel)]="mobileMoreSearch" />
              </label>
              @if (filteredMobileMoreGroups.length) {
                @for (group of filteredMobileMoreGroups; track group.id) {
                <section class="mobile-more-group" [attr.aria-labelledby]="'mobile-more-' + group.id + '-heading'">
                  <h3 [id]="'mobile-more-' + group.id + '-heading'">{{ t(group.titleKey) }}</h3>
                  @for (module of group.modules; track module.tab) {
                    <button class="nav-item" type="button" [class.active]="tab === module.tab" [attr.aria-current]="tab === module.tab ? 'page' : null" (click)="selectMobileMoreTab(module.tab)">
                      <span class="nav-icon" aria-hidden="true">{{ module.icon }}</span>
                      <span>{{ t(module.titleKey) }}</span>
                    </button>
                  }
                </section>
                }
              } @else {
                <p class="mobile-more-empty" role="status">{{ t('ui.m_ehdjlq') }}</p>
              }
              <div class="mobile-more-actions">
                <button class="nav-item mobile-menu-action" type="button" (click)="toggleLanguage()"><span class="nav-icon" aria-hidden="true">文</span><span>{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</span></button>
                <button class="nav-item mobile-menu-action" type="button" (click)="logout()"><span class="nav-icon" aria-hidden="true">↪</span><span>{{ t('ui.m_r2b303') }}</span></button>
              </div>
            </nav>
          }
          <div class="sidebar-bottom"><span class="status-dot"></span> {{ t('ui.m_17dx7ed') }}<small>{{ t('ui.m_ab5ft9') }}</small></div>
        </aside>
        <main class="main" id="main-content" tabindex="-1">
          @if (!isInstalled) {
            <section class="mobile-install-card" [attr.aria-label]="t('ui.m_1ig5s72')">
              <div class="mobile-install-copy">
                <span class="mobile-install-icon" aria-hidden="true">⇧</span>
                <div>
                  <strong>{{ t('ui.m_1i6f7xh') }}</strong>
                  <small>{{ t('ui.m_1itaw9f') }}</small>
                </div>
              </div>
              <button class="secondary install-button mobile-install-button" type="button" (click)="installApp()">{{ t('ui.m_76lwbh') }}</button>
            </section>
          }
          @if (installHelp && !isInstalled) {
            <div class="install-help install-help-inline" role="status">
              {{ t('ui.m_14cdic2') }}
              <button type="button" class="secondary" (click)="installHelp = false">{{ t('ui.m_1av23fu') }}</button>
            </div>
          }
          @if (tab === 'platform-admin' && platformAdminAvailable) {
            @defer (when tab === 'platform-admin' && platformAdminAvailable) {
              <aba-platform-admin [language]="language" [userEmail]="userEmail" (signOutRequested)="logout()" (languageToggleRequested)="toggleLanguage()" />
            } @placeholder {
              <section abaCard class="panel narrow">
                <aba-state-message kind="loading" [description]="t('ui.m_icu2ib')" />
              </section>
            }
          } @else {
          <header class="topbar">
            <div class="topbar-heading"><p class="eyebrow">{{ t('ui.m_criw1m') }}</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area">@if (!isInstalled) { <button class="secondary install-button" type="button" (click)="installApp()">{{ t('ui.m_1ig5s72') }}</button> }<button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">{{ t('ui.m_r2b303') }}</button></div>
          </header>
          @if (error) { <aba-state-message kind="error" [description]="error" [actionLabel]="sessionExpired ? t('ui.m_14surv3') : accessDenied ? t('ui.m_atfuse') : t('ui.m_worzj7')" (action)="sessionExpired ? logout() : accessDenied ? setTab('overview') : retry()" /> }
          @if (loading) { <aba-state-message kind="loading" [description]="t('ui.m_1oo6dkn')" /> }

          @if (!business) {
            <section abaCard class="panel narrow">
              <p class="eyebrow">{{ t('ui.m_117ileb') }}</p><h2>{{ t('ui.m_sgf5dv') }}</h2>
              <p class="muted">{{ t('ui.m_1bmd66c') }}</p>
              <form #workspaceForm="ngForm" class="stack" (ngSubmit)="workspaceForm.valid && createWorkspace()">
                <label>{{ t('ui.m_lzm3kh') }}<input #businessNameModel="ngModel" name="businessName" required maxlength="160" [(ngModel)]="businessName" [attr.aria-invalid]="businessNameModel.invalid && (businessNameModel.touched || workspaceForm.submitted) ? 'true' : null" [attr.aria-describedby]="businessNameModel.invalid && (businessNameModel.touched || workspaceForm.submitted) ? 'workspace-name-error' : null">
                  @if (businessNameModel.invalid && (businessNameModel.touched || workspaceForm.submitted)) {
                    <small id="workspace-name-error" class="field-error" aria-live="polite">{{ businessNameModel.errors?.['required'] ? t('ui.m_dqqjgk') : t('ui.m_nclsue') }}</small>
                  }
                </label>
                <label>{{ t('ui.m_1n6idjh') }}<select name="currency" [(ngModel)]="currencyCode"><option value="EGP">{{ currencyName("EGP") }}</option><option value="USD">{{ currencyName("USD") }}</option><option value="EUR">{{ currencyName("EUR") }}</option><option value="GBP">{{ currencyName("GBP") }}</option><option value="SAR">{{ currencyName("SAR") }}</option><option value="AED">{{ currencyName("AED") }}</option></select></label>
                <button class="primary" type="submit" [disabled]="loading">{{ t('ui.m_uddskc') }}</button>
              </form>
            </section>
          } @else {
            <section class="workspace-bar" [attr.aria-label]="t('ui.m_qhibn3')">
              <div class="workspace-current"><span class="eyebrow">{{ t('ui.m_k9m7mg') }}</span><strong id="workspace-current-name" aria-live="polite">{{ business.name }}</strong></div>
              <select [attr.aria-label]="t('ui.m_10nmufl')" aria-describedby="workspace-current-name" [ngModel]="selectedBusinessId" (ngModelChange)="switchBusiness($event)">
                @for (item of businesses; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
              </select>
              <div class="workspace-release-meta workspace-release-meta-inline" [attr.aria-label]="t('ui.m_zepwzq')">
                <span class="version-pill" [attr.title]="t('ui.m_g3351m') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
                <small>{{ t('ui.m_1d7lshv') }} {{ buildTimeLabel }}</small>
              </div>
            </section>
            <aba-mobile-app-header
              [language]="language"
              [appVersion]="appVersion"
              [workspaceName]="business.name"
              [businesses]="businesses"
              [selectedBusinessId]="selectedBusinessId"
              [pageTitle]="pageTitle"
              [userEmail]="userEmail"
              [showGreeting]="tab === 'overview'"
              (homeRequested)="setTab('overview')"
              (businessChange)="switchBusiness($event)"
              (notificationsRequested)="setTab('notifications')"
              (assistantRequested)="setTab('assistant')"
              (languageToggleRequested)="toggleLanguage()"
              (signOutRequested)="logout()" />

            @if (tab === 'overview') {
              @if (dashboard) {
                <section class="dashboard-period" [attr.aria-label]="t('ui.m_14yh7ls')">
                  <div class="dashboard-period__heading">
                    <h2 class="dashboard-period__title">{{ t('ui.m_1wch2zm') }}</h2>
                    <strong>{{ t('ui.m_1ql1fm2') }}</strong>
                  </div>
                  <div class="dashboard-period__details">
                    <span>{{ t('ui.m_15qcbwy') }} <bdi dir="ltr">{{ dashboard.period.start_date || '—' }}</bdi> {{ t('ui.m_8f9vz0') }} <bdi dir="ltr">{{ dashboard.period.end_date || '—' }}</bdi></span>
                    <span>{{ t('ui.m_j805b6') }}: <bdi>{{ dashboard.period.timezone || '—' }}</bdi></span>
                  </div>
                </section>
                <section class="metric-grid" [attr.aria-label]="t('ui.m_1gk81ud')">
                  <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_fnf54u')" (click)="setTab('invoices')" (keydown.enter)="setTab('invoices')" (keydown.space)="$event.preventDefault(); setTab('invoices')"><span metricLabel>{{ t('ui.m_fnf54u') }}</span>
                    @for (item of dashboard.invoiced_sales; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('ui.m_18n4mlp') }}</small> } @if (!dashboard.invoiced_sales.length) { <strong>—</strong><small>{{ t('ui.m_e17yyr') }}</small> }<small class="metric-basis">{{ t('ui.m_zszhha') }}</small></aba-metric-card>
                  <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_1ukns6h')" (click)="setTab('payments')" (keydown.enter)="setTab('payments')" (keydown.space)="$event.preventDefault(); setTab('payments')"><span metricLabel>{{ t('ui.m_1ukns6h') }}</span>
                    @for (item of dashboard.collected_payments; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('ui.m_1dedwxn') }}</small> } @if (!dashboard.collected_payments.length) { <strong>—</strong><small>{{ t('ui.m_5s5eo') }}</small> }<small class="metric-basis">{{ t('ui.m_nbfv39') }}</small></aba-metric-card>
                  <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_l71hva')" (click)="setTab('expenses')" (keydown.enter)="setTab('expenses')" (keydown.space)="$event.preventDefault(); setTab('expenses')"><span metricLabel>{{ t('ui.m_l71hva') }}</span>
                    @for (item of dashboard.expenses; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('ui.m_jgq8i') }}</small> } @if (!dashboard.expenses.length) { <strong>—</strong><small>{{ t('ui.m_53hyf8') }}</small> }<small class="metric-basis">{{ t('ui.m_1mhn6p1') }}</small></aba-metric-card>
                  <aba-metric-card class="metric-card-action" role="button" tabindex="0" [attr.aria-label]="t('ui.m_v5uwri')" (click)="setTab('invoices')" (keydown.enter)="setTab('invoices')" (keydown.space)="$event.preventDefault(); setTab('invoices')"><span metricLabel>{{ t('ui.m_v5uwri') }}</span>
                    @for (item of dashboard.outstanding_balances; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small class="metric-basis">{{ t('ui.m_1wagqaw') }}</small> } @if (!dashboard.outstanding_balances.length) { <strong>—</strong><small>{{ t('ui.m_1k06qyq') }}</small> }</aba-metric-card>
                </section>
                <section class="dashboard-actions" [attr.aria-label]="t('ui.m_1423muo')">
                  @if (canAccessTab('invoices')) {
                    <button class="dashboard-action dashboard-action--primary" type="button"
                      (click)="setTab('invoices'); startNewInvoiceDraft()">
                      <span class="dashboard-action__icon" aria-hidden="true">＋</span>
                      <span class="dashboard-action__copy">
                        <strong>{{ t('ui.m_12vszs4') }}</strong>
                        <small>{{ t('ui.m_61q6l7') }}</small>
                      </span>
                      <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
                    </button>
                  }
                  @if (canAccessTab('expenses')) {
                    <button class="dashboard-action" type="button" (click)="setTab('expenses')">
                      <span class="dashboard-action__icon" aria-hidden="true">＋</span>
                      <span class="dashboard-action__copy">
                        <strong>{{ t('ui.m_p4p38y') }}</strong>
                        <small>{{ t('ui.m_ehnfke') }}</small>
                      </span>
                      <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
                    </button>
                  }
                  @if (canAccessTab('customers')) {
                    <button class="dashboard-action" type="button" (click)="setTab('customers'); customerCreateOpen = true">
                      <span class="dashboard-action__icon" aria-hidden="true">＋</span>
                      <span class="dashboard-action__copy">
                        <strong>{{ t('ui.m_1yvcfg6') }}</strong>
                        <small>{{ t('ui.m_15gmqko') }}</small>
                      </span>
                      <span class="dashboard-action__arrow" aria-hidden="true">↗</span>
                    </button>
                  }
                  @if (canAccessTab('products')) {
                    <button class="dashboard-action" type="button" (click)="setTab('products'); productCreateOpen = true">
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
              } @else if (loading) {
                <section class="dashboard-period dashboard-period--skeleton" aria-hidden="true">
                  <div class="dashboard-period__heading">
                    <h2 class="dashboard-period__title">{{ t('ui.m_1wch2zm') }}</h2>
                    <strong>{{ t('ui.m_1ql1fm2') }}</strong>
                  </div>
                  <div class="dashboard-period-skeleton__details">
                    <span></span><span></span>
                  </div>
                </section>
                <section class="metric-grid metric-grid--skeleton" aria-hidden="true">
                  <div class="metric-skeleton"><span></span><span></span><span></span></div>
                  <div class="metric-skeleton"><span></span><span></span><span></span></div>
                  <div class="metric-skeleton"><span></span><span></span><span></span></div>
                  <div class="metric-skeleton"><span></span><span></span><span></span></div>
                </section>

              } @else if (!error) {
                <aba-state-message kind="empty" [description]="t('ui.m_1x7j987')" />
              }
              <section abaCard class="panel module-launcher" aria-labelledby="module-launcher-title">
                <aba-section-header [titleId]="'module-launcher-title'" [title]="t('ui.m_1423muo')" [description]="t('ui.m_1srbbxd')" [count]="homeQuickAccessCards.length" />
                <nav class="home-shortcut-list" [attr.aria-label]="t('ui.m_1ufo715')">
                  @for (module of homeQuickAccessCards; track module.tab) {
                    <button class="home-shortcut-link" type="button" (click)="setTab(module.tab)">
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
                  <label class="module-directory-search">
                    <span class="sr-only">{{ t('ui.m_1yd5km1') }}</span>
                    <input type="search" name="homeModuleSearch" autocomplete="off"
                      [attr.aria-label]="t('ui.m_1yd5km1')"
                      [placeholder]="t('ui.m_3bdru5')"
                      [(ngModel)]="homeModuleSearch" />
                  </label>
                  @if (filteredHomeModuleCards.length) {
                  <div class="module-directory-grid">
                    @for (module of filteredHomeModuleCards; track module.tab) {
                      <aba-quick-access-card
                        [icon]="module.icon"
                        [title]="t(module.titleKey)"
                        [description]="t(module.descriptionKey)"
                        (activated)="setTab(module.tab)" />
                    }
                  </div>
                  } @else {
                    <p class="module-directory-empty" role="status">{{ t('ui.m_c4eu5t') }}</p>
                  }
                </details>
              </section>
              
            }

            @if (tab === 'notifications') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_6wit46') " [description]=" t('ui.m_1a21njv') "><span class="count">{{ filteredNotifications.length }} / {{ notifications.length }}</span></aba-section-header>
                @if (business?.role === 'owner') {
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
                <div class="list-tools operations-search aba-record-toolbar"><input name="notificationSearch" type="search" [attr.aria-label]="t('ui.m_1qze32v')" [placeholder]="t('ui.m_1aqo4qr')" [(ngModel)]="notificationSearch"></div>
                <aba-record-table [ariaLabel]="t('ui.m_1qfr3uw')" [columns]="notificationTableColumns" [rows]="notificationTableRows" [loading]="notificationsLoading && !notifications.length" [loadingDescription]="t('ui.m_fwia2s')" [emptyTitle]="t('ui.m_1mw6u5')" [emptyDescription]="notificationSearch.trim() ? t('ui.m_23ba9u') : t('ui.m_1yt5n1a')" />
              </section>
            }


@if (tab === 'suppliers') {
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
                @if (operationsError && operationsErrorTab === 'suppliers') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'suppliers') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'suppliers' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="supplierSearch" type="search" [attr.aria-label]="t('ui.m_1mc30sn')" [placeholder]="t('ui.m_jtec0a')" [(ngModel)]="supplierSearch"></div>
                <aba-record-table [ariaLabel]="t('ui.m_13lj997')" [columns]="supplierTableColumns" [rows]="supplierTableRows" [loading]="suppliersLoading && !suppliers.length" [loadingDescription]="t('ui.m_16wb349')" [emptyTitle]="t('ui.m_1u3jkgy')" [emptyDescription]="supplierSearch.trim() ? t('ui.m_ka2uzv') : t('ui.m_9e3ceh')" />

              </section>
            }


@if (tab === 'purchases') {
              <section abaCard class="panel">
                <aba-section-header id="purchases-section-heading" tabindex="-1" [title]=" t('ui.m_1x15ykz') " [description]=" t('ui.m_roz4sr') "><span class="count">{{ filteredPurchaseOrders.length }} / {{ purchaseOrders.length }}</span></aba-section-header>
<details class="aba-record-create">
                  <summary><span>{{ t('ui.m_iqb29f') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #purchaseForm="ngForm" class="stack" (ngSubmit)="purchaseForm.valid && createPurchaseOrder()">
                  <label>{{ t('ui.m_19p1zn3') }}<input #purchaseOrderNumberControl="ngModel" name="purchaseOrderNumber" required maxlength="64" [attr.aria-invalid]="purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted) ? 'purchase-number-error' : null" [(ngModel)]="purchaseOrderNumber"></label>
                  <label>{{ t('ui.m_x27ir1') }}<select #purchaseSupplierControl="ngModel" name="purchaseSupplierId" required [attr.aria-invalid]="purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted) ? 'purchase-supplier-error' : null" [(ngModel)]="purchaseSupplierId"><option value="" disabled>{{ t('ui.m_el3aam') }}</option>@for (supplier of suppliers; track supplier.id) { <option [value]="supplier.id">{{ supplier.name }}</option> }</select></label>
                  <label>{{ t('ui.m_7fwfk0') }}<select #purchaseProductControl="ngModel" name="purchaseProductId" required [attr.aria-invalid]="purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted) ? 'purchase-product-error' : null" [(ngModel)]="purchaseProductId"><option value="" disabled>{{ t('ui.m_1kwxnkp') }}</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.sku || product.id.slice(0,8) }}</option> }</select></label>
                  <div class="inline-form"><label>{{ t('ui.m_ocneuo') }}<input #purchaseQuantityControl="ngModel" name="purchaseQuantity" type="number" min="0.001" step="0.001" required [attr.aria-invalid]="purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted) ? 'purchase-quantity-error' : null" [(ngModel)]="purchaseQuantity"></label><label>{{ t('ui.m_19mrznv') }}<input #purchaseUnitCostControl="ngModel" name="purchaseUnitCost" type="number" min="0" step="0.01" required [attr.aria-invalid]="purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted) ? 'purchase-unit-cost-error' : null" [(ngModel)]="purchaseUnitCost"></label></div>
                  <button class="primary" type="submit" [disabled]="purchasesLoading || !suppliers.length || !products.length">{{ t('ui.m_iqb29f') }}</button>
                </form>
                @if ((purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted)) || (purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted)) || (purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted)) || (purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted)) || (purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted)) { <small id="purchase-number-error" class="field-error">{{ t('ui.m_lv9gfw') }}</small> }
                    @if (purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted)) { <small id="purchase-supplier-error" class="field-error">{{ t('ui.m_17l7adv') }}</small> }
                    @if (purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted)) { <small id="purchase-product-error" class="field-error">{{ t('ui.m_lkov6w') }}</small> }
                    @if (purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted)) { <small id="purchase-quantity-error" class="field-error">{{ t('ui.m_jsv2pg') }}</small> }
                    @if (purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted)) { <small id="purchase-unit-cost-error" class="field-error">{{ t('ui.m_13qo8kh') }}</small> }
                  </div>
                }

                  </div>
                </details>
                @if (operationsError && operationsErrorTab === 'purchases') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'purchases') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'purchases' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="purchaseSearch" type="search" [attr.aria-label]="t('ui.m_x2km9j')" [placeholder]="t('ui.m_1bqn1oi')" [(ngModel)]="purchaseSearch"></div>
                <aba-record-table [ariaLabel]="t('ui.m_1xlq4zq')" [columns]="purchaseTableColumns" [rows]="purchaseTableRows" [loading]="purchasesLoading && !purchaseOrders.length" [loadingDescription]="t('ui.m_1c93aea')" [actionsHeading]="t('ui.m_1dbhmlo')" [emptyTitle]="t('ui.m_1skqw0x')" [emptyDescription]="purchaseSearch.trim() ? t('ui.m_ckscgw') : t('ui.m_1yhbnd3')" (rowAction)="onPurchaseRecordAction($event)" />

              </section>
            }


@if (tab === 'recurring') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_slegw7') " [description]=" t('ui.m_1e0c20g') "><span class="count">{{ filteredRecurringSchedules.length }} / {{ recurringSchedules.length }}</span></aba-section-header>
                @if (business?.role === 'owner') {
                <form #recurringForm="ngForm" class="stack" (ngSubmit)="recurringForm.valid && createRecurringSchedule()">
                  <label>{{ t('ui.m_eoh95l') }}<select name="recurringCustomerId" [(ngModel)]="recurringCustomerId"><option value="">{{ t('ui.m_8pt45d') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select></label>
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
                } @else { <aba-state-message kind="info" [description]="t('ui.m_t5zhtj')" /> }
                @if (operationsError && operationsErrorTab === 'recurring') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'recurring') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'recurring' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="recurringSearch" type="search" [attr.aria-label]="t('ui.m_aljqyp')" [placeholder]="t('ui.m_z7f6xc')" [(ngModel)]="recurringSearch"></div>
                <aba-record-table [ariaLabel]="t('ui.m_uxwqg9')" [columns]="recurringTableColumns" [rows]="recurringTableRows" [loading]="recurringLoading && !recurringSchedules.length" [loadingDescription]="t('ui.m_10b19k6')" [emptyTitle]="t('ui.m_4r8x8c')" [emptyDescription]="recurringSearch.trim() ? t('ui.m_11cvrt7') : t('ui.m_kxnfs6')" />
              </section>
            }


@if (tab === 'health' && business?.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_18z2l5z') " [description]=" t('ui.m_1ps0q5f') "><span class="count">{{ operationalHealth ? operationalHealthStatusLabel(operationalHealth.status) : t('ui.m_159bgv6') }}</span></aba-section-header>
                <button class="primary" type="button" (click)="loadOperationalHealth()" [disabled]="healthLoading">{{ healthLoading ? t('ui.m_1v22gnm') : t('ui.m_9aw201') }}</button>
                @if (healthError) { <aba-state-message kind="error" [description]="healthError" /> }
                @if (operationalHealth) {
                  <div class="metric-grid">
                    <article class="metric"><span>{{ t('ui.m_1ko8298') }}</span><strong>{{ operationalHealth.database_connected ? t('ui.m_1mjv33c') : t('ui.m_1mbcqq8') }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_e3dmsb') }}</span><strong>{{ operationalHealth.migration_table_available ? t('ui.m_bq5tlp') : t('ui.m_1izwear') }}</strong><small>{{ operationalHealth.migration_revision || t('ui.m_18sx15n') }}</small></article>
                    <article class="metric"><span>{{ t('ui.m_1jpiz8c') }}</span><strong>{{ operationalHealth.ai_configured ? t('ui.m_1irrjj2') : t('ui.m_1aa7dsy') }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_fc2ud1') }}</span><strong>{{ operationalHealth.notification_delivery_configured ? t('ui.m_1irrjj2') : t('ui.m_1aa7dsy') }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_1hq6krq') }}</span><strong>{{ operationalHealth.recurring_invoice_worker_configured ? t('ui.m_1irrjj2') : t('ui.m_1aa7dsy') }}</strong></article>
                  </div>
                  <p class="muted">{{ t('ui.m_1je9a30') }} {{ formatRecordDate(operationalHealth.checked_at) }}. {{ t('ui.m_3o0ahe') }}</p>
                }
              </section>
            }

@if (tab === 'reports') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_1k2jewg') " [description]=" t('ui.m_7hhfvq') "><span class="count">{{ t('ui.m_7xexd4') }}</span></aba-section-header>
                <form #profitLossForm="ngForm" class="inline-form" (ngSubmit)="profitLossForm.valid && loadProfitLoss()">
                  <select name="profitLossPeriod" [attr.aria-label]="t('ui.m_cwfche')" [(ngModel)]="profitLossPeriod"><option value="30d">{{ t('ui.m_1ql1fm2') }}</option><option value="month">{{ t('ui.m_1sm3j94') }}</option><option value="all">{{ t('ui.m_bp8vk5') }}</option><option value="custom">{{ t('ui.m_57v6ro') }}</option></select>
                  @if (profitLossPeriod === 'custom') {
                    <label>{{ t('ui.m_15qcbwy') }}<input #profitLossStartControl="ngModel" type="date" name="profitLossStart" required [attr.aria-invalid]="profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted) ? 'true' : null" [attr.aria-describedby]="profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted) ? 'profit-loss-start-error' : null" [(ngModel)]="profitLossStart">@if (profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted)) { <small id="profit-loss-start-error" class="field-error" role="alert">{{ t('ui.m_c9vs17') }}</small> }</label>
                    <label>{{ t('ui.m_8ibmd8') }}<input #profitLossEndControl="ngModel" type="date" name="profitLossEnd" required [attr.aria-invalid]="profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted) ? 'true' : null" [attr.aria-describedby]="profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted) ? 'profit-loss-end-error' : null" [(ngModel)]="profitLossEnd">@if (profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted)) { <small id="profit-loss-end-error" class="field-error" role="alert">{{ t('ui.m_146gz4o') }}</small> }</label>
                  }
                  <button class="primary" type="submit" [disabled]="reportLoading">{{ reportLoading ? t('ui.m_1k98007') : t('ui.m_10jsbot') }}</button>
                </form>
                @if (reportError) { <aba-state-message kind="error" [description]="reportError" /> }
                @if (profitLoss) {
                  <p class="muted">{{ profitLoss.period.start_date || t('ui.m_ixi82b') }} — {{ profitLoss.period.end_date || t('ui.m_1pfkmow') }} · {{ profitLoss.period.timezone || 'UTC' }}</p>
                  <p class="muted"><strong>{{ t('ui.m_8hpy6m') }}</strong> {{ revenueBasisLabel(profitLoss.revenue_basis) }}</p>
                  <aba-record-table [ariaLabel]="t('ui.m_1irq6mk')" [columns]="profitLossTableColumns" [rows]="profitLossTableRows" [emptyTitle]="t('ui.m_zlnr36')" [emptyDescription]="t('ui.m_q1rdjf')" />
                  <div class="notice"><strong>{{ t('ui.m_1tz1k9k') }}</strong><span>{{ t('ui.m_ujpaej') }}</span></div>
                }
                <div class="divider"></div>
                <aba-section-header [level]="3" [title]="t('ui.m_2oaefr')" [description]="t('ui.m_1dmo8qz')" />
                <form #agingForm="ngForm" class="inline-form" (ngSubmit)="agingForm.valid && loadReceivablesAging()"><label>{{ t('ui.m_tyw1lj') }}<input #agingAsOfControl="ngModel" type="date" name="agingAsOf" required [attr.aria-invalid]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'true' : null" [attr.aria-describedby]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'aging-as-of-error' : null" [(ngModel)]="agingAsOf">@if (agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted)) { <small id="aging-as-of-error" class="field-error" role="alert">{{ t('ui.m_4apqf4') }}</small> }</label><button class="primary" type="submit" [disabled]="agingLoading">{{ agingLoading ? t('ui.m_1rza5t5') : t('ui.m_1gsyti0') }}</button></form>
                @if (agingError) { <aba-state-message kind="error" [description]="agingError" /> }
                @if (agingReport) {
                  <div class="section-head"><p class="muted">{{ t('ui.m_vnv6l5') }} {{ agingReport.as_of_date }} · {{ agingReport.invoice_count }} {{ t('ui.m_pe8fvb') }}</p><button class="secondary" type="button" (click)="exportReceivablesAgingCsv()" [disabled]="!agingReport.invoices.length">{{ t('ui.m_nbsw3y') }}</button></div>
                  @for (summary of agingReport.by_currency; track summary.currency_code) {
                    <article class="metric"><span>{{ t('ui.m_1dusybc') }} · {{ summary.currency_code }}</span><strong>{{ summary.total_outstanding }} {{ summary.currency_code }}</strong><div class="aging-buckets">@for (bucket of summary.buckets; track bucket.bucket) { <div><small>{{ agingBucketLabel(bucket.bucket) }}</small><strong>{{ bucket.outstanding_amount }} {{ summary.currency_code }}</strong></div> }</div></article>
                  }
                  @if (agingReport.data_quality_warnings.length) {
                    <div class="notice warning-notice"><strong>{{ t('ui.m_fhk738') }}</strong>
                      @for (warning of agingReport.data_quality_warnings; track warning.invoice_id + warning.type) {
                        <p><strong>{{ warning.invoice_number }}</strong> — {{ agingWarningLabel(warning.type) }}</p>
                        @if (warning.excess_allocated) { <p>{{ t('ui.m_29qoiu') }} {{ warning.excess_allocated }} {{ warning.invoice_currency || '' }}</p> }
                        @if (warning.mismatched_allocations_amount) { <p>{{ t('ui.m_1hrsgrk') }} {{ warning.mismatched_allocations_amount }}</p> }
                      }
                    </div>
                  }
                  <aba-record-table [ariaLabel]="t('ui.m_15doge2')" [columns]="agingTableColumns" [rows]="agingTableRows" [emptyTitle]="t('ui.m_1fbb4i1')" [emptyDescription]="t('ui.m_18nc6st')" />
                  @if (agingReport.limitations.length) { <div class="notice"><strong>{{ t('ui.m_akne82') }}</strong>@for (limitation of agingReport.limitations; track limitation) { <p>{{ reportLimitationLabel(limitation) }}</p> }</div> }
                }
              </section>
            }

            @if (tab === 'customers') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_1lifkl9') " [description]=" t('ui.m_15gmqko') "><span class="count">{{ filteredCustomers.length }} / {{ customers.length }} {{ t('ui.m_15kaq4w') }}</span></aba-section-header>
<details class="aba-record-create" [open]="customerCreateOpen" (toggle)="customerCreateOpen = $any($event.target).open">
                  <summary><span>{{ t('ui.m_1yvcfg6') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #customerForm="ngForm" class="inline-form" (ngSubmit)="customerForm.valid && createCustomer()">
                  <input #customerNameModel="ngModel" [attr.aria-label]="t('ui.m_e80x9i')" name="customerName" [placeholder]="t('ui.m_e80x9i')" required maxlength="160" [(ngModel)]="customerName" [attr.aria-invalid]="customerNameModel.invalid && (customerNameModel.touched || customerForm.submitted) ? 'true' : null" [attr.aria-describedby]="customerNameModel.invalid && (customerNameModel.touched || customerForm.submitted) ? 'customer-name-error' : null">
                  @if (customerNameModel.invalid && (customerNameModel.touched || customerForm.submitted)) {
                    <small id="customer-name-error" class="field-error" aria-live="polite">{{ t('ui.m_1ucyubn') }}</small>
                  }
                  <input #customerEmailModel="ngModel" [attr.aria-label]="t('ui.m_1hdfjhy')" name="customerEmail" type="email" maxlength="254" [placeholder]="t('ui.m_u2wvbv')" [(ngModel)]="customerEmail" [attr.aria-invalid]="customerEmailModel.invalid && (customerEmailModel.touched || customerForm.submitted) ? 'true' : null" [attr.aria-describedby]="customerEmailModel.invalid && (customerEmailModel.touched || customerForm.submitted) ? 'customer-email-error' : null">
                  @if (customerEmailModel.invalid && (customerEmailModel.touched || customerForm.submitted)) {
                    <small id="customer-email-error" class="field-error" aria-live="polite">{{ t('ui.m_stzy3f') }}</small>
                  }
                  <input [attr.aria-label]="t('ui.m_jf17kv')" name="customerPhone" maxlength="32" [placeholder]="t('ui.m_1fpllb8')" [(ngModel)]="customerPhone">
                  <button class="primary" type="submit" [disabled]="loading">{{ t('ui.m_zesk98') }}</button>
                </form>

                  </div>
                </details>
                @if (customerMessage) { <aba-state-message [kind]="customerMessageKind" [description]="customerMessage" /> }
                @if (business?.role === 'owner') { <details class="aba-record-secondary"><summary><span>{{ t('ui.m_p4xhry') }}</span><span aria-hidden="true">⌄</span></summary><div class="aba-record-secondary__body"><section abaCard class="csv-import-panel" [attr.aria-label]="t('ui.m_1cobl8b')">
                  <h3>{{ t('ui.m_p4xhry') }}</h3>
                  <p>{{ t('ui.m_1239wd4') }}</p>
                  <input type="file" accept=".csv,text/csv" [attr.aria-label]="t('ui.m_1m32l6p')" (change)="onCustomerImportFileSelected($event)" [disabled]="customerImportLoading">
                  @if (customerImportFileName) { <small>{{ customerImportFileName }}</small> }
                  <div class="csv-import-actions">
                    <button class="secondary" type="button" (click)="previewCustomerImport()" [disabled]="customerImportLoading || !customerImportCsvText">{{ customerImportLoading ? t('ui.m_1idcscy') : t('ui.m_fa926w') }}</button>
                    @if (customerImportPreview?.valid) { <button class="primary" type="button" (click)="confirmCustomerImport()" [disabled]="customerImportLoading">{{ t('ui.m_1njm451') }} {{ customerImportPreview?.row_count }} {{ t('ui.m_xwx2zw') }}</button> }
                  </div>
                  @if (customerImportPreview) {
                    <aba-state-message [kind]="customerImportPreview.valid ? 'info' : 'warning'" [description]="customerImportPreview.valid ? t('ui.m_17hi1u7') + ' · ' + customerImportPreview.row_count + ' ' + t('ui.m_xwx2zw') : t('ui.m_187ekp') + ' · ' + customerImportPreview.row_count + ' ' + t('ui.m_xwx2zw')" />
                    @if (customerImportPreview.errors.length) {
                      <ul class="csv-import-errors">
                        @for (item of customerImportPreview.errors; track $index) {
                          <li>{{ t('ui.m_foews7') }} {{ item.row }} · {{ item.field }} · {{ importErrorLabel(item.code) }}@if (item.max_length) { ({{ t('ui.m_a9jpls') }} {{ item.max_length }}) }</li>
                        }
                      </ul>
                    }
                  }
                  @if (customerImportMessage) { <aba-state-message [kind]="customerImportMessageKind" [description]="customerImportMessage" /> }
                </section></div></details> } @else { <aba-state-message kind="info" [description]="t('ui.m_15zjjtn')" /> }
                <div class="list-tools aba-record-toolbar"><input name="customerSearch" type="search" [attr.aria-label]="t('ui.m_cbuclg')" [placeholder]="t('ui.m_oe2vue')" [(ngModel)]="customerSearch">@if (business?.role === 'owner') { <button class="secondary" type="button" (click)="exportCurrentList()">{{ t('ui.m_nbsw3y') }}</button> }</div>
                <aba-customer-directory [ariaLabel]="t('ui.m_5lit5y')" [customers]="filteredCustomers" [locale]="language" [loading]="loading && !customers.length" [loadingDescription]="t('ui.m_14qa8nk')" [emptyTitle]="t('ui.m_v7mhxb')" [emptyDescription]="customerSearch.trim() ? t('ui.m_1lfpojf') : t('ui.m_9nmick')" (rowAction)="onCustomerRecordAction($event)" />
                @if (customersHasMore || customersLoadingMore) {
                  <div class="inline-form record-load-more" aria-live="polite">
                    <span class="muted">{{ customers.length }} {{ t('ui.m_1sao2d6') }}</span>
                    <button class="secondary" type="button" (click)="loadMoreCustomers()" [disabled]="customersLoadingMore">
                      {{ customersLoadingMore ? t('ui.m_14qa8nk') : t('ui.m_1m9ykss') }}
                    </button>
                  </div>
                }

                @if (statementVisible) {
                  <section abaCard class="panel statement-panel">
                    <aba-section-header [level]="3" [title]="t('ui.m_152dm1w') + ' · ' + (customerStatement?.customer?.name || statementCustomerName)" [description]="t('ui.m_ysb7zm')"><button class="secondary" type="button" (click)="customerStatement=null; statementVisible=false; statementError=''">{{ t('ui.m_1whnkun') }}</button></aba-section-header>
                    <div class="inline-form statement-filters">
                      <label>{{ t('ui.m_6ousik') }}<input type="date" name="statementFromDate" [(ngModel)]="statementFromDate"></label>
                      <label>{{ t('ui.m_hltyrq') }}<input type="date" name="statementToDate" [(ngModel)]="statementToDate"></label>
                      <button class="primary" type="button" (click)="applyCustomerStatementFilters()" [disabled]="statementLoading">{{ t('ui.m_1vs0iyd') }}</button>
                      <button class="secondary" type="button" (click)="clearCustomerStatementFilters()" [disabled]="statementLoading || (!statementFromDate && !statementToDate)">{{ t('ui.m_1kg6ptq') }}</button>
                    </div>
                    @if (statementFromDate || statementToDate) { <p class="muted">{{ t('ui.m_gqq69s') }}</p> }
                    @if (statementLoading) { <aba-state-message kind="loading" [description]="t('ui.m_1jqptmt')" /> }
                    @if (statementError) { <aba-state-message kind="error" [description]="statementError" /> }
                    @if (customerStatement) {
                      <div class="metric-grid">@for (entry of statementBalanceEntries; track entry.currency) { <article class="metric"><span>{{ t('ui.m_lyblb3') }} · {{ entry.currency }}</span><strong>{{ entry.balance }} {{ entry.currency }}</strong></article> }</div>
                      <aba-record-table [ariaLabel]="t('ui.m_152dm1w')" [columns]="customerStatementTableColumns" [rows]="customerStatementTableRows" [emptyTitle]="t('ui.m_3op8q6')" [emptyDescription]="t('ui.m_18o73kt')" />
                      <div class="inline-form"><span class="muted">{{ statementOffset + 1 }}–{{ statementOffset + customerStatement.items.length }} / {{ customerStatement.total }}</span><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset > 50 ? statementOffset - 50 : 0)" [disabled]="statementLoading || statementOffset === 0">{{ t('ui.m_14wy3hz') }}</button><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset + 50)" [disabled]="statementLoading || statementOffset + customerStatement.items.length >= customerStatement.total">{{ t('ui.m_thb9eg') }}</button></div>
                      @for (limitation of customerStatement.limitations; track limitation) { <p class="muted">• {{ limitation }}</p> }
                    }
                  </section>
                }
          </section>
            }

            @if (tab === 'products') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_137u0ee') " [description]=" t('ui.m_snu8sb') "><span class="count">{{ filteredProducts.length }} / {{ products.length }} {{ t('ui.m_1hpnko') }}</span></aba-section-header>
<details class="aba-record-create" [open]="productCreateOpen" (toggle)="productCreateOpen = $any($event.target).open">
                  <summary><span>{{ t('ui.m_1nbakc8') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #productForm="ngForm" class="inline-form" (ngSubmit)="productForm.valid && createProduct()">
                  <label>{{ t('ui.m_h0c2cm') }}<input #productNameModel="ngModel" [attr.aria-label]="t('ui.m_h0c2cm')" name="productName" [placeholder]="t('ui.m_h0c2cm')" required [(ngModel)]="productName" [attr.aria-invalid]="productNameModel.invalid && (productNameModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productNameModel.invalid && (productNameModel.touched || productForm.submitted) ? 'product-name-error' : null">
                    @if (productNameModel.invalid && (productNameModel.touched || productForm.submitted)) {
                      <small id="product-name-error" class="field-error" aria-live="polite">{{ t('ui.m_1ymmcl') }}</small>
                    }
                  </label>
                  <label>{{ t('ui.m_1iz2xk3') }}<input #productPriceModel="ngModel" [attr.aria-label]="t('ui.m_1iz2xk3')" name="productPrice" type="number" min="0" step="0.01" [placeholder]="t('ui.m_1iz2xk3')" required [(ngModel)]="productPrice" [attr.aria-invalid]="productPriceModel.invalid && (productPriceModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productPriceModel.invalid && (productPriceModel.touched || productForm.submitted) ? 'product-price-error' : null">
                    @if (productPriceModel.invalid && (productPriceModel.touched || productForm.submitted)) {
                      <small id="product-price-error" class="field-error" aria-live="polite">{{ productPriceModel.errors?.['required'] ? t('ui.m_9pqcpe') : t('ui.m_1hiyjor') }}</small>
                    }
                  </label>
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> {{ t('ui.m_13pn7xu') }}</label>
                  @if (stockTracked) {
                    @if (business?.role === 'owner') {
                      <label>{{ t('ui.m_dsef9m') }}<input #productOpeningQuantityModel="ngModel" name="productOpeningQuantity" type="number" min="0" step="0.001" [(ngModel)]="productOpeningQuantity" required [attr.aria-invalid]="productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted) ? 'product-opening-quantity-error' : null">@if (productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted)) { <small id="product-opening-quantity-error" class="field-error" aria-live="polite">{{ productOpeningQuantityModel.errors?.['required'] ? t('ui.m_1tupg8c') : t('ui.m_1rtcb8u') }}</small> }</label>
                    } @else {
                      <small class="muted">{{ t('ui.m_1xw7d7y') }}</small>
                    }
                  }
                  <button class="primary" type="submit" [disabled]="loading">{{ t('ui.m_eex0xa') }}</button>
                </form>

                  </div>
                </details>
                @if (productMessage) { <aba-state-message [kind]="productMessageKind" [description]="productMessage" /> }
                @if (business?.role === 'owner') { <details class="aba-record-secondary"><summary><span>{{ t('ui.m_1wgx28b') }}</span><span aria-hidden="true">⌄</span></summary><div class="aba-record-secondary__body"><section abaCard class="csv-import-panel" [attr.aria-label]="t('ui.m_ps78ce')">
                  <h3>{{ t('ui.m_1wgx28b') }}</h3>
                  <p>{{ t('ui.m_1kaqi1p') }}</p>
                  <input type="file" accept=".csv,text/csv" [attr.aria-label]="t('ui.m_1yr2ptt')" (change)="onImportFileSelected($event)" [disabled]="importLoading">
                  @if (importFileName) { <small>{{ importFileName }}</small> }
                  <div class="csv-import-actions">
                    <button class="secondary" type="button" (click)="previewProductImport()" [disabled]="importLoading || !importCsvText">{{ importLoading ? t('ui.m_1idcscy') : t('ui.m_fa926w') }}</button>
                    @if (importPreview?.valid) { <button class="primary" type="button" (click)="confirmProductImport()" [disabled]="importLoading">{{ t('ui.m_1njm451') }} {{ importPreview?.row_count }} {{ t('ui.m_xwx2zw') }}</button> }
                  </div>
                  @if (importPreview) {
                    <aba-state-message [kind]="importPreview.valid ? 'info' : 'warning'" [description]="importPreview.valid ? t('ui.m_17hi1u7') + ' · ' + importPreview.row_count + ' ' + t('ui.m_xwx2zw') : t('ui.m_187ekp') + ' · ' + importPreview.row_count + ' ' + t('ui.m_xwx2zw')" />
                    @if (importPreview.errors.length) {
                      <ul class="csv-import-errors">
                        @for (item of importPreview.errors; track $index) {
                          <li>{{ t('ui.m_foews7') }} {{ item.row }} · {{ item.field }} · {{ importErrorLabel(item.code) }}@if (item.first_row) { ({{ t('ui.m_q66wuq') }} {{ item.first_row }}) }@if (item.max_length) { ({{ t('ui.m_a9jpls') }} {{ item.max_length }}) }</li>
                        }
                      </ul>
                    }
                  }
                  @if (importMessage) { <aba-state-message [kind]="importMessageKind" [description]="importMessage" /> }
                </section></div></details> } @else { <aba-state-message kind="info" [description]="t('ui.m_15zjjtn')" /> }
                <div class="list-tools aba-record-toolbar"><input name="productSearch" type="search" [attr.aria-label]="t('ui.m_1y4yidi')" [placeholder]="t('ui.m_12onvgc')" [(ngModel)]="productSearch">@if (business?.role === 'owner') { <button class="secondary" type="button" (click)="exportCurrentList()">{{ t('ui.m_nbsw3y') }}</button> }</div>
                <aba-product-catalog [ariaLabel]="t('ui.m_1q9q53d')" [products]="filteredProducts" [locale]="language" [currencyCode]="business?.currency_code || ''" [loading]="loading && !products.length" [loadingDescription]="t('ui.m_dm5wol')" [emptyTitle]="t('ui.m_12dkqai')" [emptyDescription]="productSearch.trim() ? t('ui.m_87y3du') : t('ui.m_nd32m5')" />
                @if (productsHasMore || productsLoadingMore) {
                  <div class="inline-form record-load-more" aria-live="polite">
                    <span class="muted">{{ products.length }} {{ t('ui.m_1s9tcxi') }}</span>
                    <button class="secondary" type="button" (click)="loadMoreProducts()" [disabled]="productsLoadingMore">
                      {{ productsLoadingMore ? t('ui.m_dm5wol') : t('ui.m_iziq6h') }}
                    </button>
                  </div>
                }

            </section>
            }

            @if (tab === 'invoices') {
              <section abaCard class="panel">
                <aba-section-header id="invoices-section-heading" tabindex="-1" [title]=" t('ui.m_5lvhyt') " [description]=" t('ui.m_61q6l7') "><span class="count">{{ filteredInvoices.length }} / {{ invoices.length }} {{ t('ui.m_pe8fvb') }}</span></aba-section-header>
                <div class="invoice-toolbar">
                  @if (invoiceCreateOpen) {
                    <section class="invoice-create-panel" [attr.aria-label]="t('ui.m_h8xosr')">
                      <aba-invoice-draft-editor
                        [language]="language" [products]="products" [customers]="customers"
                        [currencyCode]="business.currency_code" [invoiceNumber]="invoiceNumber"
                        [customerId]="invoiceCustomerId" [discountRate]="invoiceDiscountRate"
                        [taxRate]="invoiceTaxRate" [initialNotes]="invoiceDraftNotes"
                        [saving]="invoiceDraftSaving" [blocked]="invoiceDraftUncertain"
                        [serverSummary]="invoiceDraftSummary" [initialLines]="invoiceDraftInitialLines"
                        [draftRevision]="invoiceDraftRevision" [editing]="!!editingInvoiceId"
                        [hasMoreCustomers]="customersHasMore" [hasMoreProducts]="productsHasMore"
                        [loadingMoreCustomers]="customersLoadingMore" [loadingMoreProducts]="productsLoadingMore"
                        (loadMoreCustomers)="loadMoreInvoiceCustomers()" (loadMoreProducts)="loadMoreInvoiceProducts()"
                        (saveDraft)="saveInvoiceDraft($event)" (newDraft)="startNewInvoiceDraft()"
                        (cancel)="cancelInvoiceEdit()" (refreshStatus)="refreshInvoiceDraftStatus()" />
                    </section>
                  } @else {
                    <button type="button" class="primary invoice-create-button" (click)="startNewInvoiceDraft()">
                      {{ t('ui.m_12vszs4') }}
                    </button>
                  }
                </div>
                @if (invoiceMessage) { <aba-state-message [kind]="invoiceMessageKind" [description]="invoiceMessage" /> }
                <div class="invoice-controls">
                  <label class="invoice-search">
                    <svg class="invoice-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                    <input name="invoiceSearch" type="search" [attr.aria-label]="t('ui.m_qwjq9v')" [placeholder]="t('ui.m_2onysz')" [(ngModel)]="invoiceSearch">
                  </label>
                  <label class="invoice-filter"><span>{{ t('ui.m_jnmvwl') }}</span>
                    <select name="invoiceStatusFilter" [attr.aria-label]="t('ui.m_1v8j5sa')" [(ngModel)]="invoiceStatusFilter">
                      <option value="all">{{ t('ui.m_1cyu9lp') }}</option>
                      <option value="draft">{{ t('ui.m_1vbs2bw') }}</option>
                      <option value="issued">{{ t('ui.m_7bugfd') }}</option>
                      <option value="void">{{ t('ui.m_1a2uk7t') }}</option>
                    </select>
                  </label>
                  <label class="invoice-filter"><span>{{ t('ui.m_ubgrc2') }}</span>
                    <select name="invoiceFilterCustomer" [attr.aria-label]="t('ui.m_1k3k63e')" [(ngModel)]="invoiceFilterCustomerId">
                      <option value="">{{ t('ui.m_1c6r7y7') }}</option>
                      @for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }
                    </select>
                  </label>
                  @if (customersHasMore) {
                    <button class="secondary invoice-load-more-customers" type="button" (click)="loadMoreInvoiceCustomers()" [disabled]="customersLoadingMore">
                      {{ customersLoadingMore ? t('ui.m_14qa8nk') : t('ui.m_8ighyf') }}
                    </button>
                  }
                  @if (business?.role === 'owner') { <button class="secondary invoice-export" type="button" (click)="exportCurrentList()" [disabled]="!filteredInvoices.length">{{ t('ui.m_nbsw3y') }}</button> }
                </div>
                @if (loading && !invoices.length) {
                  <p class="invoice-list-state" role="status" aria-live="polite">{{ t('ui.m_x2q4oa') }}</p>
                } @else if (error && !invoices.length) {
                  <aba-state-message kind="error" [description]="error" />
                } @else if (!filteredInvoices.length) {
                  <aba-state-message kind="empty" [description]="(invoiceSearch || invoiceStatusFilter !== 'all' || invoiceFilterCustomerId) ? t('ui.m_1rrfha5') : t('ui.m_1ehm2eq')" />
                } @else {
                  <div class="invoice-cards">
                    @for (invoice of filteredInvoices; track invoice.id) {
                      <article class="invoice-card">
                        <header class="invoice-card-header">
                          <div class="invoice-card-customer">
                            <span class="invoice-customer-avatar" aria-hidden="true">{{ customerInitialForInvoice(invoice.customer_id) }}</span>
                            <div class="invoice-card-customer-copy">
                              <strong>{{ customerNameForInvoice(invoice.customer_id) }}</strong>
                              <small class="invoice-card-meta">{{ invoice.invoice_number }} · {{ invoice.issue_date ? formatRecordDate(invoice.issue_date, 'date') : (invoice.created_at ? t('ui.m_1ipvpcp') + formatRecordDate(invoice.created_at, 'date') : t('ui.m_8ghcxc')) }} · <bdi dir="ltr">{{ invoice.currency_code }}</bdi></small>
                            </div>
                          </div>
                          <span class="invoice-status-badge"
                            [class.status-draft]="invoiceCardStatusTone(invoice) === 'draft'"
                            [class.status-issued]="invoiceCardStatusTone(invoice) === 'issued'"
                            [class.status-void]="invoiceCardStatusTone(invoice) === 'void'"
                            [class.status-paid]="invoiceCardStatusTone(invoice) === 'paid'"
                            [class.status-partial]="invoiceCardStatusTone(invoice) === 'partial'"
                            [class.status-unpaid]="invoiceCardStatusTone(invoice) === 'unpaid'">{{ invoiceCardStatusLabel(invoice) }}</span>
                        </header>
                        <div class="invoice-card-financials">
                          <div>
                            <small>{{ t('ui.m_l97slj') }}</small>
                            <strong><bdi dir="ltr">{{ formatNumber(invoice.total) }}</bdi></strong>
                          </div>
                          <div>
                            <small>{{ t('ui.m_twygqw') }}</small>
                            <strong>@if (invoice.allocated_payments !== undefined) {
                              <bdi dir="ltr">{{ formatNumber(invoice.allocated_payments) }}</bdi>
                            } @else { — }</strong>
                          </div>
                          <div>
                            <small>{{ t('ui.m_1e1esfj') }}</small>
                            <strong>@if (invoice.status === 'issued' && invoice.outstanding_amount !== undefined) {
                              <bdi dir="ltr">{{ formatNumber(invoice.outstanding_amount) }}</bdi>
                            } @else { — }</strong>
                          </div>
                        </div>
                        @if (invoicePaymentProgress(invoice) !== null) {
                          <div class="invoice-payment-progress"
                            [class.tone-paid]="invoicePaymentTone(invoice) === 'paid'"
                            [class.tone-partial]="invoicePaymentTone(invoice) === 'partial'"
                            [class.tone-unpaid]="invoicePaymentTone(invoice) === 'unpaid'"
                            role="progressbar"
                            [attr.aria-label]="t('ui.m_18e9r9q')"
                            [attr.aria-valuemin]="0" [attr.aria-valuemax]="100"
                            [attr.aria-valuenow]="invoicePaymentProgress(invoice)">
                            <span [style.width.%]="invoicePaymentProgress(invoice)"></span>
                          </div>
                          <div class="invoice-payment-caption"
                            [class.tone-paid]="invoicePaymentTone(invoice) === 'paid'"
                            [class.tone-partial]="invoicePaymentTone(invoice) === 'partial'"
                            [class.tone-unpaid]="invoicePaymentTone(invoice) === 'unpaid'">
                            <small>{{ invoicePaymentProgressLabel(invoice) }}</small>
                          </div>
                        }
                        <div class="invoice-actions">
                          @if (invoice.status === 'draft') {
                            <button class="secondary" type="button" (click)="editInvoice(invoice)" [disabled]="loading">{{ t('ui.m_s21yyp') }}</button>
                            @if (business?.role === 'owner') {
                              <button class="secondary" type="button" (click)="issueInvoice(invoice)" [disabled]="loading">{{ t('ui.m_ninief') }}</button>
                              <button class="secondary danger" type="button" (click)="requestInvoiceVoid(invoice, $event)" [disabled]="loading">{{ t('ui.m_lnwycg') }}</button>
                            }
                          } @else if (invoice.status === 'issued') {
                            <button class="secondary" type="button" (click)="printInvoice(invoice)" [disabled]="loading">{{ t('ui.m_qskvru') }}</button>
                            @if (business?.role === 'owner') {
                              @if (hasOutstandingBalance(invoice)) { <button class="secondary" type="button" (click)="payInvoice(invoice)" [disabled]="loading">{{ t('ui.m_1r6bzbj') }}</button> }
                              <button class="secondary danger" type="button" (click)="requestInvoiceVoid(invoice, $event)" [disabled]="loading">{{ t('ui.m_lnwycg') }}</button>
                            }
                          }
                        </div>
                      </article>
                    }
                  </div>
                }
                @if (invoicesHasMore) { <button class="secondary" type="button" (click)="loadMoreInvoices()" [disabled]="invoicesLoadingMore">{{ invoicesLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_14d2jh7') }}</button> }
                <p class="footnote">{{ t('ui.m_lpprue') }}</p>
              </section>
            }

            @if (tab === 'payments' && business?.role !== 'owner') {
              <section abaCard class="panel"><aba-state-message kind="error" [description]="t('ui.m_1ju8ouz')" /></section>
            }
            @if (tab === 'payments' && business.role === 'owner') {
              <section abaCard class="panel"><aba-section-header [title]="t('ui.m_3k0fux')" [description]="t('ui.m_cj3m99')">
                  <div class="section-actions"><span class="count">{{ filteredPayments.length }} / {{ payments.length }} {{ t('ui.m_1ouah2m') }}</span><button class="secondary" type="button" (click)="exportPaymentsCsv()" [disabled]="!payments.length">{{ t('ui.m_nbsw3y') }}</button></div>
                </aba-section-header>
                <form #paymentForm="ngForm" class="inline-form payment-form" (ngSubmit)="(paymentRetryPending || paymentForm.valid) && createPayment()">
                  <input #paymentAmountModel="ngModel" [attr.aria-label]="t('ui.m_q9mxbb')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_1smcjxm')" required [(ngModel)]="paymentAmount" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'payment-amount-error' : null">@if (paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted)) { <small id="payment-amount-error" class="field-error" aria-live="polite">{{ t('ui.m_me0lkl') }}</small> }
                  <select #paymentCustomerModel="ngModel" [attr.aria-label]="t('ui.m_edaho8')" name="paymentCustomer" required [(ngModel)]="paymentCustomerId" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'payment-customer-error' : null"><option value="" disabled>{{ t('ui.m_p0vza7') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select>@if (paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted)) { <small id="payment-customer-error" class="field-error" aria-live="polite">{{ t('ui.m_5b5dll') }}</small> }
                  <select [attr.aria-label]="t('ui.m_h7ngs9')" name="paymentMethod" [(ngModel)]="paymentMethod" [disabled]="paymentRetryPending"><option value="cash">{{ t('ui.m_1xk4i7j') }}</option><option value="bank_transfer">{{ t('ui.m_bof380') }}</option><option value="card">{{ t('ui.m_tq9n36') }}</option><option value="wallet">{{ t('ui.m_1bho9og') }}</option><option value="other">{{ t('ui.m_47rh1w') }}</option></select>
                  <select [attr.aria-label]="t('ui.m_vkei9c')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId" [disabled]="paymentRetryPending" (ngModelChange)="syncPaymentCustomer()"><option value="">{{ t('ui.m_1xrgrqj') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (invoicesHasMore) { <button type="button" class="secondary" (click)="loadMoreInvoices()" [disabled]="invoicesLoadingMore || paymentRetryPending">{{ invoicesLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_14d2jh7') }}</button> }
                  @if (paymentInvoiceId) { <input [attr.aria-label]="t('ui.m_lc0rf5')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_1okokqi')" [(ngModel)]="paymentAllocationAmount" [disabled]="paymentRetryPending"> }
                  <input [attr.aria-label]="t('ui.m_15jj1na')" name="paymentReference" maxlength="128" [placeholder]="t('ui.m_v160u1')" [(ngModel)]="paymentReference" [disabled]="paymentRetryPending">
                  <button class="primary" type="submit" [disabled]="paymentLoading">{{ paymentLoading ? t('ui.m_1ty0fxd') : paymentRetryPending ? t('ui.m_1pvlpdc') : t('ui.m_3k0fux') }}</button>
                </form>
                @if (paymentRetryPending) { <p class="footnote" role="status">{{ t('ui.m_1yhgb5f') }}</p> }
                @if (paymentMessage) { <aba-state-message [kind]="paymentMessageKind" [description]="paymentMessage" /> }
                <p class="footnote">{{ t('ui.m_1c93fyv') }} {{ business.currency_code }} {{ t('ui.m_1sweklr') }}</p>
                <div class="list-tools operations-search aba-record-toolbar"><input name="paymentSearch" type="search" [attr.aria-label]="t('ui.m_nmj0be')" [placeholder]="t('ui.m_hoei9y')" [(ngModel)]="paymentSearch"></div>
                <aba-record-table [ariaLabel]="t('ui.m_mxsp4b')" [columns]="paymentTableColumns" [rows]="paymentTableRows" [loading]="paymentLoading && !payments.length" [loadingDescription]="t('ui.m_1kn1f7h')" [emptyTitle]="t('ui.m_1c2srea')" [emptyDescription]="paymentSearch.trim() ? t('ui.m_1igz78g') : t('ui.m_1nttjd')" />
                @if (paymentsHasMore) { <button class="secondary" type="button" (click)="loadMorePayments()" [disabled]="paymentsLoadingMore">{{ paymentsLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_1olqej1') }}</button> }
              </section>
            }

            @if (tab === 'taxes' && business.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('ui.m_nxo405')" [description]="t('ui.m_1dw63nh')" />
                <form class="inline-form" (ngSubmit)="loadTaxSummary()">
                  <label>{{ t('ui.m_10pndrs') }}<input name="taxStartDate" type="date" [(ngModel)]="taxStartDate"></label>
                  <label>{{ t('ui.m_aulmks') }}<input name="taxEndDate" type="date" [(ngModel)]="taxEndDate"></label>
                  <button class="primary" type="submit" [disabled]="taxLoading">{{ taxLoading ? t('ui.m_1k98007') : t('ui.m_10jsbot') }}</button>
                </form>
                @if (taxError) { <aba-state-message kind="error" [description]="taxError" /> }
                @if (taxSummaryReport) {
                  <aba-record-table [ariaLabel]="t('ui.m_1ciqipn')" [columns]="taxTableColumns" [rows]="taxTableRows" [emptyTitle]="t('ui.m_1xb2mzp')" [emptyDescription]="t('ui.m_j6qlz4')" />
                  @for (limitation of taxSummaryReport.limitations; track limitation) { <p class="muted">• {{ reportLimitationLabel(limitation) }}</p> }
                }
              </section>
            }

            @if (tab === 'audit') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('ui.m_hd46sj')" [description]="t('ui.m_fie4u1')"><span class="count">{{ auditTotal }} {{ t('ui.m_187o97') }}</span></aba-section-header>
                 <form class="inline-form" (ngSubmit)="loadAuditEvents(0)">
                  <label>{{ t('ui.m_16u0xte') }}<select name="auditAction" [(ngModel)]="auditAction">
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
                  </select></label>
                  <label>{{ t('ui.m_1bu5iqp') }}<select name="auditTarget" [(ngModel)]="auditTargetType">
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
                  </select></label>
                  <button class="primary" type="submit" [disabled]="auditLoading">{{ t('ui.m_11q6v6c') }}</button>
                  <button class="secondary" type="button" (click)="auditAction=''; auditTargetType=''; loadAuditEvents(0)" [disabled]="auditLoading">{{ t('ui.m_1np7zc4') }}</button>
                </form>
                @if (auditError) { <aba-state-message kind="error" [description]="auditError" /> }
                <aba-record-table [ariaLabel]="t('ui.m_j3pe5o')" [columns]="auditTableColumns" [rows]="auditTableRows" [loading]="auditLoading && !auditEvents.length" [loadingDescription]="t('ui.m_19p9gnl')" [emptyTitle]="t('ui.m_1en86jm')" [emptyDescription]="t('ui.m_1f0oymq')" />
                <div class="inline-form"><span class="muted">{{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} / {{ auditTotal }}</span><button class="secondary" type="button" (click)="loadAuditEvents((auditOffset > 50 ? auditOffset - 50 : 0))" [disabled]="auditLoading || auditOffset === 0">{{ t('ui.m_14wy3hz') }}</button><button class="secondary" type="button" (click)="loadAuditEvents(auditOffset + 50)" [disabled]="auditLoading || auditOffset + auditEvents.length >= auditTotal">{{ t('ui.m_thb9eg') }}</button></div>
              </section>
            }

            @if (tab === 'release-guide') {
              @defer (when tab === 'release-guide') {
                <aba-release-guide [language]="language" [appVersion]="appVersion" />
              } @placeholder {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="loading" [description]="t('ui.m_111geup')" />
                </section>
              }
            }

            @if (tab === 'employees' && business.role === 'owner') {
              @defer (when tab === 'employees' && business.role === 'owner') {
                <aba-employee-payroll [businessId]="business.id" [currencyCode]="business.currency_code" [language]="language" (payrollPaid)="refreshAfterPayrollPayment()"></aba-employee-payroll>
              } @placeholder {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="loading" [description]="t('ui.m_9hwp1p')" />
                </section>
              }
            }

            @if (tab === 'expenses') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('ui.m_p4p38y')" [description]="t('ui.m_ehnfke')" [count]="filteredExpenses.length + ' / ' + expenses.length + ' ' + t('ui.m_7rwk8h')" />
                <form #expenseForm="ngForm" class="inline-form expense-form" (ngSubmit)="expenseForm.valid && createExpense()">
                  <label class="expense-category-field">{{ t('ui.m_10l7fjw') }}<select #expenseCategoryControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_10l7fjw')" [attr.aria-invalid]="expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted) ? 'expense-category-error' : null" name="expenseCategory" required [(ngModel)]="expenseCategory">
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
                  <input #expenseDescriptionControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_tfnzm8')" [attr.aria-invalid]="expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted) ? 'expense-description-error' : null" name="expenseDescription" maxlength="500" [placeholder]="t('ui.m_1552j8m')" required [(ngModel)]="expenseDescription">
                  <input #expenseAmountControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_19u7acj')" [attr.aria-invalid]="expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted) ? 'expense-amount-error' : null" name="expenseAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_i3lh6b')" required [(ngModel)]="expenseAmount">
                  <input #expenseDateControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_1tz0tea')" [attr.aria-invalid]="expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted) ? 'expense-date-error' : null" name="expenseDate" type="datetime-local" required [(ngModel)]="expenseDate">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_w7k03r')" name="expenseVendor" maxlength="160" [placeholder]="t('ui.m_1klr7r6')" [(ngModel)]="expenseVendor">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('ui.m_8m31k6')" name="expenseReference" maxlength="128" [placeholder]="t('ui.m_v160u1')" [(ngModel)]="expenseReference">
                  <button class="primary" type="submit" [disabled]="loading || expenseSubmissionUncertain">{{ t('ui.m_xi9fpn') }}</button>
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
                <p class="footnote">{{ t('ui.m_ks5nuz') }} {{ business.currency_code }}. {{ t('ui.m_1r2awxh') }}</p>
                @if (expenseMessage) { <aba-state-message kind="success" [description]="expenseMessage" /> }
                @if (expenseSubmissionUncertain) {
                  <aba-state-message kind="error" [description]="t('ui.m_bv3h04')" [actionLabel]="t('ui.m_r6p4yr')" [actionDisabled]="loading" (action)="checkExpenseSubmissionOutcome()" />
                }
                <div class="list-tools operations-search aba-record-toolbar"><input name="expenseSearch" type="search" [attr.aria-label]="t('ui.m_qat44q')" [placeholder]="t('ui.m_34prmq')" [(ngModel)]="expenseSearch"></div>
                <aba-record-table [ariaLabel]="t('ui.m_zyptez')" [columns]="expenseTableColumns" [rows]="expenseTableRows" [loading]="loading && !expenses.length" [loadingDescription]="t('ui.m_luj2e5')" [emptyTitle]="t('ui.m_ia2bhy')" [emptyDescription]="expenseSearch.trim() ? t('ui.m_1ow9n49') : t('ui.m_1xx6js5')" />
              </section>
            }

            @if (tab === 'integrity' && business.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_3j4vfw') " [description]=" t('ui.m_rq55ji') "><span class="count">{{ formatRecordDate(dataIntegrityReport?.generated_at, 'short') || t('ui.m_xo2kma') }}</span></aba-section-header>
                <button class="primary" type="button" (click)="loadDataIntegrity(0)" [disabled]="integrityLoading">{{ integrityLoading ? t('ui.m_1v22gnm') : t('ui.m_t1s0tt') }}</button>
                @if (integrityError) { <aba-state-message kind="error" [description]="integrityError" /> }
                @if (dataIntegrityReport) {
                  <div class="notice warning-notice"><strong>{{ t('ui.m_8kfz56') }}</strong><span>{{ integrityWarningLabel(dataIntegrityReport.warning) }}</span></div>
                  <div class="metric-grid">
                    <article class="metric"><span>{{ t('ui.m_r33nse') }}</span><strong>{{ dataIntegrityReport.unlinked_issued_invoices.total }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_56uiuq') }}</span><strong>{{ dataIntegrityReport.currency_mismatched_allocations.total }}</strong></article>
                    <article class="metric"><span>{{ t('ui.m_15jyanv') }}</span><strong>{{ dataIntegrityReport.customer_mismatched_allocations.total }}</strong></article>
                  </div>
                  <h3>{{ t('ui.m_h5fuqc') }}</h3>
                  <aba-record-table [ariaLabel]="t('ui.m_1muvs8z')" [columns]="integrityInvoiceColumns" [rows]="integrityInvoiceRows" [emptyTitle]="t('ui.m_ej8yte')" [emptyDescription]="t('ui.m_ydex7x')" />
                  <h3>{{ t('ui.m_ord1a3') }}</h3>
                  <aba-record-table [ariaLabel]="t('ui.m_xbtfmu')" [columns]="integrityAllocationColumns" [rows]="integrityAllocationRows" [emptyTitle]="t('ui.m_hrqqij')" [emptyDescription]="t('ui.m_uxsaek')" />
                  <div class="inline-form"><span class="muted">{{ t('ui.m_3dypht') }} {{ dataIntegrityReport.offset }} · {{ t('ui.m_1o0uw0o') }} {{ dataIntegrityReport.limit }}</span><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset > 0 ? dataIntegrityReport.offset - dataIntegrityReport.limit : 0)" [disabled]="integrityLoading || dataIntegrityReport.offset === 0">{{ t('ui.m_14wy3hz') }}</button><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset + dataIntegrityReport.limit)" [disabled]="integrityLoading || dataIntegrityReport.offset + dataIntegrityReport.limit >= maxIntegrityTotal">{{ t('ui.m_thb9eg') }}</button></div>
                }
              </section>
            }

            @if (tab === 'assistant') {
              <div class="assistant-workspace" [class.has-chat]="chatMessages.length > 0">
              <section abaCard class="panel chat-panel">
                <aba-section-header [title]=" t('ui.m_1ajyrpz') " [description]=" t('ui.m_1yriqyt') ">
                  <div class="chat-header-actions">
                    <span class="count">{{ t('ui.m_1bvwx8l') }}</span>
                    <button type="button" class="chat-new-button" (click)="startNewChat()" [disabled]="chatSending || (!chatMessages.length && !chatDraft.trim())">{{ t('ui.m_gz9o3g') }}</button>
                  </div>
                </aba-section-header>
                <div #chatLog class="chat-log" role="log" tabindex="0" aria-live="polite" aria-relevant="additions" aria-atomic="false" [attr.aria-busy]="chatSending ? 'true' : null" [attr.aria-label]="t('ui.m_180k0we')">
                  @if (!chatMessages.length) { <aba-state-message kind="empty" [description]="t('ui.m_1dsxkpa')" /> }
                  @for (message of chatMessages; track $index; let messageIndex = $index) {
                    <article class="chat-message" [class.user-message]="message.role === 'user'">
                      <div class="chat-message-head">
                        <span>{{ message.role === 'user' ? t('ui.m_ma3u89') : t('ui.m_dzn3ev') }}</span>
                        @if (message.role === 'assistant') {
                          <button type="button" class="chat-copy-button" (click)="copyAssistantMessage(message.content, messageIndex)" [attr.aria-label]="t('ui.m_14dh0xk')">
                            <span aria-live="polite">{{ chatCopyStatus?.index === messageIndex ? (chatCopyStatus?.success ? t('ui.m_d2vkge') : t('ui.m_qenrab')) : t('ui.m_1dtdc5p') }}</span>
                          </button>
                        }
                      </div>
                      @if (message.mode === 'local-fallback') { <small class="source-list">{{ t('ui.m_1raguvh') }}</small> }
                      <p>{{ message.content }}</p>
                      @if (message.sources?.length) { <small class="source-list">{{ t('ui.m_1uui693') }} @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? t('ui.m_1nfhuv2') : (source.type === 'expense' ? t('ui.m_q7obp1') : source.type) }} · {{ source.invoice_number || (source.type === 'expense' && source.category ? expenseCategoryLabel(source.category) : (source.category || source.id)) }}</span> }</small> }
                    </article>
                  }
                </div>
                
                @if (chatError) { <aba-state-message kind="error" [description]="chatError" [actionLabel]="chatConfigurationMissing ? '' : t('ui.m_worzj7')" [actionDisabled]="chatSending || !chatDraft.trim()" (action)="sendChat()" /> }
                @if (chatSending) { <aba-state-message kind="loading" [description]="t('ui.m_1xguwi5')" /> }
                <form #chatForm="ngForm" class="chat-form" (ngSubmit)="chatForm.valid && chatDraft.trim() && sendChat()"><textarea #chatMessageControl="ngModel" name="chatMessage" rows="2" maxlength="2000" enterkeyhint="send" (keydown.enter)="handleChatKeydown($any($event))" [attr.aria-label]="t('ui.m_1d2fatg')" [attr.aria-invalid]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'true' : null" [attr.aria-describedby]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'chat-message-hint chat-message-error' : 'chat-message-hint'" [placeholder]="t('ui.m_1pafgoq')" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea><button class="primary" type="submit" [disabled]="chatSending || !chatDraft.trim()">{{ chatSending ? t('ui.m_1sgwbzd') : t('ui.m_rf7y63') }}</button></form>
                <div class="chat-composer-meta"><small id="chat-message-hint">{{ t('ui.m_vdvf9x') }}</small><small>{{ chatDraft.length }} / 2000</small></div>
                @if ((chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted)) { <small id="chat-message-error" class="field-error" role="alert">{{ t('ui.m_18j0gfn') }}</small> }
                <p class="footnote">{{ t('ui.m_118u9lx') }}</p>
              </section>
              <aside class="assistant-suggestions" aria-label="{{ t('ui.m_1is9ve0') }}"><p>{{ t('ui.m_lxd4e7') }}</p><div class="suggestion-grid"><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_1clvjpr'))"><span class="suggestion-icon">↗</span><strong>{{ t('ui.m_1dkpjlm') }}</strong><small>{{ t('ui.m_70o2ur') }}</small></button><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_1ij9tr8'))"><span class="suggestion-icon">✦</span><strong>{{ t('ui.m_159lqb4') }}</strong><small>{{ t('ui.m_1ktypo7') }}</small></button><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_4tgkt3'))"><span class="suggestion-icon">▦</span><strong>{{ t('ui.m_yezco3') }}</strong><small>{{ t('ui.m_1a12moo') }}</small></button><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_xc417r'))"><span class="suggestion-icon">◎</span><strong>{{ t('ui.m_b2oroc') }}</strong><small>{{ t('ui.m_ap19ks') }}</small></button></div></aside>
              </div>
            }
          }
          <footer>{{ t('ui.m_1ajyrpz') }} <span>{{ t('ui.m_1f5dk3e') }}</span></footer>
          }
        </main>
      }
      @if (pendingInvoiceVoid) {
        <aba-confirm-dialog
          [title]="t('ui.m_azron7') + ' · ' + pendingInvoiceVoid.invoice_number"
          [message]="t('ui.m_13c8e52')"
          [warning]="t('ui.m_1rhb2df')"
          [confirmLabel]="t('ui.m_p2fc6q')"
          [cancelLabel]="t('ui.m_mbs8k3')"
          [busyLabel]="t('ui.m_1ex5gf4')"
          [busy]="loading"
          [confirmDisabled]="!!invoiceVoidError"
          [error]="invoiceVoidError"
          [tone]="'danger'"
          [returnFocusTo]="confirmationReturnFocus"
          [focusFallbackId]="'invoices-section-heading'"
          (confirmed)="confirmInvoiceVoid()"
          (cancelled)="cancelInvoiceVoid()" />
      }
      @if (pendingPurchaseApproval) {
        <aba-confirm-dialog
          [title]="t('ui.m_1pj46jy') + ' · ' + pendingPurchaseApproval.order_number"
          [message]="t('ui.m_o7tlrf')"
          [warning]="t('ui.m_wvb17f')"
          [detailsTitle]="t('ui.m_14aur8c')"
          [details]="pendingPurchaseApprovalDetails"
          [confirmLabel]="t('ui.m_4bqrmd')"
          [cancelLabel]="t('ui.m_1233hg7')"
          [busyLabel]="t('ui.m_z167k8')"
          [busy]="purchasesLoading"
          [confirmDisabled]="!!purchaseApprovalError"
          [error]="purchaseApprovalError"
          [tone]="'warning'"
          [returnFocusTo]="confirmationReturnFocus"
          [focusFallbackId]="'purchases-section-heading'"
          (confirmed)="confirmPurchaseOrderApproval()"
          (cancelled)="cancelPurchaseOrderApproval()" />
      }
      @if (pendingPurchaseReceipt) {
        <aba-confirm-dialog
          [title]="t('ui.m_qssa8w') + ' · ' + pendingPurchaseReceipt.order_number"
          [message]="t('ui.m_1srrito')"
          [warning]="t('ui.m_e0ddqk')"
          [detailsTitle]="t('ui.m_126kkr6')"
          [details]="pendingPurchaseReceiptDetails"
          [confirmLabel]="t('ui.m_vc9tiw')"
          [cancelLabel]="t('ui.m_1gc2kb4')"
          [busyLabel]="t('ui.m_k3q67h')"
          [busy]="purchasesLoading"
          [confirmDisabled]="!!purchaseReceiptError"
          [error]="purchaseReceiptError"
          [tone]="'warning'"
          [returnFocusTo]="confirmationReturnFocus"
          [focusFallbackId]="'purchases-section-heading'"
          (confirmed)="confirmPurchaseOrderReceipt()"
          (cancelled)="cancelPurchaseOrderReceipt()" />
      }

    </div>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#f6f8fb;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}
    
    .csv-import-panel{display:grid;gap:10px;margin:18px 0;padding:14px;border:1px solid #d1d5db;border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}.csv-import-panel h3,.csv-import-panel p{margin:0}.csv-import-panel h3{font-size:15px}.csv-import-panel p,.csv-import-panel small{font-size:12px;line-height:1.5;color:var(--aba-color-text-muted,#4b5563)}.csv-import-actions{display:flex;flex-wrap:wrap;gap:8px}.csv-import-errors{margin:0;padding-inline-start:22px;font-size:12px;color:#991b1b;display:grid;gap:5px;overflow-wrap:anywhere}.invoice-lines{display:grid;gap:10px;flex-basis:100%;width:100%}.invoice-lines-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.invoice-line-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(90px,1fr) auto;gap:10px;align-items:end;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}.invoice-line-row label{display:grid;gap:5px;min-width:0}.invoice-line-row select,.invoice-line-row input{width:100%;min-width:0}@media(max-width:600px){.invoice-line-row{grid-template-columns:minmax(0,1fr) minmax(88px,.65fr)}.invoice-line-row button{grid-column:1/-1;justify-self:start}}.topbar-heading{display:grid;gap:5px;min-width:0}.customer-invoice-filter{padding:12px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}.customer-invoice-filter label{width:100%;min-width:0}.customer-invoice-filter select{width:100%;min-width:0}.list-row{min-width:0;flex-wrap:wrap;gap:12px}.list-row .grow{min-width:120px;overflow-wrap:anywhere}.list-row>strong{overflow-wrap:anywhere;max-width:100%}.table-wrap{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px}.table-wrap table{width:100%;min-width:680px;border-collapse:separate;border-spacing:0}.table-wrap th,.table-wrap td{padding:11px 12px;text-align:start;vertical-align:top;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}.table-wrap th{position:sticky;top:0;background:#f1f5f9;color:var(--aba-color-text-muted,#334155);font-size:12px;white-space:nowrap}.table-wrap tbody tr:nth-child(even){background:var(--aba-color-surface-subtle,#f8fafc)}.table-wrap tbody tr:last-child td{border-bottom:0}@media(max-width:600px){.topbar-heading{width:100%}.list-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start}.list-row .grow{min-width:0}.list-row>button,.list-row>strong{grid-column:2;justify-self:start}.table-wrap table{min-width:760px}}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:var(--aba-focus-ring-offset,2px)}
    .aging-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin-top:12px}.aging-buckets>div{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid #e5e7eb;border-radius:9px;background:var(--aba-color-surface-subtle,#f8fafc)}.warning-notice{border-color:#f59e0b;background:#fffbeb}.divider{height:1px;background:#e5e7eb;margin:22px 0}
    .shell{min-height:100vh}.shell.auth-shell{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding-block:24px}.shell.auth-shell>.auth-card,.shell.auth-shell>.setup-card{margin:0 auto}.install-button{display:none}.mobile-install-card{display:none}.mobile-more,.mobile-more-menu{display:none}.language-row{display:flex;justify-content:flex-end;margin-bottom:8px}.language-toggle{min-height:38px}.sidebar{position:fixed;inset-block:0;inset-inline-end:0;width:var(--aba-layout-sidebar,245px);background:var(--aba-color-nav-surface,#111827);color:var(--aba-color-text-inverse,#e5e7eb);padding:26px 17px;display:flex;flex-direction:column;z-index:2}
    .brand{display:flex;align-items:center;gap:10px;color:var(--aba-color-text-inverse,#fff);text-decoration:none;font-size:16px;font-weight:800;padding:0 7px 38px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#a7f3d0;color:#064e3b;font-size:21px;font-weight:900;margin-bottom:20px}.brand-mark.small{width:34px;height:34px;border-radius:11px;margin:0;font-size:16px}.light{font-weight:400;color:var(--aba-color-nav-muted,#9ca3af);margin-inline-start:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:var(--aba-color-text-tertiary,#6b7280);margin:0 0 8px}.nav-label{font-size:10px;color:var(--aba-color-nav-muted,#9ca3af);letter-spacing:1.5px;padding:0 10px}.workspace-release-meta{display:grid;gap:5px;padding:0 10px;margin:-4px 0 10px;min-width:0}.workspace-release-meta .version-pill{align-self:start;max-width:100%;font-size:10px;white-space:normal;line-height:1.4}.workspace-release-meta small{font-size:10px;color:var(--aba-color-nav-muted,#9ca3af);line-height:1.5;overflow-wrap:anywhere}.nav-item{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:var(--aba-color-nav-text,#cbd5e1);text-align:start;padding:12px;border-radius:10px;margin:3px 0;font-size:14px;transition:background .18s ease,color .18s ease}.nav-item:hover{background:var(--aba-color-nav-surface-raised,#1e293b);color:var(--aba-color-text-inverse,#fff)}.nav-item.active{background:linear-gradient(100deg,var(--aba-color-nav-active-start,#164e63),var(--aba-color-nav-active-end,#1d4ed8));color:var(--aba-color-text-inverse,#fff);border-inline-start:3px solid var(--aba-color-nav-accent,#5eead4)}.nav-icon{display:inline-grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;font-size:17px;font-weight:800;background:var(--aba-color-nav-surface-raised,#1e293b)}.overview-icon{color:#67e8f9;background:#164e63}.invoices-icon{color:#fcd34d;background:#713f12}.products-icon{color:#86efac;background:#14532d}.customers-icon{color:#c4b5fd;background:#4c1d95}.assistant-icon{color:#f9a8d4;background:#831843}.payments-icon{color:#67e8f9;background:#164e63}.expense-icon{color:#fdba74;background:#7c2d12}.nav-item.active .nav-icon{background:#ffffff24;color:var(--aba-color-text-inverse,#fff)}.sidebar-bottom{margin-top:auto;border-top:1px solid #293548;padding:18px 8px 0;font-size:11px}.sidebar-bottom small{display:block;color:var(--aba-color-nav-muted,#9ca3af);margin-block-start:8px;margin-inline-start:15px;line-height:1.5}.status-dot{display:inline-block;width:7px;height:7px;background:#34d399;border-radius:50%;margin-inline-end:8px}
    .main{margin-inline-end:var(--aba-layout-sidebar,245px);padding:30px clamp(18px,4vw,54px) 20px;max-width:var(--aba-layout-content-max,1550px)}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:0}.mobile-page-heading{display:none}.user-area{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--aba-color-text-muted,#4b5563)}.secondary,.primary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:var(--aba-color-surface,#fff);color:#374151}.primary{background:var(--aba-color-primary,#0f766e);border-color:var(--aba-color-primary,#0f766e);color:var(--aba-color-text-inverse,#fff)}.primary:hover{background:#115e59}.workspace-bar{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(180px,260px);justify-content:stretch;align-items:center;gap:14px;padding:14px 17px;background:var(--aba-color-surface,#fff);border:1px solid var(--aba-color-border,#e5e7eb);border-radius:var(--aba-radius-card,13px);margin-bottom:18px;min-width:0}.workspace-bar strong{display:block;font-size:14px}.workspace-bar select{max-width:260px}.dashboard-period{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 18px;margin:0 0 14px;padding:13px 16px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:var(--aba-radius-card,14px);background:var(--aba-color-surface-subtle,#f8fafc)}.dashboard-period__heading{display:grid;gap:3px;min-width:0}.dashboard-period__title{margin:0;color:var(--aba-color-text-primary,#172033);font-size:14px;line-height:1.4;font-weight:var(--aba-font-weight-bold,700);overflow-wrap:anywhere}.dashboard-period__heading strong{font-size:13px;line-height:1.4;color:var(--aba-color-text-primary,#172033)}.dashboard-period__details{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;min-width:0;color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.5}.dashboard-period__details span{overflow-wrap:anywhere}.dashboard-period__details bdi{font-variant-numeric:tabular-nums;color:var(--aba-color-text-primary,#172033)}.dashboard-period--skeleton{min-height:66px}.dashboard-period-skeleton__details{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;min-width:0}.dashboard-period-skeleton__details span{display:block;width:clamp(110px,24vw,190px);height:9px;border-radius:999px;background:var(--aba-color-border-subtle,#eef2f7)}.dashboard-period-skeleton__details span:last-child{width:clamp(90px,18vw,145px)}.metric-skeleton{display:grid;align-content:start;gap:12px;min-width:0;min-height:145px;padding:16px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:var(--aba-radius-card,14px);background:var(--aba-color-surface,#fff)}.metric-skeleton span{display:block;height:10px;max-width:100%;border-radius:999px;background:var(--aba-color-border-subtle,#e2e8f0)}.metric-skeleton span:first-child{width:44%}.metric-skeleton span:nth-child(2){width:72%;height:24px;border-radius:8px;background:var(--aba-color-surface-muted,#eef2f7)}.metric-skeleton span:last-child{width:58%}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:0}.metric-grid aba-metric-card small{font-size:12px;line-height:1.55}.metric{padding:17px;min-height:125px;background:var(--aba-color-surface,#fff);border:1px solid #e5eaf1;border-radius:14px}.metric>span{display:block;color:var(--aba-color-text-tertiary,#6b7280);font-size:11px;margin-bottom:13px}.metric strong{display:block;font-size:19px;letter-spacing:-.5px;overflow-wrap:anywhere}.metric small{display:block;font-size:10px;color:var(--aba-color-nav-muted,#9ca3af);margin-top:6px}.notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}.notice strong{white-space:nowrap}.home-shortcut-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;margin-top:15px}.home-shortcut-link{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;min-width:0;min-height:44px;padding:8px 12px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:var(--aba-radius-control,10px);background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font-size:var(--aba-font-size-base,14px);line-height:var(--aba-line-height-normal,1.5);font-weight:700;text-align:start;cursor:pointer;transition:border-color var(--aba-motion-fast,150ms) var(--aba-easing-standard,ease),background var(--aba-motion-fast,150ms) var(--aba-easing-standard,ease)}.home-shortcut-link:hover:not(:disabled){border-color:var(--aba-color-primary-border,#99f6e4);background:var(--aba-color-surface-hover,#f1f5f9)}.home-shortcut-link:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:var(--aba-focus-ring-offset,2px)}.home-shortcut-link__icon{display:grid;flex:0 0 26px;width:26px;height:26px;place-items:center;border-radius:8px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary,#0f766e);font-size:14px}.home-shortcut-link__label{min-width:0;overflow-wrap:anywhere}.module-launcher{margin-top:18px}.module-directory{margin-top:18px}.dashboard-trust-note{background:var(--aba-color-surface-subtle,#f8fafc);border-color:var(--aba-color-border,#e5eaf1);color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.65}.dashboard-trust-note strong{color:var(--aba-color-text-primary,#172033)}.module-directory-disclosure{display:grid;gap:12px}.module-directory-summary{display:flex;align-items:center;gap:12px;min-width:0;min-height:44px;cursor:pointer;list-style:none}.module-directory-summary::-webkit-details-marker{display:none}.module-directory-summary__copy{display:grid;flex:1;gap:3px;min-width:0}.module-directory-summary__title{margin:0;color:var(--aba-color-text-primary,#172033);font-size:14px;line-height:1.45;overflow-wrap:anywhere}.module-directory-summary__copy small{color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.5;overflow-wrap:anywhere}.module-directory-toggle{display:grid;flex:0 0 32px;width:32px;height:32px;place-items:center;border-radius:9px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#64748b);font-size:18px;transition:transform var(--aba-motion-fast,150ms) var(--aba-easing-standard,ease)}.module-directory-disclosure[open] .module-directory-toggle{transform:rotate(45deg)}.module-directory-search{display:block;min-width:0}.module-directory-search input{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--aba-color-border,#e5e7eb);border-radius:10px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font-size:14px}.module-directory-empty{margin:0;padding:14px;border:1px dashed var(--aba-color-border,#e5e7eb);border-radius:10px;color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.6}.module-directory-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:10px;margin-top:0}
    .panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:var(--aba-color-text-tertiary,#6b7280);line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:var(--aba-color-text-tertiary,#6b7280);margin:0}.count{font-size:10px;font-weight:700;color:var(--aba-color-primary,#0f766e);background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:var(--aba-color-surface-subtle,#f8fafc);border:1px solid #edf0f5;border-radius:11px}.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}.expense-form{grid-template-columns:repeat(3,minmax(0,1fr))}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:var(--aba-color-surface,#fff);padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.payment-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#cffafe;color:#0e7490;font-size:17px;font-weight:800}.expense-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#ffedd5;color:#c2410c;font-size:20px;font-weight:800}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:var(--aba-color-text-tertiary,#6b7280);font-size:10px;margin-top:5px;overflow-wrap:anywhere}.footnote{font-size:10px;line-height:1.6;color:var(--aba-color-nav-muted,#9ca3af);margin:15px 0 0} .assistant-workspace{display:grid;grid-template-columns:minmax(0,1fr) 228px;gap:16px;align-items:start}.assistant-suggestions{min-width:0;margin:0;padding:16px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:16px;background:var(--aba-color-surface,#fff);box-shadow:0 8px 24px #0f172a08}.assistant-suggestions>p{font-size:12px;font-weight:800;color:var(--aba-color-text-muted,#334155);margin:0 0 10px}.suggestion-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.suggestion-card{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;column-gap:9px;row-gap:2px;text-align:start;padding:9px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc);color:#1e293b;transition:background .16s ease,border-color .16s ease}.suggestion-card:hover:not(:disabled){background:#eff6ff;border-color:#2563eb}.suggestion-card:disabled{opacity:.55;cursor:not-allowed}.suggestion-icon{grid-row:span 2;display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#dbeafe;color:#1d4ed8;font-size:15px}.suggestion-card strong{font-size:11px}.suggestion-card small{font-size:10px;color:var(--aba-color-text-secondary,#64748b);line-height:1.35}.chat-panel{min-width:0}.chat-header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.chat-new-button{min-height:36px;padding:7px 11px;border:1px solid var(--aba-color-border,#d1d5db);border-radius:9px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#1f2937);font-size:11px;font-weight:700}.chat-new-button:hover:not(:disabled){background:var(--aba-color-surface-subtle,#f8fafc);border-color:var(--aba-color-primary,#0f766e)}.chat-log{min-height:280px;max-height:55vh}@media(max-width:900px){.assistant-workspace{grid-template-columns:minmax(0,1fr)}.assistant-suggestions{grid-row:2}.assistant-workspace:not(.has-chat) .assistant-suggestions{grid-row:1}.assistant-workspace:not(.has-chat) .chat-panel{grid-row:2}.suggestion-grid{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.suggestion-grid{scroll-snap-type:x proximity;overscroll-behavior-inline:contain;scrollbar-width:thin}.suggestion-card{flex:0 0 175px;min-height:82px;scroll-snap-align:start}}@media(max-width:480px){.assistant-suggestions{padding:12px}.suggestion-card{flex-basis:158px;min-height:82px;padding:8px}.chat-log{min-height:220px;max-height:48vh}.chat-message{max-width:96%}.chat-header-actions{gap:6px}.chat-new-button{min-height:40px}.chat-form{grid-template-columns:minmax(0,1fr) 84px;gap:8px}.chat-form .primary{padding-inline:8px}.chat-composer-meta{align-items:flex-start}.chat-composer-meta small{font-size:9px}}.chat-log{min-height:280px;max-height:55vh;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-inline-end:auto;margin-inline-start:0;background:#e0f2fe}.chat-message-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--aba-color-text-tertiary,#6b7280);font-weight:800}.chat-copy-button{min-height:32px;min-width:44px;padding:5px 8px;border:1px solid var(--aba-color-border-subtle,#dbe2ea);border-radius:8px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-secondary,#475569);font-size:10px;font-weight:700}.chat-copy-button:hover{border-color:var(--aba-color-primary,#0f766e);color:var(--aba-color-primary,#0f766e)}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:var(--aba-color-primary,#0f766e);font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-inline-end:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical;min-height:48px;max-height:180px;line-height:1.5}.chat-form .primary{min-width:84px;min-height:48px}.chat-composer-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;color:var(--aba-color-text-tertiary,#64748b)}.chat-composer-meta small{font-size:10px;line-height:1.5}.chat-composer-meta small:last-child{flex:0 0 auto;font-variant-numeric:tabular-nums}.chat-form textarea{font-size:16px}.chat-copy-button span{display:inline-block}@media(max-width:480px){.chat-message p{font-size:14px;line-height:1.75;overflow-wrap:anywhere}.source-list{font-size:11px}.suggestion-card strong{font-size:12px}.suggestion-card small{font-size:11px}.chat-composer-meta small{font-size:10px}}.install-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 14px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;color:#065f46;font-size:12px;line-height:1.6}.install-help-inline{position:static;z-index:auto;width:min(520px,100%);max-width:100%;margin:0 0 14px auto;box-shadow:none}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:var(--aba-color-surface,#fff);border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:var(--aba-color-text-tertiary,#6b7280);line-height:1.7}.setup-steps{background:var(--aba-color-surface-subtle,#f8fafc);border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:var(--aba-color-primary,#0f766e);font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}.splash-build-time{display:block;margin:-8px 0 18px;color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.6;text-align:center}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:var(--aba-color-text-tertiary,#6b7280);font-size:10px}footer span{color:var(--aba-color-nav-muted,#9ca3af)}
    .mobile-version-strip{display:none}
    .section-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .list-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.list-tools input{flex:1;min-width:150px}.list-tools select{min-width:130px}
    @media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form .primary{grid-column:1/-1}}@media(max-width:760px){
      .mobile-version-row{display:flex;justify-content:flex-end;min-width:0;margin:0 0 8px}
      .mobile-version-row .version-pill{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:10px;padding:5px 8px}

      .install-button{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border-color:var(--aba-color-primary-border,#99f6e4);color:#065f46;background:#ecfdf5;font-weight:800}.mobile-install-card{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;margin:0 0 12px;padding:10px 12px;border:1px solid var(--aba-color-primary-border,#99f6e4);border-radius:14px;background:linear-gradient(110deg,#f0fdfa,#f8fafc);box-shadow:0 2px 10px #0f766e0a}.mobile-install-copy{display:flex;align-items:center;gap:9px;min-width:0}.mobile-install-copy>div{display:grid;gap:2px;min-width:0}.mobile-install-copy strong{color:var(--aba-color-text-primary,#172033);font-size:12px;line-height:1.4}.mobile-install-copy small{color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.45}.mobile-install-icon{display:grid;flex:0 0 34px;width:34px;height:34px;place-items:center;border-radius:10px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59);font-size:18px;font-weight:900}.mobile-install-button{display:inline-flex;flex:0 0 auto;min-width:72px;min-height:44px;padding:9px 12px;border-radius:11px}.main,.shell.english .main{padding-top:calc(20px + env(safe-area-inset-top,0px))}.mobile-more{display:flex}.mobile-more-menu{display:grid;position:fixed;z-index:30;inset-inline-end:10px;bottom:calc(82px + env(safe-area-inset-bottom));width:min(270px,calc(100vw - 20px));max-height:min(70vh,560px);max-height:min(70dvh,560px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:8px;background:var(--aba-color-nav-surface-deep,#0f172a);border:1px solid var(--aba-color-nav-border,#334155);border-radius:var(--aba-radius-panel,16px);box-shadow:var(--aba-shadow-nav-menu,0 18px 50px #02061755);gap:8px}.mobile-more-search{position:sticky;top:0;z-index:1;display:block;padding:3px;background:var(--aba-color-nav-surface-deep,#0f172a)}.mobile-more-search input{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--aba-color-nav-border,#334155);border-radius:10px;background:var(--aba-color-nav-surface-raised,#1e293b);color:var(--aba-color-text-inverse,#fff);font-size:14px}.mobile-more-search input::placeholder{color:var(--aba-color-nav-muted,#94a3b8)}.mobile-more-empty{margin:8px 10px;padding:12px;border:1px dashed var(--aba-color-nav-border,#334155);border-radius:10px;color:var(--aba-color-nav-muted,#94a3b8);font-size:12px;line-height:1.6}.mobile-more-group{display:grid;gap:4px}.mobile-more-group+.mobile-more-group{border-top:1px solid var(--aba-color-nav-border,#334155);padding-top:8px;margin-top:4px}.mobile-more-group h3{margin:2px 10px 4px;color:var(--aba-color-nav-muted,#94a3b8);font-size:10px;font-weight:800;line-height:1.5;letter-spacing:.04em;text-align:start}.mobile-more-menu .nav-item{flex-direction:row;justify-content:flex-start;min-height:48px;padding:9px 12px;font-size:13px}.mobile-more-menu .nav-item>span:not(.nav-icon){max-width:none}.mobile-more-menu .nav-item.active{border-inline-start:3px solid var(--aba-color-nav-accent,#5eead4);box-shadow:none}.mobile-more-actions{display:grid;gap:4px;border-top:1px solid var(--aba-color-nav-border,#334155);padding-top:8px;margin-top:4px}.mobile-more-menu .mobile-menu-action{border-radius:8px;margin-top:0}
      .global-loading{position:fixed;inset:0 0 auto;z-index:1000;height:3px;background:#ccfbf1;overflow:hidden}.global-loading>span:first-child{position:absolute;inset:0 auto 0 0;width:35%;background:var(--aba-color-primary,#0f766e);animation:loading-sweep 1.15s ease-in-out infinite}.loading-label{position:absolute;top:10px;right:12px;background:var(--aba-color-primary,#0f766e);color:var(--aba-color-text-inverse,#fff);padding:7px 12px;border-radius:999px;font-size:12px;box-shadow:0 4px 14px #0f172a22}@keyframes loading-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.global-loading>span:first-child{animation:none;width:100%}}
    .sidebar{position:fixed;inset:auto 0 0;width:100%;min-height:0;height:auto;padding:8px 6px calc(8px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch;gap:2px;overflow-x:auto;overflow-y:hidden;background:var(--aba-color-nav-surface-glass,rgba(15,23,42,.97));border-top:1px solid var(--aba-color-nav-border,#334155);box-shadow:var(--aba-shadow-nav-dock,0 -8px 28px #0f172a20);backdrop-filter:blur(16px);z-index:20}
      .brand,.brand>span:last-child,.nav-label,.workspace-release-meta,.sidebar-bottom{display:none}.sidebar>.mobile-extra,.sidebar>.platform-admin-nav{display:none}
      .nav-item{min-width:0;min-height:58px;margin:0;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;font-size:10px;line-height:1.1;text-align:center;white-space:normal;color:var(--aba-color-nav-text,#cbd5e1)}
      .nav-item>span:not(.nav-icon){display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .nav-item .nav-icon{display:grid;flex:0 0 27px;width:27px;height:27px;font-size:17px;border-radius:9px}
      .nav-item.active{background:var(--aba-color-nav-surface-raised,#1e293b);box-shadow:inset 0 -2px #5eead4;color:var(--aba-color-text-inverse,#fff)}
      .mobile-version-strip{display:flex;justify-content:flex-end;align-items:flex-end;flex-wrap:wrap;gap:4px 8px;margin:0 2px 10px}.mobile-version-strip .version-pill{font-size:10px;padding:5px 7px}.mobile-deploy-time{font-size:10px;line-height:1.4;color:var(--aba-color-text-secondary,#5d6878);max-width:100%;overflow-wrap:anywhere}
      .main,.shell.english .main{margin:0;padding:20px 14px calc(100px + env(safe-area-inset-bottom));max-width:none}
      .topbar{display:none!important}
      .mobile-page-heading{display:block;margin:0 0 16px;padding:0 2px}
      .mobile-page-heading .eyebrow{margin:0 0 5px;color:var(--aba-color-text-secondary,#5d6878);font-size:var(--aba-font-size-2xs,10px);font-weight:var(--aba-font-weight-semibold,600)}
      .mobile-page-heading h1{margin:0;color:var(--aba-color-text-primary,#172033);font-size:clamp(20px,5.5vw,25px);line-height:var(--aba-line-height-tight,1.3);font-weight:var(--aba-font-weight-bold,700);letter-spacing:var(--aba-letter-spacing-tight,-.02em);overflow-wrap:anywhere}
      .topbar h1{font-size:clamp(20px,5.5vw,25px);line-height:1.2}
      .user-area{gap:6px}.user-area>span:not(.version-pill){display:none}.user-area .version-pill{display:inline-flex;flex-shrink:0;padding:5px 7px;font-size:10px}.user-area .secondary{padding:9px 10px;min-height:40px}
      .home-shortcut-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.home-shortcut-link{width:100%}.workspace-bar{align-items:stretch;flex-direction:column}.workspace-bar select{max-width:none;width:100%}
      .list-tools{display:grid;grid-template-columns:1fr}.list-tools input,.list-tools select,.list-tools button{width:100%}
      .section-head{align-items:flex-start;gap:10px}.list-row{flex-wrap:wrap}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{padding:13px;min-height:110px}.metric strong{font-size:clamp(15px,4vw,18px);overflow-wrap:anywhere}
      
      .inline-form,.inline-form .primary{grid-column:auto}
      .notice{flex-direction:column}.notice strong{white-space:normal}
      footer{flex-direction:column;line-height:1.6}
      input,select,textarea{font-size:16px!important;min-height:44px}
      button,.secondary,.primary{min-height:42px}
    }
    .mobile-version-row{display:none}
    .invoice-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}.invoice-preview>div{display:flex;flex-direction:column;gap:4px;min-width:0}.invoice-preview span{font-size:12px;color:var(--aba-color-text-secondary,#64748b)}.invoice-preview strong{font-size:15px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.invoice-preview .total{grid-column:1/-1;border-top:1px solid #cbd5e1;padding-top:10px}
    .version-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border:1px solid #cbd5e1;border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-muted,#334155);font-size:11px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}.statement-panel{min-width:0;max-width:100%;overflow:hidden}.statement-panel .section-head>div{min-width:0;overflow-wrap:anywhere}.statement-panel .aba-record-table{min-width:0;width:100%}
    @media(max-width:380px){.nav-item{font-size:9px}.nav-item .nav-icon{width:25px;height:25px;flex-basis:25px}.sidebar{padding-inline:3px}.main{padding-inline:11px}.metric{padding:10px}.metric>span{font-size:10px}}
    /* Refined mobile navigation dock: thumb-friendly, RTL-aware, and never an app bar. */
    @media(max-width:760px){
      .sidebar{
        inset:auto 10px calc(8px + env(safe-area-inset-bottom)) 10px;
        width:auto;
        padding:7px;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:5px;
        border:1px solid var(--aba-color-nav-border,#334155);
        border-radius:22px;
        background:var(--aba-color-nav-surface-glass,rgb(15 23 42 / 96%));
        box-shadow:0 12px 38px #02061745,0 1px 0 #ffffff0a inset;
        overflow:visible;
      }
      .nav-item{
        min-height:var(--aba-layout-mobile-nav,61px);
        padding:6px 3px;
        gap:4px;
        border-radius:15px;
        font-size:10px;
        font-weight:700;
        letter-spacing:0;
        color:var(--aba-color-nav-text,#cbd5e1);
        transition:background .18s ease,transform .18s ease,color .18s ease;
      }
      .nav-item .nav-icon{
        width:29px;height:29px;flex-basis:29px;
        border-radius:11px;
        background:#273449;
        color:var(--aba-color-nav-text,#cbd5e1);
        font-size:18px;
      }
      .sidebar .nav-item.active{
        color:var(--aba-color-text-inverse,#fff);
        background:linear-gradient(145deg,#134e4a,#115e59);
        border-inline-start:0;
        box-shadow:0 4px 14px #0f766e30,inset 0 0 0 1px #5eead455;
      }
      .nav-item.active .nav-icon{background:#5eead926;color:var(--aba-color-primary-border,#99f6e4)}
      .nav-item:active{transform:scale(.97)}
      .mobile-more-menu{
        inset-inline-end:12px;
        bottom:calc(88px + env(safe-area-inset-bottom));
        width:min(280px,calc(100vw - 24px));
        max-height:min(62vh,520px);
        overflow-y:auto;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:thin;
        padding:9px;
        border-radius:18px;
        background:var(--aba-color-nav-surface,#111827);
        box-shadow:var(--aba-shadow-nav-menu,0 20px 55px #02061766);
      }
      .mobile-more-menu{inset-inline-start:auto}
      .mobile-more-menu .nav-item{min-height:48px;border-radius:12px}
      .main,.shell.english .main{padding-bottom:calc(128px + env(safe-area-inset-bottom,0px))}
    }
    @media(max-width:380px){
      .mobile-install-card{gap:8px;padding:9px}.mobile-install-copy{gap:7px}.mobile-install-copy small{font-size:10px}.mobile-install-button{min-width:68px;padding-inline:10px}
      .sidebar{inset-inline:7px;padding:5px;gap:3px;border-radius:19px}
      .nav-item{min-height:56px;font-size:9px}
      .nav-item .nav-icon{width:26px;height:26px;flex-basis:26px;font-size:16px}
    }
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}

    /* Consistent, data-sized controls and mobile-first business cards. */
    .workspace-bar{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,260px);align-items:center;gap:12px}
    .workspace-current{min-width:0}.workspace-current strong{overflow-wrap:anywhere}
    .workspace-release-meta-inline{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border-top:1px solid #e5eaf1}
    .workspace-release-meta-inline small{color:var(--aba-color-text-secondary,#64748b);font-size:11px;overflow-wrap:anywhere;text-align:center}
    .invoice-toolbar{display:flex;flex-direction:column;gap:12px;margin-top:12px}
    
    .customer-invoice-filter{order:1;width:100%;margin:0}
    
    
    
    
    
    .invoice-lines,.invoice-lines-heading{min-width:0}
    .expense-form{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.5fr) minmax(100px,.65fr) minmax(170px,1fr) minmax(130px,.8fr) minmax(120px,.8fr);align-items:end;gap:10px}
    .expense-form .expense-category-field{min-width:0}
    .shell input,.shell select,.shell textarea{min-width:0;max-width:100%;padding:9px 11px;font-size:14px;border-radius:9px}
    .shell input[type="number"]{font-variant-numeric:tabular-nums}
    .shell label{min-width:0;gap:6px}
    .list-row{min-width:0;overflow-wrap:anywhere}
    .assistant-suggestions{padding:12px;border:1px solid #dbeafe;border-radius:15px;background:linear-gradient(135deg,#f8fbff,#eff6ff)}
    .assistant-suggestions .suggestion-card{min-height:68px}
    .auth-retry{margin-top:12px}
    @media(max-width:900px){
      .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .expense-form{grid-template-columns:repeat(2,minmax(0,1fr))}
      .expense-form input[name="expenseDescription"]{grid-column:1/-1}
      .expense-form input[name="expenseDate"]{grid-column:1/-1}
    }
    @media(max-width:600px){
      .workspace-bar{grid-template-columns:minmax(0,1fr);padding:12px;gap:10px}
      .workspace-bar select{width:100%;max-width:none}
      .workspace-release-meta-inline{gap:6px;padding-top:10px}
      
      
      
      
      .expense-form{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .expense-form input[name="expenseDescription"],.expense-form input[name="expenseDate"]{grid-column:1/-1}
      .expense-cash-semantics{margin:10px 0 0;padding:9px 11px;border-inline-start:3px solid var(--aba-color-info,#3b82f6);border-radius:8px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#475569);font-size:12px;line-height:1.55}
      .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .metric{padding:12px;min-height:105px}
      .metric strong{font-size:17px}
      .list-row{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:8px;padding:12px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px;background:var(--aba-color-surface,#fff)}
      .list-row .grow{min-width:0;width:100%}
      .list-row>button,.list-row>strong{justify-self:start;max-width:100%}
      .suggestion-grid{grid-template-columns:minmax(0,1fr)}
      .notice{align-items:flex-start;flex-wrap:wrap}
      .notice strong{white-space:normal}
      .table-wrap table{min-width:560px}
    }

    @media(max-width:600px){
      .customer-list-row,.invoice-list-row{grid-template-columns:36px minmax(0,1fr);align-items:start;column-gap:9px;row-gap:7px}
      .customer-list-row>.avatar,.invoice-list-row>.invoice-mark{grid-column:1;grid-row:1/span 5;justify-self:center}
      .customer-list-row>.grow,.invoice-list-row>.grow{grid-column:2;grid-row:1;min-width:0}
      .customer-list-row>button,.invoice-list-row>button,.invoice-list-row>strong,.invoice-list-row>small{grid-column:2;justify-self:start}
      .customer-list-row>button,.invoice-list-row>button{min-height:34px;padding:6px 10px;font-size:12px}
    }

    /* Keep release metadata centered on the same row as the current workspace on desktop. */
    .workspace-bar{grid-template-columns:minmax(0,1fr) auto minmax(180px,260px)}
    .workspace-release-meta-inline{grid-column:auto;border-top:0;padding:0;justify-content:center;min-width:0}
    /* At tablet widths, keep the workspace name and selector side by side; move release metadata to its own row. */
    @media(max-width:900px){
      .workspace-bar{grid-template-columns:minmax(0,1fr) minmax(180px,260px);align-items:center}
      .workspace-current{min-width:0}
      .workspace-release-meta-inline{grid-column:1/-1;justify-content:flex-start;border-top:1px solid var(--aba-color-border,#e5eaf1);padding-top:8px}
      .workspace-release-meta-inline small{text-align:start}
    }
    @media(max-width:600px){
      .workspace-release-meta-inline{grid-column:1;border-top:1px solid #e5eaf1;padding-top:10px}
    }
    @media(max-width:760px){
      .workspace-bar{grid-template-columns:minmax(0,1fr);align-items:stretch;gap:10px;padding:12px}
      .workspace-current{overflow-wrap:anywhere}
      .workspace-bar select{width:100%;max-width:none;min-width:0}
      .workspace-release-meta-inline{grid-column:1;justify-content:flex-start;min-width:0;text-align:start;overflow-wrap:anywhere}
      .workspace-release-meta-inline .version-pill{max-width:100%;white-space:normal;overflow-wrap:anywhere}
      .workspace-release-meta-inline small{text-align:start}
    }
    @media(max-width:760px){
      .chat-form{position:sticky;bottom:calc(var(--aba-keyboard-inset,0px) + 8px);z-index:25;align-items:end;padding:8px 0;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 18%)}
      .shell.keyboard-open .chat-form{position:fixed;inset-inline:12px;bottom:calc(var(--aba-keyboard-inset,0px) + 8px);margin-top:0;padding:8px 10px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;background:var(--aba-color-surface,#fff);box-shadow:0 8px 24px #0f172a1a}
      .chat-form textarea{min-height:48px;max-height:25dvh;resize:none}
      .shell.keyboard-open .sidebar,.shell:has(.chat-form textarea:focus) .sidebar{transform:translateY(110%);pointer-events:none}
      .shell.keyboard-open .main,.shell:has(.chat-form textarea:focus) .main{padding-bottom:12px}
      .shell.keyboard-open .chat-log{min-height:100px;max-height:35dvh}
      .shell.keyboard-open .sidebar:has(.mobile-more-menu){bottom:var(--aba-keyboard-inset,0px);transform:none;pointer-events:auto}
      .shell.keyboard-open .sidebar:has(.mobile-more-menu) .mobile-more-menu{bottom:calc(88px + env(safe-area-inset-bottom));max-height:min(62dvh,calc(100dvh - var(--aba-keyboard-inset,0px) - 110px))}
    }
    /* P1 Home hierarchy: keep the four KPI cards readable as a single column on phones. */
    @media(max-width:760px){.metric-grid{grid-template-columns:minmax(0,1fr)}}
    /* Keep two-column Home shortcuts at 390/412px; use a single column at very narrow widths. */
    @media(max-width:360px){.home-shortcut-list{grid-template-columns:minmax(0,1fr)}}
    /* The extracted Hybrid Modern header replaces the old mobile workspace/page header only. */
    @media(max-width:760px){.workspace-bar{display:none!important}.mobile-page-heading{display:none!important}}

/* Mobile Home cockpit: compact hierarchy and intentional two-column surfaces. */
@media(max-width:760px){
  .dashboard-period{gap:7px;margin-block-end:10px;padding:10px 12px;border-radius:12px}
  .dashboard-period__heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .dashboard-period__title{font-size:13px}
  .dashboard-period__heading strong{font-size:11px}
  .dashboard-period__details{gap:5px 9px;font-size:11px;line-height:1.45}
  .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .home-shortcut-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-block-start:10px}
  .home-shortcut-link{min-height:44px;gap:7px;padding:8px 9px;font-size:12px}
  .home-shortcut-link__icon{flex-basis:28px;width:28px;height:28px;font-size:13px}
  .module-launcher,.module-directory{margin-block-start:12px}
  .module-directory-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .dashboard-trust-note{display:grid;gap:6px;margin-block-start:10px;padding:10px 12px;font-size:11px;line-height:1.55}
  .dashboard-trust-note strong{white-space:normal}
}
@media(max-width:380px){
  .metric-grid{gap:7px}
  .home-shortcut-link{gap:6px;padding-inline:7px}
  .home-shortcut-link__icon{flex-basis:24px;width:24px;height:24px}
  .module-directory-grid{gap:7px}
}
    /* Sales invoice list: dense desktop table, purpose-built mobile cards, and consistent actions. */
    .invoice-controls{display:grid;grid-template-columns:minmax(240px,1fr) minmax(130px,170px) minmax(170px,230px) auto auto;align-items:end;gap:9px;margin:12px 0}
    .invoice-search{position:relative;display:block;min-width:0}
    .invoice-search input{width:100%;min-height:42px;padding-inline:42px 38px;appearance:none;-webkit-appearance:none;direction:inherit;text-align:start}
    .invoice-search input::-webkit-search-decoration,.invoice-search input::-webkit-search-results-button,.invoice-search input::-webkit-search-results-decoration{display:none}
    .invoice-search input::-webkit-search-cancel-button{cursor:pointer}
    .invoice-search-icon{position:absolute;inset-inline-start:14px;top:50%;z-index:1;width:18px;height:18px;transform:translateY(-50%);color:var(--aba-color-text-secondary,#64748b);pointer-events:none}
    .invoice-filter{display:grid;gap:5px;min-width:0;color:var(--aba-color-text-secondary,#475569);font-size:11px;font-weight:500}
    .invoice-filter select{width:100%;min-width:0;font-weight:400}
    .invoice-export,.invoice-load-more-customers{min-height:40px;white-space:nowrap;padding:8px 11px}
    .invoice-status-badge{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:4px 9px;border:1px solid var(--aba-color-border,#d0d5dd);border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-secondary,#475569);font-size:11px;font-weight:800;white-space:nowrap}
    .invoice-status-badge.status-draft{border-color:#d0d5dd;background:#f2f4f7;color:#344054}
    .invoice-status-badge.status-issued{border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}
    .invoice-status-badge.status-void{border-color:#fecaca;background:#fef2f2;color:#b42318}
    .invoice-actions{display:flex;align-items:center;justify-content:flex-start;flex-wrap:wrap;gap:6px;min-width:0}
    .invoice-actions button{min-height:34px;padding:6px 9px;font-size:11px;white-space:nowrap}
    .invoice-list-state{padding:18px;border:1px dashed var(--aba-color-border,#d0d5dd);border-radius:12px;color:var(--aba-color-text-secondary,#64748b);text-align:center}
    
    
    .invoice-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:10px;margin-top:12px}
    .invoice-card{display:grid;gap:12px;min-width:0;padding:13px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:14px;background:var(--aba-color-surface,#fff)}
    .invoice-card-header{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
    .invoice-card-customer{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:9px;min-width:0}
    .invoice-customer-avatar{display:grid;place-items:center;width:38px;height:38px;border:1px solid var(--aba-color-primary-border,#99f6e4);border-radius:50%;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59);font-size:14px;font-weight:700;line-height:1}
    .invoice-card-customer-copy{display:grid;gap:3px;min-width:0}
    .invoice-card-customer strong{font-size:14px;font-weight:600;line-height:1.4;color:var(--aba-color-text-primary,#172033);overflow-wrap:anywhere}
    .invoice-card-meta{font-size:11px;font-weight:400;line-height:1.4;color:var(--aba-color-text-secondary,#64748b);overflow-wrap:anywhere}
    .invoice-cards .invoice-status-badge{flex:0 0 auto;max-width:120px;text-align:center}
    .invoice-status-badge.status-paid{border-color:var(--aba-color-success-border,#bbf7d0);background:var(--aba-color-success-soft,#ecfdf5);color:var(--aba-color-success-text,#065f46)}
    .invoice-status-badge.status-partial{border-color:var(--aba-color-warning-border,#fde68a);background:var(--aba-color-warning-soft,#fffbeb);color:var(--aba-color-warning-text,#92400e)}
    .invoice-status-badge.status-unpaid{border-color:var(--aba-color-danger-border,#fecaca);background:var(--aba-color-danger-soft,#fef2f2);color:var(--aba-color-danger-text,#991b1b)}
    .invoice-card-financials{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;min-width:0}
    .invoice-card-financials>div{display:grid;align-content:start;gap:4px;min-width:0;padding:8px 7px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:10px;background:var(--aba-color-surface-subtle,#f8fafc)}
    .invoice-card-financials small{font-size:10px;line-height:1.35;color:var(--aba-color-text-secondary,#64748b)}
    .invoice-card-financials strong{font-size:13px;font-weight:700;line-height:1.35;font-variant-numeric:tabular-nums;color:var(--aba-color-text-primary,#172033);overflow-wrap:anywhere}
    .invoice-payment-progress{height:6px;overflow:hidden;border-radius:999px;background:var(--aba-color-border-subtle,#e2e8f0)}
    .invoice-payment-progress>span{display:block;height:100%;border-radius:inherit;transition:width 180ms ease}
    .invoice-payment-progress.tone-paid>span{background:var(--aba-color-success-text,#16a34a)}
    .invoice-payment-progress.tone-partial>span{background:var(--aba-color-warning-text,#d97706)}
    .invoice-payment-progress.tone-unpaid>span{background:var(--aba-color-danger-text,#dc2626)}
    .invoice-payment-caption{display:flex;justify-content:flex-end;gap:8px;min-width:0;font-size:10px;line-height:1.3}
    .invoice-payment-caption.tone-paid{color:var(--aba-color-success-text,#16a34a)}
    .invoice-payment-caption.tone-partial{color:var(--aba-color-warning-text,#d97706)}
    .invoice-payment-caption.tone-unpaid{color:var(--aba-color-danger-text,#dc2626)}
    .invoice-card .invoice-actions{padding-top:2px}
    .invoice-card .invoice-actions button{min-height:40px;padding:7px 10px;font-size:12px}
    @media(max-width:1050px){.invoice-controls{grid-template-columns:minmax(0,1fr) minmax(130px,170px) minmax(170px,220px)}.invoice-export,.invoice-load-more-customers{grid-column:1/-1;justify-self:end}}
    @media(max-width:760px){
      .invoice-cards{grid-template-columns:minmax(0,1fr)}
      .invoice-card .invoice-actions button{min-height:44px}
      .invoice-card{padding:12px;gap:11px}
      .invoice-card-header{gap:8px}
      .invoice-cards .invoice-status-badge{max-width:108px;white-space:normal}
      .invoice-card-financials{gap:6px}
      .invoice-card-financials>div{padding:7px 5px}
      .invoice-card-financials strong{font-size:12px}
      .invoice-controls{grid-template-columns:minmax(0,1fr);align-items:stretch;gap:8px}
      .invoice-controls label,.invoice-controls select,.invoice-search input,.invoice-export,.invoice-load-more-customers{width:100%;max-width:none}
      .invoice-export,.invoice-load-more-customers{grid-column:auto;justify-self:stretch}

    }

  `]
})
export class AppComponent implements OnInit, OnDestroy {
  readonly appVersion = APP_BUILD_INFO.version;
  readonly uiCommitLabel = APP_BUILD_INFO.commit;
  get buildTimeLabel(): string {
    if (!APP_BUILD_INFO.builtAt) return this.t('ui.m_1ilhynh');
    return this.localization.formatDate(APP_BUILD_INFO.builtAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' });
  }
  apiVersionLabel = '';
  apiCommitLabel = 'unknown';
  language: 'ar' | 'en' = 'ar';
  initialized = false;
  startupFailed = false;
  setupNeeded = false;
  signedIn = false;
  platformAdminAvailable = false;
  signingUp = false;
  loading = false;
  error = '';
  homeDashboardError = '';
  email = '';
  password = '';
  userEmail = '';
  private authStateUnsubscribe?: () => void;
  private authFlowInProgress = false;
  private currentAuthUid: string | null = null;
  private currentAuthEmail: string | null = null;
  private businessListRequestVersion = 0;
  private authTransitionVersion = 0;
  private pendingAuthSnapshot: AuthUserSnapshot | null | undefined;
  tab: Tab = 'overview';
  auditEvents: AuditEvent[] = [];
  auditTotal = 0;
  auditOffset = 0;
  dataIntegrityReport: DataIntegrityReport | null = null;
  integrityLoading = false;
  integrityError = '';
  integrityOffset = 0;
  auditLoading = false;
  auditError = '';
  auditAction = '';
  auditTargetType = '';
  businesses: Business[] = [];
  business: Business | null = null;
  selectedBusinessId = '';
  dashboard: Dashboard | null = null;
  profitLoss: ProfitLossReport | null = null;
  profitLossPeriod: '30d' | 'month' | 'all' | 'custom' = '30d';
  profitLossStart = '';
  profitLossEnd = '';
  reportLoading = false;
  reportError = '';
  taxSummaryReport: TaxSummaryReport | null = null;
  taxLoading = false;
  taxError = '';
  taxStartDate = '';
  taxEndDate = '';
  agingReport: ReceivablesAgingReport | null = null;
  agingLoading = false;
  agingError = '';
  agingAsOf = new Date().toISOString().slice(0, 10);
  customers: Customer[] = [];
  customerStatement: CustomerStatement | null = null;
  statementLoading = false;
  statementError = '';
  statementVisible = false;
  statementCustomerName = '';
  statementCustomerId = '';
  statementOffset = 0;
  statementFromDate = '';
  statementToDate = '';
  private readonly auditLoadGuard = new WorkspaceLoadGuard();
  private readonly statementLoadGuard = new WorkspaceLoadGuard();
  customersHasMore = false;
  productsHasMore = false;
  invoicesHasMore = false;
  paymentsHasMore = false;
  customersLoadingMore = false;
  productsLoadingMore = false;
  invoicesLoadingMore = false;
  paymentsLoadingMore = false;
  private customerOffset = 0;
  private productOffset = 0;
  private invoiceOffset = 0;
  private paymentOffset = 0;
  products: Product[] = [];
  invoices: Invoice[] = [];
  customerSearch = '';
  productSearch = '';
  invoiceSearch = '';
  paymentSearch = '';
  expenseSearch = '';
  supplierSearch = '';
  purchaseSearch = '';
  recurringSearch = '';
  notificationSearch = '';
  invoiceStatusFilter: 'all' | 'draft' | 'issued' | 'void' = 'all';
  payments: Payment[] = [];
  expenses: Expense[] = [];
  suppliers: Supplier[] = [];
  purchaseOrders: PurchaseOrder[] = [];
  recurringSchedules: RecurringInvoiceSchedule[] = [];
  notifications: NotificationRecord[] = [];
  operationalHealth: OperationalHealth | null = null;
  healthLoading = false;
  healthError = '';
  notificationsLoading = false;
  notificationKind = 'business';
  notificationTitle = '';
  notificationBody = '';
  notificationDeduplicationKey = 'manual-' + Date.now();
  notificationScheduledAt = '';
  suppliersLoading = false;
  purchasesLoading = false;
  recurringLoading = false;
  operationsError = '';
  operationsErrorTab: OperationsMessageTab | null = null;
  operationsMessage = '';
  operationsMessageTab: OperationsMessageTab | null = null;
  operationsWarning = '';
  supplierName = '';
  supplierEmail = '';
  supplierPhone = '';
  supplierAddress = '';
  purchaseOrderNumber = '';
  purchaseSupplierId = '';
  purchaseProductId = '';
  purchaseQuantity = '1';
  purchaseUnitCost = '0';
  recurringCustomerId = '';
  recurringIntervalDays = '30';
  recurringNextRunAt = new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  recurringTimezone = 'UTC';
  expenseCategory = 'General';
  expenseDescription = '';
  expenseAmount = '';
  expenseDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  expenseVendor = '';
  expenseReference = '';
  expenseMessage = '';
  expenseSubmissionUncertain = false;
  businessName = '';
  currencyCode = 'EGP';
  customerCreateOpen = false;
  productCreateOpen = false;
  customerName = '';
  customerEmail = '';
  customerPhone = '';
  customerMessage = '';
  customerMessageKind: 'success' | 'warning' = 'success';
  productMessage = '';
  productMessageKind: 'success' | 'warning' = 'success';
  productName = '';
  productPrice = '';
  stockTracked = false;
  productOpeningQuantity = '0';
  importCsvText = '';
  importFileName = '';
  importLoading = false;
  importPreview: Awaited<ReturnType<ApiService['previewProductCsv']>> | null = null;
  importMessage = '';
  importMessageKind: 'success' | 'warning' = 'success';
  customerImportCsvText = '';
  customerImportFileName = '';
  customerImportLoading = false;
  customerImportPreview: Awaited<ReturnType<ApiService['previewCustomerCsv']>> | null = null;
  customerImportMessage = '';
  customerImportMessageKind: 'success' | 'warning' = 'success';
  invoiceCustomerId = '';
  invoiceProductId = '';
  invoiceQuantity = '1';
  invoiceLines: Array<{ productId: string; quantity: string }> = [{ productId: '', quantity: '1' }];
  invoiceDiscountRate = '0';
  invoiceTaxRate = '0';
  invoiceMessage = '';
  invoiceMessageKind: 'success' | 'warning' = 'success';
  pendingInvoiceVoid: Invoice | null = null;
  invoiceVoidError = '';
  pendingPurchaseReceipt: PurchaseOrder | null = null;
  purchaseReceiptError = '';
  pendingPurchaseApproval: PurchaseOrder | null = null;
  purchaseApprovalError = '';
  confirmationReturnFocus: HTMLElement | null = null;
  invoiceNumber = '';
  invoiceFilterCustomerId = '';
  editingInvoiceId: string | null = null;
  invoiceCreateOpen = false;
  invoiceDraftSaving = false;
  invoiceDraftSummary: InvoiceDraftServerSummary | null = null;
  invoiceDraftInitialLines: InvoiceDraftLine[] | null = null;
  invoiceDraftNotes = '';
  invoiceDraftRevision = 0;
  invoiceDraftUncertain = false;
  private pendingInvoiceDraftOutcome: InvoiceDraftOutcomeSnapshot | null = null;
  private readonly invoiceDraftOutcomeVault = new InvoiceDraftOutcomeVault();
  paymentCustomerId = '';
  paymentAmount: string | number = '';
  paymentAllocationAmount: string | number = '';
  paymentMessage = '';
  paymentMessageKind: 'info' | 'success' | 'warning' | 'error' = 'info';
  paymentInvoiceId = '';
  paymentMethod = 'cash';
  paymentReference = '';
  paymentIdempotencyKey = '';
  paymentLoading = false;
  paymentRetryPending = false;
  private pendingPaymentRetrySnapshot: PaymentRetrySnapshot | null = null;
  private readonly paymentRetryVault = new PaymentRetryVault();
  chatDraft = '';
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources']; mode?: string }> = [];
  chatSending = false;
  chatError = '';
  chatConfigurationMissing = false;
  chatCopyStatus: { index: number; success: boolean } | null = null;
  keyboardOpen = false;
  mobileMoreOpen = false;
  mobileMoreSearch = '';
  homeModuleSearch = '';
  @ViewChild('mobileMoreTrigger') private mobileMoreTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('mobileMoreMenu') private mobileMoreMenu?: ElementRef<HTMLElement>;
  @ViewChild('chatLog') private chatLog?: ElementRef<HTMLElement>;
  isInstalled = false;
  installHelp = false;
  appUpdateAvailable = false;
  private installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

  constructor(private readonly auth: AuthService, private readonly api: ApiService, private readonly localization: LocalizationService) {
    const standalone = window.matchMedia('(display-mode: standalone)');
    this.isInstalled = standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    standalone.addEventListener?.('change', event => { this.isInstalled = event.matches; });
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      this.installPrompt = event as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    });
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.installHelp = false;
      this.installPrompt = null;
    });
    this.apiVersionLabel = this.t('common.notAvailable');
    this.language = this.localization.currentLanguage;
    this.syncDocumentLanguage();
  }

  toggleLanguage(): void {
    const nextLanguage = this.language === 'ar' ? 'en' : 'ar';
    void this.localization.setLanguage(nextLanguage).then(language => {
      this.language = language;
      this.syncDocumentLanguage();
    });
  }

  private syncDocumentLanguage(): void {
    this.localization.syncDocumentLanguage();
  }

  get locale(): string { return this.localization.locale; }

  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }

  customerNameForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('ui.m_f2sjwn');
    return this.customers.find(customer => customer.id === customerId)?.name
      || this.t('ui.m_30i7q4');
  }

  customerInitialForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('ui.m_14aibpr');
    const name = this.customers.find(customer => customer.id === customerId)?.name?.trim();
    return name ? Array.from(name)[0] ?? this.t('ui.m_14aibpr') : this.t('ui.m_14aibpr');
  }

  invoicePaymentTone(invoice: Invoice): 'paid' | 'partial' | 'unpaid' | null {
    if (invoice.status !== 'issued' || invoice.allocated_payments === undefined || invoice.outstanding_amount === undefined) return null;
    const allocated = Number(invoice.allocated_payments);
    const outstanding = Number(invoice.outstanding_amount);
    if (!Number.isFinite(allocated) || !Number.isFinite(outstanding)) return null;
    if (outstanding <= 0) return 'paid';
    return allocated > 0 ? 'partial' : 'unpaid';
  }

  invoicePaymentProgress(invoice: Invoice): number | null {
    if (!this.invoicePaymentTone(invoice)) return null;
    const total = Number(invoice.total);
    const allocated = Number(invoice.allocated_payments);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(allocated)) return null;
    return Math.min(100, Math.max(0, allocated / total * 100));
  }

  invoicePaymentProgressLabel(invoice: Invoice): string {
    const progress = this.invoicePaymentProgress(invoice);
    if (progress === null) return '';
    const percent = Math.round(progress);
    return this.t('ui.m_15p0qq6', { percent: percent });
  }

  invoiceCardStatusTone(invoice: Invoice): string {
    return this.invoicePaymentTone(invoice)
      || (invoice.status === 'draft' ? 'draft' : invoice.status === 'void' ? 'void' : 'issued');
  }

  invoiceCardStatusLabel(invoice: Invoice): string {
    const tone = this.invoicePaymentTone(invoice);
    if (tone === 'paid') return this.t('ui.m_bpbe6s');
    if (tone === 'partial') return this.t('ui.m_rlfln6');
    if (tone === 'unpaid') return this.t('ui.m_1przb3c');
    return this.invoiceStatusLabel(invoice.status);
  }

  showCustomerInvoices(customerId: string): void {
    this.invoiceFilterCustomerId = customerId;
    this.setTab('invoices');
  }

  get filteredCustomers(): Customer[] {
    return filterCustomers(this.customers, this.customerSearch, this.localization.locale);
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
  get purchaseTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'order',label:this.t('ui.m_1ehdmao'),primary:true},
    {key:'supplier',label:this.t('ui.m_x27ir1')},
    {key:'products',label:this.t('ui.m_i0oou8')},
    {key:'received',label:this.t('ui.m_17gz66i')},
    {key:'status',label:this.t('ui.m_jnmvwl'),kind:'status'},
    {key:'total',label:this.t('ui.m_l97slj'),kind:'numeric'},
  ]; }
  get purchaseTableRows(): readonly AbaRecordTableRow[] { return this.filteredPurchaseOrders.map(order=>({
    id:order.id,cells:{
      order:order.order_number,supplier:this.supplierNameFor(order.supplier_id),
      products:this.purchaseOrderProductsSummary(order),received:this.purchaseOrderReceivedSummary(order),
      status:this.purchaseOrderStatusLabel(order.status),total:`${order.total} ${order.currency_code}`,
    },
    actions:this.business?.role==='owner'
      ? this.canApprovePurchaseOrder(order)
        ? [{id:'approve',label:this.t('ui.m_12b6e8x'),disabled:this.purchasesLoading}]
        : this.canReceivePurchaseOrder(order)
          ? [{id:'receive',label:this.t('ui.m_1hw0oss'),disabled:this.purchasesLoading}]
          : []
      : [],
  })); }
  purchaseOrderProductsSummary(order:PurchaseOrder):string {
    return order.lines.map(line=>`${this.productNameFor(line.product_id)} × ${line.quantity}`).join(' · ')||'—';
  }
  purchaseOrderReceivedSummary(order:PurchaseOrder):string {
    return order.lines.map(line=>`${line.received_quantity}/${line.quantity}`).join(' · ')||'—';
  }
  onCustomerRecordAction(action:AbaRecordTableActionEvent):void {
    const customer=this.filteredCustomers.find(item=>item.id===action.rowId); if(!customer)return;
    if(action.actionId==='invoices')this.showCustomerInvoices(customer.id);
    if(action.actionId==='statement')this.loadCustomerStatement(customer);
  }
  onPurchaseRecordAction(action:AbaRecordTableActionEvent):void {
    if(this.business?.role!=='owner')return;
    const order=this.purchaseOrders.find(item=>item.id===action.rowId);
    if(!order)return;
    if(action.actionId==='approve'&&this.canApprovePurchaseOrder(order)){
      this.requestPurchaseOrderApproval(order,action.anchor);
      return;
    }
    if(action.actionId==='receive'&&this.canReceivePurchaseOrder(order)){
      this.requestPurchaseOrderReceipt(order,action.anchor);
    }
  }

  get filteredProducts(): Product[] {
    return filterProducts(this.products, this.productSearch, this.business?.currency_code || '', this.localization.locale);
  }

  get filteredInvoices(): Invoice[] {
    return filterInvoices(this.invoices, this.invoiceSearch, this.invoiceStatusFilter, this.invoiceFilterCustomerId, status => this.invoiceStatusLabel(status), id => this.customerNameForInvoice(id), this.localization.locale);
  }

  get filteredSuppliers(): Supplier[] {
    return filterSuppliers(this.suppliers, this.supplierSearch, this.localization.locale);
  }

  get filteredPurchaseOrders(): PurchaseOrder[] {
    return filterPurchaseOrders(
      this.purchaseOrders,
      this.purchaseSearch,
      id => this.supplierNameFor(id),
      id => this.productNameFor(id),
      status => this.purchaseOrderStatusLabel(status),
      this.localization.locale,
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

  get filteredNotifications(): NotificationRecord[] {
    return filterNotifications(this.notifications, this.notificationSearch, kind => this.notificationKindLabel(kind), status => this.notificationStatusLabel(status), this.localization.locale);
  }

  get filteredExpenses(): Expense[] {
    return filterExpenses(this.expenses, this.expenseSearch, category => this.expenseCategoryLabel(category), this.localization.locale);
  }

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
  get auditTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'date',label:this.t('ui.m_1fcm91o')},
    {key:'action',label:this.t('ui.m_bnvfl5'),primary:true},
    {key:'target',label:this.t('ui.m_p4bngz')},
    {key:'recordId',label:this.t('ui.m_1bdb1fj')},
    {key:'actor',label:this.t('ui.m_s2x2wd')},
  ]; }
  get auditTableRows(): readonly AbaRecordTableRow[] { return this.auditEvents.map(item=>({id:item.id,cells:{
    date:this.formatRecordDate(item.created_at,'short'),action:this.auditActionLabel(item.action),target:this.auditTargetLabel(item.target_type),
    recordId:item.target_id||'—',actor:item.actor_subject||'—',
  }})); }


  get agingTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('ui.m_rblc1v'),primary:true},
    {key:'outstanding',label:this.t('ui.m_11hlijv'),kind:'numeric'},
    {key:'bucket',label:this.t('ui.m_bgcabs'),kind:'status'},
    {key:'dueDate',label:this.t('ui.m_1i1a5f0')},
    {key:'customer',label:this.t('ui.m_1c1fxy9'),kind:'status'},
  ]; }
  get agingTableRows(): readonly AbaRecordTableRow[] { return (this.agingReport?.invoices||[]).map(invoice=>({id:invoice.invoice_id,cells:{
    invoice:invoice.invoice_number,outstanding:`${invoice.outstanding_amount} ${invoice.currency_code}`,
    bucket:this.agingBucketLabel(invoice.aging_bucket),dueDate:invoice.due_date?this.formatRecordDate(invoice.due_date,'date'):this.t('ui.m_frwrnt'),
    customer:invoice.customer_link_missing?this.t('ui.m_15owwjm'):this.t('ui.m_e1gxkn'),
  }})); }
  get profitLossTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'currency',label:this.t('ui.m_1jd5ck6'),primary:true},
    {key:'revenue',label:this.t('ui.m_4635nj'),kind:'numeric'},
    {key:'returns',label:this.t('ui.m_x5f4g8'),kind:'numeric'},
    {key:'expenses',label:this.t('ui.m_l71hva'),kind:'numeric'},
    {key:'result',label:this.t('ui.m_1jzh8n6'),kind:'numeric'},
  ]; }
  get profitLossTableRows(): readonly AbaRecordTableRow[] { return (this.profitLoss?.currencies||[]).map(row=>({id:row.currency_code,cells:{
    currency:row.currency_code,revenue:`${row.revenue} · ${row.revenue_invoice_count} ${this.t('ui.m_pe8fvb')}`,
    returns:`${row.approved_return_total} · ${row.approved_return_count} ${this.t('ui.m_1wap8ub')}`,
    expenses:`${row.expenses} · ${row.expense_count} ${this.t('ui.m_1ghkia')}`,
    result:row.operating_result_before_cost_of_goods,
  }})); }
  get taxTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'currency',label:this.t('ui.m_1jd5ck6'),primary:true},
    {key:'tax',label:this.t('ui.m_129leiq'),kind:'numeric'},
    {key:'count',label:this.t('ui.m_1dnybga'),kind:'numeric'},
  ]; }
  get taxTableRows(): readonly AbaRecordTableRow[] { return (this.taxSummaryReport?.currencies||[]).map(row=>({id:row.currency_code,cells:{
    currency:row.currency_code,tax:`${row.tax_total} ${row.currency_code}`,count:String(row.invoice_count),
  }})); }
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
  exportCurrentList(): void {
    if (!this.business || this.business.role !== 'owner') return;
    let filename = '';
    let headers: string[] = [];
    let rows: readonly (readonly unknown[])[] = [];
    if (this.tab === 'customers') {
      filename = 'customers.csv'; headers = ['name', 'email', 'phone'];
      rows = this.filteredCustomers.map(item => [item.name, item.email || '', item.phone || '']);
    } else if (this.tab === 'products') {
      filename = 'products.csv'; headers = ['name', 'sku', 'unit_price', 'currency', 'stock_tracked'];
      rows = this.filteredProducts.map(item => [item.name, item.sku || '', item.unit_price, this.business?.currency_code || '', item.is_stock_tracked ? 'yes' : 'no']);
    } else if (this.tab === 'invoices') {
      filename = 'invoices.csv';
      headers = ['customer_name', 'invoice_number', 'issue_date', 'created_at', 'status', 'total', 'currency', 'remaining_balance'];
      rows = this.filteredInvoices.map(item => [
        this.customerNameForInvoice(item.customer_id),
        item.invoice_number,
        item.issue_date || '',
        item.created_at || '',
        item.status,
        item.total,
        item.currency_code,
        item.status === 'issued' ? item.outstanding_amount ?? '' : '',
      ]);
    } else return;
    const csv = buildCsv(headers, rows);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
    URL.revokeObjectURL(url);
  }

  syncPaymentCustomer(): void {
    if (!this.paymentInvoiceId) return;
    const invoice = this.invoices.find(item => item.id === this.paymentInvoiceId);
    if (invoice?.customer_id) this.paymentCustomerId = invoice.customer_id;
  }

  ngOnInit(): void {
    window.visualViewport?.addEventListener('resize', this.updateKeyboardViewport);
    window.visualViewport?.addEventListener('scroll', this.updateKeyboardViewport);
    this.updateKeyboardViewport();
    this.authStateUnsubscribe = this.auth.subscribeToAuthState(user => {
      if (this.authFlowInProgress || !this.initialized) {
        this.pendingAuthSnapshot = user;
        return;
      }
      void this.handleExternalAuthState(user);
    });
    void this.loadApiVersion();
    void this.initializeApp();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      const handleControllerChange = createServiceWorkerUpdateHandler(
        Boolean(navigator.serviceWorker.controller),
        () => { this.appUpdateAvailable = true; },
      );
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      const registerWorker = () => navigator.serviceWorker.register('/sw.js').catch(() => {
        // The app remains usable if service-worker registration is unavailable.
      });
      if (document.readyState === 'complete') void registerWorker();
      else window.addEventListener('load', () => { void registerWorker(); }, { once: true });
    }
  }

  ngOnDestroy(): void {
    this.authStateUnsubscribe?.();
    this.authStateUnsubscribe = undefined;
    window.visualViewport?.removeEventListener('resize', this.updateKeyboardViewport);
    window.visualViewport?.removeEventListener('scroll', this.updateKeyboardViewport);
    document.documentElement.style.removeProperty('--aba-keyboard-inset');
  }

  private readonly updateKeyboardViewport = (): void => {
    const viewport = window.visualViewport;
    const keyboardInset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    document.documentElement.style.setProperty('--aba-keyboard-inset', `${Math.round(keyboardInset)}px`);
    this.keyboardOpen = keyboardInset > 120;
  };

  private async handleExternalAuthState(user: AuthUserSnapshot | null): Promise<void> {
    const nextUid = user?.uid ?? null;
    const nextEmail = user?.email ?? null;
    if (nextUid === this.currentAuthUid && nextEmail === this.currentAuthEmail) return;

    this.currentAuthUid = nextUid;
    this.currentAuthEmail = nextEmail;
    const transitionVersion = ++this.authTransitionVersion;
    this.businessListRequestVersion++;
    this.businesses = [];
    this.business = null;
    this.selectedBusinessId = '';
    this.clearWorkspaceData();
    this.error = '';

    if (!user) {
      this.resetSignedOutState();
      return;
    }

    this.signedIn = true;
    this.userEmail = user.email || this.t('common.signedInUser');
    this.loading = true;
    try {
      await this.checkPlatformAdminAccess();
      if (transitionVersion !== this.authTransitionVersion) return;
      await this.loadBusinesses();
    } catch (error) {
      if (transitionVersion === this.authTransitionVersion) this.error = this.message(error, 'auth');
    } finally {
      if (transitionVersion === this.authTransitionVersion) this.loading = false;
    }
  }

  private applyPendingAuthSnapshot(): void {
    const pending = this.pendingAuthSnapshot;
    this.pendingAuthSnapshot = undefined;
    if (pending === undefined) return;
    if (pending?.uid === this.currentAuthUid && pending?.email === this.currentAuthEmail) return;
    void this.handleExternalAuthState(pending);
  }

  private resetSignedOutState(): void {
    this.businessListRequestVersion++;
    this.signedIn = false;
    this.userEmail = '';
    this.platformAdminAvailable = false;
    this.tab = 'overview';
    this.businesses = [];
    this.business = null;
    this.selectedBusinessId = '';
    this.clearWorkspaceData();
    this.loading = false;
  }

  private async loadApiVersion(): Promise<void> {
    try {
      const release = await this.api.releaseInfo();
      this.apiVersionLabel = release.version;
      this.apiCommitLabel = release.commit || 'unknown';
    } catch {
      this.apiVersionLabel = this.t('ui.m_1qagjrx');
      this.apiCommitLabel = 'unknown';
    }
  }

  private async checkPlatformAdminAccess(): Promise<void> {
    const requestUid = this.currentAuthUid;
    this.platformAdminAvailable = false;
    try {
      const access = await this.api.platformAdminAccess();
      if (requestUid !== this.currentAuthUid) return;
      this.platformAdminAvailable = access.is_platform_admin === true;
    } catch {
      if (requestUid !== this.currentAuthUid) return;
      // A missing backend endpoint, unconfigured allowlist, or a 403 keeps admin navigation hidden.
      this.platformAdminAvailable = false;
      if (this.tab === 'platform-admin') this.tab = 'overview';
    }
  }

  async submitAuth(): Promise<void> {
    this.authFlowInProgress = true;
    this.loading = true;
    this.error = '';
    try {
      const user = this.signingUp
        ? await this.auth.signUp(this.email, this.password)
        : await this.auth.signIn(this.email, this.password);
      this.currentAuthUid = user.uid;
      this.currentAuthEmail = user.email ?? null;
      this.signedIn = true;
      this.userEmail = user.email || this.t('common.signedInUser');
      await this.checkPlatformAdminAccess();
      await this.loadBusinesses();
    } catch (error) {
      this.error = this.message(error, 'auth');
    } finally {
      this.authFlowInProgress = false;
      this.loading = false;
      this.applyPendingAuthSnapshot();
    }
  }

  async logout(): Promise<void> {
    this.authFlowInProgress = true;
    this.loading = true;
    try {
      await this.auth.signOut();
      this.currentAuthUid = null;
      this.currentAuthEmail = null;
      this.resetSignedOutState();
      this.error = '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.authFlowInProgress = false;
      this.loading = false;
      this.applyPendingAuthSnapshot();
    }
  }

  get sessionExpired(): boolean {
    return this.lastErrorKind === 'session-expired' && this.error === this.lastErrorMessage;
  }

  get accessDenied(): boolean {
    return this.lastErrorKind === 'access-denied' && this.error === this.lastErrorMessage;
  }

  retry(): void {
    if (this.signedIn) {
      void this.loadBusinesses();
      return;
    }
    void this.initializeApp();
  }

  async loadBusinesses(): Promise<void> {
    const requestVersion = ++this.businessListRequestVersion;
    const requestUid = this.currentAuthUid;
    this.loading = true;
    this.error = '';
    try {
      const businesses = await this.api.listBusinesses();
      if (requestVersion !== this.businessListRequestVersion ||
          !this.signedIn || requestUid !== this.currentAuthUid) return;
      this.businesses = businesses;
      if (!this.businesses.length) {
        this.business = null;
        this.selectedBusinessId = '';
        this.clearWorkspaceData();
        // Keep the global control plane accessible to admins without workspace memberships.
        // If the platform capability was revoked, do not retain its previously selected tab.
        if (this.platformAdminAvailable) this.setTab('platform-admin');
        else this.setTab('overview');
        return;
      }
      const chosen = this.businesses.find(item => item.id === this.selectedBusinessId) || this.businesses[0];
      const workspaceAccessChanged = this.business?.id !== chosen.id || this.business?.role !== chosen.role;
      this.selectedBusinessId = chosen.id;
      this.business = chosen;
      // A membership or platform-role refresh can invalidate the currently selected tab.
      // Reuse the same navigation guard as interactive tab changes before reloading data.
      if (!this.canAccessTab(this.tab)) this.setTab('overview');
      if (workspaceAccessChanged) this.clearWorkspaceData();
      await this.loadWorkspaceData();
    } catch (error) {
      if (requestVersion !== this.businessListRequestVersion ||
          !this.signedIn || requestUid !== this.currentAuthUid) return;
      this.business = null;
      this.selectedBusinessId = '';
      this.clearWorkspaceData();
      this.error = this.message(error);
    } finally {
      if (requestVersion === this.businessListRequestVersion) this.loading = false;
    }
  }

  private clearWorkspaceData(): void {
    this.invoiceSaveGuard.invalidate();
    this.invoiceEditRequestGuard.invalidate();
    this.invoiceMutationGuard.invalidate();
    this.printRequestGuard.invalidate();
    this.paymentMutationGuard.invalidate();
    this.paymentLoading = false;
    this.paymentRetryPending = false;
    this.pendingPaymentRetrySnapshot = null;
    this.invoiceDraftSaving = false;
    this.invoiceDraftSummary = null;
    this.invoiceDraftInitialLines = null;
    this.invoiceDraftUncertain = false;
    this.pendingInvoiceDraftOutcome = null;
    this.invoiceDraftRevision += 1;
    this.invoiceCreateOpen = false;
    this.pendingInvoiceVoid = null;
    this.invoiceVoidError = '';
    this.pendingPurchaseReceipt = null;
    this.purchaseReceiptError = '';
    this.pendingPurchaseApproval = null;
    this.purchaseApprovalError = '';
    this.confirmationReturnFocus = null;
    this.chatRequestGuard.invalidate();
    this.payrollRefreshGuard.invalidate();
    this.dataIntegrityLoadGuard.invalidate();
    this.operationalHealthLoadGuard.invalidate();
    this.taxSummaryLoadGuard.invalidate();
    // Invalidate the top-level workspace load too; otherwise an old load's finally
    // block can still mutate loading state while a new identity is being resolved.
    this.workspaceLoadGuard.invalidate();
    this.profitLossLoadGuard.invalidate();
    this.auditLoadGuard.invalidate();
    this.statementLoadGuard.invalidate();
    this.auditEvents = [];
    this.auditTotal = 0;
    this.auditOffset = 0;
    this.auditLoading = false;
    this.auditError = '';
    this.auditAction = '';
    this.auditTargetType = '';
    this.customerStatement = null;
    this.statementLoading = false;
    this.statementError = '';
    this.statementVisible = false;
    this.statementCustomerName = '';
    this.statementCustomerId = '';
    this.statementOffset = 0;
    this.receivablesAgingLoadGuard.invalidate();
    this.dashboard = null;
    this.homeDashboardError = '';
    this.profitLoss = null;
    this.taxSummaryReport = null;
    this.dataIntegrityReport = null;
    this.integrityError = '';
    this.integrityLoading = false;
    this.integrityOffset = 0;
    this.taxError = '';
    this.taxLoading = false;
    this.agingReport = null;
    // Never carry an OWNER-only opening-stock value into another workspace or role.
    this.productOpeningQuantity = '0';
    // Import previews are workspace-scoped; never carry a pending CSV into another business.
    this.importCsvText = '';
    this.importFileName = '';
    this.importPreview = null;
    this.importMessage = '';
    this.importMessageKind = 'success';
    this.importLoading = false;
    this.customerImportCsvText = '';
    this.customerImportFileName = '';
    this.customerImportPreview = null;
    this.customerImportMessage = '';
    this.customerImportMessageKind = 'success';
    this.customerImportLoading = false;
    this.customers = [];
    this.products = [];
    this.invoices = [];
    this.payments = [];
    this.expenses = [];
    this.customerPickerLoadGuard.invalidate();
    this.productPickerLoadGuard.invalidate();
    this.invoiceListLoadGuard.invalidate();
    this.paymentListLoadGuard.invalidate();
    this.customersHasMore = false;
    this.productsHasMore = false;
    this.invoicesHasMore = false;
    this.paymentsHasMore = false;
    this.customersLoadingMore = false;
    this.productsLoadingMore = false;
    this.invoicesLoadingMore = false;
    this.paymentsLoadingMore = false;
    this.customerOffset = 0;
    this.productOffset = 0;
    this.invoiceOffset = 0;
    this.paymentOffset = 0;
    this.suppliers = [];
    this.purchaseOrders = [];
    this.recurringSchedules = [];
    this.notifications = [];
    this.supplierSearch = '';
    this.paymentSearch = '';
    this.expenseSearch = '';
    this.purchaseSearch = '';
    this.recurringSearch = '';
    this.notificationSearch = '';
    this.operationalHealth = null;
    this.operationsError = '';
    this.operationsErrorTab = null;
    this.operationsMessage = '';
    this.operationsMessageTab = null;
    this.operationsWarning = '';
    this.healthError = '';
    this.notificationTitle = '';
    this.notificationBody = '';
    this.supplierName = '';
    this.purchaseOrderNumber = '';
    this.purchaseSupplierId = '';
    this.purchaseProductId = '';
    this.recurringCustomerId = '';
    this.supplierEmail = '';
    this.supplierPhone = '';
    this.supplierAddress = '';
    this.purchaseQuantity = '1';
    this.purchaseUnitCost = '0';
    this.recurringIntervalDays = '30';
    this.recurringNextRunAt = new Date(Date.now() + 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    this.recurringTimezone = 'UTC';
    this.notificationScheduledAt = '';
    this.notificationDeduplicationKey = 'manual-' + Date.now();
    this.suppliersLoading = false;
    this.purchasesLoading = false;
    this.recurringLoading = false;
    this.notificationsLoading = false;
    this.healthLoading = false;
    this.expenseMessage = '';
    this.expenseSubmissionUncertain = false;
    this.chatSending = false;
    this.chatMessages = [];
    this.chatDraft = '';
    this.chatError = '';
    this.chatConfigurationMissing = false;
    this.chatCopyStatus = null;
    this.reportError = '';
    this.agingError = '';
    this.reportLoading = false;
    this.agingLoading = false;
    this.invoiceCustomerId = '';
    this.invoiceProductId = '';
    this.invoiceQuantity = '1';
    this.invoiceLines = [{ productId: '', quantity: '1' }];
    this.invoiceNumber = '';
    this.invoiceFilterCustomerId = '';
    this.editingInvoiceId = null;
    this.invoiceMessage = '';
    this.invoiceMessageKind = 'success';
    this.paymentCustomerId = '';
    this.paymentAmount = '';
    this.paymentAllocationAmount = '';
    this.paymentInvoiceId = '';
    this.paymentMethod = 'cash';
    this.paymentReference = '';
    this.paymentIdempotencyKey = '';
    this.paymentMessage = '';
    this.paymentMessageKind = 'info';
    this.importCsvText = '';
    this.importFileName = '';
    this.importPreview = null;
    this.importMessage = '';
    this.importLoading = false;
    this.customerName = '';
    this.customerEmail = '';
    this.customerPhone = '';
    this.customerMessage = '';
    this.customerMessageKind = 'success';
    this.productMessage = '';
    this.productMessageKind = 'success';
    this.productName = '';
    this.productPrice = '';
    this.stockTracked = false;
    this.profitLossPeriod = '30d';
    this.profitLossStart = '';
    this.profitLossEnd = '';
    this.tab = 'overview';
  }

  async createWorkspace(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const created = await this.api.createBusiness({ name: this.businessName, currency_code: this.currencyCode });
      this.businesses = [created];
      this.business = created;
      this.selectedBusinessId = created.id;
      this.clearWorkspaceData();
      this.businessName = '';
      await this.loadWorkspaceData();
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async switchBusiness(id: string): Promise<void> {
    if (this.invoiceDraftSaving || this.paymentLoading || this.paymentRetryPending) {
      this.error = this.t('ui.m_1ca11bx');
      return;
    }
    this.statementVisible = false;
    this.customerStatement = null;
    this.statementCustomerId = '';
    this.statementError = '';
    this.selectedBusinessId = id;
    this.business = this.businesses.find(item => item.id === id) || null;
    // A destination visible to the previous workspace role may be restricted here.
    if (!this.canAccessTab(this.tab)) this.tab = 'overview';
    this.clearWorkspaceData();
    this.error = '';
    await this.loadWorkspaceData();
  }

  private readonly workspaceLoadGuard = new WorkspaceLoadGuard();
  private readonly customerPickerLoadGuard = new WorkspaceLoadGuard();
  private readonly productPickerLoadGuard = new WorkspaceLoadGuard();
  private readonly invoiceListLoadGuard = new WorkspaceLoadGuard();
  private readonly paymentListLoadGuard = new WorkspaceLoadGuard();
  private readonly chatRequestGuard = new WorkspaceLoadGuard();
  private readonly payrollRefreshGuard = new WorkspaceLoadGuard();
  private readonly dataIntegrityLoadGuard = new WorkspaceLoadGuard();
  private readonly operationalHealthLoadGuard = new WorkspaceLoadGuard();
  private readonly taxSummaryLoadGuard = new WorkspaceLoadGuard();
  private readonly profitLossLoadGuard = new WorkspaceLoadGuard();
  private readonly receivablesAgingLoadGuard = new WorkspaceLoadGuard();
  private readonly invoiceSaveGuard = new WorkspaceLoadGuard();
  private readonly invoiceEditRequestGuard = new WorkspaceLoadGuard();
  private readonly invoiceMutationGuard = new WorkspaceLoadGuard();
  private readonly printRequestGuard = new WorkspaceLoadGuard();
  private readonly paymentMutationGuard = new WorkspaceLoadGuard();

  async loadWorkspaceData(): Promise<void> {
    const loadVersion = this.workspaceLoadGuard.begin();
    this.customerPickerLoadGuard.invalidate();
    this.productPickerLoadGuard.invalidate();
    this.invoiceListLoadGuard.invalidate();
    this.paymentListLoadGuard.invalidate();
    this.customersLoadingMore = false;
    this.productsLoadingMore = false;
    this.invoicesLoadingMore = false;
    this.paymentsLoadingMore = false;
    if (!this.business) {
      this.loading = false;
      return;
    }
    const id = this.business.id;
    const pendingInvoiceOutcome = this.currentAuthUid ? this.invoiceDraftOutcomeVault.get(this.currentAuthUid, id) : null;
    if (pendingInvoiceOutcome) {
      this.pendingInvoiceDraftOutcome = pendingInvoiceOutcome;
      this.invoiceDraftUncertain = true;
      this.invoiceNumber = pendingInvoiceOutcome.invoiceNumber;
      this.invoiceCustomerId = pendingInvoiceOutcome.customerId;
      this.invoiceDiscountRate = pendingInvoiceOutcome.discountRate;
      this.invoiceTaxRate = pendingInvoiceOutcome.taxRate;
      this.editingInvoiceId = pendingInvoiceOutcome.editingInvoiceId;
      this.invoiceCreateOpen = true;
    }
    const savedPaymentRetry = this.currentAuthUid ? this.paymentRetryVault.get(this.currentAuthUid, id) : null;
    if (savedPaymentRetry) {
      this.pendingPaymentRetrySnapshot = savedPaymentRetry;
      this.paymentRetryPending = true;
      this.paymentIdempotencyKey = savedPaymentRetry.payload.idempotency_key;
    }
    this.loading = true;
    this.error = '';
    try {
      const paymentsRequest = this.canAccessTab('payments') ? this.api.payments(id) : Promise.resolve([]);
      const [dashboard, customerPage, productPage, invoicePage, paymentPage, expensePage] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), paymentsRequest, this.api.expenses(id)
      ]);
      if (!this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) return;
      this.dashboard = dashboard;
      this.homeDashboardError = '';
      this.profitLoss = null;
      this.setCustomerPage(customerPage);
      if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      this.setProductPage(productPage);
      this.setInvoicePage(invoicePage);
      this.setPaymentPage(paymentPage);
      this.expenses = expensePage;
      if (!this.invoiceProductId && this.products.length) this.invoiceProductId = this.products[0].id;
      if (!this.paymentInvoiceId) this.paymentInvoiceId = this.invoices.find(item => item.status === 'issued')?.id || '';
    } catch (error) {
      if (this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) {
        this.clearWorkspaceData();
        this.error = this.message(error);
        // clearWorkspaceData invalidates the request generation, so this failure path
        // must release the loading state itself instead of relying on the guarded finally.
        this.loading = false;
      }
    } finally {
      if (this.workspaceLoadGuard.isLatest(loadVersion)) this.loading = false;
    }
  }


  private setCustomerPage(items: readonly Customer[]): void {
    const page = firstRecordPage(items, WORKSPACE_RECORD_PAGE_SIZE);
    this.customerPickerLoadGuard.invalidate();
    this.customers = page.records;
    this.customerOffset = page.nextOffset;
    this.customersHasMore = page.hasMore;
    this.customersLoadingMore = false;
  }

  private setProductPage(items: readonly Product[]): void {
    const page = firstRecordPage(items, WORKSPACE_RECORD_PAGE_SIZE);
    this.productPickerLoadGuard.invalidate();
    this.products = page.records;
    this.productOffset = page.nextOffset;
    this.productsHasMore = page.hasMore;
    this.productsLoadingMore = false;
  }

  private setInvoicePage(items: readonly Invoice[]): void {
    const page = firstRecordPage(items, WORKSPACE_RECORD_PAGE_SIZE);
    this.invoiceListLoadGuard.invalidate();
    this.invoices = page.records;
    this.invoiceOffset = page.nextOffset;
    this.invoicesHasMore = page.hasMore;
    this.invoicesLoadingMore = false;
    if (!this.paymentInvoiceId) {
      this.paymentInvoiceId = page.records.find(invoice => invoice.status === 'issued')?.id || '';
    }
  }

  private setPaymentPage(items: readonly Payment[]): void {
    const page = firstRecordPage(items, WORKSPACE_RECORD_PAGE_SIZE);
    this.paymentListLoadGuard.invalidate();
    this.payments = page.records;
    this.paymentOffset = page.nextOffset;
    this.paymentsHasMore = this.business?.role === 'owner' && page.hasMore;
    this.paymentsLoadingMore = false;
  }

  private async loadMoreRecords<T extends { id: string }>(options: {
    guard: WorkspaceLoadGuard;
    offset: number;
    hasMore: boolean;
    loading: boolean;
    fetchPage: (businessId: string, offset: number) => Promise<T[]>;
    getCurrentRecords: () => readonly T[];
    setRecords: (records: T[]) => void;
    setOffset: (offset: number) => void;
    setHasMore: (hasMore: boolean) => void;
    setLoading: (loading: boolean) => void;
  }): Promise<void> {
    const business = this.business;
    if (!business || !options.hasMore || options.loading || !this.signedIn || !this.currentAuthUid) return;
    const requestVersion = options.guard.begin();
    const requestContext = this.captureTenantRequest(business.id);
    const isCurrent = (): boolean =>
      this.isCurrentTenantOperation(options.guard, requestVersion, requestContext);
    options.setLoading(true);
    try {
      const page = await options.fetchPage(business.id, options.offset);
      if (!isCurrent()) return;
      const merged = mergeRecordPage(
        options.getCurrentRecords(),
        page,
        options.offset,
        WORKSPACE_RECORD_PAGE_SIZE,
      );
      options.setRecords(merged.records);
      options.setOffset(merged.nextOffset);
      options.setHasMore(merged.hasMore);
    } catch (error) {
      if (isCurrent()) this.error = this.message(error);
    } finally {
      if (isCurrent()) options.setLoading(false);
    }
  }

  loadMoreInvoiceCustomers(): Promise<void> {
    return this.loadMoreRecords({
      guard: this.customerPickerLoadGuard,
      offset: this.customerOffset,
      hasMore: this.customersHasMore,
      loading: this.customersLoadingMore,
      fetchPage: (id, offset) => this.api.customers(id, offset),
      getCurrentRecords: () => this.customers,
      setRecords: records => this.customers = records,
      setOffset: offset => this.customerOffset = offset,
      setHasMore: value => this.customersHasMore = value,
      setLoading: value => this.customersLoadingMore = value,
    });
  }

  loadMoreInvoiceProducts(): Promise<void> {
    return this.loadMoreRecords({
      guard: this.productPickerLoadGuard,
      offset: this.productOffset,
      hasMore: this.productsHasMore,
      loading: this.productsLoadingMore,
      fetchPage: (id, offset) => this.api.products(id, offset),
      getCurrentRecords: () => this.products,
      setRecords: records => this.products = records,
      setOffset: offset => this.productOffset = offset,
      setHasMore: value => this.productsHasMore = value,
      setLoading: value => this.productsLoadingMore = value,
    });
  }

  // Reuse the same tenant-scoped, deduplicating page loader in the main
  // directories and invoice editor; pagination state is shared intentionally.
  loadMoreCustomers(): Promise<void> {
    return this.loadMoreInvoiceCustomers();
  }

  loadMoreProducts(): Promise<void> {
    return this.loadMoreInvoiceProducts();
  }

  loadMoreInvoices(): Promise<void> {
    return this.loadMoreRecords({
      guard: this.invoiceListLoadGuard,
      offset: this.invoiceOffset,
      hasMore: this.invoicesHasMore,
      loading: this.invoicesLoadingMore,
      fetchPage: (id, offset) => this.api.invoices(id, offset),
      getCurrentRecords: () => this.invoices,
      setRecords: records => {
        this.invoices = records;
        if (!this.paymentInvoiceId) {
          this.paymentInvoiceId = records.find(invoice => invoice.status === 'issued')?.id || '';
        }
      },
      setOffset: offset => this.invoiceOffset = offset,
      setHasMore: value => this.invoicesHasMore = value,
      setLoading: value => this.invoicesLoadingMore = value,
    });
  }

  loadMorePayments(): Promise<void> {
    return this.loadMoreRecords({
      guard: this.paymentListLoadGuard,
      offset: this.paymentOffset,
      hasMore: this.paymentsHasMore,
      loading: this.paymentsLoadingMore,
      fetchPage: (id, offset) => this.api.payments(id, offset),
      getCurrentRecords: () => this.payments,
      setRecords: records => this.payments = records,
      setOffset: offset => this.paymentOffset = offset,
      setHasMore: value => this.paymentsHasMore = value,
      setLoading: value => this.paymentsLoadingMore = value,
    });
  }

  async refreshAfterPayrollPayment(): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const requestContext = this.currentChatRequestContext();
    if (!requestContext.signedIn || !requestContext.userId ||
        requestContext.role !== 'owner' || !requestContext.workspaceId) return;

    // Payroll refresh data is sensitive: discard late owner responses after a role,
    // identity, or workspace transition, even when the business ID stays the same.
    await runTenantScopedRequest(
      this.payrollRefreshGuard,
      requestContext,
      () => this.currentChatRequestContext(),
      async () => {
        const [expenses, dashboard] = await Promise.all([
          this.api.expenses(requestContext.workspaceId),
          this.api.dashboard(requestContext.workspaceId),
        ]);
        return { expenses, dashboard };
      },
      {
        onSuccess: ({ expenses, dashboard }) => {
          this.expenses = expenses;
          this.dashboard = dashboard;
          if (this.error === this.homeDashboardError) this.error = '';
          this.homeDashboardError = '';
          this.profitLoss = null;
        },
        onError: error => {
          // A failed current refresh must not leave pre-payment dashboard metrics visible.
          this.dashboard = null;
          this.homeDashboardError = this.message(error);
          this.error = this.homeDashboardError;
        },
        onFinally: () => undefined,
      },
    );
  }

  exportReceivablesAgingCsv(): void {
    if (!this.agingReport || !this.agingReport.invoices.length) return;
    const warnings = new Map<string, string[]>();
    for (const warning of this.agingReport.data_quality_warnings) {
      const current = warnings.get(warning.invoice_id) || [];
      current.push(this.agingWarningLabel(warning.type));
      warnings.set(warning.invoice_id, current);
    }
    const rows: string[][] = [[
      'as_of_date', 'invoice_number', 'customer_id', 'currency_code', 'due_date', 'aging_bucket',
      'invoice_total', 'allocated_payments', 'outstanding_amount', 'customer_link_missing', 'accounting_warnings'
    ]];
    for (const invoice of this.agingReport.invoices) {
      rows.push([
        this.agingReport.as_of_date, invoice.invoice_number, invoice.customer_id || '', invoice.currency_code,
        invoice.due_date || '', invoice.aging_bucket, invoice.invoice_total, invoice.allocated_payments,
        invoice.outstanding_amount, invoice.customer_link_missing ? 'true' : 'false',
        (warnings.get(invoice.invoice_id) || []).join('; ')
      ]);
    }
    const csv = '\uFEFF' + rows.map(row => row.map(value => {
      const raw = String(value);
      // Prevent spreadsheet formula execution for user-controlled cells such as invoice numbers.
      const safe = /^[\u0000-\u0020]*[=+\-@]/.test(raw) ? "'" + raw : raw;
      return '"' + safe.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'receivables-aging-' + this.agingReport.as_of_date + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  agingBucketLabel(bucket: string): string {
    const keys: Record<string, string> = {
      not_due: 'app.agingBucket.not_due',
      '1_30_days': 'app.agingBucket.1_30_days',
      '31_60_days': 'app.agingBucket.31_60_days',
      '61_90_days': 'app.agingBucket.61_90_days',
      over_90_days: 'app.agingBucket.over_90_days',
      no_due_date: 'app.agingBucket.no_due_date',
    };
    return keys[bucket] ? this.t(keys[bucket]) : bucket;
  }

  agingWarningLabel(type: string): string {
    const keys: Record<string, string> = {
      payment_currency_mismatch: 'app.agingWarning.payment_currency_mismatch',
      allocations_exceed_invoice_total: 'app.agingWarning.allocations_exceed_invoice_total',
    };
    return keys[type] ? this.t(keys[type]) : type;
  }


  toggleMobileMore(): void {
    if (this.mobileMoreOpen) this.mobileMoreSearch = '';
    this.mobileMoreOpen = !this.mobileMoreOpen;
  }

  @HostListener('document:keydown.escape')
  closeMobileMoreOnEscape(): void {
    if (!this.mobileMoreOpen) return;
    this.mobileMoreOpen = false;
    this.mobileMoreSearch = '';
    this.mobileMoreTrigger?.nativeElement.focus();
  }

  /** Restore keyboard focus to the More trigger after a secondary destination is selected. */
  selectMobileMoreTab(tab: Tab): void {
    this.mobileMoreSearch = '';
    this.setTab(tab);
    this.mobileMoreTrigger?.nativeElement.focus();
  }

  @HostListener('document:pointerdown', ['$event'])
  closeMobileMoreOnOutsidePointer(event: PointerEvent): void {
    if (!this.mobileMoreOpen) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (this.mobileMoreTrigger?.nativeElement.contains(target)
      || this.mobileMoreMenu?.nativeElement.contains(target)) return;
    this.mobileMoreOpen = false;
    this.mobileMoreSearch = '';
  }

  async installApp(): Promise<void> {
    this.installHelp = false;
    if (this.isInstalled) return;
    if (!this.installPrompt) { this.installHelp = true; return; }
    try {
      await this.installPrompt.prompt();
      const choice = await this.installPrompt.userChoice;
      if (choice.outcome === 'accepted') { this.isInstalled = true; }
    } catch { this.installHelp = true; }
    finally { this.installPrompt = null; }
  }

  reloadAppAfterUpdate(): void {
    this.appUpdateAvailable = false;
    window.location.reload();
  }

  async initializeApp(): Promise<void> {
    this.authFlowInProgress = true;
    this.initialized = false;
    this.startupFailed = false;
    this.loading = true;
    this.error = '';
    this.syncDocumentLanguage();
    try {
      let config: Awaited<ReturnType<AuthService['getRuntimeConfig']>>;
      try {
        config = await this.auth.getRuntimeConfig();
      } catch (error) {
        this.startupFailed = true;
        this.error = this.message(error);
        return;
      }
      this.setupNeeded = !config.apiBaseUrl?.trim() ||
        !config.firebase?.apiKey || !config.firebase?.authDomain ||
        !config.firebase?.projectId || !config.firebase?.appId;
      if (this.setupNeeded) return;
      const user = await this.auth.currentUser();
      this.currentAuthUid = user?.uid ?? null;
      this.currentAuthEmail = user?.email ?? null;
      if (user) {
        this.signedIn = true;
        this.userEmail = user.email || this.t('common.signedInUser');
        await this.checkPlatformAdminAccess();
        await this.loadBusinesses();
      }
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.authFlowInProgress = false;
      this.loading = false;
      this.initialized = true;
      this.applyPendingAuthSnapshot();
    }
  }

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

  paymentMethodLabel(method: string): string {
    const keys: Record<string, string> = {
      cash: 'app.paymentMethod.cash', bank_transfer: 'app.paymentMethod.bank_transfer',
      card: 'app.paymentMethod.card', wallet: 'app.paymentMethod.wallet', other: 'app.paymentMethod.other',
    };
    return keys[method] ? this.t(keys[method]) : method;
  }

  currencyName(code: string): string {
    const normalized = code.toUpperCase();
    const keys: Record<string, string> = {
      EGP: 'app.currencyName.egp',
      USD: 'app.currencyName.usd',
      EUR: 'app.currencyName.eur',
      GBP: 'app.currencyName.gbp',
      SAR: 'app.currencyName.sar',
      AED: 'app.currencyName.aed',
    };
    return keys[normalized] ? this.t(keys[normalized]) : normalized;
  }

  notificationStatusLabel(status: string): string {
    const keys: Record<string, string> = {
      pending: 'app.notificationStatus.pending', sent: 'app.notificationStatus.sent',
      failed: 'app.notificationStatus.failed', cancelled: 'app.notificationStatus.cancelled',
    };
    return keys[status] ? this.t(keys[status]) : status || this.t('app.labels.unknownStatus');
  }

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

  customerStatementEventLabel(eventType: string): string {
    const keys: Record<string, string> = {
      invoice_issued: 'app.customerStatementEvent.invoice_issued',
      payment_allocation: 'app.customerStatementEvent.payment_allocation',
      currency_mismatch_allocation: 'app.customerStatementEvent.currency_mismatch_allocation',
    };
    return keys[eventType] ? this.t(keys[eventType]) : eventType;
  }

  auditActionLabel(action: string): string {
    return this.t(formatAuditActionLabel(action));
  }

  auditTargetLabel(target: string): string {
    return this.t(formatAuditTargetLabel(target));
  }

  revenueBasisLabel(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (normalized.includes('gross issued invoice totals before sales returns')) return this.t('ui.m_19xyqei');
    if (normalized === 'gross issued invoice total' || normalized === 'gross issued invoice totals') return this.t('ui.m_rms1b9');
    if (normalized === 'issued invoices' || normalized === 'issued invoice total') return this.t('ui.m_9mwoh2');
    return value;
  }

  integrityWarningLabel(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (normalized.startsWith('this report identifies records for manual review only.')) return this.t('ui.m_jm2qpm');
    if (normalized === 'manual review only' || normalized === 'report is for manual review only') return this.t('ui.m_5watgl');
    return value;
  }

  reportLimitationLabel(value: string): string {
    const normalized = value.trim().toLowerCase();
    const keys: Record<string, string> = {
  "manual review only": "app.reportLimitation.1",
  "report is read-only": "app.reportLimitation.2",
  "amounts are separated by currency": "app.reportLimitation.3",
  "uses saved tax totals on issued invoices; it does not recalculate historical taxes.": "app.reportLimitation.4",
  "currency totals are kept separate and are not converted.": "app.reportLimitation.5",
  "this is an operational summary, not a jurisdiction-specific tax filing.": "app.reportLimitation.6",
  "revenue is based on issued invoice totals, not cash collected.": "app.reportLimitation.7",
  "invoice totals include stored tax amounts; approved sales returns are not netted from this figure.": "app.reportLimitation.8",
  "this result subtracts recorded expenses only and excludes cost of goods sold because product purchase costs are not yet linked to sales.": "app.reportLimitation.9",
  "tax liability treatment and tax allocation to returns are not represented as a complete accounting ledger.": "app.reportLimitation.10",
  "currency totals are kept separate and are never converted.": "app.reportLimitation.11",
  "only issued invoices with a positive remaining balance appear in aging buckets; drafts and void invoices are excluded.": "app.reportLimitation.12",
  "fully settled invoices are excluded from open receivables aging.": "app.reportLimitation.13",
  "overallocated invoices are excluded from receivable balances and shown as positive-excess data-quality warnings.": "app.reportLimitation.14",
  "invoices without due dates are reported separately and are not assumed current.": "app.reportLimitation.15",
  "legacy invoices without customer links are flagged for review, not auto-corrected.": "app.reportLimitation.16",
  "currency-mismatched allocations are listed as warnings and never reduce receivables.": "app.reportLimitation.17",
  "this is an accounts-receivable aging report, not net profit or a full general ledger.": "app.reportLimitation.18"
};
    return keys[normalized] ? this.t(keys[normalized]) : value;
  }

  operationalHealthStatusLabel(status: string): string {
    if (status === 'ok') return this.t('ui.m_1nehj8y');
    if (status === 'degraded') return this.t('ui.m_124oetm');
    return status || this.t('app.labels.unknownStatus');
  }

  invoiceStatusLabel(status: string): string {
    const keys: Record<string, string> = {
      draft: 'app.invoiceStatus.draft', issued: 'app.invoiceStatus.issued',
      void: 'app.invoiceStatus.void', paid: 'app.invoiceStatus.paid', overdue: 'app.invoiceStatus.overdue',
    };
    return keys[status] ? this.t(keys[status]) : this.t('app.labels.unknownStatus');
  }

  purchaseOrderStatusLabel(status: string): string {
    const keys: Record<string, string> = {
      draft: 'app.purchaseOrderStatus.draft', approved: 'app.purchaseOrderStatus.approved',
      partially_received: 'app.purchaseOrderStatus.partially_received',
      received: 'app.purchaseOrderStatus.received', cancelled: 'app.purchaseOrderStatus.cancelled',
    };
    return keys[status] ? this.t(keys[status]) : status || this.t('app.labels.unknownStatus');
  }

  get pageTitle(): string {
    const keys: Record<Tab, string> = {
  "overview": "app.pageTitle.overview",
  "customers": "app.pageTitle.customers",
  "products": "app.pageTitle.products",
  "invoices": "app.pageTitle.invoices",
  "payments": "app.pageTitle.payments",
  "expenses": "app.pageTitle.expenses",
  "employees": "app.pageTitle.employees",
  "suppliers": "app.pageTitle.suppliers",
  "purchases": "app.pageTitle.purchases",
  "recurring": "app.pageTitle.recurring",
  "notifications": "app.pageTitle.notifications",
  "health": "app.pageTitle.health",
  "assistant": "app.pageTitle.assistant",
  "reports": "app.pageTitle.reports",
  "taxes": "app.pageTitle.taxes",
  "audit": "app.pageTitle.audit",
  "integrity": "app.pageTitle.integrity",
  "release-guide": "app.pageTitle.release-guide",
  "platform-admin": "app.pageTitle.platform-admin"
};
    return this.t(keys[this.tab]);
  }

  async loadReceivablesAging(): Promise<void> {
    if (!this.business) return;
    const loadVersion = this.receivablesAgingLoadGuard.begin();
    const businessId = this.business.id;
    this.agingLoading = true;
    this.agingError = '';
    try {
      const report = await this.api.receivablesAging(businessId, this.agingAsOf);
      if (!this.receivablesAgingLoadGuard.isCurrent(loadVersion, this.business?.id, businessId)) return;
      this.agingReport = report;
    } catch (error) {
      if (this.receivablesAgingLoadGuard.isCurrent(loadVersion, this.business?.id, businessId)) {
        this.agingError = this.message(error);
      }
    } finally {
      if (this.receivablesAgingLoadGuard.isLatest(loadVersion)) this.agingLoading = false;
    }
  }

  async loadProfitLoss(): Promise<void> {
    if (!this.business) return;
    if (this.profitLossPeriod === 'custom' && (!this.profitLossStart || !this.profitLossEnd)) {
      this.profitLossLoadGuard.invalidate();
      this.profitLoss = null;
      this.reportLoading = false;
      this.reportError = this.t('ui.m_unhyh1');
      return;
    }
    const loadVersion = this.profitLossLoadGuard.begin();
    const businessId = this.business.id;
    this.reportLoading = true;
    this.reportError = '';
    try {
      const report = await this.api.profitLoss(
        businessId,
        this.profitLossPeriod,
        this.profitLossPeriod === 'custom' ? this.profitLossStart : undefined,
        this.profitLossPeriod === 'custom' ? this.profitLossEnd : undefined
      );
      if (!this.profitLossLoadGuard.isCurrent(loadVersion, this.business?.id, businessId)) return;
      this.profitLoss = report;
    } catch (error) {
      if (this.profitLossLoadGuard.isCurrent(loadVersion, this.business?.id, businessId)) {
        this.reportError = this.message(error);
      }
    } finally {
      if (this.profitLossLoadGuard.isLatest(loadVersion)) this.reportLoading = false;
    }
  }


  async loadTaxSummary(): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const requestContext = this.currentChatRequestContext();
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
      () => this.currentChatRequestContext(),
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

  async loadDataIntegrity(offset = 0): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const requestContext = this.currentChatRequestContext();
    if (!requestContext.signedIn || !requestContext.userId ||
        requestContext.role !== 'owner' || !requestContext.workspaceId) return;
    this.integrityLoading = true;
    this.integrityError = '';
    this.integrityOffset = offset;
    await runTenantScopedRequest(
      this.dataIntegrityLoadGuard,
      requestContext,
      () => this.currentChatRequestContext(),
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

  async loadOperationalHealth(): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const requestContext = this.currentChatRequestContext();
    if (!requestContext.signedIn || !requestContext.userId ||
        requestContext.role !== 'owner' || !requestContext.workspaceId) return;
    this.healthLoading = true;
    this.healthError = '';
    await runTenantScopedRequest(
      this.operationalHealthLoadGuard,
      requestContext,
      () => this.currentChatRequestContext(),
      () => this.api.operationsHealth(requestContext.workspaceId),
      {
        onSuccess: result => { this.operationalHealth = result; },
        onError: error => {
          this.operationalHealth = null;
          this.healthError = this.message(error);
        },
        onFinally: () => { this.healthLoading = false; },
        onStale: () => { this.healthLoading = false; },
      },
    );
  }

  private beginOperationsAction(): void {
    this.operationsError = '';
    this.operationsErrorTab = null;
    this.operationsMessage = '';
    this.operationsMessageTab = null;
    this.operationsWarning = '';
  }

  private setOperationsSuccess(tab: OperationsMessageTab, message: string): void {
    this.operationsErrorTab = null;
    this.operationsMessage = message;
    this.operationsMessageTab = tab;
  }

  private setOperationsFailure(tab: OperationsMessageTab, error: unknown): void {
    if (this.operationsMessageTab === tab && this.operationsMessage) {
      this.operationsWarning = this.t('ui.m_1ngg92z') + ' ' + this.message(error);
      return;
    }
    this.operationsError = this.message(error);
    this.operationsErrorTab = tab;
  }

  private async loadNotifications(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.notificationsLoading = true;
    this.operationsError = '';
    this.operationsErrorTab = null;
    try {
      const items = await this.api.notifications(businessId);
      if (this.business?.id === businessId) this.notifications = items;
    } catch (error) {
      if (this.business?.id === businessId) {
        this.operationsError = this.message(error);
        this.operationsErrorTab = 'notifications';
      }
    } finally {
      if (this.business?.id === businessId) this.notificationsLoading = false;
    }
  }
  async createNotification(): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.notificationTitle.trim() || !this.notificationBody.trim()) return;
    const businessId = this.business.id;
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
      if (this.business?.id !== businessId) return;
      this.setOperationsSuccess('notifications', this.t('ui.m_1618gqb'));
      this.notificationTitle = '';
      this.notificationBody = '';
      this.notificationScheduledAt = '';
      this.notificationDeduplicationKey = 'manual-' + Date.now();
      const items = await this.api.notifications(businessId);
      if (this.business?.id === businessId) this.notifications = items;
    } catch (error) {
      if (this.business?.id === businessId) this.setOperationsFailure('notifications', error);
    } finally {
      if (this.business?.id === businessId) this.notificationsLoading = false;
    }
  }

  private async loadSuppliers(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.suppliersLoading = true; this.operationsError = ''; this.operationsErrorTab = null;
    try { const items = await this.api.suppliers(businessId); if (this.business?.id === businessId) this.suppliers = items; }
    catch (error) { if (this.business?.id === businessId) { this.operationsError = this.message(error); this.operationsErrorTab = 'suppliers'; } }
    finally { if (this.business?.id === businessId) this.suppliersLoading = false; }
  }
  private async loadPurchaseOrders(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.purchasesLoading = true; this.operationsError = ''; this.operationsErrorTab = null;
    try { const items = await this.api.purchaseOrders(businessId); if (this.business?.id === businessId) this.purchaseOrders = items; }
    catch (error) { if (this.business?.id === businessId) { this.operationsError = this.message(error); this.operationsErrorTab = 'purchases'; } }
    finally { if (this.business?.id === businessId) this.purchasesLoading = false; }
  }
  private async loadRecurringSchedules(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.recurringLoading = true; this.operationsError = ''; this.operationsErrorTab = null;
    try { const items = await this.api.recurringSchedules(businessId); if (this.business?.id === businessId) this.recurringSchedules = items; }
    catch (error) { if (this.business?.id === businessId) { this.operationsError = this.message(error); this.operationsErrorTab = 'recurring'; } }
    finally { if (this.business?.id === businessId) this.recurringLoading = false; }
  }
  async createSupplier(): Promise<void> {
    if (!this.business || !this.supplierName.trim()) return;
    const businessId = this.business.id;
    this.beginOperationsAction();
    this.suppliersLoading = true;
    try {
      await this.api.createSupplier(businessId, {
        name: this.supplierName.trim(),
        email: this.supplierEmail.trim() || undefined,
        phone: this.supplierPhone.trim() || undefined,
        address: this.supplierAddress.trim() || undefined,
      });
      if (this.business?.id !== businessId) return;
      this.setOperationsSuccess('suppliers', this.t('ui.m_oddjud'));
      this.supplierName = '';
      this.supplierEmail = '';
      this.supplierPhone = '';
      this.supplierAddress = '';
      const items = await this.api.suppliers(businessId);
      if (this.business?.id === businessId) this.suppliers = items;
    } catch (error) {
      if (this.business?.id === businessId) this.setOperationsFailure('suppliers', error);
    } finally {
      if (this.business?.id === businessId) this.suppliersLoading = false;
    }
  }
  async createPurchaseOrder(): Promise<void> {
    if (!this.business || !this.purchaseSupplierId || !this.purchaseProductId) return;
    this.beginOperationsAction();
    const quantity = Number(this.purchaseQuantity);
    const unitCost = Number(this.purchaseUnitCost);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) {
      this.operationsError = this.t('ui.m_12jqxlj');
      this.operationsErrorTab = 'purchases';
      return;
    }
    const businessId = this.business.id;
    this.purchasesLoading = true;
    try {
      await this.api.createPurchaseOrder(businessId, {
        supplier_id: this.purchaseSupplierId,
        order_number: this.purchaseOrderNumber.trim(),
        currency_code: this.business.currency_code,
        lines: [{ product_id: this.purchaseProductId, quantity: this.purchaseQuantity, unit_cost: this.purchaseUnitCost }],
      });
      if (this.business?.id !== businessId) return;
      this.setOperationsSuccess('purchases', this.t('ui.m_1ouzvty'));
      this.purchaseOrderNumber = '';
      this.purchaseQuantity = '1';
      this.purchaseUnitCost = '0';
      const items = await this.api.purchaseOrders(businessId);
      if (this.business?.id === businessId) this.purchaseOrders = items;
    } catch (error) {
      if (this.business?.id === businessId) this.setOperationsFailure('purchases', error);
    } finally {
      if (this.business?.id === businessId) this.purchasesLoading = false;
    }
  }
  hasRemainingQuantity(line: { remaining_quantity: string }): boolean { return Number(line.remaining_quantity) > 0; }
  canApprovePurchaseOrder(order: PurchaseOrder): boolean {
    return order.status === 'draft' && order.lines.length > 0;
  }
  canReceivePurchaseOrder(order: PurchaseOrder): boolean {
    return (order.status === 'approved' || order.status === 'partially_received') &&
      order.lines.some(line => this.hasRemainingQuantity(line));
  }
  supplierNameFor(id: string): string { return this.suppliers.find(item=>item.id===id)?.name || id.slice(0,8); }
  productNameFor(id: string): string { return this.products.find(item=>item.id===id)?.name || id.slice(0,8); }
  requestPurchaseOrderApproval(order: PurchaseOrder, event: MouseEvent | HTMLElement): void {
    if (!this.business || this.business.role !== 'owner' || !this.canApprovePurchaseOrder(order) || this.purchasesLoading) return;
    this.pendingInvoiceVoid = null;
    this.invoiceVoidError = '';
    this.pendingPurchaseReceipt = null;
    this.purchaseReceiptError = '';
    this.pendingPurchaseApproval = order;
    this.purchaseApprovalError = '';
    this.confirmationReturnFocus = event instanceof HTMLElement ? event : event.currentTarget as HTMLElement;
  }

  cancelPurchaseOrderApproval(): void {
    this.pendingPurchaseApproval = null;
    this.purchaseApprovalError = '';
    this.confirmationReturnFocus = null;
  }

  get pendingPurchaseApprovalDetails(): string[] {
    const order = this.pendingPurchaseApproval;
    if (!order) return [];
    const lineDetails = order.lines.map(line =>
      `${this.productNameFor(line.product_id)} × ${line.quantity} · ${this.t('ui.m_19mrznv')}: ${line.unit_cost} ${order.currency_code}`
    );
    return [
      `${this.t('ui.m_x27ir1')}: ${this.supplierNameFor(order.supplier_id)}`,
      ...lineDetails,
      `${this.t('ui.m_l97slj')}: ${order.total} ${order.currency_code}`,
    ];
  }

  async confirmPurchaseOrderApproval(): Promise<void> {
    const order = this.pendingPurchaseApproval;
    if (!order || !this.business || this.business.role !== 'owner' || !this.canApprovePurchaseOrder(order) || this.purchasesLoading) return;
    const businessId = this.business.id;
    this.beginOperationsAction();
    this.purchasesLoading = true;
    this.purchaseApprovalError = '';
    try {
      const approved = await this.api.approvePurchaseOrder(businessId, order.id);
      if (this.business?.id !== businessId) return;
      if (approved.id !== order.id || approved.status !== 'approved') {
        throw new Error(this.t('ui.m_v2cy1w'));
      }
      this.purchaseOrders = this.purchaseOrders.map(item => item.id === order.id ? { ...item, ...approved } : item);
      this.pendingPurchaseApproval = null;
      this.confirmationReturnFocus = null;
      this.setOperationsSuccess('purchases', this.t('ui.m_vgcvj1'));
    } catch (error) {
      if (this.business?.id === businessId) {
        this.setOperationsFailure('purchases', error);
        this.purchaseApprovalError = this.operationsError || this.message(error);
      }
    } finally {
      if (this.business?.id === businessId) this.purchasesLoading = false;
    }
  }

  requestPurchaseOrderReceipt(order: PurchaseOrder, event: MouseEvent | HTMLElement): void {
    if (!this.business || this.business.role !== 'owner' || !this.canReceivePurchaseOrder(order)) return;
    this.pendingPurchaseApproval = null;
    this.purchaseApprovalError = '';
    this.pendingInvoiceVoid = null;
    this.invoiceVoidError = '';
    this.pendingPurchaseReceipt = order;
    this.purchaseReceiptError = '';
    this.confirmationReturnFocus = event instanceof HTMLElement ? event : event.currentTarget as HTMLElement;
  }

  cancelPurchaseOrderReceipt(): void {
    this.pendingPurchaseReceipt = null;
    this.purchaseReceiptError = '';
    this.confirmationReturnFocus = null;
  }

  get pendingPurchaseReceiptDetails(): string[] {
    return (this.pendingPurchaseReceipt?.lines || [])
      .filter(line => this.hasRemainingQuantity(line))
      .map(line => `${this.productNameFor(line.product_id)} · ${line.remaining_quantity} ${this.t('ui.m_ung25p')}`);
  }

  async confirmPurchaseOrderReceipt(): Promise<void> {
    const order = this.pendingPurchaseReceipt;
    if (!order || !this.business || this.business.role !== 'owner' || !this.canReceivePurchaseOrder(order) || this.purchasesLoading) return;
    const lines = order.lines
      .filter(line => this.hasRemainingQuantity(line))
      .map(line => ({ line_id: line.id, quantity: line.remaining_quantity }));
    if (!lines.length) {
      this.cancelPurchaseOrderReceipt();
      return;
    }
    const businessId = this.business.id;
    this.beginOperationsAction();
    this.purchasesLoading = true;
    this.purchaseReceiptError = '';
    try {
      await this.api.receivePurchaseOrder(businessId, order.id, lines);
      if (this.business?.id !== businessId) return;
      this.pendingPurchaseReceipt = null;
      this.confirmationReturnFocus = null;
      this.setOperationsSuccess('purchases', this.t('ui.m_1tmkq6x'));
      try {
        const [orders, products, dashboard] = await Promise.all([
          this.api.purchaseOrders(businessId),
          this.api.products(businessId),
          this.api.dashboard(businessId),
        ]);
        if (this.business?.id === businessId) {
          this.purchaseOrders = orders;
          this.setProductPage(products);
          this.dashboard = dashboard;
        }
      } catch (error) {
        if (this.business?.id === businessId) this.setOperationsFailure('purchases', error);
      }
    } catch (error) {
      if (this.business?.id === businessId) {
        this.setOperationsFailure('purchases', error);
        this.purchaseReceiptError = this.operationsError || this.message(error);
      }
    } finally {
      if (this.business?.id === businessId) this.purchasesLoading = false;
    }
  }
  async createRecurringSchedule(): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    this.beginOperationsAction();
    const interval = Number(this.recurringIntervalDays);
    if (!Number.isInteger(interval) || interval < 1 || interval > 3650) {
      this.operationsError = this.t('ui.m_1jvv49p');
      this.operationsErrorTab = 'recurring';
      return;
    }
    const businessId = this.business.id;
    this.recurringLoading = true;
    try {
      await this.api.createRecurringSchedule(businessId, {
        customer_id: this.recurringCustomerId || null,
        interval_days: interval,
        timezone: this.recurringTimezone.trim() || 'UTC',
        next_run_at: new Date(this.recurringNextRunAt).toISOString(),
      });
      if (this.business?.id !== businessId) return;
      this.setOperationsSuccess('recurring', this.t('ui.m_6a3p89'));
      const items = await this.api.recurringSchedules(businessId);
      if (this.business?.id === businessId) this.recurringSchedules = items;
    } catch (error) {
      if (this.business?.id === businessId) this.setOperationsFailure('recurring', error);
    } finally {
      if (this.business?.id === businessId) this.recurringLoading = false;
    }
  }

  get maxIntegrityTotal(): number {
    const report = this.dataIntegrityReport;
    return report ? Math.max(report.unlinked_issued_invoices.total, report.currency_mismatched_allocations.total, report.customer_mismatched_allocations.total) : 0;
  }

  async loadAuditEvents(offset = 0): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.signedIn || !this.currentAuthUid) return;
    const requestVersion = this.auditLoadGuard.begin();
    const businessId = this.business.id;
    const requestContext = {
      workspaceId: businessId,
      userId: this.currentAuthUid,
      role: this.business.role ?? null,
      signedIn: this.signedIn,
    };
    const isCurrentRequest = (): boolean => isCurrentTenantRequest(
      this.auditLoadGuard,
      requestVersion,
      requestContext,
      {
        workspaceId: this.business?.id ?? '',
        userId: this.currentAuthUid,
        role: this.business?.role ?? null,
        signedIn: this.signedIn,
      },
    );

    this.auditLoading = true;
    this.auditError = '';
    try {
      const result = await this.api.auditEvents(businessId, {
        limit: 50, offset,
        action: this.auditAction.trim() || undefined,
        target_type: this.auditTargetType.trim() || undefined
      });
      if (!isCurrentRequest()) return;
      this.auditEvents = result.items;
      this.auditTotal = result.total;
      this.auditOffset = result.offset;
    } catch (error) {
      if (!isCurrentRequest()) return;
      this.auditEvents = [];
      this.auditTotal = 0;
      this.auditError = this.message(error);
    } finally {
      if (this.auditLoadGuard.isLatest(requestVersion)) this.auditLoading = false;
    }
  }

  canAccessTab(tab: Tab): boolean {
    return canAccessWorkspaceTab(tab, this.business?.role, this.platformAdminAvailable);
  }

  /** Home module cards share the exact same role/availability check as navigation. */
  get homeModuleCards(): readonly WorkspaceModuleCard[] {
    return WORKSPACE_MODULE_CATALOG.filter(module => this.canAccessTab(module.tab));
  }

  /** Home quick access stays focused on the five existing key destinations. */
  get filteredHomeModuleCards(): readonly WorkspaceModuleCard[] {
    return filterWorkspaceModules(
      this.homeModuleCards,
      this.homeModuleSearch,
      this.localization.locale,
      key => this.t(key),
    );
  }

  get homeQuickAccessCards(): readonly WorkspaceModuleCard[] {
    return selectHomeQuickAccessModules(this.homeModuleCards);
  }

  /** More navigation is rendered from the same role-filtered catalogue as Home. */
  get mobileMoreGroups(): readonly (WorkspaceModuleGroup & { modules: readonly WorkspaceModuleCard[] })[] {
    const accessibleModules = this.homeModuleCards;
    return WORKSPACE_MODULE_GROUPS
      .map(group => ({
        ...group,
        modules: accessibleModules.filter(module => module.mobileGroup === group.id),
      }))
      .filter(group => group.modules.length > 0);
  }

  isMobileMoreTab(tab: Tab): boolean {
    return isMobileMoreTabValue(tab);
  }

  /** Search only the already-authorized mobile destinations; this is navigation UX, not access control. */
  get filteredMobileMoreGroups(): readonly (WorkspaceModuleGroup & { modules: readonly WorkspaceModuleCard[] })[] {
    const query = this.mobileMoreSearch.trim().normalize('NFKC').toLocaleLowerCase(this.localization.locale);
    if (!query) return this.mobileMoreGroups;
    return this.mobileMoreGroups.map(group => {
      const locale = this.language === 'ar' ? 'ar-EG' : 'en';
      const groupMatches = this.t(group.titleKey).normalize('NFKC').toLocaleLowerCase(locale).includes(query);
      const modules = groupMatches ? group.modules : filterWorkspaceModules(
        group.modules,
        this.mobileMoreSearch,
        locale,
        key => this.t(key),
      );
      return { ...group, modules };
    }).filter(group => group.modules.length > 0);
  }

  setTab(tab: Tab): void {
    if (!this.canAccessTab(tab)) {
      this.tab = 'overview';
      this.mobileMoreOpen = false;
      return;
    }
    if (this.operationsMessageTab && this.operationsMessageTab !== tab) {
      this.operationsMessage = '';
      this.operationsMessageTab = null;
      this.operationsWarning = '';
    }
    this.tab = tab;
    this.error = tab === 'overview' && this.homeDashboardError ? this.homeDashboardError : '';
    this.mobileMoreOpen = false;
    if (tab === 'reports') void this.loadProfitLoss();
    if (tab === 'taxes' && this.business?.role === 'owner') void this.loadTaxSummary();
    if (tab === 'audit') void this.loadAuditEvents(0);
    if (tab === 'integrity' && this.business?.role === 'owner') void this.loadDataIntegrity(0);
    if (tab === 'suppliers') void this.loadSuppliers();
    if (tab === 'purchases') { void this.loadSuppliers(); void this.loadPurchaseOrders(); }
    if (tab === 'recurring') void this.loadRecurringSchedules();
    if (tab === 'notifications') void this.loadNotifications();
    if (tab === 'health' && this.business?.role === 'owner') void this.loadOperationalHealth();
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

  formatNumber(value: string | number | null | undefined, fractionDigits = 2): string {
    return this.localization.formatNumber(value, fractionDigits, fractionDigits);
  }

  formatCustomerStatementDate(value: string | null | undefined): string {
    if (!value || !Number.isFinite(Date.parse(value))) return '—';
    return this.localization.formatDate(value, { dateStyle: 'short', timeStyle: 'short' });
  }

  get customerStatementTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'date',label:this.t('ui.m_1fcm91o')},
    {key:'event',label:this.t('ui.m_1ktv9rs'),primary:true},
    {key:'reference',label:this.t('ui.m_eimrhe')},
    {key:'debit',label:this.t('ui.m_b173yr'),kind:'numeric'},
    {key:'credit',label:this.t('ui.m_12mq4cg'),kind:'numeric'},
    {key:'balance',label:this.t('ui.m_lyblb3'),kind:'numeric'},
  ]; }
  get customerStatementTableRows(): readonly AbaRecordTableRow[] { return (this.customerStatement?.items||[]).map((event,index)=>({
    id:`${event.source_id}:${event.event_type}:${event.invoice_id||''}:${event.occurred_at}:${index}`,
    cells:{
      date:this.formatCustomerStatementDate(event.occurred_at),
      event:this.customerStatementEventLabel(event.event_type),reference:event.reference||event.source_id,
      debit:`${event.debit} ${event.currency_code}`,credit:`${event.credit} ${event.currency_code}`,
      balance:`${event.balance} ${event.currency_code}`,
    },
  })); }
  get statementBalanceEntries(): Array<{ currency: string; balance: string }> {
    return Object.entries(this.customerStatement?.balances_by_currency || {}).map(([currency, balance]) => ({ currency, balance }));
  }

  async loadCustomerStatement(customer: Customer): Promise<void> {
    this.statementCustomerId = customer.id;
    this.statementCustomerName = customer.name;
    this.statementFromDate = '';
    this.statementToDate = '';
    this.statementVisible = true;
    await this.loadCustomerStatementPage(0);
  }

  async applyCustomerStatementFilters(): Promise<void> {
    if (this.statementFromDate && this.statementToDate && this.statementFromDate > this.statementToDate) {
      this.statementError = this.t('ui.m_r5b60p');
      return;
    }
    await this.loadCustomerStatementPage(0);
  }

  async clearCustomerStatementFilters(): Promise<void> {
    this.statementFromDate = '';
    this.statementToDate = '';
    await this.loadCustomerStatementPage(0);
  }

  async loadCustomerStatementPage(offset: number): Promise<void> {
    if (!this.business || !this.statementCustomerId || !this.signedIn || !this.currentAuthUid) return;
    const requestVersion = this.statementLoadGuard.begin();
    const requestedCustomerId = this.statementCustomerId;
    const businessId = this.business.id;
    const requestContext = {
      workspaceId: businessId,
      userId: this.currentAuthUid,
      role: this.business.role ?? null,
      signedIn: this.signedIn,
      customerId: requestedCustomerId,
    };
    const isCurrentRequest = (): boolean => isCurrentTenantRequest(
      this.statementLoadGuard,
      requestVersion,
      requestContext,
      {
        workspaceId: this.business?.id ?? '',
        userId: this.currentAuthUid,
        role: this.business?.role ?? null,
        signedIn: this.signedIn,
        customerId: this.statementCustomerId,
      },
    );

    this.customerStatement = null;
    this.statementOffset = offset;
    this.statementLoading = true;
    this.statementError = '';
    try {
      const result = await this.api.customerStatement(
        businessId, requestedCustomerId, offset,
        this.statementFromDate || undefined,
        this.statementToDate || undefined,
      );
      if (!isCurrentRequest()) return;
      this.customerStatement = result;
    } catch (error) {
      if (!isCurrentRequest()) return;
      this.statementError = this.message(error);
    } finally {
      if (this.statementLoadGuard.isLatest(requestVersion)) this.statementLoading = false;
    }
  }

  async createCustomer(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.loading = true;
    this.error = '';
    this.customerMessage = '';
    this.customerMessageKind = 'success';
    try {
      await this.api.createCustomer(businessId, {
        name: this.customerName, email: this.customerEmail || undefined,
        phone: this.customerPhone || undefined
      });
      if (this.business?.id !== businessId) return;
      this.customerName = ''; this.customerEmail = ''; this.customerPhone = '';
      this.customerMessage = this.t('ui.m_vj0603');
      try {
        const customers = await this.api.customers(businessId);
        if (this.business?.id !== businessId) return;
        this.setCustomerPage(customers);
        if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      } catch {
        if (this.business?.id === businessId) {
          this.customerMessageKind = 'warning';
          this.customerMessage = this.t('ui.m_9r6c8a');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.loading = false;
    }
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const businessId = this.business?.id;
    if (!businessId || this.business?.role !== 'owner') return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.importPreview = null;
    this.importMessage = '';
    this.importMessageKind = 'success';
    this.importCsvText = '';
    this.importFileName = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      this.error = this.t('ui.m_1meqsrn');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error = this.t('ui.m_uiq9m8');
      input.value = '';
      return;
    }
    try {
      const csvText = await file.text();
      if (this.business?.id !== businessId) return;
      this.importCsvText = csvText;
      this.importFileName = file.name;
      this.error = '';
    } catch {
      if (this.business?.id === businessId) this.error = this.t('ui.m_fq4yp3');
      input.value = '';
    }
  }

  async previewProductImport(): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.importCsvText || this.importLoading) return;
    const businessId = this.business.id;
    const csvText = this.importCsvText;
    this.importLoading = true;
    this.importPreview = null;
    this.importMessage = '';
    this.importMessageKind = 'success';
    this.error = '';
    try {
      const preview = await this.api.previewProductCsv(businessId, csvText);
      if (this.business?.id === businessId) this.importPreview = preview;
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.importLoading = false;
    }
  }

  async confirmProductImport(): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.importCsvText || !this.importPreview?.valid || this.importLoading) return;
    const businessId = this.business.id;
    const csvText = this.importCsvText;
    this.importLoading = true;
    this.importMessage = '';
    this.importMessageKind = 'success';
    this.error = '';
    try {
      const result = await this.api.importProductCsv(businessId, csvText);
      if (this.business?.id !== businessId) return;
      this.importMessage = this.t('ui.m_r5bt5z', { row_count: result.row_count });
      this.importPreview = null;
      this.importCsvText = '';
      this.importFileName = '';
      try {
        const products = await this.api.products(businessId);
        if (this.business?.id !== businessId) return;
        this.setProductPage(products);
        if (this.products.length) this.invoiceProductId = this.products[0].id;
      } catch {
        if (this.business?.id === businessId) {
          this.importMessageKind = 'warning';
          this.importMessage = this.t('ui.m_1lap6fd');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.importLoading = false;
    }
  }

  async onCustomerImportFileSelected(event: Event): Promise<void> {
    const businessId = this.business?.id;
    if (!businessId || this.business?.role !== 'owner') return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.customerImportPreview = null;
    this.customerImportMessage = '';
    this.customerImportMessageKind = 'success';
    this.customerImportCsvText = '';
    this.customerImportFileName = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      this.error = this.t('ui.m_1meqsrn');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error = this.t('ui.m_uiq9m8');
      input.value = '';
      return;
    }
    try {
      const csvText = await file.text();
      if (this.business?.id !== businessId) return;
      this.customerImportCsvText = csvText;
      this.customerImportFileName = file.name;
      this.error = '';
    } catch {
      if (this.business?.id === businessId) this.error = this.t('ui.m_fq4yp3');
      input.value = '';
    }
  }

  async previewCustomerImport(): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.customerImportCsvText || this.customerImportLoading) return;
    const businessId = this.business.id;
    const csvText = this.customerImportCsvText;
    this.customerImportLoading = true;
    this.customerImportPreview = null;
    this.customerImportMessage = '';
    this.customerImportMessageKind = 'success';
    this.error = '';
    try {
      const preview = await this.api.previewCustomerCsv(businessId, csvText);
      if (this.business?.id === businessId) this.customerImportPreview = preview;
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.customerImportLoading = false;
    }
  }

  async confirmCustomerImport(): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.customerImportCsvText ||
        !this.customerImportPreview?.valid || this.customerImportLoading) return;
    const businessId = this.business.id;
    const csvText = this.customerImportCsvText;
    this.customerImportLoading = true;
    this.customerImportMessage = '';
    this.customerImportMessageKind = 'success';
    this.error = '';
    try {
      const result = await this.api.importCustomerCsv(businessId, csvText);
      if (this.business?.id !== businessId) return;
      this.customerImportMessage = this.t('ui.m_r5bt5z', { row_count: result.row_count });
      this.customerImportPreview = null;
      this.customerImportCsvText = '';
      this.customerImportFileName = '';
      try {
        const customers = await this.api.customers(businessId);
        if (this.business?.id !== businessId) return;
        this.setCustomerPage(customers);
        if (!this.invoiceCustomerId && this.customers.length) {
          this.invoiceCustomerId = this.customers[0].id;
        }
      } catch {
        if (this.business?.id === businessId) {
          this.customerImportMessageKind = 'warning';
          this.customerImportMessage = this.t('ui.m_l4fw90');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.customerImportLoading = false;
    }
  }

  importErrorLabel(code: string): string {
    const keys: Record<string, string> = {
      required: 'app.importError.required',
      too_long: 'app.importError.too_long',
      invalid_decimal: 'app.importError.invalid_decimal',
      invalid_boolean: 'app.importError.invalid_boolean',
      duplicate_in_file: 'app.importError.duplicate_in_file',
      already_exists: 'app.importError.already_exists',
    };
    return keys[code] ? this.t(keys[code]) : code;
  }

  async createProduct(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.loading = true;
    this.error = '';
    this.productMessage = '';
    this.productMessageKind = 'success';
    try {
      await this.api.createProduct(businessId, {
        name: this.productName, unit_price: Number(this.productPrice).toFixed(2), is_stock_tracked: this.stockTracked,
        opening_quantity: this.stockTracked && this.business.role === 'owner' ? this.productOpeningQuantity : '0'
      });
      if (this.business?.id !== businessId) return;
      this.productName = ''; this.productPrice = ''; this.stockTracked = false; this.productOpeningQuantity = '0';
      this.productMessage = this.t('ui.m_b4kbxp');
      try {
        const products = await this.api.products(businessId);
        if (this.business?.id !== businessId) return;
        this.setProductPage(products);
        if (this.products.length) this.invoiceProductId = this.products[0].id;
      } catch {
        if (this.business?.id === businessId) {
          this.productMessageKind = 'warning';
          this.productMessage = this.t('ui.m_h29v8u');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.loading = false;
    }
  }

  private deriveRate(amount: string | undefined, base: string | undefined): string {
    const cents = (raw: string | undefined): bigint | null => {
      const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw || '0').trim());
      if (!match || match[1].length > 12) return null;
      return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
    };
    const value = cents(amount);
    const denominator = cents(base);
    if (value === null || denominator === null || denominator <= 0n || value <= 0n) return '0';
    const scale = 1_000_000_000_000n;
    const scaledRate = (value * 100n * scale + denominator / 2n) / denominator;
    const cappedRate = scaledRate > 100n * scale ? 100n * scale : scaledRate;
    return `${cappedRate / scale}.${String(cappedRate % scale).padStart(12, '0')}`;
  }

  startNewInvoiceDraft(): void {
    if (this.invoiceDraftSaving || this.invoiceDraftUncertain) return;
    this.editingInvoiceId = null;
    this.invoiceDraftInitialLines = null;
    this.invoiceDraftNotes = '';
    this.invoiceDraftSummary = null;
    this.invoiceDraftRevision += 1;
    this.invoiceCreateOpen = true;
    this.invoiceNumber = '';
    this.invoiceCustomerId = '';
    this.invoiceDiscountRate = '0';
    this.invoiceTaxRate = '0';
    this.invoiceMessage = '';
    this.invoiceMessageKind = 'success';
  }

  async saveInvoiceDraft(payload: InvoiceDraftPayload): Promise<void> {
    if (!this.business || !this.signedIn || !this.currentAuthUid || this.invoiceDraftSaving || this.invoiceDraftUncertain) return;
    const discountRate = Number(this.invoiceDiscountRate);
    const taxRate = Number(this.invoiceTaxRate);
    if (!Number.isFinite(discountRate) || discountRate < 0 || discountRate > 100 ||
        !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      this.error = this.t('ui.m_1szpit2');
      return;
    }
    const businessId = this.business.id;
    const authUid = this.currentAuthUid;
    const requestVersion = this.invoiceSaveGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.invoiceSaveGuard, requestVersion, requestContext);
    const editingInvoiceId = this.editingInvoiceId;
    const outcomeSnapshot: InvoiceDraftOutcomeSnapshot = {
      businessId,
      invoiceNumber: payload.invoice_number,
      customerId: payload.customer_id,
      discountRate: String(discountRate),
      taxRate: String(taxRate),
      editingInvoiceId,
    };
    this.invoiceDraftOutcomeVault.save(authUid, outcomeSnapshot);
    this.pendingInvoiceDraftOutcome = outcomeSnapshot;
    this.invoiceDraftSaving = true;
    this.loading = true;
    this.error = '';
    this.invoiceMessage = '';
    this.invoiceDraftSummary = null;

    try {
      const request = { ...payload, discount_rate: String(discountRate), tax_rate: String(taxRate) };
      const saved = editingInvoiceId
        ? await this.api.updateDraftInvoice(businessId, editingInvoiceId, request)
        : await this.api.createInvoice(businessId, request);
      this.invoiceDraftOutcomeVault.delete(authUid, businessId);
      if (!isCurrent()) return;
      this.pendingInvoiceDraftOutcome = null;
      this.invoiceDraftUncertain = false;
      this.invoiceNumber = payload.invoice_number;
      this.invoiceCustomerId = payload.customer_id;
      this.invoiceDraftNotes = payload.notes ?? '';
      this.invoiceDraftSummary = {
        currency_code: saved.currency_code,
        subtotal: saved.subtotal ?? null,
        discount_total: saved.discount_total ?? null,
        tax_total: saved.tax_total ?? null,
        total: saved.total,
      };
      this.invoiceMessage = editingInvoiceId
        ? this.t('ui.m_1nk3bl8')
        : this.t('ui.m_fxutv5');
      this.invoiceMessageKind = 'success';
      this.invoiceCreateOpen = true;

      try {
        const [invoices, dashboard] = await Promise.all([
          this.api.invoices(businessId),
          this.api.dashboard(businessId),
        ]);
        if (!isCurrent()) return;
        this.setInvoicePage(invoices);
        this.dashboard = dashboard;
      } catch {
        if (isCurrent()) {
          this.invoiceMessageKind = 'warning';
          this.invoiceMessage = this.t('ui.m_nltda1');
        }
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.definitiveNoWrite) {
        this.invoiceDraftOutcomeVault.delete(authUid, businessId);
        if (!isCurrent()) return;
        this.pendingInvoiceDraftOutcome = null;
        this.invoiceDraftUncertain = false;
        this.error = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t('ui.m_1tgnhbq');
      } else {
        if (!isCurrent()) return;
        this.pendingInvoiceDraftOutcome = outcomeSnapshot;
        this.invoiceDraftUncertain = true;
        this.error = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t('ui.m_1l6qzdy');
      }
    } finally {
      if (isCurrent()) {
        this.invoiceDraftSaving = false;
        this.loading = false;
      }
    }
  }

  async refreshInvoiceDraftStatus(): Promise<void> {
    const business = this.business;
    const authUid = this.currentAuthUid;
    const pending = this.pendingInvoiceDraftOutcome ??
      (business && authUid ? this.invoiceDraftOutcomeVault.get(authUid, business.id) : null);
    if (!business || !authUid || !this.signedIn || !pending || this.loading) return;
    const businessId = business.id;
    const requestVersion = this.invoiceSaveGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.invoiceSaveGuard, requestVersion, requestContext);
    this.loading = true;
    this.error = '';
    try {
      const invoices = await this.api.invoices(businessId);
      if (!isCurrent()) return;
      this.setInvoicePage(invoices);
      const match = findInvoiceDraftRecoveryMatch(invoices, pending);
      if (!match) {
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t('ui.m_1kah5c4');
        return;
      }

      const detail = await this.api.invoiceDetail(businessId, match.id);
      if (!isCurrent()) return;
      this.editingInvoiceId = detail.id;
      this.invoiceNumber = detail.invoice_number;
      this.invoiceCustomerId = detail.customer_id || pending.customerId;
      this.invoiceDraftNotes = detail.notes ?? '';
      this.invoiceDiscountRate = pending.discountRate;
      this.invoiceTaxRate = pending.taxRate;
      this.invoiceDraftInitialLines = invoiceDraftLinesFromExisting(detail.lines);
      this.invoiceDraftSummary = {
        currency_code: detail.currency_code,
        subtotal: detail.subtotal ?? null,
        discount_total: detail.discount_total ?? null,
        tax_total: detail.tax_total ?? null,
        total: detail.total,
      };
      this.invoiceDraftRevision += 1;
      this.invoiceDraftUncertain = false;
      this.pendingInvoiceDraftOutcome = null;
      this.invoiceDraftOutcomeVault.delete(authUid, businessId);
      this.invoiceCreateOpen = true;
      this.invoiceMessageKind = 'warning';
      this.invoiceMessage = this.t('ui.m_18n49hx');
    } catch (error) {
      if (isCurrent()) {
        this.error = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t('ui.m_1y7z87x');
      }
    } finally {
      if (isCurrent()) this.loading = false;
    }
  }

  private escapePrintHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character] as string));
  }

  async printInvoice(invoice: Invoice): Promise<void> {
    const businessSnapshot = this.business;
    if (!businessSnapshot || !this.signedIn || !this.currentAuthUid || invoice.status !== 'issued') return;
    const businessId = businessSnapshot.id;
    const requestVersion = this.printRequestGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.printRequestGuard, requestVersion, requestContext);
    const businessName = businessSnapshot.name;
    const businessCurrency = businessSnapshot.currency_code;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.error = this.t('ui.m_1ki7klw');
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const detail = await this.api.invoiceDetail(businessId, invoice.id);
      if (!isCurrent()) {
        printWindow.close();
        return;
      }
      if (detail.status !== 'issued') {
        throw new Error(this.t('ui.m_mfugf1'));
      }
      const rows = detail.lines.map(line =>
        '<tr><td>' + this.escapePrintHtml(line.description) + '</td><td class="number">' +
        this.escapePrintHtml(line.quantity) + '</td><td class="number">' +
        this.escapePrintHtml(line.unit_price) + '</td><td class="number">' +
        this.escapePrintHtml(line.line_total) + '</td></tr>'
      ).join('');
      const customer = this.escapePrintHtml(this.customerNameForInvoice(detail.customer_id));
      const invoiceNumber = this.escapePrintHtml(detail.invoice_number);
      const currency = this.escapePrintHtml(detail.currency_code);
      const total = this.escapePrintHtml(detail.total);
      const direction = this.localization.direction;
      const labels = {
        title: this.escapePrintHtml(this.t('app.invoicePrint.title')),
        customer: this.escapePrintHtml(this.t('app.invoicePrint.customer')),
        item: this.escapePrintHtml(this.t('app.invoicePrint.item')),
        quantity: this.escapePrintHtml(this.t('app.invoicePrint.quantity')),
        price: this.escapePrintHtml(this.t('app.invoicePrint.price')),
        amount: this.escapePrintHtml(this.t('app.invoicePrint.amount')),
        total: this.escapePrintHtml(this.t('app.invoicePrint.total')),
        note: this.escapePrintHtml(this.t('app.invoicePrint.note')),
      };
      printWindow.onload = () => printWindow.print();
      printWindow.document.open();
      printWindow.document.write(
        '<!doctype html><html lang="' + this.language + '" dir="' + direction + '"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + labels.title + ' ' + invoiceNumber + '</title>' +
        '<style>*{box-sizing:border-box}body{font:14px/1.5 Arial,sans-serif;color:#111827;margin:0;padding:32px}' +
        'header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid #111827;padding-bottom:18px;margin-bottom:24px}' +
        'h1{font-size:25px;margin:0 0 6px}p{margin:4px 0}.muted{color:#6b7280;font-size:12px}' +
        'table{width:100%;border-collapse:collapse;margin-top:22px}th,td{padding:12px 8px;border-bottom:1px solid #d1d5db;text-align:start}' +
        'th{background:#f3f4f6;font-weight:700}.number{text-align:end;font-variant-numeric:tabular-nums}' +
        '.total{margin-top:24px;margin-inline-start:auto;max-width:340px;padding:16px;border:1px solid #d1d5db;border-radius:8px;font-size:18px;font-weight:700}' +
        '.actions{margin-top:24px;display:flex;gap:8px}button{padding:10px 16px;border:0;border-radius:6px;background:#111827;color:white;font-size:14px}' +
        '@page{size:auto;margin:12mm}@media print{body{padding:0}.actions{display:none}.total{break-inside:avoid}}</style></head><body>' +
        '<header><div><h1>' + labels.title + '</h1><p><strong>' + invoiceNumber + '</strong></p><p>' + labels.customer + ': ' + customer + '</p></div>' +
        '<div><strong>' + this.escapePrintHtml(businessName) + '</strong><p>' + this.escapePrintHtml(businessCurrency) + '</p></div></header>' +
        '<table><thead><tr><th>' + labels.item + '</th><th class="number">' + labels.quantity + '</th><th class="number">' + labels.price + '</th><th class="number">' + labels.amount + '</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table><div class="total">' + labels.total + ': ' + total + ' ' + currency + '</div>' +
        '<p class="muted" style="margin-top:24px">' + labels.note + '</p><div class="actions"><button onclick="window.print()">' +
        this.escapePrintHtml(this.t('app.invoicePrint.print')) + '</button></div></body></html>'
      );
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      printWindow.close();
      if (isCurrent()) this.error = this.message(error);
    } finally {
      if (isCurrent()) this.loading = false;
    }
  }

  async editInvoice(invoice: Invoice): Promise<void> {
    if (!this.business || !this.signedIn || !this.currentAuthUid || invoice.status !== 'draft' || this.invoiceDraftSaving) return;
    const businessId = this.business.id;
    const requestVersion = this.invoiceEditRequestGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.invoiceEditRequestGuard, requestVersion, requestContext);
    this.loading = true;
    this.invoiceDraftSaving = true;
    this.error = '';
    try {
      const detail = await this.api.invoiceDetail(businessId, invoice.id);
      if (!isCurrent()) return;
      if (!detail.lines.length) {
        throw new Error(this.t('ui.m_a38j3f'));
      }
      this.editingInvoiceId = invoice.id;
      this.invoiceNumber = detail.invoice_number;
      this.invoiceCustomerId = detail.customer_id || '';
      this.invoiceDraftNotes = detail.notes ?? '';
      this.invoiceDiscountRate = this.deriveRate(detail.discount_total, detail.subtotal);
      const taxableBase = Number(detail.subtotal || 0) - Number(detail.discount_total || 0);
      this.invoiceTaxRate = this.deriveRate(detail.tax_total, taxableBase.toFixed(2));
      this.invoiceMessage = '';
      this.invoiceMessageKind = 'success';
      this.invoiceDraftSummary = null;
      this.invoiceDraftInitialLines = invoiceDraftLinesFromExisting(detail.lines);
      this.invoiceDraftRevision += 1;
      this.invoiceCreateOpen = true;
      this.tab = 'invoices';
    } catch (error) {
      if (isCurrent()) this.error = this.message(error);
    } finally {
      if (isCurrent()) {
        this.loading = false;
        this.invoiceDraftSaving = false;
      }
    }
  }

  cancelInvoiceEdit(): void {
    if (this.invoiceDraftSaving || this.invoiceDraftUncertain) return;
    this.editingInvoiceId = null;
    this.invoiceDraftInitialLines = null;
    this.invoiceDraftNotes = '';
    this.invoiceDraftSummary = null;
    this.invoiceDraftRevision += 1;
    this.invoiceCreateOpen = false;
    this.invoiceMessage = '';
    this.invoiceMessageKind = 'success';
    this.invoiceNumber = '';
    this.invoiceCustomerId = '';
    this.invoiceDiscountRate = '0';
    this.invoiceTaxRate = '0';
  }

  async issueInvoice(invoice: Invoice): Promise<void> {
    if (!this.business || this.business.role !== 'owner' || !this.signedIn || !this.currentAuthUid || this.loading) return;
    const businessId = this.business.id;
    const requestVersion = this.invoiceMutationGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.invoiceMutationGuard, requestVersion, requestContext);
    this.loading = true;
    this.error = '';
    this.invoiceMessage = '';
    this.invoiceMessageKind = 'success';
    try {
      await this.api.issueInvoice(businessId, invoice.id);
      if (!isCurrent()) return;
      this.invoiceMessage = this.t('ui.m_18zpfhv');
      try {
        const [invoices, dashboard, products] = await Promise.all([
          this.api.invoices(businessId),
          this.api.dashboard(businessId),
          this.api.products(businessId),
        ]);
        if (!isCurrent()) return;
        this.setInvoicePage(invoices);
        this.dashboard = dashboard;
        this.setProductPage(products);
      } catch {
        if (isCurrent()) {
          this.invoiceMessageKind = 'warning';
          this.invoiceMessage = this.t('ui.m_7nu8k8');
        }
      }
    } catch (error) {
      if (isCurrent()) this.error = this.message(error);
    } finally {
      if (isCurrent()) this.loading = false;
    }
  }

  requestInvoiceVoid(invoice: Invoice, event: MouseEvent): void {
    if (!this.business || this.business.role !== 'owner' || !this.signedIn || !this.currentAuthUid || !['draft', 'issued'].includes(invoice.status)) return;
    this.pendingPurchaseReceipt = null;
    this.purchaseReceiptError = '';
    this.pendingInvoiceVoid = invoice;
    this.invoiceVoidError = '';
    this.confirmationReturnFocus = event.currentTarget as HTMLElement;
  }

  cancelInvoiceVoid(): void {
    this.pendingInvoiceVoid = null;
    this.invoiceVoidError = '';
    this.confirmationReturnFocus = null;
  }

  async confirmInvoiceVoid(): Promise<void> {
    const invoice = this.pendingInvoiceVoid;
    if (!invoice || !this.business || this.business.role !== 'owner' || !this.signedIn || !this.currentAuthUid || this.loading) return;
    const businessId = this.business.id;
    const requestVersion = this.invoiceMutationGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.invoiceMutationGuard, requestVersion, requestContext);
    this.loading = true;
    this.error = '';
    this.invoiceMessage = '';
    this.invoiceMessageKind = 'success';
    this.invoiceVoidError = '';
    try {
      await this.api.voidInvoice(businessId, invoice.id, this.t('app.audit.voidInvoiceReason'));
      if (!isCurrent()) return;
      this.pendingInvoiceVoid = null;
      this.confirmationReturnFocus = null;
      if (this.editingInvoiceId === invoice.id) this.cancelInvoiceEdit();
      this.invoiceMessage = this.t('ui.m_15f0lzn');
      try {
        const [invoices, dashboard, products] = await Promise.all([
          this.api.invoices(businessId),
          this.api.dashboard(businessId),
          this.api.products(businessId),
        ]);
        if (!isCurrent()) return;
        this.setInvoicePage(invoices);
        this.dashboard = dashboard;
        this.setProductPage(products);
      } catch {
        if (isCurrent()) {
          this.invoiceMessageKind = 'warning';
          this.invoiceMessage = this.t('ui.m_1ovfo1u');
        }
      }
    } catch (error) {
      if (isCurrent()) {
        this.invoiceVoidError = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t('ui.m_cbiq5f');
      }
    } finally {
      if (isCurrent()) this.loading = false;
    }
  }

  hasOutstandingBalance(invoice: Invoice): boolean {
    const amount = Number(invoice.outstanding_amount);
    return invoice.outstanding_amount !== undefined && Number.isFinite(amount) && amount > 0;
  }

  payInvoice(invoice: Invoice): void {
    if (this.paymentLoading || this.paymentRetryPending) {
      this.error = this.t('ui.m_1c87pqx');
      return;
    }
    if (!this.business || this.business.role !== 'owner' || invoice.status !== 'issued') return;
    if (!invoice.customer_id || invoice.outstanding_amount === undefined) {
      this.error = this.t('ui.m_b6y553');
      return;
    }
    const outstanding = Number(invoice.outstanding_amount);
    if (!Number.isFinite(outstanding) || outstanding <= 0) {
      this.error = this.t('ui.m_iaurud');
      return;
    }
    this.error = '';
    this.tab = 'payments';
    this.paymentCustomerId = invoice.customer_id;
    this.paymentInvoiceId = invoice.id;
    this.paymentAmount = outstanding.toFixed(2);
    this.paymentAllocationAmount = outstanding.toFixed(2);
    this.paymentMessage = this.t('ui.m_qxhoxi');
    this.paymentMessageKind = 'info';
  }

  async createExpense(): Promise<void> {
    if (!this.business || this.expenseSubmissionUncertain) return;
    const businessId = this.business.id;
    const category = this.expenseCategory.trim();
    const description = this.expenseDescription.trim();
    const amount = Number(this.expenseAmount);
    const occurredAt = new Date(this.expenseDate);
    if (!category || !description || !String(this.expenseAmount ?? '').trim() || !Number.isFinite(amount) || amount <= 0) {
      this.error = this.t('ui.m_i7atfd');
      return;
    }
    if (!this.expenseDate || !Number.isFinite(occurredAt.getTime())) {
      this.error = this.t('ui.m_10t3tvt');
      return;
    }
    const currencyCode = this.business.currency_code;
    this.loading = true;
    this.error = '';
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
      if (this.business?.id !== businessId) return;
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
        if (this.business?.id !== businessId) return;
        this.expenses = expenses;
        this.dashboard = dashboard;
      } catch {
        if (this.business?.id === businessId) {
          this.error = this.t('ui.m_14xth7t');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) {
        this.expenseSubmissionUncertain = true;
        this.error = this.t('ui.m_1womw08') + ' ' + this.message(error);
      }
    } finally {
      if (this.business?.id === businessId) this.loading = false;
    }
  }

  async checkExpenseSubmissionOutcome(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.loading = true;
    this.error = '';
    try {
      const [expenses, dashboard] = await Promise.all([
        this.api.expenses(businessId),
        this.api.dashboard(businessId)
      ]);
      if (this.business?.id !== businessId) return;
      this.expenses = expenses;
      this.dashboard = dashboard;
      this.expenseSubmissionUncertain = false;
      this.expenseMessage = this.t('ui.m_1arh565');
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.loading = false;
    }
  }

  exportPaymentsCsv(): void {
    if (!this.business || this.business.role !== 'owner' || !this.payments.length) return;
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

  async createPayment(): Promise<void> {
    const businessSnapshot = this.business;
    if (!businessSnapshot || businessSnapshot.role !== 'owner' || !this.signedIn || !this.currentAuthUid || this.paymentLoading) return;
    const businessId = businessSnapshot.id;
    const authUid = this.currentAuthUid;
    const requestVersion = this.paymentMutationGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.paymentMutationGuard, requestVersion, requestContext);

    let retrySnapshot = this.pendingPaymentRetrySnapshot ?? this.paymentRetryVault.get(authUid, businessId);
    if (retrySnapshot) {
      if (retrySnapshot.businessId !== businessId) {
        this.pendingPaymentRetrySnapshot = null;
        this.paymentRetryPending = false;
        this.paymentIdempotencyKey = '';
        return;
      }
      this.pendingPaymentRetrySnapshot = retrySnapshot;
      this.paymentRetryPending = true;
      this.paymentIdempotencyKey = retrySnapshot.payload.idempotency_key;
    } else {
      const amount = String(this.paymentAmount ?? '').trim();
      if (!amount || !this.paymentCustomerId) {
        this.error = this.t('ui.m_9n1g6u');
        return;
      }
      const allocation = String(this.paymentAllocationAmount ?? '').trim();
      if (this.paymentInvoiceId && !allocation) {
        this.error = this.t('ui.m_1oyq50a');
        return;
      }
      if (!this.paymentIdempotencyKey) {
        this.paymentIdempotencyKey = 'payment-' + businessId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      }
      retrySnapshot = createPaymentRetrySnapshot(businessId, {
        amount,
        currency_code: businessSnapshot.currency_code,
        idempotency_key: this.paymentIdempotencyKey,
        customer_id: this.paymentCustomerId,
        method: this.paymentMethod,
        reference: this.paymentReference.trim() || undefined,
        allocations: this.paymentInvoiceId ? [{ invoice_id: this.paymentInvoiceId, amount: allocation }] : [],
      });
      this.pendingPaymentRetrySnapshot = retrySnapshot;
      this.paymentRetryVault.save(authUid, retrySnapshot);
      this.paymentRetryPending = true;
    }

    const requestPayload = paymentRequestFromRetrySnapshot(retrySnapshot);
    this.paymentLoading = true;
    this.error = '';
    this.paymentMessage = '';
    this.paymentMessageKind = 'info';
    try {
      await this.api.createPayment(businessId, requestPayload);
      if (!isCurrent()) return;

      this.paymentRetryVault.delete(authUid, businessId);
      this.pendingPaymentRetrySnapshot = null;
      this.paymentRetryPending = false;
      this.paymentAmount = '';
      this.paymentCustomerId = '';
      this.paymentInvoiceId = '';
      this.paymentAllocationAmount = '';
      this.paymentReference = '';
      this.paymentIdempotencyKey = '';
      this.paymentMessage = this.t('ui.m_mw2rdb');
      this.paymentMessageKind = 'success';

      try {
        const [payments, dashboard, invoices] = await Promise.all([
          this.api.payments(businessId),
          this.api.dashboard(businessId),
          this.api.invoices(businessId),
        ]);
        if (!isCurrent()) return;
        this.setPaymentPage(payments);
        this.dashboard = dashboard;
        this.setInvoicePage(invoices);
      } catch {
        if (isCurrent()) {
          this.paymentMessage = this.t('ui.m_vbnvuw');
          this.paymentMessageKind = 'warning';
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof ApiRequestError && error.definitiveNoWrite) {
        this.paymentRetryVault.delete(authUid, businessId);
        this.pendingPaymentRetrySnapshot = null;
        this.paymentRetryPending = false;
        this.paymentIdempotencyKey = '';
        this.paymentMessage = this.message(error);
        this.paymentMessageKind = 'error';
      } else {
        this.pendingPaymentRetrySnapshot = retrySnapshot;
        this.paymentRetryPending = true;
        this.paymentMessage = this.t('ui.m_1pkbfrw');
        this.paymentMessageKind = 'warning';
      }
    } finally {
      if (isCurrent()) this.paymentLoading = false;
    }
  }

  useAssistantSuggestion(question: string): void {
    if (this.chatSending || !question.trim()) return;
    this.chatDraft = question;
    void this.sendChat();
  }

  handleChatKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!this.chatDraft.trim() || this.chatSending) return;
    void this.sendChat();
  }

  startNewChat(): void {
    if (this.chatSending) return;
    this.chatMessages = [];
    this.chatDraft = '';
    this.chatError = '';
    this.chatConfigurationMissing = false;
    this.chatCopyStatus = null;
  }

  async copyAssistantMessage(content: string, index: number): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(content);
        } catch {
          this.copyTextWithSelectionFallback(content);
        }
      } else {
        this.copyTextWithSelectionFallback(content);
      }
      this.chatCopyStatus = { index, success: true };
    } catch {
      this.chatCopyStatus = { index, success: false };
    }
  }

  private copyTextWithSelectionFallback(content: string): void {
    const temporaryInput = document.createElement('textarea');
    temporaryInput.value = content;
    temporaryInput.setAttribute('readonly', '');
    temporaryInput.setAttribute('aria-hidden', 'true');
    temporaryInput.style.position = 'fixed';
    temporaryInput.style.opacity = '0';
    temporaryInput.style.pointerEvents = 'none';
    temporaryInput.style.insetInlineStart = '-9999px';
    document.body.appendChild(temporaryInput);
    let copied = false;
    try {
      temporaryInput.select();
      temporaryInput.setSelectionRange(0, temporaryInput.value.length);
      copied = document.execCommand('copy');
    } finally {
      temporaryInput.remove();
    }
    if (!copied) throw new Error('Clipboard copy command failed');
  }

  private isChatLogNearBottom(): boolean {
    const log = this.chatLog?.nativeElement;
    if (!log) return true;
    return log.scrollHeight - log.scrollTop - log.clientHeight <= 120;
  }

  private scrollChatToLatest(force = false): void {
    requestAnimationFrame(() => {
      const log = this.chatLog?.nativeElement;
      if (!log || (!force && !this.isChatLogNearBottom())) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      log.scrollTo({ top: log.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  private captureTenantRequest(workspaceId: string): TenantRequestContext {
    return {
      workspaceId,
      userId: this.currentAuthUid,
      role: this.business?.role ?? null,
      signedIn: this.signedIn,
      authTransitionVersion: this.authTransitionVersion,
    };
  }

  private isCurrentTenantOperation(
    guard: WorkspaceLoadGuard,
    requestVersion: number,
    requested: TenantRequestContext,
  ): boolean {
    return isCurrentTenantRequest(guard, requestVersion, requested, {
      workspaceId: this.business?.id ?? '',
      userId: this.currentAuthUid,
      role: this.business?.role ?? null,
      signedIn: this.signedIn,
      authTransitionVersion: this.authTransitionVersion,
    });
  }

  private currentChatRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.business?.id ?? '',
      userId: this.currentAuthUid,
      role: this.business?.role ?? null,
      signedIn: this.signedIn,
    };
  }

  async sendChat(): Promise<void> {
    if (!this.business || !this.chatDraft.trim() || this.chatSending) return;
    const requestContext = this.currentChatRequestContext();
    // Fail closed if the request cannot be tied to an authenticated user and current role.
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.role || !requestContext.workspaceId) return;

    const question = this.chatDraft.trim();
    const history = this.chatMessages.slice(-8);
    const shouldFollowLatest = this.isChatLogNearBottom();
    this.chatMessages = [...this.chatMessages, { role: 'user', content: question }];
    this.chatDraft = '';
    this.chatSending = true;
    this.chatError = '';
    this.chatCopyStatus = null;
    this.error = '';
    this.scrollChatToLatest(shouldFollowLatest);

    await runTenantScopedRequest(
      this.chatRequestGuard,
      requestContext,
      () => this.currentChatRequestContext(),
      () => this.api.chat(requestContext.workspaceId, question, history),
      {
        onSuccess: (reply: ChatReply) => {
          const shouldFollowLatest = this.isChatLogNearBottom();
          this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources, mode: reply.mode }];
          this.scrollChatToLatest(shouldFollowLatest);
        },
        onError: error => {
          this.chatMessages = this.chatMessages.slice(0, -1);
          this.chatDraft = question;
          const rawMessage = error instanceof Error ? error.message : '';
          this.chatConfigurationMissing = /AI chat is not configured/i.test(rawMessage);
          this.chatError = this.message(error);
        },
        onFinally: () => {
          this.chatSending = false;
        },
        onStale: () => {
          // The latest request lost its identity/role context without a workspace clear.
          this.chatSending = false;
          this.chatMessages = [];
          this.chatDraft = '';
          this.chatError = '';
          this.chatConfigurationMissing = false;
          this.chatCopyStatus = null;
        },
      },
    );
  }

  private lastErrorKind: 'session-expired' | 'access-denied' | null = null;
  private lastErrorMessage: string | null = null;

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
}
