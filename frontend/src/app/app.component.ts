import { CommonModule } from '@angular/common';
import { LocalizationService } from './localization.service';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiRequestError, AuditEvent, Business, Customer, CustomerStatement, Dashboard, DataIntegrityReport, Expense, Invoice, InvoiceDetail, Payment, Product, NotificationRecord, OperationalHealth, PurchaseOrder, RecurringInvoiceSchedule, Supplier } from './api.service';
import { AuthService, type AuthUserSnapshot } from './auth.service';
import { createServiceWorkerUpdateHandler } from './service-worker-update';
import { WorkspaceLoadGuard, isCurrentTenantRequest, type TenantRequestContext, runTenantScopedRequest } from './workspace-load-guard';
import { APP_BUILD_INFO } from './build-info';
import { buildCsv } from './csv-export';
import { auditActionLabel as formatAuditActionLabel, auditTargetLabel as formatAuditTargetLabel } from './audit-labels';
import { filterCustomers, filterExpenses, filterInvoices, filterNotifications, filterPayments, filterProducts, filterPurchaseOrders, filterRecurringSchedules, firstRecordPage, mergeRecordPage } from './record-filters';
import { countInvoiceStatuses, paginateInvoiceRecords, sortInvoiceRecords, type InvoiceSortDirection, type InvoiceSortKey, type InvoiceStatusCounts } from './invoice-list';
import { PlatformAdminComponent } from './platform-admin.component';
import { EmployeePayrollComponent } from './employee-payroll.component';
import { ReleaseGuideComponent } from './release-guide.component';
import { CustomerWorkspaceComponent } from './customer-workspace.component';
import { ProductWorkspaceComponent } from './product-workspace.component';
import { InventoryMovementLedgerComponent, type InventoryMovementLoader } from './inventory-movement-ledger.component';
import { PurchasingWorkspaceComponent } from './purchasing-workspace.component';
import { CreditNoteIssuanceComponent } from './credit-note-issuance.component';
import { AuditEventsWorkspaceComponent } from './audit-events-workspace.component';
import { ReportsWorkspaceComponent } from './reports-workspace.component';
import { AssistantWorkspaceComponent } from './assistant-workspace.component';
import { OverviewWorkspaceComponent } from './overview-workspace.component';
import { ExpensesWorkspaceComponent } from './expenses-workspace.component';
import { SuppliersWorkspaceComponent } from './suppliers-workspace.component';
import { RecurringWorkspaceComponent } from './recurring-workspace.component';
import { IntegrityWorkspaceComponent } from './integrity-workspace.component';
import { TaxesWorkspaceComponent } from './taxes-workspace.component';
import { InvoiceDetailDrawerComponent } from './invoice-detail-drawer.component';
import { NotificationsWorkspaceComponent } from './notifications-workspace.component';
import { transportEnabledFromSettings, transportUnitNameFromSettings } from './transport-settings';
import { canAccessWorkspaceTab, isMobileMoreTab as isMobileMoreTabValue } from './module-access';
import { resolveWorkspacePath, workspacePathFor, workspaceUrlFor } from './core/navigation/workspace-route';
import { filterWorkspaceModules, selectHomeQuickAccessModules, WORKSPACE_MODULE_CATALOG, WORKSPACE_MODULE_GROUPS, type WorkspaceModuleCard, type WorkspaceModuleGroup } from './workspace-module-catalog';
import { AbaConfirmDialogComponent } from './shared/ui/aba-confirm-dialog.component';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaMetricCardComponent } from './shared/ui/aba-metric-card.component';
import { AbaQuickAccessCardComponent } from './shared/ui/aba-quick-access-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaRecordTableComponent, type AbaRecordTableActionEvent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaLoadingLogoComponent } from './shared/ui/aba-loading-logo.component';
import { AbaSkeletonComponent } from './shared/ui/aba-skeleton.component';
import { AbaDeferPlaceholderComponent } from './shared/ui/aba-defer-placeholder.component';
import { AbaSearchFieldComponent } from './shared/ui/aba-search-field.component';
import { AbaFilterBarComponent } from './shared/ui/aba-filter-bar.component';
import { AbaDateRangeComponent } from './shared/ui/aba-date-range.component';
import { AbaIconComponent } from './shared/ui/aba-icon.component';
import { AbaLoadingStateService } from './loading-state.service';
import { AbaMobileAppHeaderComponent } from './shared/ui/aba-mobile-app-header.component';
import { InvoiceDraftEditorComponent } from './invoice-draft-editor.component';
import { WorkspaceInvitationsComponent } from './workspace-invitations.component';
import { findInvoiceDraftRecoveryMatch, invoiceDraftLinesFromExisting } from './invoice-draft';
import type { InvoiceDraftDriver, InvoiceDraftLine, InvoiceDraftPayload, InvoiceDraftServerSummary, InvoiceDraftOutcomeSnapshot } from './invoice-draft';
import { InvoiceDraftOutcomeVault } from './invoice-draft';
import { createPaymentRetrySnapshot, paymentRequestFromRetrySnapshot, PaymentRetryVault } from './payment-retry-snapshot';
import type { PaymentRetrySnapshot } from './payment-retry-snapshot';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'expenses' | 'employees' | 'assistant' | 'reports' | 'taxes' | 'audit' | 'integrity' | 'release-guide' | 'platform-admin' | 'suppliers' | 'purchases' | 'recurring' | 'notifications' | 'health' | 'team';
type OperationsMessageTab = 'notifications' | 'purchases' | 'recurring';

const WORKSPACE_RECORD_PAGE_SIZE = 100;

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PlatformAdminComponent, EmployeePayrollComponent, ReleaseGuideComponent, CustomerWorkspaceComponent, ProductWorkspaceComponent, InventoryMovementLedgerComponent, PurchasingWorkspaceComponent, CreditNoteIssuanceComponent, AuditEventsWorkspaceComponent, ReportsWorkspaceComponent, AssistantWorkspaceComponent, OverviewWorkspaceComponent, ExpensesWorkspaceComponent, SuppliersWorkspaceComponent, RecurringWorkspaceComponent, IntegrityWorkspaceComponent, TaxesWorkspaceComponent, InvoiceDetailDrawerComponent, NotificationsWorkspaceComponent, InvoiceDraftEditorComponent, WorkspaceInvitationsComponent, AbaConfirmDialogComponent, AbaCardComponent, AbaMetricCardComponent, AbaQuickAccessCardComponent, AbaSectionHeaderComponent, AbaRecordTableComponent, AbaStateMessageComponent, AbaLoadingLogoComponent, AbaSkeletonComponent, AbaDateRangeComponent, AbaFilterBarComponent, AbaSearchFieldComponent, AbaIconComponent, AbaMobileAppHeaderComponent, AbaDeferPlaceholderComponent],
  template: `
    <div class="shell" [class.auth-shell]="!signedIn" [class.english]="language === 'en'" [class.keyboard-open]="keyboardOpen" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'" (keydown.escape)="closeMobileMoreOnEscape()">
      @if (initialized && signedIn && !startupFailed && !setupNeeded) {
        <a class="skip-link" href="#main-content">{{ t('ui.m_1561v1f') }}</a>
      }
      @if (loading && initialized) { <div class="global-loading" role="status" aria-live="polite"><aba-loading-logo [announce]="false" /><span class="loading-label">{{ t('ui.m_1rza5t5') }}</span></div> }
      @if (appUpdateAvailable && !appUpdateDismissed) {
        <aside class="app-update-notice" role="status" aria-live="polite">
          <span>{{ t('ui.m_4cplhg') }}</span>
          <button class="secondary" type="button" (click)="reloadAppAfterUpdate()">{{ t('ui.m_16hli7m') }}</button>
          <button class="secondary" type="button" (click)="dismissAppUpdate()">{{ t('ui.m_1gc2kb4') }}</button>
        </aside>
      }
      @if (!initialized) {
        <main class="splash-overlay" role="status" aria-live="polite">
          <div class="auth-card">
            <aba-loading-logo [announce]="false" />
            <h1>{{ t('common.app_title') }}</h1>
            <div class="splash-release-meta">
              <span class="version-pill splash-version" [attr.title]="t('ui.m_g3351m') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel + ' · Build time (Cairo): ' + buildTimeLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
              <p class="release-line splash-release-line">{{ releaseLineLabel }}</p>
            </div>
            <p class="muted">{{ t('ui.m_1uzdlys') }}</p>
          </div>
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
          <div class="auth-identity">
            <img class="auth-character" src="identity/loader-character.png" alt="" aria-hidden="true">
            <span class="auth-app-name">{{ t('common.app_title') }}</span>
          </div>
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
          @if (error) { <aba-state-message kind="error" [description]="error" /> }
          @if (!signingUp) {
            <button class="demo-login-button" type="button" (click)="submitDemoLogin()" [disabled]="loading">
              <span class="demo-login-icon" aria-hidden="true">✦</span>
              <span>{{ loading ? t('demo.login.loading') : t('demo.login.button') }}</span>
              <span class="demo-login-arrow" aria-hidden="true">←</span>
            </button>
            <p class="demo-login-note">{{ t('demo.login.note') }}</p>
          }
          <button class="text-button" type="button" (click)="toggleAuthMode()">{{ signingUp ? t('ui.m_1uh3cl9') : t('ui.m_1fdki9f') }}</button>
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
          <nav class="sidebar-nav-scroll" [attr.aria-label]="t('ui.m_criw1m')">
            <div class="desktop-sidebar-groups">
              @for (group of desktopNavigationGroups; track group.id) {
                <section class="desktop-nav-group" [attr.aria-labelledby]="'desktop-nav-' + group.id">
                  <h2 class="desktop-nav-group-label" [id]="'desktop-nav-' + group.id">{{ t(group.titleKey) }}</h2>
                  @for (module of group.modules; track module.tab) {
                    <button class="nav-item" type="button" [attr.aria-label]="t(module.titleKey)" [attr.title]="t(module.titleKey)"
                      [class.active]="tab === module.tab" [attr.aria-current]="tab === module.tab ? 'page' : null"
                      (click)="setTab(module.tab)">
                      <span class="nav-icon" aria-hidden="true">{{ module.icon }}</span><span>{{ t(module.titleKey) }}</span>
                    </button>
                  }
                </section>
              }
            </div>
            <div class="mobile-dock-items">
              @for (module of primaryNavigationModules; track module.tab) {
                <button class="nav-item" type="button" [attr.aria-label]="t(module.titleKey)" [attr.title]="t(module.titleKey)"
                  [class.active]="tab === module.tab" [attr.aria-current]="tab === module.tab ? 'page' : null"
                  (click)="setTab(module.tab)">
                  <span class="nav-icon" aria-hidden="true">{{ module.icon }}</span><span>{{ t(module.titleKey) }}</span>
                </button>
              }
              <button #mobileMoreTrigger class="nav-item mobile-more" type="button" [class.active]="mobileMoreOpen || isMobileMoreTab(tab)"
                [attr.aria-label]="t('ui.m_nxf6ap')" [attr.title]="t('ui.m_nxf6ap')" [attr.aria-expanded]="mobileMoreOpen"
                [attr.aria-controls]="mobileMoreOpen ? 'mobile-more-menu' : null" (click)="toggleMobileMore()">
                <span class="nav-icon" aria-hidden="true">•••</span><span>{{ t('ui.m_dh4eov') }}</span>
              </button>
            </div>
          </nav>
          <div class="sidebar-bottom"><span class="status-dot"></span> {{ t('ui.m_17dx7ed') }}<small>{{ t('ui.m_ab5ft9') }}</small><span class="release-line sidebar-release-line">{{ releaseLineLabel }}</span></div>
        
        </aside>
        @if (mobileMoreOpen) {
          <div class="mobile-more-overlay">
            <button class="mobile-more-backdrop" type="button" aria-label="Close menu" (click)="closeMobileMoreOnEscape()"></button>
            <nav #mobileMoreMenu id="mobile-more-menu" class="mobile-more-menu" [attr.aria-label]="t('ui.m_1c7twvy')">
              @for (group of mobileMoreGroups; track group.id) {
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
              <div class="mobile-more-actions">
                <button class="nav-item mobile-menu-action" type="button" (click)="toggleLanguage()"><span class="nav-icon" aria-hidden="true">文</span><span>{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</span></button>
                <button class="nav-item mobile-menu-action" type="button" (click)="logout()"><span class="nav-icon" aria-hidden="true">↪</span><span>{{ t('ui.m_r2b303') }}</span></button>
              </div>
              <p class="release-line mobile-more-release">{{ releaseLineLabel }}</p>
            </nav>
          </div>
        }

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
              <aba-defer-placeholder [description]="t('ui.m_icu2ib')" />
            } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
          } @else {
          <header class="topbar">
            <div class="topbar-identity"><span class="topbar-mark" aria-hidden="true"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><polygon points="68.75,4.73 76.52,23.48 95.27,31.25 87.50,50.00 95.27,68.75 76.52,76.52 68.75,95.27 50.00,87.50 31.25,95.27 23.48,76.52 4.73,68.75 12.50,50.00 4.73,31.25 23.48,23.48 31.25,4.73 50.00,12.50" fill="#FFFFFF"/><rect x="27.25" y="49.00" width="11.5" height="20" rx="3.68" fill="#093A44"/><rect x="44.25" y="35.00" width="11.5" height="34" rx="3.68" fill="#093A44"/><rect x="61.25" y="19.00" width="11.5" height="50" rx="3.68" fill="#F5A623"/><circle cx="67.00" cy="9.80" r="5.17" fill="#F5A623"/></svg></span><span class="topbar-app-name">{{ t('common.app_title') }}</span></div>
            <div class="topbar-heading"><p class="eyebrow">{{ t('ui.m_criw1m') }}</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area">@if (!isInstalled) { <button class="secondary install-button" type="button" (click)="installApp()">{{ t('ui.m_1ig5s72') }}</button> }<button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">{{ t('ui.m_r2b303') }}</button></div>
          </header>
          @if (error) { <aba-state-message kind="error" [description]="error" [actionLabel]="sessionExpired ? t('ui.m_14surv3') : accessDenied ? t('ui.m_atfuse') : t('ui.m_worzj7')" (action)="sessionExpired ? logout() : accessDenied ? setTab('overview') : retry()" /> }
          @if (loading) { <aba-state-message kind="loading" [description]="t('ui.m_1oo6dkn')" /> }

          @if (!business) {
            <section abaCard class="panel narrow">
              <p class="eyebrow">{{ t('ui.m_117ileb') }}</p><aba-section-header [title]="t('ui.m_sgf5dv')" [description]="t('ui.m_1bmd66c')" />
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
              @defer (when tab === 'overview') {
                <aba-overview-workspace [businessId]="business?.id || null" [dashboard]="dashboard" [loading]="loading" [error]="error" [role]="business?.role" [platformAdminAvailable]="platformAdminAvailable" [language]="language" (navigate)="setTab($event)" (newInvoiceDraft)="startNewInvoiceDraft()" (newCustomer)="customerCreateOpen = true" (newProduct)="productCreateOpen = true" (invitationsAccepted)="loadBusinesses()" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1xguwi5')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }

            @if (tab === 'notifications') {
              @defer (when tab === 'notifications') {
                <aba-notifications-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" [activeTab]="tab" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1xguwi5')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }


@if (tab === 'suppliers') {
              @defer (when tab === 'suppliers') {
                <aba-suppliers-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }

@if (tab === 'purchases') {
              @defer (when tab === 'purchases') {
                <aba-purchasing-workspace
                  [businessId]="business.id"
                  [userId]="workspaceUserId"
                  [role]="business.role === 'owner' ? 'owner' : 'staff'"
                  [currencyCode]="business.currency_code"
                  [language]="language" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
            }
            @if (tab === 'recurring') {
              @defer (when tab === 'recurring') {
                <aba-recurring-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" [customers]="customers" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }


@if (tab === 'health' && business?.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('ui.m_18z2l5z') " [description]=" t('ui.m_1ps0q5f') "><span class="count">{{ operationalHealth ? operationalHealthStatusLabel(operationalHealth.status) : t('ui.m_159bgv6') }}</span></aba-section-header>
                <button class="primary" type="button" (click)="loadOperationalHealth()" [disabled]="healthLoading">{{ healthLoading ? t('ui.m_1v22gnm') : t('ui.m_9aw201') }}</button>
                @if (healthError) { <aba-state-message kind="error" [description]="healthError" /> }
                @if (healthLoading && !operationalHealth) { <aba-skeleton variant="list-row" /><aba-skeleton variant="list-row" /> }
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
              @defer (when tab === 'reports') {
                <aba-reports-workspace [businessId]="business.id" [language]="language" (askAssistant)="askAssistantFromReports($event)" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }

            @if (tab === 'team' && business?.id) {
              @defer (when tab === 'team' && business?.id) {
                <aba-workspace-invitations mode="manage" [businessId]="business?.id || ''" [language]="language" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_icu2ib')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }
            @if (tab === 'customers' && business?.id) {
              <section abaCard class="panel">
                <div [hidden]="statementVisible">
                <aba-section-header [title]="t('ui.m_1lifkl9')" [description]="t('ui.m_15gmqko')" />
                <div class="record-tools-row">
                <button class="primary customers-tool" type="button" (click)="customerCreateRequest = customerCreateRequest + 1"><aba-icon name="add" />{{ t('customerWorkspace.newCustomer') }}</button>
                @if (business?.role === 'owner') { <button class="secondary customers-tool" type="button" (click)="exportCurrentList()"><aba-icon name="export" />{{ t('ui.m_nbsw3y') }}</button> }
                @if (business?.role === 'owner') { <details class="aba-record-secondary csv-disclosure"><summary><span><aba-icon name="import" />{{ t('ui.m_p4xhry') }}</span></summary><div class="aba-record-secondary__body"><section abaCard class="csv-import-panel" [attr.aria-label]="t('ui.m_1cobl8b')">
                  <aba-section-header [level]="3" [title]="t('ui.m_p4xhry')" [description]="t('ui.m_1239wd4')" />
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
                </div>
                @defer (when tab === 'customers' && business?.id) {
                  <aba-customer-workspace
                    [businessId]="business.id"
                    [userId]="workspaceUserId"
                    [role]="business.role === 'owner' ? 'owner' : 'staff'"
                    [locale]="language"
                    [refreshRequest]="customerRefreshRequest"
                    [createRequest]="customerCreateRequest"
                    (invoicesRequested)="createInvoiceForCustomer($event)"
                    (statementRequested)="openCustomerStatementById($event)"
                    (customerSaved)="onWorkspaceCustomerSaved($event)" />
                } @placeholder {
                  <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
                } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
                </div>
                @if (statementVisible) {
                  <!-- T18 Slice G (2026-11-21): statement card redrawn per the owner ruling
                       2026-11-21 15:07 EET ("the card at the bottom, its look and design is
                       not interactive and not good, redo the design and buttons"). The
                       filters are grouped (dates together, actions together) instead of
                       four stretched blocks, the pager groups its range text with its
                       buttons, and every action has an icon. All handlers, labels and
                       disabled states are unchanged; no action was added or removed. -->
                  <section abaCard class="panel statement-panel">
                    <aba-section-header [level]="3" [title]="t('ui.m_152dm1w') + ' · ' + (customerStatement?.customer?.name || statementCustomerName)" [description]="t('ui.m_ysb7zm')">
                      <button class="secondary statement-action" type="button" (click)="customerStatement=null; statementVisible=false; statementError=''"><aba-icon name="close" />{{ t('ui.m_1whnkun') }}</button>
                    </aba-section-header>
                    <div class="inline-form statement-filters">
                      <div class="statement-filters__dates">
                        <aba-date-range>
                        <label>{{ t('ui.m_6ousik') }}<input type="date" name="statementFromDate" [(ngModel)]="statementFromDate"></label>
                        <label>{{ t('ui.m_hltyrq') }}<input type="date" name="statementToDate" [(ngModel)]="statementToDate"></label>
                        </aba-date-range>
                      </div>
                      <div class="statement-filters__actions">
                        <button class="primary statement-action" type="button" (click)="applyCustomerStatementFilters()" [disabled]="statementLoading"><aba-icon name="check" />{{ t('ui.m_1vs0iyd') }}</button>
                        <button class="secondary statement-action" type="button" (click)="clearCustomerStatementFilters()" [disabled]="statementLoading || (!statementFromDate && !statementToDate)"><aba-icon name="clear" />{{ t('ui.m_1kg6ptq') }}</button>
                      </div>
                    </div>
                    @if (statementFromDate || statementToDate) { <p class="muted">{{ t('ui.m_gqq69s') }}</p> }
                    @if (statementLoading) { <aba-state-message kind="loading" [description]="t('ui.m_1jqptmt')" /> }
                    @if (statementError) { <aba-state-message kind="error" [description]="statementError" /> }
                    @if (customerStatement) {
                      <div class="metric-grid">@for (entry of statementBalanceEntries; track entry.currency) { <article class="metric"><span>{{ t('ui.m_lyblb3') }} · {{ entry.currency }}</span><strong>{{ entry.balance }} {{ entry.currency }}</strong></article> }</div>
                      <aba-record-table [ariaLabel]="t('ui.m_152dm1w')" [columns]="customerStatementTableColumns" [rows]="customerStatementTableRows" [emptyTitle]="t('ui.m_3op8q6')" [emptyDescription]="t('ui.m_18o73kt')" />
                      <div class="statement-pager"><span class="muted">{{ statementOffset + 1 }}–{{ statementOffset + customerStatement.items.length }} / {{ customerStatement.total }}</span><div class="statement-pager__actions"><button class="secondary statement-action" type="button" (click)="loadCustomerStatementPage(statementOffset > 50 ? statementOffset - 50 : 0)" [disabled]="statementLoading || statementOffset === 0"><aba-icon name="chevron-left" class="statement-pager__chevron" />{{ t('ui.m_14wy3hz') }}</button><button class="secondary statement-action" type="button" (click)="loadCustomerStatementPage(statementOffset + 50)" [disabled]="statementLoading || statementOffset + customerStatement.items.length >= customerStatement.total">{{ t('ui.m_thb9eg') }}<aba-icon name="chevron-right" class="statement-pager__chevron" /></button></div></div>
                      @for (limitation of customerStatement.limitations; track limitation) { <p class="muted">• {{ limitation }}</p> }
                    }
                  </section>
                }
              </section>
            }

            @if (tab === 'products' && business?.id) {
              <section abaCard class="panel">
                <aba-section-header [title]="t('ui.m_137u0ee')" [description]="t('ui.m_snu8sb')" />
                <div class="record-tools-row">
                <details class="aba-record-create" [open]="productCreateOpen" (toggle)="productCreateOpen = $any($event.target).open">
                  <summary><span class="products-tool"><aba-icon name="add" />{{ t('ui.m_1nbakc8') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #productForm="ngForm" class="inline-form" (ngSubmit)="productForm.valid && createProduct()">
                  <label>{{ t('ui.m_h0c2cm') }}<input #productNameModel="ngModel" [attr.aria-label]="t('ui.m_h0c2cm')" name="productName" [placeholder]="t('ui.m_h0c2cm')" required [(ngModel)]="productName" [attr.aria-invalid]="productNameModel.invalid && (productNameModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productNameModel.invalid && (productNameModel.touched || productForm.submitted) ? 'product-name-error' : null">
                    @if (productNameModel.invalid && (productNameModel.touched || productForm.submitted)) {
                      <small id="product-name-error" class="field-error" aria-live="polite">{{ t('ui.m_1ymmcl') }}</small>
                    }
                  </label>
                  <label>{{ t('productEditor.sku') }}<input name="productSku" maxlength="80" autocomplete="off" [placeholder]="t('productEditor.skuPlaceholder')" [(ngModel)]="productSku"></label>
                  <label>{{ t('productEditor.descriptionLabel') }}<textarea name="productDescription" rows="2" maxlength="1000" [placeholder]="t('productEditor.descriptionPlaceholder')" [(ngModel)]="productDescription"></textarea></label>
                  <label>{{ t('productEditor.unit') }}<input name="productUnit" maxlength="32" required [placeholder]="t('productEditor.unitPlaceholder')" [(ngModel)]="productUnit"></label>
                  <label>{{ t('ui.m_1iz2xk3') }}<input #productPriceModel="ngModel" [attr.aria-label]="t('ui.m_1iz2xk3')" name="productPrice" type="text" inputmode="decimal" pattern="^[0-9٠-٩۰-۹]+([.٫][0-9٠-٩۰-۹]{1,2})?$" autocomplete="off" [placeholder]="t('ui.m_1iz2xk3')" required [(ngModel)]="productPrice" [attr.aria-invalid]="productPriceModel.invalid && (productPriceModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productPriceModel.invalid && (productPriceModel.touched || productForm.submitted) ? 'product-price-error' : null">
                    @if (productPriceModel.invalid && (productPriceModel.touched || productForm.submitted)) {
                      <small id="product-price-error" class="field-error" aria-live="polite">{{ productPriceModel.errors?.['required'] ? t('ui.m_9pqcpe') : t('ui.m_1hiyjor') }}</small>
                    }
                  </label>
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> {{ t('ui.m_13pn7xu') }}</label>
                  @if (stockTracked) {
                    @if (business?.role === 'owner') {
                      <label>{{ t('ui.m_dsef9m') }}<input #productOpeningQuantityModel="ngModel" name="productOpeningQuantity" type="text" inputmode="decimal" pattern="^[0-9٠-٩۰-۹]{1,11}([.٫][0-9٠-٩۰-۹]{1,3})?$" autocomplete="off" [(ngModel)]="productOpeningQuantity" required [attr.aria-invalid]="productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted) ? 'product-opening-quantity-error' : null">@if (productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted)) { <small id="product-opening-quantity-error" class="field-error" aria-live="polite">{{ productOpeningQuantityModel.errors?.['required'] ? t('ui.m_1tupg8c') : t('ui.m_1rtcb8u') }}</small> }</label>
                    } @else {
                      <small class="muted">{{ t('ui.m_1xw7d7y') }}</small>
                    }
                  }
                  <button class="primary" type="submit" [disabled]="loading">{{ t('ui.m_eex0xa') }}</button>
                </form>

                  </div>
                </details>
                @if (business?.role === 'owner') { <button class="secondary products-tool" type="button" (click)="exportCurrentList()"><aba-icon name="export" />{{ t('ui.m_nbsw3y') }}</button> }
                @if (productMessage) { <aba-state-message [kind]="productMessageKind" [description]="productMessage" /> }
                @if (business?.role === 'owner') { <details class="aba-record-secondary csv-disclosure"><summary><span><aba-icon name="import" />{{ t('ui.m_1wgx28b') }}</span></summary><div class="aba-record-secondary__body"><section abaCard class="csv-import-panel" [attr.aria-label]="t('ui.m_ps78ce')">
                  <aba-section-header [level]="3" [title]="t('ui.m_1wgx28b')" [description]="t('ui.m_1kaqi1p')" />
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
                </div>
                @defer (when tab === 'products' && business?.id) {
                  <aba-product-workspace
                    [businessId]="business.id"
                    [userId]="workspaceUserId"
                    [role]="business.role === 'owner' ? 'owner' : 'staff'"
                    [locale]="language"
                    [currencyCode]="business?.currency_code || ''"
                    [refreshRequest]="productRefreshRequest" />
                } @placeholder {
                  <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
                } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
                @defer (when tab === 'products' && business?.id) {
                  <aba-inventory-movement-ledger
                    [businessId]="business.id"
                    [userId]="workspaceUserId"
                    [role]="business.role === 'owner' ? 'owner' : 'staff'"
                    [products]="products"
                    [language]="language"
                    [loadPage]="loadInventoryMovementPage" />
                } @placeholder {
                  <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
                } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
              </section>
            }

            @if (tab === 'invoices') {
              <section abaCard class="panel">
                <div id="invoices-section-heading" class="invoice-list-meta" tabindex="-1" aria-labelledby="invoices-section-title"><h2 id="invoices-section-title" class="sr-only">{{ t('ui.m_5lvhyt') }}</h2><span class="count">{{ filteredInvoices.length }} / {{ invoices.length }} {{ t('ui.m_pe8fvb') }}</span></div>
                <div class="invoice-toolbar">
                  @if (invoiceCreateOpen) {
                    <section class="invoice-create-panel" [attr.aria-label]="t('ui.m_h8xosr')">
                      @defer (when tab === 'invoices' && invoiceCreateOpen) {
                        <aba-invoice-draft-editor
                          [language]="language" [products]="products" [customers]="customers"
                          [transportEnabled]="transportEnabled"
                          [drivers]="invoiceDrivers" [transportUnitName]="transportUnitName"
                          [initialDriverId]="invoiceDraftDriverId" [initialTransportTrips]="invoiceDraftTransportTrips"
                          [initialTransportFrom]="invoiceDraftTransportFrom" [initialTransportTo]="invoiceDraftTransportTo"
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
                      } @placeholder {
                        <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
                      } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
                    </section>
                  } @else {
                    <button type="button" class="primary invoice-create-button" (click)="startNewInvoiceDraft()">
                      {{ t('ui.m_12vszs4') }}
                    </button>
                  }
                </div>
                @if (invoiceMessage) { <aba-state-message [kind]="invoiceMessageKind" [description]="invoiceMessage" /> }
                <div class="invoice-summary-cards" [attr.aria-label]="t('app.invoiceList.summaryLabel')">
                  <article class="invoice-summary-card"><span>{{ t('app.invoiceList.summaryAll') }}</span><strong>{{ invoiceStatusCounts.all }}</strong></article>
                  <article class="invoice-summary-card"><span>{{ t('app.invoiceList.summaryDraft') }}</span><strong>{{ invoiceStatusCounts.draft }}</strong></article>
                  <article class="invoice-summary-card"><span>{{ t('app.invoiceList.summaryIssued') }}</span><strong>{{ invoiceStatusCounts.issued }}</strong></article>
                </div>
                <div class="invoice-controls">
                  <aba-filter-bar variant="chips" [foldExtras]="true" [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="invoiceFilterSummary()" [hasActiveFilter]="invoiceSearch.trim() !== '' || invoiceStatusFilter !== 'all' || invoiceFilterCustomerId !== ''" (clear)="clearInvoiceFilters()">
                  <aba-search-field class="invoice-search" name="invoiceSearch" [ariaLabel]="t('ui.m_qwjq9v')" [placeholder]="t('ui.m_2onysz')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="invoiceSearch" (ngModelChange)="invoicePageIndex = 0" />
                  <div class="invoice-filter-panel" filterExtras>
                    <div class="invoice-status-chips" role="group" [attr.aria-label]="t('app.invoiceList.statusFilters')">
                    <button type="button" class="invoice-status-chip" [class.active]="invoiceStatusFilter === 'all'" [attr.aria-pressed]="invoiceStatusFilter === 'all'" (click)="setInvoiceStatusFilter('all')">{{ t('ui.m_1cyu9lp') }} <span>{{ invoiceStatusCounts.all }}</span></button>
                    <button type="button" class="invoice-status-chip" [class.active]="invoiceStatusFilter === 'draft'" [attr.aria-pressed]="invoiceStatusFilter === 'draft'" (click)="setInvoiceStatusFilter('draft')">{{ t('ui.m_1vbs2bw') }} <span>{{ invoiceStatusCounts.draft }}</span></button>
                    <button type="button" class="invoice-status-chip" [class.active]="invoiceStatusFilter === 'issued'" [attr.aria-pressed]="invoiceStatusFilter === 'issued'" (click)="setInvoiceStatusFilter('issued')">{{ t('ui.m_7bugfd') }} <span>{{ invoiceStatusCounts.issued }}</span></button>
                    <button type="button" class="invoice-status-chip" [class.active]="invoiceStatusFilter === 'void'" [attr.aria-pressed]="invoiceStatusFilter === 'void'" (click)="setInvoiceStatusFilter('void')">{{ t('ui.m_1a2uk7t') }} <span>{{ invoiceStatusCounts.void }}</span></button>
                    </div>
                    <label class="invoice-filter"><span>{{ t('ui.m_ubgrc2') }}</span>
                      <select name="invoiceFilterCustomer" [attr.aria-label]="t('ui.m_1k3k63e')" [(ngModel)]="invoiceFilterCustomerId" (ngModelChange)="invoicePageIndex = 0">
                        <option value="">{{ t('ui.m_1c6r7y7') }}</option>
                        @for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }
                      </select>
                    </label>
                  </div>
                  </aba-filter-bar>
                  <div class="invoice-list-actions">
                  @if (customersHasMore) {
                    <button class="secondary invoice-load-more-customers" type="button" (click)="loadMoreInvoiceCustomers()" [disabled]="customersLoadingMore">
                      {{ customersLoadingMore ? t('ui.m_14qa8nk') : t('ui.m_8ighyf') }}
                    </button>
                  }
                  @if (business?.role === 'owner') { <button class="secondary invoice-export" type="button" (click)="exportCurrentList()" [disabled]="!filteredInvoices.length"><aba-icon name="export" />{{ t('ui.m_nbsw3y') }}</button> }
                  <button class="secondary invoice-density-toggle" type="button" [attr.aria-pressed]="invoiceDensity === 'compact'" (click)="toggleInvoiceDensity()">{{ invoiceDensity === 'compact' ? t('app.invoiceList.cards') : t('app.invoiceList.compact') }}</button>
                  </div>
                </div>
                @if (loading && !invoices.length) {
                  <div class="defer-skeleton" role="status"><span class="sr-only">{{ t('ui.m_x2q4oa') }}</span><aba-skeleton variant="list-row" /><aba-skeleton variant="list-row" /><aba-skeleton variant="list-row" /><aba-skeleton variant="list-row" /></div>
                } @else if (error && !invoices.length) {
                  <aba-state-message kind="error" [description]="error" />
                } @else if (!filteredInvoices.length) {
                  <aba-state-message kind="empty" [description]="(invoiceSearch || invoiceStatusFilter !== 'all' || invoiceFilterCustomerId) ? t('ui.m_1rrfha5') : t('ui.m_1ehm2eq')" />
                } @else {
                  @if (invoiceDensity === 'compact') {
                    <div class="invoice-table-wrap" role="region" tabindex="0" [attr.aria-label]="t('app.invoiceList.table')">
                      <table class="invoice-table" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
                        <thead><tr>
                          <th scope="col" [attr.aria-sort]="invoiceSortAria('invoice_number')"><button type="button" class="invoice-sort-button" (click)="toggleInvoiceSort('invoice_number')">{{ t('app.invoiceList.invoiceNumber') }} <span aria-hidden="true">{{ invoiceSortIndicator('invoice_number') }}</span></button></th>
                          <th scope="col" [attr.aria-sort]="invoiceSortAria('customer')"><button type="button" class="invoice-sort-button" (click)="toggleInvoiceSort('customer')">{{ t('app.invoiceList.customer') }} <span aria-hidden="true">{{ invoiceSortIndicator('customer') }}</span></button></th>
                          <th scope="col" [attr.aria-sort]="invoiceSortAria('issue_date')"><button type="button" class="invoice-sort-button" (click)="toggleInvoiceSort('issue_date')">{{ t('app.invoiceList.date') }} <span aria-hidden="true">{{ invoiceSortIndicator('issue_date') }}</span></button></th>
                          <th scope="col" [attr.aria-sort]="invoiceSortAria('status')"><button type="button" class="invoice-sort-button" (click)="toggleInvoiceSort('status')">{{ t('app.invoiceList.status') }} <span aria-hidden="true">{{ invoiceSortIndicator('status') }}</span></button></th>
                          <th scope="col" [attr.aria-sort]="invoiceSortAria('total')"><button type="button" class="invoice-sort-button" (click)="toggleInvoiceSort('total')">{{ t('app.invoiceList.total') }} <span aria-hidden="true">{{ invoiceSortIndicator('total') }}</span></button></th>
                          <th scope="col">{{ t('app.invoiceList.actions') }}</th>
                        </tr></thead>
                        <tbody>
                          @for (invoice of visibleInvoices; track invoice.id) {
                            <tr>
                              <td><bdi dir="ltr">{{ invoice.invoice_number }}</bdi></td>
                              <td>{{ customerNameForInvoice(invoice.customer_id) }}</td>
                              <td><bdi dir="ltr">{{ invoice.issue_date ? formatRecordDate(invoice.issue_date, 'date') : (invoice.created_at ? formatRecordDate(invoice.created_at, 'date') : '—') }}</bdi></td>
                              <td><span class="invoice-status-badge" [class.status-draft]="invoiceCardStatusTone(invoice) === 'draft'" [class.status-issued]="invoiceCardStatusTone(invoice) === 'issued'" [class.status-void]="invoiceCardStatusTone(invoice) === 'void'" [class.status-paid]="invoiceCardStatusTone(invoice) === 'paid'" [class.status-partial]="invoiceCardStatusTone(invoice) === 'partial'" [class.status-unpaid]="invoiceCardStatusTone(invoice) === 'unpaid'">{{ invoiceCardStatusLabel(invoice) }}</span></td>
                              <td class="invoice-table-total"><bdi dir="ltr">{{ formatNumber(invoice.total) }} {{ invoice.currency_code }}</bdi></td>
                              <td class="invoice-table-actions"><div class="invoice-compact-actions">
                                <button class="secondary" type="button" (click)="openInvoiceDetails(invoice, $event)">{{ t('app.invoiceList.viewDetails') }}</button>
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
                              </div></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                  <div class="invoice-cards">
                    @for (invoice of visibleInvoices; track invoice.id) {
                      <article class="invoice-card">
                        <header class="invoice-card-header">
                          <div class="invoice-card-customer">
                            <span class="invoice-customer-avatar" aria-hidden="true">{{ customerInitialForInvoice(invoice.customer_id) }}</span>
                            <div class="invoice-card-customer-copy">
                              <strong>{{ customerNameForInvoice(invoice.customer_id) }}</strong>
                              <small class="invoice-card-meta">{{ invoice.invoice_number }} · {{ invoice.issue_date ? '' : (invoice.created_at ? t('ui.m_1ipvpcp') : '') }}<span class="invoice-card-meta-date">{{ invoice.issue_date ? formatRecordDate(invoice.issue_date, 'date') : (invoice.created_at ? formatRecordDate(invoice.created_at, 'date') : t('ui.m_8ghcxc')) }}</span> · <bdi dir="ltr">{{ invoice.currency_code }}</bdi></small>
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
                            <strong><bdi dir="ltr">{{ formatNumber(invoice.total) }} {{ invoice.currency_code }}</bdi></strong>
                          </div>
                          <div>
                            <small>{{ t('ui.m_twygqw') }}</small>
                            <strong>@if (invoice.allocated_payments !== undefined) {
                              <bdi dir="ltr">{{ formatNumber(invoice.allocated_payments) }} {{ invoice.currency_code }}</bdi>
                            } @else { — }</strong>
                          </div>
                          <div>
                            <small>{{ t('ui.m_1e1esfj') }}</small>
                            <strong>@if (invoice.status === 'issued' && invoice.outstanding_amount !== undefined) {
                              <bdi dir="ltr">{{ formatNumber(invoice.outstanding_amount) }} {{ invoice.currency_code }}</bdi>
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
                          <button class="secondary" type="button" (click)="openInvoiceDetails(invoice, $event)">{{ t('app.invoiceList.viewDetails') }}</button>
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
                }
                @if (filteredInvoices.length > invoicePageSize) {
                  <nav class="invoice-pagination" [attr.aria-label]="t('app.invoiceList.pagination')">
                    <span>{{ t('app.invoiceList.showing') }} {{ invoicePageStart }}–{{ invoicePageEnd }} {{ t('app.invoiceList.of') }} {{ filteredInvoices.length }}</span>
                    <div class="invoice-pagination-controls">
                      <button class="secondary" type="button" (click)="changeInvoicePage(-1)" [disabled]="invoicePageIndex === 0">{{ t('app.invoiceList.previous') }}</button>
                      <span aria-live="polite">{{ t('app.invoiceList.page') }} {{ invoicePageIndex + 1 }} {{ t('app.invoiceList.of') }} {{ invoicePageCount }}</span>
                      <button class="secondary" type="button" (click)="changeInvoicePage(1)" [disabled]="invoicePageIndex + 1 >= invoicePageCount">{{ t('app.invoiceList.next') }}</button>
                    </div>
                  </nav>
                }
                @if (invoicesHasMore) { <button class="secondary" type="button" (click)="loadMoreInvoices()" [disabled]="invoicesLoadingMore">{{ invoicesLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_14d2jh7') }}</button> }
                <p class="footnote">{{ t('ui.m_lpprue') }}</p>
              </section>
              @if (selectedInvoiceForDetails) {
                <aba-invoice-detail-drawer
                  [invoice]="selectedInvoiceForDetails"
                  [detail]="selectedInvoiceDetail"
                  [loading]="invoiceDetailLoading"
                  [error]="invoiceDetailError"
                  [language]="language"
                  [role]="business?.role"
                  [customerName]="selectedInvoiceDetail ? customerNameForInvoice(selectedInvoiceDetail.customer_id) : ''"
                  [statusTone]="invoiceCardStatusTone(selectedInvoiceForDetails)"
                  [statusLabel]="invoiceCardStatusLabel(selectedInvoiceForDetails)"
                  [hasOutstanding]="hasOutstandingBalance(selectedInvoiceForDetails)"
                  [transportUnitName]="transportUnitName"
                  (close)="closeInvoiceDetails()"
                  (edit)="editInvoiceFromDetails()"
                  (issue)="issueInvoiceFromDetails()"
                  (pay)="payInvoiceFromDetails()"
                  (print)="printInvoiceFromDetails()"
                  (duplicate)="duplicateInvoiceFromDetails()"
                  (voidRequest)="voidInvoiceFromDetails($event)" />
              }
            }

            @if (tab === 'payments' && business?.role !== 'owner') {
              <section abaCard class="panel"><aba-state-message kind="error" [description]="t('ui.m_1ju8ouz')" /></section>
            }
            @if (tab === 'payments' && business.role === 'owner') {
              <section abaCard class="panel"><aba-section-header [title]="t('ui.m_3k0fux')" [description]="t('ui.m_cj3m99')">
                  <div class="section-actions"><span class="count">{{ filteredPayments.length }} / {{ payments.length }} {{ t('ui.m_1ouah2m') }}</span><button class="secondary" type="button" (click)="exportPaymentsCsv()" [disabled]="!payments.length"><aba-icon name="export" />{{ t('ui.m_nbsw3y') }}</button><button class="secondary" type="button" (click)="showPaymentForm = !showPaymentForm" [disabled]="paymentRetryPending">{{ showPaymentForm ? t('ui.m_pw64as') : t('ui.m_3k0fux') }}</button></div>
                </aba-section-header>
                @if (showPaymentForm || paymentRetryPending) {
                <form #paymentForm="ngForm" class="inline-form payment-form" (ngSubmit)="(paymentRetryPending || paymentForm.valid) && createPayment()">
                  <select #paymentCustomerModel="ngModel" [attr.aria-label]="t('ui.m_edaho8')" name="paymentCustomer" required [(ngModel)]="paymentCustomerId" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'payment-customer-error' : null"><option value="" disabled>{{ t('ui.m_p0vza7') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select>@if (paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted)) { <small id="payment-customer-error" class="field-error" aria-live="polite">{{ t('ui.m_5b5dll') }}</small> }
                  <input #paymentAmountModel="ngModel" [attr.aria-label]="t('ui.m_q9mxbb')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_1smcjxm')" required [(ngModel)]="paymentAmount" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'payment-amount-error' : null">@if (paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted)) { <small id="payment-amount-error" class="field-error" aria-live="polite">{{ t('ui.m_me0lkl') }}</small> }
                  <select [attr.aria-label]="t('ui.m_h7ngs9')" name="paymentMethod" [(ngModel)]="paymentMethod" [disabled]="paymentRetryPending"><option value="cash">{{ t('ui.m_1xk4i7j') }}</option><option value="bank_transfer">{{ t('ui.m_bof380') }}</option><option value="card">{{ t('ui.m_tq9n36') }}</option><option value="wallet">{{ t('ui.m_1bho9og') }}</option><option value="other">{{ t('ui.m_47rh1w') }}</option></select>
                  <select [attr.aria-label]="t('ui.m_vkei9c')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId" [disabled]="paymentRetryPending" (ngModelChange)="syncPaymentCustomer()"><option value="">{{ t('ui.m_1xrgrqj') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (invoicesHasMore) { <button type="button" class="secondary" (click)="loadMoreInvoices()" [disabled]="invoicesLoadingMore || paymentRetryPending">{{ invoicesLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_14d2jh7') }}</button> }
                  @if (paymentInvoiceId) { <input [attr.aria-label]="t('ui.m_lc0rf5')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('ui.m_1okokqi')" [(ngModel)]="paymentAllocationAmount" [disabled]="paymentRetryPending"> }
                  <input [attr.aria-label]="t('ui.m_15jj1na')" name="paymentReference" maxlength="128" [placeholder]="t('ui.m_v160u1')" [(ngModel)]="paymentReference" [disabled]="paymentRetryPending">
                  <button class="primary" type="submit" [disabled]="paymentLoading">{{ paymentLoading ? t('ui.m_1ty0fxd') : paymentRetryPending ? t('ui.m_1pvlpdc') : t('ui.m_3k0fux') }}</button>
                </form>
                }
                @if (paymentRetryPending) { <p class="footnote" role="status">{{ t('ui.m_1yhgb5f') }}</p> }
                @if (paymentMessage) { <aba-state-message [kind]="paymentMessageKind" [description]="paymentMessage" /> }
                <p class="footnote">{{ t('ui.m_1c93fyv') }} {{ business.currency_code }} {{ t('ui.m_1sweklr') }}</p>
                <div class="list-tools operations-search aba-record-toolbar"><aba-filter-bar [filterLabel]="t('ui.m_11q6v6c')" [clearLabel]="t('ui.m_1np7zc4')" [filterSummary]="paymentSearch" [hasActiveFilter]="paymentSearch.trim() !== ''" (clear)="paymentSearch = ''"><aba-search-field name="paymentSearch" [ariaLabel]="t('ui.m_nmj0be')" [placeholder]="t('ui.m_hoei9y')" [placeholderNarrow]="t('ui.m_11ucx5t')" [clearLabel]="t('ui.m_4k8q2zr')" [(ngModel)]="paymentSearch" /></aba-filter-bar></div>
                <aba-record-table [ariaLabel]="t('ui.m_mxsp4b')" [columns]="paymentTableColumns" [rows]="paymentTableRows" [loading]="paymentLoading && !payments.length" [loadingDescription]="t('ui.m_1kn1f7h')" [emptyTitle]="t('ui.m_1c2srea')" [emptyDescription]="paymentSearch.trim() ? t('ui.m_1igz78g') : t('ui.m_1nttjd')" />
                @if (paymentsHasMore) { <button class="secondary" type="button" (click)="loadMorePayments()" [disabled]="paymentsLoadingMore">{{ paymentsLoadingMore ? t('ui.m_1dwk1vm') : t('ui.m_1olqej1') }}</button> }
              </section>
            }

            @if (tab === 'taxes' && business.role === 'owner') {
              <aba-taxes-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" />
            }

            @if (tab === 'invoices' && business) {
              @defer (when tab === 'invoices' && business) {
                <aba-credit-note-issuance
                  [businessId]="business.id"
                  [role]="business.role === 'owner' ? 'owner' : 'staff'"
                  [language]="language" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
            }

            @if (tab === 'audit') {
              @defer (when tab === 'audit') {
                <aba-audit-events-workspace
                  [total]="auditTotal"
                  [offset]="auditOffset"
                  [events]="auditEvents"
                  [loading]="auditLoading"
                  [error]="auditError"
                  [action]="auditAction"
                  [targetType]="auditTargetType"
                  [columns]="auditTableColumns"
                  [rows]="auditTableRows"
                  (actionChange)="auditAction=$event"
                  (targetTypeChange)="auditTargetType=$event"
                  (loadPage)="loadAuditEvents($event)" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
            }

            @if (tab === 'release-guide') {
              @defer (when tab === 'release-guide') {
                <aba-release-guide [language]="language" [appVersion]="appVersion" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_111geup')" />
              } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
            }

            @if (tab === 'employees' && business.role === 'owner') {
              @defer (when tab === 'employees' && business.role === 'owner') {
                <aba-employee-payroll [businessId]="business.id" [currencyCode]="business.currency_code" [language]="language" (payrollPaid)="refreshAfterPayrollPayment()"></aba-employee-payroll>
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_9hwp1p')" />
              } @error {
                  <section abaCard class="panel narrow">
                    <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                  </section>
                }
            }

            @if (tab === 'expenses') {
              @defer (when tab === 'expenses') {
                <aba-expenses-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" [currencyCode]="business.currency_code" [loading]="loading" [refreshTick]="expensesRefreshTick" (dashboardChanged)="dashboard = $event" (errorNotice)="error = $event" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1xguwi5')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }

            @if (tab === 'integrity' && business.role === 'owner') {
              @defer (when tab === 'integrity') {
                <aba-integrity-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1oo6dkn')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }


            @if (tab === 'assistant') {
              @defer (when tab === 'assistant') {
                <aba-assistant-workspace [businessId]="business.id" [userId]="workspaceUserId" [role]="business.role" [signedIn]="signedIn" [language]="language" [pendingQuestion]="pendingAssistantQuestion" (questionConsumed)="pendingAssistantQuestion = ''" />
              } @placeholder {
                <aba-defer-placeholder [description]="t('ui.m_1xguwi5')" />
              } @error {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="error" [description]="t('ui.m_deferr1')" />
                </section>
              }
            }
          }
          <footer>{{ t('ui.m_1ajyrpz') }} <span>{{ t('ui.m_1f5dk3e') }}</span></footer>
          }
        </main>
      }
      @if (pendingInvoiceVoid) {
        @defer (when pendingInvoiceVoid) {
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
        } @error {
          <section abaCard class="panel narrow" role="alert">
            <aba-state-message kind="error" [description]="t('ui.m_deferr2')" />
            <button class="secondary" type="button" (click)="cancelInvoiceVoid()">{{ t('ui.m_mbs8k3') }}</button>
          </section>
        }
      }
      @if (pendingPurchaseApproval) {
        @defer (when pendingPurchaseApproval) {
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
        } @error {
          <section abaCard class="panel narrow" role="alert">
            <aba-state-message kind="error" [description]="t('ui.m_deferr2')" />
            <button class="secondary" type="button" (click)="cancelPurchaseOrderApproval()">{{ t('ui.m_1233hg7') }}</button>
          </section>
        }
      }
      @if (pendingPurchaseReceipt) {
        @defer (when pendingPurchaseReceipt) {
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
        } @error {
          <section abaCard class="panel narrow" role="alert">
            <aba-state-message kind="error" [description]="t('ui.m_deferr2')" />
            <button class="secondary" type="button" (click)="cancelPurchaseOrderReceipt()">{{ t('ui.m_1gc2kb4') }}</button>
          </section>
        }
      }

    </div>
  `,
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  customerRefreshRequest = 0;
  productRefreshRequest = 0;
  get workspaceUserId(): string { return this.currentAuthUid ?? ''; }
  readonly appVersion = APP_BUILD_INFO.version;
  readonly uiCommitLabel = APP_BUILD_INFO.commit;
  get buildTimeLabel(): string {
    if (!APP_BUILD_INFO.builtAt) return this.t('ui.m_1ilhynh');
    return this.localization.formatDate(APP_BUILD_INFO.builtAt, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' });
  }
  // Owner rule (2026-11-25): the version + publish-time line, built from the
  // build metadata itself — shown on the splash and inside the app shell.
  get releaseLineLabel(): string {
    return this.t('ui.m_c8v101', { version: this.appVersion, publishedAt: this.buildTimeLabel });
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
  // T18 Slice B: reference-counted loading state. `loading` is a getter over
  // AbaLoadingStateService: assigning true claims one count, assigning false
  // releases exactly one count (see the service for the guard/release rules).
  // Every existing `this.loading = ...` site keeps working unchanged.
  private readonly loadingState = inject(AbaLoadingStateService);
  get loading(): boolean { return this.loadingState.isLoading(); }
  set loading(value: boolean) { if (value) this.loadingState.begin(); else this.loadingState.end(); }
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
  private applyingBrowserRoute = false;
  private initialRouteApplied = false;
  tab: Tab = 'overview';
  pendingAssistantQuestion = '';
  auditEvents: AuditEvent[] = [];
  auditTotal = 0;
  auditOffset = 0;
  auditLoading = false;
  auditError = '';
  auditAction = '';
  auditTargetType = '';
  businesses: Business[] = [];
  business: Business | null = null;
  selectedBusinessId = '';
  dashboard: Dashboard | null = null;
  customers: Customer[] = [];
  customerStatement: CustomerStatement | null = null;
  statementLoading = false;
  statementError = '';
  statementVisible = false;
  customerCreateRequest = 0;
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
  /** 3A-920 step 3: the invoice editor's selling-unit selector renders only while the switch is on. */
  transportEnabled = false;
  /** 3A-920 step 4: the company's own word for a trip + the flagged drivers. */
  transportUnitName = '';
  invoiceDrivers: InvoiceDraftDriver[] = [];
  customerSearch = '';
  productSearch = '';
  invoiceSearch = '';
  paymentSearch = '';
  purchaseSearch = '';
  invoiceStatusFilter: 'all' | 'draft' | 'issued' | 'void' = 'all';
  invoiceDensity: 'comfortable' | 'compact' = 'comfortable';
  invoiceSortKey: InvoiceSortKey = 'issue_date';
  invoiceSortDirection: InvoiceSortDirection = 'desc';
  invoicePageIndex = 0;
  readonly invoicePageSize = 10;
  selectedInvoiceForDetails: Invoice | null = null;
  selectedInvoiceDetail: InvoiceDetail | null = null;
  invoiceDetailLoading = false;
  invoiceDetailError = '';
  private invoiceDetailRequestVersion = 0;
  private invoiceDetailTrigger: HTMLElement | null = null;
  payments: Payment[] = [];
  suppliers: Supplier[] = [];
  purchaseOrders: PurchaseOrder[] = [];
  operationalHealth: OperationalHealth | null = null;
  healthLoading = false;
  healthError = '';
  purchasesLoading = false;
  operationsError = '';
  operationsErrorTab: OperationsMessageTab | null = null;
  operationsMessage = '';
  operationsMessageTab: OperationsMessageTab | null = null;
  operationsWarning = '';
  expensesRefreshTick = 0;
  purchaseOrderNumber = '';
  purchaseSupplierId = '';
  purchaseProductId = '';
  purchaseQuantity = '1';
  purchaseUnitCost = '0';
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
  productSku = '';
  productDescription = '';
  productUnit = 'unit';
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
  invoiceDraftDriverId: string | null = null;
  invoiceDraftTransportTrips = '';
  invoiceDraftTransportFrom = '';
  invoiceDraftTransportTo = '';
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
  showPaymentForm = false;
  private pendingPaymentRetrySnapshot: PaymentRetrySnapshot | null = null;
  private readonly paymentRetryVault = new PaymentRetryVault();
  keyboardOpen = false;
  mobileMoreOpen = false;
  @ViewChild('mobileMoreTrigger') private mobileMoreTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('mobileMoreMenu') private mobileMoreMenu?: ElementRef<HTMLElement>;
  @ViewChild(InvoiceDetailDrawerComponent) private invoiceDetailDrawerComponent?: InvoiceDetailDrawerComponent;
  isInstalled = false;
  installHelp = false;
  appUpdateAvailable = false;
  // 3A-650 part E: the update notice is dismissible for the session — the
  // new worker already controls the page (skipWaiting + clients.claim), so
  // dismissing only defers the reload, it cannot strand the user.
  appUpdateDismissed = false;
  private installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

  readonly loadInventoryMovementPage: InventoryMovementLoader;

  constructor(private readonly auth: AuthService, private readonly api: ApiService, private readonly localization: LocalizationService) {
    this.loadInventoryMovementPage = query => this.api.inventoryMovements(query.businessId, {
      productId: query.productId || undefined,
      movementType: query.movementType || undefined,
      referenceType: query.referenceType || undefined,
      limit: query.limit,
      offset: query.offset,
    });
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
    this.invoicePageIndex = 0;
    this.invoiceFilterCustomerId = customerId;
    this.setTab('invoices');
  }

  get filteredCustomers(): Customer[] {
    return filterCustomers(this.customers, this.customerSearch, this.localization.locale);
  }

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
    const filtered = filterInvoices(this.invoices, this.invoiceSearch, this.invoiceStatusFilter, this.invoiceFilterCustomerId,
      status => this.invoiceStatusLabel(status), id => this.customerNameForInvoice(id), this.localization.locale);
    return sortInvoiceRecords(filtered, this.invoiceSortKey, this.invoiceSortDirection,
      id => this.customerNameForInvoice(id), this.localization.locale);
  }

  get visibleInvoices(): Invoice[] {
    return paginateInvoiceRecords(this.filteredInvoices, this.invoicePageIndex, this.invoicePageSize).items;
  }

  get invoicePageCount(): number {
    return paginateInvoiceRecords(this.filteredInvoices, this.invoicePageIndex, this.invoicePageSize).pageCount;
  }

  get invoicePageStart(): number {
    return paginateInvoiceRecords(this.filteredInvoices, this.invoicePageIndex, this.invoicePageSize).start;
  }

  get invoicePageEnd(): number {
    return paginateInvoiceRecords(this.filteredInvoices, this.invoicePageIndex, this.invoicePageSize).end;
  }

  get invoiceStatusCounts(): InvoiceStatusCounts {
    const matching = filterInvoices(this.invoices, this.invoiceSearch, 'all', this.invoiceFilterCustomerId,
      status => this.invoiceStatusLabel(status), id => this.customerNameForInvoice(id), this.localization.locale);
    return countInvoiceStatuses(matching);
  }

  setInvoiceStatusFilter(status: 'all' | 'draft' | 'issued' | 'void'): void {
    this.invoiceStatusFilter = status;
    this.invoicePageIndex = 0;
  }

  // T18 Slice F (2026-11-21): the filter bar's clear action resets every
  // invoice list filter (search, status, customer) and the page index.
  clearInvoiceFilters(): void {
    this.invoiceSearch = '';
    this.invoiceStatusFilter = 'all';
    this.invoiceFilterCustomerId = '';
    this.invoicePageIndex = 0;
  }

  // T18 Slice F (2026-11-21): the text the filter bar shows for the current
  // invoice filters — status (unless "all"), search term, customer name —
  // using the same labels as the status chips. Empty when nothing is set.
  invoiceFilterSummary(): string {
    const statusKeys: Record<string, string> = {
      all: 'ui.m_1cyu9lp',
      draft: 'ui.m_1vbs2bw',
      issued: 'ui.m_7bugfd',
      void: 'ui.m_1a2uk7t',
    };
    const parts: string[] = [];
    if (this.invoiceStatusFilter !== 'all') parts.push(this.t(statusKeys[this.invoiceStatusFilter]));
    if (this.invoiceSearch.trim()) parts.push(this.invoiceSearch.trim());
    if (this.invoiceFilterCustomerId) {
      const customer = this.customers.find((item) => item.id === this.invoiceFilterCustomerId);
      if (customer) parts.push(customer.name);
    }
    return parts.join(' · ');
  }

  async openInvoiceDetails(invoice: Invoice, event?: Event): Promise<void> {
    const businessId = this.business?.id;
    if (!businessId) return;
    const requestVersion = ++this.invoiceDetailRequestVersion;
    const trigger = event?.currentTarget;
    this.invoiceDetailTrigger = trigger instanceof HTMLElement ? trigger : null;
    this.selectedInvoiceForDetails = invoice;
    this.selectedInvoiceDetail = null;
    this.invoiceDetailError = '';
    this.invoiceDetailLoading = true;
    setTimeout(() => this.invoiceDetailDrawerComponent?.focusClose(), 0);
    try {
      const detail = await this.api.invoiceDetail(businessId, invoice.id);
      if (requestVersion !== this.invoiceDetailRequestVersion || this.business?.id !== businessId
        || this.selectedInvoiceForDetails?.id !== invoice.id) return;
      this.selectedInvoiceDetail = detail;
    } catch (error) {
      if (requestVersion === this.invoiceDetailRequestVersion && this.business?.id === businessId) {
        this.invoiceDetailError = this.message(error);
      }
    } finally {
      if (requestVersion === this.invoiceDetailRequestVersion) this.invoiceDetailLoading = false;
    }
  }

  closeInvoiceDetails(restoreFocus = true): void {
    const trigger = this.invoiceDetailTrigger;
    this.invoiceDetailRequestVersion += 1;
    this.selectedInvoiceForDetails = null;
    this.selectedInvoiceDetail = null;
    this.invoiceDetailLoading = false;
    this.invoiceDetailError = '';
    this.invoiceDetailTrigger = null;
    if (restoreFocus) queueMicrotask(() => { if (trigger?.isConnected) trigger.focus(); });
  }

  editInvoiceFromDetails(): void {
    const invoice = this.selectedInvoiceForDetails;
    this.closeInvoiceDetails(false);
    if (invoice) void this.editInvoice(invoice);
  }

  issueInvoiceFromDetails(): void {
    const invoice = this.selectedInvoiceForDetails;
    this.closeInvoiceDetails(false);
    if (invoice) void this.issueInvoice(invoice);
  }

  payInvoiceFromDetails(): void {
    const invoice = this.selectedInvoiceForDetails;
    this.closeInvoiceDetails(false);
    if (invoice) this.payInvoice(invoice);
  }

  printInvoiceFromDetails(): void {
    const invoice = this.selectedInvoiceForDetails;
    this.closeInvoiceDetails(false);
    if (invoice) void this.printInvoice(invoice);
  }

  voidInvoiceFromDetails(event: MouseEvent): void {
    const invoice = this.selectedInvoiceForDetails;
    if (invoice) this.requestInvoiceVoid(invoice, event);
  }

  async duplicateInvoiceFromDetails(): Promise<void> {
    const invoice = this.selectedInvoiceForDetails;
    if (!this.business || !this.signedIn || !this.currentAuthUid || !invoice || this.loading) return;
    const businessId = this.business.id;
    const requestVersion = this.invoiceMutationGuard.begin();
    const requestContext = this.captureTenantRequest(businessId);
    const isCurrent = (): boolean => this.isCurrentTenantOperation(this.invoiceMutationGuard, requestVersion, requestContext);
    this.loading = true;
    this.error = '';
    try {
      const copy = await this.api.duplicateInvoice(businessId, invoice.id);
      if (!isCurrent()) return;
      this.closeInvoiceDetails(false);
      await this.editInvoice(copy);
    } catch (error) {
      if (isCurrent()) this.error = this.message(error);
    } finally {
      if (isCurrent()) this.loading = false;
    }
  }

  invoiceSortAria(key: InvoiceSortKey): 'ascending' | 'descending' | 'none' {
    return this.invoiceSortKey !== key ? 'none' : this.invoiceSortDirection === 'asc' ? 'ascending' : 'descending';
  }

  invoiceSortIndicator(key: InvoiceSortKey): string {
    return this.invoiceSortKey !== key ? '↕' : this.invoiceSortDirection === 'asc' ? '↑' : '↓';
  }

  toggleInvoiceSort(key: InvoiceSortKey): void {
    if (this.invoiceSortKey === key) this.invoiceSortDirection = this.invoiceSortDirection === 'asc' ? 'desc' : 'asc';
    else { this.invoiceSortKey = key; this.invoiceSortDirection = key === 'issue_date' ? 'desc' : 'asc'; }
    this.invoicePageIndex = 0;
  }

  toggleInvoiceDensity(): void {
    this.invoiceDensity = this.invoiceDensity === 'compact' ? 'comfortable' : 'compact';
  }

  changeInvoicePage(delta: number): void {
    this.invoicePageIndex = Math.max(0, Math.min(this.invoicePageCount - 1, this.invoicePageIndex + delta));
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
      const registerWorker = () => navigator.serviceWorker.register('/sw.js').then((registration) => {
        // 3A-650 part E: long-lived tabs learn about a newer worker when
        // they become visible again, instead of only at the next full load.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void registration.update().catch(() => undefined);
          }
        });
      }).catch(() => {
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
    this.initialRouteApplied = false;
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
    this.initialRouteApplied = false;
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
      if (this.tab === 'platform-admin') this.setTab('overview');
    }
  }

  // 3A-698 (U22): switching between sign-in and sign-up keeps the same card;
  // a stale failure from the other mode must not follow the user across.
  toggleAuthMode(): void {
    this.signingUp = !this.signingUp;
    this.error = '';
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

  async submitDemoLogin(): Promise<void> {
    if (this.loading || this.signingUp) return;
    this.authFlowInProgress = true;
    this.loading = true;
    this.error = '';
    try {
      const session = await this.api.createDemoSession();
      const user = await this.auth.signInWithCustomToken(session.custom_token);
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
        this.applyInitialWorkspaceRoute();
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
      // Reuse the same access policy for direct URLs and interactive navigation.
      if (!this.canAccessTab(this.tab)) this.setTab('overview');
      // Clear stale tenant data before applying a pending deep link. On first auth
      // resolution, keep the requested URL intact so it can be authorized below.
      if (workspaceAccessChanged) this.clearWorkspaceData();
      if (workspaceAccessChanged && this.initialRouteApplied) this.syncWorkspaceUrl('overview', true);
      this.applyInitialWorkspaceRoute();
      await this.loadWorkspaceData();
    } catch (error) {
      if (requestVersion !== this.businessListRequestVersion ||
          !this.signedIn || requestUid !== this.currentAuthUid) return;
      this.business = null;
      this.selectedBusinessId = '';
      this.clearWorkspaceData();
      if (this.initialRouteApplied) this.syncWorkspaceUrl('overview', true);
      else this.initialRouteApplied = false;
      this.error = this.message(error);
    } finally {
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.loading = false;
    }
  }

  private clearWorkspaceData(): void {
    // T18 Slice B: this invalidates every in-flight request guard below, so
    // those operations' results are discarded — release their loading counts
    // too, or a superseded operation whose guarded finally never fires would
    // stick the loader on.
    this.loadingState.reset();
    this.closeInvoiceDetails(false);
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
    this.setInvoiceDraftTransport(null);
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
    this.payrollRefreshGuard.invalidate();
    this.operationalHealthLoadGuard.invalidate();
    // Invalidate the top-level workspace load too; otherwise an old load's finally
    // block can still mutate loading state while a new identity is being resolved.
    this.workspaceLoadGuard.invalidate();
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
    this.dashboard = null;
    this.homeDashboardError = '';
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
    this.paymentSearch = '';
    this.purchaseSearch = '';
    this.operationalHealth = null;
    this.operationsError = '';
    this.operationsErrorTab = null;
    this.operationsMessage = '';
    this.operationsMessageTab = null;
    this.operationsWarning = '';
    this.healthError = '';
    this.purchaseOrderNumber = '';
    this.purchaseSupplierId = '';
    this.purchaseProductId = '';
    this.purchaseQuantity = '1';
    this.purchaseUnitCost = '0';
    this.purchasesLoading = false;
    this.healthLoading = false;
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
    this.tab = 'overview';
  }

  async createWorkspace(): Promise<void> {
    // 3A-700 (U23): in-flight guard — the disabled submit is the visible
    // control, this keeps a programmatic re-entry from double-creating.
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    try {
      const created = await this.api.createBusiness({ name: this.businessName, currency_code: this.currencyCode });
      this.businesses = [created];
      this.business = created;
      this.selectedBusinessId = created.id;
      this.clearWorkspaceData();
      this.syncWorkspaceUrl('overview', true);
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
    this.syncWorkspaceUrl('overview', true);
    this.error = '';
    await this.loadWorkspaceData();
  }

  private readonly workspaceLoadGuard = new WorkspaceLoadGuard();
  private readonly customerPickerLoadGuard = new WorkspaceLoadGuard();
  private readonly productPickerLoadGuard = new WorkspaceLoadGuard();
  private readonly invoiceListLoadGuard = new WorkspaceLoadGuard();
  private readonly paymentListLoadGuard = new WorkspaceLoadGuard();
  private readonly payrollRefreshGuard = new WorkspaceLoadGuard();
  private readonly operationalHealthLoadGuard = new WorkspaceLoadGuard();
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
      this.showPaymentForm = true;
      this.paymentIdempotencyKey = savedPaymentRetry.payload.idempotency_key;
    }
    this.loading = true;
    this.error = '';
    try {
      const paymentsRequest = this.canAccessTab('payments') ? this.api.payments(id) : Promise.resolve([]);
      const [dashboard, customerPage, productPage, invoicePage, paymentPage, settings, employeePage] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), paymentsRequest,
        this.api.listSettings(id).catch(() => []),
        // 3A-920 step 4: the employees endpoint is owner-only; staff fail
        // closed to an empty drivers list (the block never offers anyone).
        this.api.employees(id).catch(() => []),
      ]);
      if (!this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) return;
      // 3A-920 step 3: the invoice editor's selling-unit selector renders
      // only while the switch is on; a failed settings read fails closed.
      this.transportEnabled = transportEnabledFromSettings(settings);
      this.transportUnitName = transportUnitNameFromSettings(settings, this.t('ui.assistantSettings.transport.defaultUnitName'));
      this.invoiceDrivers = employeePage
        .filter(employee => employee.is_driver && employee.is_active)
        .map(employee => ({ id: employee.id, name: employee.name }));
      this.dashboard = dashboard;
      this.homeDashboardError = '';
      this.setCustomerPage(customerPage);
      if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      this.setProductPage(productPage);
      this.setInvoicePage(invoicePage);
      this.setPaymentPage(paymentPage);
      if (!this.invoiceProductId && this.products.length) this.invoiceProductId = this.products[0].id;
      if (!this.paymentInvoiceId) this.paymentInvoiceId = this.invoices.find(item => item.status === 'issued')?.id || '';
    } catch (error) {
      if (this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) {
        this.clearWorkspaceData();
        this.syncWorkspaceUrl('overview', true);
        this.error = this.message(error);
        // clearWorkspaceData invalidates the request generation, so this failure path
        // must release the loading state itself instead of relying on the guarded finally.
        this.loading = false;
      }
    } finally {
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.loading = false;
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
    this.invoicePageIndex = 0;
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
        // 3A-351: expenses are owned by the expenses workspace now; the shell
        // only refreshes the dashboard here and signals the workspace to reload.
        const dashboard = await this.api.dashboard(requestContext.workspaceId);
        return { dashboard };
      },
      {
        onSuccess: ({ dashboard }) => {
          this.dashboard = dashboard;
          this.expensesRefreshTick++;
          if (this.error === this.homeDashboardError) this.error = '';
          this.homeDashboardError = '';
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





  toggleMobileMore(): void {
    this.mobileMoreOpen = !this.mobileMoreOpen;
  }

  @HostListener('window:popstate')
  onBrowserHistoryChange(): void {
    if (!this.signedIn || !this.initialized) return;
    this.applyBrowserWorkspaceRoute();
  }

  private applyInitialWorkspaceRoute(): void {
    if (this.initialRouteApplied) return;
    this.initialRouteApplied = true;
    this.applyBrowserWorkspaceRoute();
  }

  private applyBrowserWorkspaceRoute(): void {
    const resolution = resolveWorkspacePath(
      window.location.pathname,
      tab => tab === 'overview' || (this.canAccessTab(tab) && (tab === 'platform-admin' || Boolean(this.business))),
    );
    this.applyingBrowserRoute = true;
    try {
      this.setTab(resolution.tab);
    } finally {
      this.applyingBrowserRoute = false;
    }
    const nextUrl = workspaceUrlFor(resolution.tab, window.location.search, window.location.hash);
    if (resolution.status !== 'matched' || window.location.pathname !== resolution.path) {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }

  private syncWorkspaceUrl(tab: Tab, replace = false): void {
    if (this.applyingBrowserRoute) return;
    const nextUrl = workspaceUrlFor(tab, window.location.search, window.location.hash);
    if (window.location.pathname === workspacePathFor(tab)) return;
    if (replace) window.history.replaceState(window.history.state, '', nextUrl);
    else window.history.pushState(window.history.state, '', nextUrl);
  }

  @HostListener('document:keydown.escape')
  closeMobileMoreOnEscape(): void {
    if (this.selectedInvoiceForDetails) {
      this.closeInvoiceDetails();
      return;
    }
    if (!this.mobileMoreOpen) return;
    this.mobileMoreOpen = false;
    this.mobileMoreTrigger?.nativeElement.focus();
  }

  /** Restore keyboard focus to the More trigger after a secondary destination is selected. */
  selectMobileMoreTab(tab: Tab): void {
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

  dismissAppUpdate(): void {
    this.appUpdateDismissed = true;
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



  customerStatementEventLabel(eventType: string): string {
    const keys: Record<string, string> = {
      invoice_issued: 'app.customerStatementEvent.invoice_issued',
      payment_allocation: 'app.customerStatementEvent.payment_allocation',
      payment_received: 'app.customerStatementEvent.payment_received',
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
  "team": "catalog.team.title",
  "platform-admin": "app.pageTitle.platform-admin"
};
    return this.t(keys[this.tab]);
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


  private async loadSuppliers(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    try { const items = await this.api.suppliers(businessId); if (this.business?.id === businessId) this.suppliers = items; }
    catch { /* name resolution degrades to id prefixes, as supplierNameFor already falls back */ }
  }
  private async loadPurchaseOrders(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.purchasesLoading = true; this.operationsError = ''; this.operationsErrorTab = null;
    try { const items = await this.api.purchaseOrders(businessId); if (this.business?.id === businessId) this.purchaseOrders = items; }
    catch (error) { if (this.business?.id === businessId) { this.operationsError = this.message(error); this.operationsErrorTab = 'purchases'; } }
    finally { if (this.business?.id === businessId) this.purchasesLoading = false; }
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

  /** The mobile dock and desktop core group share the same role-filtered catalogue icons and order. */
  get primaryNavigationModules(): readonly WorkspaceModuleCard[] {
    const byTab = new Map(this.homeModuleCards.map(module => [module.tab, module] as const));
    return (['overview', 'invoices', 'customers'] as const).flatMap(tab => {
      const module = byTab.get(tab);
      return module ? [module] : [];
    });
  }

  /** Desktop navigation mirrors the mobile More taxonomy while retaining the three primary dock destinations. */
  get desktopNavigationGroups(): readonly { id: string; titleKey: string; modules: readonly WorkspaceModuleCard[] }[] {
    const accessibleModules = this.homeModuleCards;
    return [
      {
        id: 'workspace-core',
        titleKey: 'ui.m_criw1m',
        modules: this.primaryNavigationModules,
      },
      ...WORKSPACE_MODULE_GROUPS.map(group => ({
        ...group,
        modules: accessibleModules.filter(module => module.mobileGroup === group.id),
      })),
    ].filter(group => group.modules.length > 0);
  }

  isMobileMoreTab(tab: Tab): boolean {
    return isMobileMoreTabValue(tab);
  }

  askAssistantFromReports(question: string): void {
    // 3A-435 / T40: a report hands its context to the assistant as a
    // question. The question is set first so the assistant component mounts
    // (or updates) with it already present.
    if (!question.trim()) return;
    this.pendingAssistantQuestion = question;
    this.setTab('assistant');
  }

  setTab(tab: Tab): void {
    if (!this.canAccessTab(tab)) {
      this.tab = 'overview';
      this.syncWorkspaceUrl('overview', true);
      this.mobileMoreOpen = false;
      return;
    }
    if (tab !== 'invoices' && this.selectedInvoiceForDetails) this.closeInvoiceDetails(false);
    if (this.operationsMessageTab && this.operationsMessageTab !== tab) {
      this.operationsMessage = '';
      this.operationsMessageTab = null;
      this.operationsWarning = '';
    }
    this.tab = tab;
    this.syncWorkspaceUrl(tab);
    this.error = tab === 'overview' && this.homeDashboardError ? this.homeDashboardError : '';
    this.mobileMoreOpen = false;
    if (tab === 'audit') void this.loadAuditEvents(0);
    if (tab === 'purchases') { void this.loadSuppliers(); void this.loadPurchaseOrders(); }
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

  /* T18 Slice U02 (2026-11-21): the statement starts from the top. The
   * statement panel renders below the customer list, so opening it leaves it
   * below the fold; scroll it to the top of the viewport once the page has
   * loaded and the panel has rendered. Only the open paths scroll — paging
   * and filter changes inside the statement do not. */
  private scrollStatementIntoView(): void {
    requestAnimationFrame(() => {
      document.querySelector('.statement-panel')?.scrollIntoView({ block: 'start' });
    });
  }

  async openCustomerStatementById(customerId: string): Promise<void> {
    const business = this.business;
    const userId = this.currentAuthUid;
    if (!business || !this.signedIn || !userId || !customerId) return;
    const businessId = business.id;
    const role = business.role ?? null;
    const requestVersion = this.statementLoadGuard.begin();
    const requestContext = { workspaceId: businessId, userId, role, signedIn: this.signedIn, customerId };
    const isCurrent = (): boolean => isCurrentTenantRequest(
      this.statementLoadGuard,
      requestVersion,
      requestContext,
      {
        workspaceId: this.business?.id ?? '',
        userId: this.currentAuthUid,
        role: this.business?.role ?? null,
        signedIn: this.signedIn,
        customerId,
      },
    );
    this.statementVisible = true;
    this.statementLoading = true;
    this.statementError = '';
    this.customerStatement = null;
    try {
      const customer = await this.api.customer(businessId, customerId);
      if (!isCurrent()) return;
      this.statementCustomerId = customer.id;
      this.statementCustomerName = customer.name;
      this.statementFromDate = '';
      this.statementToDate = '';
      this.statementLoading = false;
      await this.loadCustomerStatementPage(0);
      this.scrollStatementIntoView();
    } catch (error) {
      if (!isCurrent()) return;
      this.statementError = this.message(error);
      this.statementLoading = false;
    }
  }

  async loadCustomerStatement(customer: Customer): Promise<void> {
    this.statementCustomerId = customer.id;
    this.statementCustomerName = customer.name;
    this.statementFromDate = '';
    this.statementToDate = '';
    this.statementVisible = true;
    await this.loadCustomerStatementPage(0);
    this.scrollStatementIntoView();
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

  onWorkspaceCustomerSaved(customer: Customer): void {
    // Upsert the server-returned record so the invoice picker reflects it immediately
    // without a workspace reload. Preserve the loaded page, the pagination cursor and
    // the currently selected customer; never apply a record to another business.
    if (!this.business) return;
    const exists = this.customers.some(item => item.id === customer.id);
    this.customers = exists
      ? this.customers.map(item => (item.id === customer.id ? customer : item))
      : [customer, ...this.customers];
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
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.loading = false;
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
        this.productRefreshRequest++;
        if (this.products.length) this.invoiceProductId = this.products[0].id;
      } catch {
        if (this.business?.id === businessId) {
          this.importMessageKind = 'warning';
          this.importMessage = this.t('ui.m_1lap6fd');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) {
        if (this.isTimeoutError(error)) {
          // The import may or may not have completed: the request timed out
          // after the server may have committed. Do not invite a blind
          // retry; refresh the list so the user can see whether the rows
          // landed.
          this.error = this.t('ui.m_1y0hb3');
          try {
            const products = await this.api.products(businessId);
            if (this.business?.id !== businessId) return;
            this.setProductPage(products);
            this.productRefreshRequest++;
            if (this.products.length) this.invoiceProductId = this.products[0].id;
          } catch {
            // Best-effort refresh: the unknown-outcome message already stands.
          }
        } else {
          this.error = this.message(error);
        }
      }
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
        this.customerRefreshRequest++;
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
      if (this.business?.id === businessId) {
        if (this.isTimeoutError(error)) {
          // The import may or may not have completed: the request timed out
          // after the server may have committed. Do not invite a blind
          // retry; refresh the list so the user can see whether the rows
          // landed.
          this.error = this.t('ui.m_iwxc3c');
          try {
            const customers = await this.api.customers(businessId);
            if (this.business?.id !== businessId) return;
            this.setCustomerPage(customers);
            this.customerRefreshRequest++;
            if (!this.invoiceCustomerId && this.customers.length) {
              this.invoiceCustomerId = this.customers[0].id;
            }
          } catch {
            // Best-effort refresh: the unknown-outcome message already stands.
          }
        } else {
          this.error = this.message(error);
        }
      }
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

  private normalizeProductDecimal(value: string, scale: 2 | 3): string | null {
    const normalized = String(value ?? '').trim()
      .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
      .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/٫/g, '.');
    const pattern = scale === 2 ? /^(\d{1,12})(?:\.(\d{1,2}))?$/ : /^(\d{1,11})(?:\.(\d{1,3}))?$/;
    const match = pattern.exec(normalized);
    if (!match) return null;
    return `${BigInt(match[1]).toString()}.${(match[2] || '').padEnd(scale, '0')}`;
  }

  async createProduct(): Promise<void> {
    if (!this.business) return;
    if (!this.productName.trim()) { this.error = this.t('productEditor.nameRequired'); return; }
    if (!this.productUnit.trim()) { this.error = this.t('productEditor.unitRequired'); return; }
    const unitPrice = this.normalizeProductDecimal(this.productPrice, 2);
    const openingQuantity = this.stockTracked && this.business.role === 'owner'
      ? this.normalizeProductDecimal(this.productOpeningQuantity, 3)
      : '0';
    if (unitPrice === null) { this.error = this.t('ui.m_1hiyjor'); return; }
    if (openingQuantity === null) { this.error = this.t('ui.m_1rtcb8u'); return; }
    const businessId = this.business.id;
    this.loading = true;
    this.error = '';
    this.productMessage = '';
    this.productMessageKind = 'success';
    try {
      await this.api.createProduct(businessId, {
        name: this.productName.trim(),
        sku: this.productSku.trim() || undefined,
        description: this.productDescription.trim() || undefined,
        unit: this.productUnit.trim() || 'unit',
        unit_price: unitPrice,
        is_stock_tracked: this.stockTracked,
        opening_quantity: openingQuantity,
      });
      if (this.business?.id !== businessId) return;
      this.productName = ''; this.productSku = ''; this.productDescription = ''; this.productUnit = 'unit';
      this.productPrice = ''; this.stockTracked = false; this.productOpeningQuantity = '0'; this.productCreateOpen = false;
      this.productMessage = this.t('ui.m_b4kbxp');
      try {
        const products = await this.api.products(businessId);
        if (this.business?.id !== businessId) return;
        this.setProductPage(products);
        this.productRefreshRequest++;
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

  createInvoiceForCustomer(customerId: string): void {
    if (!this.business || !this.signedIn || !this.currentAuthUid || !customerId) return;
    this.startNewInvoiceDraft();
    this.invoiceCustomerId = customerId;
    this.setTab('invoices');
  }



  /** 3A-920 step 4: seed (or clear) the editor's transport block from a detail. */
  private setInvoiceDraftTransport(detail: InvoiceDetail | null): void {
    this.invoiceDraftDriverId = detail?.driver_employee_id ?? null;
    this.invoiceDraftTransportTrips = detail?.transport_trips != null ? String(detail.transport_trips) : '';
    this.invoiceDraftTransportFrom = detail?.transport_from ?? '';
    this.invoiceDraftTransportTo = detail?.transport_to ?? '';
  }

  startNewInvoiceDraft(): void {
    if (this.invoiceDraftSaving || this.invoiceDraftUncertain) return;
    this.editingInvoiceId = null;
    this.invoiceDraftInitialLines = null;
    this.invoiceDraftNotes = '';
    this.setInvoiceDraftTransport(null);
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
      this.setInvoiceDraftTransport(detail);
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
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.loading = false;
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
      this.setInvoiceDraftTransport(detail);
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
    this.setInvoiceDraftTransport(null);
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
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.loading = false;
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
      if (this.selectedInvoiceForDetails?.id === invoice.id) this.closeInvoiceDetails(false);
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
      // Slice B: release this operation's own count; the guard above still protects the data writes.
      this.loading = false;
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

  private lastErrorKind: 'session-expired' | 'access-denied' | null = null;
  private lastErrorMessage: string | null = null;

  private isTimeoutError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /timed out/i.test(message);
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
}
