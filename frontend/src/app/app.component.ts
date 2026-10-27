import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AuditEvent, Business, ChatReply, Customer, CustomerStatement, Dashboard, Invoice, Payment, Product, ProfitLossReport, ReceivablesAgingReport } from './api.service';
import { AuthService } from './auth.service';
import { WorkspaceLoadGuard } from './workspace-load-guard';
import { APP_BUILD_INFO } from './build-info';
import { PlatformAdminComponent } from './platform-admin.component';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'assistant' | 'reports' | 'audit' | 'platform-admin';

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule, PlatformAdminComponent],
  template: `
    <div class="shell" [class.english]="language === 'en'" [class.install-help-open]="installHelp && !isInstalled" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'" (keydown.escape)="mobileMoreOpen = false">
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
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
        </main>
      } @else {
        <aside class="sidebar" role="navigation" [attr.aria-label]="t('التنقل الرئيسي', 'Main navigation')">
          <a class="brand" href="#" (click)="$event.preventDefault(); setTab('overview')"><span class="brand-mark small">A</span><span>مساعد<span class="light">الأعمال</span></span></a>
          <p class="nav-label">{{ t('مساحة العمل', 'Workspace') }}</p>
          <div class="workspace-release-meta" [attr.aria-label]="t('إصدار التطبيق ووقت النشر', 'App version and deployment time')">
            <span class="version-pill">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
            <small>{{ t('آخر نشر (وقت بناء النسخة):', 'Last deployment (build time):') }} {{ buildTimeLabel }}</small>
          </div>
          <button class="nav-item" [attr.aria-label]="t('الرئيسية', 'Home')" [attr.title]="t('الرئيسية', 'Home')" [class.active]="tab === 'overview'" [attr.aria-current]="tab === 'overview' ? 'page' : null" (click)="setTab('overview')"><span class="nav-icon overview-icon" aria-hidden="true">⌂</span><span>{{ t('الرئيسية', 'Home') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('الأرباح والخسائر', 'Profit & loss')" [attr.title]="t('الأرباح والخسائر', 'Profit & loss')" [class.active]="tab === 'reports'" [attr.aria-current]="tab === 'reports' ? 'page' : null" (click)="setTab('reports')"><span class="nav-icon" aria-hidden="true">∑</span><span>{{ t('الأرباح والخسائر', 'Profit & loss') }}</span></button>
          <button class="nav-item" [attr.aria-label]="t('الفواتير', 'Invoices')" [attr.title]="t('الفواتير', 'Invoices')" [class.active]="tab === 'invoices'" [attr.aria-current]="tab === 'invoices' ? 'page' : null" (click)="setTab('invoices')"><span class="nav-icon invoices-icon" aria-hidden="true">▤</span><span>{{ t('الفواتير', 'Invoices') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المنتجات والمخزون', 'Products & inventory')" [attr.title]="t('المنتجات والمخزون', 'Products & inventory')" [class.active]="tab === 'products'" [attr.aria-current]="tab === 'products' ? 'page' : null" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>{{ t('المنتجات والمخزون', 'Products & inventory') }}</span></button>
          <button class="nav-item" [attr.aria-label]="t('العملاء', 'Customers')" [attr.title]="t('العملاء', 'Customers')" [class.active]="tab === 'customers'" [attr.aria-current]="tab === 'customers' ? 'page' : null" (click)="setTab('customers')"><span class="nav-icon customers-icon" aria-hidden="true">♧</span><span>{{ t('العملاء', 'Customers') }}</span></button>
          @if (platformAdminAvailable) { <button class="nav-item platform-admin-nav" [attr.aria-label]="t('إدارة المنصة', 'Platform admin')" [attr.title]="t('إدارة المنصة', 'Platform admin')" [class.active]="tab === 'platform-admin'" [attr.aria-current]="tab === 'platform-admin' ? 'page' : null" (click)="setTab('platform-admin')"><span class="nav-icon" aria-hidden="true">◇</span><span>{{ t('إدارة المنصة', 'Platform admin') }}</span></button> }
@if (business?.role === 'owner') { <button class="nav-item mobile-extra" [attr.aria-label]="t('سجل العمليات', 'Activity log')" [attr.title]="t('سجل العمليات', 'Activity log')" [class.active]="tab === 'audit'" [attr.aria-current]="tab === 'audit' ? 'page' : null" (click)="setTab('audit')"><span class="nav-icon" aria-hidden="true">◷</span><span>{{ t('سجل العمليات', 'Activity log') }}</span></button> }
                    @if (business?.role === 'owner') { <button class="nav-item mobile-extra" [attr.aria-label]="t('المدفوعات', 'Payments')" [attr.title]="t('المدفوعات', 'Payments')" [class.active]="tab === 'payments'" [attr.aria-current]="tab === 'payments' ? 'page' : null" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>{{ t('المدفوعات', 'Payments') }}</span></button> }
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المساعد الذكي', 'AI assistant')" [attr.title]="t('المساعد الذكي', 'AI assistant')" [class.active]="tab === 'assistant'" [attr.aria-current]="tab === 'assistant' ? 'page' : null" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>{{ t('المساعد الذكي', 'AI assistant') }}</span></button>
          <button class="nav-item mobile-more" type="button" [class.active]="mobileMoreOpen || ['products','payments','assistant','reports'].includes(tab)" [attr.aria-label]="t('المزيد من الأقسام', 'More sections')" [attr.aria-expanded]="mobileMoreOpen" aria-controls="mobile-more-menu" aria-haspopup="menu" (click)="toggleMobileMore()"><span class="nav-icon" aria-hidden="true">•••</span><span>{{ t('المزيد', 'More') }}</span></button>
          @if (mobileMoreOpen) {
            <div id="mobile-more-menu" class="mobile-more-menu" role="menu" [attr.aria-label]="t('أقسام إضافية', 'Additional sections')">
              <button class="nav-item" role="menuitem" [class.active]="tab === 'products'" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>{{ t('المنتجات والمخزون', 'Products & inventory') }}</span></button>
              @if (business?.role === 'owner') { <button class="nav-item" role="menuitem" [class.active]="tab === 'payments'" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>{{ t('المدفوعات', 'Payments') }}</span></button> }
              <button class="nav-item" role="menuitem" [class.active]="tab === 'assistant'" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>{{ t('المساعد الذكي', 'AI assistant') }}</span></button>
<button class="nav-item" role="menuitem" [class.active]="tab === 'audit'" (click)="setTab('audit')"><span class="nav-icon" aria-hidden="true">◷</span><span>{{ t('سجل العمليات', 'Activity log') }}</span></button>
                            <button class="nav-item" role="menuitem" [class.active]="tab === 'reports'" (click)="setTab('reports')"><span class="nav-icon" aria-hidden="true">∑</span><span>{{ t('الأرباح والخسائر', 'Profit & loss') }}</span></button>
              <button class="nav-item mobile-menu-action" role="menuitem" type="button" (click)="toggleLanguage()"><span class="nav-icon" aria-hidden="true">文</span><span>{{ language === 'ar' ? 'English' : 'العربية' }}</span></button>
              <button class="nav-item mobile-menu-action" role="menuitem" type="button" (click)="logout()"><span class="nav-icon" aria-hidden="true">↪</span><span>{{ t('تسجيل الخروج', 'Sign out') }}</span></button>
            </div>
          }
          <div class="sidebar-bottom"><span class="status-dot"></span> {{ t('جلسة موثّقة', 'Verified session') }}<small>{{ t('يتحقق الخادم من صلاحيات مساحة العمل', 'The server verifies workspace permissions') }}</small></div>
        </aside>
        <main class="main">
          @if (tab === 'platform-admin' && platformAdminAvailable) {
            <aba-platform-admin [language]="language" [userEmail]="userEmail" (signOutRequested)="logout()" (languageToggleRequested)="toggleLanguage()" />
          } @else {
          <header class="topbar">
            <div class="topbar-heading"><div class="workspace-build-card" [attr.aria-label]="t('إصدار التطبيق ووقت البناء', 'App version and build time')"><span class="version-pill">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span><small>{{ t('وقت البناء', 'Build time') }} · {{ buildTimeLabel }}</small></div><p class="eyebrow">{{ t('مساحة العمل', 'Workspace') }}</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area">@if (!isInstalled) { <button class="secondary install-button" type="button" (click)="installApp()">{{ t('تثبيت التطبيق', 'Install app') }}</button> }<button class="secondary language-toggle" type="button" (click)="toggleLanguage()">{{ language === 'ar' ? 'English' : 'العربية' }}</button><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">{{ t('تسجيل الخروج', 'Sign out') }}</button></div>
          </header>

          @if (error) { <div class="error-banner" role="alert"><span>{{ error }}</span><button class="secondary" type="button" (click)="retry()">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
          @if (loading) { <p class="muted">{{ t('جارٍ تحميل بيانات مساحة العمل…', 'Loading workspace data…') }}</p> }

          @if (!business) {
            <section class="panel narrow">
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
              <div><span class="eyebrow">{{ t('النشاط الحالي', 'Current business') }}</span><strong>{{ business.name }}</strong></div>
              <select [attr.aria-label]="t('اختيار النشاط', 'Select business')" [ngModel]="selectedBusinessId" (ngModelChange)="switchBusiness($event)">
                @for (item of businesses; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
              </select>
            </section>
            <div class="mobile-version-strip"><span class="version-pill" [attr.title]="t('إصدار الواجهة وواجهة API', 'UI and API release versions') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span><small class="mobile-deploy-time">{{ t('آخر نشر (وقت بناء النسخة):', 'Last deployment (build time):') }} {{ buildTimeLabel }}</small></div>

            @if (tab === 'overview') {
              <section class="hero">
                <div><p class="eyebrow light">{{ t('ملخص النشاط', 'BUSINESS SUMMARY') }}</p><h2>{{ t('القرارات الأفضل تبدأ', 'Better decisions start') }}<br>{{ t('بأرقام موثوقة.', 'with reliable numbers.') }}</h2><p>{{ t('يعرض النشاط المسجّل خلال آخر 30 يومًا. يتم فصل الإجماليات حسب العملة.', 'Shows recorded activity for the last 30 days. Totals are separated by currency.') }}</p></div>
                <div class="hero-mark" aria-hidden="true">AI</div>
              </section>
              @if (dashboard) {
                <section class="metric-grid">
                  <article class="metric"><span>{{ t('المبيعات بالفواتير', 'Invoiced sales') }}</span>@for (item of dashboard.invoiced_sales; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} {{ t('فاتورة صادرة', 'issued invoices') }}</small> } @if (!dashboard.invoiced_sales.length) { <strong>0</strong><small>{{ t('لا توجد مبيعات بفواتير صادرة خلال الفترة', 'No invoiced sales in this period') }}</small> }</article>
                  <article class="metric"><span>{{ t('المدفوعات المحصّلة', 'Payments collected') }}</span>@for (item of dashboard.collected_payments; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} {{ t('دفعة مسجلة', 'recorded payments') }}</small> } @if (!dashboard.collected_payments.length) { <strong>0</strong><small>{{ t('لا توجد مدفوعات مسجلة خلال الفترة', 'No payments recorded in this period') }}</small> }</article>
                  <article class="metric"><span>{{ t('المصروفات', 'Expenses') }}</span>@for (item of dashboard.expenses; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} {{ t('مصروف مسجل', 'recorded expenses') }}</small> } @if (!dashboard.expenses.length) { <strong>0</strong><small>{{ t('لا توجد مصروفات مسجلة خلال الفترة', 'No expenses recorded in this period') }}</small> }</article>
                  <article class="metric"><span>{{ t('الأرصدة المستحقة', 'Outstanding balances') }}</span>@for (item of dashboard.outstanding_balances; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ t('الفواتير الصادرة بعد خصم المبالغ المخصصة', 'Issued invoices after allocated payments') }}</small> } @if (!dashboard.outstanding_balances.length) { <strong>0</strong><small>{{ t('لا توجد فواتير مستحقة خلال الفترة', 'No outstanding invoices in this period') }}</small> }</article>
                </section>
              }
              <section class="notice"><strong>{{ t('سلامة البيانات', 'Data integrity') }}</strong><span>{{ t('الإجماليات مأخوذة من سجلات النشاط المحفوظة. لا تمثل حسابًا للأرباح ولا يتم دمج العملات المختلفة.', 'Totals come from saved business records. They are not a profit calculation, and different currencies are never combined.') }}</span></section>
              <section class="quick-grid">
                <button class="quick-card" (click)="setTab('customers')"><strong>{{ t('العملاء', 'Customers') }}</strong><span>{{ customers.length }} {{ t('سجلات نشطة · عرض القائمة ←', 'active records · View list →') }}</span></button>
                <button class="quick-card" (click)="setTab('products')"><strong>{{ t('المنتجات', 'Products') }}</strong><span>{{ products.length }} {{ t('سجلات نشطة · عرض الكتالوج ←', 'active records · View catalog →') }}</span></button>
                <button class="quick-card" (click)="setTab('invoices')"><strong>{{ t('الفواتير', 'Invoices') }}</strong><span>{{ invoices.length }} {{ t('سجل · إدارة المبيعات ←', 'records · Manage sales →') }}</span></button>
              </section>
            }

            @if (tab === 'reports') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('الأرباح والخسائر', 'Profit & loss') }}</h2><p>{{ t('تابع الإيرادات والمصروفات حسب الفترة، مع إبقاء كل عملة منفصلة.', 'Review revenue and expenses by period, keeping each currency separate.') }}</p></div><span class="count">{{ t('تقرير مالي', 'Financial report') }}</span></div>
                <form class="inline-form" (ngSubmit)="loadProfitLoss()">
                  <select name="profitLossPeriod" [attr.aria-label]="t('الفترة المالية', 'Reporting period')" [(ngModel)]="profitLossPeriod"><option value="30d">{{ t('آخر 30 يومًا', 'Last 30 days') }}</option><option value="month">{{ t('الشهر الحالي', 'Current month') }}</option><option value="all">{{ t('كل الوقت', 'All time') }}</option><option value="custom">{{ t('فترة مخصصة', 'Custom period') }}</option></select>
                  @if (profitLossPeriod === 'custom') { <label>{{ t('من', 'From') }}<input type="date" name="profitLossStart" required [(ngModel)]="profitLossStart"></label><label>{{ t('إلى', 'To') }}<input type="date" name="profitLossEnd" required [(ngModel)]="profitLossEnd"></label> }
                  <button class="primary" type="submit" [disabled]="reportLoading">{{ reportLoading ? t('جارٍ الحساب…', 'Calculating…') : t('عرض التقرير', 'Run report') }}</button>
                </form>
                @if (reportError) { <div class="error-banner" role="alert">{{ reportError }}</div> }
                @if (profitLoss) {
                  <p class="muted">{{ profitLoss.period.start_date || t('من بداية السجلات', 'From the beginning of records') }} — {{ profitLoss.period.end_date || t('حتى الآن', 'through today') }} · {{ profitLoss.period.timezone || 'UTC' }}</p>
                  <p class="muted"><strong>{{ t('أساس الإيراد:', 'Revenue basis:') }}</strong> {{ profitLoss.revenue_basis }}</p>
                  <div class="metric-grid">
                    @for (row of profitLoss.currencies; track row.currency_code) {
                      <article class="metric"><span>{{ t('الإيرادات (فواتير صادرة)', 'Revenue (issued invoices)') }}</span><strong>{{ row.revenue }} {{ row.currency_code }}</strong><small>{{ row.revenue_invoice_count }} {{ t('فاتورة', 'invoices') }}</small></article>
                      <article class="metric"><span>{{ t('المرتجعات المعتمدة (من فواتير الفترة)', 'Approved returns (period invoices)') }}</span><strong>{{ row.approved_return_total }} {{ row.currency_code }}</strong><small>{{ row.approved_return_count }} {{ t('مرتجع', 'returns') }} · {{ t('تُعرض منفصلة ولا تُخصم من الإيراد', 'shown separately; not deducted from revenue') }}</small></article>
                      <article class="metric"><span>{{ t('المصروفات المسجلة', 'Recorded expenses') }}</span><strong>{{ row.expenses }} {{ row.currency_code }}</strong><small>{{ row.expense_count }} {{ t('مصروف', 'expenses') }}</small></article>
                      <article class="metric"><span>{{ t('النتيجة قبل تكلفة البضاعة', 'Result before cost of goods') }}</span><strong>{{ row.operating_result_before_cost_of_goods }} {{ row.currency_code }}</strong><small>{{ t('إيرادات الفواتير − المصروفات المسجلة', 'Invoice revenue − recorded expenses') }}</small></article>
                    }
                  </div>
                  @if (!profitLoss.currencies.length) { <p class="empty">{{ t('لا توجد فواتير صادرة أو مصروفات مسجلة في هذه الفترة.', 'No issued invoices or recorded expenses in this period.') }}</p> }
                  <div class="notice"><strong>{{ t('مهم قبل اعتبارها أرباحًا صافية', 'Important limitation') }}</strong><span>{{ t('هذا حساب مبدئي: لا يشمل تكلفة شراء البضاعة لأن تكلفة المنتج غير مرتبطة بعد بالمبيعات، كما أن الإيرادات تُحسب من الفواتير الصادرة لا من النقد المحصّل. لا يتم جمع العملات المختلفة.', 'This is a preliminary result: product purchase costs are not yet linked to sales, and revenue is based on issued invoices rather than cash collected. Different currencies are never combined.') }}</span></div>
                }
                <div class="divider"></div>
                <div class="section-head"><div><h3>{{ t('أعمار المديونيات', 'Receivables aging') }}</h3><p>{{ t('الأرصدة المتبقية حسب تاريخ الاستحقاق، مع فصل كل عملة.', 'Outstanding balances by due date, with currencies kept separate.') }}</p></div></div>
                <form class="inline-form" (ngSubmit)="loadReceivablesAging()"><label>{{ t('التقرير حتى تاريخ', 'Report as of') }}<input type="date" name="agingAsOf" required [(ngModel)]="agingAsOf"></label><button class="primary" type="submit" [disabled]="agingLoading">{{ agingLoading ? t('جارٍ التحميل…', 'Loading…') : t('عرض المديونيات', 'Load receivables') }}</button></form>
                @if (agingError) { <div class="error-banner" role="alert">{{ agingError }}</div> }
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
                  @if (agingReport.limitations.length) { <div class="notice"><strong>{{ t('حدود التقرير', 'Report limitations') }}</strong>@for (limitation of agingReport.limitations; track limitation) { <p>{{ limitation }}</p> }</div> }
                }
              </section>
            }

            @if (tab === 'customers') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('قائمة العملاء', 'Customer list') }}</h2><p>{{ t('تقتصر السجلات على مساحة العمل المحددة.', 'Records are limited to the selected workspace.') }}</p></div><span class="count">{{ customers.length }} {{ t('عميل', 'customers') }}</span></div>
                <form class="inline-form" (ngSubmit)="createCustomer()">
                  <input [attr.aria-label]="t('اسم العميل', 'Customer name')" name="customerName" [placeholder]="t('اسم العميل', 'Customer name')" required [(ngModel)]="customerName">
                  <input [attr.aria-label]="t('بريد العميل الإلكتروني', 'Customer email')" name="customerEmail" type="email" [placeholder]="t('البريد الإلكتروني (اختياري)', 'Email (optional)')" [(ngModel)]="customerEmail">
                  <input [attr.aria-label]="t('هاتف العميل', 'Customer phone')" name="customerPhone" [placeholder]="t('الهاتف (اختياري)', 'Phone (optional)')" [(ngModel)]="customerPhone">
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة عميل', 'Add customer') }}</button>
                </form>
                <div class="list">
                  @for (customer of customers; track customer.id) { <article class="list-row customer-list-row"><div class="avatar">{{ customer.name.slice(0,1).toUpperCase() }}</div><div class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.email || t('لا يوجد بريد إلكتروني', 'No email') }} · {{ customer.phone || t('لا يوجد هاتف', 'No phone') }}</small><small>{{ customerInvoiceCount(customer.id) }} {{ t('فاتورة مرتبطة', 'linked invoices') }}</small></div><button class="secondary" type="button" (click)="showCustomerInvoices(customer.id)">{{ t('عرض الفواتير', 'View invoices') }}</button><button class="secondary" type="button" (click)="loadCustomerStatement(customer)">{{ t('كشف الحساب', 'Statement') }}</button></article> }
                  @if (!customers.length) { <p class="empty">{{ t('لا يوجد عملاء بعد. أضف أول عميل من النموذج أعلاه.', 'No customers yet. Add your first customer using the form above.') }}</p> }
                </div>
                @if (statementVisible) {
                  <section class="panel statement-panel">
                    <div class="section-head"><div><h3>{{ t('كشف حساب العميل', 'Customer statement') }} · {{ customerStatement?.customer?.name || statementCustomerName }}</h3><p>{{ t('الرصيد مفصول حسب العملة. هذا التقرير لا يستبدل دفتر أستاذ مزدوج القيد.', 'Balances stay separate by currency. This report is not a double-entry general ledger.') }}</p></div><button class="secondary" type="button" (click)="customerStatement=null; statementVisible=false; statementError=''">{{ t('إغلاق', 'Close') }}</button></div>
                    @if (statementLoading) { <p class="muted" role="status">{{ t('جارٍ تحميل كشف الحساب…', 'Loading statement…') }}</p> }
                    @if (statementError) { <p class="error" role="alert">{{ statementError }}</p> }
                    @if (customerStatement) {
                      <div class="metric-grid">@for (entry of statementBalanceEntries; track entry.currency) { <article class="metric"><span>{{ t('الرصيد', 'Balance') }} · {{ entry.currency }}</span><strong>{{ entry.balance }} {{ entry.currency }}</strong></article> }</div>
                      <div class="table-wrap"><table><thead><tr><th>{{ t('التاريخ', 'Date') }}</th><th>{{ t('الحركة', 'Event') }}</th><th>{{ t('المرجع', 'Reference') }}</th><th>{{ t('مدين', 'Debit') }}</th><th>{{ t('دائن', 'Credit') }}</th><th>{{ t('الرصيد', 'Balance') }}</th></tr></thead><tbody>
                        @for (event of customerStatement.items; track event.source_id + event.event_type) { <tr><td>{{ event.occurred_at | date:'short' }}</td><td>{{ event.event_type }}</td><td>{{ event.reference || event.source_id }}</td><td>{{ event.debit }} {{ event.currency_code }}</td><td>{{ event.credit }} {{ event.currency_code }}</td><td>{{ event.balance }} {{ event.currency_code }}</td></tr> }
                      </tbody></table></div>
                      <div class="inline-form"><span class="muted">{{ statementOffset + 1 }}–{{ statementOffset + customerStatement.items.length }} / {{ customerStatement.total }}</span><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset > 50 ? statementOffset - 50 : 0)" [disabled]="statementLoading || statementOffset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadCustomerStatementPage(statementOffset + 50)" [disabled]="statementLoading || statementOffset + customerStatement.items.length >= customerStatement.total">{{ t('التالي', 'Next') }}</button></div>
                      @for (limitation of customerStatement.limitations; track limitation) { <p class="muted">• {{ limitation }}</p> }
                    }
                  </section>
                }
              </section>
            }

            @if (tab === 'products') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('المنتجات والخدمات', 'Products & services') }}</h2><p>{{ t('يتم حفظ الأسعار بدقة عشرية.', 'Prices are stored using decimal precision.') }}</p></div><span class="count">{{ products.length }} {{ t('منتج', 'products') }}</span></div>
                <form class="inline-form" (ngSubmit)="createProduct()">
                  <input [attr.aria-label]="t('اسم المنتج', 'Product name')" name="productName" [placeholder]="t('اسم المنتج', 'Product name')" required [(ngModel)]="productName">
                  <input [attr.aria-label]="t('سعر الوحدة', 'Unit price')" name="productPrice" type="number" min="0" step="0.01" [placeholder]="t('سعر الوحدة', 'Unit price')" required [(ngModel)]="productPrice">
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> {{ t('متابعة المخزون', 'Track stock') }}</label>
                  @if (stockTracked) { <label>{{ t('الكمية الافتتاحية بالمخزن', 'Opening stock quantity') }}<input name="productOpeningQuantity" type="number" min="0" step="0.001" [(ngModel)]="productOpeningQuantity" required></label> }
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة منتج', 'Add product') }}</button>
                </form>
                <section class="csv-import-panel" aria-label="CSV product import">
                  <h3>{{ t('استيراد المنتجات من CSV', 'Import products from CSV') }}</h3>
                  <p>{{ t('اختَر ملف CSV يحتوي على sku وname وunit_price. المعاينة لا تحفظ أي بيانات.', 'Choose a CSV with sku, name and unit_price. Preview does not save any data.') }}</p>
                  <input type="file" accept=".csv,text/csv" [attr.aria-label]="t('اختيار ملف CSV', 'Choose CSV file')" (change)="onImportFileSelected($event)" [disabled]="importLoading">
                  @if (importFileName) { <small>{{ importFileName }}</small> }
                  <div class="csv-import-actions">
                    <button class="secondary" type="button" (click)="previewProductImport()" [disabled]="importLoading || !importCsvText">{{ importLoading ? t('جارٍ المعالجة…', 'Working…') : t('معاينة الملف', 'Preview file') }}</button>
                    @if (importPreview?.valid) { <button class="primary" type="button" (click)="confirmProductImport()" [disabled]="importLoading">{{ t('استيراد', 'Import') }} {{ importPreview?.row_count }} {{ t('صف', 'rows') }}</button> }
                  </div>
                  @if (importPreview) {
                    <p role="status">{{ importPreview.valid ? t('الملف صالح. لم يتم حفظ بيانات بعد.', 'File is valid. No data has been saved yet.') : t('الملف يحتوي على أخطاء؛ أصلحها ثم أعد المعاينة.', 'The file has errors. Fix them and preview again.') }} · {{ importPreview.row_count }} {{ t('صف', 'rows') }}</p>
                    @if (importPreview.errors.length) {
                      <ul class="csv-import-errors">
                        @for (item of importPreview.errors; track $index) {
                          <li>{{ t('صف', 'Row') }} {{ item.row }} · {{ item.field }} · {{ importErrorLabel(item.code) }}@if (item.first_row) { ({{ t('أول ظهور في الصف', 'first seen on row') }} {{ item.first_row }}) }@if (item.max_length) { ({{ t('الحد الأقصى', 'max') }} {{ item.max_length }}) }</li>
                        }
                      </ul>
                    }
                  }
                  @if (importMessage) { <p role="status">{{ importMessage }}</p> }
                </section>
                <div class="list">
                  @for (product of products; track product.id) { <article class="list-row"><div class="product-mark">◇</div><div class="grow"><strong>{{ product.name }}</strong><small>{{ product.is_stock_tracked ? t('المخزون: ', 'Stock: ') + (product.stock_quantity ?? '0') : t('خدمة / لا تتم متابعة المخزون', 'Service / no stock tracking') }}{{ product.sku ? ' · SKU ' + product.sku : '' }}</small></div><strong>{{ product.unit_price }} {{ business.currency_code }}</strong></article> }
                  @if (!products.length) { <p class="empty">{{ t('لا توجد منتجات بعد. أضف منتجًا أو خدمة من النموذج أعلاه.', 'No products yet. Add a product or service using the form above.') }}</p> }
                </div>
              </section>
            }

            @if (tab === 'invoices') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('المبيعات والفواتير', 'Sales & invoices') }}</h2><p>{{ t('كل فاتورة صادرة مرتبطة بعميل؛ اختر العميل لعرض فواتيره.', 'Every issued invoice is linked to a customer; filter by customer to view their invoices.') }}</p></div><span class="count">{{ filteredInvoices.length }} / {{ invoices.length }} {{ t('فاتورة', 'invoices') }}</span></div>
                <div class="inline-form customer-invoice-filter"><label>{{ t('تصفية الفواتير الموجودة حسب العميل', 'Filter existing invoices by customer') }}<select name="invoiceFilterCustomer" [attr.aria-label]="t('تصفية الفواتير حسب العميل', 'Filter invoices by customer')" [(ngModel)]="invoiceFilterCustomerId"><option value="">{{ t('عرض فواتير كل العملاء', 'Show all customers’ invoices') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select></label></div><details class="invoice-create-disclosure"><summary><span>{{ t('إضافة فاتورة جديدة', 'Create a new invoice') }}</span><small>{{ t('افتح النموذج بشكل مستقل عن تصفية الفواتير', 'Open the form separately from invoice filtering') }}</small></summary>
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
                </details>
                @if (invoiceMessage) { <p class="notice" role="status">{{ invoiceMessage }}</p> }
                <div class="list">
                  @for (invoice of filteredInvoices; track invoice.id) { <article class="list-row"><div class="invoice-mark">▤</div><div class="grow"><strong>{{ invoice.invoice_number }}</strong><small>{{ customerNameForInvoice(invoice.customer_id) }} · {{ invoiceStatusLabel(invoice.status) }} · {{ invoice.currency_code }}</small></div><strong>{{ invoice.total }} {{ invoice.currency_code }}</strong>@if (invoice.status === 'draft') { <button class="secondary" (click)="editInvoice(invoice)" [disabled]="loading">{{ t('تعديل', 'Edit') }}</button><button class="secondary" (click)="issueInvoice(invoice)" [disabled]="loading">{{ t('إصدار', 'Issue') }}</button><button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button> } @else if (invoice.status === 'issued') { <small>{{ t('المتبقي: ', 'Outstanding: ') }}{{ invoice.outstanding_amount ?? t('جارٍ التحميل', 'loading') }} {{ invoice.currency_code }}</small>@if (business?.role === 'owner' && invoice.outstanding_amount !== undefined && Number(invoice.outstanding_amount) > 0) { <button class="secondary" type="button" (click)="payInvoice(invoice)" [disabled]="loading">{{ t('سداد', 'Pay') }}</button> } <button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button> }</article> }
                  @if (!filteredInvoices.length) { <p class="empty">{{ invoices.length ? t('لا توجد فواتير مرتبطة بالعميل المحدد.', 'No invoices linked to the selected customer.') : t('لا توجد فواتير بعد. أضف عميلًا ومنتجًا ثم أنشئ فاتورتك الأولى.', 'No invoices yet. Add a customer and product, then create your first invoice.') }}</p> }
                </div>
                <p class="footnote">{{ t('إصدار الفاتورة يخصم المخزون المتابع بشكل ذري، ويرفض العملية إذا كانت الكمية غير كافية.', 'Issuing an invoice deducts tracked stock atomically and rejects the operation if stock is insufficient.') }}</p>
              </section>
            }

            @if (tab === 'payments' && business?.role !== 'owner') {
              <section class="panel"><p class="error" role="alert">{{ t('تسجيل المدفوعات متاح لمالك مساحة العمل فقط. اطلب من المالك منحك الصلاحية المناسبة.', 'Recording payments is restricted to workspace owners. Ask the owner to grant the appropriate access.') }}</p></section>
            }
            @if (tab === 'payments' && business?.role === 'owner') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('تسجيل دفعة', 'Record payment') }}</h2><p>{{ t('سجّل المبلغ المستلم، ويمكنك تخصيصه لفاتورة صادرة.', 'Record the amount received and optionally allocate it to an issued invoice.') }}</p></div><span class="count">{{ payments.length }} دفعة</span></div>
                <form class="inline-form payment-form" (ngSubmit)="createPayment()">
                  <input [attr.aria-label]="t('مبلغ الدفعة', 'Payment amount')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المستلم', 'Amount received')" required [(ngModel)]="paymentAmount">
                  <select [attr.aria-label]="t('عميل الدفعة', 'Payment customer')" name="paymentCustomer" required [(ngModel)]="paymentCustomerId"><option value="" disabled>{{ t('اختر العميل', 'Choose customer') }}</option>@for (customer of customers; track customer.id) { <option [value]="customer.id">{{ customer.name }}</option> }</select>
                  <select [attr.aria-label]="t('طريقة الدفع', 'Payment method')" name="paymentMethod" [(ngModel)]="paymentMethod"><option value="cash">{{ t('نقدًا', 'Cash') }}</option><option value="bank_transfer">{{ t('تحويل بنكي', 'Bank transfer') }}</option><option value="card">{{ t('بطاقة', 'Card') }}</option><option value="wallet">{{ t('محفظة إلكترونية', 'E-wallet') }}</option><option value="other">{{ t('أخرى', 'Other') }}</option></select>
                  <select [attr.aria-label]="t('الفاتورة المراد تخصيص الدفعة لها', 'Invoice to allocate payment to')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId" (ngModelChange)="syncPaymentCustomer()"><option value="">{{ t('عدم تخصيص الدفعة الآن', 'Do not allocate yet') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (paymentInvoiceId) { <input [attr.aria-label]="t('المبلغ المراد تخصيصه', 'Amount to allocate')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المخصص للفاتورة', 'Amount allocated to invoice')" [(ngModel)]="paymentAllocationAmount"> }
                  <input [attr.aria-label]="t('مرجع الدفعة', 'Payment reference')" name="paymentReference" maxlength="128" [placeholder]="t('المرجع (اختياري)', 'Reference (optional)')" [(ngModel)]="paymentReference">
                  <button class="primary" type="submit" [disabled]="loading || !paymentAmount">{{ t('تسجيل دفعة', 'Record payment') }}</button>
                </form>
                @if (paymentMessage) { <p class="footnote" role="status" aria-live="polite">{{ paymentMessage }}</p> }
                <p class="footnote">{{ t('العملة المحددة هي', 'The selected currency is') }} {{ business.currency_code }} {{ t('لمساحة العمل دي. يتحقق النظام من المبلغ المخصص مقارنة بالرصيد المستحق، وتظل المبالغ غير المخصصة مسجلة كمدفوعات مستلمة.', 'for this workspace. Allocations are checked against the outstanding balance, and unallocated amounts remain recorded as received payments.') }}</p>
                <div class="list">
                  @for (payment of payments; track payment.id) { <article class="list-row"><div class="payment-mark">↗</div><div class="grow"><strong>{{ payment.amount }} {{ payment.currency_code }}</strong><small>{{ customerNameForInvoice(payment.customer_id) }} · {{ payment.received_at | date:'medium' }} · {{ payment.method || t('طريقة الدفع غير محددة', 'Payment method not specified') }}{{ payment.reference ? ' · ' + payment.reference : '' }}</small><small>{{ payment.allocations.length ? payment.allocations.length + ' ' + t('تخصيص للفاتورة', 'invoice allocations') : t('دفعة غير مخصصة', 'Unallocated payment') }}</small></div></article> }
                  @if (!payments.length) { <p class="empty">{{ t('لا توجد دفعات مسجلة حتى الآن.', 'No payments have been recorded yet.') }}</p> }
                </div>
              </section>
            }

            @if (tab === 'audit') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('سجل العمليات', 'Activity log') }}</h2><p>{{ t('سجل قراءة فقط للأحداث المسجلة في مساحة العمل الحالية.', 'Read-only history of recorded events in the current workspace.') }}</p></div><span class="count">{{ auditTotal }} {{ t('حدث', 'events') }}</span></div>
                <form class="inline-form" (ngSubmit)="loadAuditEvents(0)">
                  <label>{{ t('نوع العملية', 'Action') }}<input name="auditAction" maxlength="80" [(ngModel)]="auditAction" placeholder="invoice.issued"></label>
                  <label>{{ t('نوع السجل', 'Target type') }}<input name="auditTarget" maxlength="80" [(ngModel)]="auditTargetType" placeholder="invoice"></label>
                  <button class="primary" type="submit" [disabled]="auditLoading">{{ t('تصفية', 'Filter') }}</button>
                  <button class="secondary" type="button" (click)="auditAction=''; auditTargetType=''; loadAuditEvents(0)" [disabled]="auditLoading">{{ t('مسح الفلاتر', 'Clear filters') }}</button>
                </form>
                @if (auditError) { <p class="error" role="alert">{{ auditError }}</p> }
                @if (auditLoading) { <p class="muted" role="status">{{ t('جارٍ تحميل السجل…', 'Loading activity…') }}</p> }
                @if (!auditLoading && !auditEvents.length && !auditError) { <p class="empty">{{ t('لا توجد أحداث مطابقة للفلاتر.', 'No events match these filters.') }}</p> }
                <div class="table-wrap"><table><thead><tr><th>{{ t('التاريخ', 'Date') }}</th><th>{{ t('العملية', 'Action') }}</th><th>{{ t('نوع السجل', 'Target') }}</th><th>{{ t('المعرّف', 'Record ID') }}</th><th>{{ t('المنفذ', 'Actor') }}</th></tr></thead><tbody>
                  @for (event of auditEvents; track event.id) { <tr><td>{{ event.created_at ? (event.created_at | date:'short') : '—' }}</td><td>{{ event.action }}</td><td>{{ event.target_type }}</td><td>{{ event.target_id || '—' }}</td><td>{{ event.actor_subject }}</td></tr> }
                </tbody></table></div>
                <div class="inline-form"><span class="muted">{{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} / {{ auditTotal }}</span><button class="secondary" type="button" (click)="loadAuditEvents((auditOffset > 50 ? auditOffset - 50 : 0))" [disabled]="auditLoading || auditOffset === 0">{{ t('السابق', 'Previous') }}</button><button class="secondary" type="button" (click)="loadAuditEvents(auditOffset + 50)" [disabled]="auditLoading || auditOffset + auditEvents.length >= auditTotal">{{ t('التالي', 'Next') }}</button></div>
              </section>
            }

            @if (tab === 'assistant') {
              <section class="panel chat-panel">
                <div class="section-head"><div><h2>{{ t('مساعد الأعمال الذكي', 'AI Business Assistant') }}</h2><p>{{ t('الإجابات مبنية على السجلات الحديثة لمساحة العمل الحالية فقط.', 'Answers use recent records from the current workspace only.') }}</p></div><span class="count">{{ t('قراءة فقط', 'READ ONLY') }}</span></div>
                <div class="chat-log" aria-live="polite">
                  @if (!chatMessages.length) { <p class="empty">{{ t('ابدأ بسؤال سريع عن نشاطك أو اختَر اقتراحًا بالأسفل.', 'Start with a quick business question or choose a suggestion below.') }}</p> }
                  @for (message of chatMessages; track $index) { <article class="chat-message" [class.user-message]="message.role === 'user'"><span>{{ message.role === 'user' ? t('أنت', 'You') : t('المساعد الذكي', 'AI assistant') }}</span>@if (message.mode === 'local-fallback') { <small class="source-list">{{ t('وضع مجاني محدود · إجابة من سجلات النشاط', 'Free limited mode · grounded in business records') }}</small> }<p>{{ message.content }}</p>@if (message.sources?.length) { <small class="source-list">المصادر: @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? 'فاتورة' : (source.type === 'expense' ? 'مصروف' : source.type) }} · {{ source.invoice_number || source.category || source.id }}</span> }</small> }</article> }
                </div>
                @if (!chatMessages.length) { <div class="assistant-suggestions"><p>{{ t('جرّب تسأل', 'Try asking') }}</p><div class="suggestion-grid"><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('ما الفواتير المستحقة التي تحتاج متابعة؟', 'Which outstanding invoices need follow-up?'))"><span class="suggestion-icon">↗</span><strong>{{ t('متابعة التحصيل', 'Receivables follow-up') }}</strong><small>{{ t('اعرف الفواتير المستحقة', 'Find outstanding invoices') }}</small></button><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('لخّص أداء النشاط خلال آخر 30 يومًا.', 'Summarize business performance over the last 30 days.'))"><span class="suggestion-icon">✦</span><strong>{{ t('ملخص الأداء', 'Performance summary') }}</strong><small>{{ t('مبيعات ومصروفات', 'Sales and expenses') }}</small></button><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('ما المنتجات التي تحتاج إعادة تخزين؟', 'Which products may need restocking?'))"><span class="suggestion-icon">▦</span><strong>{{ t('المخزون', 'Inventory check') }}</strong><small>{{ t('راجع المنتجات والمخزون', 'Review products and stock') }}</small></button><button type="button" class="suggestion-card" (click)="useAssistantSuggestion(t('اعرض لي نظرة عامة على العملاء والفواتير.', 'Give me an overview of customers and invoices.'))"><span class="suggestion-icon">◎</span><strong>{{ t('نظرة عامة', 'Business overview') }}</strong><small>{{ t('عملاء وفواتير', 'Customers and invoices') }}</small></button></div></div> }
                @if (chatError) { <div class="error-banner" role="alert"><span>{{ chatError }}</span>@if (!chatConfigurationMissing) { <button class="secondary" type="button" (click)="sendChat()" [disabled]="chatSending || !chatDraft.trim()">{{ t('إعادة المحاولة', 'Retry') }}</button> }</div> }
                @if (chatSending) { <p class="muted" role="status" aria-live="polite">{{ t('المساعد الذكي يجهّز الإجابة…', 'The AI assistant is preparing an answer…') }}</p> }
                <form class="chat-form" (ngSubmit)="sendChat()"><textarea name="chatMessage" rows="2" maxlength="2000" placeholder="اكتب سؤالك عن نشاطك…" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea><button class="primary" type="submit" [disabled]="chatSending || !chatDraft.trim()">{{ chatSending ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال', 'Send') }}</button></form>
                <p class="footnote">{{ t('المساعد للقراءة فقط. عند عدم إعداد مفتاح مزوّد الذكاء الاصطناعي يعمل بوضع مجاني محدود للإجابات المبنية على أحدث السجلات، ولا يُعدّ بديلًا للمساعد التوليدي الكامل.', 'Read-only assistant. Without an AI provider key, a free limited fallback answers from recent records; it is not a full generative AI replacement.') }}</p>
              </section>
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
    .csv-import-panel{display:grid;gap:10px;margin:18px 0;padding:14px;border:1px solid #d1d5db;border-radius:12px;background:#f8fafc}.csv-import-panel h3,.csv-import-panel p{margin:0}.csv-import-panel h3{font-size:15px}.csv-import-panel p,.csv-import-panel small{font-size:12px;line-height:1.5;color:#4b5563}.csv-import-actions{display:flex;flex-wrap:wrap;gap:8px}.csv-import-errors{margin:0;padding-inline-start:22px;font-size:12px;color:#991b1b;display:grid;gap:5px;overflow-wrap:anywhere}.invoice-lines{display:grid;gap:10px;flex-basis:100%;width:100%}.invoice-lines-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}.invoice-line-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(90px,1fr) auto;gap:10px;align-items:end;padding:12px;border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc}.invoice-line-row label{display:grid;gap:5px;min-width:0}.invoice-line-row select,.invoice-line-row input{width:100%;min-width:0}@media(max-width:600px){.invoice-line-row{grid-template-columns:minmax(0,1fr) minmax(88px,.65fr)}.invoice-line-row button{grid-column:1/-1;justify-self:start}}.topbar-heading{display:grid;gap:5px;min-width:0}.workspace-build-card{justify-self:start;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 10px;border:1px solid #dbe4ea;border-radius:12px;background:#fff;box-shadow:0 2px 8px #0f172a08}.workspace-build-card .version-pill{font-size:11px;white-space:nowrap}.workspace-build-card small{font-size:11px;color:#64748b;overflow-wrap:anywhere}.invoice-create-disclosure{margin:14px 0 18px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;overflow:hidden}.invoice-create-disclosure>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px;background:#fff;font-weight:800;color:#0f172a}.invoice-create-disclosure>summary::-webkit-details-marker{display:none}.invoice-create-disclosure>summary:after{content:'＋';display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border-radius:9px;background:#ccfbf1;color:#115e59;font-size:19px}.invoice-create-disclosure[open]>summary:after{content:'−'}.invoice-create-disclosure>summary small{font-weight:500;color:#64748b;font-size:11px}.invoice-create-disclosure>.invoice-form{padding:14px;border-top:1px solid #e2e8f0}.customer-invoice-filter{padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}.customer-invoice-filter label{width:100%;min-width:0}.customer-invoice-filter select{width:100%;min-width:0}.list-row{min-width:0;flex-wrap:wrap;gap:12px}.list-row .grow{min-width:120px;overflow-wrap:anywhere}.list-row>strong{overflow-wrap:anywhere;max-width:100%}.table-wrap{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:12px}.table-wrap table{width:100%;min-width:680px;border-collapse:separate;border-spacing:0}.table-wrap th,.table-wrap td{padding:11px 12px;text-align:start;vertical-align:top;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere}.table-wrap th{position:sticky;top:0;background:#f1f5f9;color:#334155;font-size:12px;white-space:nowrap}.table-wrap tbody tr:nth-child(even){background:#f8fafc}.table-wrap tbody tr:last-child td{border-bottom:0}@media(max-width:600px){.topbar-heading{width:100%}.workspace-build-card{width:100%;justify-content:flex-start}.workspace-build-card small{flex-basis:100%}.invoice-create-disclosure>summary{align-items:flex-start;flex-wrap:wrap}.invoice-create-disclosure>summary small{flex:1 1 100%;order:2}.invoice-create-disclosure>.invoice-form{display:grid;grid-template-columns:minmax(0,1fr)}.list-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start}.list-row .grow{min-width:0}.list-row>button,.list-row>strong{grid-column:2;justify-self:start}.table-wrap table{min-width:760px}}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #0f766e;outline-offset:3px}
    .aging-buckets{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;margin-top:12px}.aging-buckets>div{display:flex;flex-direction:column;gap:4px;padding:10px;border:1px solid #e5e7eb;border-radius:9px;background:#f8fafc}.warning-notice{border-color:#f59e0b;background:#fffbeb}.divider{height:1px;background:#e5e7eb;margin:22px 0}
    .shell{min-height:100vh}.install-button{display:none}.install-floating{display:none}.install-help-floating{display:none}.mobile-more,.mobile-more-menu{display:none}.language-row{display:flex;justify-content:flex-end;margin-bottom:8px}.language-toggle{min-height:38px}.shell.english .sidebar{inset:0 0 0 auto}.shell.english .main{margin-left:0;margin-right:245px}.shell.english .nav-item{text-align:left}.shell.english .hero-mark{margin-left:4%;margin-right:0}.shell.english .chat-message.user-message{margin-right:auto;margin-left:0}.sidebar{position:fixed;inset:0 auto 0 0;width:245px;background:#111827;color:#e5e7eb;padding:26px 17px;display:flex;flex-direction:column;z-index:2}
    .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:0 7px 38px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#a7f3d0;color:#064e3b;font-size:21px;font-weight:900;margin-bottom:20px}.brand-mark.small{width:34px;height:34px;border-radius:11px;margin:0;font-size:16px}.light{font-weight:400;color:#9ca3af;margin-left:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:#6b7280;margin:0 0 8px}.nav-label{font-size:10px;color:#9ca3af;letter-spacing:1.5px;padding:0 10px}.workspace-release-meta{display:grid;gap:5px;padding:0 10px;margin:-4px 0 10px;min-width:0}.workspace-release-meta .version-pill{align-self:start;max-width:100%;font-size:10px;white-space:normal;line-height:1.4}.workspace-release-meta small{font-size:10px;color:#9ca3af;line-height:1.5;overflow-wrap:anywhere}.nav-item{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:#cbd5e1;text-align:left;padding:12px;border-radius:10px;margin:3px 0;font-size:14px;transition:background .18s ease,color .18s ease}.nav-item:hover{background:#1e293b;color:#fff}.nav-item.active{background:linear-gradient(100deg,#164e63,#1d4ed8);color:#fff;box-shadow:inset 3px 0 #5eead4}.nav-icon{display:inline-grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;font-size:17px;font-weight:800;background:#1e293b}.overview-icon{color:#67e8f9;background:#164e63}.invoices-icon{color:#fcd34d;background:#713f12}.products-icon{color:#86efac;background:#14532d}.customers-icon{color:#c4b5fd;background:#4c1d95}.assistant-icon{color:#f9a8d4;background:#831843}.payments-icon{color:#67e8f9;background:#164e63}.nav-item.active .nav-icon{background:#ffffff24;color:#fff}.sidebar-bottom{margin-top:auto;border-top:1px solid #293548;padding:18px 8px 0;font-size:11px}.sidebar-bottom small{display:block;color:#9ca3af;margin:8px 0 0 15px;line-height:1.5}.status-dot{display:inline-block;width:7px;height:7px;background:#34d399;border-radius:50%;margin-right:8px}
    .main{margin-left:245px;padding:30px clamp(18px,4vw,54px) 20px;max-width:1550px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:0}.user-area{display:flex;align-items:center;gap:12px;font-size:12px;color:#4b5563}.secondary,.primary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:#fff;color:#374151}.primary{background:#0f766e;border-color:#0f766e;color:#fff}.primary:hover{background:#115e59}.workspace-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 17px;background:#fff;border:1px solid #e5e7eb;border-radius:13px;margin-bottom:18px}.workspace-bar strong{display:block;font-size:14px}.workspace-bar select{max-width:260px}.hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:30px 34px;border-radius:19px;background:linear-gradient(115deg,#14243a,#1e3a5f 60%,#155e75);color:#fff}.hero .eyebrow{color:#a7f3d0}.hero h2{font-size:clamp(25px,3vw,36px);line-height:1.12;letter-spacing:-1px;margin:10px 0}.hero p:last-child{max-width:460px;font-size:12px;line-height:1.6;color:#cbd5e1}.hero-mark{width:84px;height:84px;display:grid;place-items:center;border-radius:26px;background:linear-gradient(135deg,#a7f3d0,#60a5fa);color:#0f2942;font-weight:900;font-size:24px;margin-right:4%;box-shadow:0 15px 45px #02061755}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.metric,.panel,.quick-card{background:#fff;border:1px solid #e5eaf1;border-radius:14px}.metric{padding:17px;min-height:125px}.metric>span{display:block;color:#6b7280;font-size:11px;margin-bottom:13px}.metric strong{display:block;font-size:19px;letter-spacing:-.5px;overflow-wrap:anywhere}.metric small{display:block;font-size:10px;color:#9ca3af;margin-top:6px}.notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}.notice strong{white-space:nowrap}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:15px}.quick-card{text-align:left;padding:18px}.quick-card strong,.quick-card span{display:block}.quick-card strong{font-size:13px;margin-bottom:8px}.quick-card span{font-size:11px;color:#6b7280}
    .panel{padding:22px;margin-top:4px}.panel.narrow{max-width:650px;margin:50px auto}.panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:#6b7280;line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:#6b7280;margin:0}.count{font-size:10px;font-weight:700;color:#0f766e;background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:#f8fafc;border:1px solid #edf0f5;border-radius:11px}.invoice-form{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 100px auto auto}.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.payment-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#cffafe;color:#0e7490;font-size:17px;font-weight:800}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:#6b7280;font-size:10px;margin-top:5px;overflow-wrap:anywhere}.empty{padding:20px;text-align:center;color:#9ca3af;font-size:12px}.footnote{font-size:10px;line-height:1.6;color:#9ca3af;margin:15px 0 0} .assistant-suggestions{margin:14px 0}.assistant-suggestions>p{font-size:11px;font-weight:800;color:#64748b;margin:0 0 9px}.suggestion-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.suggestion-card{display:grid;grid-template-columns:32px minmax(0,1fr);align-items:center;column-gap:10px;row-gap:3px;text-align:start;padding:12px;border:1px solid #dbeafe;border-radius:13px;background:linear-gradient(135deg,#fff 0%,#f0f9ff 100%);color:#1e293b;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.suggestion-card:hover{transform:translateY(-2px);border-color:#7dd3fc;box-shadow:0 8px 20px #0f172a0c}.suggestion-icon{grid-row:span 2;display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-size:17px}.suggestion-card strong{font-size:11px}.suggestion-card small{font-size:10px;color:#64748b;line-height:1.4}@media(max-width:480px){.suggestion-grid{grid-template-columns:1fr}.suggestion-card{padding:10px}}.chat-log{min-height:180px;max-height:440px;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-left:auto;background:#e0f2fe}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:800}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:#0f766e;font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-right:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical}.error,.error-banner{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:12px;line-height:1.6}.error-banner{margin-bottom:14px}.install-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 14px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;color:#065f46;font-size:12px;line-height:1.6}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:#6b7280;line-height:1.7}.setup-steps{background:#f8fafc;border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:#0f766e;font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10px}footer span{color:#9ca3af}
    .mobile-version-strip{display:none}
    @media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form .primary{grid-column:1/-1}}@media(max-width:760px){
      .mobile-version-row{display:flex;justify-content:flex-end;min-width:0;margin:0 0 8px}
      .mobile-version-row .version-pill{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:10px;padding:5px 8px}

      .install-button{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border-color:#99f6e4;color:#065f46;background:#ecfdf5;font-weight:800}.install-floating{display:block;position:fixed;top:12px;right:12px;z-index:50;box-shadow:0 6px 20px #0f172a22}.install-help-floating{display:flex;position:fixed;top:62px;right:12px;z-index:50;width:min(360px,calc(100vw - 24px));box-shadow:0 8px 28px #0f172a22}.main,.shell.english .main{padding-top:76px}.shell.install-help-open .main{padding-top:164px}.mobile-more{display:flex}.mobile-more-menu{display:grid;position:fixed;z-index:30;right:10px;bottom:calc(82px + env(safe-area-inset-bottom));width:min(250px,calc(100vw - 20px));padding:8px;background:#0f172a;border:1px solid #334155;border-radius:16px;box-shadow:0 18px 50px #02061755;gap:4px}.mobile-more-menu .nav-item{flex-direction:row;justify-content:flex-start;min-height:48px;padding:9px 12px;font-size:13px}.mobile-more-menu .nav-item>span:not(.nav-icon){max-width:none}.mobile-more-menu .nav-item.active{box-shadow:inset 3px 0 #5eead4}.mobile-more-menu .mobile-menu-action{border-top:1px solid #334155;border-radius:8px;margin-top:2px}
      .global-loading{position:fixed;inset:0 0 auto;z-index:1000;height:3px;background:#ccfbf1;overflow:hidden}.global-loading>span:first-child{position:absolute;inset:0 auto 0 0;width:35%;background:#0f766e;animation:loading-sweep 1.15s ease-in-out infinite}.loading-label{position:absolute;top:10px;right:12px;background:#0f766e;color:#fff;padding:7px 12px;border-radius:999px;font-size:12px;box-shadow:0 4px 14px #0f172a22}@keyframes loading-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.global-loading>span:first-child{animation:none;width:100%}}
    .sidebar{position:fixed;inset:auto 0 0;width:100%;min-height:0;height:auto;padding:8px 6px calc(8px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch;gap:2px;overflow-x:auto;overflow-y:hidden;background:rgba(15,23,42,.97);border-top:1px solid #334155;box-shadow:0 -8px 28px #0f172a20;backdrop-filter:blur(16px);z-index:20}
      .brand,.brand>span:last-child,.nav-label,.workspace-release-meta,.sidebar-bottom,.sidebar>.mobile-extra{display:none}
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
      .section-head{align-items:flex-start;gap:10px}.list-row{flex-wrap:wrap}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .metric{padding:13px;min-height:110px}.metric strong{font-size:clamp(15px,4vw,18px);overflow-wrap:anywhere}
      .inline-form,.invoice-form{grid-template-columns:1fr}.inline-form .primary{grid-column:auto}
      .panel{padding:15px;border-radius:13px}.notice{flex-direction:column}.notice strong{white-space:normal}
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
        min-height:61px;
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
        right:12px;
        bottom:calc(88px + env(safe-area-inset-bottom));
        width:min(280px,calc(100vw - 24px));
        max-height:min(62vh,520px);
        overflow-y:auto;
        overscroll-behavior:contain;
        -webkit-overflow-scrolling:touch;
        scrollbar-width:thin;
        padding:9px;
        border-radius:18px;
        background:#111827;
        box-shadow:0 20px 55px #02061766;
      }
      .shell[dir="rtl"] .mobile-more-menu{right:12px;left:auto}
      .shell[dir="ltr"] .mobile-more-menu{left:12px;right:auto}
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
  `]
})
export class AppComponent implements OnInit {
  readonly appVersion = APP_BUILD_INFO.version;
  readonly uiCommitLabel = APP_BUILD_INFO.commit;
  readonly buildTimeLabel = APP_BUILD_INFO.builtAt ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(APP_BUILD_INFO.builtAt)) : 'وقت البناء غير متاح';
  apiVersionLabel = 'غير متاح';
  apiCommitLabel = 'unknown';
  language: 'ar' | 'en' = 'ar';
  initialized = false;
  setupNeeded = false;
  signedIn = false;
  platformAdminAvailable = false;
  signingUp = false;
  loading = false;
  error = '';
  email = '';
  password = '';
  userEmail = '';
  tab: Tab = 'overview';
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
  profitLoss: ProfitLossReport | null = null;
  profitLossPeriod: '30d' | 'month' | 'all' | 'custom' = '30d';
  profitLossStart = '';
  profitLossEnd = '';
  reportLoading = false;
  reportError = '';
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
  private statementRequestVersion = 0;
  products: Product[] = [];
  invoices: Invoice[] = [];
  payments: Payment[] = [];
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
  paymentInvoiceId = '';
  paymentMethod = 'cash';
  paymentReference = '';
  paymentIdempotencyKey = '';
  chatDraft = '';
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources']; mode?: string }> = [];
  chatSending = false;
  chatError = '';
  chatConfigurationMissing = false;
  mobileMoreOpen = false;
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

  get filteredInvoices(): Invoice[] {
    return this.invoiceFilterCustomerId
      ? this.invoices.filter(invoice => invoice.customer_id === this.invoiceFilterCustomerId)
      : this.invoices;
  }

  syncPaymentCustomer(): void {
    if (!this.paymentInvoiceId) return;
    const invoice = this.invoices.find(item => item.id === this.paymentInvoiceId);
    if (invoice?.customer_id) this.paymentCustomerId = invoice.customer_id;
  }

  ngOnInit(): void {
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
    if (this.mobileMoreOpen) this.mobileMoreOpen = false;
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

  private async initializeApp(): Promise<void> {
    this.initialized = false;
    this.loading = true;
    this.error = '';
    document.documentElement.lang = this.language;
    document.documentElement.dir = this.language === 'ar' ? 'rtl' : 'ltr';
    try {
      const config = await this.auth.getRuntimeConfig();
      this.setupNeeded = !config.apiBaseUrl?.trim() ||
        !config.firebase?.apiKey || !config.firebase?.authDomain ||
        !config.firebase?.projectId || !config.firebase?.appId;
      if (this.setupNeeded) return;
      const user = await this.auth.currentUser();
      if (user) {
        this.signedIn = true;
        this.userEmail = user.email || 'مستخدم مسجّل الدخول';
        await this.checkPlatformAdminAccess();
        await this.loadBusinesses();
      }
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
      this.initialized = true;
    }
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
      payments: 'المدفوعات', assistant: 'مساعد الأعمال الذكي', reports: 'الأرباح والخسائر', audit: 'سجل العمليات', 'platform-admin': 'إدارة المنصة'
    };
    return this.language === 'ar' ? titles[this.tab] : ({ overview: 'Business overview', customers: 'Customers', products: 'Products & inventory', invoices: 'Sales & invoices', payments: 'Payments', assistant: 'AI business assistant', reports: 'Profit & loss', audit: 'Activity log', 'platform-admin': 'Platform admin' } as Record<Tab, string>)[this.tab];
  }

  private async checkPlatformAdminAccess(): Promise<void> {
    this.platformAdminAvailable = false;
    try {
      const access = await this.api.platformAdminAccess();
      this.platformAdminAvailable = access.is_platform_admin === true;
    } catch {
      // A missing backend endpoint, unconfigured allowlist, or a 403 keeps admin navigation hidden.
      this.platformAdminAvailable = false;
      if (this.tab === 'platform-admin') this.tab = 'overview';
    }
  }

  async submitAuth(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const user = this.signingUp
        ? await this.auth.signUp(this.email, this.password)
        : await this.auth.signIn(this.email, this.password);
      this.signedIn = true;
      this.userEmail = user.email || 'مستخدم مسجّل الدخول';
      await this.checkPlatformAdminAccess();
      await this.loadBusinesses();
    } catch (error) {
      this.error = this.message(error, 'auth');
    } finally {
      this.loading = false;
    }
  }

  async logout(): Promise<void> {
    this.loading = true;
    try {
      await this.auth.signOut();
      this.signedIn = false;
      this.platformAdminAvailable = false;
      this.tab = 'overview';
      this.businesses = [];
      this.business = null;
      this.dashboard = null;
      this.customers = [];
      this.products = [];
      this.invoices = [];
      this.payments = [];
      this.chatMessages = [];
      this.error = '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
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
    this.loading = true;
    this.error = '';
    try {
      this.businesses = await this.api.listBusinesses();
      if (!this.businesses.length) {
        this.business = null;
        this.selectedBusinessId = '';
        if (this.platformAdminAvailable) this.tab = 'platform-admin';
        this.clearWorkspaceData();
        return;
      }
      const chosen = this.businesses.find(item => item.id === this.selectedBusinessId) || this.businesses[0];
      const workspaceChanged = this.business?.id !== chosen.id;
      this.selectedBusinessId = chosen.id;
      this.business = chosen;
      if (workspaceChanged) this.clearWorkspaceData();
      await this.loadWorkspaceData();
    } catch (error) {
      this.business = null;
      this.selectedBusinessId = '';
      this.clearWorkspaceData();
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  private clearWorkspaceData(): void {
    this.profitLossLoadGuard.invalidate();
    this.receivablesAgingLoadGuard.invalidate();
    this.dashboard = null;
    this.profitLoss = null;
    this.agingReport = null;
    this.customers = [];
    this.products = [];
    this.invoices = [];
    this.payments = [];
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
    this.statementRequestVersion++;
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
      const [dashboard, عميل, منتج, فاتورة, دفعة] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), this.api.payments(id)
      ]);
      if (!this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) return;
      this.dashboard = dashboard;
      this.profitLoss = null;
      this.customers = عميل;
      if (!this.invoiceCustomerId && this.customers.length) this.invoiceCustomerId = this.customers[0].id;
      this.products = منتج;
      this.invoices = فاتورة;
      this.payments = دفعة;
      if (!this.invoiceProductId && this.products.length) this.invoiceProductId = this.products[0].id;
      if (!this.paymentInvoiceId) this.paymentInvoiceId = this.invoices.find(item => item.status === 'issued')?.id || '';
    } catch (error) {
      if (this.workspaceLoadGuard.isCurrent(loadVersion, this.business?.id, id)) {
        this.clearWorkspaceData();
        this.error = this.message(error);
      }
    } finally {
      if (this.workspaceLoadGuard.isLatest(loadVersion)) this.loading = false;
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

  async loadAuditEvents(offset = 0): Promise<void> {
    if (!this.business || this.business.role !== 'owner') return;
    this.auditLoading = true;
    this.auditError = '';
    try {
      const result = await this.api.auditEvents(this.business.id, {
        limit: 50, offset,
        action: this.auditAction.trim() || undefined,
        target_type: this.auditTargetType.trim() || undefined
      });
      this.auditEvents = result.items;
      this.auditTotal = result.total;
      this.auditOffset = result.offset;
    } catch (error) {
      this.auditEvents = [];
      this.auditTotal = 0;
      this.auditError = this.message(error);
    } finally {
      this.auditLoading = false;
    }
  }

  setTab(tab: Tab): void {
    if (tab === 'platform-admin' && !this.platformAdminAvailable) {
      this.tab = 'overview';
      return;
    }
    this.tab = tab;
    this.error = '';
    this.mobileMoreOpen = false;
    if (tab === 'reports') void this.loadProfitLoss();
    if (tab === 'audit') void this.loadAuditEvents(0);
  }

  get statementBalanceEntries(): Array<{ currency: string; balance: string }> {
    return Object.entries(this.customerStatement?.balances_by_currency || {}).map(([currency, balance]) => ({ currency, balance }));
  }

  async loadCustomerStatement(customer: Customer): Promise<void> {
    this.statementCustomerId = customer.id;
    this.statementCustomerName = customer.name;
    this.statementVisible = true;
    await this.loadCustomerStatementPage(0);
  }

  async loadCustomerStatementPage(offset: number): Promise<void> {
    if (!this.business || !this.statementCustomerId) return;
    const requestVersion = ++this.statementRequestVersion;
    const requestedCustomerId = this.statementCustomerId;
    const businessId = this.business.id;
    this.customerStatement = null;
    this.statementOffset = offset;
    this.statementLoading = true;
    this.statementError = '';
    try {
      const result = await this.api.customerStatement(businessId, requestedCustomerId, offset);
      if (requestVersion !== this.statementRequestVersion || requestedCustomerId !== this.statementCustomerId || businessId !== this.business?.id) return;
      this.customerStatement = result;
    } catch (error) {
      if (requestVersion !== this.statementRequestVersion || requestedCustomerId !== this.statementCustomerId || businessId !== this.business?.id) return;
      this.statementError = this.message(error);
    } finally {
      if (requestVersion === this.statementRequestVersion) this.statementLoading = false;
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

  importErrorLabel(code: string): string {
    const ar: Record<string, string> = {
      required: 'حقل مطلوب', too_long: 'النص أطول من المسموح',
      invalid_decimal: 'سعر غير صالح (حتى منزلتين عشريتين)',
      invalid_boolean: 'قيمة متابعة المخزون غير صحيحة',
      duplicate_in_file: 'كود منتج مكرر داخل الملف',
      already_exists: 'كود المنتج موجود بالفعل'
    };
    const en: Record<string, string> = {
      required: 'Required field', too_long: 'Text exceeds the allowed length',
      invalid_decimal: 'Invalid price (up to 2 decimal places)',
      invalid_boolean: 'Invalid stock tracking value',
      duplicate_in_file: 'Duplicate SKU in this file',
      already_exists: 'SKU already exists'
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
        }
      }
    } catch (error) {
      // Preserve entered values and the idempotency key if the save failed or its outcome is uncertain.
      if (this.business?.id === businessId) this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  useAssistantSuggestion(question: string): void {
    if (this.chatSending || !question.trim()) return;
    this.chatDraft = question;
    void this.sendChat();
  }

  async sendChat(): Promise<void> {
    if (!this.business || !this.chatDraft.trim() || this.chatSending) return;
    const question = this.chatDraft.trim();
    const history = this.chatMessages.slice(-8);
    this.chatMessages = [...this.chatMessages, { role: 'user', content: question }];
    this.chatDraft = '';
    this.chatSending = true;
    this.chatError = '';
    this.error = '';
    try {
      const reply: ChatReply = await this.api.chat(this.business.id, question, history);
      this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources, mode: reply.mode }];
    } catch (error) {
      this.chatMessages = this.chatMessages.slice(0, -1);
      this.chatDraft = question;
      const rawMessage = error instanceof Error ? error.message : '';
      this.chatConfigurationMissing = /AI chat is not configured/i.test(rawMessage);
      this.chatError = this.message(error);
    } finally {
      this.chatSending = false;
    }
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
    if (message.startsWith('API_CONNECTION_FAILED:')) return this.t('تعذر الاتصال بخادم البيانات. تحقق من الإنترنت وإعداد CORS_ALLOWED_ORIGINS في الخادم ثم أعد المحاولة.', 'Could not reach the business API. Check your internet connection and the server CORS_ALLOWED_ORIGINS setting, then retry.');
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      if (context === 'auth') return this.t('تعذر الاتصال بخدمة Firebase Authentication. تحقق من الإنترنت وتفعيل تسجيل الدخول بالبريد وكلمة المرور وإضافة نطاق الموقع إلى النطاقات المصرح بها في Firebase.', 'Could not reach Firebase Authentication. Check your internet, enable Email/Password sign-in, and authorize this site domain in Firebase.');
      return this.t('تعذر الوصول إلى الخدمة. تحقق من اتصال الإنترنت وإعدادات API وCORS ثم حاول مجددًا.', 'The service could not be reached. Check your internet connection, API availability, and CORS settings, then retry.');
    }
    if (message) return message;
    return this.t('حدث خطأ غير متوقع. حاول مجددًا.', 'An unexpected error occurred. Please try again.');
  }
}
