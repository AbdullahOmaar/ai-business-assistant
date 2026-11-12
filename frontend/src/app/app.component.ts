import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ApiRequestError, AuditEvent, Business, ChatReply, Customer, CustomerStatement, Dashboard, DataIntegrityReport, Expense, Invoice, Payment, Product, ProfitLossReport, ReceivablesAgingReport, NotificationRecord, OperationalHealth, PurchaseOrder, RecurringInvoiceSchedule, Supplier, TaxSummaryReport } from './api.service';
import { AuthService, type AuthUserSnapshot } from './auth.service';
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
        <a class="skip-link" href="#main-content">{{ t('تخطي إلى المحتوى الرئيسي', 'Skip to main content') }}</a>
      }
      @if (loading) { <div class="global-loading" role="status" aria-live="polite"><span></span><span class="loading-label">{{ t('جارٍ التحميل…', 'Loading…') }}</span></div> }
      @if (!initialized) {
        <main class="auth-card" role="status" aria-live="polite">
          <div class="brand-mark">A</div>
          <span class="version-pill splash-version" [attr.title]="t('إصدار الواجهة وواجهة API', 'UI and API release versions') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel + ' · Build time (Cairo): ' + buildTimeLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
          <small class="splash-build-time">{{ t('تاريخ ووقت بناء النسخة:', 'Build date & time:') }} {{ buildTimeLabel }}</small>
          <h1>{{ t('جارٍ تشغيل التطبيق', 'Starting the app') }}</h1>
          <p class="muted">{{ t('نتحقق من الإعدادات وجلسة الدخول قبل عرض مساحة العمل.', 'Checking configuration and your sign-in session before opening the workspace.') }}</p>
        </main>
      } @else if (startupFailed) {
        <main class="auth-card">
          <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? 'English' : 'العربية' }}</button></div>
          <div class="brand-mark">A</div>
          <h1>{{ t('تعذر تحميل إعدادات التطبيق', 'Unable to load app configuration') }}</h1>
          <aba-state-message kind="error" [description]="error" />
          <button class="secondary auth-retry" type="button" (click)="initializeApp()" [disabled]="loading">{{ loading ? t('جارٍ التحقق…', 'Checking…') : t('إعادة المحاولة', 'Retry startup') }}</button>
        </main>
      } @else if (setupNeeded) {
        <main class="setup-card">
          <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? 'English' : 'العربية' }}</button></div>
          <div class="brand-mark">A</div>
          <p class="eyebrow">{{ t('مساعد الأعمال الذكي · يلزم الإعداد', 'AI BUSINESS ASSISTANT · SETUP REQUIRED') }}</p>
          <h1>{{ t('اربط مساحة عملك الآمنة', 'Connect your secure workspace') }}</h1>
          <p>{{ t('الواجهة جاهزة، لكن يجب إعداد بيانات تطبيق Firebase العامة ورابط واجهة API قبل تسجيل الدخول.', 'The UI is ready, but public Firebase web-app settings and the API URL must be configured before sign-in.') }}</p>
          <div class="setup-steps">
            <p><strong>1.</strong> {{ t('افتح الملف', 'Open') }} <code>frontend/public/runtime-config.json</code> {{ t('داخل المستودع.', 'in the repository.') }}</p>
            <p><strong>2.</strong> {{ t('اضبط', 'Set') }} <code>apiBaseUrl</code> {{ t('على عنوان واجهة API المنشورة.', 'to the deployed API URL.') }}</p>
            <p><strong>3.</strong> {{ t('أدخل إعدادات تطبيق Firebase العامة:', 'Enter the public Firebase web-app settings:') }} <code>apiKey</code>, <code>authDomain</code>, <code>projectId</code>, {{ t('و', 'and') }} <code>appId</code>.</p>
            <p><strong>4.</strong> {{ t('اضبط معرّف مشروع Firebase المطابق وبيانات حساب الخدمة كأسرار في الخادم. لا تضع الأسرار داخل هذا الملف.', 'Configure the matching Firebase project ID and service-account credentials as server secrets. Never put secrets in this file.') }}</p>
          </div>
          <p class="footnote">{{ t('لن نعرض بيانات تجريبية. سيظل التطبيق مغلقًا حتى اكتمال هذه الإعدادات.', 'No fake data is shown. The app remains closed until configuration is complete.') }}</p>
        </main>
      } @else if (!signedIn) {
        <main class="auth-card">
          <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? 'English' : 'العربية' }}</button></div>
          <div class="brand-mark">A</div>
          <p class="eyebrow">{{ t('كل أعمالك في مكان واحد', 'YOUR BUSINESS, IN ONE PLACE') }}</p>
          <h1 id="auth-form-heading">{{ signingUp ? t('إنشاء حسابك', 'Create your account') : t('مرحبًا بعودتك', 'Welcome back') }}</h1>
          <p class="muted">{{ t('سجّل الدخول بأمان للوصول إلى مساحات العمل المصرح لك بها فقط.', 'Sign in securely to access only the workspaces you belong to.') }}</p>
          <form #authForm="ngForm" aria-labelledby="auth-form-heading" (ngSubmit)="authForm.valid && submitAuth()" class="stack">
            <label>{{ t('البريد الإلكتروني', 'Email address') }}<input #emailModel="ngModel" name="email" type="email" autocomplete="email" required [(ngModel)]="email" [attr.aria-invalid]="emailModel.invalid && (emailModel.touched || authForm.submitted) ? 'true' : null" [attr.aria-describedby]="emailModel.invalid && (emailModel.touched || authForm.submitted) ? 'auth-email-error' : null">
              @if (emailModel.invalid && (emailModel.touched || authForm.submitted)) {
                <small id="auth-email-error" class="field-error" aria-live="polite">{{ emailModel.errors?.['required'] ? t('البريد الإلكتروني مطلوب.', 'Email is required.') : t('أدخل بريدًا إلكترونيًا صحيحًا.', 'Enter a valid email address.') }}</small>
              }
            </label>
            <label>{{ t('كلمة المرور', 'Password') }}<input #passwordModel="ngModel" name="password" type="password" [attr.autocomplete]="signingUp ? 'new-password' : 'current-password'" minlength="6" required [(ngModel)]="password" [attr.aria-invalid]="passwordModel.invalid && (passwordModel.touched || authForm.submitted) ? 'true' : null" [attr.aria-describedby]="passwordModel.invalid && (passwordModel.touched || authForm.submitted) ? 'auth-password-error' : null">
              @if (passwordModel.invalid && (passwordModel.touched || authForm.submitted)) {
                <small id="auth-password-error" class="field-error" aria-live="polite">{{ passwordModel.errors?.['required'] ? t('كلمة المرور مطلوبة.', 'Password is required.') : t('كلمة المرور يجب ألا تقل عن 6 أحرف.', 'Password must be at least 6 characters.') }}</small>
              }
            </label>
            <button class="primary" type="submit" [disabled]="loading">{{ loading ? t('جارٍ التنفيذ…', 'Working…') : (signingUp ? t('إنشاء الحساب', 'Create account') : t('تسجيل الدخول', 'Sign in')) }}</button>
          </form>
          <button class="text-button" type="button" (click)="signingUp = !signingUp">{{ signingUp ? t('لديك حساب بالفعل؟ سجّل الدخول', 'Already have an account? Sign in') : t('مستخدم جديد؟ أنشئ حسابًا', 'New here? Create an account') }}</button>
          @if (error) { <aba-state-message kind="error" [description]="error" /> }
        </main>
      } @else {
        <aside class="sidebar" role="navigation" [attr.aria-label]="t('التنقل الرئيسي', 'Main navigation')">
          <a class="brand" href="#" (click)="$event.preventDefault(); setTab('overview')"><span class="brand-mark small">A</span><span>مساعد<span class="light">الأعمال</span></span></a>
          <p class="nav-label">{{ t('مساحة العمل', 'Workspace') }}</p>
          <button class="nav-item" [attr.aria-label]="t('الرئيسية', 'Home')" [attr.title]="t('الرئيسية', 'Home')" [class.active]="tab === 'overview'" [attr.aria-current]="tab === 'overview' ? 'page' : null" (click)="setTab('overview')"><span class="nav-icon overview-icon" aria-hidden="true">⌂</span><span>{{ t('الرئيسية', 'Home') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('نتيجة التشغيل الأولية', 'Preliminary operating result')" [attr.title]="t('نتيجة التشغيل الأولية', 'Preliminary operating result')" [class.active]="tab === 'reports'" [attr.aria-current]="tab === 'reports' ? 'page' : null" (click)="setTab('reports')"><span class="nav-icon" aria-hidden="true">∑</span><span>{{ t('نتيجة التشغيل الأولية', 'Preliminary operating result') }}</span></button>
          @if (canAccessTab('taxes')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('الضرائب', 'Tax summary')" [attr.title]="t('الضرائب', 'Tax summary')" [class.active]="tab === 'taxes'" [attr.aria-current]="tab === 'taxes' ? 'page' : null" (click)="setTab('taxes')"><span class="nav-icon" aria-hidden="true">%</span><span>{{ t('الضرائب', 'Tax summary') }}</span></button> }
          <button class="nav-item" [attr.aria-label]="t('الفواتير', 'Invoices')" [attr.title]="t('الفواتير', 'Invoices')" [class.active]="tab === 'invoices'" [attr.aria-current]="tab === 'invoices' ? 'page' : null" (click)="setTab('invoices')"><span class="nav-icon invoices-icon" aria-hidden="true">▤</span><span>{{ t('الفواتير', 'Invoices') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المنتجات والمخزون', 'Products & inventory')" [attr.title]="t('المنتجات والمخزون', 'Products & inventory')" [class.active]="tab === 'products'" [attr.aria-current]="tab === 'products' ? 'page' : null" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>{{ t('المنتجات والمخزون', 'Products & inventory') }}</span></button>
          <button class="nav-item" [attr.aria-label]="t('العملاء', 'Customers')" [attr.title]="t('العملاء', 'Customers')" [class.active]="tab === 'customers'" [attr.aria-current]="tab === 'customers' ? 'page' : null" (click)="setTab('customers')"><span class="nav-icon customers-icon" aria-hidden="true">♧</span><span>{{ t('العملاء', 'Customers') }}</span></button>
          @if (canAccessTab('employees')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('الموظفون', 'Employees')" [attr.title]="t('الموظفون', 'Employees')" [class.active]="tab === 'employees'" [attr.aria-current]="tab === 'employees' ? 'page' : null" (click)="setTab('employees')"><span class="nav-icon" aria-hidden="true">♙</span><span>{{ t('الموظفون', 'Employees') }}</span></button> }
          @if (canAccessTab('platform-admin')) { <button class="nav-item platform-admin-nav" [attr.aria-label]="t('إدارة المنصة', 'Platform admin')" [attr.title]="t('إدارة المنصة', 'Platform admin')" [class.active]="tab === 'platform-admin'" [attr.aria-current]="tab === 'platform-admin' ? 'page' : null" (click)="setTab('platform-admin')"><span class="nav-icon" aria-hidden="true">◇</span><span>{{ t('إدارة المنصة', 'Platform admin') }}</span></button> }
@if (canAccessTab('audit')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('سجل العمليات', 'Activity log')" [attr.title]="t('سجل العمليات', 'Activity log')" [class.active]="tab === 'audit'" [attr.aria-current]="tab === 'audit' ? 'page' : null" (click)="setTab('audit')"><span class="nav-icon" aria-hidden="true">◷</span><span>{{ t('سجل العمليات', 'Activity log') }}</span></button> }
                    @if (canAccessTab('payments')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('المدفوعات', 'Payments')" [attr.title]="t('المدفوعات', 'Payments')" [class.active]="tab === 'payments'" [attr.aria-current]="tab === 'payments' ? 'page' : null" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>{{ t('المدفوعات', 'Payments') }}</span></button> }
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المصروفات', 'Expenses')" [attr.title]="t('المصروفات', 'Expenses')" [class.active]="tab === 'expenses'" [attr.aria-current]="tab === 'expenses' ? 'page' : null" (click)="setTab('expenses')"><span class="nav-icon expense-icon" aria-hidden="true">−</span><span>{{ t('المصروفات', 'Expenses') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('الإشعارات', 'Notifications')" [attr.title]="t('الإشعارات', 'Notifications')" [class.active]="tab === 'notifications'" [attr.aria-current]="tab === 'notifications' ? 'page' : null" (click)="setTab('notifications')"><span class="nav-icon" aria-hidden="true">♢</span><span>{{ t('الإشعارات', 'Notifications') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('الموردون', 'Suppliers')" [attr.title]="t('الموردون', 'Suppliers')" [class.active]="tab === 'suppliers'" [attr.aria-current]="tab === 'suppliers' ? 'page' : null" (click)="setTab('suppliers')"><span class="nav-icon" aria-hidden="true">▣</span><span>{{ t('الموردون', 'Suppliers') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المشتريات', 'Purchasing')" [attr.title]="t('المشتريات', 'Purchasing')" [class.active]="tab === 'purchases'" [attr.aria-current]="tab === 'purchases' ? 'page' : null" (click)="setTab('purchases')"><span class="nav-icon" aria-hidden="true">⇩</span><span>{{ t('المشتريات', 'Purchasing') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('الفواتير الدورية', 'Recurring invoices')" [attr.title]="t('الفواتير الدورية', 'Recurring invoices')" [class.active]="tab === 'recurring'" [attr.aria-current]="tab === 'recurring' ? 'page' : null" (click)="setTab('recurring')"><span class="nav-icon" aria-hidden="true">↻</span><span>{{ t('الدورية', 'Recurring') }}</span></button>
          @if (canAccessTab('health')) { <button class="nav-item mobile-extra" [attr.aria-label]="t('الحالة التشغيلية', 'Operational health')" [attr.title]="t('الحالة التشغيلية', 'Operational health')" [class.active]="tab === 'health'" [attr.aria-current]="tab === 'health' ? 'page' : null" (click)="setTab('health')"><span class="nav-icon" aria-hidden="true">♥</span><span>{{ t('الحالة', 'Health') }}</span></button> }
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المساعد الذكي', 'AI assistant')" [attr.title]="t('المساعد الذكي', 'AI assistant')" [class.active]="tab === 'assistant'" [attr.aria-current]="tab === 'assistant' ? 'page' : null" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>{{ t('المساعد الذكي', 'AI assistant') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('دليل التطبيق والإصدارات', 'App guide & versions')" [attr.title]="t('دليل التطبيق والإصدارات', 'App guide & versions')" [class.active]="tab === 'release-guide'" [attr.aria-current]="tab === 'release-guide' ? 'page' : null" (click)="setTab('release-guide')"><span class="nav-icon" aria-hidden="true">ⓘ</span><span>{{ t('دليل التطبيق والإصدارات', 'App guide & versions') }}</span></button>
          <button #mobileMoreTrigger class="nav-item mobile-more" type="button" [class.active]="mobileMoreOpen || isMobileMoreTab(tab)" [attr.aria-label]="t('المزيد من الأقسام', 'More sections')" [attr.aria-expanded]="mobileMoreOpen" [attr.aria-controls]="mobileMoreOpen ? 'mobile-more-menu' : null" (click)="toggleMobileMore()"><span class="nav-icon" aria-hidden="true">•••</span><span>{{ t('المزيد', 'More') }}</span></button>
          @if (mobileMoreOpen) {
            <nav #mobileMoreMenu id="mobile-more-menu" class="mobile-more-menu" [attr.aria-label]="t('أقسام إضافية', 'Additional sections')">
              <label class="mobile-more-search">
                <span class="sr-only">{{ t('البحث في الأقسام', 'Search sections') }}</span>
                <input type="search" name="mobileMoreSearch" autocomplete="off" enterkeyhint="search"
                  [attr.aria-label]="t('البحث في الأقسام', 'Search sections')"
                  [placeholder]="t('ابحث عن قسم…', 'Search sections…')"
                  [(ngModel)]="mobileMoreSearch" />
              </label>
              @if (filteredMobileMoreGroups.length) {
                @for (group of filteredMobileMoreGroups; track group.id) {
                <section class="mobile-more-group" [attr.aria-labelledby]="'mobile-more-' + group.id + '-heading'">
                  <h3 [id]="'mobile-more-' + group.id + '-heading'">{{ t(group.titleAr, group.titleEn) }}</h3>
                  @for (module of group.modules; track module.tab) {
                    <button class="nav-item" type="button" [class.active]="tab === module.tab" [attr.aria-current]="tab === module.tab ? 'page' : null" (click)="selectMobileMoreTab(module.tab)">
                      <span class="nav-icon" aria-hidden="true">{{ module.icon }}</span>
                      <span>{{ t(module.titleAr, module.titleEn) }}</span>
                    </button>
                  }
                </section>
                }
              } @else {
                <p class="mobile-more-empty" role="status">{{ t('لا توجد أقسام مطابقة للبحث.', 'No sections match your search.') }}</p>
              }
              <div class="mobile-more-actions">
                <button class="nav-item mobile-menu-action" type="button" (click)="toggleLanguage()"><span class="nav-icon" aria-hidden="true">文</span><span>{{ language === 'ar' ? 'English' : 'العربية' }}</span></button>
                <button class="nav-item mobile-menu-action" type="button" (click)="logout()"><span class="nav-icon" aria-hidden="true">↪</span><span>{{ t('تسجيل الخروج', 'Sign out') }}</span></button>
              </div>
            </nav>
          }
          <div class="sidebar-bottom"><span class="status-dot"></span> {{ t('جلسة موثّقة', 'Verified session') }}<small>{{ t('يتحقق الخادم من صلاحيات مساحة العمل', 'The server verifies workspace permissions') }}</small></div>
        </aside>
        <main class="main" id="main-content" tabindex="-1">
          @if (!isInstalled) {
            <section class="mobile-install-card" [attr.aria-label]="t('تثبيت التطبيق', 'Install app')">
              <div class="mobile-install-copy">
                <span class="mobile-install-icon" aria-hidden="true">⇧</span>
                <div>
                  <strong>{{ t('ثبّت مساعد أعمالك', 'Install your business assistant') }}</strong>
                  <small>{{ t('وصول أسرع من الشاشة الرئيسية', 'Open it directly from your home screen') }}</small>
                </div>
              </div>
              <button class="secondary install-button mobile-install-button" type="button" (click)="installApp()">{{ t('تثبيت', 'Install') }}</button>
            </section>
          }
          @if (installHelp && !isInstalled) {
            <div class="install-help install-help-inline" role="status">
              {{ t('لو لم تظهر نافذة التثبيت: افتح قائمة المتصفح ⋮ ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'If no install prompt appears, open the browser menu and choose “Install app” or “Add to Home screen”.') }}
              <button type="button" class="secondary" (click)="installHelp = false">{{ t('حسنًا', 'Got it') }}</button>
            </div>
          }
          @if (tab === 'platform-admin' && platformAdminAvailable) {
            @defer (when tab === 'platform-admin' && platformAdminAvailable) {
              <aba-platform-admin [language]="language" [userEmail]="userEmail" (signOutRequested)="logout()" (languageToggleRequested)="toggleLanguage()" />
            } @placeholder {
              <section abaCard class="panel narrow">
                <aba-state-message kind="loading" [description]="t('جارٍ تحميل مركز الإدارة…', 'Loading Platform Admin…')" />
              </section>
            }
          } @else {
          <header class="topbar">
            <div class="topbar-heading"><p class="eyebrow">{{ t('مساحة العمل', 'Workspace') }}</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area">@if (!isInstalled) { <button class="secondary install-button" type="button" (click)="installApp()">{{ t('تثبيت التطبيق', 'Install app') }}</button> }<button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? 'English' : 'العربية' }}</button><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">{{ t('تسجيل الخروج', 'Sign out') }}</button></div>
          </header>
          @if (error) { <aba-state-message kind="error" [description]="error" [actionLabel]="sessionExpired ? t('تسجيل الدخول مجددًا', 'Sign in again') : accessDenied ? t('العودة للرئيسية', 'Go to Home') : t('إعادة المحاولة', 'Retry')" (action)="sessionExpired ? logout() : accessDenied ? setTab('overview') : retry()" /> }
          @if (loading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل بيانات مساحة العمل…', 'Loading workspace data…')" /> }

          @if (!business) {
            <section abaCard class="panel narrow">
              <p class="eyebrow">{{ t('ابدأ هنا', 'GET STARTED') }}</p><h2>{{ t('أنشئ مساحة عملك الأولى', 'Create your first workspace') }}</h2>
              <p class="muted">{{ t('مساحة العمل مرتبطة بحسابك الذي تم التحقق منه. لا يمكن للمستخدمين الآخرين الوصول إليها دون عضوية.', 'This workspace belongs to your verified account. Other users cannot access it without membership.') }}</p>
              <form #workspaceForm="ngForm" class="stack" (ngSubmit)="workspaceForm.valid && createWorkspace()">
                <label>{{ t('اسم النشاط التجاري', 'Business name') }}<input #businessNameModel="ngModel" name="businessName" required maxlength="160" [(ngModel)]="businessName" [attr.aria-invalid]="businessNameModel.invalid && (businessNameModel.touched || workspaceForm.submitted) ? 'true' : null" [attr.aria-describedby]="businessNameModel.invalid && (businessNameModel.touched || workspaceForm.submitted) ? 'workspace-name-error' : null">
                  @if (businessNameModel.invalid && (businessNameModel.touched || workspaceForm.submitted)) {
                    <small id="workspace-name-error" class="field-error" aria-live="polite">{{ businessNameModel.errors?.['required'] ? t('اسم النشاط التجاري مطلوب.', 'Business name is required.') : t('اسم النشاط يجب ألا يتجاوز 160 حرفًا.', 'Business name must be 160 characters or fewer.') }}</small>
                  }
                </label>
                <label>{{ t('العملة الافتراضية', 'Default currency') }}<select name="currency" [(ngModel)]="currencyCode"><option value="EGP">جنيه مصري</option><option value="USD">دولار أمريكي</option><option value="EUR">يورو</option><option value="GBP">جنيه إسترليني</option><option value="SAR">ريال سعودي</option><option value="AED">درهم إماراتي</option></select></label>
                <button class="primary" type="submit" [disabled]="loading">{{ t('إنشاء مساحة عمل', 'Create workspace') }}</button>
              </form>
            </section>
          } @else {
            <section class="workspace-bar" [attr.aria-label]="t('مساحة العمل الحالية', 'Current workspace')">
              <div class="workspace-current"><span class="eyebrow">{{ t('النشاط الحالي', 'Current business') }}</span><strong id="workspace-current-name" aria-live="polite">{{ business.name }}</strong></div>
              <select [attr.aria-label]="t('اختيار النشاط', 'Select business')" aria-describedby="workspace-current-name" [ngModel]="selectedBusinessId" (ngModelChange)="switchBusiness($event)">
                @for (item of businesses; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
              </select>
              <div class="workspace-release-meta workspace-release-meta-inline" [attr.aria-label]="t('إصدار التطبيق ووقت النشر', 'App version and deployment time')">
                <span class="version-pill" [attr.title]="t('إصدار الواجهة وواجهة API', 'UI and API release versions') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
                <small>{{ t('وقت بناء النسخة:', 'Build time:') }} {{ buildTimeLabel }}</small>
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
                <section class="dashboard-period" [attr.aria-label]="t('فترة مؤشرات النشاط', 'Business metrics reporting period')">
                  <div class="dashboard-period__heading">
                    <h2 class="dashboard-period__title">{{ t('ملخص النشاط', 'Business summary') }}</h2>
                    <strong>{{ t('آخر 30 يومًا', 'Last 30 days') }}</strong>
                  </div>
                  <div class="dashboard-period__details">
                    <span>{{ t('من', 'From') }} <bdi dir="ltr">{{ dashboard.period.start_date || '—' }}</bdi> {{ t('إلى', 'to') }} <bdi dir="ltr">{{ dashboard.period.end_date || '—' }}</bdi></span>
                    <span>{{ t('التوقيت المحلي للنشاط', 'Business timezone') }}: <bdi>{{ dashboard.period.timezone || '—' }}</bdi></span>
                  </div>
                </section>
                <section class="metric-grid" [attr.aria-label]="t('مؤشرات النشاط حسب العملة', 'Currency-separated business metrics')">
                  <aba-metric-card role="group" aria-labelledby="metric-invoiced-sales-label"><span id="metric-invoiced-sales-label" metricLabel>{{ t('المبيعات بالفواتير', 'Invoiced sales') }}</span>
                    @for (item of dashboard.invoiced_sales; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('فاتورة صادرة', 'issued invoices') }}</small> } @if (!dashboard.invoiced_sales.length) { <strong>—</strong><small>{{ t('لا توجد مبيعات بفواتير صادرة خلال الفترة', 'No invoiced sales in this period') }}</small> }<small class="metric-basis">{{ t('حسب تاريخ إصدار الفاتورة', 'By invoice issue date') }}</small></aba-metric-card>
                  <aba-metric-card role="group" aria-labelledby="metric-collected-payments-label"><span id="metric-collected-payments-label" metricLabel>{{ t('التحصيلات', 'Collected payments') }}</span>
                    @for (item of dashboard.collected_payments; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('دفعة مسجلة', 'recorded payments') }}</small> } @if (!dashboard.collected_payments.length) { <strong>—</strong><small>{{ t('لا توجد مدفوعات مسجلة خلال الفترة', 'No payments recorded in this period') }}</small> }<small class="metric-basis">{{ t('حسب وقت استلام الدفعة', 'By payment received time') }}</small></aba-metric-card>
                  <aba-metric-card role="group" aria-labelledby="metric-expenses-label"><span id="metric-expenses-label" metricLabel>{{ t('المصروفات', 'Expenses') }}</span>
                    @for (item of dashboard.expenses; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small><bdi dir="ltr">{{ item.count }}</bdi> {{ t('مصروف مسجل', 'recorded expenses') }}</small> } @if (!dashboard.expenses.length) { <strong>—</strong><small>{{ t('لا توجد مصروفات مسجلة خلال الفترة', 'No expenses recorded in this period') }}</small> }<small class="metric-basis">{{ t('حسب تاريخ تكبد المصروف', 'By expense incurred date') }}</small></aba-metric-card>
                  <aba-metric-card role="group" aria-labelledby="metric-outstanding-balances-label"><span id="metric-outstanding-balances-label" metricLabel>{{ t('المبالغ المستحقة', 'Outstanding balances') }}</span>
                    @for (item of dashboard.outstanding_balances; track item.currency_code) { <strong><bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi></strong><small class="metric-basis">{{ t('الفواتير الصادرة بعد خصم المبالغ المخصصة', 'Issued invoices after allocated payments') }}</small> } @if (!dashboard.outstanding_balances.length) { <strong>—</strong><small>{{ t('لا توجد فواتير مستحقة خلال الفترة', 'No outstanding invoices in this period') }}</small> }</aba-metric-card>
                </section>
                <section class="notice dashboard-trust-note" role="note"><strong>{{ t('ملاحظات على المؤشرات', 'Metric notes') }}</strong><span>{{ t('قيمة الفواتير الصادرة لا تعني أن المبلغ تم تحصيله. لكل مؤشر أساس زمني مستقل، والعملات لا تُجمع. لا تمثل هذه المؤشرات صافي الربح لأن تكلفة المنتجات وتكاليف أخرى قد تكون غير مكتملة.', 'Issued invoice value is not the same as collected payments. Each metric uses its own source timestamp, currencies are never combined, and these figures are not net profit because product cost and other costs may be incomplete.') }}</span></section>
              } @else if (loading) {
                <section class="dashboard-period dashboard-period--skeleton" aria-hidden="true">
                  <div class="dashboard-period__heading">
                    <h2 class="dashboard-period__title">{{ t('ملخص النشاط', 'Business summary') }}</h2>
                    <strong>{{ t('آخر 30 يومًا', 'Last 30 days') }}</strong>
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
                <aba-state-message kind="empty" [description]="t('لا توجد مؤشرات نشاط متاحة حاليًا.', 'No business metrics are available yet.')" />
              }
              <section abaCard class="panel module-launcher" aria-labelledby="module-launcher-title">
                <aba-section-header [titleId]="'module-launcher-title'" [title]="t('الوصول السريع', 'Quick access')" [description]="t('اختصارات للأقسام الأساسية في مساحة العمل.', 'Shortcuts to key workspace areas.')" [count]="homeQuickAccessCards.length" />
                <nav class="home-shortcut-list" [attr.aria-label]="t('اختصارات للأقسام الأساسية', 'Shortcuts to key sections')">
                  @for (module of homeQuickAccessCards; track module.tab) {
                    <button class="home-shortcut-link" type="button" (click)="setTab(module.tab)">
                      <span class="home-shortcut-link__icon" aria-hidden="true">{{ module.icon }}</span>
                      <span class="home-shortcut-link__label">{{ t(module.titleAr, module.titleEn) }}</span>
                    </button>
                  }
                </nav>
              </section>
              <section abaCard class="panel module-directory" aria-labelledby="module-directory-title">
                <details class="module-directory-disclosure">
                  <summary class="module-directory-summary">
                    <span class="module-directory-summary__copy">
                      <span class="module-directory-summary__title" role="heading" aria-level="2" id="module-directory-title">{{ t('كل أقسام مساحة العمل', 'All workspace modules') }}</span>
                      <small>{{ t('افتح لعرض الأقسام المتاحة حسب صلاحياتك الحالية.', 'Expand to browse modules available under your current permissions.') }}</small>
                    </span>
                    <span class="count">{{ homeModuleCards.length }}</span>
                    <span class="module-directory-toggle" aria-hidden="true">＋</span>
                  </summary>
                  <label class="module-directory-search">
                    <span class="sr-only">{{ t('البحث في أقسام مساحة العمل', 'Search workspace modules') }}</span>
                    <input type="search" name="homeModuleSearch" autocomplete="off"
                      [attr.aria-label]="t('البحث في أقسام مساحة العمل', 'Search workspace modules')"
                      [placeholder]="t('ابحث باسم القسم أو وصفه…', 'Search by module name or description…')"
                      [(ngModel)]="homeModuleSearch" />
                  </label>
                  @if (filteredHomeModuleCards.length) {
                  <div class="module-directory-grid">
                    @for (module of filteredHomeModuleCards; track module.tab) {
                      <aba-quick-access-card
                        [icon]="module.icon"
                        [title]="t(module.titleAr, module.titleEn)"
                        [description]="t(module.descriptionAr, module.descriptionEn)"
                        (activated)="setTab(module.tab)" />
                    }
                  </div>
                  } @else {
                    <p class="module-directory-empty" role="status">{{ t('لا توجد أقسام مطابقة للبحث.', 'No modules match your search.') }}</p>
                  }
                </details>
              </section>
              
            }

            @if (tab === 'notifications') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('قائمة الإشعارات', 'Notification queue') " [description]=" t('يتم حفظ بيانات الإشعار وحالته فقط؛ الإرسال الفعلي يحتاج مزودًا وعامل تسليم منشورًا.', 'This stores notification metadata and status only; delivery requires a configured provider and deployed worker.') "><span class="count">{{ filteredNotifications.length }} / {{ notifications.length }}</span></aba-section-header>
                @if (business?.role === 'owner') {
                <form #notificationForm="ngForm" class="stack" (ngSubmit)="notificationForm.valid && createNotification()">
                  <label>{{ t('نوع الإشعار', 'Notification type') }}<select #notificationKindControl="ngModel" name="notificationKind" required [attr.aria-invalid]="notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted) ? 'true' : null" [attr.aria-describedby]="notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted) ? 'notification-kind-error' : null" [(ngModel)]="notificationKind">
                    <option value="business">{{ t('مساحات العمل', 'Businesses') }}</option>
                    <option value="invoices">{{ t('الفواتير', 'Invoices') }}</option>
                    <option value="payments">{{ t('المدفوعات', 'Payments') }}</option>
                    <option value="expenses">{{ t('المصروفات', 'Expenses') }}</option>
                    <option value="inventory">{{ t('المخزون', 'Inventory') }}</option>
                    <option value="reminders">{{ t('التذكيرات', 'Reminders') }}</option>
                    <option value="reports">{{ t('التقارير', 'Reports') }}</option>
                    <option value="suppliers">{{ t('الموردون', 'Suppliers') }}</option>
                    <option value="purchases">{{ t('المشتريات', 'Purchases') }}</option>
                    <option value="recurring">{{ t('الفواتير الدورية', 'Recurring invoices') }}</option>
                    <option value="assistant">{{ t('المساعد الذكي', 'AI assistant') }}</option>
                    <option value="system">{{ t('النظام', 'System') }}</option>
                  </select></label>
                  <label>{{ t('العنوان', 'Title') }}<input #notificationTitleControl="ngModel" name="notificationTitle" required maxlength="160" [attr.aria-invalid]="notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted) ? 'true' : null" [attr.aria-describedby]="notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted) ? 'notification-title-error' : null" [(ngModel)]="notificationTitle"></label>
                  <label>{{ t('المحتوى', 'Message') }}<textarea #notificationBodyControl="ngModel" name="notificationBody" required maxlength="1000" rows="3" [attr.aria-invalid]="notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted) ? 'true' : null" [attr.aria-describedby]="notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted) ? 'notification-body-error' : null" [(ngModel)]="notificationBody"></textarea></label>
                  <label>{{ t('موعد الإرسال (اختياري)', 'Scheduled time (optional)') }}<input name="notificationScheduledAt" type="datetime-local" [(ngModel)]="notificationScheduledAt"></label>
                  <button class="primary" type="submit" [disabled]="notificationsLoading">{{ t('إضافة إلى قائمة الانتظار', 'Queue notification') }}</button>
                </form>
                @if ((notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted)) || (notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted)) || (notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (notificationKindControl.invalid && (notificationKindControl.touched || notificationForm.submitted)) { <small id="notification-kind-error" class="field-error">{{ t('اختر نوع الإشعار.', 'Choose a notification type.') }}</small> }
                    @if (notificationTitleControl.invalid && (notificationTitleControl.touched || notificationForm.submitted)) { <small id="notification-title-error" class="field-error">{{ t('أدخل عنوان الإشعار (بحد أقصى 160 حرفًا).', 'Enter a notification title (up to 160 characters).') }}</small> }
                    @if (notificationBodyControl.invalid && (notificationBodyControl.touched || notificationForm.submitted)) { <small id="notification-body-error" class="field-error">{{ t('أدخل محتوى الإشعار (بحد أقصى 1000 حرف).', 'Enter a notification message (up to 1000 characters).') }}</small> }
                  </div>
                }
                } @else { <aba-state-message kind="info" [description]="t('إضافة الإشعارات متاحة لمالك مساحة العمل فقط.', 'Only workspace owners can queue notifications.')" /> }
                @if (operationsError && operationsErrorTab === 'notifications') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'notifications') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'notifications' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="notificationSearch" type="search" [attr.aria-label]="t('البحث في الإشعارات', 'Search notifications')" [placeholder]="t('ابحث بالعنوان أو المحتوى أو النوع أو الحالة…', 'Search by title, message, type or status…')" [(ngModel)]="notificationSearch"></div>
                <aba-record-table [ariaLabel]="t('جدول الإشعارات','Notifications table')" [columns]="notificationTableColumns" [rows]="notificationTableRows" [loading]="notificationsLoading && !notifications.length" [loadingDescription]="t('جارٍ تحميل الإشعارات…', 'Loading notifications…')" [emptyTitle]="t('قائمة الإشعارات فارغة','Notification queue is empty')" [emptyDescription]="notificationSearch.trim() ? t('لا توجد إشعارات مطابقة للبحث.','No notifications match this search.') : t('لا توجد إشعارات حتى الآن.','No notifications yet.')" />
              </section>
            }


@if (tab === 'suppliers') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('دليل الموردين', 'Supplier directory') " [description]=" t('بيانات الموردين مرتبطة بمساحة العمل الحالية.', 'Supplier records belong to the current workspace.') "><span class="count">{{ filteredSuppliers.length }} / {{ suppliers.length }}</span></aba-section-header>
<details class="aba-record-create">
                  <summary><span>{{ t('إضافة مورد', 'Add supplier') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #supplierForm="ngForm" class="inline-form" (ngSubmit)="supplierForm.valid && createSupplier()">
                  <input #supplierNameControl="ngModel" name="supplierName" required maxlength="160" [attr.aria-label]="t('اسم المورد', 'Supplier name')" [attr.aria-invalid]="supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted) ? 'true' : null" [attr.aria-describedby]="supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted) ? 'supplier-name-error' : null" [placeholder]="t('اسم المورد', 'Supplier name')" [(ngModel)]="supplierName">
                  <input #supplierEmailControl="ngModel" name="supplierEmail" type="email" maxlength="254" [attr.aria-label]="t('البريد الإلكتروني', 'Email')" [attr.aria-invalid]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'true' : null" [attr.aria-describedby]="supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted) ? 'supplier-email-error' : null" [placeholder]="t('البريد الإلكتروني (اختياري)', 'Email (optional)')" [(ngModel)]="supplierEmail">
                  <input name="supplierPhone" maxlength="32" [attr.aria-label]="t('الهاتف', 'Phone')" [placeholder]="t('الهاتف (اختياري)', 'Phone (optional)')" [(ngModel)]="supplierPhone">
                  <input name="supplierAddress" maxlength="500" [attr.aria-label]="t('العنوان', 'Address')" [placeholder]="t('العنوان (اختياري)', 'Address (optional)')" [(ngModel)]="supplierAddress">
                  <button class="primary" type="submit" [disabled]="suppliersLoading">{{ t('إضافة مورد', 'Add supplier') }}</button>
                </form>
                @if ((supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted)) || (supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (supplierNameControl.invalid && (supplierNameControl.touched || supplierForm.submitted)) { <small id="supplier-name-error" class="field-error">{{ t('أدخل اسم المورد (بحد أقصى 160 حرفًا).', 'Enter a supplier name (up to 160 characters).') }}</small> }
                    @if (supplierEmailControl.invalid && (supplierEmailControl.touched || supplierForm.submitted)) { <small id="supplier-email-error" class="field-error">{{ t('أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.', 'Enter a valid email address or leave this field blank.') }}</small> }
                  </div>
                }

                  </div>
                </details>
                @if (operationsError && operationsErrorTab === 'suppliers') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'suppliers') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'suppliers' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="supplierSearch" type="search" [attr.aria-label]="t('البحث عن مورد', 'Search suppliers')" [placeholder]="t('ابحث بالاسم أو البريد أو الهاتف أو العنوان…', 'Search by name, email, phone or address…')" [(ngModel)]="supplierSearch"></div>
                <aba-record-table [ariaLabel]="t('جدول الموردين', 'Suppliers table')" [columns]="supplierTableColumns" [rows]="supplierTableRows" [loading]="suppliersLoading && !suppliers.length" [loadingDescription]="t('جارٍ تحميل الموردين…', 'Loading suppliers…')" [emptyTitle]="t('لا يوجد موردون', 'No suppliers yet')" [emptyDescription]="supplierSearch.trim() ? t('لا توجد نتائج مطابقة للبحث.', 'No suppliers match this search.') : t('أضف الموردين لتسهيل ربطهم بأوامر الشراء.', 'Add suppliers to link them to purchase orders.')" />

              </section>
            }


@if (tab === 'purchases') {
              <section abaCard class="panel">
                <aba-section-header id="purchases-section-heading" tabindex="-1" [title]=" t('أوامر الشراء', 'Purchase orders') " [description]=" t('استلام الكميات يسجل حركات مخزون؛ اعتماد الاستلام متاح للمالك فقط.', 'Receiving records stock movements; only owners can receive orders.') "><span class="count">{{ filteredPurchaseOrders.length }} / {{ purchaseOrders.length }}</span></aba-section-header>
<details class="aba-record-create">
                  <summary><span>{{ t('إنشاء أمر شراء', 'Create purchase order') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #purchaseForm="ngForm" class="stack" (ngSubmit)="purchaseForm.valid && createPurchaseOrder()">
                  <label>{{ t('رقم أمر الشراء', 'Order number') }}<input #purchaseOrderNumberControl="ngModel" name="purchaseOrderNumber" required maxlength="64" [attr.aria-invalid]="purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted) ? 'purchase-number-error' : null" [(ngModel)]="purchaseOrderNumber"></label>
                  <label>{{ t('المورد', 'Supplier') }}<select #purchaseSupplierControl="ngModel" name="purchaseSupplierId" required [attr.aria-invalid]="purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted) ? 'purchase-supplier-error' : null" [(ngModel)]="purchaseSupplierId"><option value="" disabled>{{ t('اختر المورد', 'Choose supplier') }}</option>@for (supplier of suppliers; track supplier.id) { <option [value]="supplier.id">{{ supplier.name }}</option> }</select></label>
                  <label>{{ t('المنتج', 'Product') }}<select #purchaseProductControl="ngModel" name="purchaseProductId" required [attr.aria-invalid]="purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted) ? 'purchase-product-error' : null" [(ngModel)]="purchaseProductId"><option value="" disabled>{{ t('اختر المنتج', 'Choose product') }}</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.sku || product.id.slice(0,8) }}</option> }</select></label>
                  <div class="inline-form"><label>{{ t('الكمية', 'Quantity') }}<input #purchaseQuantityControl="ngModel" name="purchaseQuantity" type="number" min="0.001" step="0.001" required [attr.aria-invalid]="purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted) ? 'purchase-quantity-error' : null" [(ngModel)]="purchaseQuantity"></label><label>{{ t('تكلفة الوحدة', 'Unit cost') }}<input #purchaseUnitCostControl="ngModel" name="purchaseUnitCost" type="number" min="0" step="0.01" required [attr.aria-invalid]="purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted) ? 'true' : null" [attr.aria-describedby]="purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted) ? 'purchase-unit-cost-error' : null" [(ngModel)]="purchaseUnitCost"></label></div>
                  <button class="primary" type="submit" [disabled]="purchasesLoading || !suppliers.length || !products.length">{{ t('إنشاء أمر شراء', 'Create purchase order') }}</button>
                </form>
                @if ((purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted)) || (purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted)) || (purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted)) || (purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted)) || (purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (purchaseOrderNumberControl.invalid && (purchaseOrderNumberControl.touched || purchaseForm.submitted)) { <small id="purchase-number-error" class="field-error">{{ t('أدخل رقم أمر الشراء (بحد أقصى 64 حرفًا).', 'Enter an order number (up to 64 characters).') }}</small> }
                    @if (purchaseSupplierControl.invalid && (purchaseSupplierControl.touched || purchaseForm.submitted)) { <small id="purchase-supplier-error" class="field-error">{{ t('اختر المورد.', 'Choose a supplier.') }}</small> }
                    @if (purchaseProductControl.invalid && (purchaseProductControl.touched || purchaseForm.submitted)) { <small id="purchase-product-error" class="field-error">{{ t('اختر المنتج.', 'Choose a product.') }}</small> }
                    @if (purchaseQuantityControl.invalid && (purchaseQuantityControl.touched || purchaseForm.submitted)) { <small id="purchase-quantity-error" class="field-error">{{ t('أدخل كمية لا تقل عن 0.001 وبخطوة 0.001.', 'Enter a quantity of at least 0.001 in 0.001 increments.') }}</small> }
                    @if (purchaseUnitCostControl.invalid && (purchaseUnitCostControl.touched || purchaseForm.submitted)) { <small id="purchase-unit-cost-error" class="field-error">{{ t('أدخل تكلفة وحدة تساوي صفرًا أو أكثر وبحد أقصى منزلتين عشريتين.', 'Enter a unit cost of zero or more with up to two decimal places.') }}</small> }
                  </div>
                }

                  </div>
                </details>
                @if (operationsError && operationsErrorTab === 'purchases') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'purchases') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'purchases' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="purchaseSearch" type="search" [attr.aria-label]="t('البحث في أوامر الشراء', 'Search purchase orders')" [placeholder]="t('ابحث برقم الأمر أو المورد أو المنتج أو الحالة…', 'Search by order, supplier, product or status…')" [(ngModel)]="purchaseSearch"></div>
                <aba-record-table [ariaLabel]="t('جدول أوامر الشراء والاستلام', 'Purchase orders and receiving table')" [columns]="purchaseTableColumns" [rows]="purchaseTableRows" [loading]="purchasesLoading && !purchaseOrders.length" [loadingDescription]="t('جارٍ تحميل أوامر الشراء…', 'Loading purchase orders…')" [actionsHeading]="t('الإجراءات', 'Actions')" [emptyTitle]="t('لا توجد أوامر شراء', 'No purchase orders yet')" [emptyDescription]="purchaseSearch.trim() ? t('لا توجد نتائج مطابقة للبحث.', 'No purchase orders match this search.') : t('أنشئ أمر شراء لربط المورد بالمنتجات والكميات المطلوبة.', 'Create a purchase order to connect a supplier with products and requested quantities.')" (rowAction)="onPurchaseRecordAction($event)" />

              </section>
            }


@if (tab === 'recurring') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('جدولة الفواتير الدورية', 'Recurring invoice schedules') " [description]=" t('هذه إعدادات الجدولة فقط؛ إنشاء الفواتير تلقائيًا يحتاج عامل جدولة منشورًا.', 'These are schedule settings only; automatic invoice generation requires a deployed scheduler worker.') "><span class="count">{{ filteredRecurringSchedules.length }} / {{ recurringSchedules.length }}</span></aba-section-header>
                @if (business?.role === 'owner') {
                <form #recurringForm="ngForm" class="stack" (ngSubmit)="recurringForm.valid && createRecurringSchedule()">
                  <label>{{ t('العميل (اختياري)', 'Customer (optional)') }}<select name="recurringCustomerId" [(ngModel)]="recurringCustomerId"><option value="">{{ t('بدون عميل محدد', 'No specific customer') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select></label>
                  <div class="inline-form"><label>{{ t('الفاصل بالأيام', 'Interval in days') }}<input #recurringIntervalControl="ngModel" name="recurringIntervalDays" type="number" min="1" max="3650" required [attr.aria-invalid]="recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted) ? 'true' : null" [attr.aria-describedby]="recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted) ? 'recurring-interval-error' : null" [(ngModel)]="recurringIntervalDays"></label><label>{{ t('التشغيل التالي', 'Next run') }}<input #recurringNextRunControl="ngModel" name="recurringNextRunAt" type="datetime-local" required [attr.aria-invalid]="recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted) ? 'true' : null" [attr.aria-describedby]="recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted) ? 'recurring-next-run-error' : null" [(ngModel)]="recurringNextRunAt"></label></div>
                  <label>{{ t('المنطقة الزمنية', 'Timezone') }}<input #recurringTimezoneControl="ngModel" name="recurringTimezone" required maxlength="64" [attr.aria-invalid]="recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted) ? 'true' : null" [attr.aria-describedby]="recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted) ? 'recurring-timezone-error' : null" [(ngModel)]="recurringTimezone"></label>
                  <button class="primary" type="submit" [disabled]="recurringLoading">{{ t('حفظ الجدولة', 'Save schedule') }}</button>
                </form>
                @if ((recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted)) || (recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted)) || (recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted))) {
                  <div class="form-validation" aria-live="polite">
                    @if (recurringIntervalControl.invalid && (recurringIntervalControl.touched || recurringForm.submitted)) { <small id="recurring-interval-error" class="field-error">{{ t('أدخل فاصلًا من يوم واحد إلى 3650 يومًا.', 'Enter an interval from 1 to 3650 days.') }}</small> }
                    @if (recurringNextRunControl.invalid && (recurringNextRunControl.touched || recurringForm.submitted)) { <small id="recurring-next-run-error" class="field-error">{{ t('اختر موعد التشغيل التالي.', 'Choose the next run date and time.') }}</small> }
                    @if (recurringTimezoneControl.invalid && (recurringTimezoneControl.touched || recurringForm.submitted)) { <small id="recurring-timezone-error" class="field-error">{{ t('أدخل المنطقة الزمنية (بحد أقصى 64 حرفًا).', 'Enter a timezone (up to 64 characters).') }}</small> }
                  </div>
                }
                } @else { <aba-state-message kind="info" [description]="t('إنشاء جداول الفواتير الدورية متاح لمالك مساحة العمل فقط.', 'Only workspace owners can create recurring invoice schedules.')" /> }
                @if (operationsError && operationsErrorTab === 'recurring') { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (operationsWarning && operationsMessageTab === 'recurring') { <aba-state-message kind="warning" [description]="operationsWarning" /> }
                @if (operationsMessageTab === 'recurring' && operationsMessage) { <aba-state-message kind="success" [description]="operationsMessage" /> }
                <div class="list-tools operations-search aba-record-toolbar"><input name="recurringSearch" type="search" [attr.aria-label]="t('البحث في الجداول الدورية', 'Search recurring schedules')" [placeholder]="t('ابحث بالعميل أو الفاصل أو المنطقة الزمنية أو الحالة…', 'Search by customer, interval, timezone or state…')" [(ngModel)]="recurringSearch"></div>
                <aba-record-table [ariaLabel]="t('جدول الفواتير الدورية','Recurring schedules table')" [columns]="recurringTableColumns" [rows]="recurringTableRows" [loading]="recurringLoading && !recurringSchedules.length" [loadingDescription]="t('جارٍ تحميل الجداول الدورية…', 'Loading recurring schedules…')" [emptyTitle]="t('لا توجد جداول دورية','No recurring schedules')" [emptyDescription]="recurringSearch.trim() ? t('لا توجد جداول مطابقة للبحث.','No schedules match this search.') : t('لا توجد جداول بعد.','No schedules yet.')" />
              </section>
            }


@if (tab === 'health' && business?.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('الحالة التشغيلية', 'Operational health') " [description]=" t('فحص قراءة فقط للاتصال بقاعدة البيانات وحالة الإعدادات الأساسية.', 'Read-only check of database connectivity and core service configuration.') "><span class="count">{{ operationalHealth ? operationalHealthStatusLabel(operationalHealth.status) : t('غير مفحوص', 'Not checked') }}</span></aba-section-header>
                <button class="primary" type="button" (click)="loadOperationalHealth()" [disabled]="healthLoading">{{ healthLoading ? t('جارٍ الفحص…', 'Checking…') : t('تحديث الفحص', 'Refresh check') }}</button>
                @if (healthError) { <aba-state-message kind="error" [description]="healthError" /> }
                @if (operationalHealth) {
                  <div class="metric-grid">
                    <article class="metric"><span>{{ t('اتصال قاعدة البيانات', 'Database connection') }}</span><strong>{{ operationalHealth.database_connected ? t('متصل', 'Connected') : t('غير متصل', 'Unavailable') }}</strong></article>
                    <article class="metric"><span>{{ t('جدول ترحيلات قاعدة البيانات', 'Migration metadata') }}</span><strong>{{ operationalHealth.migration_table_available ? t('متاح', 'Available') : t('غير متاح', 'Missing') }}</strong><small>{{ operationalHealth.migration_revision || t('لا توجد مراجعة مؤكدة', 'No confirmed revision') }}</small></article>
                    <article class="metric"><span>{{ t('إعداد الذكاء الاصطناعي', 'AI configuration') }}</span><strong>{{ operationalHealth.ai_configured ? t('مهيأ', 'Configured') : t('غير مهيأ', 'Not configured') }}</strong></article>
                    <article class="metric"><span>{{ t('عامل إرسال الإشعارات', 'Notification delivery worker') }}</span><strong>{{ operationalHealth.notification_delivery_configured ? t('مهيأ', 'Configured') : t('غير مهيأ', 'Not configured') }}</strong></article>
                    <article class="metric"><span>{{ t('عامل الفواتير الدورية', 'Recurring invoice worker') }}</span><strong>{{ operationalHealth.recurring_invoice_worker_configured ? t('مهيأ', 'Configured') : t('غير مهيأ', 'Not configured') }}</strong></article>
                  </div>
                  <p class="muted">{{ t('آخر فحص:', 'Last checked:') }} {{ operationalHealth.checked_at | date:'medium' }}. {{ t('الفحص لا يكشف الأسرار ولا يغيّر البيانات.', 'The check reveals no secrets and does not change data.') }}</p>
                }
              </section>
            }

@if (tab === 'reports') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('نتيجة التشغيل الأولية', 'Preliminary operating result') " [description]=" t('نتيجة أولية مبنية على إيرادات الفواتير الصادرة والمصروفات المسجلة، ولا تخصم تكلفة البضاعة المباعة.', 'Preliminary result based on issued-invoice revenue and recorded expenses; cost of goods sold is not deducted.') "><span class="count">{{ t('تقرير مالي', 'Financial report') }}</span></aba-section-header>
                <form #profitLossForm="ngForm" class="inline-form" (ngSubmit)="profitLossForm.valid && loadProfitLoss()">
                  <select name="profitLossPeriod" [attr.aria-label]="t('الفترة المالية', 'Reporting period')" [(ngModel)]="profitLossPeriod"><option value="30d">{{ t('آخر 30 يومًا', 'Last 30 days') }}</option><option value="month">{{ t('الشهر الحالي', 'Current month') }}</option><option value="all">{{ t('كل الوقت', 'All time') }}</option><option value="custom">{{ t('فترة مخصصة', 'Custom period') }}</option></select>
                  @if (profitLossPeriod === 'custom') {
                    <label>{{ t('من', 'From') }}<input #profitLossStartControl="ngModel" type="date" name="profitLossStart" required [attr.aria-invalid]="profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted) ? 'true' : null" [attr.aria-describedby]="profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted) ? 'profit-loss-start-error' : null" [(ngModel)]="profitLossStart">@if (profitLossStartControl.invalid && (profitLossStartControl.touched || profitLossForm.submitted)) { <small id="profit-loss-start-error" class="field-error" role="alert">{{ t('اختر تاريخ البداية.', 'Choose a start date.') }}</small> }</label>
                    <label>{{ t('إلى', 'To') }}<input #profitLossEndControl="ngModel" type="date" name="profitLossEnd" required [attr.aria-invalid]="profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted) ? 'true' : null" [attr.aria-describedby]="profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted) ? 'profit-loss-end-error' : null" [(ngModel)]="profitLossEnd">@if (profitLossEndControl.invalid && (profitLossEndControl.touched || profitLossForm.submitted)) { <small id="profit-loss-end-error" class="field-error" role="alert">{{ t('اختر تاريخ النهاية.', 'Choose an end date.') }}</small> }</label>
                  }
                  <button class="primary" type="submit" [disabled]="reportLoading">{{ reportLoading ? t('جارٍ الحساب…', 'Calculating…') : t('عرض التقرير', 'Run report') }}</button>
                </form>
                @if (reportError) { <aba-state-message kind="error" [description]="reportError" /> }
                @if (profitLoss) {
                  <p class="muted">{{ profitLoss.period.start_date || t('من بداية السجلات', 'From the beginning of records') }} — {{ profitLoss.period.end_date || t('حتى الآن', 'through today') }} · {{ profitLoss.period.timezone || 'UTC' }}</p>
                  <p class="muted"><strong>{{ t('أساس الإيراد:', 'Revenue basis:') }}</strong> {{ revenueBasisLabel(profitLoss.revenue_basis) }}</p>
                  <aba-record-table [ariaLabel]="t('جدول نتيجة التشغيل حسب العملة','Operating result by currency table')" [columns]="profitLossTableColumns" [rows]="profitLossTableRows" [emptyTitle]="t('لا توجد بيانات','No data')" [emptyDescription]="t('لا توجد بيانات مالية للفترة المحددة.','No financial data for this period.')" />
                  <div class="notice"><strong>{{ t('مهم قبل اعتبارها أرباحًا صافية', 'Important limitation') }}</strong><span>{{ t('هذا حساب مبدئي: لا يشمل تكلفة شراء البضاعة لأن تكلفة المنتج غير مرتبطة بعد بالمبيعات، كما أن الإيرادات تُحسب من الفواتير الصادرة لا من النقد المحصّل. لا يتم جمع العملات المختلفة.', 'This is a preliminary result: product purchase costs are not yet linked to sales, and revenue is based on issued invoices rather than cash collected. Different currencies are never combined.') }}</span></div>
                }
                <div class="divider"></div>
                <aba-section-header [level]="3" [title]="t('أعمار المديونيات', 'Receivables aging')" [description]="t('الأرصدة المتبقية حسب تاريخ الاستحقاق، مع فصل كل عملة.', 'Outstanding balances by due date, with currencies kept separate.')" />
                <form #agingForm="ngForm" class="inline-form" (ngSubmit)="agingForm.valid && loadReceivablesAging()"><label>{{ t('التقرير حتى تاريخ', 'Report as of') }}<input #agingAsOfControl="ngModel" type="date" name="agingAsOf" required [attr.aria-invalid]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'true' : null" [attr.aria-describedby]="agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted) ? 'aging-as-of-error' : null" [(ngModel)]="agingAsOf">@if (agingAsOfControl.invalid && (agingAsOfControl.touched || agingForm.submitted)) { <small id="aging-as-of-error" class="field-error" role="alert">{{ t('اختر تاريخ التقرير.', 'Choose a report date.') }}</small> }</label><button class="primary" type="submit" [disabled]="agingLoading">{{ agingLoading ? t('جارٍ التحميل…', 'Loading…') : t('عرض المديونيات', 'Load receivables') }}</button></form>
                @if (agingError) { <aba-state-message kind="error" [description]="agingError" /> }
                @if (agingReport) {
                  <div class="section-head"><p class="muted">{{ t('تاريخ التقرير:', 'As of:') }} {{ agingReport.as_of_date }} · {{ agingReport.invoice_count }} {{ t('فاتورة', 'invoices') }}</p><button class="secondary" type="button" (click)="exportReceivablesAgingCsv()" [disabled]="!agingReport.invoices.length">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                  @for (summary of agingReport.by_currency; track summary.currency_code) {
                    <article class="metric"><span>{{ t('إجمالي المستحق', 'Total outstanding') }} · {{ summary.currency_code }}</span><strong>{{ summary.total_outstanding }} {{ summary.currency_code }}</strong><div class="aging-buckets">@for (bucket of summary.buckets; track bucket.bucket) { <div><small>{{ agingBucketLabel(bucket.bucket) }}</small><strong>{{ bucket.outstanding_amount }} {{ summary.currency_code }}</strong></div> }</div></article>
                  }
                  @if (agingReport.data_quality_warnings.length) {
                    <div class="notice warning-notice"><strong>{{ t('تحذيرات محاسبية تحتاج مراجعة', 'Accounting warnings need review') }}</strong>
                      @for (warning of agingReport.data_quality_warnings; track warning.invoice_id + warning.type) {
                        <p><strong>{{ warning.invoice_number }}</strong> — {{ agingWarningLabel(warning.type) }}</p>
                        @if (warning.excess_allocated) { <p>{{ t('قيمة التخصيص الزائد:', 'Excess allocation:') }} {{ warning.excess_allocated }} {{ warning.invoice_currency || '' }}</p> }
                        @if (warning.mismatched_allocations_amount) { <p>{{ t('تخصيصات بعملة مختلفة:', 'Mismatched-currency allocations:') }} {{ warning.mismatched_allocations_amount }}</p> }
                      }
                    </div>
                  }
                  <aba-record-table [ariaLabel]="t('جدول أعمار المديونيات','Receivables aging table')" [columns]="agingTableColumns" [rows]="agingTableRows" [emptyTitle]="t('لا توجد فواتير مستحقة','No outstanding invoices')" [emptyDescription]="t('لا توجد فواتير مستحقة في تاريخ التقرير.','No outstanding invoices as of the report date.')" />
                  @if (agingReport.limitations.length) { <div class="notice"><strong>{{ t('حدود التقرير', 'Report limitations') }}</strong>@for (limitation of agingReport.limitations; track limitation) { <p>{{ reportLimitationLabel(limitation) }}</p> }</div> }
                }
              </section>
            }

            @if (tab === 'customers') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('قائمة العملاء', 'Customer list') " [description]=" t('تقتصر السجلات على مساحة العمل المحددة.', 'Records are limited to the selected workspace.') "><span class="count">{{ filteredCustomers.length }} / {{ customers.length }} {{ t('عميل', 'customers') }}</span></aba-section-header>
<details class="aba-record-create">
                  <summary><span>{{ t('إضافة عميل جديد', 'Add new customer') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #customerForm="ngForm" class="inline-form" (ngSubmit)="customerForm.valid && createCustomer()">
                  <input #customerNameModel="ngModel" [attr.aria-label]="t('اسم العميل', 'Customer name')" name="customerName" [placeholder]="t('اسم العميل', 'Customer name')" required maxlength="160" [(ngModel)]="customerName" [attr.aria-invalid]="customerNameModel.invalid && (customerNameModel.touched || customerForm.submitted) ? 'true' : null" [attr.aria-describedby]="customerNameModel.invalid && (customerNameModel.touched || customerForm.submitted) ? 'customer-name-error' : null">
                  @if (customerNameModel.invalid && (customerNameModel.touched || customerForm.submitted)) {
                    <small id="customer-name-error" class="field-error" aria-live="polite">{{ t('اسم العميل مطلوب.', 'Customer name is required.') }}</small>
                  }
                  <input #customerEmailModel="ngModel" [attr.aria-label]="t('بريد العميل الإلكتروني', 'Customer email')" name="customerEmail" type="email" maxlength="254" [placeholder]="t('البريد الإلكتروني (اختياري)', 'Email (optional)')" [(ngModel)]="customerEmail" [attr.aria-invalid]="customerEmailModel.invalid && (customerEmailModel.touched || customerForm.submitted) ? 'true' : null" [attr.aria-describedby]="customerEmailModel.invalid && (customerEmailModel.touched || customerForm.submitted) ? 'customer-email-error' : null">
                  @if (customerEmailModel.invalid && (customerEmailModel.touched || customerForm.submitted)) {
                    <small id="customer-email-error" class="field-error" aria-live="polite">{{ t('أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.', 'Enter a valid email address or leave this field blank.') }}</small>
                  }
                  <input [attr.aria-label]="t('هاتف العميل', 'Customer phone')" name="customerPhone" maxlength="32" [placeholder]="t('الهاتف (اختياري)', 'Phone (optional)')" [(ngModel)]="customerPhone">
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة عميل', 'Add customer') }}</button>
                </form>

                  </div>
                </details>
                @if (customerMessage) { <aba-state-message [kind]="customerMessageKind" [description]="customerMessage" /> }
                @if (business?.role === 'owner') { <details class="aba-record-secondary"><summary><span>{{ t('استيراد العملاء من CSV', 'Import customers from CSV') }}</span><span aria-hidden="true">⌄</span></summary><div class="aba-record-secondary__body"><section abaCard class="csv-import-panel" [attr.aria-label]="t('استيراد العملاء من CSV', 'CSV customer import')">
                  <h3>{{ t('استيراد العملاء من CSV', 'Import customers from CSV') }}</h3>
                  <p>{{ t('اختَر ملف CSV يحتوي على name ويمكنه تضمين email وphone وaddress وnotes. المعاينة لا تحفظ أي بيانات.', 'Choose a CSV with name and optional email, phone, address, and notes. Preview does not save data.') }}</p>
                  <input type="file" accept=".csv,text/csv" [attr.aria-label]="t('اختيار ملف CSV للعملاء', 'Choose customer CSV file')" (change)="onCustomerImportFileSelected($event)" [disabled]="customerImportLoading">
                  @if (customerImportFileName) { <small>{{ customerImportFileName }}</small> }
                  <div class="csv-import-actions">
                    <button class="secondary" type="button" (click)="previewCustomerImport()" [disabled]="customerImportLoading || !customerImportCsvText">{{ customerImportLoading ? t('جارٍ المعالجة…', 'Working…') : t('معاينة الملف', 'Preview file') }}</button>
                    @if (customerImportPreview?.valid) { <button class="primary" type="button" (click)="confirmCustomerImport()" [disabled]="customerImportLoading">{{ t('استيراد', 'Import') }} {{ customerImportPreview?.row_count }} {{ t('صف', 'rows') }}</button> }
                  </div>
                  @if (customerImportPreview) {
                    <aba-state-message [kind]="customerImportPreview.valid ? 'info' : 'warning'" [description]="customerImportPreview.valid ? t('الملف صالح. لم يتم حفظ بيانات بعد.', 'File is valid. No data has been saved yet.') + ' · ' + customerImportPreview.row_count + ' ' + t('صف', 'rows') : t('الملف يحتوي على أخطاء؛ أصلحها ثم أعد المعاينة.', 'The file has errors. Fix them and preview again.') + ' · ' + customerImportPreview.row_count + ' ' + t('صف', 'rows')" />
                    @if (customerImportPreview.errors.length) {
                      <ul class="csv-import-errors">
                        @for (item of customerImportPreview.errors; track $index) {
                          <li>{{ t('صف', 'Row') }} {{ item.row }} · {{ item.field }} · {{ importErrorLabel(item.code) }}@if (item.max_length) { ({{ t('الحد الأقصى', 'max') }} {{ item.max_length }}) }</li>
                        }
                      </ul>
                    }
                  }
                  @if (customerImportMessage) { <aba-state-message [kind]="customerImportMessageKind" [description]="customerImportMessage" /> }
                </section></div></details> } @else { <aba-state-message kind="info" [description]="t('استيراد CSV متاح لمالك مساحة العمل فقط.', 'CSV imports are available to workspace owners only.')" /> }
                <div class="list-tools aba-record-toolbar"><input name="customerSearch" type="search" [attr.aria-label]="t('البحث عن عميل', 'Search customers')" [placeholder]="t('ابحث بالاسم أو البريد أو الهاتف…', 'Search by name, email, or phone…')" [(ngModel)]="customerSearch">@if (business?.role === 'owner') { <button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button> }</div>
                <aba-customer-directory [ariaLabel]="t('دليل العملاء', 'Customer directory')" [customers]="filteredCustomers" [locale]="language" [loading]="loading && !customers.length" [loadingDescription]="t('جارٍ تحميل العملاء…', 'Loading customers…')" [emptyTitle]="t('لا يوجد عملاء', 'No customers yet')" [emptyDescription]="customerSearch.trim() ? t('لا توجد نتائج مطابقة للبحث.', 'No customers match this search.') : t('أضف أول عميل لبدء ربطه بالفواتير.', 'Add your first customer to link them with invoices.')" (rowAction)="onCustomerRecordAction($event)" />

                @if (statementVisible) {
                  <section abaCard class="panel statement-panel">
                    <aba-section-header [level]="3" [title]="t('كشف حساب العميل', 'Customer statement') + ' · ' + (customerStatement?.customer?.name || statementCustomerName)" [description]="t('الرصيد مفصول حسب العملة. هذا التقرير لا يستبدل دفتر أستاذ مزدوج القيد.', 'Balances stay separate by currency. This report is not a double-entry general ledger.')"><button class="secondary" type="button" (click)="customerStatement=null; statementVisible=false; statementError=''">{{ t('إغلاق', 'Close') }}</button></aba-section-header>
                    <div class="inline-form statement-filters">
                      <label>{{ t('من تاريخ', 'From date') }}<input type="date" name="statementFromDate" [(ngModel)]="statementFromDate"></label>
                      <label>{{ t('إلى تاريخ', 'To date') }}<input type="date" name="statementToDate" [(ngModel)]="statementToDate"></label>
                      <button class="primary" type="button" (click)="applyCustomerStatementFilters()" [disabled]="statementLoading">{{ t('تطبيق الفترة', 'Apply range') }}</button>
                      <button class="secondary" type="button" (click)="clearCustomerStatementFilters()" [disabled]="statementLoading || (!statementFromDate && !statementToDate)">{{ t('مسح الفترة', 'Clear range') }}</button>
                    </div>
                    @if (statementFromDate || statementToDate) { <p class="muted">{{ t('الرصيد المعروض يجمع الحركات داخل الفترة المحددة فقط، ولا يشمل رصيد ما قبل بدايتها.', 'Displayed balances sum movements inside the selected range only; they do not include the opening balance before the range.') }}</p> }
                    @if (statementLoading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل كشف الحساب…', 'Loading statement…')" /> }
                    @if (statementError) { <aba-state-message kind="error" [description]="statementError" /> }
                    @if (customerStatement) {
                      <div class="metric-grid">@for (entry of statementBalanceEntries; track entry.currency) { <article class="metric"><span>{{ t('الرصيد', 'Balance') }} · {{ entry.currency }}</span><strong>{{ entry.balance }} {{ entry.currency }}</strong></article> }</div>
                      <aba-record-table [ariaLabel]="t('كشف حساب العميل','Customer statement')" [columns]="customerStatementTableColumns" [rows]="customerStatementTableRows" [emptyTitle]="t('لا توجد حركات','No statement activity')" [emptyDescription]="t('لا توجد حركات مطابقة للفترة المحددة.','No statement activity matches the selected period.')" />
                      <div class="inline-form"><span class="muted">{{ statementOffset + 1 }}–{{ statementOffset + customerStatement.items.length }} / {{ customerStatement.total }}</span><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset > 50 ? statementOffset - 50 : 0)" [disabled]="statementLoading || statementOffset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset + 50)" [disabled]="statementLoading || statementOffset + customerStatement.items.length >= customerStatement.total">{{ t('التالي', 'Next') }}</button></div>
                      @for (limitation of customerStatement.limitations; track limitation) { <p class="muted">• {{ limitation }}</p> }
                    }
                  </section>
                }
          </section>
            }

            @if (tab === 'products') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('المنتجات والخدمات', 'Products & services') " [description]=" t('يتم حفظ الأسعار بدقة عشرية.', 'Prices are stored using decimal precision.') "><span class="count">{{ filteredProducts.length }} / {{ products.length }} {{ t('منتج', 'products') }}</span></aba-section-header>
<details class="aba-record-create">
                  <summary><span>{{ t('إضافة منتج أو خدمة', 'Add product or service') }}</span><span class="aba-record-create__icon" aria-hidden="true">＋</span></summary>
                  <div class="aba-record-create__body">
                <form #productForm="ngForm" class="inline-form" (ngSubmit)="productForm.valid && createProduct()">
                  <label>{{ t('اسم المنتج', 'Product name') }}<input #productNameModel="ngModel" [attr.aria-label]="t('اسم المنتج', 'Product name')" name="productName" [placeholder]="t('اسم المنتج', 'Product name')" required [(ngModel)]="productName" [attr.aria-invalid]="productNameModel.invalid && (productNameModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productNameModel.invalid && (productNameModel.touched || productForm.submitted) ? 'product-name-error' : null">
                    @if (productNameModel.invalid && (productNameModel.touched || productForm.submitted)) {
                      <small id="product-name-error" class="field-error" aria-live="polite">{{ t('اسم المنتج مطلوب.', 'Product name is required.') }}</small>
                    }
                  </label>
                  <label>{{ t('سعر الوحدة', 'Unit price') }}<input #productPriceModel="ngModel" [attr.aria-label]="t('سعر الوحدة', 'Unit price')" name="productPrice" type="number" min="0" step="0.01" [placeholder]="t('سعر الوحدة', 'Unit price')" required [(ngModel)]="productPrice" [attr.aria-invalid]="productPriceModel.invalid && (productPriceModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productPriceModel.invalid && (productPriceModel.touched || productForm.submitted) ? 'product-price-error' : null">
                    @if (productPriceModel.invalid && (productPriceModel.touched || productForm.submitted)) {
                      <small id="product-price-error" class="field-error" aria-live="polite">{{ productPriceModel.errors?.['required'] ? t('سعر الوحدة مطلوب.', 'Unit price is required.') : t('أدخل سعرًا صحيحًا لا يقل عن صفر.', 'Enter a valid unit price of zero or more.') }}</small>
                    }
                  </label>
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> {{ t('متابعة المخزون', 'Track stock') }}</label>
                  @if (stockTracked) {
                    @if (business?.role === 'owner') {
                      <label>{{ t('الكمية الافتتاحية بالمخزن', 'Opening stock quantity') }}<input #productOpeningQuantityModel="ngModel" name="productOpeningQuantity" type="number" min="0" step="0.001" [(ngModel)]="productOpeningQuantity" required [attr.aria-invalid]="productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted) ? 'true' : null" [attr.aria-describedby]="productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted) ? 'product-opening-quantity-error' : null">@if (productOpeningQuantityModel.invalid && (productOpeningQuantityModel.touched || productForm.submitted)) { <small id="product-opening-quantity-error" class="field-error" aria-live="polite">{{ productOpeningQuantityModel.errors?.['required'] ? t('الكمية الافتتاحية مطلوبة عند متابعة المخزون.', 'Opening quantity is required when stock tracking is enabled.') : t('أدخل كمية لا تقل عن صفر.', 'Enter a quantity of zero or more.') }}</small> }</label>
                    } @else {
                      <small class="muted">{{ t('يمكنك متابعة المخزون برصيد افتتاحي صفر. تسجيل كمية افتتاحية أكبر من صفر متاح لمالك مساحة العمل فقط.', 'You can track stock with zero opening stock. Only workspace owners can set a positive opening stock quantity.') }}</small>
                    }
                  }
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة منتج', 'Add product') }}</button>
                </form>

                  </div>
                </details>
                @if (productMessage) { <aba-state-message [kind]="productMessageKind" [description]="productMessage" /> }
                @if (business?.role === 'owner') { <details class="aba-record-secondary"><summary><span>{{ t('استيراد المنتجات من CSV', 'Import products from CSV') }}</span><span aria-hidden="true">⌄</span></summary><div class="aba-record-secondary__body"><section abaCard class="csv-import-panel" [attr.aria-label]="t('استيراد المنتجات من CSV', 'CSV product import')">
                  <h3>{{ t('استيراد المنتجات من CSV', 'Import products from CSV') }}</h3>
                  <p>{{ t('اختَر ملف CSV يحتوي على sku وname وunit_price. المعاينة لا تحفظ أي بيانات.', 'Choose a CSV with sku, name and unit_price. Preview does not save any data.') }}</p>
                  <input type="file" accept=".csv,text/csv" [attr.aria-label]="t('اختيار ملف CSV', 'Choose CSV file')" (change)="onImportFileSelected($event)" [disabled]="importLoading">
                  @if (importFileName) { <small>{{ importFileName }}</small> }
                  <div class="csv-import-actions">
                    <button class="secondary" type="button" (click)="previewProductImport()" [disabled]="importLoading || !importCsvText">{{ importLoading ? t('جارٍ المعالجة…', 'Working…') : t('معاينة الملف', 'Preview file') }}</button>
                    @if (importPreview?.valid) { <button class="primary" type="button" (click)="confirmProductImport()" [disabled]="importLoading">{{ t('استيراد', 'Import') }} {{ importPreview?.row_count }} {{ t('صف', 'rows') }}</button> }
                  </div>
                  @if (importPreview) {
                    <aba-state-message [kind]="importPreview.valid ? 'info' : 'warning'" [description]="importPreview.valid ? t('الملف صالح. لم يتم حفظ بيانات بعد.', 'File is valid. No data has been saved yet.') + ' · ' + importPreview.row_count + ' ' + t('صف', 'rows') : t('الملف يحتوي على أخطاء؛ أصلحها ثم أعد المعاينة.', 'The file has errors. Fix them and preview again.') + ' · ' + importPreview.row_count + ' ' + t('صف', 'rows')" />
                    @if (importPreview.errors.length) {
                      <ul class="csv-import-errors">
                        @for (item of importPreview.errors; track $index) {
                          <li>{{ t('صف', 'Row') }} {{ item.row }} · {{ item.field }} · {{ importErrorLabel(item.code) }}@if (item.first_row) { ({{ t('أول ظهور في الصف', 'first seen on row') }} {{ item.first_row }}) }@if (item.max_length) { ({{ t('الحد الأقصى', 'max') }} {{ item.max_length }}) }</li>
                        }
                      </ul>
                    }
                  }
                  @if (importMessage) { <aba-state-message [kind]="importMessageKind" [description]="importMessage" /> }
                </section></div></details> } @else { <aba-state-message kind="info" [description]="t('استيراد CSV متاح لمالك مساحة العمل فقط.', 'CSV imports are available to workspace owners only.')" /> }
                <div class="list-tools aba-record-toolbar"><input name="productSearch" type="search" [attr.aria-label]="t('البحث عن منتج', 'Search products')" [placeholder]="t('ابحث عن منتج أو رمز SKU…', 'Search products or SKU…')" [(ngModel)]="productSearch">@if (business?.role === 'owner') { <button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button> }</div>
                <aba-product-catalog [ariaLabel]="t('كتالوج المنتجات والمخزون', 'Product and inventory catalogue')" [products]="filteredProducts" [locale]="language" [currencyCode]="business?.currency_code || ''" [loading]="loading && !products.length" [loadingDescription]="t('جارٍ تحميل المنتجات…', 'Loading products…')" [emptyTitle]="t('لا توجد منتجات', 'No products yet')" [emptyDescription]="productSearch.trim() ? t('لا توجد نتائج مطابقة للبحث.', 'No products match this search.') : t('أضف منتجًا أو خدمة لبدء إدارة الكتالوج والمخزون.', 'Add a product or service to start managing the catalogue and stock.')" />

            </section>
            }

            @if (tab === 'invoices') {
              <section abaCard class="panel">
                <aba-section-header id="invoices-section-heading" tabindex="-1" [title]=" t('المبيعات والفواتير', 'Sales & invoices') " [description]=" t('كل فاتورة صادرة مرتبطة بعميل؛ اختر العميل لعرض فواتيره.', 'Every issued invoice is linked to a customer; filter by customer to view their invoices.') "><span class="count">{{ filteredInvoices.length }} / {{ invoices.length }} {{ t('فاتورة', 'invoices') }}</span></aba-section-header>
                <div class="invoice-toolbar">
                  @if (invoiceCreateOpen) {
                    <section class="invoice-create-panel" [attr.aria-label]="t('نموذج إضافة فاتورة', 'Add invoice editor')">
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
                      {{ t('إضافة فاتورة جديدة', 'Create a new invoice') }}
                    </button>
                  }
                </div>
                @if (invoiceMessage) { <aba-state-message [kind]="invoiceMessageKind" [description]="invoiceMessage" /> }
                <div class="invoice-controls">
                  <label class="invoice-search">
                    <svg class="invoice-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                    <input name="invoiceSearch" type="search" [attr.aria-label]="t('البحث باسم العميل أو رقم الفاتورة', 'Search by customer name or invoice number')" [placeholder]="t('ابحث باسم العميل أو رقم الفاتورة…', 'Search customer or invoice number…')" [(ngModel)]="invoiceSearch">
                  </label>
                  <label class="invoice-filter"><span>{{ t('الحالة', 'Status') }}</span>
                    <select name="invoiceStatusFilter" [attr.aria-label]="t('تصفية حسب حالة الفاتورة', 'Filter by invoice status')" [(ngModel)]="invoiceStatusFilter">
                      <option value="all">{{ t('كل الحالات', 'All statuses') }}</option>
                      <option value="draft">{{ t('مسودة', 'Draft') }}</option>
                      <option value="issued">{{ t('صادرة', 'Issued') }}</option>
                      <option value="void">{{ t('ملغاة', 'Voided') }}</option>
                    </select>
                  </label>
                  <label class="invoice-filter"><span>{{ t('العميل', 'Customer') }}</span>
                    <select name="invoiceFilterCustomer" [attr.aria-label]="t('تصفية الفواتير حسب العميل', 'Filter invoices by customer')" [(ngModel)]="invoiceFilterCustomerId">
                      <option value="">{{ t('كل العملاء', 'All customers') }}</option>
                      @for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }
                    </select>
                  </label>
                  @if (customersHasMore) {
                    <button class="secondary invoice-load-more-customers" type="button" (click)="loadMoreInvoiceCustomers()" [disabled]="customersLoadingMore">
                      {{ customersLoadingMore ? t('جارٍ تحميل العملاء…', 'Loading customers…') : t('تحميل 100 عميل إضافي للبحث', 'Load 100 more customers to search') }}
                    </button>
                  }
                  @if (business?.role === 'owner') { <button class="secondary invoice-export" type="button" (click)="exportCurrentList()" [disabled]="!filteredInvoices.length">{{ t('تصدير CSV', 'Export CSV') }}</button> }
                </div>
                @if (loading && !invoices.length) {
                  <p class="invoice-list-state" role="status" aria-live="polite">{{ t('جارٍ تحميل الفواتير…', 'Loading invoices…') }}</p>
                } @else if (error && !invoices.length) {
                  <aba-state-message kind="error" [description]="error" />
                } @else if (!filteredInvoices.length) {
                  <aba-state-message kind="empty" [description]="(invoiceSearch || invoiceStatusFilter !== 'all' || invoiceFilterCustomerId) ? t('لا توجد فواتير مطابقة للبحث والفلاتر.', 'No invoices match your search and filters.') : t('لا توجد فواتير بعد. أضف عميلًا ومنتجًا ثم أنشئ مسودة فاتورتك الأولى.', 'No invoices yet. Add a customer and product, then create your first invoice draft.')" />
                } @else {
                  <div class="invoice-cards">
                    @for (invoice of filteredInvoices; track invoice.id) {
                      <article class="invoice-card">
                        <header class="invoice-card-header">
                          <div class="invoice-card-customer">
                            <span class="invoice-customer-avatar" aria-hidden="true">{{ customerInitialForInvoice(invoice.customer_id) }}</span>
                            <div class="invoice-card-customer-copy">
                              <strong>{{ customerNameForInvoice(invoice.customer_id) }}</strong>
                              <small class="invoice-card-meta">{{ invoice.invoice_number }} · {{ invoice.issue_date ? (invoice.issue_date | date:'mediumDate') : (invoice.created_at ? t('تاريخ الإنشاء: ', 'Created: ') + (invoice.created_at | date:'mediumDate') : t('التاريخ غير متاح', 'Date unavailable')) }} · <bdi dir="ltr">{{ invoice.currency_code }}</bdi></small>
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
                            <small>{{ t('الإجمالي', 'Total') }}</small>
                            <strong><bdi dir="ltr">{{ invoice.total | number:'1.2-2' }}</bdi></strong>
                          </div>
                          <div>
                            <small>{{ t('المدفوع', 'Paid') }}</small>
                            <strong>@if (invoice.allocated_payments !== undefined) {
                              <bdi dir="ltr">{{ invoice.allocated_payments | number:'1.2-2' }}</bdi>
                            } @else { — }</strong>
                          </div>
                          <div>
                            <small>{{ t('المتبقي', 'Remaining') }}</small>
                            <strong>@if (invoice.status === 'issued' && invoice.outstanding_amount !== undefined) {
                              <bdi dir="ltr">{{ invoice.outstanding_amount | number:'1.2-2' }}</bdi>
                            } @else { — }</strong>
                          </div>
                        </div>
                        @if (invoicePaymentProgress(invoice) !== null) {
                          <div class="invoice-payment-progress"
                            [class.tone-paid]="invoicePaymentTone(invoice) === 'paid'"
                            [class.tone-partial]="invoicePaymentTone(invoice) === 'partial'"
                            [class.tone-unpaid]="invoicePaymentTone(invoice) === 'unpaid'"
                            role="progressbar"
                            [attr.aria-label]="t('نسبة سداد الفاتورة', 'Invoice payment progress')"
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
                            <button class="secondary" type="button" (click)="editInvoice(invoice)" [disabled]="loading">{{ t('تعديل', 'Edit') }}</button>
                            @if (business?.role === 'owner') {
                              <button class="secondary" type="button" (click)="issueInvoice(invoice)" [disabled]="loading">{{ t('إصدار', 'Issue') }}</button>
                              <button class="secondary danger" type="button" (click)="requestInvoiceVoid(invoice, $event)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button>
                            }
                          } @else if (invoice.status === 'issued') {
                            <button class="secondary" type="button" (click)="printInvoice(invoice)" [disabled]="loading">{{ t('طباعة', 'Print') }}</button>
                            @if (business?.role === 'owner') {
                              @if (hasOutstandingBalance(invoice)) { <button class="secondary" type="button" (click)="payInvoice(invoice)" [disabled]="loading">{{ t('سداد', 'Pay') }}</button> }
                              <button class="secondary danger" type="button" (click)="requestInvoiceVoid(invoice, $event)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button>
                            }
                          }
                        </div>
                      </article>
                    }
                  </div>
                }
                @if (invoicesHasMore) { <button class="secondary" type="button" (click)="loadMoreInvoices()" [disabled]="invoicesLoadingMore">{{ invoicesLoadingMore ? t('جارٍ تحميل المزيد…', 'Loading more…') : t('تحميل فواتير إضافية', 'Load more invoices') }}</button> }
                <p class="footnote">{{ t('إصدار الفاتورة يخصم المخزون المتابع بشكل ذري، ويرفض العملية إذا كانت الكمية غير كافية.', 'Issuing an invoice deducts tracked stock atomically and rejects the operation if stock is insufficient.') }}</p>
              </section>
            }

            @if (tab === 'payments' && business?.role !== 'owner') {
              <section abaCard class="panel"><aba-state-message kind="error" [description]="t('تسجيل المدفوعات متاح لمالك مساحة العمل فقط. اطلب من المالك منحك الصلاحية المناسبة.', 'Recording payments is restricted to workspace owners. Ask the owner to grant the appropriate access.')" /></section>
            }
            @if (tab === 'payments' && business.role === 'owner') {
              <section abaCard class="panel"><aba-section-header [title]="t('تسجيل دفعة', 'Record payment')" [description]="t('سجّل المبلغ المستلم، ويمكنك تخصيصه لفاتورة صادرة.', 'Record the amount received and optionally allocate it to an issued invoice.')">
                  <div class="section-actions"><span class="count">{{ filteredPayments.length }} / {{ payments.length }} {{ t('دفعة', 'payments') }}</span><button class="secondary" type="button" (click)="exportPaymentsCsv()" [disabled]="!payments.length">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                </aba-section-header>
                <form #paymentForm="ngForm" class="inline-form payment-form" (ngSubmit)="(paymentRetryPending || paymentForm.valid) && createPayment()">
                  <input #paymentAmountModel="ngModel" [attr.aria-label]="t('مبلغ الدفعة', 'Payment amount')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المستلم', 'Amount received')" required [(ngModel)]="paymentAmount" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted) ? 'payment-amount-error' : null">@if (paymentAmountModel.invalid && (paymentAmountModel.touched || paymentForm.submitted)) { <small id="payment-amount-error" class="field-error" aria-live="polite">{{ t('أدخل مبلغًا صحيحًا أكبر من صفر وبمنزلتين عشريتين كحد أقصى.', 'Enter a positive amount with no more than two decimal places.') }}</small> }
                  <select #paymentCustomerModel="ngModel" [attr.aria-label]="t('عميل الدفعة', 'Payment customer')" name="paymentCustomer" required [(ngModel)]="paymentCustomerId" [disabled]="paymentRetryPending" [attr.aria-invalid]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'true' : null" [attr.aria-describedby]="paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted) ? 'payment-customer-error' : null"><option value="" disabled>{{ t('اختر العميل', 'Choose customer') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select>@if (paymentCustomerModel.invalid && (paymentCustomerModel.touched || paymentForm.submitted)) { <small id="payment-customer-error" class="field-error" aria-live="polite">{{ t('اختيار العميل مطلوب.', 'Choose a customer.') }}</small> }
                  <select [attr.aria-label]="t('طريقة الدفع', 'Payment method')" name="paymentMethod" [(ngModel)]="paymentMethod" [disabled]="paymentRetryPending"><option value="cash">{{ t('نقدًا', 'Cash') }}</option><option value="bank_transfer">{{ t('تحويل بنكي', 'Bank transfer') }}</option><option value="card">{{ t('بطاقة', 'Card') }}</option><option value="wallet">{{ t('محفظة إلكترونية', 'E-wallet') }}</option><option value="other">{{ t('أخرى', 'Other') }}</option></select>
                  <select [attr.aria-label]="t('الفاتورة المراد تخصيص الدفعة لها', 'Invoice to allocate payment to')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId" [disabled]="paymentRetryPending" (ngModelChange)="syncPaymentCustomer()"><option value="">{{ t('عدم تخصيص الدفعة الآن', 'Do not allocate yet') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (invoicesHasMore) { <button type="button" class="secondary" (click)="loadMoreInvoices()" [disabled]="invoicesLoadingMore || paymentRetryPending">{{ invoicesLoadingMore ? t('جارٍ تحميل المزيد…', 'Loading more…') : t('تحميل فواتير إضافية', 'Load more invoices') }}</button> }
                  @if (paymentInvoiceId) { <input [attr.aria-label]="t('المبلغ المراد تخصيصه', 'Amount to allocate')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المخصص للفاتورة', 'Amount allocated to invoice')" [(ngModel)]="paymentAllocationAmount" [disabled]="paymentRetryPending"> }
                  <input [attr.aria-label]="t('مرجع الدفعة', 'Payment reference')" name="paymentReference" maxlength="128" [placeholder]="t('المرجع (اختياري)', 'Reference (optional)')" [(ngModel)]="paymentReference" [disabled]="paymentRetryPending">
                  <button class="primary" type="submit" [disabled]="paymentLoading">{{ paymentLoading ? t('جارٍ التسجيل…', 'Recording…') : paymentRetryPending ? t('إعادة المحاولة بنفس الدفعة', 'Retry same payment') : t('تسجيل دفعة', 'Record payment') }}</button>
                </form>
                @if (paymentRetryPending) { <p class="footnote" role="status">{{ t('هناك محاولة دفع نتيجتها غير مؤكدة. لا تغيّر البيانات؛ استخدم زر إعادة المحاولة بنفس الطلب.', 'A previous payment attempt has an uncertain outcome. Do not change its details; use Retry same payment.') }}</p> }
                @if (paymentMessage) { <aba-state-message [kind]="paymentMessageKind" [description]="paymentMessage" /> }
                <p class="footnote">{{ t('العملة المحددة هي', 'The selected currency is') }} {{ business.currency_code }} {{ t('لمساحة العمل دي. يتحقق النظام من المبلغ المخصص مقارنة بالرصيد المستحق، وتظل المبالغ غير المخصصة مسجلة كمدفوعات مستلمة.', 'for this workspace. Allocations are checked against the outstanding balance, and unallocated amounts remain recorded as received payments.') }}</p>
                <div class="list-tools operations-search aba-record-toolbar"><input name="paymentSearch" type="search" [attr.aria-label]="t('البحث في المدفوعات', 'Search payments')" [placeholder]="t('ابحث بالعميل أو المرجع أو طريقة الدفع أو حالة التخصيص…', 'Search by customer, reference, method or allocation state…')" [(ngModel)]="paymentSearch"></div>
                <aba-record-table [ariaLabel]="t('جدول المدفوعات','Payments table')" [columns]="paymentTableColumns" [rows]="paymentTableRows" [loading]="paymentLoading && !payments.length" [loadingDescription]="t('جارٍ تحميل المدفوعات…', 'Loading payments…')" [emptyTitle]="t('لا توجد مدفوعات','No payments yet')" [emptyDescription]="paymentSearch.trim() ? t('لا توجد دفعات مطابقة للبحث.','No payments match this search.') : t('لا توجد دفعات مسجلة حتى الآن.','No payments have been recorded yet.')" />
                @if (paymentsHasMore) { <button class="secondary" type="button" (click)="loadMorePayments()" [disabled]="paymentsLoadingMore">{{ paymentsLoadingMore ? t('جارٍ تحميل المزيد…', 'Loading more…') : t('تحميل دفعات إضافية', 'Load more payments') }}</button> }
              </section>
            }

            @if (tab === 'taxes' && business.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('ملخص الضرائب', 'Tax summary')" [description]="t('يعرض الضرائب المحفوظة على الفواتير الصادرة مع فصل كل عملة.', 'Shows saved tax totals on issued invoices, separated by currency.')" />
                <form class="inline-form" (ngSubmit)="loadTaxSummary()">
                  <label>{{ t('من تاريخ', 'Start date') }}<input name="taxStartDate" type="date" [(ngModel)]="taxStartDate"></label>
                  <label>{{ t('إلى تاريخ', 'End date') }}<input name="taxEndDate" type="date" [(ngModel)]="taxEndDate"></label>
                  <button class="primary" type="submit" [disabled]="taxLoading">{{ taxLoading ? t('جارٍ الحساب…', 'Calculating…') : t('عرض التقرير', 'Run report') }}</button>
                </form>
                @if (taxError) { <aba-state-message kind="error" [description]="taxError" /> }
                @if (taxSummaryReport) {
                  <aba-record-table [ariaLabel]="t('ملخص الضرائب حسب العملة','Tax summary by currency')" [columns]="taxTableColumns" [rows]="taxTableRows" [emptyTitle]="t('لا توجد بيانات ضريبية','No tax data')" [emptyDescription]="t('لا توجد فواتير صادرة في الفترة المحددة.','No issued invoices in the selected period.')" />
                  @for (limitation of taxSummaryReport.limitations; track limitation) { <p class="muted">• {{ reportLimitationLabel(limitation) }}</p> }
                }
              </section>
            }

            @if (tab === 'audit') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('سجل العمليات', 'Activity log')" [description]="t('سجل قراءة فقط للأحداث المسجلة في مساحة العمل الحالية.', 'Read-only history of recorded events in the current workspace.')"><span class="count">{{ auditTotal }} {{ t('حدث', 'events') }}</span></aba-section-header>
                 <form class="inline-form" (ngSubmit)="loadAuditEvents(0)">
                  <label>{{ t('نوع العملية', 'Action') }}<select name="auditAction" [(ngModel)]="auditAction">
                    <option value="">{{ t('كل العمليات', 'All actions') }}</option>
                    <option value="invoice.issued">{{ t('إصدار فاتورة', 'Invoice issued') }}</option>
                    <option value="invoice.created">{{ t('إنشاء فاتورة', 'Invoice created') }}</option>
                    <option value="invoice.draft_updated">{{ t('تعديل مسودة فاتورة', 'Invoice draft updated') }}</option>
                    <option value="invoice.voided">{{ t('إلغاء فاتورة', 'Invoice voided') }}</option>
                    <option value="payment.recorded">{{ t('تسجيل دفعة', 'Payment recorded') }}</option>
                    <option value="expense.created">{{ t('تسجيل مصروف', 'Expense recorded') }}</option>
                    <option value="customer.created">{{ t('إضافة عميل', 'Customer created') }}</option>
                    <option value="product.created">{{ t('إضافة منتج', 'Product created') }}</option>
                    <option value="stock.movement_recorded">{{ t('تسجيل حركة مخزون', 'Stock movement recorded') }}</option>
                    <option value="supplier.created">{{ t('إضافة مورد', 'Supplier created') }}</option>
                    <option value="customer.updated">{{ t('تعديل بيانات عميل', 'Customer updated') }}</option>
                    <option value="customer.deactivated">{{ t('تعطيل عميل', 'Customer deactivated') }}</option>
                    <option value="product.updated">{{ t('تعديل منتج', 'Product updated') }}</option>
                    <option value="product.deactivated">{{ t('تعطيل منتج', 'Product deactivated') }}</option>
                    <option value="purchase_order.created">{{ t('إنشاء أمر شراء', 'Purchase order created') }}</option>
                    <option value="purchase_order.approved">{{ t('اعتماد أمر شراء', 'Purchase order approved') }}</option>
                    <option value="purchase_order.received">{{ t('استلام أمر شراء', 'Purchase order received') }}</option>
                    <option value="sales_return.created">{{ t('تسجيل مرتجع بيع', 'Sales return created') }}</option>
                    <option value="sales_return.approved">{{ t('اعتماد مرتجع بيع', 'Sales return approved') }}</option>
                    <option value="recurring_invoice_schedule.created">{{ t('إنشاء جدول فاتورة دورية', 'Recurring invoice schedule created') }}</option>
                    <option value="data_import.completed">{{ t('اكتمال استيراد البيانات', 'Data import completed') }}</option>
                    <option value="pricing_rule.created">{{ t('إنشاء قاعدة تسعير', 'Pricing rule created') }}</option>
                  </select></label>
                  <label>{{ t('نوع السجل', 'Target type') }}<select name="auditTarget" [(ngModel)]="auditTargetType">
                    <option value="">{{ t('كل السجلات', 'All record types') }}</option>
                    <option value="invoice">{{ t('فاتورة', 'Invoice') }}</option>
                    <option value="payment">{{ t('دفعة', 'Payment') }}</option>
                    <option value="expense">{{ t('مصروف', 'Expense') }}</option>
                    <option value="customer">{{ t('عميل', 'Customer') }}</option>
                    <option value="product">{{ t('منتج', 'Product') }}</option>
                    <option value="business">{{ t('نشاط تجاري', 'Business') }}</option>
                    <option value="supplier">{{ t('مورد', 'Supplier') }}</option>
                    <option value="stock_movement">{{ t('حركة مخزون', 'Stock movement') }}</option>
                    <option value="purchase_order">{{ t('أمر شراء', 'Purchase order') }}</option>
                    <option value="sales_return">{{ t('مرتجع بيع', 'Sales return') }}</option>
                    <option value="recurring_invoice_schedule">{{ t('جدول فاتورة دورية', 'Recurring invoice schedule') }}</option>
                    <option value="import_job">{{ t('عملية استيراد', 'Import job') }}</option>
                    <option value="pricing_rule">{{ t('قاعدة تسعير', 'Pricing rule') }}</option>
                  </select></label>
                  <button class="primary" type="submit" [disabled]="auditLoading">{{ t('تصفية', 'Filter') }}</button>
                  <button class="secondary" type="button" (click)="auditAction=''; auditTargetType=''; loadAuditEvents(0)" [disabled]="auditLoading">{{ t('مسح الفلاتر', 'Clear filters') }}</button>
                </form>
                @if (auditError) { <aba-state-message kind="error" [description]="auditError" /> }
                <aba-record-table [ariaLabel]="t('جدول سجل العمليات','Activity log table')" [columns]="auditTableColumns" [rows]="auditTableRows" [loading]="auditLoading && !auditEvents.length" [loadingDescription]="t('جارٍ تحميل سجل النشاط…', 'Loading activity log…')" [emptyTitle]="t('لا توجد أحداث','No activity yet')" [emptyDescription]="t('لا توجد أحداث مطابقة للفلاتر.','No events match these filters.')" />
                <div class="inline-form"><span class="muted">{{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} / {{ auditTotal }}</span><button class="secondary" type="button" (click)="loadAuditEvents((auditOffset > 50 ? auditOffset - 50 : 0))" [disabled]="auditLoading || auditOffset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadAuditEvents(auditOffset + 50)" [disabled]="auditLoading || auditOffset + auditEvents.length >= auditTotal">{{ t('التالي', 'Next') }}</button></div>
              </section>
            }

            @if (tab === 'release-guide') {
              @defer (when tab === 'release-guide') {
                <aba-release-guide [language]="language" [appVersion]="appVersion" />
              } @placeholder {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="loading" [description]="t('جارٍ تحميل دليل التطبيق…', 'Loading the app guide…')" />
                </section>
              }
            }

            @if (tab === 'employees' && business.role === 'owner') {
              @defer (when tab === 'employees' && business.role === 'owner') {
                <aba-employee-payroll [businessId]="business.id" [currencyCode]="business.currency_code" [language]="language" (payrollPaid)="refreshAfterPayrollPayment()"></aba-employee-payroll>
              } @placeholder {
                <section abaCard class="panel narrow">
                  <aba-state-message kind="loading" [description]="t('جارٍ تحميل الموظفين والمرتبات…', 'Loading employees & payroll…')" />
                </section>
              }
            }

            @if (tab === 'expenses') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('تسجيل مصروف', 'Record an expense')" [description]="t('سجّل مصروفات النشاط مع التصنيف والتاريخ والعملة.', 'Track business spending with a clear category, date and currency.')" [count]="filteredExpenses.length + ' / ' + expenses.length + ' ' + t('مصروفات', 'expenses')" />
                <form #expenseForm="ngForm" class="inline-form expense-form" (ngSubmit)="expenseForm.valid && createExpense()">
                  <label class="expense-category-field">{{ t('تصنيف المصروف', 'Expense category') }}<select #expenseCategoryControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('تصنيف المصروف', 'Expense category')" [attr.aria-invalid]="expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted) ? 'expense-category-error' : null" name="expenseCategory" required [(ngModel)]="expenseCategory">
                    <option value="General">{{ t('عام', 'General') }}</option>
                    <option value="Supplies">{{ t('مستلزمات', 'Supplies') }}</option>
                    <option value="Rent">{{ t('إيجار', 'Rent') }}</option>
                    <option value="Utilities">{{ t('مرافق وفواتير', 'Utilities') }}</option>
                    <option value="Transport">{{ t('نقل ومواصلات', 'Transport') }}</option>
                    <option value="Marketing">{{ t('تسويق', 'Marketing') }}</option>
                    <option value="Payroll">{{ t('رواتب', 'Payroll') }}</option>
                    <option value="Maintenance">{{ t('صيانة', 'Maintenance') }}</option>
                    <option value="Other">{{ t('أخرى', 'Other') }}</option>
                  </select></label>
                  <input #expenseDescriptionControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('وصف المصروف', 'Expense description')" [attr.aria-invalid]="expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted) ? 'expense-description-error' : null" name="expenseDescription" maxlength="500" [placeholder]="t('الوصف', 'Description')" required [(ngModel)]="expenseDescription">
                  <input #expenseAmountControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('مبلغ المصروف', 'Expense amount')" [attr.aria-invalid]="expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted) ? 'expense-amount-error' : null" name="expenseAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ', 'Amount')" required [(ngModel)]="expenseAmount">
                  <input #expenseDateControl="ngModel" [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('تاريخ ووقت المصروف', 'Expense date and time')" [attr.aria-invalid]="expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted) ? 'true' : null" [attr.aria-describedby]="expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted) ? 'expense-date-error' : null" name="expenseDate" type="datetime-local" required [(ngModel)]="expenseDate">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('المورد', 'Vendor')" name="expenseVendor" maxlength="160" [placeholder]="t('المورد (اختياري)', 'Vendor (optional)')" [(ngModel)]="expenseVendor">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('مرجع المصروف', 'Expense reference')" name="expenseReference" maxlength="128" [placeholder]="t('المرجع (اختياري)', 'Reference (optional)')" [(ngModel)]="expenseReference">
                  <button class="primary" type="submit" [disabled]="loading || expenseSubmissionUncertain">{{ t('حفظ المصروف', 'Save expense') }}</button>
                </form>
                @if ((expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted)) || (expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted)) || (expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted)) || (expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted))) {
                  <div class="expense-validation" aria-live="polite">
                    @if (expenseCategoryControl.invalid && (expenseCategoryControl.touched || expenseForm.submitted)) { <small id="expense-category-error" class="field-error">{{ t('اختر تصنيف المصروف.', 'Choose an expense category.') }}</small> }
                    @if (expenseDescriptionControl.invalid && (expenseDescriptionControl.touched || expenseForm.submitted)) { <small id="expense-description-error" class="field-error">{{ t('اكتب وصف المصروف (بحد أقصى 500 حرف).', 'Enter an expense description (up to 500 characters).') }}</small> }
                    @if (expenseAmountControl.invalid && (expenseAmountControl.touched || expenseForm.submitted)) { <small id="expense-amount-error" class="field-error">{{ t('أدخل مبلغًا أكبر من صفر وبحد أقصى منزلتين عشريتين.', 'Enter an amount greater than zero with up to two decimal places.') }}</small> }
                    @if (expenseDateControl.invalid && (expenseDateControl.touched || expenseForm.submitted)) { <small id="expense-date-error" class="field-error">{{ t('اختر تاريخ ووقت المصروف.', 'Choose the expense date and time.') }}</small> }
                  </div>
                }
                <p class="expense-cash-semantics">{{ t('تسجيل المصروف يوثق وقت تحمّله، ولا يعني أنه تم دفعه أو تسويته نقديًا.', 'Recording an expense captures when it was incurred; it does not confirm that cash was paid or settled.') }}</p>
                <p class="footnote">{{ t('العملة مرتبطة بمساحة العمل الحالية:', 'Currency follows the current workspace:') }} {{ business.currency_code }}. {{ t('تُحتسب المصروفات في التقارير المتاحة ولا تُحسب تكلفة البضاعة تلقائيًا.', 'Expenses appear in available reports and are not automatically treated as cost of goods.') }}</p>
                @if (expenseMessage) { <aba-state-message kind="success" [description]="expenseMessage" /> }
                @if (expenseSubmissionUncertain) {
                  <aba-state-message kind="error" [description]="t('تعذر تأكيد نتيجة الحفظ. لا تعِد الإرسال قبل تحديث القائمة ومراجعتها.', 'The save result is uncertain. Refresh and review the list before trying again.')" [actionLabel]="t('فحص قائمة المصروفات', 'Check expense list')" [actionDisabled]="loading" (action)="checkExpenseSubmissionOutcome()" />
                }
                <div class="list-tools operations-search aba-record-toolbar"><input name="expenseSearch" type="search" [attr.aria-label]="t('البحث في المصروفات', 'Search expenses')" [placeholder]="t('ابحث بالتصنيف أو الوصف أو المورد أو المرجع…', 'Search by category, description, vendor or reference…')" [(ngModel)]="expenseSearch"></div>
                <aba-record-table [ariaLabel]="t('جدول المصروفات','Expenses table')" [columns]="expenseTableColumns" [rows]="expenseTableRows" [loading]="loading && !expenses.length" [loadingDescription]="t('جارٍ تحميل المصروفات…', 'Loading expenses…')" [emptyTitle]="t('لا توجد مصروفات','No expenses yet')" [emptyDescription]="expenseSearch.trim() ? t('لا توجد مصروفات مطابقة للبحث.','No expenses match this search.') : t('لم يتم تسجيل مصروفات بعد.','No expenses recorded yet.')" />
              </section>
            }

            @if (tab === 'integrity' && business.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('مراجعة سلامة البيانات', 'Data integrity review') " [description]=" t('تقرير قراءة فقط لاكتشاف السجلات القديمة غير المرتبطة والتخصيصات غير المتطابقة.', 'Read-only report for unlinked legacy invoices and mismatched allocations.') "><span class="count">{{ (dataIntegrityReport?.generated_at | date:'short') || t('لم يتم التحديث', 'Not refreshed') }}</span></aba-section-header>
                <button class="primary" type="button" (click)="loadDataIntegrity(0)" [disabled]="integrityLoading">{{ integrityLoading ? t('جارٍ الفحص…', 'Checking…') : t('فحص البيانات', 'Run integrity check') }}</button>
                @if (integrityError) { <aba-state-message kind="error" [description]="integrityError" /> }
                @if (dataIntegrityReport) {
                  <div class="notice warning-notice"><strong>{{ t('تحتاج مراجعة بشرية', 'Human review required') }}</strong><span>{{ integrityWarningLabel(dataIntegrityReport.warning) }}</span></div>
                  <div class="metric-grid">
                    <article class="metric"><span>{{ t('فواتير صادرة بلا عميل', 'Issued invoices without a customer') }}</span><strong>{{ dataIntegrityReport.unlinked_issued_invoices.total }}</strong></article>
                    <article class="metric"><span>{{ t('تخصيصات بعملات مختلفة', 'Currency-mismatched allocations') }}</span><strong>{{ dataIntegrityReport.currency_mismatched_allocations.total }}</strong></article>
                    <article class="metric"><span>{{ t('تخصيصات بعملاء مختلفين', 'Customer-mismatched allocations') }}</span><strong>{{ dataIntegrityReport.customer_mismatched_allocations.total }}</strong></article>
                  </div>
                  <h3>{{ t('الفواتير غير المرتبطة', 'Unlinked issued invoices') }}</h3>
                  <aba-record-table [ariaLabel]="t('الفواتير غير المرتبطة بعميل','Invoices without customer')" [columns]="integrityInvoiceColumns" [rows]="integrityInvoiceRows" [emptyTitle]="t('لا توجد فواتير غير مرتبطة','No unlinked invoices')" [emptyDescription]="t('لم يتم العثور على فواتير تحتاج مراجعة في هذه الفئة.','No invoices need review in this category.')" />
                  <h3>{{ t('تخصيصات المدفوعات التي تحتاج مراجعة', 'Payment allocations needing review') }}</h3>
                  <aba-record-table [ariaLabel]="t('تخصيصات تحتاج مراجعة','Allocations requiring review')" [columns]="integrityAllocationColumns" [rows]="integrityAllocationRows" [emptyTitle]="t('لا توجد تخصيصات تحتاج مراجعة','No allocations need review')" [emptyDescription]="t('لم يتم العثور على تخصيصات غير متطابقة.','No mismatched allocations found.')" />
                  <div class="inline-form"><span class="muted">{{ t('الصفحة', 'Offset') }} {{ dataIntegrityReport.offset }} · {{ t('حد الصفحة', 'Page size') }} {{ dataIntegrityReport.limit }}</span><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset > 0 ? dataIntegrityReport.offset - dataIntegrityReport.limit : 0)" [disabled]="integrityLoading || dataIntegrityReport.offset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset + dataIntegrityReport.limit)" [disabled]="integrityLoading || dataIntegrityReport.offset + dataIntegrityReport.limit >= maxIntegrityTotal">{{ t('التالي', 'Next') }}</button></div>
                }
              </section>
            }

            @if (tab === 'assistant') {
              <div class="assistant-workspace">
              <section abaCard class="panel chat-panel">
                <aba-section-header [title]=" t('مساعد الأعمال الذكي', 'AI Business Assistant') " [description]=" t('الإجابات مبنية على السجلات الحديثة لمساحة العمل الحالية فقط.', 'Answers use recent records from the current workspace only.') "><span class="count">{{ t('قراءة فقط', 'READ ONLY') }}</span></aba-section-header>
                <div class="chat-log" role="log" tabindex="0" aria-live="polite" [attr.aria-label]="t('سجل محادثة المساعد، قابل للتمرير', 'Assistant conversation history, scrollable')">
                  @if (!chatMessages.length) { <aba-state-message kind="empty" [description]="t('ابدأ بسؤال سريع عن نشاطك أو اختَر اقتراحًا بالأسفل.', 'Start with a quick business question or choose a suggestion below.')" /> }
                  @for (message of chatMessages; track $index) { <article class="chat-message" [class.user-message]="message.role === 'user'"><span>{{ message.role === 'user' ? t('أنت', 'You') : t('المساعد الذكي', 'AI assistant') }}</span>@if (message.mode === 'local-fallback') { <small class="source-list">{{ t('وضع مجاني محدود · إجابة من سجلات النشاط', 'Free limited mode · grounded in business records') }}</small> }<p>{{ message.content }}</p>@if (message.sources?.length) { <small class="source-list">{{ t('المصادر:', 'Sources:') }} @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? t('فاتورة', 'Invoice') : (source.type === 'expense' ? t('مصروف', 'Expense') : source.type) }} · {{ source.invoice_number || (source.type === 'expense' && source.category ? expenseCategoryLabel(source.category) : (source.category || source.id)) }}</span> }</small> }</article> }
                </div>
                
                @if (chatError) { <aba-state-message kind="error" [description]="chatError" [actionLabel]="chatConfigurationMissing ? '' : t('إعادة المحاولة', 'Retry')" [actionDisabled]="chatSending || !chatDraft.trim()" (action)="sendChat()" /> }
                @if (chatSending) { <aba-state-message kind="loading" [description]="t('المساعد الذكي يجهّز الإجابة…', 'The AI assistant is preparing an answer…')" /> }
                <form #chatForm="ngForm" class="chat-form" (ngSubmit)="chatForm.valid && chatDraft.trim() && sendChat()"><textarea #chatMessageControl="ngModel" name="chatMessage" rows="2" maxlength="2000" [attr.aria-label]="t('سؤالك للمساعد الذكي', 'Your question for the AI assistant')" [attr.aria-invalid]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'true' : null" [attr.aria-describedby]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'chat-message-error' : null" [placeholder]="t('اكتب سؤالك عن نشاطك…', 'Ask a question about your business…')" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea><button class="primary" type="submit" [disabled]="chatSending">{{ chatSending ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال', 'Send') }}</button></form>
                @if ((chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted)) { <small id="chat-message-error" class="field-error" role="alert">{{ t('اكتب سؤالك قبل الإرسال (بحد أقصى 2000 حرف).', 'Enter your question before sending (up to 2000 characters).') }}</small> }
                <p class="footnote">{{ t('المساعد للقراءة فقط. عند عدم إعداد مفتاح مزوّد الذكاء الاصطناعي يعمل بوضع مجاني محدود للإجابات المبنية على أحدث السجلات، ولا يُعدّ بديلًا للمساعد التوليدي الكامل.', 'Read-only assistant. Without an AI provider key, a free limited fallback answers from recent records; it is not a full generative AI replacement.') }}</p>
              </section>
              <aside class="assistant-suggestions" aria-label="{{ t('اقتراحات الأسئلة', 'Suggested questions') }}"><p>{{ t('جرّب تسأل', 'Try asking') }}</p><div class="suggestion-grid"><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('ما الفواتير المستحقة التي تحتاج متابعة؟', 'Which outstanding invoices need follow-up?'))"><span class="suggestion-icon">↗</span><strong>{{ t('متابعة التحصيل', 'Receivables follow-up') }}</strong><small>{{ t('اعرف الفواتير المستحقة', 'Find outstanding invoices') }}</small></button><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('لخّص أداء النشاط خلال آخر 30 يومًا.', 'Summarize business performance over the last 30 days.'))"><span class="suggestion-icon">✦</span><strong>{{ t('ملخص الأداء', 'Performance summary') }}</strong><small>{{ t('مبيعات ومصروفات', 'Sales and expenses') }}</small></button><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('ما المنتجات التي تحتاج إعادة تخزين؟', 'Which products may need restocking?'))"><span class="suggestion-icon">▦</span><strong>{{ t('المخزون', 'Inventory check') }}</strong><small>{{ t('راجع المنتجات والمخزون', 'Review products and stock') }}</small></button><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('اعرض لي نظرة عامة على العملاء والفواتير.', 'Give me an overview of customers and invoices.'))"><span class="suggestion-icon">◎</span><strong>{{ t('نظرة عامة', 'Business overview') }}</strong><small>{{ t('عملاء وفواتير', 'Customers and invoices') }}</small></button></div></aside>
              </div>
            }
          }
          <footer>{{ t('مساعد الأعمال الذكي', 'AI Business Assistant') }} <span>{{ t('جلسة Firebase موثّقة · واجهة API معزولة حسب النشاط · قاعدة بيانات PostgreSQL', 'Verified Firebase session · business-scoped API · PostgreSQL database') }}</span></footer>
          }
        </main>
      }
      @if (pendingInvoiceVoid) {
        <aba-confirm-dialog
          [title]="t('تأكيد إلغاء الفاتورة', 'Confirm invoice void') + ' · ' + pendingInvoiceVoid.invoice_number"
          [message]="t('سيتم تغيير حالة الفاتورة إلى ملغاة.', 'This will mark the invoice as void.')"
          [warning]="t('إذا كانت هناك دفعات مخصصة، توقف وراجع مالك مساحة العمل. هذه الشاشة لا تنفذ رد مبالغ أو إشعارات دائنة.', 'If payments are allocated, stop and review with the workspace owner. This screen does not process refunds or credit notes.')"
          [confirmLabel]="t('إلغاء الفاتورة', 'Void invoice')"
          [cancelLabel]="t('الاحتفاظ بالفاتورة', 'Keep invoice')"
          [busyLabel]="t('جارٍ الإلغاء...', 'Voiding...')"
          [busy]="loading"
          [confirmDisabled]="!!invoiceVoidError"
          [error]="invoiceVoidError"
          [tone]="'danger'"
          [returnFocusTo]="confirmationReturnFocus"
          [focusFallbackId]="'invoices-section-heading'"
          (confirmed)="confirmInvoiceVoid()"
          (cancelled)="cancelInvoiceVoid()" />
      }
      @if (pendingPurchaseReceipt) {
        <aba-confirm-dialog
          [title]="t('تأكيد استلام أمر الشراء', 'Confirm purchase receipt') + ' · ' + pendingPurchaseReceipt.order_number"
          [message]="t('سيتم تسجيل الكميات المتبقية أدناه وتحديث المخزون عبر عملية الاستلام الحالية.', 'This will record the remaining quantities below and update stock through the existing receiving workflow.')"
          [warning]="t('راجع كل كمية قبل التأكيد. إذا لم تتأكد من النتيجة، حدّث حالة الأمر قبل أي محاولة أخرى.', 'Review every quantity before confirming. If the result is uncertain, refresh the order status before any retry.')"
          [detailsTitle]="t('الكميات المتبقية التي سيتم استلامها', 'Remaining quantities to receive')"
          [details]="pendingPurchaseReceiptDetails"
          [confirmLabel]="t('تسجيل الاستلام', 'Record receipt')"
          [cancelLabel]="t('مراجعة لاحقًا', 'Review later')"
          [busyLabel]="t('جارٍ التسجيل...', 'Recording...')"
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
    .panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:var(--aba-color-text-tertiary,#6b7280);line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:var(--aba-color-text-tertiary,#6b7280);margin:0}.count{font-size:10px;font-weight:700;color:var(--aba-color-primary,#0f766e);background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:var(--aba-color-surface-subtle,#f8fafc);border:1px solid #edf0f5;border-radius:11px}.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}.expense-form{grid-template-columns:repeat(3,minmax(0,1fr))}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:var(--aba-color-surface,#fff);padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.payment-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#cffafe;color:#0e7490;font-size:17px;font-weight:800}.expense-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#ffedd5;color:#c2410c;font-size:20px;font-weight:800}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:var(--aba-color-text-tertiary,#6b7280);font-size:10px;margin-top:5px;overflow-wrap:anywhere}.footnote{font-size:10px;line-height:1.6;color:var(--aba-color-nav-muted,#9ca3af);margin:15px 0 0} .assistant-workspace{display:grid;grid-template-columns:minmax(0,1fr) 228px;gap:16px;align-items:start}.assistant-suggestions{min-width:0;margin:0;padding:16px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:16px;background:var(--aba-color-surface,#fff);box-shadow:0 8px 24px #0f172a08}.assistant-suggestions>p{font-size:12px;font-weight:800;color:var(--aba-color-text-muted,#334155);margin:0 0 10px}.suggestion-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.suggestion-card{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;column-gap:9px;row-gap:2px;text-align:start;padding:9px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc);color:#1e293b;transition:background .16s ease,border-color .16s ease}.suggestion-card:hover{background:#eff6ff;border-color:#2563eb}.suggestion-icon{grid-row:span 2;display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#dbeafe;color:#1d4ed8;font-size:15px}.suggestion-card strong{font-size:11px}.suggestion-card small{font-size:10px;color:var(--aba-color-text-secondary,#64748b);line-height:1.35}.chat-panel{min-width:0}.chat-log{min-height:280px;max-height:55vh}@media(max-width:900px){.assistant-workspace{grid-template-columns:minmax(0,1fr)}.assistant-suggestions{grid-row:2}.suggestion-grid{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.suggestion-card{flex:0 0 175px}}@media(max-width:480px){.assistant-suggestions{padding:12px}.suggestion-card{flex-basis:158px;padding:8px}.chat-log{min-height:220px;max-height:48vh}}.chat-log{min-height:280px;max-height:55vh;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-inline-end:auto;margin-inline-start:0;background:#e0f2fe}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--aba-color-text-tertiary,#6b7280);font-weight:800}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:var(--aba-color-primary,#0f766e);font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-inline-end:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical}.install-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 14px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;color:#065f46;font-size:12px;line-height:1.6}.install-help-inline{position:static;z-index:auto;width:min(520px,100%);max-width:100%;margin:0 0 14px auto;box-shadow:none}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:var(--aba-color-surface,#fff);border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:var(--aba-color-text-tertiary,#6b7280);line-height:1.7}.setup-steps{background:var(--aba-color-surface-subtle,#f8fafc);border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:var(--aba-color-primary,#0f766e);font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}.splash-build-time{display:block;margin:-8px 0 18px;color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.6;text-align:center}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:var(--aba-color-text-tertiary,#6b7280);font-size:10px}footer span{color:var(--aba-color-nav-muted,#9ca3af)}
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
    if (!APP_BUILD_INFO.builtAt) return this.t('وقت البناء غير متاح', 'Build time unavailable');
    return new Intl.DateTimeFormat(this.language === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Cairo',
    }).format(new Date(APP_BUILD_INFO.builtAt));
  }
  apiVersionLabel = 'غير متاح';
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
  keyboardOpen = false;
  mobileMoreOpen = false;
  mobileMoreSearch = '';
  homeModuleSearch = '';
  @ViewChild('mobileMoreTrigger') private mobileMoreTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('mobileMoreMenu') private mobileMoreMenu?: ElementRef<HTMLElement>;
  isInstalled = false;
  installHelp = false;
  private installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

  constructor(private readonly auth: AuthService, private readonly api: ApiService) {
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
    try {
      const savedLanguage = localStorage.getItem('aba-language');
      if (savedLanguage === 'ar' || savedLanguage === 'en') this.language = savedLanguage;
    } catch { /* language preference is optional */ }
    this.syncDocumentLanguage();
  }

  toggleLanguage(): void {
    this.language = this.language === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('aba-language', this.language); } catch { /* private browsing may block storage */ }
    this.syncDocumentLanguage();
  }

  private syncDocumentLanguage(): void {
    document.documentElement.lang = this.language;
    document.documentElement.dir = this.language === 'ar' ? 'rtl' : 'ltr';
    document.title = this.t('مساعد الأعمال الذكي', 'AI Business Assistant');
  }

  t(arabic: string, english: string): string {
    return this.language === 'ar' ? arabic : english;
  }

  customerNameForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('عميل غير محدد (سجل قديم)', 'Unlinked customer (legacy record)');
    return this.customers.find(customer => customer.id === customerId)?.name
      || this.t('العميل غير موجود في القائمة الحالية', 'Customer not in the current list');
  }

  customerInitialForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('؟', '?');
    const name = this.customers.find(customer => customer.id === customerId)?.name?.trim();
    return name ? Array.from(name)[0] ?? this.t('؟', '?') : this.t('؟', '?');
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
    return this.t('تم سداد ' + percent + '%', percent + '% paid');
  }

  invoiceCardStatusTone(invoice: Invoice): string {
    return this.invoicePaymentTone(invoice)
      || (invoice.status === 'draft' ? 'draft' : invoice.status === 'void' ? 'void' : 'issued');
  }

  invoiceCardStatusLabel(invoice: Invoice): string {
    const tone = this.invoicePaymentTone(invoice);
    if (tone === 'paid') return this.t('مدفوعة', 'Paid');
    if (tone === 'partial') return this.t('مدفوعة جزئياً', 'Partially paid');
    if (tone === 'unpaid') return this.t('غير مدفوعة', 'Unpaid');
    return this.invoiceStatusLabel(invoice.status);
  }

  showCustomerInvoices(customerId: string): void {
    this.invoiceFilterCustomerId = customerId;
    this.setTab('invoices');
  }

  get filteredCustomers(): Customer[] {
    return filterCustomers(this.customers, this.customerSearch);
  }

  get supplierTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'name',label:this.t('المورد','Supplier'),primary:true},
    {key:'email',label:this.t('البريد الإلكتروني','Email')},
    {key:'phone',label:this.t('الهاتف','Phone')},
    {key:'address',label:this.t('العنوان','Address')},
    {key:'status',label:this.t('الحالة','Status'),kind:'status'},
  ]; }
  get supplierTableRows(): readonly AbaRecordTableRow[] { return this.filteredSuppliers.map(supplier=>({
    id:supplier.id,cells:{
      name:supplier.name,email:supplier.email||this.t('غير مسجل','Not provided'),
      phone:supplier.phone||this.t('غير مسجل','Not provided'),
      address:supplier.address||this.t('غير مسجل','Not provided'),
      status:supplier.is_active?this.t('نشط','Active'):this.t('غير نشط','Inactive'),
    },
  })); }
  get purchaseTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'order',label:this.t('رقم الأمر','Order no.'),primary:true},
    {key:'supplier',label:this.t('المورد','Supplier')},
    {key:'products',label:this.t('الأصناف','Items')},
    {key:'received',label:this.t('المستلم / المطلوب','Received / ordered')},
    {key:'status',label:this.t('الحالة','Status'),kind:'status'},
    {key:'total',label:this.t('الإجمالي','Total'),kind:'numeric'},
  ]; }
  get purchaseTableRows(): readonly AbaRecordTableRow[] { return this.filteredPurchaseOrders.map(order=>({
    id:order.id,cells:{
      order:order.order_number,supplier:this.supplierNameFor(order.supplier_id),
      products:this.purchaseOrderProductsSummary(order),received:this.purchaseOrderReceivedSummary(order),
      status:this.purchaseOrderStatusLabel(order.status),total:`${order.total} ${order.currency_code}`,
    },
    actions:this.business?.role==='owner'&&this.canReceivePurchaseOrder(order)?[{id:'receive',label:this.t('استلام المتبقي','Receive remaining')}]:[],
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
    if(action.actionId!=='receive'||this.business?.role!=='owner')return;
    const order=this.purchaseOrders.find(item=>item.id===action.rowId);
    if(!order||!this.canReceivePurchaseOrder(order))return;
    this.requestPurchaseOrderReceipt(order,action.anchor);
  }

  get filteredProducts(): Product[] {
    return filterProducts(this.products, this.productSearch, this.business?.currency_code || '');
  }

  get filteredInvoices(): Invoice[] {
    return filterInvoices(this.invoices, this.invoiceSearch, this.invoiceStatusFilter, this.invoiceFilterCustomerId, status => this.invoiceStatusLabel(status), id => this.customerNameForInvoice(id));
  }

  get filteredSuppliers(): Supplier[] {
    return filterSuppliers(this.suppliers, this.supplierSearch);
  }

  get filteredPurchaseOrders(): PurchaseOrder[] {
    return filterPurchaseOrders(
      this.purchaseOrders,
      this.purchaseSearch,
      id => this.supplierNameFor(id),
      id => this.productNameFor(id),
      status => this.purchaseOrderStatusLabel(status),
    );
  }

  get filteredRecurringSchedules(): RecurringInvoiceSchedule[] {
    return filterRecurringSchedules(
      this.recurringSchedules,
      this.recurringSearch,
      id => this.customerNameForInvoice(id),
    );
  }

  get filteredNotifications(): NotificationRecord[] {
    return filterNotifications(this.notifications, this.notificationSearch, kind => this.notificationKindLabel(kind), status => this.notificationStatusLabel(status));
  }

  get filteredExpenses(): Expense[] {
    return filterExpenses(this.expenses, this.expenseSearch, category => this.expenseCategoryLabel(category));
  }

  get filteredPayments(): Payment[] {
    return filterPayments(this.payments, this.paymentSearch, id => this.customerNameForInvoice(id), method => this.paymentMethodLabel(method));
  }


  get paymentTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'customer',label:this.t('العميل','Customer'),primary:true},
    {key:'amount',label:this.t('المبلغ','Amount'),kind:'numeric'},
    {key:'received',label:this.t('تاريخ الاستلام','Received at')},
    {key:'method',label:this.t('طريقة الدفع','Method')},
    {key:'reference',label:this.t('المرجع','Reference')},
    {key:'allocation',label:this.t('التخصيص','Allocation'),kind:'status'},
  ]; }
  get paymentTableRows(): readonly AbaRecordTableRow[] { return this.filteredPayments.map(item=>({id:item.id,cells:{
    customer:this.customerNameForInvoice(item.customer_id),amount:`${item.amount} ${item.currency_code}`,
    received:this.formatRecordDate(item.received_at),method:item.method?this.paymentMethodLabel(item.method):this.t('غير محددة','Not specified'),
    reference:item.reference||'—',allocation:item.allocations.length?`${item.allocations.length} ${this.t('تخصيصات','allocations')}`:this.t('غير مخصصة','Unallocated'),
  }})); }
  get expenseTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'date',label:this.t('التاريخ','Date')},
    {key:'description',label:this.t('الوصف','Description'),primary:true},
    {key:'category',label:this.t('التصنيف','Category'),kind:'status'},
    {key:'vendor',label:this.t('المورد','Vendor')},
    {key:'reference',label:this.t('المرجع','Reference')},
    {key:'amount',label:this.t('المبلغ','Amount'),kind:'numeric'},
  ]; }
  get expenseTableRows(): readonly AbaRecordTableRow[] { return this.filteredExpenses.map(item=>({id:item.id,cells:{
    date:this.formatRecordDate(item.incurred_at),description:item.description,category:this.expenseCategoryLabel(item.category),
    vendor:item.vendor_name||this.t('بدون مورد','No vendor'),reference:item.reference||'—',amount:`${item.amount} ${item.currency_code}`,
  }})); }
  get recurringTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'customer',label:this.t('العميل','Customer'),primary:true},
    {key:'interval',label:this.t('التكرار','Interval')},
    {key:'nextRun',label:this.t('التشغيل التالي','Next run')},
    {key:'timezone',label:this.t('المنطقة الزمنية','Timezone')},
    {key:'status',label:this.t('الحالة','Status'),kind:'status'},
  ]; }
  get recurringTableRows(): readonly AbaRecordTableRow[] { return this.filteredRecurringSchedules.map(item=>({id:item.id,cells:{
    customer:item.customer_id?this.customerNameForInvoice(item.customer_id):this.t('غير محدد','Not assigned'),
    interval:`${item.interval_days} ${this.t('يوم','days')}`,nextRun:this.formatRecordDate(item.next_run_at),timezone:item.timezone,
    status:item.is_active?this.t('نشطة','Active'):this.t('متوقفة','Inactive'),
  }})); }
  get notificationTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'title',label:this.t('الإشعار','Notification'),primary:true},
    {key:'kind',label:this.t('النوع','Type'),kind:'status'},
    {key:'status',label:this.t('الحالة','Status'),kind:'status'},
    {key:'scheduled',label:this.t('موعد الإرسال','Scheduled')},
    {key:'created',label:this.t('تاريخ الإنشاء','Created')},
    {key:'body',label:this.t('المحتوى','Message')},
  ]; }
  get notificationTableRows(): readonly AbaRecordTableRow[] { return this.filteredNotifications.map(item=>({id:item.id,cells:{
    title:item.title,kind:this.notificationKindLabel(item.kind),status:this.notificationStatusLabel(item.status),
    scheduled:item.scheduled_at?this.formatRecordDate(item.scheduled_at):this.t('غير مجدول','Unscheduled'),created:this.formatRecordDate(item.created_at,'short'),body:item.body,
  }})); }
  get auditTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'date',label:this.t('التاريخ','Date')},
    {key:'action',label:this.t('العملية','Action'),primary:true},
    {key:'target',label:this.t('نوع السجل','Target')},
    {key:'recordId',label:this.t('المعرّف','Record ID')},
    {key:'actor',label:this.t('المنفذ','Actor')},
  ]; }
  get auditTableRows(): readonly AbaRecordTableRow[] { return this.auditEvents.map(item=>({id:item.id,cells:{
    date:this.formatRecordDate(item.created_at,'short'),action:this.auditActionLabel(item.action),target:this.auditTargetLabel(item.target_type),
    recordId:item.target_id||'—',actor:item.actor_subject||'—',
  }})); }


  get agingTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('رقم الفاتورة','Invoice'),primary:true},
    {key:'outstanding',label:this.t('المتبقي','Outstanding'),kind:'numeric'},
    {key:'bucket',label:this.t('عمر المديونية','Aging bucket'),kind:'status'},
    {key:'dueDate',label:this.t('تاريخ الاستحقاق','Due date')},
    {key:'customer',label:this.t('حالة العميل','Customer link'),kind:'status'},
  ]; }
  get agingTableRows(): readonly AbaRecordTableRow[] { return (this.agingReport?.invoices||[]).map(invoice=>({id:invoice.invoice_id,cells:{
    invoice:invoice.invoice_number,outstanding:`${invoice.outstanding_amount} ${invoice.currency_code}`,
    bucket:this.agingBucketLabel(invoice.aging_bucket),dueDate:invoice.due_date?this.formatRecordDate(invoice.due_date,'date'):this.t('بدون تاريخ استحقاق','No due date'),
    customer:invoice.customer_link_missing?this.t('غير مرتبط — مراجعة يدوية','Missing — manual review'):this.t('مرتبط','Linked'),
  }})); }
  get profitLossTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'currency',label:this.t('العملة','Currency'),primary:true},
    {key:'revenue',label:this.t('الإيرادات','Revenue'),kind:'numeric'},
    {key:'returns',label:this.t('المرتجعات المعتمدة','Approved returns'),kind:'numeric'},
    {key:'expenses',label:this.t('المصروفات','Expenses'),kind:'numeric'},
    {key:'result',label:this.t('النتيجة قبل تكلفة البضاعة','Result before COGS'),kind:'numeric'},
  ]; }
  get profitLossTableRows(): readonly AbaRecordTableRow[] { return (this.profitLoss?.currencies||[]).map(row=>({id:row.currency_code,cells:{
    currency:row.currency_code,revenue:`${row.revenue} · ${row.revenue_invoice_count} ${this.t('فاتورة','invoices')}`,
    returns:`${row.approved_return_total} · ${row.approved_return_count} ${this.t('مرتجع','returns')}`,
    expenses:`${row.expenses} · ${row.expense_count} ${this.t('مصروف','expenses')}`,
    result:row.operating_result_before_cost_of_goods,
  }})); }
  get taxTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'currency',label:this.t('العملة','Currency'),primary:true},
    {key:'tax',label:this.t('إجمالي الضريبة','Tax total'),kind:'numeric'},
    {key:'count',label:this.t('الفواتير الصادرة','Issued invoices'),kind:'numeric'},
  ]; }
  get taxTableRows(): readonly AbaRecordTableRow[] { return (this.taxSummaryReport?.currencies||[]).map(row=>({id:row.currency_code,cells:{
    currency:row.currency_code,tax:`${row.tax_total} ${row.currency_code}`,count:String(row.invoice_count),
  }})); }
  get integrityInvoiceColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('الفاتورة','Invoice'),primary:true},
    {key:'total',label:this.t('الإجمالي','Total'),kind:'numeric'},
    {key:'date',label:this.t('تاريخ الإنشاء','Created')},
    {key:'record',label:this.t('معرّف السجل','Record ID')},
  ]; }
  get integrityInvoiceRows(): readonly AbaRecordTableRow[] { return (this.dataIntegrityReport?.unlinked_issued_invoices.items||[]).map(row=>({id:row.invoice_id,cells:{
    invoice:row.invoice_number,total:`${row.total} ${row.currency_code}`,date:this.formatRecordDate(row.created_at,'short'),record:row.invoice_id,
  }})); }
  get integrityAllocationColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'invoice',label:this.t('الفاتورة','Invoice'),primary:true},
    {key:'issue',label:this.t('نوع المراجعة','Review issue'),kind:'status'},
    {key:'amount',label:this.t('المبلغ','Amount'),kind:'numeric'},
    {key:'paymentCurrency',label:this.t('عملة الدفعة','Payment currency')},
    {key:'invoiceCurrency',label:this.t('عملة الفاتورة','Invoice currency')},
    {key:'customers',label:this.t('مطابقة العميل','Customer match')},
    {key:'reference',label:this.t('مرجع الدفعة','Payment reference')},
  ]; }
  get integrityAllocationRows(): readonly AbaRecordTableRow[] {
    const currency=(this.dataIntegrityReport?.currency_mismatched_allocations.items||[]).map(row=>({id:`currency-${row.allocation_id}`,cells:{
      invoice:row.invoice_number,issue:this.t('اختلاف العملة','Currency mismatch'),
      amount:`${row.allocated_amount} ${row.payment_currency}`,paymentCurrency:row.payment_currency,
      invoiceCurrency:row.invoice_currency,customers:'—',reference:row.payment_reference||row.payment_id,
    }}));
    const customer=(this.dataIntegrityReport?.customer_mismatched_allocations.items||[]).map(row=>({id:`customer-${row.allocation_id}`,cells:{
      invoice:row.invoice_number,issue:this.t('اختلاف العميل','Customer mismatch'),
      amount:`${row.allocated_amount} ${row.invoice_currency}`,paymentCurrency:row.payment_currency,
      invoiceCurrency:row.invoice_currency,
      customers:`${this.t('عميل الدفعة:','Payment customer:')} ${row.payment_customer_id||'—'} · ${this.t('عميل الفاتورة:','Invoice customer:')} ${row.invoice_customer_id||'—'}`,
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
    this.userEmail = user.email || 'مستخدم مسجّل الدخول';
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
      this.apiVersionLabel = this.t('غير متاح', 'unavailable');
      this.apiCommitLabel = 'unknown';
    }
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
        this.userEmail = user.email || 'مستخدم مسجّل الدخول';
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
    const labelsAr: Record<string, string> = {
      General: 'عام',
      Supplies: 'مستلزمات',
      Rent: 'إيجار',
      Utilities: 'مرافق وفواتير',
      Transport: 'نقل ومواصلات',
      Marketing: 'تسويق',
      Payroll: 'رواتب',
      Maintenance: 'صيانة',
      Other: 'أخرى',
    };
    const labelsEn: Record<string, string> = {
      General: 'General',
      Supplies: 'Supplies',
      Rent: 'Rent',
      Utilities: 'Utilities',
      Transport: 'Transport',
      Marketing: 'Marketing',
      Payroll: 'Payroll',
      Maintenance: 'Maintenance',
      Other: 'Other',
    };
    return (this.language === 'ar' ? labelsAr : labelsEn)[category] || category;
  }

  paymentMethodLabel(method: string): string {
    const labelsAr: Record<string, string> = {
      cash: 'نقدًا',
      bank_transfer: 'تحويل بنكي',
      card: 'بطاقة',
      wallet: 'محفظة إلكترونية',
      other: 'أخرى',
    };
    const labelsEn: Record<string, string> = {
      cash: 'Cash',
      bank_transfer: 'Bank transfer',
      card: 'Card',
      wallet: 'E-wallet',
      other: 'Other',
    };
    return (this.language === 'ar' ? labelsAr : labelsEn)[method] || method;
  }

  notificationStatusLabel(status: string): string {
    const labelsAr: Record<string, string> = {
      pending: 'قيد الانتظار',
      sent: 'تم الإرسال',
      failed: 'فشل الإرسال',
      cancelled: 'ملغي',
    };
    const labelsEn: Record<string, string> = {
      pending: 'Pending',
      sent: 'Sent',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return (this.language === 'ar' ? labelsAr : labelsEn)[status] || status || this.t('حالة غير محددة', 'Unknown status');
  }

  notificationKindLabel(kind: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      business: { ar: 'مساحات العمل', en: 'Businesses' },
      businesses: { ar: 'مساحات العمل', en: 'Businesses' },
      invoices: { ar: 'الفواتير', en: 'Invoices' },
      payments: { ar: 'المدفوعات', en: 'Payments' },
      expenses: { ar: 'المصروفات', en: 'Expenses' },
      inventory: { ar: 'المخزون', en: 'Inventory' },
      reminders: { ar: 'التذكيرات', en: 'Reminders' },
      reports: { ar: 'التقارير', en: 'Reports' },
      suppliers: { ar: 'الموردون', en: 'Suppliers' },
      purchases: { ar: 'المشتريات', en: 'Purchases' },
      recurring: { ar: 'الفواتير الدورية', en: 'Recurring invoices' },
      assistant: { ar: 'المساعد الذكي', en: 'AI assistant' },
      system: { ar: 'النظام', en: 'System' }
    };
    return labels[kind]?.[this.language] || kind;
  }

  customerStatementEventLabel(eventType: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      invoice_issued: { ar: 'إصدار فاتورة', en: 'Invoice issued' },
      payment_allocation: { ar: 'تخصيص دفعة', en: 'Payment allocation' },
      currency_mismatch_allocation: { ar: 'تخصيص بعملة غير مطابقة', en: 'Currency-mismatch allocation' },
    };
    return labels[eventType]?.[this.language] || eventType;
  }

  auditActionLabel(action: string): string {
    return formatAuditActionLabel(action, this.language);
  }

  auditTargetLabel(target: string): string {
    return formatAuditTargetLabel(target, this.language);
  }

  revenueBasisLabel(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (normalized.includes('gross issued invoice totals before sales returns')) {
      return this.t('إجمالي الفواتير الصادرة قبل خصم المرتجعات، شاملًا الضريبة المسجلة', 'Gross issued invoice totals before sales returns; stored tax included');
    }
    if (normalized === 'gross issued invoice total' || normalized === 'gross issued invoice totals') {
      return this.t('إجمالي الفواتير الصادرة قبل خصم المرتجعات', 'Gross issued invoice total');
    }
    if (normalized === 'issued invoices' || normalized === 'issued invoice total') {
      return this.t('إجمالي الفواتير الصادرة', 'Issued invoice total');
    }
    return value;
  }

  integrityWarningLabel(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (normalized.startsWith('this report identifies records for manual review only.')) {
      return this.t('هذا التقرير يحدد السجلات التي تحتاج مراجعة بشرية فقط. لا يخمّن روابط العملاء ولا يعدّل الفواتير أو المدفوعات أو التخصيصات.', 'This report identifies records for human review only. It does not guess customer links or modify invoices, payments, or allocations.');
    }
    if (normalized === 'manual review only' || normalized === 'report is for manual review only') {
      return this.t('هذا التقرير للمراجعة البشرية فقط، ولا يغيّر البيانات تلقائيًا.', 'This report is for human review only and does not change data automatically.');
    }
    return value;
  }

  reportLimitationLabel(value: string): string {
    const normalized = value.trim().toLowerCase();
    const known: Record<string, { ar: string; en: string }> = {
      'manual review only': { ar: 'للمراجعة البشرية فقط', en: 'Manual review only' },
      'report is read-only': { ar: 'التقرير للقراءة فقط', en: 'Report is read-only' },
      'amounts are separated by currency': { ar: 'تُعرض المبالغ منفصلة حسب العملة', en: 'Amounts are separated by currency' },
      'uses saved tax totals on issued invoices; it does not recalculate historical taxes.': { ar: 'يعتمد على قيم الضرائب المحفوظة في الفواتير الصادرة ولا يعيد حساب الضرائب التاريخية.', en: 'Uses saved tax totals on issued invoices; it does not recalculate historical taxes.' },
      'currency totals are kept separate and are not converted.': { ar: 'تُعرض إجماليات العملات منفصلة ولا يتم تحويلها.', en: 'Currency totals are kept separate and are not converted.' },
      'this is an operational summary, not a jurisdiction-specific tax filing.': { ar: 'هذا ملخص تشغيلي وليس إقرارًا ضريبيًا رسميًا خاصًا بجهة ضريبية.', en: 'This is an operational summary, not a jurisdiction-specific tax filing.' },
      'revenue is based on issued invoice totals, not cash collected.': { ar: 'يُحسب الإيراد من إجمالي الفواتير الصادرة، وليس من النقد المحصّل.', en: 'Revenue is based on issued invoice totals, not cash collected.' },
      'invoice totals include stored tax amounts; approved sales returns are not netted from this figure.': { ar: 'تشمل إجماليات الفواتير الضرائب المسجلة، ولا تُخصم المرتجعات المعتمدة من هذا الرقم.', en: 'Invoice totals include stored tax amounts; approved sales returns are not netted from this figure.' },
      'this result subtracts recorded expenses only and excludes cost of goods sold because product purchase costs are not yet linked to sales.': { ar: 'تُخصم المصروفات المسجلة فقط، ولا تُحتسب تكلفة البضاعة لأن تكلفة شراء المنتجات غير مرتبطة بالمبيعات بعد.', en: 'This result subtracts recorded expenses only and excludes cost of goods sold because product purchase costs are not yet linked to sales.' },
      'tax liability treatment and tax allocation to returns are not represented as a complete accounting ledger.': { ar: 'لا يعرض التقرير معالجة الالتزام الضريبي وتوزيع الضريبة على المرتجعات كسجل محاسبي متكامل.', en: 'Tax liability treatment and tax allocation to returns are not represented as a complete accounting ledger.' },
      'currency totals are kept separate and are never converted.': { ar: 'تُعرض إجماليات العملات منفصلة ولا يتم تحويلها.', en: 'Currency totals are kept separate and are never converted.' },
      'only issued invoices with a positive remaining balance appear in aging buckets; drafts and void invoices are excluded.': { ar: 'تظهر الفواتير الصادرة ذات الرصيد المتبقي الموجب فقط في فئات الأعمار؛ وتُستبعد المسودات والفواتير الملغاة.', en: 'Only issued invoices with a positive remaining balance appear in aging buckets; drafts and void invoices are excluded.' },
      'fully settled invoices are excluded from open receivables aging.': { ar: 'تُستبعد الفواتير المسددة بالكامل من أعمار المديونيات المفتوحة.', en: 'Fully settled invoices are excluded from open receivables aging.' },
      'overallocated invoices are excluded from receivable balances and shown as positive-excess data-quality warnings.': { ar: 'تُستبعد الفواتير ذات التخصيص الزائد من أرصدة المديونيات وتظهر ضمن تحذيرات جودة البيانات.', en: 'Overallocated invoices are excluded from receivable balances and shown as positive-excess data-quality warnings.' },
      'invoices without due dates are reported separately and are not assumed current.': { ar: 'تُعرض الفواتير بلا تاريخ استحقاق بشكل منفصل ولا تُعتبر مستحقة حاليًا افتراضيًا.', en: 'Invoices without due dates are reported separately and are not assumed current.' },
      'legacy invoices without customer links are flagged for review, not auto-corrected.': { ar: 'تُعلَّم الفواتير القديمة التي لا ترتبط بعميل للمراجعة ولا يتم تصحيحها تلقائيًا.', en: 'Legacy invoices without customer links are flagged for review, not auto-corrected.' },
      'currency-mismatched allocations are listed as warnings and never reduce receivables.': { ar: 'تظهر التخصيصات ذات العملات المختلفة كتحذيرات ولا تقلل المديونيات.', en: 'Currency-mismatched allocations are listed as warnings and never reduce receivables.' },
      'this is an accounts-receivable aging report, not net profit or a full general ledger.': { ar: 'هذا تقرير لأعمار المديونيات وليس تقرير صافي أرباح أو دفتر أستاذ عام متكامل.', en: 'This is an accounts-receivable aging report, not net profit or a full general ledger.' }
    };
    return known[normalized]?.[this.language] || value;
  }

  operationalHealthStatusLabel(status: string): string {
    if (status === 'ok') return this.t('سليم', 'Healthy');
    if (status === 'degraded') return this.t('يحتاج مراجعة', 'Degraded');
    return status || this.t('حالة غير محددة', 'Unknown status');
  }

  invoiceStatusLabel(status: string): string {
    const labelsAr: Record<string, string> = { draft: 'مسودة', issued: 'صادرة', void: 'ملغاة', paid: 'مدفوعة', overdue: 'متأخرة' };
    const labelsEn: Record<string, string> = { draft: 'Draft', issued: 'Issued', void: 'Voided', paid: 'Paid', overdue: 'Overdue' };
    return (this.language === 'ar' ? labelsAr : labelsEn)[status] || this.t('غير محددة', 'Unknown');
  }

  purchaseOrderStatusLabel(status: string): string {
    const labelsAr: Record<string, string> = {
      draft: 'مسودة',
      approved: 'معتمد',
      partially_received: 'مستلم جزئيًا',
      received: 'مستلم بالكامل',
      cancelled: 'ملغي',
    };
    const labelsEn: Record<string, string> = {
      draft: 'Draft',
      approved: 'Approved',
      partially_received: 'Partially received',
      received: 'Received',
      cancelled: 'Cancelled',
    };
    return (this.language === 'ar' ? labelsAr : labelsEn)[status] || status || this.t('حالة غير محددة', 'Unknown status');
  }

  get pageTitle(): string {
    const titles: Record<Tab, string> = {
      overview: 'الرئيسية', customers: 'العملاء',
      products: 'المنتجات والمخزون', invoices: 'المبيعات والفواتير',
      payments: 'المدفوعات', expenses: 'المصروفات', employees: 'الموظفون والمرتبات', suppliers: 'الموردون', purchases: 'المشتريات', recurring: 'الفواتير الدورية', notifications: 'الإشعارات', health: 'الحالة التشغيلية', assistant: 'مساعد الأعمال الذكي', reports: 'نتيجة التشغيل الأولية', taxes: 'التقارير الضريبية', audit: 'سجل العمليات', integrity: 'مراجعة سلامة البيانات', 'release-guide': 'دليل التطبيق والإصدارات', 'platform-admin': 'إدارة المنصة'
    };
    return this.language === 'ar' ? titles[this.tab] : ({ overview: 'Overview', customers: 'Customers', products: 'Products & inventory', invoices: 'Sales & invoices', payments: 'Payments', expenses: 'Expenses', employees: 'Employees & payroll', suppliers: 'Suppliers', purchases: 'Purchasing', recurring: 'Recurring invoices', notifications: 'Notifications', health: 'Operational health', assistant: 'AI business assistant', reports: 'Preliminary operating result', taxes: 'Tax summary', audit: 'Activity log', integrity: 'Data integrity review', 'release-guide': 'App guide & versions', 'platform-admin': 'Platform admin' } as Record<Tab, string>)[this.tab];
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
      this.userEmail = user.email || 'مستخدم مسجّل الدخول';
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
    // Keep recovery behavior stable when the user changes the UI language
    // after the original error message was created.
    return [
      'انتهت صلاحية جلسة الدخول أو تعذر التحقق منها. سجّل الخروج ثم سجّل الدخول مرة أخرى.',
      'Your sign-in session is no longer valid or could not be verified. Sign out and sign in again.'
    ].includes(this.error);
  }

  get accessDenied(): boolean {
    // The stored error may be in the previous language after a language toggle.
    return [
      'لا تملك الصلاحية للوصول إلى مساحة العمل أو تنفيذ هذا الإجراء. اطلب من مالك مساحة العمل مراجعة دورك.',
      'You do not have permission to access this workspace or perform this action.',
      'حسابك غير مخوّل للوصول إلى إدارة المنصة. إذا كنت تحتاج هذه الصلاحية، راجع مسؤول المنصة.',
      'Your account is not authorized to access platform administration. Contact the platform administrator if you need this access.'
    ].includes(this.error);
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
      this.error = this.t('أكمل حفظ مسودة الفاتورة أو أعد محاولة الدفعة الحالية قبل تغيير مساحة العمل.', 'Finish saving the invoice draft or retry the pending payment before switching workspaces.');
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
      const [dashboard, عميل, منتج, فاتورة, دفعة, مصروفات] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), paymentsRequest, this.api.expenses(id)
      ]);
      if (!this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) return;
      this.dashboard = dashboard;
      this.homeDashboardError = '';
      this.profitLoss = null;
      this.setCustomerPage(عميل);
      if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      this.setProductPage(منتج);
      this.setInvoicePage(فاتورة);
      this.setPaymentPage(دفعة);
      this.expenses = مصروفات;
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
    const ar: Record<string, string> = { not_due: 'غير مستحقة بعد', '1_30_days': '1–30 يومًا', '31_60_days': '31–60 يومًا', '61_90_days': '61–90 يومًا', over_90_days: 'أكثر من 90 يومًا', no_due_date: 'بدون تاريخ استحقاق' };
    const en: Record<string, string> = { not_due: 'Not yet due', '1_30_days': '1–30 days', '31_60_days': '31–60 days', '61_90_days': '61–90 days', over_90_days: 'Over 90 days', no_due_date: 'No due date' };
    return (this.language === 'ar' ? ar : en)[bucket] || bucket;
  }

  agingWarningLabel(type: string): string {
    const ar: Record<string, string> = { payment_currency_mismatch: 'تخصيص دفعة بعملة مختلفة', allocations_exceed_invoice_total: 'إجمالي تخصيصات الدفعات يتجاوز قيمة الفاتورة' };
    const en: Record<string, string> = { payment_currency_mismatch: 'Payment allocation uses a different currency', allocations_exceed_invoice_total: 'Payment allocations exceed invoice total' };
    return (this.language === 'ar' ? ar : en)[type] || type;
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
      this.reportError = this.t('حدد تاريخ البداية والنهاية.', 'Choose both a start and end date.');
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
      this.taxError = this.t('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.', 'Start date must not be after end date.');
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
      this.operationsWarning = this.t(
        'تم تنفيذ العملية بنجاح، لكن تعذر تحديث القائمة. حدّث البيانات قبل إعادة المحاولة.',
        'The operation succeeded, but the list could not be refreshed. Refresh the data before retrying.'
      ) + ' ' + this.message(error);
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
      this.setOperationsSuccess('notifications', this.t(
        'تمت إضافة الإشعار إلى قائمة الانتظار. لم يتم تأكيد إرساله للمستلمين.',
        'Notification added to the queue; delivery to recipients is not confirmed.'
      ));
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
      this.setOperationsSuccess('suppliers', this.t('تم حفظ المورد.', 'Supplier saved.'));
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
      this.operationsError = this.t('تحقق من الكمية والتكلفة.', 'Check the quantity and unit cost.');
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
      this.setOperationsSuccess('purchases', this.t(
        'تم إنشاء أمر الشراء. لم يتم استلام الكميات بعد.',
        'Purchase order created. No quantities have been received yet.'
      ));
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
  canReceivePurchaseOrder(order: PurchaseOrder): boolean {
    return (order.status === 'approved' || order.status === 'partially_received') &&
      order.lines.some(line => this.hasRemainingQuantity(line));
  }
  supplierNameFor(id: string): string { return this.suppliers.find(item=>item.id===id)?.name || id.slice(0,8); }
  productNameFor(id: string): string { return this.products.find(item=>item.id===id)?.name || id.slice(0,8); }
  requestPurchaseOrderReceipt(order: PurchaseOrder, event: MouseEvent | HTMLElement): void {
    if (!this.business || this.business.role !== 'owner' || !this.canReceivePurchaseOrder(order)) return;
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
      .map(line => `${this.productNameFor(line.product_id)} · ${line.remaining_quantity} ${this.t('وحدة', 'units')}`);
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
      this.setOperationsSuccess('purchases', this.t('تم تسجيل الاستلام.', 'Receiving was recorded.'));
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
      this.operationsError = this.t('الفاصل يجب أن يكون بين يوم و3650 يومًا.', 'Interval must be between 1 and 3650 days.');
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
      this.setOperationsSuccess('recurring', this.t(
        'تم حفظ جدول الفوترة الدورية. هذا لا يعني إنشاء الفواتير تلقائيًا.',
        'Recurring invoice schedule saved. This does not generate invoices automatically.'
      ));
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
    return filterWorkspaceModules(this.homeModuleCards, this.homeModuleSearch, this.language === 'ar' ? 'ar-EG' : 'en');
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
    const query = this.mobileMoreSearch.trim().normalize('NFKC').toLocaleLowerCase(this.language === 'ar' ? 'ar-EG' : 'en');
    if (!query) return this.mobileMoreGroups;
    return this.mobileMoreGroups.map(group => {
      const locale = this.language === 'ar' ? 'ar-EG' : 'en';
      const groupMatches = `${group.titleAr} ${group.titleEn}`.normalize('NFKC').toLocaleLowerCase(locale).includes(query);
      const modules = groupMatches ? group.modules : filterWorkspaceModules(group.modules, this.mobileMoreSearch, locale);
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
    const locale = this.language === 'ar' ? 'ar-EG' : 'en-GB';
    const options: Intl.DateTimeFormatOptions = style === 'date'
      ? { dateStyle: 'medium' }
      : style === 'short'
        ? { dateStyle: 'short', timeStyle: 'short' }
        : { dateStyle: 'medium', timeStyle: 'short' };
    return new Intl.DateTimeFormat(locale, options).format(parsed);
  }

  formatCustomerStatementDate(value: string | null | undefined): string {
    if (!value || !Number.isFinite(Date.parse(value))) return '—';
    return new Intl.DateTimeFormat(this.language === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'short', timeStyle: 'short',
    }).format(new Date(value));
  }

  get customerStatementTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'date',label:this.t('التاريخ','Date')},
    {key:'event',label:this.t('الحركة','Event'),primary:true},
    {key:'reference',label:this.t('المرجع','Reference')},
    {key:'debit',label:this.t('مدين','Debit'),kind:'numeric'},
    {key:'credit',label:this.t('دائن','Credit'),kind:'numeric'},
    {key:'balance',label:this.t('الرصيد','Balance'),kind:'numeric'},
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
      this.statementError = this.t(
        'تاريخ البداية لازم يكون قبل تاريخ النهاية أو مساويًا له.',
        'Start date must be on or before end date.'
      );
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
      this.customerMessage = this.t('تم حفظ العميل بنجاح.', 'Customer saved successfully.');
      try {
        const customers = await this.api.customers(businessId);
        if (this.business?.id !== businessId) return;
        this.setCustomerPage(customers);
        if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      } catch {
        if (this.business?.id === businessId) {
          this.customerMessageKind = 'warning';
          this.customerMessage = this.t(
            'تم حفظ العميل، لكن تعذر تحديث القائمة. لا تضف العميل مرة أخرى؛ حدّث البيانات أولًا.',
            'The customer was saved, but the list could not refresh. Do not add the customer again; refresh the data first.'
          );
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
      this.error = this.t('اختَر ملف CSV فقط.', 'Choose a CSV file only.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error = this.t('حجم الملف يتجاوز 5 ميجابايت.', 'The file exceeds 5 MiB.');
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
      if (this.business?.id === businessId) this.error = this.t('تعذرت قراءة الملف.', 'Could not read the file.');
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
      this.importMessage = this.t(
        `تم استيراد ${result.row_count} صف بنجاح.`,
        `Successfully imported ${result.row_count} rows.`
      );
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
          this.importMessage = this.t(
            'تم استيراد المنتجات، لكن تعذر تحديث القائمة. لا تعِد استيراد الملف؛ حدّث البيانات أولًا.',
            'Products were imported, but the list could not refresh. Do not import the file again; refresh the data first.'
          );
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
      this.error = this.t('اختَر ملف CSV فقط.', 'Choose a CSV file only.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error = this.t('حجم الملف يتجاوز 5 ميجابايت.', 'The file exceeds 5 MiB.');
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
      if (this.business?.id === businessId) this.error = this.t('تعذرت قراءة الملف.', 'Could not read the file.');
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
      this.customerImportMessage = this.t(
        `تم استيراد ${result.row_count} صف بنجاح.`,
        `Successfully imported ${result.row_count} rows.`
      );
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
          this.customerImportMessage = this.t(
            'تم استيراد العملاء، لكن تعذر تحديث القائمة. لا تعِد استيراد الملف؛ حدّث البيانات أولًا.',
            'Customers were imported, but the list could not refresh. Do not import the file again; refresh the data first.'
          );
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.customerImportLoading = false;
    }
  }

  importErrorLabel(code: string): string {
    const ar: Record<string, string> = {
      required: 'حقل مطلوب', too_long: 'النص أطول من المسموح',
      invalid_decimal: 'سعر غير صالح (حتى منزلتين عشريتين)',
      invalid_boolean: 'قيمة متابعة المخزون غير صحيحة',
      duplicate_in_file: 'قيمة مكررة داخل الملف',
      already_exists: 'البريد الإلكتروني أو الرمز موجود بالفعل'
    };
    const en: Record<string, string> = {
      required: 'Required field', too_long: 'Text exceeds the allowed length',
      invalid_decimal: 'Invalid price (up to 2 decimal places)',
      invalid_boolean: 'Invalid stock tracking value',
      duplicate_in_file: 'Duplicate email or SKU in this file',
      already_exists: 'Email or SKU already exists'
    };
    return (this.language === 'ar' ? ar : en)[code] || code;
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
      this.productMessage = this.t('تم حفظ المنتج بنجاح.', 'Product saved successfully.');
      try {
        const products = await this.api.products(businessId);
        if (this.business?.id !== businessId) return;
        this.setProductPage(products);
        if (this.products.length) this.invoiceProductId = this.products[0].id;
      } catch {
        if (this.business?.id === businessId) {
          this.productMessageKind = 'warning';
          this.productMessage = this.t(
            'تم حفظ المنتج، لكن تعذر تحديث القائمة. لا تضف المنتج مرة أخرى؛ حدّث البيانات أولًا.',
            'The product was saved, but the list could not refresh. Do not add the product again; refresh the data first.'
          );
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
      this.error = this.t('أدخل نسب خصم وضريبة صحيحة من 0 إلى 100.', 'Enter valid discount and tax rates from 0 to 100.');
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
        ? this.t('تم تحديث مسودة الفاتورة. الإجماليات المعروضة واردة من الخادم.', 'Invoice draft updated. Displayed totals came from the server.')
        : this.t('تم حفظ مسودة الفاتورة. الإجماليات المعروضة واردة من الخادم.', 'Invoice draft saved. Displayed totals came from the server.');
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
          this.invoiceMessage = this.t(
            'تم حفظ المسودة، لكن تعذر تحديث القائمة. لا تعاود الحفظ؛ حدّث البيانات أولًا.',
            'Draft saved, but the list could not refresh. Do not save it again; refresh the data first.'
          );
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
        this.invoiceMessage = this.t(
          'رفض الخادم حفظ المسودة قبل الكتابة. صحّح البيانات ثم حاول مرة أخرى.',
          'The server rejected the draft before persistence. Correct the details and try again.'
        );
      } else {
        if (!isCurrent()) return;
        this.pendingInvoiceDraftOutcome = outcomeSnapshot;
        this.invoiceDraftUncertain = true;
        this.error = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t(
          'نتيجة حفظ المسودة غير مؤكدة. تم قفل النموذج لمنع إنشاء فاتورة مكررة؛ تحقّق من حالة الفاتورة.',
          'The draft save outcome is uncertain. The editor is locked to prevent a duplicate invoice; verify its status.'
        );
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
        this.invoiceMessage = this.t(
          'لم تظهر فاتورة بنفس الرقم في أحدث قائمة. لم نُعد إرسال الطلب؛ استمر في التحقق من سجل الفواتير قبل إنشاء فاتورة أخرى.',
          'No invoice with that number appeared in the latest list. The request was not resubmitted; keep verifying the invoice register before creating another invoice.'
        );
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
      this.invoiceMessage = this.t(
        'وجدنا مسودة بنفس الرقم. راجع البنود والإجماليات المعروضة؛ لم نُعد إرسال طلب الحفظ ولم نفترض أن كل التعديلات السابقة تم حفظها.',
        'A draft with that number was found. Review the displayed lines and totals; no save was resubmitted and we have not assumed every attempted edit was persisted.'
      );
    } catch (error) {
      if (isCurrent()) {
        this.error = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t(
          'تعذر التحقق من حالة الفاتورة. سيظل النموذج مقفولًا لمنع التكرار.',
          'Could not verify the invoice status. The editor remains locked to prevent a duplicate.'
        );
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
      this.error = this.t('اسمح بفتح نافذة الطباعة من المتصفح ثم حاول مرة أخرى.', 'Allow pop-ups for printing, then try again.');
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
        throw new Error(this.t('الفاتورة لم تعد صادرة؛ حدّث القائمة قبل الطباعة.', 'This invoice is no longer issued. Refresh the invoice list before printing.'));
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
      const direction = this.language === 'ar' ? 'rtl' : 'ltr';
      const labels = this.language === 'ar'
        ? { title: 'فاتورة', customer: 'العميل', item: 'البند', quantity: 'الكمية', price: 'سعر الوحدة', amount: 'الإجمالي', total: 'الإجمالي المستحق', note: 'مستند مستخرج من سجلات النشاط المحفوظة.' }
        : { title: 'Invoice', customer: 'Customer', item: 'Item', quantity: 'Quantity', price: 'Unit price', amount: 'Line total', total: 'Total due', note: 'Generated from saved business records.' };
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
        (this.language === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save PDF') + '</button></div></body></html>'
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
        throw new Error(this.t('لا تحتوي المسودة على بنود قابلة للتعديل.', 'This draft has no editable invoice lines.'));
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
      this.invoiceMessage = this.t('تم إصدار الفاتورة بنجاح.', 'Invoice issued successfully.');
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
          this.invoiceMessage = this.t(
            'تم إصدار الفاتورة، لكن تعذر تحديث العرض. لا تعاود إصدارها؛ حدّث البيانات أولًا.',
            'The invoice was issued, but the view could not refresh. Do not issue it again; refresh the data first.'
          );
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
      await this.api.voidInvoice(businessId, invoice.id, 'أُلغي بواسطة مستخدم مخوّل في مساحة العمل');
      if (!isCurrent()) return;
      this.pendingInvoiceVoid = null;
      this.confirmationReturnFocus = null;
      if (this.editingInvoiceId === invoice.id) this.cancelInvoiceEdit();
      this.invoiceMessage = this.t('تم إلغاء الفاتورة بنجاح.', 'Invoice voided successfully.');
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
          this.invoiceMessage = this.t(
            'تم إلغاء الفاتورة، لكن تعذر تحديث العرض. لا تعاود الإلغاء؛ حدّث البيانات أولًا.',
            'The invoice was voided, but the view could not refresh. Do not void it again; refresh the data first.'
          );
        }
      }
    } catch (error) {
      if (isCurrent()) {
        this.invoiceVoidError = this.message(error);
        this.invoiceMessageKind = 'warning';
        this.invoiceMessage = this.t(
          'تعذر تأكيد نتيجة الإلغاء. لا تعاود المحاولة قبل تحديث حالة الفاتورة.',
          'Could not confirm the void result. Do not retry until the invoice status is refreshed.'
        );
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
      this.error = this.t('هناك محاولة دفع نتيجتها غير مؤكدة. أعد المحاولة بنفس الطلب قبل اختيار فاتورة أخرى.', 'A payment attempt has an uncertain outcome. Retry the same request before selecting another invoice.');
      return;
    }
    if (!this.business || this.business.role !== 'owner' || invoice.status !== 'issued') return;
    if (!invoice.customer_id || invoice.outstanding_amount === undefined) {
      this.error = this.t('تعذر تحديد العميل أو الرصيد المستحق. حدّث البيانات وحاول مرة أخرى.', 'Could not determine the customer or outstanding balance. Refresh data and try again.');
      return;
    }
    const outstanding = Number(invoice.outstanding_amount);
    if (!Number.isFinite(outstanding) || outstanding <= 0) {
      this.error = this.t('الفاتورة مسددة بالكامل أو لا يوجد رصيد مستحق.', 'This invoice is fully paid or has no outstanding balance.');
      return;
    }
    this.error = '';
    this.tab = 'payments';
    this.paymentCustomerId = invoice.customer_id;
    this.paymentInvoiceId = invoice.id;
    this.paymentAmount = outstanding.toFixed(2);
    this.paymentAllocationAmount = outstanding.toFixed(2);
    this.paymentMessage = this.t('تم اختيار الفاتورة وتحديد الرصيد المستحق. راجع المبلغ وطريقة الدفع ثم سجّل الدفعة.', 'Invoice selected and outstanding balance filled in. Review the amount and method, then record the payment.');
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
      this.error = this.t('أدخل تصنيفًا ووصفًا ومبلغًا أكبر من صفر.', 'Enter a category, description, and a positive amount.');
      return;
    }
    if (!this.expenseDate || !Number.isFinite(occurredAt.getTime())) {
      this.error = this.t('أدخل تاريخًا ووقتًا صحيحين للمصروف.', 'Enter a valid expense date and time.');
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
      this.expenseMessage = this.t('تم تسجيل المصروف بنجاح.', 'Expense recorded successfully.');
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
          this.error = this.t('تم تسجيل المصروف، لكن تعذر تحديث القائمة. أعد تحميل البيانات.', 'Expense was saved, but the list could not refresh. Reload workspace data.');
        }
      }
    } catch (error) {
      if (this.business?.id === businessId) {
        this.expenseSubmissionUncertain = true;
        this.error = this.t('تعذر تأكيد نتيجة حفظ المصروف. حدّث القائمة قبل إعادة المحاولة.', 'Could not confirm the expense save result. Refresh the list before retrying.') + ' ' + this.message(error);
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
      this.expenseMessage = this.t('تم تحديث القائمة. راجع آخر المصروفات قبل إعادة المحاولة.', 'Expense list refreshed. Review recent entries before retrying.');
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
        this.error = this.t('اختَر العميل وأدخل مبلغ الدفعة.', 'Choose a customer and enter the payment amount.');
        return;
      }
      const allocation = String(this.paymentAllocationAmount ?? '').trim();
      if (this.paymentInvoiceId && !allocation) {
        this.error = this.t('أدخل المبلغ المراد تخصيصه للفاتورة المحددة.', 'Enter the amount to allocate to the selected invoice.');
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
      this.paymentMessage = this.t('تم تسجيل الدفعة بنجاح.', 'Payment recorded successfully.');
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
          this.paymentMessage = this.t(
            'تم تسجيل الدفعة، لكن تعذر تحديث العرض. لا تعاود تسجيل الدفعة؛ حدّث البيانات أولًا.',
            'Payment was recorded, but the view could not refresh. Do not record it again; refresh the data first.'
          );
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
        this.paymentMessage = this.t(
          'لم نتمكن من تأكيد نتيجة الدفعة. أعد المحاولة بنفس البيانات دون تغييرها؛ تم الاحتفاظ بنفس الطلب ومفتاح التكرار.',
          'The payment outcome is uncertain. Retry the exact same details; the original payload and idempotency key were preserved.'
        );
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
    this.chatMessages = [...this.chatMessages, { role: 'user', content: question }];
    this.chatDraft = '';
    this.chatSending = true;
    this.chatError = '';
    this.error = '';

    await runTenantScopedRequest(
      this.chatRequestGuard,
      requestContext,
      () => this.currentChatRequestContext(),
      () => this.api.chat(requestContext.workspaceId, question, history),
      {
        onSuccess: (reply: ChatReply) => {
          this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources, mode: reply.mode }];
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
        },
      },
    );
  }

  private message(error: unknown, context: 'auth' | 'api' = 'api'): string {
    const value = error as { code?: string; message?: string };
    const code = typeof value?.code === 'string' ? value.code : '';
    const message = typeof value?.message === 'string' ? value.message : '';
    const authMessages: Record<string, string> = {
      'auth/email-already-in-use': 'هذا البريد لديه حساب بالفعل. سجّل الدخول أو استخدم بريدًا آخر.',
      'auth/invalid-email': 'أدخل بريدًا إلكترونيًا صحيحًا.',
      'auth/weak-password': 'اختر كلمة مرور أقوى من 6 أحرف على الأقل.',
      'auth/operation-not-allowed': 'التسجيل بالبريد الإلكتروني وكلمة المرور غير مفعّل في Firebase Authentication. فعّل مزوّد البريد الإلكتروني وكلمة المرور من وحدة تحكم Firebase.',
      'auth/unauthorized-domain': 'نطاق الموقع غير مصرح به في Firebase Authentication. أضف ai-business-assistant-web.vercel.app إلى النطاقات المصرح بها.',
      'auth/network-request-failed': 'تعذر الاتصال بخدمة Firebase Authentication. تحقق من الإنترنت وقيود مفتاح Firebase ثم حاول مجددًا.',
      'auth/too-many-requests': 'حظر Firebase المحاولات المتكررة مؤقتًا. انتظر قليلًا ثم حاول مجددًا.'
    };
    if (code && authMessages[code]) {
      if (this.language === 'ar') return authMessages[code];
      const englishAuthMessages: Record<string, string> = {
        'auth/email-already-in-use': 'This email already has an account. Sign in or use another email.',
        'auth/invalid-email': 'Enter a valid email address.',
        'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
        'auth/operation-not-allowed': 'Email/Password sign-in is disabled. Enable it in Firebase Authentication.',
        'auth/unauthorized-domain': 'This site domain is not authorized. Add the current domain to Firebase Authentication authorized domains.',
        'auth/network-request-failed': 'Could not reach Firebase Authentication. Check your connection and Firebase settings.',
        'auth/too-many-requests': 'Firebase temporarily blocked repeated attempts. Wait a little and try again.'
      };
      return englishAuthMessages[code] || authMessages[code];
    }
    const deniedMessage = message.trim();
    if (deniedMessage === 'Authentication required' || deniedMessage === 'Authenticated subject is missing') {
      return this.t(
        'انتهت صلاحية جلسة الدخول أو تعذر التحقق منها. سجّل الخروج ثم سجّل الدخول مرة أخرى.',
        'Your sign-in session is no longer valid or could not be verified. Sign out and sign in again.'
      );
    }
    if (deniedMessage === 'Platform administrator access is not granted.') {
      return this.t(
        'حسابك غير مخوّل للوصول إلى إدارة المنصة. إذا كنت تحتاج هذه الصلاحية، راجع مسؤول المنصة.',
        'Your account is not authorized to access platform administration. Contact the platform administrator if you need this access.'
      );
    }
    if ([
      'No active membership for this business',
      'Business role is not permitted for this operation',
      'No access to this business workspace.'
    ].includes(deniedMessage) || /^(?:forbidden|permission denied|not authorized|access denied)\b/i.test(deniedMessage)) {
      return this.t(
        'لا تملك الصلاحية للوصول إلى مساحة العمل أو تنفيذ هذا الإجراء. اطلب من مالك مساحة العمل مراجعة دورك.',
        'You do not have permission to access this workspace or perform this action. Ask the workspace owner to review your role.'
      );
    }
    if (/AI chat is not configured/i.test(message)) return this.t('المساعد الذكي غير مفعّل على الخادم بعد. يلزم ضبط OPENAI_API_KEY في إعدادات Environment Variables لمشروع ai-business-assistant-api على Vercel ثم إعادة النشر. لم أضف مفتاحًا أو خدمة مدفوعة من دون موافقتك.', 'The AI assistant is not enabled on the backend yet. Set OPENAI_API_KEY in the ai-business-assistant-api Vercel project environment variables, then redeploy. No key or paid service was added without your approval.');
    if (/timed out/i.test(message)) return this.t('انتهت مهلة التحقق من إعدادات التطبيق أو جلسة الدخول. تحقق من الاتصال ثم اضغط «إعادة المحاولة».', 'App configuration or sign-in verification timed out. Check your connection, then choose Retry.');
    if (message.startsWith('API_CONNECTION_FAILED:')) return this.t('تعذر الاتصال بخادم البيانات. تحقق من الإنترنت وإعداد CORS_ALLOWED_ORIGINS في الخادم ثم أعد المحاولة.', 'Could not reach the business API. Check your internet connection and the server CORS_ALLOWED_ORIGINS setting, then retry.');
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      if (context === 'auth') return this.t('تعذر الاتصال بخدمة Firebase Authentication. تحقق من الإنترنت وتفعيل تسجيل الدخول بالبريد وكلمة المرور وإضافة نطاق الموقع إلى النطاقات المصرح بها في Firebase.', 'Could not reach Firebase Authentication. Check your internet, enable Email/Password sign-in, and authorize this site domain in Firebase.');
      return this.t('تعذر الوصول إلى الخدمة. تحقق من اتصال الإنترنت وإعدادات API وCORS ثم حاول مجددًا.', 'The service could not be reached. Check your internet connection, API availability, and CORS settings, then retry.');
    }
    if (message) return message;
    return this.t('حدث خطأ غير متوقع. حاول مجددًا.', 'An unexpected error occurred. Please try again.');
  }
}
