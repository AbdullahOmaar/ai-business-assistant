import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Business, ChatReply, Customer, Dashboard, Invoice, Payment, Product } from './api.service';
import { AuthService } from './auth.service';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'assistant';

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="shell" [class.english]="language === 'en'" [class.install-help-open]="installHelp && !isInstalled" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'" (keydown.escape)="mobileMoreOpen = false">
      @if (!isInstalled) { <button class="secondary install-button install-floating" type="button" (click)="installApp()">{{ t('تثبيت التطبيق', 'Install app') }}</button> }
      @if (installHelp && !isInstalled) { <div class="install-help install-help-floating" role="status">{{ t('لو لم تظهر نافذة التثبيت: افتح قائمة المتصفح ⋮ ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'If no install prompt appears, open the browser menu and choose “Install app” or “Add to Home screen”.') }}<button type="button" class="secondary" (click)="installHelp = false">{{ t('حسنًا', 'Got it') }}</button></div> }
      @if (loading) { <div class="global-loading" role="status" aria-live="polite"><span></span><span class="loading-label">{{ t('جارٍ التحميل…', 'Loading…') }}</span></div> }
      @if (!initialized) {
        <main class="auth-card" role="status" aria-live="polite">
          <div class="brand-mark">A</div>
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
          <button class="nav-item" [attr.aria-label]="t('الرئيسية', 'Home')" [attr.title]="t('الرئيسية', 'Home')" [class.active]="tab === 'overview'" [attr.aria-current]="tab === 'overview' ? 'page' : null" (click)="setTab('overview')"><span class="nav-icon overview-icon" aria-hidden="true">⌂</span><span>{{ t('الرئيسية', 'Home') }}</span></button>
          <button class="nav-item" [attr.aria-label]="t('الفواتير', 'Invoices')" [attr.title]="t('الفواتير', 'Invoices')" [class.active]="tab === 'invoices'" [attr.aria-current]="tab === 'invoices' ? 'page' : null" (click)="setTab('invoices')"><span class="nav-icon invoices-icon" aria-hidden="true">▤</span><span>{{ t('الفواتير', 'Invoices') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المنتجات والمخزون', 'Products & inventory')" [attr.title]="t('المنتجات والمخزون', 'Products & inventory')" [class.active]="tab === 'products'" [attr.aria-current]="tab === 'products' ? 'page' : null" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>{{ t('المنتجات والمخزون', 'Products & inventory') }}</span></button>
          <button class="nav-item" [attr.aria-label]="t('العملاء', 'Customers')" [attr.title]="t('العملاء', 'Customers')" [class.active]="tab === 'customers'" [attr.aria-current]="tab === 'customers' ? 'page' : null" (click)="setTab('customers')"><span class="nav-icon customers-icon" aria-hidden="true">♧</span><span>{{ t('العملاء', 'Customers') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المدفوعات', 'Payments')" [attr.title]="t('المدفوعات', 'Payments')" [class.active]="tab === 'payments'" [attr.aria-current]="tab === 'payments' ? 'page' : null" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>{{ t('المدفوعات', 'Payments') }}</span></button>
          <button class="nav-item mobile-extra" [attr.aria-label]="t('المساعد الذكي', 'AI assistant')" [attr.title]="t('المساعد الذكي', 'AI assistant')" [class.active]="tab === 'assistant'" [attr.aria-current]="tab === 'assistant' ? 'page' : null" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>{{ t('المساعد الذكي', 'AI assistant') }}</span></button>
          <button class="nav-item mobile-more" type="button" [class.active]="mobileMoreOpen || ['products','payments','assistant'].includes(tab)" [attr.aria-label]="t('المزيد من الأقسام', 'More sections')" [attr.aria-expanded]="mobileMoreOpen" aria-controls="mobile-more-menu" aria-haspopup="menu" (click)="toggleMobileMore()"><span class="nav-icon" aria-hidden="true">•••</span><span>{{ t('المزيد', 'More') }}</span></button>
          @if (mobileMoreOpen) {
            <div id="mobile-more-menu" class="mobile-more-menu" role="menu" [attr.aria-label]="t('أقسام إضافية', 'Additional sections')">
              <button class="nav-item" role="menuitem" [class.active]="tab === 'products'" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>{{ t('المنتجات والمخزون', 'Products & inventory') }}</span></button>
              <button class="nav-item" role="menuitem" [class.active]="tab === 'payments'" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>{{ t('المدفوعات', 'Payments') }}</span></button>
              <button class="nav-item" role="menuitem" [class.active]="tab === 'assistant'" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>{{ t('المساعد الذكي', 'AI assistant') }}</span></button>
              <button class="nav-item mobile-menu-action" role="menuitem" type="button" (click)="toggleLanguage()"><span class="nav-icon" aria-hidden="true">文</span><span>{{ language === 'ar' ? 'English' : 'العربية' }}</span></button>
              <button class="nav-item mobile-menu-action" role="menuitem" type="button" (click)="logout()"><span class="nav-icon" aria-hidden="true">↪</span><span>{{ t('تسجيل الخروج', 'Sign out') }}</span></button>
            </div>
          }
          <div class="sidebar-bottom"><span class="status-dot"></span> {{ t('جلسة موثّقة', 'Verified session') }}<small>{{ t('يتحقق الخادم من صلاحيات مساحة العمل', 'The server verifies workspace permissions') }}</small></div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div><p class="eyebrow">{{ t('مساحة العمل', 'Workspace') }}</p><h1>{{ pageTitle }}</h1></div>
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

            @if (tab === 'customers') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('قائمة العملاء', 'Customer list') }}</h2><p>{{ t('تقتصر السجلات على مساحة العمل المحددة.', 'Records are limited to the selected workspace.') }}</p></div><span class="count">{{ customers.length }} {{ t('عميل', 'customers') }}</span></div>
                <form class="inline-form" (ngSubmit)="createCustomer()">
                  <input [attr.aria-label]="t('اسم العميل', 'Customer name')" name="customerName" [placeholder]="t('اسم العميل', 'Customer name')" required [(ngModel)]="customerName">
                  <input [attr.aria-label]="t('بريد العميل الإلكتروني', 'Customer email')" name="customerEmail" type="email" [placeholder]="t('البريد الإلكتروني (اختياري)', 'Email (optional)')" [(ngModel)]="customerEmail">
                  <input [attr.aria-label]="t('هاتف العميل', 'Customer phone')" name="customerPhone" [placeholder]="t('الهاتف (اختياري)', 'Phone (optional)')" [(ngModel)]="customerPhone">
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة عميل', 'Add customer') }}</button>
                </form>
                <div class="list-tools"><input name="customerSearch" type="search" [attr.aria-label]="t('البحث عن عميل', 'Search customers')" [placeholder]="t('ابحث بالاسم أو البريد أو الهاتف…', 'Search by name, email, or phone…')" [(ngModel)]="customerSearch"><button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                <div class="list">
                  @for (customer of filteredCustomers; track customer.id) { <article class="list-row"><div class="avatar">{{ customer.name.slice(0,1).toUpperCase() }}</div><div class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.email || t('لا يوجد بريد إلكتروني', 'No email') }} · {{ customer.phone || t('لا يوجد هاتف', 'No phone') }}</small></div></article> }
                  @if (!filteredCustomers.length) { <p class="empty">{{ customerSearch ? t('لا توجد نتائج مطابقة للبحث.', 'No matching results.') : t('لا يوجد عملاء بعد. أضف أول عميل من النموذج أعلاه.', 'No customers yet. Add your first customer using the form above.') }}</p> }
                </div>
              </section>
            }

            @if (tab === 'products') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('المنتجات والخدمات', 'Products & services') }}</h2><p>{{ t('يتم حفظ الأسعار بدقة عشرية.', 'Prices are stored using decimal precision.') }}</p></div><span class="count">{{ products.length }} {{ t('منتج', 'products') }}</span></div>
                <form class="inline-form" (ngSubmit)="createProduct()">
                  <input [attr.aria-label]="t('اسم المنتج', 'Product name')" name="productName" [placeholder]="t('اسم المنتج', 'Product name')" required [(ngModel)]="productName">
                  <input [attr.aria-label]="t('سعر الوحدة', 'Unit price')" name="productPrice" type="number" min="0" step="0.01" [placeholder]="t('سعر الوحدة', 'Unit price')" required [(ngModel)]="productPrice">
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> {{ t('متابعة المخزون', 'Track stock') }}</label>
                  <button class="primary" type="submit" [disabled]="loading">{{ t('إضافة منتج', 'Add product') }}</button>
                </form>
                <div class="list-tools"><input name="productSearch" type="search" [attr.aria-label]="t('البحث عن منتج', 'Search products')" [placeholder]="t('ابحث عن منتج أو رمز SKU…', 'Search products or SKU…')" [(ngModel)]="productSearch"><button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                <div class="list">
                  @for (product of filteredProducts; track product.id) { <article class="list-row"><div class="product-mark">◇</div><div class="grow"><strong>{{ product.name }}</strong><small>{{ product.is_stock_tracked ? t('تتم متابعة المخزون', 'Stock tracked') : t('خدمة / لا تتم متابعة المخزون', 'Service / no stock tracking') }}{{ product.sku ? ' · SKU ' + product.sku : '' }}</small></div><strong>{{ product.unit_price }} {{ business.currency_code }}</strong></article> }
                  @if (!filteredProducts.length) { <p class="empty">{{ productSearch ? t('لا توجد نتائج مطابقة للبحث.', 'No matching results.') : t('لا توجد منتجات بعد. أضف منتجًا أو خدمة من النموذج أعلاه.', 'No products yet. Add a product or service using the form above.') }}</p> }
                </div>
              </section>
            }

            @if (tab === 'invoices') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('المبيعات والفواتير', 'Sales & invoices') }}</h2><p>{{ t('أنشئ فاتورة مسودة ثم أصدرها بعد التأكد من صحة التفاصيل.', 'Create an invoice draft and issue it after checking the details.') }}</p></div><span class="count">{{ invoices.length }} فاتورة</span></div>
                <form class="inline-form invoice-form" (ngSubmit)="createInvoice()">
                  <input name="invoiceNumber" [attr.aria-label]="t('رقم الفاتورة', 'Invoice number')" [placeholder]="t('رقم الفاتورة (تلقائي إذا تُرك فارغًا)', 'Invoice number (auto if blank)')" maxlength="80" [(ngModel)]="invoiceNumber">
                  <select name="invoiceProduct" [attr.aria-label]="t('المنتج', 'Product')" required [(ngModel)]="invoiceProductId"><option value="" disabled>{{ t('اختر منتجًا', 'Choose a product') }}</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.unit_price }} {{ business.currency_code }}</option> }</select>
                  <input name="invoiceQuantity" [attr.aria-label]="t('الكمية', 'Quantity')" type="number" min="0.001" step="0.001" required [(ngModel)]="invoiceQuantity">
                  <button class="primary" type="submit" [disabled]="loading || !products.length">{{ editingInvoiceId ? t('حفظ كمسودة', 'Save draft') : t('إنشاء مسودة', 'Create draft') }}</button>
                  @if (editingInvoiceId) { <button class="secondary" type="button" (click)="cancelInvoiceEdit()">{{ t('إلغاء', 'Cancel') }}</button> }
                </form>
                <div class="list-tools"><input name="invoiceSearch" type="search" [attr.aria-label]="t('البحث عن فاتورة', 'Search invoices')" [placeholder]="t('ابحث برقم الفاتورة أو العملة…', 'Search by invoice number or currency…')" [(ngModel)]="invoiceSearch"><select name="invoiceStatusFilter" [attr.aria-label]="t('تصفية حسب حالة الفاتورة', 'Filter by invoice status')" [(ngModel)]="invoiceStatusFilter"><option value="all">{{ t('كل الحالات', 'All statuses') }}</option><option value="draft">{{ t('مسودة', 'Draft') }}</option><option value="issued">{{ t('صادرة', 'Issued') }}</option><option value="paid">{{ t('مدفوعة', 'Paid') }}</option><option value="overdue">{{ t('متأخرة', 'Overdue') }}</option><option value="void">{{ t('ملغاة', 'Voided') }}</option></select><button class="secondary" type="button" (click)="exportCurrentList()">{{ t('تصدير CSV', 'Export CSV') }}</button></div>
                <div class="list">
                  @for (invoice of filteredInvoices; track invoice.id) { <article class="list-row"><div class="invoice-mark">▤</div><div class="grow"><strong>{{ invoice.invoice_number }}</strong><small>{{ invoiceStatusLabel(invoice.status) }} · {{ invoice.currency_code }}</small></div><strong>{{ invoice.total }} {{ invoice.currency_code }}</strong>@if (invoice.status === 'draft') { <button class="secondary" (click)="editInvoice(invoice)" [disabled]="loading">{{ t('تعديل', 'Edit') }}</button><button class="secondary" (click)="issueInvoice(invoice)" [disabled]="loading">{{ t('إصدار', 'Issue') }}</button><button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button> } @else if (invoice.status === 'issued') { <button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">{{ t('إلغاء', 'Void') }}</button> }</article> }
                  @if (!filteredInvoices.length) { <p class="empty">{{ (invoiceSearch || invoiceStatusFilter !== 'all') ? t('لا توجد فواتير مطابقة للفلاتر.', 'No invoices match these filters.') : t('لا توجد فواتير بعد. أضف منتجًا أولًا ثم أنشئ مسودة فاتورة.', 'No invoices yet. Add a product first, then create an invoice draft.') }}</p> }
                </div>
                <p class="footnote">{{ t('إصدار الفاتورة يخصم المخزون المتابع بشكل ذري، ويرفض العملية إذا كانت الكمية غير كافية.', 'Issuing an invoice deducts tracked stock atomically and rejects the operation if stock is insufficient.') }}</p>
              </section>
            }

            @if (tab === 'payments') {
              <section class="panel">
                <div class="section-head"><div><h2>{{ t('تسجيل دفعة', 'Record payment') }}</h2><p>{{ t('سجّل المبلغ المستلم، ويمكنك تخصيصه لفاتورة صادرة.', 'Record the amount received and optionally allocate it to an issued invoice.') }}</p></div><span class="count">{{ payments.length }} دفعة</span></div>
                <form class="inline-form payment-form" (ngSubmit)="createPayment()">
                  <input [attr.aria-label]="t('مبلغ الدفعة', 'Payment amount')" name="paymentAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المستلم', 'Amount received')" required [(ngModel)]="paymentAmount">
                  <select [attr.aria-label]="t('طريقة الدفع', 'Payment method')" name="paymentMethod" [(ngModel)]="paymentMethod"><option value="cash">{{ t('نقدًا', 'Cash') }}</option><option value="bank_transfer">{{ t('تحويل بنكي', 'Bank transfer') }}</option><option value="card">{{ t('بطاقة', 'Card') }}</option><option value="wallet">{{ t('محفظة إلكترونية', 'E-wallet') }}</option><option value="other">{{ t('أخرى', 'Other') }}</option></select>
                  <select [attr.aria-label]="t('الفاتورة المراد تخصيص الدفعة لها', 'Invoice to allocate payment to')" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId"><option value="">{{ t('عدم تخصيص الدفعة الآن', 'Do not allocate yet') }}</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (paymentInvoiceId) { <input [attr.aria-label]="t('المبلغ المراد تخصيصه', 'Amount to allocate')" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" [placeholder]="t('المبلغ المخصص للفاتورة', 'Amount allocated to invoice')" [(ngModel)]="paymentAllocationAmount"> }
                  <input [attr.aria-label]="t('مرجع الدفعة', 'Payment reference')" name="paymentReference" maxlength="128" [placeholder]="t('المرجع (اختياري)', 'Reference (optional)')" [(ngModel)]="paymentReference">
                  <button class="primary" type="submit" [disabled]="loading || !paymentAmount">{{ t('تسجيل دفعة', 'Record payment') }}</button>
                </form>
                <p class="footnote">{{ t('العملة المحددة هي', 'The selected currency is') }} {{ business.currency_code }} {{ t('لمساحة العمل دي. يتحقق النظام من المبلغ المخصص مقارنة بالرصيد المستحق، وتظل المبالغ غير المخصصة مسجلة كمدفوعات مستلمة.', 'for this workspace. Allocations are checked against the outstanding balance, and unallocated amounts remain recorded as received payments.') }}</p>
                <div class="list">
                  @for (payment of payments; track payment.id) { <article class="list-row"><div class="payment-mark">↗</div><div class="grow"><strong>{{ payment.amount }} {{ payment.currency_code }}</strong><small>{{ payment.received_at | date:'medium' }} · {{ payment.method || t('طريقة الدفع غير محددة', 'Payment method not specified') }}{{ payment.reference ? ' · ' + payment.reference : '' }}</small><small>{{ payment.allocations.length ? payment.allocations.length + ' ' + t('تخصيص للفاتورة', 'invoice allocations') : t('دفعة غير مخصصة', 'Unallocated payment') }}</small></div></article> }
                  @if (!payments.length) { <p class="empty">{{ t('لا توجد دفعات مسجلة حتى الآن.', 'No payments have been recorded yet.') }}</p> }
                </div>
              </section>
            }

            @if (tab === 'assistant') {
              <section class="panel chat-panel">
                <div class="section-head"><div><h2>{{ t('مساعد الأعمال الذكي', 'AI Business Assistant') }}</h2><p>{{ t('الإجابات مبنية على السجلات الحديثة لمساحة العمل الحالية فقط.', 'Answers use recent records from the current workspace only.') }}</p></div><span class="count">{{ t('قراءة فقط', 'READ ONLY') }}</span></div>
                <div class="chat-log" aria-live="polite">
                  @if (!chatMessages.length) { <p class="empty">{{ t('اسأل عن الفواتير الصادرة أو المصروفات المسجلة أو أعداد العملاء والمنتجات.', 'Ask about issued invoices, recorded expenses, or customer and product counts.') }}</p> }
                  @for (message of chatMessages; track $index) { <article class="chat-message" [class.user-message]="message.role === 'user'"><span>{{ message.role === 'user' ? t('أنت', 'You') : t('المساعد الذكي', 'AI assistant') }}</span><p>{{ message.content }}</p>@if (message.sources?.length) { <small class="source-list">المصادر: @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? 'فاتورة' : (source.type === 'expense' ? 'مصروف' : source.type) }} · {{ source.invoice_number || source.category || source.id }}</span> }</small> }</article> }
                </div>
                @if (chatError) { <div class="error-banner" role="alert"><span>{{ chatError }}</span><button class="secondary" type="button" (click)="sendChat()" [disabled]="chatSending || !chatDraft.trim()">إعادة المحاولة</button></div> }
                @if (chatSending) { <p class="muted" role="status" aria-live="polite">{{ t('المساعد الذكي يجهّز الإجابة…', 'The AI assistant is preparing an answer…') }}</p> }
                <form class="chat-form" (ngSubmit)="sendChat()"><textarea name="chatMessage" rows="2" maxlength="2000" placeholder="اكتب سؤالك عن نشاطك…" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea><button class="primary" type="submit" [disabled]="chatSending || !chatDraft.trim()">{{ chatSending ? t('جارٍ الإرسال…', 'Sending…') : t('إرسال', 'Send') }}</button></form>
                <p class="footnote">{{ t('المساعد يقدّم إجابات استشارية فقط ولا ينشئ سجلات النشاط أو يعدّلها أو يحذفها. يجب إعداد مزوّد الذكاء الاصطناعي على الخادم.', 'The assistant provides advice only and cannot create, edit, or delete business records. The AI provider must be configured on the server.') }}</p>
              </section>
            }
          }
          <footer>{{ t('مساعد الأعمال الذكي', 'AI Business Assistant') }} <span>{{ t('جلسة Firebase موثّقة · واجهة API معزولة حسب النشاط · قاعدة بيانات PostgreSQL', 'Verified Firebase session · business-scoped API · PostgreSQL database') }}</span></footer>
        </main>
      }
    </div>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#f6f8fb;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #0f766e;outline-offset:3px}
    .shell{min-height:100vh}.install-button{display:none}.install-floating{display:none}.install-help-floating{display:none}.mobile-more,.mobile-more-menu{display:none}.language-row{display:flex;justify-content:flex-end;margin-bottom:8px}.language-toggle{min-height:38px}.shell.english .sidebar{inset:0 0 0 auto}.shell.english .main{margin-left:0;margin-right:245px}.shell.english .nav-item{text-align:left}.shell.english .hero-mark{margin-left:4%;margin-right:0}.shell.english .chat-message.user-message{margin-right:auto;margin-left:0}.sidebar{position:fixed;inset:0 auto 0 0;width:245px;background:#111827;color:#e5e7eb;padding:26px 17px;display:flex;flex-direction:column;z-index:2}
    .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:0 7px 38px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#a7f3d0;color:#064e3b;font-size:21px;font-weight:900;margin-bottom:20px}.brand-mark.small{width:34px;height:34px;border-radius:11px;margin:0;font-size:16px}.light{font-weight:400;color:#9ca3af;margin-left:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:#6b7280;margin:0 0 8px}.nav-label{font-size:10px;color:#9ca3af;letter-spacing:1.5px;padding:0 10px}.nav-item{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:#cbd5e1;text-align:left;padding:12px;border-radius:10px;margin:3px 0;font-size:14px;transition:background .18s ease,color .18s ease}.nav-item:hover{background:#1e293b;color:#fff}.nav-item.active{background:linear-gradient(100deg,#164e63,#1d4ed8);color:#fff;box-shadow:inset 3px 0 #5eead4}.nav-icon{display:inline-grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;font-size:17px;font-weight:800;background:#1e293b}.overview-icon{color:#67e8f9;background:#164e63}.invoices-icon{color:#fcd34d;background:#713f12}.products-icon{color:#86efac;background:#14532d}.customers-icon{color:#c4b5fd;background:#4c1d95}.assistant-icon{color:#f9a8d4;background:#831843}.payments-icon{color:#67e8f9;background:#164e63}.nav-item.active .nav-icon{background:#ffffff24;color:#fff}.sidebar-bottom{margin-top:auto;border-top:1px solid #293548;padding:18px 8px 0;font-size:11px}.sidebar-bottom small{display:block;color:#9ca3af;margin:8px 0 0 15px;line-height:1.5}.status-dot{display:inline-block;width:7px;height:7px;background:#34d399;border-radius:50%;margin-right:8px}
    .main{margin-left:245px;padding:30px clamp(18px,4vw,54px) 20px;max-width:1550px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:0}.user-area{display:flex;align-items:center;gap:12px;font-size:12px;color:#4b5563}.secondary,.primary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:#fff;color:#374151}.primary{background:#0f766e;border-color:#0f766e;color:#fff}.primary:hover{background:#115e59}.workspace-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 17px;background:#fff;border:1px solid #e5e7eb;border-radius:13px;margin-bottom:18px}.workspace-bar strong{display:block;font-size:14px}.workspace-bar select{max-width:260px}.hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:30px 34px;border-radius:19px;background:linear-gradient(115deg,#14243a,#1e3a5f 60%,#155e75);color:#fff}.hero .eyebrow{color:#a7f3d0}.hero h2{font-size:clamp(25px,3vw,36px);line-height:1.12;letter-spacing:-1px;margin:10px 0}.hero p:last-child{max-width:460px;font-size:12px;line-height:1.6;color:#cbd5e1}.hero-mark{width:84px;height:84px;display:grid;place-items:center;border-radius:26px;background:linear-gradient(135deg,#a7f3d0,#60a5fa);color:#0f2942;font-weight:900;font-size:24px;margin-right:4%;box-shadow:0 15px 45px #02061755}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.metric,.panel,.quick-card{background:#fff;border:1px solid #e5eaf1;border-radius:14px}.metric{padding:17px;min-height:125px}.metric>span{display:block;color:#6b7280;font-size:11px;margin-bottom:13px}.metric strong{display:block;font-size:19px;letter-spacing:-.5px;overflow-wrap:anywhere}.metric small{display:block;font-size:10px;color:#9ca3af;margin-top:6px}.notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}.notice strong{white-space:nowrap}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:15px}.quick-card{text-align:left;padding:18px}.quick-card strong,.quick-card span{display:block}.quick-card strong{font-size:13px;margin-bottom:8px}.quick-card span{font-size:11px;color:#6b7280}
    .list-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}.list-tools input{flex:1;min-width:150px}.list-tools select{min-width:130px}.panel{padding:22px;margin-top:4px}.panel.narrow{max-width:650px;margin:50px auto}.panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:#6b7280;line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:#6b7280;margin:0}.count{font-size:10px;font-weight:700;color:#0f766e;background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:#f8fafc;border:1px solid #edf0f5;border-radius:11px}.invoice-form{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 100px auto auto}.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.payment-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#cffafe;color:#0e7490;font-size:17px;font-weight:800}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:#6b7280;font-size:10px;margin-top:5px;overflow-wrap:anywhere}.empty{padding:20px;text-align:center;color:#9ca3af;font-size:12px}.footnote{font-size:10px;line-height:1.6;color:#9ca3af;margin:15px 0 0}.chat-log{min-height:180px;max-height:440px;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-left:auto;background:#e0f2fe}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:800}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:#0f766e;font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-right:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical}.error,.error-banner{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:12px;line-height:1.6}.error-banner{margin-bottom:14px}.install-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 14px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;color:#065f46;font-size:12px;line-height:1.6}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:#6b7280;line-height:1.7}.setup-steps{background:#f8fafc;border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:#0f766e;font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10px}footer span{color:#9ca3af}
    @media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form .primary{grid-column:1/-1}}@media(max-width:760px){
      .install-button{display:inline-flex;align-items:center;justify-content:center;white-space:nowrap;border-color:#99f6e4;color:#065f46;background:#ecfdf5;font-weight:800}.install-floating{display:block;position:fixed;top:12px;right:12px;z-index:50;box-shadow:0 6px 20px #0f172a22}.install-help-floating{display:flex;position:fixed;top:62px;right:12px;z-index:50;width:min(360px,calc(100vw - 24px));box-shadow:0 8px 28px #0f172a22}.main,.shell.english .main{padding-top:76px}.shell.install-help-open .main{padding-top:164px}.mobile-more{display:flex}.mobile-more-menu{display:grid;position:fixed;z-index:30;right:10px;bottom:calc(82px + env(safe-area-inset-bottom));width:min(250px,calc(100vw - 20px));padding:8px;background:#0f172a;border:1px solid #334155;border-radius:16px;box-shadow:0 18px 50px #02061755;gap:4px}.mobile-more-menu .nav-item{flex-direction:row;justify-content:flex-start;min-height:48px;padding:9px 12px;font-size:13px}.mobile-more-menu .nav-item>span:not(.nav-icon){max-width:none}.mobile-more-menu .nav-item.active{box-shadow:inset 3px 0 #5eead4}.mobile-more-menu .mobile-menu-action{border-top:1px solid #334155;border-radius:8px;margin-top:2px}
      .global-loading{position:fixed;inset:0 0 auto;z-index:1000;height:3px;background:#ccfbf1;overflow:hidden}.global-loading>span:first-child{position:absolute;inset:0 auto 0 0;width:35%;background:#0f766e;animation:loading-sweep 1.15s ease-in-out infinite}.loading-label{position:absolute;top:10px;right:12px;background:#0f766e;color:#fff;padding:7px 12px;border-radius:999px;font-size:12px;box-shadow:0 4px 14px #0f172a22}@keyframes loading-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.global-loading>span:first-child{animation:none;width:100%}}
    .sidebar{position:fixed;inset:auto 0 0;width:100%;min-height:0;height:auto;padding:8px 6px calc(8px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(4,minmax(0,1fr));align-items:stretch;gap:2px;overflow-x:auto;overflow-y:hidden;background:rgba(15,23,42,.97);border-top:1px solid #334155;box-shadow:0 -8px 28px #0f172a20;backdrop-filter:blur(16px);z-index:20}
      .brand,.brand>span:last-child,.nav-label,.sidebar-bottom,.sidebar>.mobile-extra{display:none}
      .nav-item{min-width:0;min-height:58px;margin:0;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;font-size:10px;line-height:1.1;text-align:center;white-space:normal;color:#cbd5e1}
      .nav-item>span:not(.nav-icon){display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .nav-item .nav-icon{display:grid;flex:0 0 27px;width:27px;height:27px;font-size:17px;border-radius:9px}
      .nav-item.active{background:#1e293b;box-shadow:inset 0 -2px #5eead4;color:#fff}
      .main,.shell.english .main{margin:0;padding:20px 14px calc(100px + env(safe-area-inset-bottom));max-width:none}.shell.english .sidebar{inset:auto 0 0}.shell.english .nav-item{text-align:center}
      .topbar{display:none!important}
      .topbar h1{font-size:clamp(20px,5.5vw,25px);line-height:1.2}
      .user-area{gap:6px}.user-area>span{display:none}.user-area .secondary{padding:9px 10px;min-height:40px}
      .hero{padding:22px 20px;border-radius:16px}.hero h2{font-size:27px}.hero-mark{display:none}
      .quick-grid{grid-template-columns:1fr}.workspace-bar{align-items:stretch;flex-direction:column}.workspace-bar select{max-width:none;width:100%}
      .section-head{align-items:flex-start;gap:10px}.list-row{flex-wrap:wrap}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .metric{padding:13px;min-height:110px}.metric strong{font-size:clamp(15px,4vw,18px);overflow-wrap:anywhere}
      .inline-form,.invoice-form{grid-template-columns:1fr}.list-tools{display:grid;grid-template-columns:1fr}.list-tools input,.list-tools select,.list-tools button{width:100%}.inline-form .primary{grid-column:auto}
      .panel{padding:15px;border-radius:13px}.notice{flex-direction:column}.notice strong{white-space:normal}
      footer{flex-direction:column;line-height:1.6}
      input,select,textarea{font-size:16px!important;min-height:44px}
      button,.secondary,.primary{min-height:42px}
    }
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
  language: 'ar' | 'en' = 'ar';
  initialized = false;
  setupNeeded = false;
  signedIn = false;
  signingUp = false;
  loading = false;
  error = '';
  email = '';
  password = '';
  userEmail = '';
  tab: Tab = 'overview';
  businesses: Business[] = [];
  business: Business | null = null;
  selectedBusinessId = '';
  dashboard: Dashboard | null = null;
  customers: Customer[] = [];
  products: Product[] = [];
  invoices: Invoice[] = [];
  customerSearch = '';
  productSearch = '';
  invoiceSearch = '';
  invoiceStatusFilter: 'all' | 'draft' | 'issued' | 'void' | 'paid' | 'overdue' = 'all';
  payments: Payment[] = [];
  businessName = '';
  currencyCode = 'EGP';
  customerName = '';
  customerEmail = '';
  customerPhone = '';
  productName = '';
  productPrice = '';
  stockTracked = false;
  invoiceProductId = '';
  invoiceQuantity = '1';
  invoiceNumber = '';
  editingInvoiceId: string | null = null;
  paymentAmount = '';
  paymentAllocationAmount = '';
  paymentInvoiceId = '';
  paymentMethod = 'cash';
  paymentReference = '';
  paymentIdempotencyKey = '';
  chatDraft = '';
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources'] }> = [];
  chatSending = false;
  chatError = '';
  mobileMoreOpen = false;
  isInstalled = false;
  installHelp = false;
  private installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;

  constructor(private readonly auth: AuthService, private readonly api: ApiService) {
    this.isInstalled = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
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

  ngOnInit(): void {
    void this.initializeApp();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      const registerWorker = () => navigator.serviceWorker.register('/sw.js').catch(() => {
        // The app remains usable if service-worker registration is unavailable.
      });
      if (document.readyState === 'complete') void registerWorker();
      else window.addEventListener('load', () => { void registerWorker(); }, { once: true });
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
      payments: 'المدفوعات', assistant: 'مساعد الأعمال الذكي'
    };
    return this.language === 'ar' ? titles[this.tab] : ({ overview: 'Business overview', customers: 'Customers', products: 'Products & inventory', invoices: 'Sales & invoices', payments: 'Payments', assistant: 'AI business assistant' } as Record<Tab, string>)[this.tab];
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
        return;
      }
      const chosen = this.businesses.find(item => item.id === this.selectedBusinessId) || this.businesses[0];
      this.selectedBusinessId = chosen.id;
      this.business = chosen;
      await this.loadWorkspaceData();
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async createWorkspace(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const created = await this.api.createBusiness({ name: this.businessName, currency_code: this.currencyCode });
      this.businesses = [created];
      this.business = created;
      this.selectedBusinessId = created.id;
      this.businessName = '';
      await this.loadWorkspaceData();
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async switchBusiness(id: string): Promise<void> {
    this.selectedBusinessId = id;
    this.business = this.businesses.find(item => item.id === id) || null;
    this.chatMessages = [];
    await this.loadWorkspaceData();
  }

  private workspaceLoadVersion = 0;

  async loadWorkspaceData(): Promise<void> {
    if (!this.business) return;
    const id = this.business.id;
    const loadVersion = ++this.workspaceLoadVersion;
    this.loading = true;
    this.error = '';
    try {
      const [dashboard, عميل, منتج, فاتورة, دفعة] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), this.api.payments(id)
      ]);
      if (this.business?.id !== id) return;
      this.dashboard = dashboard;
      this.customers = عميل;
      this.products = منتج;
      this.invoices = فاتورة;
      this.payments = دفعة;
      if (!this.invoiceProductId && this.products.length) this.invoiceProductId = this.products[0].id;
      if (!this.paymentInvoiceId) this.paymentInvoiceId = this.invoices.find(item => item.status === 'issued')?.id || '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      if (loadVersion === this.workspaceLoadVersion) this.loading = false;
    }
  }

  get filteredCustomers(): Customer[] {
    const q = this.customerSearch.trim().toLocaleLowerCase();
    return this.customers.filter(item => !q || [item.name, item.email || '', item.phone || ''].some(value => value.toLocaleLowerCase().includes(q)));
  }

  get filteredProducts(): Product[] {
    const q = this.productSearch.trim().toLocaleLowerCase();
    return this.products.filter(item => !q || [item.name, item.sku || '', item.unit_price, this.business?.currency_code || ''].some(value => String(value).toLocaleLowerCase().includes(q)));
  }

  get filteredInvoices(): Invoice[] {
    const q = this.invoiceSearch.trim().toLocaleLowerCase();
    return this.invoices.filter(item => (this.invoiceStatusFilter === 'all' || item.status === this.invoiceStatusFilter) && (!q || [item.invoice_number, item.currency_code, item.status, item.total].some(value => String(value).toLocaleLowerCase().includes(q))));
  }

  exportCurrentList(): void {
    if (this.tab === 'customers') {
      this.downloadCsv('customers.csv', ['name', 'email', 'phone'], this.filteredCustomers.map(item => [item.name, item.email || '', item.phone || '']));
    } else if (this.tab === 'products') {
      this.downloadCsv('products.csv', ['name', 'sku', 'unit_price', 'currency', 'stock_tracked'], this.filteredProducts.map(item => [item.name, item.sku || '', item.unit_price, this.business?.currency_code || '', item.is_stock_tracked ? 'yes' : 'no']));
    } else if (this.tab === 'invoices') {
      this.downloadCsv('invoices.csv', ['invoice_number', 'status', 'total', 'currency'], this.filteredInvoices.map(item => [item.invoice_number, item.status, item.total, item.currency_code]));
    }
  }

  private downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
    const escape = (value: string | number) => '"' + String(value).replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.error = '';
    this.mobileMoreOpen = false;
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
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async createProduct(): Promise<void> {
    if (!this.business) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.createProduct(this.business.id, {
        name: this.productName, unit_price: this.productPrice, is_stock_tracked: this.stockTracked
      });
      this.productName = ''; this.productPrice = ''; this.stockTracked = false;
      this.products = await this.api.products(this.business.id);
      if (this.products.length) this.invoiceProductId = this.products[0].id;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async createInvoice(): Promise<void> {
    if (!this.business || !this.invoiceProductId) return;
    this.loading = true;
    this.error = '';
    try {
      const invoiceNumber = this.invoiceNumber.trim() || 'INV-' + Date.now();
      const payload = {
        invoice_number: invoiceNumber,
        currency_code: this.business.currency_code,
        lines: [{ product_id: this.invoiceProductId, quantity: String(this.invoiceQuantity) }]
      };
      if (this.editingInvoiceId) {
        await this.api.updateDraftInvoice(this.business.id, this.editingInvoiceId, payload);
      } else {
        await this.api.createInvoice(this.business.id, payload);
      }
      this.cancelInvoiceEdit();
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
      if (detail.lines.length !== 1 || !detail.lines[0].product_id) {
        throw new Error('يدعم المحرر السريع بند منتج واحد فقط. لم يتم تغيير الفاتورة.');
      }
      this.editingInvoiceId = invoice.id;
      this.invoiceNumber = detail.invoice_number;
      this.invoiceProductId = detail.lines[0].product_id;
      this.invoiceQuantity = detail.lines[0].quantity;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  cancelInvoiceEdit(): void {
    this.editingInvoiceId = null;
    this.invoiceNumber = '';
    this.invoiceQuantity = '1';
  }

  async issueInvoice(invoice: Invoice): Promise<void> {
    if (!this.business) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.issueInvoice(this.business.id, invoice.id);
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

  async createPayment(): Promise<void> {
    if (!this.business || !this.paymentAmount.trim()) return;
    const amount = this.paymentAmount.trim();
    const allocation = this.paymentAllocationAmount.trim();
    if (this.paymentInvoiceId && !allocation) {
      this.error = 'أدخل المبلغ المراد تخصيصه للفاتورة المحددة.';
      return;
    }
    this.loading = true;
    this.error = '';
    if (!this.paymentIdempotencyKey) {
      this.paymentIdempotencyKey = 'payment-' + this.business.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
    try {
      await this.api.createPayment(this.business.id, {
        amount,
        currency_code: this.business.currency_code,
        idempotency_key: this.paymentIdempotencyKey,
        method: this.paymentMethod,
        reference: this.paymentReference.trim() || undefined,
        allocations: this.paymentInvoiceId ? [{
          invoice_id: this.paymentInvoiceId,
          amount: allocation
        }] : []
      });
      this.paymentAmount = '';
      this.paymentAllocationAmount = '';
      this.paymentReference = '';
      this.paymentIdempotencyKey = '';
      this.payments = await this.api.payments(this.business.id);
      this.dashboard = await this.api.dashboard(this.business.id);
      this.invoices = await this.api.invoices(this.business.id);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
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
      this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources }];
    } catch (error) {
      this.chatMessages = this.chatMessages.slice(0, -1);
      this.chatDraft = question;
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
    if (message.startsWith('API_CONNECTION_FAILED:')) return this.t('تعذر الاتصال بخادم البيانات. تحقق من الإنترنت وإعداد CORS_ALLOWED_ORIGINS في الخادم ثم أعد المحاولة.', 'Could not reach the business API. Check your internet connection and the server CORS_ALLOWED_ORIGINS setting, then retry.');
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      if (context === 'auth') return this.t('تعذر الاتصال بخدمة Firebase Authentication. تحقق من الإنترنت وتفعيل تسجيل الدخول بالبريد وكلمة المرور وإضافة نطاق الموقع إلى النطاقات المصرح بها في Firebase.', 'Could not reach Firebase Authentication. Check your internet, enable Email/Password sign-in, and authorize this site domain in Firebase.');
      return this.t('تعذر الوصول إلى الخدمة. تحقق من اتصال الإنترنت وإعدادات API وCORS ثم حاول مجددًا.', 'The service could not be reached. Check your internet connection, API availability, and CORS settings, then retry.');
    }
    if (message) return message;
    return this.t('حدث خطأ غير متوقع. حاول مجددًا.', 'An unexpected error occurred. Please try again.');
  }
}
