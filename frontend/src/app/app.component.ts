import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AuditEvent, Business, ChatReply, Customer, CustomerStatement, Dashboard, DataIntegrityReport, Expense, Invoice, Payment, Product, ProfitLossReport, ReceivablesAgingReport, NotificationRecord, OperationalHealth, PurchaseOrder, RecurringInvoiceSchedule, Supplier, TaxSummaryReport } from './api.service';
import { AuthService, type AuthUserSnapshot } from './auth.service';
import { WorkspaceLoadGuard, type TenantRequestContext, runTenantScopedRequest } from './workspace-load-guard';
import { APP_BUILD_INFO } from './build-info';
import { buildCsv } from './csv-export';
import { filterCustomers, filterInvoices, filterProducts } from './record-filters';
import { FEATURE_CATALOG, RELEASE_HISTORY } from './release-guide';
import { PlatformAdminComponent } from './platform-admin.component';
import { EmployeePayrollComponent } from './employee-payroll.component';
import { canAccessWorkspaceTab, isMobileMoreTab as isMobileMoreTabValue } from './module-access';
import { WORKSPACE_MODULE_CATALOG, WORKSPACE_MODULE_GROUPS, type WorkspaceModuleCard, type WorkspaceModuleGroup } from './workspace-module-catalog';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaMetricCardComponent } from './shared/ui/aba-metric-card.component';
import { AbaQuickAccessCardComponent } from './shared/ui/aba-quick-access-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'expenses' | 'employees' | 'assistant' | 'reports' | 'taxes' | 'audit' | 'integrity' | 'release-guide' | 'platform-admin' | 'suppliers' | 'purchases' | 'recurring' | 'notifications' | 'health';

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PlatformAdminComponent, EmployeePayrollComponent, AbaCardComponent, AbaMetricCardComponent, AbaQuickAccessCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent],
  template: `
    <div class="shell" [class.english]="language === 'en'" [class.keyboard-open]="keyboardOpen" [class.install-help-open]="installHelp && !isInstalled" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'" (keydown.escape)="closeMobileMoreOnEscape()">
      @if (!isInstalled) { <button class="secondary install-button install-floating" type="button" (click)="installApp()">{{ t('تثبيت التطبيق', 'Install app') }}</button> }
      @if (installHelp && !isInstalled) { <div class="install-help install-help-floating" role="status">{{ t('لو لم تظهر نافذة التثبيت: افتح قائمة المتصفح ⋮ ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'If no install prompt appears, open the browser menu and choose “Install app” or “Add to Home screen”.') }}<button type="button" class="secondary" (click)="installHelp = false">{{ t('حسنًا', 'Got it') }}</button></div> }
      @if (loading) { <div class="global-loading" role="status" aria-live="polite"><span></span><span class="loading-label">{{ t('جارٍ التحميل…', 'Loading…') }}</span></div> }
      @if (!initialized) {
        <main class="auth-card" role="status" aria-live="polite">
          <div class="brand-mark">A</div>
          <span class="version-pill splash-version" [attr.title]="t('إصدار الواجهة وواجهة API', 'UI and API release versions') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel + ' · Build time (Cairo): ' + buildTimeLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
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
          <h1>{{ signingUp ? t('إنشاء حسابك', 'Create your account') : t('مرحبًا بعودتك', 'Welcome back') }}</h1>
          <p class="muted">{{ t('سجّل الدخول بأمان للوصول إلى مساحات العمل المصرح لك بها فقط.', 'Sign in securely to access only the workspaces you belong to.') }}</p>
          <form (ngSubmit)="submitAuth()" class="stack">
            <label>{{ t('البريد الإلكتروني', 'Email address') }}<input name="email" type="email" autocomplete="email" required [(ngModel)]="email"></label>
            <label>{{ t('كلمة المرور', 'Password') }}<input name="password" type="password" [attr.autocomplete]="signingUp ? 'new-password' : 'current-password'" minlength="6" required [(ngModel)]="password"></label>
            <button class="primary" type="submit" [disabled]="loading">{{ loading ? t('جارٍ التنفيذ…', 'Working…') : (signingUp ? t('إنشاء الحساب', 'Create account') : t('تسجيل الدخول', 'Sign in')) }}</button>
          </form>
          <button class="text-button" type="button" (click)="signingUp = !signingUp">{{ signingUp ? t('لديك حساب بالفعل؟ سجّل الدخول', 'Already have an account? Sign in') : t('مستخدم جديد؟ أنشئ حسابًا', 'New here? Create an account') }}</button>
          @if (error) { <aba-state-message kind="error" [description]="error" /><button class="secondary auth-retry" type="button" (click)="initializeApp()" [disabled]="loading">{{ loading ? t('جارٍ التحقق…', 'Checking…') : t('إعادة المحاولة', 'Retry startup') }}</button> }
        </main>
      } @else {
        <aside class="sidebar" role="navigation" [attr.aria-label]="t('التنقل الرئيسي', 'Main navigation')">
          <a class="brand" href="#" (click)="$event.preventDefault(); setTab('overview')"><span class="brand-mark small">A</span><span>مساعد<span class="light">الأعمال</span></span></a>
          <p class="nav-label">{{ t('مساحة العمل', 'Workspace') }}</p>
          <button class="nav-item" [attr.aria-label]="t('الرئيسية', 'Home')" [attr.title]="t('الرئيسية', 'Home')" [class.active]="tab === 'overview'" [attr.aria-current]="tab === 'overview' ? 'page' : null" (click)="setTab('overview')"><span class="nav-icon overview-icon" aria-hidden="true">⌂</span><span>{{ t('الرئيسية', 'Home') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('الأرباح والخسائر', 'Profit & loss')" [attr.title]="t('الأرباح والخسائر', 'Profit & loss')" [class.active]="tab === 'reports'" [attr.aria-current]="tab === 'reports' ? 'page' : null" (click)="setTab('reports')"><span class="nav-icon" aria-hidden="true">∑</span><span>{{ t('الأرباح والخسائر', 'Profit & loss') }}</span></button>
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
              @for (group of mobileMoreGroups; track group.id) {
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
              <div class="mobile-more-actions">
                <button class="nav-item mobile-menu-action" type="button" (click)="toggleLanguage()"><span class="nav-icon" aria-hidden="true">文</span><span>{{ language === 'ar' ? 'English' : 'العربية' }}</span></button>
                <button class="nav-item mobile-menu-action" type="button" (click)="logout()"><span class="nav-icon" aria-hidden="true">↪</span><span>{{ t('تسجيل الخروج', 'Sign out') }}</span></button>
              </div>
            </nav>
          }
          <div class="sidebar-bottom"><span class="status-dot"></span> {{ t('جلسة موثّقة', 'Verified session') }}<small>{{ t('يتحقق الخادم من صلاحيات مساحة العمل', 'The server verifies workspace permissions') }}</small></div>
        </aside>
        <main class="main">
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
            <div class="topbar-heading"><div class="workspace-build-card" [attr.aria-label]="t('إصدار التطبيق ووقت البناء', 'App version and build time')"><span class="version-pill">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span><small>{{ t('وقت البناء', 'Build time') }} · {{ buildTimeLabel }}</small></div><p class="eyebrow">{{ t('مساحة العمل', 'Workspace') }}</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area">@if (!isInstalled) { <button class="secondary install-button" type="button" (click)="installApp()">{{ t('تثبيت التطبيق', 'Install app') }}</button> }<button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? 'English' : 'العربية' }}</button><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">{{ t('تسجيل الخروج', 'Sign out') }}</button></div>
          </header>

          @if (error) { <aba-state-message kind="error" [description]="error" [actionLabel]="t('إعادة المحاولة', 'Retry')" (action)="retry()" /> }
          @if (loading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل بيانات مساحة العمل…', 'Loading workspace data…')" /> }

          @if (!business) {
            <section abaCard class="panel narrow">
              <p class="eyebrow">{{ t('ابدأ هنا', 'GET STARTED') }}</p><h2>{{ t('أنشئ مساحة عملك الأولى', 'Create your first workspace') }}</h2>
              <p class="muted">{{ t('مساحة العمل مرتبطة بحسابك الذي تم التحقق منه. لا يمكن للمستخدمين الآخرين الوصول إليها دون عضوية.', 'This workspace belongs to your verified account. Other users cannot access it without membership.') }}</p>
              <form class="stack" (ngSubmit)="createWorkspace()">
                <label>{{ t('اسم النشاط التجاري', 'Business name') }}<input name="businessName" required maxlength="160" [(ngModel)]="businessName"></label>
                <label>{{ t('العملة الافتراضية', 'Default currency') }}<select name="currency" [(ngModel)]="currencyCode"><option value="EGP">جنيه مصري</option><option value="USD">دولار أمريكي</option><option value="EUR">يورو</option><option value="GBP">جنيه إسترليني</option><option value="SAR">ريال سعودي</option><option value="AED">درهم إماراتي</option></select></label>
                <button class="primary" type="submit" [disabled]="loading">{{ t('إنشاء مساحة عمل', 'Create workspace') }}</button>
              </form>
            </section>
          } @else {
            <section class="workspace-bar">
              <div class="workspace-current"><span class="eyebrow">{{ t('النشاط الحالي', 'Current business') }}</span><strong>{{ business.name }}</strong></div>
              <select [attr.aria-label]="t('اختيار النشاط', 'Select business')" [ngModel]="selectedBusinessId" (ngModelChange)="switchBusiness($event)">
                @for (item of businesses; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
              </select>
              <div class="workspace-release-meta workspace-release-meta-inline" [attr.aria-label]="t('إصدار التطبيق ووقت النشر', 'App version and deployment time')">
                <span class="version-pill" [attr.title]="t('إصدار الواجهة وواجهة API', 'UI and API release versions') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
                <small>{{ t('وقت بناء النسخة:', 'Build time:') }} {{ buildTimeLabel }}</small>
              </div>
            </section>

            @if (tab === 'overview') {
              <section class="hero">
                <div><p class="eyebrow light">{{ t('ملخص النشاط', 'BUSINESS SUMMARY') }}</p><h2>{{ t('القرارات الأفضل تبدأ', 'Better decisions start') }}<br>{{ t('بأرقام موثوقة.', 'with reliable numbers.') }}</h2><p>{{ t('يعرض النشاط المسجّل خلال آخر 30 يومًا. يتم فصل الإجماليات حسب العملة.', 'Shows recorded activity for the last 30 days. Totals are separated by currency.') }}</p></div>
                <div class="hero-mark" aria-hidden="true">AI</div>
              </section>
              @if (dashboard) {
                <section class="metric-grid">
                  <aba-metric-card><span metricLabel>{{ t('المبيعات بالفواتير', 'Invoiced sales') }}</span>@for (item of dashboard.invoiced_sales; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} {{ t('فاتورة صادرة', 'issued invoices') }}</small> } @if (!dashboard.invoiced_sales.length) { <strong>0</strong><small>{{ t('لا توجد مبيعات بفواتير صادرة خلال الفترة', 'No invoiced sales in this period') }}</small> }</aba-metric-card>
                  <aba-metric-card><span metricLabel>{{ t('المدفوعات المحصّلة', 'Payments collected') }}</span>@for (item of dashboard.collected_payments; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} {{ t('دفعة مسجلة', 'recorded payments') }}</small> } @if (!dashboard.collected_payments.length) { <strong>0</strong><small>{{ t('لا توجد مدفوعات مسجلة خلال الفترة', 'No payments recorded in this period') }}</small> }</aba-metric-card>
                  <aba-metric-card><span metricLabel>{{ t('المصروفات', 'Expenses') }}</span>@for (item of dashboard.expenses; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} {{ t('مصروف مسجل', 'recorded expenses') }}</small> } @if (!dashboard.expenses.length) { <strong>0</strong><small>{{ t('لا توجد مصروفات مسجلة خلال الفترة', 'No expenses recorded in this period') }}</small> }</aba-metric-card>
                  <aba-metric-card><span metricLabel>{{ t('الأرصدة المستحقة', 'Outstanding balances') }}</span>@for (item of dashboard.outstanding_balances; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ t('الفواتير الصادرة بعد خصم المبالغ المخصصة', 'Issued invoices after allocated payments') }}</small> } @if (!dashboard.outstanding_balances.length) { <strong>0</strong><small>{{ t('لا توجد فواتير مستحقة خلال الفترة', 'No outstanding invoices in this period') }}</small> }</aba-metric-card>
                </section>
              }
              <section class="notice"><strong>{{ t('سلامة البيانات', 'Data integrity') }}</strong><span>{{ t('الإجماليات مأخوذة من سجلات النشاط المحفوظة. لا تمثل حسابًا للأرباح ولا يتم دمج العملات المختلفة.', 'Totals come from saved business records. They are not a profit calculation, and different currencies are never combined.') }}</span></section>
              <section abaCard class="panel module-launcher" aria-labelledby="module-launcher-title">
                <aba-section-header [titleId]="'module-launcher-title'" [title]="t('كل أقسام التطبيق', 'All modules')" [description]="t('افتح القسم المطلوب مباشرة من مساحة العمل.', 'Open any available workspace module directly.')" [count]="homeModuleCards.length" />
                <div class="quick-grid">
                  @for (module of homeModuleCards; track module.tab) {
                    <aba-quick-access-card
                      [icon]="module.icon"
                      [title]="t(module.titleAr, module.titleEn)"
                      [description]="t(module.descriptionAr, module.descriptionEn)"
                      (activated)="setTab(module.tab)" />
                  }
                </div>
              </section>
              
            }

            @if (tab === 'notifications') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('قائمة الإشعارات', 'Notification queue') " [description]=" t('يتم حفظ بيانات الإشعار وحالته فقط؛ الإرسال الفعلي يحتاج مزودًا وعامل تسليم منشورًا.', 'This stores notification metadata and status only; delivery requires a configured provider and deployed worker.') "><span class="count">{{ notifications.length }}</span></aba-section-header>
                <form class="stack" (ngSubmit)="createNotification()">
                  <label>{{ t('نوع الإشعار', 'Notification type') }}<select name="notificationKind" required [(ngModel)]="notificationKind">
                    <option value="businesses">{{ t('مساحات العمل', 'Businesses') }}</option>
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
                  <label>{{ t('العنوان', 'Title') }}<input name="notificationTitle" required maxlength="160" [(ngModel)]="notificationTitle"></label>
                  <label>{{ t('المحتوى', 'Message') }}<textarea name="notificationBody" required maxlength="1000" rows="3" [(ngModel)]="notificationBody"></textarea></label>
                  <label>{{ t('موعد الإرسال (اختياري)', 'Scheduled time (optional)') }}<input name="notificationScheduledAt" type="datetime-local" [(ngModel)]="notificationScheduledAt"></label>
                  <button class="primary" type="submit" [disabled]="notificationsLoading">{{ t('إضافة إلى قائمة الانتظار', 'Queue notification') }}</button>
                </form>
                @if (operationsError) { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (notificationsLoading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل الإشعارات…', 'Loading notifications…')" /> }
                <div class="list">@for (item of notifications; track item.id) { <article class="list-row"><div class="invoice-mark">♢</div><div class="grow"><strong>{{ item.title }}</strong><small>{{ notificationKindLabel(item.kind) }} · {{ item.status }}</small><small>{{ item.scheduled_at ? (item.scheduled_at | date:'medium') : t('بدون موعد محدد', 'Unscheduled') }} · {{ item.created_at ? (item.created_at | date:'short') : '' }}</small><p class="muted">{{ item.body }}</p></div></article> } @if (!notifications.length && !notificationsLoading) { <aba-state-message kind="empty" [description]="t('قائمة الإشعارات فارغة.', 'Notification queue is empty.')" /> }</div>
              </section>
            }


@if (tab === 'suppliers') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('دليل الموردين', 'Supplier directory') " [description]=" t('بيانات الموردين مرتبطة بمساحة العمل الحالية.', 'Supplier records belong to the current workspace.') "><span class="count">{{ suppliers.length }}</span></aba-section-header>
                <form class="inline-form" (ngSubmit)="createSupplier()">
                  <input name="supplierName" required maxlength="160" [attr.aria-label]="t('اسم المورد', 'Supplier name')" [placeholder]="t('اسم المورد', 'Supplier name')" [(ngModel)]="supplierName">
                  <input name="supplierEmail" type="email" maxlength="254" [attr.aria-label]="t('البريد الإلكتروني', 'Email')" [placeholder]="t('البريد الإلكتروني (اختياري)', 'Email (optional)')" [(ngModel)]="supplierEmail">
                  <input name="supplierPhone" maxlength="32" [attr.aria-label]="t('الهاتف', 'Phone')" [placeholder]="t('الهاتف (اختياري)', 'Phone (optional)')" [(ngModel)]="supplierPhone">
                  <input name="supplierAddress" maxlength="500" [attr.aria-label]="t('العنوان', 'Address')" [placeholder]="t('العنوان (اختياري)', 'Address (optional)')" [(ngModel)]="supplierAddress">
                  <button class="primary" type="submit" [disabled]="suppliersLoading">{{ t('إضافة مورد', 'Add supplier') }}</button>
                </form>
                @if (operationsError) { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (suppliersLoading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل الموردين…', 'Loading suppliers…')" /> }
                <div class="list">@for (supplier of suppliers; track supplier.id) { <article class="list-row"><div class="avatar">{{ supplier.name.slice(0,1).toUpperCase() }}</div><div class="grow"><strong>{{ supplier.name }}</strong><small>{{ supplier.email || t('لا يوجد بريد إلكتروني', 'No email') }} · {{ supplier.phone || t('لا يوجد هاتف', 'No phone') }}</small><small>{{ supplier.address || '' }}</small></div></article> } @if (!suppliers.length && !suppliersLoading) { <aba-state-message kind="empty" [description]="t('لا يوجد موردون بعد.', 'No suppliers yet.')" /> }</div>
              </section>
            }


@if (tab === 'purchases') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('أوامر الشراء', 'Purchase orders') " [description]=" t('استلام الكميات يسجل حركات مخزون؛ اعتماد الاستلام متاح للمالك فقط.', 'Receiving records stock movements; only owners can receive orders.') "><span class="count">{{ purchaseOrders.length }}</span></aba-section-header>
                <form class="stack" (ngSubmit)="createPurchaseOrder()">
                  <label>{{ t('رقم أمر الشراء', 'Order number') }}<input name="purchaseOrderNumber" required maxlength="64" [(ngModel)]="purchaseOrderNumber"></label>
                  <label>{{ t('المورد', 'Supplier') }}<select name="purchaseSupplierId" required [(ngModel)]="purchaseSupplierId"><option value="" disabled>{{ t('اختر المورد', 'Choose supplier') }}</option>@for (supplier of suppliers; track supplier.id) { <option [value]="supplier.id">{{ supplier.name }}</option> }</select></label>
                  <label>{{ t('المنتج', 'Product') }}<select name="purchaseProductId" required [(ngModel)]="purchaseProductId"><option value="" disabled>{{ t('اختر المنتج', 'Choose product') }}</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.sku || product.id.slice(0,8) }}</option> }</select></label>
                  <div class="inline-form"><label>{{ t('الكمية', 'Quantity') }}<input name="purchaseQuantity" type="number" min="0.001" step="0.001" required [(ngModel)]="purchaseQuantity"></label><label>{{ t('تكلفة الوحدة', 'Unit cost') }}<input name="purchaseUnitCost" type="number" min="0" step="0.01" required [(ngModel)]="purchaseUnitCost"></label></div>
                  <button class="primary" type="submit" [disabled]="purchasesLoading || !suppliers.length || !products.length">{{ t('إنشاء أمر شراء', 'Create purchase order') }}</button>
                </form>
                @if (operationsError) { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (purchasesLoading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل المشتريات…', 'Loading purchasing…')" /> }
                <div class="list">@for (order of purchaseOrders; track order.id) { <article class="list-row"><div class="invoice-mark">⇩</div><div class="grow"><strong>{{ order.order_number }} · {{ supplierNameFor(order.supplier_id) }}</strong><small>{{ order.status }} · {{ order.total }} {{ order.currency_code }}</small><small>@for (line of order.lines; track line.id) { {{ productNameFor(line.product_id) }}: {{ line.received_quantity }}/{{ line.quantity }} · {{ line.remaining_quantity }} {{ t('متبقي', 'remaining') }}; }</small></div>@if (business?.role === 'owner' && order.lines.some(hasRemainingQuantity)) { <button class="secondary" type="button" (click)="receivePurchaseOrder(order)" [disabled]="purchasesLoading">{{ t('استلام المتبقي', 'Receive remaining') }}</button> }</article> } @if (!purchaseOrders.length && !purchasesLoading) { <aba-state-message kind="empty" [description]="t('لا توجد أوامر شراء بعد.', 'No purchase orders yet.')" /> }</div>
              </section>
            }


@if (tab === 'recurring') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('جدولة الفواتير الدورية', 'Recurring invoice schedules') " [description]=" t('هذه إعدادات الجدولة فقط؛ إنشاء الفواتير تلقائيًا يحتاج عامل جدولة منشورًا.', 'These are schedule settings only; automatic invoice generation requires a deployed scheduler worker.') "><span class="count">{{ recurringSchedules.length }}</span></aba-section-header>
                <form class="stack" (ngSubmit)="createRecurringSchedule()">
                  <label>{{ t('العميل (اختياري)', 'Customer (optional)') }}<select name="recurringCustomerId" [(ngModel)]="recurringCustomerId"><option value="">{{ t('بدون عميل محدد', 'No specific customer') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select></label>
                  <div class="inline-form"><label>{{ t('الفاصل بالأيام', 'Interval in days') }}<input name="recurringIntervalDays" type="number" min="1" max="3650" required [(ngModel)]="recurringIntervalDays"></label><label>{{ t('التشغيل التالي', 'Next run') }}<input name="recurringNextRunAt" type="datetime-local" required [(ngModel)]="recurringNextRunAt"></label></div>
                  <label>{{ t('المنطقة الزمنية', 'Timezone') }}<input name="recurringTimezone" required maxlength="64" [(ngModel)]="recurringTimezone"></label>
                  <button class="primary" type="submit" [disabled]="recurringLoading">{{ t('حفظ الجدولة', 'Save schedule') }}</button>
                </form>
                @if (operationsError) { <aba-state-message kind="error" [description]="operationsError" /> }
                @if (recurringLoading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل الجداول…', 'Loading schedules…')" /> }
                <div class="list">@for (schedule of recurringSchedules; track schedule.id) { <article class="list-row"><div class="invoice-mark">↻</div><div class="grow"><strong>{{ schedule.customer_id ? customerNameForInvoice(schedule.customer_id) : t('عميل غير محدد', 'No customer assigned') }}</strong><small>{{ schedule.interval_days }} {{ t('يومًا', 'days') }} · {{ schedule.timezone }}</small><small>{{ schedule.next_run_at | date:'medium' }} · {{ schedule.is_active ? t('نشطة', 'Active') : t('متوقفة', 'Inactive') }}</small></div></article> } @if (!recurringSchedules.length && !recurringLoading) { <aba-state-message kind="empty" [description]="t('لا توجد جداول بعد.', 'No schedules yet.')" /> }</div>
              </section>
            }


@if (tab === 'health' && business?.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('الحالة التشغيلية', 'Operational health') " [description]=" t('فحص قراءة فقط للاتصال بقاعدة البيانات وحالة الإعدادات الأساسية.', 'Read-only check of database connectivity and core service configuration.') "><span class="count">{{ operationalHealth?.status || t('غير مفحوص', 'Not checked') }}</span></aba-section-header>
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
                <aba-section-header [title]=" t('الأرباح والخسائر', 'Profit & loss') " [description]=" t('تابع الإيرادات والمصروفات حسب الفترة، مع إبقاء كل عملة منفصلة.', 'Review revenue and expenses by period, keeping each currency separate.') "><span class="count">{{ t('تقرير مالي', 'Financial report') }}</span></aba-section-header>
                <form class="inline-form" (ngSubmit)="loadProfitLoss()">
                  <select name="profitLossPeriod" [attr.aria-label]="t('الفترة المالية', 'Reporting period')" [(ngModel)]="profitLossPeriod"><option value="30d">{{ t('آخر 30 يومًا', 'Last 30 days') }}</option><option value="month">{{ t('الشهر الحالي', 'Current month') }}</option><option value="all">{{ t('كل الوقت', 'All time') }}</option><option value="custom">{{ t('فترة مخصصة', 'Custom period') }}</option></select>
                  @if (profitLossPeriod === 'custom') { <label>{{ t('من', 'From') }}<input type="date" name="profitLossStart" required [(ngModel)]="profitLossStart"></label><label>{{ t('إلى', 'To') }}<input type="date" name="profitLossEnd" required [(ngModel)]="profitLossEnd"></label> }
                  <button class="primary" type="submit" [disabled]="reportLoading">{{ reportLoading ? t('جارٍ الحساب…', 'Calculating…') : t('عرض التقرير', 'Run report') }}</button>
                </form>
                @if (reportError) { <aba-state-message kind="error" [description]="reportError" /> }
                @if (profitLoss) {
                  <p class="muted">{{ profitLoss.period.start_date || t('من بداية السجلات', 'From the beginning of records') }} — {{ profitLoss.period.end_date || t('حتى الآن', 'through today') }} · {{ profitLoss.period.timezone || 'UTC' }}</p>
                  <p class="muted"><strong>{{ t('أساس الإيراد:', 'Revenue basis:') }}</strong> {{ revenueBasisLabel(profitLoss.revenue_basis) }}</p>
                  <div class="metric-grid">
                    @for (row of profitLoss.currencies; track row.currency_code) {
                      <article class="metric"><span>{{ t('الإيرادات (فواتير صادرة)', 'Revenue (issued invoices)') }}</span><strong>{{ row.revenue }} {{ row.currency_code }}</strong><small>{{ row.revenue_invoice_count }} {{ t('فاتورة', 'invoices') }}</small></article>
                      <article class="metric"><span>{{ t('المرتجعات المعتمدة (من فواتير الفترة)', 'Approved returns (period invoices)') }}</span><strong>{{ row.approved_return_total }} {{ row.currency_code }}</strong><small>{{ row.approved_return_count }} {{ t('مرتجع', 'returns') }} · {{ t('تُعرض منفصلة ولا تُخصم من الإيراد', 'shown separately; not deducted from revenue') }}</small></article>
                      <article class="metric"><span>{{ t('المصروفات المسجلة', 'Recorded expenses') }}</span><strong>{{ row.expenses }} {{ row.currency_code }}</strong><small>{{ row.expense_count }} {{ t('مصروف', 'expenses') }}</small></article>
                      <article class="metric"><span>{{ t('النتيجة قبل تكلفة البضاعة', 'Result before cost of goods') }}</span><strong>{{ row.operating_result_before_cost_of_goods }} {{ row.currency_code }}</strong><small>{{ t('إيرادات الفواتير − المصروفات المسجلة', 'Invoice revenue − recorded expenses') }}</small></article>
                    }
                  </div>
                  @if (!profitLoss.currencies.length) { <aba-state-message kind="empty" [description]="t('لا توجد فواتير صادرة أو مصروفات مسجلة في هذه الفترة.', 'No issued invoices or recorded expenses in this period.')" /> }
                  <div class="notice"><strong>{{ t('مهم قبل اعتبارها أرباحًا صافية', 'Important limitation') }}</strong><span>{{ t('هذا حساب مبدئي: لا يشمل تكلفة شراء البضاعة لأن تكلفة المنتج غير مرتبطة بعد بالمبيعات، كما أن الإيرادات تُحسب من الفواتير الصادرة لا من النقد المحصّل. لا يتم جمع العملات المختلفة.', 'This is a preliminary result: product purchase costs are not yet linked to sales, and revenue is based on issued invoices rather than cash collected. Different currencies are never combined.') }}</span></div>
                }
                <div class="divider"></div>
                <aba-section-header [level]="3" [title]="t('أعمار المديونيات', 'Receivables aging')" [description]="t('الأرصدة المتبقية حسب تاريخ الاستحقاق، مع فصل كل عملة.', 'Outstanding balances by due date, with currencies kept separate.')" />
                <form class="inline-form" (ngSubmit)="loadReceivablesAging()"><label>{{ t('التقرير حتى تاريخ', 'Report as of') }}<input type="date" name="agingAsOf" required [(ngModel)]="agingAsOf"></label><button class="primary" type="submit" [disabled]="agingLoading">{{ agingLoading ? t('جارٍ التحميل…', 'Loading…') : t('عرض المديونيات', 'Load receivables') }}</button></form>
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
                  @if (agingReport.invoices.length) { <div class="list">@for (invoice of agingReport.invoices; track invoice.invoice_id) { <article class="list-row"><div class="grow"><strong>{{ invoice.invoice_number }} · {{ invoice.outstanding_amount }} {{ invoice.currency_code }}</strong><small>{{ agingBucketLabel(invoice.aging_bucket) }} · {{ invoice.due_date || t('بدون تاريخ استحقاق', 'No due date') }}@if (invoice.customer_link_missing) { · {{ t('عميل غير مرتبط — يلزم تدقيق يدوي', 'Missing customer link — manual review required') }} }</small></div></article> }</div> }
                  @if (agingReport.limitations.length) { <div class="notice"><strong>{{ t('حدود التقرير', 'Report limitations') }}</strong>@for (limitation of agingReport.limitations; track limitation) { <p>{{ reportLimitationLabel(limitation) }}</p> }</div> }
                }
              </section>
            }

            @if (tab === 'customers') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('قائمة العملاء', 'Customer list') " [description]=" t('تقتصر السجلات على مساحة العمل المحددة.', 'Records are limited to the selected workspace.') "><span class="count">{{ customers.length }} {{ t('عميل', 'customers') }}</span></aba-section-header>
                <form class="inline-form" (ngSubmit)="createCustomer()">
                  <input [attr.aria-label]="t('اسم العميل', 'Customer name')" name="customerName" [placeholder]="t('اسم العميل', 'Customer name')" required [(ngModel)]="customerName">
                  <input [attr.aria-label]="t('بريد العميل الإلكتروني', 'Customer email')" name="customerEmail" type="email" [placeholder]="t('البريد الإلكتروني (اختياري)', 'Email (optional)')" [(ngModel)]="customerEmail">
                  <input [attr.aria-label]="t('هاتف العميل', 'Customer phone')" name="customerPhone" [placeholder]="t('الهاتف (اختياري)', 'Phone (optional)')" [(ngModel)]="customerPhone">
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة عميل', 'Add customer') }}</button>
                </form>
                <section abaCard class="csv-import-panel" aria-label="CSV customer import">
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
                  @if (customerImportMessage) { <aba-state-message kind="success" [description]="customerImportMessage" /> }
                </section>
                <div class="list-tools"><input name="customerSearch" type="search" [attr.aria-label]="t('البحث عن عميل', 'Search customers')" [placeholder]="t('ابحث بالاسم أو البريد أو الهاتف…', 'Search by name, email, or phone…')" [(ngModel)]="customerSearch"><button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                <div class="list">
                  @for (customer of filteredCustomers; track customer.id) { <article class="list-row customer-list-row"><div class="avatar">{{ customer.name.slice(0,1).toUpperCase() }}</div><div class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.email || t('لا يوجد بريد إلكتروني', 'No email') }} · {{ customer.phone || t('لا يوجد هاتف', 'No phone') }}</small><small>{{ customerInvoiceCount(customer.id) }} {{ t('فاتورة مرتبطة', 'linked invoices') }}</small></div><button class="secondary" type="button" (click)="showCustomerInvoices(customer.id)">{{ t('عرض الفواتير', 'View invoices') }}</button><button class="secondary" type="button" (click)="loadCustomerStatement(customer)">{{ t('كشف الحساب', 'Statement') }}</button></article> }
                  @if (!filteredCustomers.length) { <aba-state-message kind="empty" [description]="customerSearch ? t('لا توجد نتائج مطابقة للبحث.', 'No matching results.') : t('لا يوجد عملاء بعد. أضف أول عميل من النموذج أعلاه.', 'No customers yet. Add your first customer using the form above.')" /> }
                </div>
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
                      <div class="table-wrap audit-table-wrap"><table><thead><tr><th>{{ t('التاريخ', 'Date') }}</th><th>{{ t('الحركة', 'Event') }}</th><th>{{ t('المرجع', 'Reference') }}</th><th>{{ t('مدين', 'Debit') }}</th><th>{{ t('دائن', 'Credit') }}</th><th>{{ t('الرصيد', 'Balance') }}</th></tr></thead><tbody>
                        @for (event of customerStatement.items; track event.source_id + event.event_type) { <tr><td>{{ event.occurred_at | date:'short' }}</td><td>{{ event.event_type }}</td><td>{{ event.reference || event.source_id }}</td><td>{{ event.debit }} {{ event.currency_code }}</td><td>{{ event.credit }} {{ event.currency_code }}</td><td>{{ event.balance }} {{ event.currency_code }}</td></tr> }
                      </tbody></table></div>
                      <div class="inline-form"><span class="muted">{{ statementOffset + 1 }}–{{ statementOffset + customerStatement.items.length }} / {{ customerStatement.total }}</span><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset > 50 ? statementOffset - 50 : 0)" [disabled]="statementLoading || statementOffset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset + 50)" [disabled]="statementLoading || statementOffset + customerStatement.items.length >= customerStatement.total">{{ t('التالي', 'Next') }}</button></div>
                      @for (limitation of customerStatement.limitations; track limitation) { <p class="muted">• {{ limitation }}</p> }
                    }
                  </section>
                }
          </section>ion>
            }

            @if (tab === 'products') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('المنتجات والخدمات', 'Products & services') " [description]=" t('يتم حفظ الأسعار بدقة عشرية.', 'Prices are stored using decimal precision.') "><span class="count">{{ products.length }} {{ t('منتج', 'products') }}</span></aba-section-header>
                <form class="inline-form" (ngSubmit)="createProduct()">
                  <input [attr.aria-label]="t('اسم المنتج', 'Product name')" name="productName" [placeholder]="t('اسم المنتج', 'Product name')" required [(ngModel)]="productName">
                  <input [attr.aria-label]="t('سعر الوحدة', 'Unit price')" name="productPrice" type="number" min="0" step="0.01" [placeholder]="t('سعر الوحدة', 'Unit price')" required [(ngModel)]="productPrice">
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> {{ t('متابعة المخزون', 'Track stock') }}</label>
                  @if (stockTracked) { <label>{{ t('الكمية الافتتاحية بالمخزن', 'Opening stock quantity') }}<input name="productOpeningQuantity" type="number" min="0" step="0.001" [(ngModel)]="productOpeningQuantity" required></label> }
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة منتج', 'Add product') }}</button>
                </form>
                <section abaCard class="csv-import-panel" aria-label="CSV product import">
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
                  @if (importMessage) { <aba-state-message kind="success" [description]="importMessage" /> }
                </section>
                <div class="list-tools"><input name="productSearch" type="search" [attr.aria-label]="t('البحث عن منتج', 'Search products')" [placeholder]="t('ابحث عن منتج أو رمز SKU…', 'Search products or SKU…')" [(ngModel)]="productSearch"><button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                <div class="list">
                  @for (product of filteredProducts; track product.id) { <article class="list-row"><div class="product-mark">◇</div><div class="grow"><strong>{{ product.name }}</strong><small>{{ product.is_stock_tracked ? t('المخزون: ', 'Stock: ') + (product.stock_quantity ?? '0') : t('خدمة / لا تتم متابعة المخزون', 'Service / no stock tracking') }}{{ product.sku ? ' · SKU ' + product.sku : '' }}</small></div><strong>{{ product.unit_price }} {{ business.currency_code }}</strong></article> }
                  @if (!filteredProducts.length) { <aba-state-message kind="empty" [description]="productSearch ? t('لا توجد نتائج مطابقة للبحث.', 'No matching results.') : t('لا توجد منتجات بعد. أضف منتجًا أو خدمة من النموذج أعلاه.', 'No products yet. Add a product or service using the form above.')" /> }
                </div>
            </section>n>
            }

            @if (tab === 'invoices') {
              <section abaCard class="panel">
                <aba-section-header [title]=" t('المبيعات والفواتير', 'Sales & invoices') " [description]=" t('كل فاتورة صادرة مرتبطة بعميل؛ اختر العميل لعرض فواتيره.', 'Every issued invoice is linked to a customer; filter by customer to view their invoices.') "><span class="count">{{ filteredInvoices.length }} / {{ invoices.length }} {{ t('فاتورة', 'invoices') }}</span></aba-section-header>
                <div class="invoice-toolbar"><details class="invoice-create-disclosure"><summary><span>{{ t('إضافة فاتورة جديدة', 'Create a new invoice') }}</span><small>{{ t('افتح النموذج بشكل مستقل عن تصفية الفواتير', 'Open the form separately from invoice filtering') }}</small></summary>
                <form class="inline-form invoice-form" (ngSubmit)="createInvoice()">
                  <input name="invoiceNumber" [attr.aria-label]="t('رقم الفاتورة', 'Invoice number')" [placeholder]="t('رقم الفاتورة (تلقائي إذا تُرك فارغًا)', 'Invoice number (auto if blank)')" maxlength="80" [(ngModel)]="invoiceNumber">
                  <label class="invoice-customer-field">{{ t('العميل الذي تُصدر له الفاتورة', 'Customer receiving this invoice') }}<select name="invoiceCustomer" [attr.aria-label]="t('العميل الذي تُصدر له الفاتورة', 'Customer receiving this invoice')" required [(ngModel)]="invoiceCustomerId"><option value="" disabled>{{ t('اختر عميل الفاتورة', 'Choose invoice customer') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}{{ customer.phone ? ' · ' + customer.phone : '' }}</option> }</select></label>
                  <label>{{ t('الخصم (%)', 'Discount (%)') }}<input name="invoiceDiscountRate" type="number" min="0" max="100" step="any" required [(ngModel)]="invoiceDiscountRate"></label>
                  <label>{{ t('الضريبة (%)', 'Tax (%)') }}<input name="invoiceTaxRate" type="number" min="0" max="100" step="any" required [(ngModel)]="invoiceTaxRate"></label>
                  <div class="invoice-lines"><div class="invoice-lines-heading"><strong>{{ t('بنود الفاتورة', 'Invoice lines') }}</strong><button class="secondary" type="button" (click)="addInvoiceLine()" [disabled]="loading || !products.length">{{ t('إضافة بند', 'Add line') }} +</button></div>
                    @for (line of invoiceLines; track $index; let i = $index) { <div class="invoice-line-row"><label>{{ t('المنتج', 'Product') }} {{ i + 1 }}<select [name]="'invoiceProduct' + i" [attr.aria-label]="t('المنتج', 'Product') + ' ' + (i + 1)" required [(ngModel)]="line.productId"><option value="" disabled>{{ t('اختر منتجًا', 'Choose a product') }}</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.unit_price }} {{ business.currency_code }}</option> }</select></label><label>{{ t('الكمية', 'Quantity') }}<input [name]="'invoiceQuantity' + i" [attr.aria-label]="t('الكمية', 'Quantity') + ' ' + (i + 1)" type="number" min="0.001" step="0.001" required [(ngModel)]="line.quantity"></label><button class="secondary danger" type="button" (click)="removeInvoiceLine(i)" [disabled]="loading || invoiceLines.length <= 1" [attr.aria-label]="t('حذف البند', 'Remove line')">{{ t('حذف', 'Remove') }}</button></div> }
                  </div>
                  @if (invoicePreview; as preview) {
                    <div class="invoice-preview" aria-label="Invoice totals preview" aria-live="polite">
                      <div><span>{{ t('الإجمالي قبل الخصم', 'Subtotal') }}</span><strong>{{ preview.subtotal }} {{ business.currency_code }}</strong></div>
                      <div><span>{{ t('الخصم', 'Discount') }}</span><strong>−{{ preview.discount }} {{ business.currency_code }}</strong></div>
                      <div><span>{{ t('الضريبة', 'Tax') }}</span><strong>{{ preview.tax }} {{ business.currency_code }}</strong></div>
                      <div class="total"><span>{{ t('الإجمالي التقديري', 'Estimated total') }}</span><strong>{{ preview.total }} {{ business.currency_code }}</strong></div>
                    </div>
                  } @else {
                    <p class="muted">{{ t('اختر منتجًا وأدخل كمية صحيحة لكل بند لعرض الإجمالي التقديري.', 'Choose a product and enter a valid quantity for each line to preview totals.') }}</p>
                  }
                  <p class="footnote">{{ t('هذه معاينة تقديرية فقط؛ الخادم يعيد حساب الإجماليات ويتحقق من الأسعار والكميات عند الحفظ والإصدار.', 'This is an estimate only; the server recalculates totals and validates prices and quantities when saving and issuing.') }}</p>
                  <button class="primary" type="submit" [disabled]="loading || !products.length || !customers.length || !invoiceCustomerId">{{ t('حفظ كمسودة', 'Save draft') }}</button>
                  @if (editingInvoiceId) { <button class="secondary" type="button" (click)="cancelInvoiceEdit()">{{ t('إلغاء', 'Cancel') }}</button> }
                </form>
                </details><div class="inline-form customer-invoice-filter"><label>{{ t('تصفية الفواتير الموجودة حسب العميل', 'Filter existing invoices by customer') }}<select name="invoiceFilterCustomer" [attr.aria-label]="t('تصفية الفواتير حسب العميل', 'Filter invoices by customer')" [(ngModel)]="invoiceFilterCustomerId"><option value="">{{ t('عرض فواتير كل العملاء', 'Show all customers’ invoices') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select></label></div></div>
                @if (invoiceMessage) { <aba-state-message kind="success" [description]="invoiceMessage" /> }
                <div class="list-tools"><input name="invoiceSearch" type="search" [attr.aria-label]="t('البحث عن فاتورة', 'Search invoices')" [placeholder]="t('ابحث برقم الفاتورة أو العملة…', 'Search by invoice number or currency…')" [(ngModel)]="invoiceSearch"><select name="invoiceStatusFilter" [attr.aria-label]="t('تصفية حسب حالة الفاتورة', 'Filter by invoice status')" [(ngModel)]="invoiceStatusFilter"><option value="all">{{ t('كل الحالات', 'All statuses') }}</option><option value="draft">{{ t('مسودة', 'Draft') }}</option><option value="issued">{{ t('صادرة', 'Issued') }}</option><option value="paid">{{ t('مدفوعة', 'Paid') }}</option><option value="overdue">{{ t('متأخرة', 'Overdue') }}</option><option value="void">{{ t('ملغاة', 'Voided') }}</option></select><button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                <div class="list">
                  @for (invoice of filteredInvoices; track invoice.id) { <article class="list-row invoice-list-row"><div class="invoice-mark">▤</div><div class="grow"><strong>{{ invoice.invoice_number }}</strong><small>{{ customerNameForInvoice(invoice.customer_id) }} · {{ invoiceStatusLabel(invoice.status) }} · {{ invoice.currency_code }}</small></div><strong>{{ invoice.total }} {{ invoice.currency_code }}</strong>@if (invoice.status === 'draft') { <button class="secondary" (click)="editInvoice(invoice)" [disabled]="loading">{{ t('تعديل', 'Edit') }}</button><button class="secondary" (click)="issueInvoice(invoice)" [disabled]="loading">{{ t('إصدار', 'Issue') }}</button><button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button> } @else if (invoice.status === 'issued') { <small>{{ t('المتبقي: ', 'Outstanding: ') }}{{ invoice.outstanding_amount ?? t('جارٍ التحميل', 'loading') }} {{ invoice.currency_code }}</small>@if (business?.role === 'owner' && hasOutstandingBalance(invoice)) { <button class="secondary" type="button" (click)="payInvoice(invoice)" [disabled]="loading">{{ t('سداد', 'Pay') }}</button> } <button class="secondary" type="button" (click)="printInvoice(invoice)" [disabled]="loading">{{ t('طباعة', 'Print') }}</button><button class="secondary danger" type="button" (click)="voidInvoice(invoice)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button> }</article> }
                  @if (!filteredInvoices.length) { <aba-state-message kind="empty" [description]="(invoiceSearch || invoiceStatusFilter !== 'all') ? t('لا توجد فواتير مطابقة للفلاتر.', 'No invoices match these filters.') : (invoiceFilterCustomerId ? t('لا توجد فواتير مرتبطة بالعميل المحدد.', 'No invoices linked to the selected customer.') : t('لا توجد فواتير بعد. أضف عميلًا ومنتجًا ثم أنشئ فاتورتك الأولى.', 'No invoices yet. Add a customer and product, then create your first invoice.'))" /> }
                </div>
                <p class="footnote">{{ t('إصدار الفاتورة يخصم المخزون المتابع بشكل ذري، ويرفض العملية إذا كانت الكمية غير كافية.', 'Issuing an invoice deducts tracked stock atomically and rejects the operation if stock is insufficient.') }}</p>
              </section>
            }

            @if (tab === 'payments' && business?.role !== 'owner') {
              <section abaCard class="panel"><aba-state-message kind="error" [description]="t('تسجيل المدفوعات متاح لمالك مساحة العمل فقط. اطلب من المالك منحك الصلاحية المناسبة.', 'Recording payments is restricted to workspace owners. Ask the owner to grant the appropriate access.')" /></section>
            }
            @if (tab === 'payments' && business?.role === 'owner') {
              <section abaCard class="panel"><aba-section-header [title]="t('تسجيل دفعة', 'Record payment')" [description]="t('سجّل المبلغ المستلم، ويمكنك تخصيصه لفاتورة صادرة.', 'Record the amount received and optionally allocate it to an issued invoice.')">
                  <div class="section-actions"><span class="count">{{ payments.length }} {{ t('دفعة', 'payments') }}</span><button class="secondary" type="button" (click)="exportPaymentsCsv()" [disabled]="!payments.length">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                </aba-section-header>
                <form class="inline-form payment-form" (ngSubmit)="createPayment()">
                  <input [attr.aria-label]="t('مبلغ الدفعة', 'Payment amount')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المستلم', 'Amount received')" required [(ngModel)]="paymentAmount">
                  <select [attr.aria-label]="t('عميل الدفعة', 'Payment customer')" name="paymentCustomer" required [(ngModel)]="paymentCustomerId"><option value="" disabled>{{ t('اختر العميل', 'Choose customer') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select>
                  <select [attr.aria-label]="t('طريقة الدفع', 'Payment method')" name="paymentMethod" [(ngModel)]="paymentMethod"><option value="cash">{{ t('نقدًا', 'Cash') }}</option><option value="bank_transfer">{{ t('تحويل بنكي', 'Bank transfer') }}</option><option value="card">{{ t('بطاقة', 'Card') }}</option><option value="wallet">{{ t('محفظة إلكترونية', 'E-wallet') }}</option><option value="other">{{ t('أخرى', 'Other') }}</option></select>
                  <select [attr.aria-label]="t('الفاتورة المراد تخصيص الدفعة لها', 'Invoice to allocate payment to')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId" (ngModelChange)="syncPaymentCustomer()"><option value="">{{ t('عدم تخصيص الدفعة الآن', 'Do not allocate yet') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (paymentInvoiceId) { <input [attr.aria-label]="t('المبلغ المراد تخصيصه', 'Amount to allocate')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المخصص للفاتورة', 'Amount allocated to invoice')" [(ngModel)]="paymentAllocationAmount"> }
                  <input [attr.aria-label]="t('مرجع الدفعة', 'Payment reference')" name="paymentReference" maxlength="128" [placeholder]="t('المرجع (اختياري)', 'Reference (optional)')" [(ngModel)]="paymentReference">
                  <button class="primary" type="submit" [disabled]="loading || !paymentAmount">{{ t('تسجيل دفعة', 'Record payment') }}</button>
                </form>
                @if (paymentMessage) { <aba-state-message [kind]="paymentMessageKind" [description]="paymentMessage" /> }
                <p class="footnote">{{ t('العملة المحددة هي', 'The selected currency is') }} {{ business.currency_code }} {{ t('لمساحة العمل دي. يتحقق النظام من المبلغ المخصص مقارنة بالرصيد المستحق، وتظل المبالغ غير المخصصة مسجلة كمدفوعات مستلمة.', 'for this workspace. Allocations are checked against the outstanding balance, and unallocated amounts remain recorded as received payments.') }}</p>
                <div class="list">
                  @for (payment of payments; track payment.id) { <article class="list-row"><div class="payment-mark">↗</div><div class="grow"><strong>{{ payment.amount }} {{ payment.currency_code }}</strong><small>{{ customerNameForInvoice(payment.customer_id) }} · {{ payment.received_at | date:'medium' }} · {{ payment.method || t('طريقة الدفع غير محددة', 'Payment method not specified') }}{{ payment.reference ? ' · ' + payment.reference : '' }}</small><small>{{ payment.allocations.length ? payment.allocations.length + ' ' + t('تخصيص للفاتورة', 'invoice allocations') : t('دفعة غير مخصصة', 'Unallocated payment') }}</small></div></article> }
                  @if (!payments.length) { <aba-state-message kind="empty" [description]="t('لا توجد دفعات مسجلة حتى الآن.', 'No payments have been recorded yet.')" /> }
                </div>
              </section>
            }

            @if (tab === 'taxes' && business?.role === 'owner') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('ملخص الضرائب', 'Tax summary')" [description]="t('يعرض الضرائب المحفوظة على الفواتير الصادرة مع فصل كل عملة.', 'Shows saved tax totals on issued invoices, separated by currency.')" />
                <form class="inline-form" (ngSubmit)="loadTaxSummary()">
                  <label>{{ t('من تاريخ', 'Start date') }}<input name="taxStartDate" type="date" [(ngModel)]="taxStartDate"></label>
                  <label>{{ t('إلى تاريخ', 'End date') }}<input name="taxEndDate" type="date" [(ngModel)]="taxEndDate"></label>
                  <button class="primary" type="submit" [disabled]="taxLoading">{{ taxLoading ? t('جارٍ الحساب…', 'Calculating…') : t('عرض التقرير', 'Run report') }}</button>
                </form>
                @if (taxError) { <aba-state-message kind="error" [description]="taxError" /> }
                @if (taxSummaryReport) {
                  <div class="metric-grid">@for (entry of taxSummaryReport.currencies; track entry.currency_code) { <article class="metric"><span>{{ t('إجمالي الضريبة', 'Tax total') }} · {{ entry.currency_code }}</span><strong>{{ entry.tax_total }} {{ entry.currency_code }}</strong><small>{{ entry.invoice_count }} {{ t('فاتورة صادرة', 'issued invoices') }}</small></article> }</div>
                  @if (!taxSummaryReport.currencies.length) { <aba-state-message kind="empty" [description]="t('لا توجد فواتير صادرة في الفترة المحددة.', 'No issued invoices in the selected period.')" /> }
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
                @if (auditLoading) { <aba-state-message kind="loading" [description]="t('جارٍ تحميل السجل…', 'Loading activity…')" /> }
                @if (!auditLoading && !auditEvents.length && !auditError) { <aba-state-message kind="empty" [description]="t('لا توجد أحداث مطابقة للفلاتر.', 'No events match these filters.')" /> }
                <div class="table-wrap"><table><thead><tr><th>{{ t('التاريخ', 'Date') }}</th><th>{{ t('العملية', 'Action') }}</th><th>{{ t('نوع السجل', 'Target') }}</th><th>{{ t('المعرّف', 'Record ID') }}</th><th>{{ t('المنفذ', 'Actor') }}</th></tr></thead><tbody>
                  @for (event of auditEvents; track event.id) { <tr><td>{{ event.created_at ? (event.created_at | date:'short') : '—' }}</td><td>{{ auditActionLabel(event.action) }}</td><td>{{ auditTargetLabel(event.target_type) }}</td><td>{{ event.target_id || '—' }}</td><td>{{ event.actor_subject }}</td></tr> }
                </tbody></table></div>
                <div class="inline-form"><span class="muted">{{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} / {{ auditTotal }}</span><button class="secondary" type="button" (click)="loadAuditEvents((auditOffset > 50 ? auditOffset - 50 : 0))" [disabled]="auditLoading || auditOffset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadAuditEvents(auditOffset + 50)" [disabled]="auditLoading || auditOffset + auditEvents.length >= auditTotal">{{ t('التالي', 'Next') }}</button></div>
              </section>
            }

            @if (tab === 'release-guide') {
              <section abaCard class="panel release-guide-panel">
                <div class="section-head">
                  <div>
                    <p class="eyebrow">{{ t('دليل مبسط', 'QUICK GUIDE') }}</p>
                    <h2>{{ t('مميزات التطبيق والإصدارات', 'App features & versions') }}</h2>
                    <p>{{ t('اعرف الموجود في التطبيق، ثم افتح الإصدار لمعرفة ما أُضيف مقارنة بالإصدارات السابقة.', 'Browse what the app offers, then open a version to see what changed from earlier releases.') }}</p>
                  </div>
                  <span class="version-pill">{{ t('إصدار الواجهة', 'UI version') }} · v{{ appVersion }}</span>
                </div>

                <h3 class="release-guide-heading">{{ t('المميزات المتاحة', 'Available features') }}</h3>
                <p class="footnote">{{ t('افتح القسم الذي تحتاجه فقط. بعض الأدوات تعتمد على صلاحية الحساب أو إعداد الخدمة.', 'Open only the section you need. Some tools depend on your account permissions or service setup.') }}</p>
                <div class="release-guide-groups">
                  @for (group of featureCatalog; track group.id) {
                    <details class="release-feature-group">
                      <summary>
                        <strong>{{ t(group.titleAr, group.titleEn) }}</strong>
                        <small>{{ t(group.noteAr, group.noteEn) }}</small>
                      </summary>
                      <ul>
                        @for (feature of group.features; track feature.titleEn) {
                          <li>
                            <strong>{{ t(feature.titleAr, feature.titleEn) }}</strong>
                            <span>{{ t(feature.detailAr, feature.detailEn) }}</span>
                          </li>
                        }
                      </ul>
                    </details>
                  }
                </div>

                <div class="section-head release-history-title">
                  <div>
                    <h2>{{ t('سجل الإصدارات', 'Version history') }}</h2>
                    <p>{{ t('كل إصدار يعرض الإضافات والتحسينات الجديدة فقط.', 'Each version lists only its new additions and improvements.') }}</p>
                  </div>
                </div>
                <div class="release-history">
                  @for (release of releaseHistory; track release.version) {
                    <details class="release-version" [open]="release.version === appVersion">
                      <summary>
                        <span class="version-pill">v{{ release.version }}</span>
                        <strong>{{ t(release.titleAr, release.titleEn) }}</strong>
                        @if (release.version === appVersion) {
                          <span class="count">{{ t('الإصدار الحالي', 'Current version') }}</span>
                        }
                      </summary>
                      @if (language === 'ar') {
                        <ul>
                          @for (change of release.changesAr; track change) { <li>{{ change }}</li> }
                        </ul>
                      } @else {
                        <ul>
                          @for (change of release.changesEn; track change) { <li>{{ change }}</li> }
                        </ul>
                      }
                    </details>
                  }
                </div>
                <p class="footnote">{{ t('يتم تحديث هذا الدليل عند تجهيز إصدار جديد. الميزات التي تتطلب صلاحية أو إعدادًا تظهر ملاحظتها داخل قسمها.', 'This guide is updated for each new version. Features requiring permissions or setup are identified in their section.') }}</p>
              </section>
            }

            @if (tab === 'employees' && business?.role === 'owner' && business) {
              <aba-employee-payroll [businessId]="business.id" [currencyCode]="business.currency_code" [language]="language" (payrollPaid)="refreshAfterPayrollPayment()"></aba-employee-payroll>
            }

            @if (tab === 'expenses') {
              <section abaCard class="panel">
                <aba-section-header [title]="t('تسجيل مصروف', 'Record an expense')" [description]="t('سجّل مصروفات النشاط مع التصنيف والتاريخ والعملة.', 'Track business spending with a clear category, date and currency.')" [count]="expenses.length + ' ' + t('مصروفات', 'expenses')" />
                <form class="inline-form expense-form" (ngSubmit)="createExpense()">
                  <label class="expense-category-field">{{ t('تصنيف المصروف', 'Expense category') }}<select [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('تصنيف المصروف', 'Expense category')" name="expenseCategory" required [(ngModel)]="expenseCategory">
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
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('وصف المصروف', 'Expense description')" name="expenseDescription" maxlength="500" [placeholder]="t('الوصف', 'Description')" required [(ngModel)]="expenseDescription">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('مبلغ المصروف', 'Expense amount')" name="expenseAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ', 'Amount')" required [(ngModel)]="expenseAmount">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('تاريخ ووقت المصروف', 'Expense date and time')" name="expenseDate" type="datetime-local" required [(ngModel)]="expenseDate">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('المورد', 'Vendor')" name="expenseVendor" maxlength="160" [placeholder]="t('المورد (اختياري)', 'Vendor (optional)')" [(ngModel)]="expenseVendor">
                  <input [disabled]="loading || expenseSubmissionUncertain" [attr.aria-label]="t('مرجع المصروف', 'Expense reference')" name="expenseReference" maxlength="128" [placeholder]="t('المرجع (اختياري)', 'Reference (optional)')" [(ngModel)]="expenseReference">
                  <button class="primary" type="submit" [disabled]="loading || expenseSubmissionUncertain || !expenseCategory.trim() || !expenseDescription.trim() || !expenseAmount">{{ t('حفظ المصروف', 'Save expense') }}</button>
                </form>
                <p class="footnote">{{ t('العملة مرتبطة بمساحة العمل الحالية:', 'Currency follows the current workspace:') }} {{ business?.currency_code }}. {{ t('تُحتسب المصروفات في التقارير المتاحة ولا تُحسب تكلفة البضاعة تلقائيًا.', 'Expenses appear in available reports and are not automatically treated as cost of goods.') }}</p>
                @if (expenseMessage) { <aba-state-message kind="success" [description]="expenseMessage" /> }
                @if (expenseSubmissionUncertain) {
                  <aba-state-message kind="error" [description]="t('تعذر تأكيد نتيجة الحفظ. لا تعِد الإرسال قبل تحديث القائمة ومراجعتها.', 'The save result is uncertain. Refresh and review the list before trying again.')" [actionLabel]="t('فحص قائمة المصروفات', 'Check expense list')" [actionDisabled]="loading" (action)="checkExpenseSubmissionOutcome()" />
                }
                <div class="list">
                  @for (expense of expenses; track expense.id) {
                    <article class="list-row">
                      <div class="expense-mark" aria-hidden="true">−</div>
                      <div class="grow">
                        <strong>{{ expense.category }} · {{ expense.amount }} {{ expense.currency_code }}</strong>
                        <small>{{ expense.description }} · {{ expense.incurred_at | date:'medium' }}</small>
                        <small>{{ expense.vendor_name || t('بدون مورد', 'No vendor') }}{{ expense.reference ? ' · ' + expense.reference : '' }}</small>
                      </div>
                    </article>
                  }
                  @if (!expenses.length) { <aba-state-message kind="empty" [description]="t('لم يتم تسجيل مصروفات بعد.', 'No expenses recorded yet.')" /> }
                </div>
              </section>
            }

            @if (tab === 'integrity' && business?.role === 'owner') {
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
                  <div class="list">@for (invoice of dataIntegrityReport.unlinked_issued_invoices.items; track invoice.invoice_id) { <article class="list-row"><div class="grow"><strong>{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</strong><small>{{ invoice.created_at ? (invoice.created_at | date:'short') : '—' }} · {{ invoice.invoice_id }}</small></div></article> }</div>
                  <h3>{{ t('تخصيصات المدفوعات التي تحتاج مراجعة', 'Payment allocations needing review') }}</h3>
                  <div class="list">@for (item of dataIntegrityReport.currency_mismatched_allocations.items; track item.allocation_id) { <article class="list-row"><div class="grow"><strong>{{ item.invoice_number }} · {{ item.allocated_amount }} {{ item.payment_currency }}</strong><small>{{ t('عملة الفاتورة:', 'Invoice currency:') }} {{ item.invoice_currency }} · {{ t('مرجع الدفعة:', 'Payment reference:') }} {{ item.payment_reference || item.payment_id }}</small></div></article> } @for (item of dataIntegrityReport.customer_mismatched_allocations.items; track item.allocation_id) { <article class="list-row"><div class="grow"><strong>{{ item.invoice_number }} · {{ item.allocated_amount }} {{ item.invoice_currency }}</strong><small>{{ t('عميل الدفعة:', 'Payment customer:') }} {{ item.payment_customer_id || '—' }} · {{ t('عميل الفاتورة:', 'Invoice customer:') }} {{ item.invoice_customer_id || '—' }}</small></div></article> }</div>
                  <div class="inline-form"><span class="muted">{{ t('الصفحة', 'Offset') }} {{ dataIntegrityReport.offset }} · {{ t('حد الصفحة', 'Page size') }} {{ dataIntegrityReport.limit }}</span><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset > 0 ? dataIntegrityReport.offset - dataIntegrityReport.limit : 0)" [disabled]="integrityLoading || dataIntegrityReport.offset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadDataIntegrity(dataIntegrityReport.offset + dataIntegrityReport.limit)" [disabled]="integrityLoading || dataIntegrityReport.offset + dataIntegrityReport.limit >= maxIntegrityTotal">{{ t('التالي', 'Next') }}</button></div>
                }
              </section>
            }

            @if (tab === 'assistant') {
              <div class="assistant-workspace">
              <section abaCard class="panel chat-panel">
                <aba-section-header [title]=" t('مساعد الأعمال الذكي', 'AI Business Assistant') " [description]=" t('الإجابات مبنية على السجلات الحديثة لمساحة العمل الحالية فقط.', 'Answers use recent records from the current workspace only.') "><span class="count">{{ t('قراءة فقط', 'READ ONLY') }}</span></aba-section-header>
                <div class="chat-log" aria-live="polite">
                  @if (!chatMessages.length) { <aba-state-message kind="empty" [description]="t('ابدأ بسؤال سريع عن نشاطك أو اختَر اقتراحًا بالأسفل.', 'Start with a quick business question or choose a suggestion below.')" /> }
                  @for (message of chatMessages; track $index) { <article class="chat-message" [class.user-message]="message.role === 'user'"><span>{{ message.role === 'user' ? t('أنت', 'You') : t('المساعد الذكي', 'AI assistant') }}</span>@if (message.mode === 'local-fallback') { <small class="source-list">{{ t('وضع مجاني محدود · إجابة من سجلات النشاط', 'Free limited mode · grounded in business records') }}</small> }<p>{{ message.content }}</p>@if (message.sources?.length) { <small class="source-list">المصادر: @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? 'فاتورة' : (source.type === 'expense' ? 'مصروف' : source.type) }} · {{ source.invoice_number || source.category || source.id }}</span> }</small> }</article> }
                </div>
                
                @if (chatError) { <aba-state-message kind="error" [description]="chatError" [actionLabel]="chatConfigurationMissing ? '' : t('إعادة المحاولة', 'Retry')" [actionDisabled]="chatSending || !chatDraft.trim()" (action)="sendChat()" /> }
                @if (chatSending) { <aba-state-message kind="loading" [description]="t('المساعد الذكي يجهّز الإجابة…', 'The AI assistant is preparing an answer…')" /> }
                <form class="chat-form" (ngSubmit)="sendChat()"><textarea name="chatMessage" rows="2" maxlength="2000" placeholder="اكتب سؤالك عن نشاطك…" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea><button class="primary" type="submit" [disabled]="chatSending || !chatDraft.trim()">{{ chatSending ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال', 'Send') }}</button></form>
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
    </div>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#f6f8fb;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}
    .release-guide-heading{margin:18px 0 4px;font-size:16px}.release-history-title{margin-top:26px}
    .release-guide-groups,.release-history{display:grid;gap:10px;margin:12px 0 22px;min-width:0}
    .release-feature-group,.release-version{border:1px solid #dbe4ea;border-radius:13px;background:#fff;min-width:0;overflow:hidden}
    .release-feature-group>summary,.release-version>summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;list-style:none;cursor:pointer;padding:13px 14px}
    .release-feature-group>summary::-webkit-details-marker,.release-version>summary::-webkit-details-marker{display:none}
    .release-feature-group>summary:after,.release-version>summary:after{content:'＋';margin-inline-start:auto;display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:8px;background:#f1f5f9;color:#334155}
    .release-feature-group[open]>summary:after,.release-version[open]>summary:after{content:'−'}
    .release-feature-group>summary strong{font-size:14px;flex:1 1 160px}.release-feature-group>summary small{flex:1 1 100%;font-size:12px;color:#64748b;line-height:1.5;overflow-wrap:anywhere}
    .release-feature-group ul,.release-version ul{margin:0;padding:0 32px 14px 0;display:grid;gap:10px;font-size:13px;line-height:1.55}
    .shell.english .release-feature-group ul,.shell.english .release-version ul{padding:0 0 14px 32px}
    .release-feature-group li strong{display:block;font-size:13px}.release-feature-group li span{display:block;margin-top:2px;color:#475569;font-size:12px;overflow-wrap:anywhere}
    .release-version>summary strong{font-size:14px;flex:1 1 160px}.release-version ul{padding-top:2px}.release-version .count{font-size:11px}
    .csv-import-panel{display:grid;gap:10px;margin:18px 0;padding:14px;border:1px solid #d1d5db;border-radius:12px;background:#f8fafc}.csv-import-panel h3,.csv-import-panel p{margin:0}.csv-import-panel h3{font-size:15px}.csv-import-panel p,.csv-import-panel small{font-size:12px;line-height:1.5;color:#4b5563}.csv-import-actions{display:flex;flex-wrap:wrap;gap:8px}.csv-import-errors{margin:0;padding-inline-start:22px;font-size:12px;color:#991b1b;display:grid;gap:5px;overflow-wrap:anywhere}.invoice-lines{display:grid;gap:10px;flex-basis:100%;width:100%}.invoice-lines-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.invoice-line-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(90px,1fr) auto;gap:10px;align-items:end;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}.invoice-line-row label{display:grid;gap:5px;min-width:0}.invoice-line-row select,.invoice-line-row input{width:100%;min-width:0}@media(max-width:600px){.invoice-line-row{grid-template-columns:minmax(0,1fr) minmax(88px,.65fr)}.invoice-line-row button{grid-column:1/-1;justify-self:start}}.topbar-heading{display:grid;gap:5px;min-width:0}.workspace-build-card{justify-self:start;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 10px;border:1px solid #dbe4ea;border-radius:12px;background:#fff;box-shadow:0 2px 8px #0f172a08}.workspace-build-card .version-pill{font-size:11px;white-space:nowrap}.workspace-build-card small{font-size:11px;color:#64748b;overflow-wrap:anywhere}.invoice-create-disclosure{margin:14px 0 18px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;overflow:hidden}.invoice-create-disclosure>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px;background:#fff;font-weight:800;color:#0f172a}.invoice-create-disclosure>summary::-webkit-details-marker{display:none}.invoice-create-disclosure>summary:after{content:'＋';display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border-radius:9px;background:#ccfbf1;color:#115e59;font-size:19px}.invoice-create-disclosure[open]>summary:after{content:'−'}.invoice-create-disclosure>summary small{font-weight:500;color:#64748b;font-size:11px}.invoice-create-disclosure>.invoice-form{padding:14px;border-top:1px solid #e2e8f0}.customer-invoice-filter{padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.customer-invoice-filter label{width:100%;min-width:0}.customer-invoice-filter select{width:100%;min-width:0}.list-row{min-width:0;flex-wrap:wrap;gap:12px}.list-row .grow{min-width:120px;overflow-wrap:anywhere}.list-row>strong{overflow-wrap:anywhere;max-width:100%}.table-wrap{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:12px}.table-wrap table{width:100%;min-width:680px;border-collapse:separate;border-spacing:0}.table-wrap th,.table-wrap td{padding:11px 12px;text-align:start;vertical-align:top;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}.table-wrap th{position:sticky;top:0;background:#f1f5f9;color:#334155;font-size:12px;white-space:nowrap}.table-wrap tbody tr:nth-child(even){background:#f8fafc}.table-wrap tbody tr:last-child td{border-bottom:0}@media(max-width:600px){.topbar-heading{width:100%}.workspace-build-card{width:100%;justify-content:flex-start}.workspace-build-card small{flex-basis:100%}.invoice-create-disclosure>summary{align-items:flex-start;flex-wrap:wrap}.invoice-create-disclosure>summary small{flex:1 1 100%;order:2}.invoice-create-disclosure>.invoice-form{display:grid;grid-template-columns:minmax(0,1fr)}.list-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start}.list-row .grow{min-width:0}.list-row>button,.list-row>strong{grid-column:2;justify-self:start}.table-wrap table{min-width:760px}}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#93c5fd);outline-offset:var(--aba-focus-ring-offset,2px)}
    .aging-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin-top:12px}.aging-buckets>div{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid #e5e7eb;border-radius:9px;background:#f8fafc}.warning-notice{border-color:#f59e0b;background:#fffbeb}.divider{height:1px;background:#e5e7eb;margin:22px 0}
    .shell{min-height:100vh}.install-button{display:none}.install-floating{display:none}.install-help-floating{display:none}.mobile-more,.mobile-more-menu{display:none}.language-row{display:flex;justify-content:flex-end;margin-bottom:8px}.language-toggle{min-height:38px}.shell.english .sidebar{inset:0 0 0 auto}.shell.english .main{margin-left:0;margin-right:var(--aba-layout-sidebar,245px)}.shell.english .nav-item{text-align:left}.shell.english .hero-mark{margin-left:4%;margin-right:0}.shell.english .chat-message.user-message{margin-right:auto;margin-left:0}.sidebar{position:fixed;inset:0 auto 0 0;width:var(--aba-layout-sidebar,245px);background:var(--aba-color-nav-surface,#111827);color:var(--aba-color-text-inverse,#e5e7eb);padding:26px 17px;display:flex;flex-direction:column;z-index:2}
    .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:0 7px 38px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#a7f3d0;color:#064e3b;font-size:21px;font-weight:900;margin-bottom:20px}.brand-mark.small{width:34px;height:34px;border-radius:11px;margin:0;font-size:16px}.light{font-weight:400;color:#9ca3af;margin-left:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:#6b7280;margin:0 0 8px}.nav-label{font-size:10px;color:#9ca3af;letter-spacing:1.5px;padding:0 10px}.workspace-release-meta{display:grid;gap:5px;padding:0 10px;margin:-4px 0 10px;min-width:0}.workspace-release-meta .version-pill{align-self:start;max-width:100%;font-size:10px;white-space:normal;line-height:1.4}.workspace-release-meta small{font-size:10px;color:#9ca3af;line-height:1.5;overflow-wrap:anywhere}.nav-item{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:var(--aba-color-nav-text,#cbd5e1);text-align:left;padding:12px;border-radius:10px;margin:3px 0;font-size:14px;transition:background .18s ease,color .18s ease}.nav-item:hover{background:var(--aba-color-nav-surface-raised,#1e293b);color:var(--aba-color-text-inverse,#fff)}.nav-item.active{background:linear-gradient(100deg,var(--aba-color-nav-active-start,#164e63),var(--aba-color-nav-active-end,#1d4ed8));color:var(--aba-color-text-inverse,#fff);box-shadow:inset 3px 0 var(--aba-color-nav-accent,#5eead4)}.nav-icon{display:inline-grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;font-size:17px;font-weight:800;background:var(--aba-color-nav-surface-raised,#1e293b)}.overview-icon{color:#67e8f9;background:#164e63}.invoices-icon{color:#fcd34d;background:#713f12}.products-icon{color:#86efac;background:#14532d}.customers-icon{color:#c4b5fd;background:#4c1d95}.assistant-icon{color:#f9a8d4;background:#831843}.payments-icon{color:#67e8f9;background:#164e63}.expense-icon{color:#fdba74;background:#7c2d12}.nav-item.active .nav-icon{background:#ffffff24;color:#fff}.sidebar-bottom{margin-top:auto;border-top:1px solid #293548;padding:18px 8px 0;font-size:11px}.sidebar-bottom small{display:block;color:#9ca3af;margin:8px 0 0 15px;line-height:1.5}.status-dot{display:inline-block;width:7px;height:7px;background:#34d399;border-radius:50%;margin-right:8px}
    .main{margin-left:var(--aba-layout-sidebar,245px);padding:30px clamp(18px,4vw,54px) 20px;max-width:var(--aba-layout-content-max,1550px)}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:0}.user-area{display:flex;align-items:center;gap:12px;font-size:12px;color:#4b5563}.secondary,.primary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:#fff;color:#374151}.primary{background:#0f766e;border-color:#0f766e;color:#fff}.primary:hover{background:#115e59}.workspace-bar{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(180px,260px);justify-content:stretch;align-items:center;gap:14px;padding:14px 17px;background:var(--aba-color-surface,#fff);border:1px solid var(--aba-color-border,#e5e7eb);border-radius:var(--aba-radius-card,13px);margin-bottom:18px;min-width:0}.workspace-bar strong{display:block;font-size:14px}.workspace-bar select{max-width:260px}.hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:30px 34px;border-radius:var(--aba-radius-panel,19px);background:linear-gradient(115deg,var(--aba-color-hero-start,#14243a),var(--aba-color-hero-mid,#1e3a5f) 60%,var(--aba-color-hero-end,#155e75));color:var(--aba-color-hero-text,#fff)}.hero .eyebrow{color:#a7f3d0}.hero h2{font-size:clamp(25px,3vw,36px);line-height:1.12;letter-spacing:-1px;margin:10px 0}.hero p:last-child{max-width:460px;font-size:12px;line-height:1.6;color:var(--aba-color-hero-muted,#cbd5e1)}.hero-mark{width:84px;height:84px;display:grid;place-items:center;border-radius:26px;background:linear-gradient(135deg,#a7f3d0,#60a5fa);color:#0f2942;font-weight:900;font-size:24px;margin-right:4%;box-shadow:0 15px 45px #02061755}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.metric{padding:17px;min-height:125px;background:#fff;border:1px solid #e5eaf1;border-radius:14px}.metric>span{display:block;color:#6b7280;font-size:11px;margin-bottom:13px}.metric strong{display:block;font-size:19px;letter-spacing:-.5px;overflow-wrap:anywhere}.metric small{display:block;font-size:10px;color:#9ca3af;margin-top:6px}.notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}.notice strong{white-space:nowrap}.quick-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,165px),1fr));gap:12px;margin-top:15px}.module-launcher{margin-top:18px}
    .panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:#6b7280;line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:#6b7280;margin:0}.count{font-size:10px;font-weight:700;color:#0f766e;background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:#f8fafc;border:1px solid #edf0f5;border-radius:11px}.invoice-form{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 100px auto auto}.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}.expense-form{grid-template-columns:repeat(3,minmax(0,1fr))}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.payment-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#cffafe;color:#0e7490;font-size:17px;font-weight:800}.expense-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#ffedd5;color:#c2410c;font-size:20px;font-weight:800}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:#6b7280;font-size:10px;margin-top:5px;overflow-wrap:anywhere}.footnote{font-size:10px;line-height:1.6;color:#9ca3af;margin:15px 0 0} .assistant-workspace{display:grid;grid-template-columns:minmax(0,1fr) 228px;gap:16px;align-items:start}.assistant-suggestions{min-width:0;margin:0;padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 8px 24px #0f172a08}.assistant-suggestions>p{font-size:12px;font-weight:800;color:#334155;margin:0 0 10px}.suggestion-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.suggestion-card{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;column-gap:9px;row-gap:2px;text-align:start;padding:9px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc;color:#1e293b;transition:background .16s ease,border-color .16s ease}.suggestion-card:hover{background:#eff6ff;border-color:#93c5fd}.suggestion-icon{grid-row:span 2;display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#dbeafe;color:#1d4ed8;font-size:15px}.suggestion-card strong{font-size:11px}.suggestion-card small{font-size:10px;color:#64748b;line-height:1.35}.chat-panel{min-width:0}.chat-log{min-height:280px;max-height:55vh}@media(max-width:900px){.assistant-workspace{grid-template-columns:minmax(0,1fr)}.assistant-suggestions{grid-row:2}.suggestion-grid{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.suggestion-card{flex:0 0 175px}}@media(max-width:480px){.assistant-suggestions{padding:12px}.suggestion-card{flex-basis:158px;padding:8px}.chat-log{min-height:220px;max-height:48vh}}.chat-log{min-height:280px;max-height:55vh;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-left:auto;background:#e0f2fe}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:800}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:#0f766e;font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-right:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical}.install-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 14px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;color:#065f46;font-size:12px;line-height:1.6}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:#6b7280;line-height:1.7}.setup-steps{background:#f8fafc;border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:#0f766e;font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10px}footer span{color:#9ca3af}
    .mobile-version-strip{display:none}
    .section-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .list-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.list-tools input{flex:1;min-width:150px}.list-tools select{min-width:130px}
    @media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form .primary{grid-column:1/-1}}@media(max-width:760px){
      .mobile-version-row{display:flex;justify-content:flex-end;min-width:0;margin:0 0 8px}
      .mobile-version-row .version-pill{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:10px;padding:5px 8px}

      .install-button{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border-color:#99f6e4;color:#065f46;background:#ecfdf5;font-weight:800}.install-floating{display:block;position:fixed;top:12px;right:12px;z-index:50;box-shadow:0 6px 20px #0f172a22}.install-help-floating{display:flex;position:fixed;top:62px;right:12px;z-index:50;width:min(360px,calc(100vw - 24px));box-shadow:0 8px 28px #0f172a22}.main,.shell.english .main{padding-top:76px}.shell.install-help-open .main{padding-top:164px}.mobile-more{display:flex}.mobile-more-menu{display:grid;position:fixed;z-index:30;inset-inline-end:10px;bottom:calc(82px + env(safe-area-inset-bottom));width:min(270px,calc(100vw - 20px));max-height:min(70vh,560px);max-height:min(70dvh,560px);overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:8px;background:var(--aba-color-nav-surface-deep,#0f172a);border:1px solid var(--aba-color-nav-border,#334155);border-radius:var(--aba-radius-panel,16px);box-shadow:var(--aba-shadow-nav-menu,0 18px 50px #02061755);gap:8px}.mobile-more-group{display:grid;gap:4px}.mobile-more-group+.mobile-more-group{border-top:1px solid var(--aba-color-nav-border,#334155);padding-top:8px;margin-top:4px}.mobile-more-group h3{margin:2px 10px 4px;color:var(--aba-color-nav-muted,#94a3b8);font-size:10px;font-weight:800;line-height:1.5;letter-spacing:.04em;text-align:start}.mobile-more-menu .nav-item{flex-direction:row;justify-content:flex-start;min-height:48px;padding:9px 12px;font-size:13px}.mobile-more-menu .nav-item>span:not(.nav-icon){max-width:none}.mobile-more-menu .nav-item.active{border-inline-start:3px solid var(--aba-color-nav-accent,#5eead4);box-shadow:none}.mobile-more-actions{display:grid;gap:4px;border-top:1px solid var(--aba-color-nav-border,#334155);padding-top:8px;margin-top:4px}.mobile-more-menu .mobile-menu-action{border-radius:8px;margin-top:0}
      .global-loading{position:fixed;inset:0 0 auto;z-index:1000;height:3px;background:#ccfbf1;overflow:hidden}.global-loading>span:first-child{position:absolute;inset:0 auto 0 0;width:35%;background:#0f766e;animation:loading-sweep 1.15s ease-in-out infinite}.loading-label{position:absolute;top:10px;right:12px;background:#0f766e;color:#fff;padding:7px 12px;border-radius:999px;font-size:12px;box-shadow:0 4px 14px #0f172a22}@keyframes loading-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.global-loading>span:first-child{animation:none;width:100%}}
    .sidebar{position:fixed;inset:auto 0 0;width:100%;min-height:0;height:auto;padding:8px 6px calc(8px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch;gap:2px;overflow-x:auto;overflow-y:hidden;background:var(--aba-color-nav-surface-glass,rgba(15,23,42,.97));border-top:1px solid var(--aba-color-nav-border,#334155);box-shadow:var(--aba-shadow-nav-dock,0 -8px 28px #0f172a20);backdrop-filter:blur(16px);z-index:20}
      .brand,.brand>span:last-child,.nav-label,.workspace-release-meta,.sidebar-bottom{display:none}.sidebar>.mobile-extra,.sidebar>.platform-admin-nav{display:none}
      .nav-item{min-width:0;min-height:58px;margin:0;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;font-size:10px;line-height:1.1;text-align:center;white-space:normal;color:#cbd5e1}
      .nav-item>span:not(.nav-icon){display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .nav-item .nav-icon{display:grid;flex:0 0 27px;width:27px;height:27px;font-size:17px;border-radius:9px}
      .nav-item.active{background:#1e293b;box-shadow:inset 0 -2px #5eead4;color:#fff}
      .mobile-version-strip{display:flex;justify-content:flex-end;align-items:flex-end;flex-wrap:wrap;gap:4px 8px;margin:0 2px 10px}.mobile-version-strip .version-pill{font-size:10px;padding:5px 7px}.mobile-deploy-time{font-size:10px;line-height:1.4;color:#64748b;max-width:100%;overflow-wrap:anywhere}
      .main,.shell.english .main{margin:0;padding:20px 14px calc(100px + env(safe-area-inset-bottom));max-width:none}.shell.english .sidebar{inset:auto 0 0}.shell.english .nav-item{text-align:center}
      .topbar{display:none!important}
      .topbar h1{font-size:clamp(20px,5.5vw,25px);line-height:1.2}
      .user-area{gap:6px}.user-area>span:not(.version-pill){display:none}.user-area .version-pill{display:inline-flex;flex-shrink:0;padding:5px 7px;font-size:10px}.user-area .secondary{padding:9px 10px;min-height:40px}
      .hero{padding:22px 20px;border-radius:16px}.hero h2{font-size:27px}.hero-mark{display:none}
      .quick-grid{grid-template-columns:1fr}.workspace-bar{align-items:stretch;flex-direction:column}.workspace-bar select{max-width:none;width:100%}
      .list-tools{display:grid;grid-template-columns:1fr}.list-tools input,.list-tools select,.list-tools button{width:100%}
      .section-head{align-items:flex-start;gap:10px}.list-row{flex-wrap:wrap}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{padding:13px;min-height:110px}.metric strong{font-size:clamp(15px,4vw,18px);overflow-wrap:anywhere}
      
      .inline-form,.invoice-form{grid-template-columns:1fr}.inline-form .primary{grid-column:auto}
      .notice{flex-direction:column}.notice strong{white-space:normal}
      footer{flex-direction:column;line-height:1.6}
      input,select,textarea{font-size:16px!important;min-height:44px}
      button,.secondary,.primary{min-height:42px}
    }
    .mobile-version-row{display:none}
    .invoice-preview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.invoice-preview>div{display:flex;flex-direction:column;gap:4px;min-width:0}.invoice-preview span{font-size:12px;color:#64748b}.invoice-preview strong{font-size:15px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.invoice-preview .total{grid-column:1/-1;border-top:1px solid #cbd5e1;padding-top:10px}
    .version-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border:1px solid #cbd5e1;border-radius:999px;background:#f8fafc;color:#334155;font-size:11px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}.statement-panel{min-width:0;max-width:100%;overflow:hidden}.statement-panel .section-head>div{min-width:0;overflow-wrap:anywhere}.statement-panel .table-wrap{width:100%;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}.statement-panel .table-wrap table{width:100%;min-width:680px;border-collapse:collapse;table-layout:auto}.statement-panel .table-wrap th,.statement-panel .table-wrap td{padding:10px 12px;text-align:start;white-space:nowrap;border-bottom:1px solid #edf0f5;font-size:12px}.statement-panel .table-wrap td:nth-child(3){max-width:220px;overflow-wrap:anywhere;white-space:normal}
    @media(max-width:380px){.nav-item{font-size:9px}.nav-item .nav-icon{width:25px;height:25px;flex-basis:25px}.sidebar{padding-inline:3px}.main{padding-inline:11px}.metric{padding:10px}.metric>span{font-size:10px}}
    /* Refined mobile navigation dock: thumb-friendly, RTL-aware, and never an app bar. */
    @media(max-width:760px){
      .sidebar{
        inset:auto 10px calc(8px + env(safe-area-inset-bottom)) 10px;
        width:auto;
        padding:7px;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:5px;
        border:1px solid #334155;
        border-radius:22px;
        background:rgba(15,23,42,.96);
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
        color:#cbd5e1;
        transition:background .18s ease,transform .18s ease,color .18s ease;
      }
      .nav-item .nav-icon{
        width:29px;height:29px;flex-basis:29px;
        border-radius:11px;
        background:#273449;
        color:#cbd5e1;
        font-size:18px;
      }
      .nav-item.active{
        color:#fff;
        background:linear-gradient(145deg,#134e4a,#115e59);
        box-shadow:0 4px 14px #0f766e30,inset 0 0 0 1px #5eead455;
      }
      .nav-item.active .nav-icon{background:#5eead926;color:#99f6e4}
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
      .main,.shell.english .main{padding-bottom:calc(112px + env(safe-area-inset-bottom))}
      .install-floating{top:10px;right:10px;border-radius:999px;padding:9px 12px}
      .shell[dir="ltr"] .install-floating{right:10px;left:auto}
      .shell[dir="rtl"] .install-floating{right:10px;left:auto}
    }
    @media(max-width:380px){
      .sidebar{inset-inline:7px;padding:5px;gap:3px;border-radius:19px}
      .nav-item{min-height:56px;font-size:9px}
      .nav-item .nav-icon{width:26px;height:26px;flex-basis:26px;font-size:16px}
    }
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}

    /* Consistent, data-sized controls and mobile-first business cards. */
    .workspace-bar{display:grid;grid-template-columns:minmax(0,1fr) minmax(180px,260px);align-items:center;gap:12px}
    .workspace-current{min-width:0}.workspace-current strong{overflow-wrap:anywhere}
    .workspace-release-meta-inline{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;padding:8px 10px;border-top:1px solid #e5eaf1}
    .workspace-release-meta-inline small{color:#64748b;font-size:11px;overflow-wrap:anywhere;text-align:center}
    .invoice-toolbar{display:flex;flex-direction:column;gap:12px;margin-top:12px}
    .invoice-create-disclosure{width:100%;order:0}
    .customer-invoice-filter{order:1;width:100%;margin:0}
    .invoice-form{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(100px,.55fr) minmax(100px,.55fr);align-items:end;gap:12px}
    .invoice-form>input[name="invoiceNumber"]{min-width:0}
    .invoice-form>.invoice-customer-field{grid-column:1/-1;min-width:0}
    .invoice-form label:has(input[type="number"]){max-width:150px;min-width:0}
    .invoice-form input[type="number"]{width:100%;min-width:0}
    .invoice-lines,.invoice-lines-heading{min-width:0}
    .expense-form{display:grid;grid-template-columns:minmax(150px,1fr) minmax(180px,1.5fr) minmax(100px,.65fr) minmax(170px,1fr) minmax(130px,.8fr) minmax(120px,.8fr);align-items:end;gap:10px}
    .expense-form .expense-category-field{min-width:0}
    .shell input,.shell select,.shell textarea{min-width:0;max-width:100%;padding:9px 11px;font-size:14px;border-radius:9px}
    .shell input[type="number"]{font-variant-numeric:tabular-nums}
    .shell label{min-width:0;gap:6px}
    .list-row{min-width:0;overflow-wrap:anywhere}
    .release-guide-panel .release-guide-groups,.release-guide-panel .release-history{gap:12px}
    .release-guide-panel .release-feature-group>summary,.release-guide-panel .release-version>summary{min-height:48px}
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
      .invoice-form{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px}
      .invoice-form>input[name="invoiceNumber"],.invoice-form>.invoice-customer-field,.invoice-form>.invoice-lines{grid-column:1/-1}
      .invoice-form label:has(input[type="number"]){max-width:none}
      .invoice-form label:has(input[type="number"]) input{width:100%}
      .expense-form{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .expense-form input[name="expenseDescription"],.expense-form input[name="expenseDate"]{grid-column:1/-1}
      .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .metric{padding:12px;min-height:105px}
      .metric strong{font-size:17px}
      .list-row{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:8px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
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
      .chat-form textarea{min-height:48px;max-height:25dvh;resize:none}
      .shell.keyboard-open .sidebar,.shell:has(.chat-form textarea:focus) .sidebar{transform:translateY(110%);pointer-events:none}
      .shell.keyboard-open .main,.shell:has(.chat-form textarea:focus) .main{padding-bottom:12px}
      .shell.keyboard-open .chat-log{min-height:100px;max-height:35dvh}
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  readonly appVersion = APP_BUILD_INFO.version;
  readonly featureCatalog = FEATURE_CATALOG;
  readonly releaseHistory = RELEASE_HISTORY;
  readonly uiCommitLabel = APP_BUILD_INFO.commit;
  readonly buildTimeLabel = APP_BUILD_INFO.builtAt ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(APP_BUILD_INFO.builtAt)) : 'وقت البناء غير متاح';
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
  products: Product[] = [];
  invoices: Invoice[] = [];
  customerSearch = '';
  productSearch = '';
  invoiceSearch = '';
  invoiceStatusFilter: 'all' | 'draft' | 'issued' | 'paid' | 'overdue' | 'void' = 'all';
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
  productName = '';
  productPrice = '';
  stockTracked = false;
  productOpeningQuantity = '0';
  importCsvText = '';
  importFileName = '';
  importLoading = false;
  importPreview: Awaited<ReturnType<ApiService['previewProductCsv']>> | null = null;
  importMessage = '';
  customerImportCsvText = '';
  customerImportFileName = '';
  customerImportLoading = false;
  customerImportPreview: Awaited<ReturnType<ApiService['previewCustomerCsv']>> | null = null;
  customerImportMessage = '';
  invoiceCustomerId = '';
  invoiceProductId = '';
  invoiceQuantity = '1';
  invoiceLines: Array<{ productId: string; quantity: string }> = [{ productId: '', quantity: '1' }];
  invoiceDiscountRate = '0';
  invoiceTaxRate = '0';
  invoiceMessage = '';
  invoiceNumber = '';
  invoiceFilterCustomerId = '';
  editingInvoiceId: string | null = null;
  paymentCustomerId = '';
  paymentAmount = '';
  paymentAllocationAmount = '';
  paymentMessage = '';
  paymentMessageKind: 'info' | 'success' | 'warning' | 'error' = 'info';
  paymentInvoiceId = '';
  paymentMethod = 'cash';
  paymentReference = '';
  paymentIdempotencyKey = '';
  chatDraft = '';
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources']; mode?: string }> = [];
  chatSending = false;
  chatError = '';
  chatConfigurationMissing = false;
  keyboardOpen = false;
  mobileMoreOpen = false;
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
  }

  toggleLanguage(): void {
    this.language = this.language === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('aba-language', this.language); } catch { /* private browsing may block storage */ }
    document.documentElement.lang = this.language;
    document.documentElement.dir = this.language === 'ar' ? 'rtl' : 'ltr';
  }

  t(arabic: string, english: string): string {
    return this.language === 'ar' ? arabic : english;
  }

  customerNameForInvoice(customerId?: string | null): string {
    if (!customerId) return this.t('عميل غير محدد (سجل قديم)', 'Unlinked customer (legacy record)');
    return this.customers.find(customer => customer.id === customerId)?.name
      || this.t('العميل غير موجود في القائمة الحالية', 'Customer not in the current list');
  }

  customerInvoiceCount(customerId: string): number {
    return this.invoices.filter(invoice => invoice.customer_id === customerId).length;
  }

  showCustomerInvoices(customerId: string): void {
    this.invoiceFilterCustomerId = customerId;
    this.setTab('invoices');
  }

  get filteredCustomers(): Customer[] {
    return filterCustomers(this.customers, this.customerSearch);
  }

  get filteredProducts(): Product[] {
    return filterProducts(this.products, this.productSearch, this.business?.currency_code || '');
  }

  get filteredInvoices(): Invoice[] {
    return filterInvoices(this.invoices, this.invoiceSearch, this.invoiceStatusFilter, this.invoiceFilterCustomerId);
  }

  exportCurrentList(): void {
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
      filename = 'invoices.csv'; headers = ['invoice_number', 'status', 'total', 'currency'];
      rows = this.filteredInvoices.map(item => [item.invoice_number, item.status, item.total, item.currency_code]);
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
    this.mobileMoreOpen = !this.mobileMoreOpen;
  }

  @HostListener('document:keydown.escape')
  closeMobileMoreOnEscape(): void {
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

  async initializeApp(): Promise<void> {
    this.authFlowInProgress = true;
    this.initialized = false;
    this.startupFailed = false;
    this.loading = true;
    this.error = '';
    document.documentElement.lang = this.language;
    document.documentElement.dir = this.language === 'ar' ? 'rtl' : 'ltr';
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

  notificationKindLabel(kind: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
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

  auditActionLabel(action: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      'invoice.issued': { ar: 'إصدار فاتورة', en: 'Invoice issued' },
      'invoice.created': { ar: 'إنشاء فاتورة', en: 'Invoice created' },
      'invoice.draft_updated': { ar: 'تعديل مسودة فاتورة', en: 'Invoice draft updated' },
      'invoice.voided': { ar: 'إلغاء فاتورة', en: 'Invoice voided' },
      'payment.recorded': { ar: 'تسجيل دفعة', en: 'Payment recorded' },
      'expense.created': { ar: 'تسجيل مصروف', en: 'Expense recorded' },
      'customer.created': { ar: 'إضافة عميل', en: 'Customer created' },
      'product.created': { ar: 'إضافة منتج', en: 'Product created' },
      'stock.movement_recorded': { ar: 'تسجيل حركة مخزون', en: 'Stock movement recorded' },
      'supplier.created': { ar: 'إضافة مورد', en: 'Supplier created' },
      'customer.updated': { ar: 'تعديل بيانات عميل', en: 'Customer updated' },
      'customer.deactivated': { ar: 'تعطيل عميل', en: 'Customer deactivated' },
      'product.updated': { ar: 'تعديل منتج', en: 'Product updated' },
      'product.deactivated': { ar: 'تعطيل منتج', en: 'Product deactivated' },
      'purchase_order.created': { ar: 'إنشاء أمر شراء', en: 'Purchase order created' },
      'purchase_order.approved': { ar: 'اعتماد أمر شراء', en: 'Purchase order approved' },
      'purchase_order.received': { ar: 'استلام أمر شراء', en: 'Purchase order received' },
      'sales_return.created': { ar: 'تسجيل مرتجع بيع', en: 'Sales return created' },
      'sales_return.approved': { ar: 'اعتماد مرتجع بيع', en: 'Sales return approved' },
      'recurring_invoice_schedule.created': { ar: 'إنشاء جدول فاتورة دورية', en: 'Recurring invoice schedule created' },
      'data_import.completed': { ar: 'اكتمال استيراد البيانات', en: 'Data import completed' },
      'pricing_rule.created': { ar: 'إنشاء قاعدة تسعير', en: 'Pricing rule created' }
    };
    return labels[action]?.[this.language] || action;
  }

  auditTargetLabel(target: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      invoice: { ar: 'فاتورة', en: 'Invoice' },
      payment: { ar: 'دفعة', en: 'Payment' },
      expense: { ar: 'مصروف', en: 'Expense' },
      customer: { ar: 'عميل', en: 'Customer' },
      product: { ar: 'منتج', en: 'Product' },
      supplier: { ar: 'مورد', en: 'Supplier' },
      stock_movement: { ar: 'حركة مخزون', en: 'Stock movement' },
      purchase_order: { ar: 'أمر شراء', en: 'Purchase order' },
      sales_return: { ar: 'مرتجع بيع', en: 'Sales return' },
      recurring_invoice_schedule: { ar: 'جدول فاتورة دورية', en: 'Recurring invoice schedule' },
      import_job: { ar: 'عملية استيراد', en: 'Import job' },
      pricing_rule: { ar: 'قاعدة تسعير', en: 'Pricing rule' },
      business: { ar: 'نشاط تجاري', en: 'Business' }
    };
    return labels[target]?.[this.language] || target;
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

  invoiceStatusLabel(status: string): string {
    const labelsAr: Record<string, string> = { draft: 'مسودة', issued: 'صادرة', void: 'ملغاة', paid: 'مدفوعة', overdue: 'متأخرة' };
    const labelsEn: Record<string, string> = { draft: 'Draft', issued: 'Issued', void: 'Voided', paid: 'Paid', overdue: 'Overdue' };
    return (this.language === 'ar' ? labelsAr : labelsEn)[status] || this.t('غير محددة', 'Unknown');
  }

  get pageTitle(): string {
    const titles: Record<Tab, string> = {
      overview: 'نظرة عامة على النشاط', customers: 'العملاء',
      products: 'المنتجات والمخزون', invoices: 'المبيعات والفواتير',
      payments: 'المدفوعات', expenses: 'المصروفات', employees: 'الموظفون والمرتبات', suppliers: 'الموردون', purchases: 'المشتريات', recurring: 'الفواتير الدورية', notifications: 'الإشعارات', health: 'الحالة التشغيلية', assistant: 'مساعد الأعمال الذكي', reports: 'الأرباح والخسائر', taxes: 'التقارير الضريبية', audit: 'سجل العمليات', integrity: 'مراجعة سلامة البيانات', 'release-guide': 'دليل التطبيق والإصدارات', 'platform-admin': 'إدارة المنصة'
    };
    return this.language === 'ar' ? titles[this.tab] : ({ overview: 'Business overview', customers: 'Customers', products: 'Products & inventory', invoices: 'Sales & invoices', payments: 'Payments', expenses: 'Expenses', employees: 'Employees & payroll', suppliers: 'Suppliers', purchases: 'Purchasing', recurring: 'Recurring invoices', notifications: 'Notifications', health: 'Operational health', assistant: 'AI business assistant', reports: 'Profit & loss', taxes: 'Tax summary', audit: 'Activity log', integrity: 'Data integrity review', 'release-guide': 'App guide & versions', 'platform-admin': 'Platform admin' } as Record<Tab, string>)[this.tab];
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
        if (this.platformAdminAvailable) this.tab = 'platform-admin';
        return;
      }
      const chosen = this.businesses.find(item => item.id === this.selectedBusinessId) || this.businesses[0];
      const workspaceAccessChanged = this.business?.id !== chosen.id || this.business?.role !== chosen.role;
      this.selectedBusinessId = chosen.id;
      this.business = chosen;
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
    this.chatRequestGuard.invalidate();
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
    this.profitLoss = null;
    this.taxSummaryReport = null;
    this.dataIntegrityReport = null;
    this.integrityError = '';
    this.integrityLoading = false;
    this.integrityOffset = 0;
    this.taxError = '';
    this.taxLoading = false;
    this.agingReport = null;
    // Import previews are workspace-scoped; never carry a pending CSV into another business.
    this.importCsvText = '';
    this.importFileName = '';
    this.importPreview = null;
    this.importMessage = '';
    this.importLoading = false;
    this.customerImportCsvText = '';
    this.customerImportFileName = '';
    this.customerImportPreview = null;
    this.customerImportMessage = '';
    this.customerImportLoading = false;
    this.customers = [];
    this.products = [];
    this.invoices = [];
    this.payments = [];
    this.expenses = [];
    this.suppliers = [];
    this.purchaseOrders = [];
    this.recurringSchedules = [];
    this.notifications = [];
    this.operationalHealth = null;
    this.operationsError = '';
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
    this.statementVisible = false;
    this.customerStatement = null;
    this.statementCustomerId = '';
    this.statementError = '';
    this.selectedBusinessId = id;
    this.business = this.businesses.find(item => item.id === id) || null;
    this.clearWorkspaceData();
    this.error = '';
    await this.loadWorkspaceData();
  }

  private readonly workspaceLoadGuard = new WorkspaceLoadGuard();
  private readonly chatRequestGuard = new WorkspaceLoadGuard();
  private readonly profitLossLoadGuard = new WorkspaceLoadGuard();
  private readonly receivablesAgingLoadGuard = new WorkspaceLoadGuard();

  async loadWorkspaceData(): Promise<void> {
    const loadVersion = this.workspaceLoadGuard.begin();
    if (!this.business) {
      this.loading = false;
      return;
    }
    const id = this.business.id;
    this.loading = true;
    this.error = '';
    try {
      const [dashboard, عميل, منتج, فاتورة, دفعة, مصروفات] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), this.api.payments(id), this.api.expenses(id)
      ]);
      if (!this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) return;
      this.dashboard = dashboard;
      this.profitLoss = null;
      this.customers = عميل;
      if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      this.products = منتج;
      this.invoices = فاتورة;
      this.payments = دفعة;
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

  async refreshAfterPayrollPayment(): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const businessId = this.business.id;
    try {
      const [expenses, dashboard] = await Promise.all([
        this.api.expenses(businessId),
        this.api.dashboard(businessId),
      ]);
      if (this.business?.id !== businessId) return;
      this.expenses = expenses;
      this.dashboard = dashboard;
      this.profitLoss = null;
    } catch (error) {
      if (this.business?.id === businessId) this.error = this.message(error);
    }
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
    if (this.taxStartDate && this.taxEndDate && this.taxStartDate > this.taxEndDate) {
      this.taxSummaryReport = null;
      this.taxError = this.t('تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.', 'Start date must not be after end date.');
      return;
    }
    const businessId = this.business.id;
    this.taxLoading = true;
    this.taxError = '';
    try {
      const report = await this.api.taxSummary(businessId, this.taxStartDate || undefined, this.taxEndDate || undefined);
      if (this.business?.id === businessId && this.business.role === 'owner') this.taxSummaryReport = report;
    } catch (error) {
      if (this.business?.id === businessId) {
        this.taxSummaryReport = null;
        this.taxError = this.message(error);
      }
    } finally {
      if (this.business?.id === businessId) this.taxLoading = false;
    }
  }

  async loadDataIntegrity(offset = 0): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const businessId = this.business.id;
    this.integrityLoading = true;
    this.integrityError = '';
    this.integrityOffset = offset;
    try {
      const result = await this.api.dataIntegrity(businessId, offset);
      if (this.business?.id !== businessId) return;
      this.dataIntegrityReport = result;
    } catch (error) {
      if (this.business?.id !== businessId) return;
      this.dataIntegrityReport = null;
      this.integrityError = this.message(error);
    } finally {
      if (this.business?.id === businessId) this.integrityLoading = false;
    }
  }

  async loadOperationalHealth(): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const businessId=this.business.id;this.healthLoading=true;this.healthError='';
    try { const result=await this.api.operationsHealth(businessId);if(this.business?.id===businessId)this.operationalHealth=result; }
    catch(error){if(this.business?.id===businessId){this.operationalHealth=null;this.healthError=this.message(error)}}
    finally{if(this.business?.id===businessId)this.healthLoading=false}
  }

  private async loadNotifications(): Promise<void> {
    if(!this.business)return;const businessId=this.business.id;this.notificationsLoading=true;this.operationsError='';
    try {const items=await this.api.notifications(businessId);if(this.business?.id===businessId)this.notifications=items;}
    catch(error){if(this.business?.id===businessId)this.operationsError=this.message(error)}finally{if(this.business?.id===businessId)this.notificationsLoading=false}
  }
  async createNotification(): Promise<void> {
    if(!this.business||!this.notificationTitle.trim()||!this.notificationBody.trim())return;const businessId=this.business.id;this.notificationsLoading=true;this.operationsError='';
    try {await this.api.createNotification(businessId,{kind:this.notificationKind.trim()||'business',title:this.notificationTitle.trim(),body:this.notificationBody.trim(),deduplication_key:this.notificationDeduplicationKey,scheduled_at:this.notificationScheduledAt?new Date(this.notificationScheduledAt).toISOString():undefined});
      this.notificationTitle='';this.notificationBody='';this.notificationScheduledAt='';this.notificationDeduplicationKey='manual-'+Date.now();const items=await this.api.notifications(businessId);if(this.business?.id===businessId)this.notifications=items;
    }catch(error){if(this.business?.id===businessId)this.operationsError=this.message(error)}finally{if(this.business?.id===businessId)this.notificationsLoading=false}
  }

  private async loadSuppliers(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.suppliersLoading = true; this.operationsError = '';
    try { const items = await this.api.suppliers(businessId); if (this.business?.id === businessId) this.suppliers = items; }
    catch (error) { if (this.business?.id === businessId) this.operationsError = this.message(error); }
    finally { if (this.business?.id === businessId) this.suppliersLoading = false; }
  }
  private async loadPurchaseOrders(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.purchasesLoading = true; this.operationsError = '';
    try { const items = await this.api.purchaseOrders(businessId); if (this.business?.id === businessId) this.purchaseOrders = items; }
    catch (error) { if (this.business?.id === businessId) this.operationsError = this.message(error); }
    finally { if (this.business?.id === businessId) this.purchasesLoading = false; }
  }
  private async loadRecurringSchedules(): Promise<void> {
    if (!this.business) return;
    const businessId = this.business.id;
    this.recurringLoading = true; this.operationsError = '';
    try { const items = await this.api.recurringSchedules(businessId); if (this.business?.id === businessId) this.recurringSchedules = items; }
    catch (error) { if (this.business?.id === businessId) this.operationsError = this.message(error); }
    finally { if (this.business?.id === businessId) this.recurringLoading = false; }
  }
  async createSupplier(): Promise<void> {
    if (!this.business || !this.supplierName.trim()) return;
    const businessId = this.business.id; this.suppliersLoading = true; this.operationsError = '';
    try { await this.api.createSupplier(businessId,{name:this.supplierName.trim(),email:this.supplierEmail.trim()||undefined,phone:this.supplierPhone.trim()||undefined,address:this.supplierAddress.trim()||undefined});
      this.supplierName='';this.supplierEmail='';this.supplierPhone='';this.supplierAddress='';
      const items=await this.api.suppliers(businessId); if(this.business?.id===businessId)this.suppliers=items;
    } catch(error){if(this.business?.id===businessId)this.operationsError=this.message(error)} finally{if(this.business?.id===businessId)this.suppliersLoading=false}
  }
  async createPurchaseOrder(): Promise<void> {
    if (!this.business || !this.purchaseSupplierId || !this.purchaseProductId) return;
    const quantity = Number(this.purchaseQuantity), unitCost = Number(this.purchaseUnitCost);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) { this.operationsError=this.t('تحقق من الكمية والتكلفة.','Check the quantity and unit cost.'); return; }
    const businessId=this.business.id;this.purchasesLoading=true;this.operationsError='';
    try { await this.api.createPurchaseOrder(businessId,{supplier_id:this.purchaseSupplierId,order_number:this.purchaseOrderNumber.trim(),currency_code:this.business.currency_code,lines:[{product_id:this.purchaseProductId,quantity:this.purchaseQuantity,unit_cost:this.purchaseUnitCost}]});
      this.purchaseOrderNumber='';this.purchaseQuantity='1';this.purchaseUnitCost='0';
      const items=await this.api.purchaseOrders(businessId);if(this.business?.id===businessId)this.purchaseOrders=items;
    } catch(error){if(this.business?.id===businessId)this.operationsError=this.message(error)} finally{if(this.business?.id===businessId)this.purchasesLoading=false}
  }
  hasRemainingQuantity(line: { remaining_quantity: string }): boolean { return Number(line.remaining_quantity) > 0; }
  supplierNameFor(id: string): string { return this.suppliers.find(item=>item.id===id)?.name || id.slice(0,8); }
  productNameFor(id: string): string { return this.products.find(item=>item.id===id)?.name || id.slice(0,8); }
  async receivePurchaseOrder(order: PurchaseOrder): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    const lines=order.lines.filter(line=>this.hasRemainingQuantity(line)).map(line=>({line_id:line.id,quantity:line.remaining_quantity}));
    if(!lines.length)return;
    const businessId=this.business.id;this.purchasesLoading=true;this.operationsError='';
    try { await this.api.receivePurchaseOrder(businessId,order.id,lines); const [orders,products,dashboard]=await Promise.all([this.api.purchaseOrders(businessId),this.api.products(businessId),this.api.dashboard(businessId)]);if(this.business?.id===businessId){this.purchaseOrders=orders;this.products=products;this.dashboard=dashboard;} }
    catch(error){if(this.business?.id===businessId)this.operationsError=this.message(error)} finally{if(this.business?.id===businessId)this.purchasesLoading=false}
  }
  async createRecurringSchedule(): Promise<void> {
    if (!this.business) return;
    const interval=Number(this.recurringIntervalDays);if(!Number.isInteger(interval)||interval<1||interval>3650){this.operationsError=this.t('الفاصل يجب أن يكون بين يوم و3650 يومًا.','Interval must be between 1 and 3650 days.');return;}
    const businessId=this.business.id;this.recurringLoading=true;this.operationsError='';
    try { await this.api.createRecurringSchedule(businessId,{customer_id:this.recurringCustomerId||null,interval_days:interval,timezone:this.recurringTimezone.trim()||'UTC',next_run_at:new Date(this.recurringNextRunAt).toISOString()});const items=await this.api.recurringSchedules(businessId);if(this.business?.id===businessId)this.recurringSchedules=items; }
    catch(error){if(this.business?.id===businessId)this.operationsError=this.message(error)} finally{if(this.business?.id===businessId)this.recurringLoading=false}
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

  setTab(tab: Tab): void {
    if (!this.canAccessTab(tab)) {
      this.tab = 'overview';
      this.mobileMoreOpen = false;
      return;
    }
    this.tab = tab;
    this.error = '';
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
    this.loading = true;
    this.error = '';
    try {
      await this.api.createCustomer(this.business.id, {
        name: this.customerName, email: this.customerEmail || undefined,
        phone: this.customerPhone || undefined
      });
      this.customerName = ''; this.customerEmail = ''; this.customerPhone = '';
      this.customers = await this.api.customers(this.business.id);
      if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.importPreview = null;
    this.importMessage = '';
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
      this.importCsvText = await file.text();
      this.importFileName = file.name;
      this.error = '';
    } catch {
      this.error = this.t('تعذرت قراءة الملف.', 'Could not read the file.');
      input.value = '';
    }
  }

  async previewProductImport(): Promise<void> {
    if (!this.business || !this.importCsvText || this.importLoading) return;
    this.importLoading = true;
    this.importPreview = null;
    this.importMessage = '';
    this.error = '';
    try {
      this.importPreview = await this.api.previewProductCsv(this.business.id, this.importCsvText);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.importLoading = false;
    }
  }

  async confirmProductImport(): Promise<void> {
    if (!this.business || !this.importCsvText || !this.importPreview?.valid || this.importLoading) return;
    this.importLoading = true;
    this.importMessage = '';
    this.error = '';
    try {
      const result = await this.api.importProductCsv(this.business.id, this.importCsvText);
      this.products = await this.api.products(this.business.id);
      if (this.products.length) this.invoiceProductId = this.products[0].id;
      this.importMessage = this.t(
        `تم استيراد ${result.row_count} صف بنجاح.`,
        `Successfully imported ${result.row_count} rows.`
      );
      this.importPreview = null;
      this.importCsvText = '';
      this.importFileName = '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.importLoading = false;
    }
  }

  async onCustomerImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.customerImportPreview = null;
    this.customerImportMessage = '';
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
      this.customerImportCsvText = await file.text();
      this.customerImportFileName = file.name;
      this.error = '';
    } catch {
      this.error = this.t('تعذرت قراءة الملف.', 'Could not read the file.');
      input.value = '';
    }
  }

  async previewCustomerImport(): Promise<void> {
    if (!this.business || !this.customerImportCsvText || this.customerImportLoading) return;
    this.customerImportLoading = true;
    this.customerImportPreview = null;
    this.customerImportMessage = '';
    this.error = '';
    try {
      this.customerImportPreview = await this.api.previewCustomerCsv(
        this.business.id, this.customerImportCsvText
      );
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.customerImportLoading = false;
    }
  }

  async confirmCustomerImport(): Promise<void> {
    if (!this.business || !this.customerImportCsvText ||
        !this.customerImportPreview?.valid || this.customerImportLoading) return;
    this.customerImportLoading = true;
    this.customerImportMessage = '';
    this.error = '';
    try {
      const result = await this.api.importCustomerCsv(
        this.business.id, this.customerImportCsvText
      );
      this.customers = await this.api.customers(this.business.id);
      if (!this.invoiceCustomerId && this.customers.length) {
        this.invoiceCustomerId = this.customers[0].id;
      }
      this.customerImportMessage = this.t(
        `تم استيراد ${result.row_count} صف بنجاح.`,
        `Successfully imported ${result.row_count} rows.`
      );
      this.customerImportPreview = null;
      this.customerImportCsvText = '';
      this.customerImportFileName = '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.customerImportLoading = false;
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
    this.loading = true;
    this.error = '';
    try {
      await this.api.createProduct(this.business.id, {
        name: this.productName, unit_price: this.productPrice, is_stock_tracked: this.stockTracked,
        opening_quantity: this.stockTracked ? this.productOpeningQuantity : '0'
      });
      this.productName = ''; this.productPrice = ''; this.stockTracked = false; this.productOpeningQuantity = '0';
      this.products = await this.api.products(this.business.id);
      if (this.products.length) this.invoiceProductId = this.products[0].id;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  get invoicePreview(): { subtotal: string; discount: string; tax: string; total: string } | null {
    if (!this.business || !this.invoiceLines.length) return null;
    const parseScaled = (value: string | number, scale: number): bigint | null => {
      const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
      if (!match || match[1].length > 12 || (match[2]?.length ?? 0) > scale) return null;
      const fraction = (match[2] || '').padEnd(scale, '0');
      return BigInt(match[1]) * (10n ** BigInt(scale)) + BigInt(fraction || '0');
    };
    const roundHalfUp = (numerator: bigint, denominator: bigint): bigint =>
      (numerator + denominator / 2n) / denominator;
    const formatCents = (cents: bigint): string =>
      `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

    // Preserve precision when rates are reconstructed from saved totals.
    const discountRate = parseScaled(this.invoiceDiscountRate, 12);
    const taxRate = parseScaled(this.invoiceTaxRate, 12);
    if (discountRate === null || taxRate === null ||
        discountRate > 100n * 1_000_000_000_000n || taxRate > 100n * 1_000_000_000_000n) return null;

    // Match the backend's per-line money() policy: round each quantity × price
    // to cents with ROUND_HALF_UP, then sum the rounded line totals.
    let subtotalCents = 0n;
    for (const line of this.invoiceLines) {
      const product = this.products.find(item => item.id === line.productId);
      const quantityMilli = parseScaled(line.quantity, 3);
      const unitPriceCents = parseScaled(product?.unit_price ?? '', 2);
      if (!product || quantityMilli === null || quantityMilli <= 0n ||
          unitPriceCents === null) return null;
      const lineMilliCents = quantityMilli * unitPriceCents;
      subtotalCents += roundHalfUp(lineMilliCents, 1000n);
      if (subtotalCents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    }
    const rateDenominator = 100n * 1_000_000_000_000n;
    const discountCents = roundHalfUp(subtotalCents * discountRate, rateDenominator);
    const taxableCents = subtotalCents - discountCents;
    const taxCents = roundHalfUp(taxableCents * taxRate, rateDenominator);
    return {
      subtotal: formatCents(subtotalCents),
      discount: formatCents(discountCents),
      tax: formatCents(taxCents),
      total: formatCents(taxableCents + taxCents),
    };
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

  addInvoiceLine(): void {
    if (this.loading || !this.products.length) return;
    this.invoiceLines = [...this.invoiceLines, { productId: '', quantity: '1' }];
  }

  removeInvoiceLine(index: number): void {
    if (this.loading || this.invoiceLines.length <= 1) return;
    this.invoiceLines = this.invoiceLines.filter((_, lineIndex) => lineIndex !== index);
  }

  async createInvoice(): Promise<void> {
    const discountRate = Number(this.invoiceDiscountRate);
    const taxRate = Number(this.invoiceTaxRate);
    if (!this.business || !this.invoiceCustomerId || !this.invoiceLines.length ||
        this.invoiceLines.some(line => !line.productId || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) ||
        !Number.isFinite(discountRate) || discountRate < 0 || discountRate > 100 ||
        !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      this.error = this.t('اختَر العميل وأدخل بنودًا ونسب خصم وضريبة صحيحة من 0 إلى 100.', 'Choose a customer, valid lines, and discount/tax rates from 0 to 100.');
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const invoiceNumber = this.invoiceNumber.trim() || 'INV-' + Date.now();
      const payload = {
        invoice_number: invoiceNumber,
        currency_code: this.business.currency_code,
        customer_id: this.invoiceCustomerId,
        lines: this.invoiceLines.map(line => ({ product_id: line.productId, quantity: String(line.quantity) })),
        discount_rate: String(discountRate),
        tax_rate: String(taxRate),
      };
      if (this.editingInvoiceId) {
        await this.api.updateDraftInvoice(this.business.id, this.editingInvoiceId, payload);
      } else {
        await this.api.createInvoice(this.business.id, payload);
      }
      this.cancelInvoiceEdit();
      this.invoiceMessage = this.t('تم حفظ مسودة الفاتورة. راجعها ثم اضغط «إصدار» عند التأكد.', 'Invoice draft saved. Review it, then select “Issue” when ready.');
      this.invoices = await this.api.invoices(this.business.id);
      this.dashboard = await this.api.dashboard(this.business.id);
      this.tab = 'invoices';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }


  private escapePrintHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character] as string));
  }

  async printInvoice(invoice: Invoice): Promise<void> {
    if (!this.business || invoice.status !== 'issued') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.error = this.t('اسمح بفتح نافذة الطباعة من المتصفح ثم حاول مرة أخرى.', 'Allow pop-ups for printing, then try again.');
      return;
    }
    this.loading = true;
    this.error = '';
    try {
      const detail = await this.api.invoiceDetail(this.business.id, invoice.id);
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
        '<div><strong>' + this.escapePrintHtml(this.business.name) + '</strong><p>' + this.escapePrintHtml(this.business.currency_code) + '</p></div></header>' +
        '<table><thead><tr><th>' + labels.item + '</th><th class="number">' + labels.quantity + '</th><th class="number">' + labels.price + '</th><th class="number">' + labels.amount + '</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table><div class="total">' + labels.total + ': ' + total + ' ' + currency + '</div>' +
        '<p class="muted" style="margin-top:24px">' + labels.note + '</p><div class="actions"><button onclick="window.print()">' +
        (this.language === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save PDF') + '</button></div></body></html>'
      );
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      printWindow.close();
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }
  async editInvoice(invoice: Invoice): Promise<void> {
    if (!this.business || invoice.status !== 'draft') return;
    this.loading = true;
    this.error = '';
    try {
      const detail = await this.api.invoiceDetail(this.business.id, invoice.id);
      if (!detail.lines.length || detail.lines.some(line => !line.product_id)) {
        throw new Error(this.t('تحتوي المسودة على بند غير مرتبط بمنتج؛ لم يتم تغيير الفاتورة.', 'This draft contains a line without a linked product; no changes were made.'));
      }
      this.editingInvoiceId = invoice.id;
      this.invoiceNumber = detail.invoice_number;
      this.invoiceCustomerId = detail.customer_id || '';
      this.invoiceDiscountRate = this.deriveRate(detail.discount_total, detail.subtotal);
      const taxableBase = Number(detail.subtotal || 0) - Number(detail.discount_total || 0);
      this.invoiceTaxRate = this.deriveRate(detail.tax_total, taxableBase.toFixed(2));
      this.invoiceMessage = '';
      this.invoiceLines = detail.lines.map(line => ({ productId: line.product_id as string, quantity: line.quantity }));
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  cancelInvoiceEdit(): void {
    this.editingInvoiceId = null;
    this.invoiceMessage = '';
    this.invoiceNumber = '';
    this.invoiceCustomerId = '';
    this.invoiceDiscountRate = '0';
    this.invoiceTaxRate = '0';
    this.invoiceQuantity = '1';
    this.invoiceLines = [{ productId: '', quantity: '1' }];
  }

  async issueInvoice(invoice: Invoice): Promise<void> {
    if (!this.business) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.issueInvoice(this.business.id, invoice.id);
      this.invoiceMessage = '';
      this.invoices = await this.api.invoices(this.business.id);
      this.dashboard = await this.api.dashboard(this.business.id);
      this.products = await this.api.products(this.business.id);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async voidInvoice(invoice: Invoice): Promise<void> {
    if (!this.business || !window.confirm(
      `تأكيد إلغاء الفاتورة ${invoice.invoice_number}؟ إذا كانت الفاتورة عليها دفعات مخصصة، يجب استخدام إجراء ردّ المبلغ أو الإشعار الدائن بدلًا من الإلغاء المباشر.`
    )) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.voidInvoice(this.business.id, invoice.id, 'أُلغي بواسطة مستخدم مخوّل في مساحة العمل');
      this.invoices = await this.api.invoices(this.business.id);
      this.dashboard = await this.api.dashboard(this.business.id);
      this.products = await this.api.products(this.business.id);
      if (this.editingInvoiceId === invoice.id) this.cancelInvoiceEdit();
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  hasOutstandingBalance(invoice: Invoice): boolean {
    const amount = Number(invoice.outstanding_amount);
    return invoice.outstanding_amount !== undefined && Number.isFinite(amount) && amount > 0;
  }

  payInvoice(invoice: Invoice): void {
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
    if (!this.business) return;
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
    this.expenseSubmissionUncertain = false;
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
    if (!this.payments.length) return;
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
    if (!this.business || !this.paymentAmount.trim() || !this.paymentCustomerId) {
      this.error = this.t('اختَر العميل قبل تسجيل الدفعة.', 'Choose a customer before recording the payment.');
      return;
    }
    const businessId = this.business.id;
    const amount = this.paymentAmount.trim();
    const allocation = this.paymentAllocationAmount.trim();
    if (this.paymentInvoiceId && !allocation) {
      this.error = this.t('أدخل المبلغ المراد تخصيصه للفاتورة المحددة.', 'Enter the amount to allocate to the selected invoice.');
      return;
    }
    const currencyCode = this.business.currency_code;
    this.loading = true;
    this.error = '';
    this.paymentMessage = '';
    this.paymentMessageKind = 'info';
    if (!this.paymentIdempotencyKey) {
      this.paymentIdempotencyKey = 'payment-' + businessId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
    try {
      await this.api.createPayment(businessId, {
        amount,
        currency_code: currencyCode,
        idempotency_key: this.paymentIdempotencyKey,
        customer_id: this.paymentCustomerId,
        method: this.paymentMethod,
        reference: this.paymentReference.trim() || undefined,
        allocations: this.paymentInvoiceId ? [{
          invoice_id: this.paymentInvoiceId,
          amount: allocation
        }] : []
      });

      // Do not treat a post-save refresh failure as a failed payment mutation.
      if (this.business?.id !== businessId) return;
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
        if (this.business?.id !== businessId) return;
        this.payments = payments;
        this.dashboard = dashboard;
        this.invoices = invoices;
      } catch {
        if (this.business?.id === businessId) {
          this.paymentMessage = this.t(
            'تم تسجيل الدفعة، لكن تعذر تحديث العرض. لا تعاود تسجيل الدفعة؛ حدّث البيانات أولًا.',
            'Payment was recorded, but the view could not refresh. Do not record it again; refresh the data first.'
          );
          this.paymentMessageKind = 'warning';
        }
      }
    } catch (error) {
      // Preserve entered values and the idempotency key if the save failed or its outcome is uncertain.
      if (this.business?.id === businessId) {
        this.paymentMessage = this.message(error) || this.t('تعذر تسجيل الدفعة. لم يتم تأكيد النتيجة؛ لا تغيّر البيانات وأعد المحاولة بنفس الطلب بعد التحقق من سجل المدفوعات.', 'Could not confirm the payment. Keep the entered values and verify the payment list before retrying.');
        this.paymentMessageKind = 'error';
      }
    } finally {
      this.loading = false;
    }
  }

  useAssistantSuggestion(question: string): void {
    if (this.chatSending || !question.trim()) return;
    this.chatDraft = question;
    void this.sendChat();
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
