import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Business, ChatReply, Customer, Dashboard, Invoice, Payment, Product } from './api.service';
import { AuthService } from './auth.service';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'payments' | 'assistant';

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="shell" lang="ar" dir="rtl">
      @if (loading) { <div class="global-loading" role="status" aria-live="polite"><span></span><span class="loading-label">جارٍ التحميل…</span></div> }
      @if (setupNeeded) {
        <main class="setup-card">
          <div class="brand-mark">A</div>
          <p class="eyebrow">مساعد الأعمال الذكي · يلزم الإعداد</p>
          <h1>اربط مساحة عملك الآمنة</h1>
          <p>الواجهة جاهزة، لكن يجب إعداد بيانات تطبيق Firebase العامة ورابط API قبل تسجيل الدخول.</p>
          <div class="setup-steps">
            <p><strong>1.</strong> Open <code>frontend/public/runtime-config.json</code> in the repository.</p>
            <p><strong>2.</strong> Set <code>apiBaseUrl</code> to the deployed FastAPI origin.</p>
            <p><strong>3.</strong> Fill the public Firebase web-app values: <code>apiKey</code>, <code>authDomain</code>, <code>projectId</code>, and <code>appId</code>.</p>
            <p><strong>4.</strong> Configure the matching Firebase project ID and service-account credentials as backend secrets. Never put those secrets in this file.</p>
          </div>
          <p class="footnote">No fake data is shown. The app will stay closed until these settings are present.</p>
        </main>
      } @else if (!signedIn) {
        <main class="auth-card">
          <div class="brand-mark">A</div>
          <p class="eyebrow">كل أعمالك في مكان واحد</p>
          <h1>{{ signingUp ? 'إنشاء حسابك' : 'مرحبًا بعودتك' }}</h1>
          <p class="muted">سجّل الدخول بأمان للوصول إلى مساحات العمل المصرح لك بها فقط.</p>
          <form (ngSubmit)="submitAuth()" class="stack">
            <label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required [(ngModel)]="email"></label>
            <label>كلمة المرور<input name="password" type="password" [attr.autocomplete]="signingUp ? 'new-password' : 'current-password'" minlength="6" required [(ngModel)]="password"></label>
            <button class="primary" type="submit" [disabled]="loading">{{ loading ? 'جارٍ التنفيذ…' : (signingUp ? 'إنشاء الحساب' : 'تسجيل الدخول') }}</button>
          </form>
          <button class="text-button" type="button" (click)="signingUp = !signingUp">{{ signingUp ? 'Already registered? تسجيل الدخول' : 'مستخدم جديد؟ أنشئ حسابًا' }}</button>
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
        </main>
      } @else {
        <aside class="sidebar">
          <a class="brand" href="#" (click)="$event.preventDefault(); setTab('overview')"><span class="brand-mark small">A</span><span>Business<span class="light">Pilot</span></span></a>
          <p class="nav-label">مساحة العمل</p>
          <button class="nav-item" aria-label="نظرة عامة" title="نظرة عامة" [class.active]="tab === 'overview'" (click)="setTab('overview')"><span class="nav-icon overview-icon" aria-hidden="true">⌂</span><span>نظرة عامة</span></button>
          <button class="nav-item" aria-label="المبيعات والفواتير" title="المبيعات والفواتير" [class.active]="tab === 'invoices'" (click)="setTab('invoices')"><span class="nav-icon invoices-icon" aria-hidden="true">▤</span><span>المبيعات والفواتير</span></button>
          <button class="nav-item" aria-label="المنتجات والمخزون" title="المنتجات والمخزون" [class.active]="tab === 'products'" (click)="setTab('products')"><span class="nav-icon products-icon" aria-hidden="true">◇</span><span>المنتجات والمخزون</span></button>
          <button class="nav-item" aria-label="العملاء" title="العملاء" [class.active]="tab === 'customers'" (click)="setTab('customers')"><span class="nav-icon customers-icon" aria-hidden="true">♧</span><span>العملاء</span></button>
          <button class="nav-item" aria-label="المدفوعات" title="المدفوعات" [class.active]="tab === 'payments'" (click)="setTab('payments')"><span class="nav-icon payments-icon" aria-hidden="true">↗</span><span>المدفوعات</span></button>
          <button class="nav-item" aria-label="المساعد الذكي" title="المساعد الذكي" [class.active]="tab === 'assistant'" (click)="setTab('assistant')"><span class="nav-icon assistant-icon" aria-hidden="true">✦</span><span>المساعد الذكي</span></button>
          <div class="sidebar-bottom"><span class="status-dot"></span> جلسة موثّقة<small>يتحقق الخادم من صلاحيات مساحة العمل</small></div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div><p class="eyebrow">YOUR مساحة العمل</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area"><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">تسجيل الخروج</button></div>
          </header>

          @if (error) { <div class="error-banner" role="alert">{{ error }}</div> }
          @if (loading) { <p class="muted">جارٍ تحميل بيانات مساحة العمل…</p> }

          @if (!business) {
            <section class="panel narrow">
              <p class="eyebrow">GET STARTED</p><h2>Create your first workspace</h2>
              <p class="muted">Your workspace is linked to your verified account. Other users cannot access it without membership.</p>
              <form class="stack" (ngSubmit)="createWorkspace()">
                <label>اسم النشاط التجاري<input name="businessName" required maxlength="160" [(ngModel)]="businessName"></label>
                <label>Default currency<select name="currency" [(ngModel)]="currencyCode"><option value="EGP">EGP · Egyptian pound</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · British pound</option><option value="SAR">SAR · Saudi riyal</option><option value="AED">AED · UAE dirham</option></select></label>
                <button class="primary" type="submit" [disabled]="loading">إنشاء مساحة عمل</button>
              </form>
            </section>
          } @else {
            <section class="workspace-bar">
              <div><span class="eyebrow">ACTIVE BUSINESS</span><strong>{{ business.name }}</strong></div>
              <select aria-label="Select workspace" [ngModel]="selectedBusinessId" (ngModelChange)="switchBusiness($event)">
                @for (item of businesses; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
              </select>
            </section>

            @if (tab === 'overview') {
              <section class="hero">
                <div><p class="eyebrow light">BUSINESS OVERVIEW</p><h2>Good decisions start with<br>reliable numbers.</h2><p>Showing recorded activity for the last 30 days. العملة totals are kept separate.</p></div>
                <div class="hero-mark" aria-hidden="true">AI</div>
              </section>
              @if (dashboard) {
                <section class="metric-grid">
                  <article class="metric"><span>Invoiced sales</span>@for (item of dashboard.invoiced_sales; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} issued invoices</small> } @if (!dashboard.invoiced_sales.length) { <strong>0</strong><small>No issued sales in this period</small> }</article>
                  <article class="metric"><span>Collected payments</span>@for (item of dashboard.collected_payments; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} payments recorded</small> } @if (!dashboard.collected_payments.length) { <strong>0</strong><small>No recorded payments in this period</small> }</article>
                  <article class="metric"><span>Expenses</span>@for (item of dashboard.expenses; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} expenses recorded</small> } @if (!dashboard.expenses.length) { <strong>0</strong><small>No recorded expenses in this period</small> }</article>
                  <article class="metric"><span>Outstanding balances</span>@for (item of dashboard.outstanding_balances; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>إصدارd invoices less allocations</small> } @if (!dashboard.outstanding_balances.length) { <strong>0</strong><small>No outstanding invoices in this period</small> }</article>
                </section>
              }
              <section class="notice"><strong>Data integrity</strong><span>These totals come from saved business records. They are not a profit calculation and currencies are never combined.</span></section>
              <section class="quick-grid">
                <button class="quick-card" (click)="setTab('customers')"><strong>العملاء</strong><span>{{ customers.length }} active records · View directory →</span></button>
                <button class="quick-card" (click)="setTab('products')"><strong>Products</strong><span>{{ products.length }} active records · View catalog →</span></button>
                <button class="quick-card" (click)="setTab('invoices')"><strong>Invoices</strong><span>{{ invoices.length }} records · Manage sales →</span></button>
              </section>
            }

            @if (tab === 'customers') {
              <section class="panel">
                <div class="section-head"><div><h2>Customer directory</h2><p>Records are scoped to the selected workspace.</p></div><span class="count">{{ customers.length }} customers</span></div>
                <form class="inline-form" (ngSubmit)="createCustomer()">
                  <input aria-label="اسم العميل" name="customerName" placeholder="اسم العميل" required [(ngModel)]="customerName">
                  <input aria-label="Customer email" name="customerEmail" type="email" placeholder="Email (optional)" [(ngModel)]="customerEmail">
                  <input aria-label="Customer phone" name="customerالهاتف" placeholder="الهاتف (optional)" [(ngModel)]="customerالهاتف">
                  <button class="primary" type="submit" [disabled]="loading">إضافة عميل</button>
                </form>
                <div class="list">
                  @for (customer of customers; track customer.id) { <article class="list-row"><div class="avatar">{{ customer.name.slice(0,1).toUpperCase() }}</div><div class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.email || 'No email' }} · {{ customer.phone || 'No phone' }}</small></div></article> }
                  @if (!customers.length) { <p class="empty">لا يوجد عملاء بعد. Add your first customer above.</p> }
                </div>
              </section>
            }

            @if (tab === 'products') {
              <section class="panel">
                <div class="section-head"><div><h2>Products & services</h2><p>السعرs are stored with exact decimal precision.</p></div><span class="count">{{ products.length }} products</span></div>
                <form class="inline-form" (ngSubmit)="createProduct()">
                  <input aria-label="اسم المنتج" name="productName" placeholder="اسم المنتج" required [(ngModel)]="productName">
                  <input aria-label="Unit price" name="productالسعر" type="number" min="0" step="0.01" placeholder="Unit price" required [(ngModel)]="productالسعر">
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> Track stock</label>
                  <button class="primary" type="submit" [disabled]="loading">إضافة منتج</button>
                </form>
                <div class="list">
                  @for (product of products; track product.id) { <article class="list-row"><div class="product-mark">◇</div><div class="grow"><strong>{{ product.name }}</strong><small>{{ product.is_stock_tracked ? 'Stock tracked' : 'Service / stock not tracked' }}{{ product.sku ? ' · SKU ' + product.sku : '' }}</small></div><strong>{{ product.unit_price }} {{ business.currency_code }}</strong></article> }
                  @if (!products.length) { <p class="empty">لا توجد منتجات بعد. Add a product or service above.</p> }
                </div>
              </section>
            }

            @if (tab === 'invoices') {
              <section class="panel">
                <div class="section-head"><div><h2>المبيعات والفواتير</h2><p>Create a draft and issue it when the details are correct.</p></div><span class="count">{{ invoices.length }} invoices</span></div>
                <form class="inline-form invoice-form" (ngSubmit)="createInvoice()">
                  <input name="invoiceNumber" aria-label="رقم الفاتورة" placeholder="رقم الفاتورة (auto if blank)" maxlength="80" [(ngModel)]="invoiceNumber">
                  <select name="invoiceProduct" aria-label="Product" required [(ngModel)]="invoiceProductId"><option value="" disabled>اختر منتجًا</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.unit_price }} {{ business.currency_code }}</option> }</select>
                  <input name="invoiceالكمية" aria-label="الكمية" type="number" min="0.001" step="0.001" required [(ngModel)]="invoiceالكمية">
                  <button class="primary" type="submit" [disabled]="loading || !products.length">{{ editingInvoiceId ? 'حفظ كمسودة' : 'إنشاء مسودة' }}</button>
                  @if (editingInvoiceId) { <button class="secondary" type="button" (click)="cancelInvoiceتعديل()">إلغاء</button> }
                </form>
                <div class="list">
                  @for (invoice of invoices; track invoice.id) { <article class="list-row"><div class="invoice-mark">▤</div><div class="grow"><strong>{{ invoice.invoice_number }}</strong><small>{{ invoice.status }} · {{ invoice.currency_code }}</small></div><strong>{{ invoice.total }} {{ invoice.currency_code }}</strong>@if (invoice.status === 'draft') { <button class="secondary" (click)="editInvoice(invoice)" [disabled]="loading">تعديل</button><button class="secondary" (click)="issueInvoice(invoice)" [disabled]="loading">إصدار</button><button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">إلغاء</button> } @else if (invoice.status === 'issued') { <button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">إلغاء</button> }</article> }
                  @if (!invoices.length) { <p class="empty">لا توجد فواتير بعد. Add a product first, then create a draft.</p> }
                </div>
                <p class="footnote">Issuing an invoice deducts tracked stock atomically and fails if stock is insufficient.</p>
              </section>
            }

            @if (tab === 'payments') {
              <section class="panel">
                <div class="section-head"><div><h2>Record a payment</h2><p>Record money received and optionally allocate it to an issued invoice.</p></div><span class="count">{{ payments.length }} payments</span></div>
                <form class="inline-form payment-form" (ngSubmit)="createPayment()">
                  <input aria-label="مبلغ الدفعة" name="paymentAmount" type="number" min="0.01" step="0.01" placeholder="Amount received" required [(ngModel)]="paymentAmount">
                  <select aria-label="طريقة الدفع" name="paymentMethod" [(ngModel)]="paymentMethod"><option value="cash">نقدًا</option><option value="bank_transfer">تحويل بنكي</option><option value="card">بطاقة</option><option value="wallet">Mobile wallet</option><option value="other">Other</option></select>
                  <select aria-label="Invoice to allocate" name="paymentInvoiceId" [(ngModel)]="paymentInvoiceId"><option value="">Do not allocate yet</option>@for (invoice of invoices; track invoice.id) { @if (invoice.status === 'issued') { <option [value]="invoice.id">{{ invoice.invoice_number }} · {{ invoice.total }} {{ invoice.currency_code }}</option> } }</select>
                  @if (paymentInvoiceId) { <input aria-label="Amount to allocate" name="paymentAllocationAmount" type="number" min="0.01" step="0.01" placeholder="Amount allocated" [(ngModel)]="paymentAllocationAmount"> }
                  <input aria-label="Payment reference" name="paymentالمرجع" maxlength="128" placeholder="المرجع (optional)" [(ngModel)]="paymentالمرجع">
                  <button class="primary" type="submit" [disabled]="loading || !paymentAmount">تسجيل دفعة</button>
                </form>
                <p class="footnote">العملة is fixed to {{ business.currency_code }} for this workspace. Allocations are validated against the invoice balance by the API; unallocated money remains recorded as received.</p>
                <div class="list">
                  @for (payment of payments; track payment.id) { <article class="list-row"><div class="payment-mark">↗</div><div class="grow"><strong>{{ payment.amount }} {{ payment.currency_code }}</strong><small>{{ payment.received_at | date:'medium' }} · {{ payment.method || 'Method not specified' }}{{ payment.reference ? ' · ' + payment.reference : '' }}</small><small>{{ payment.allocations.length ? payment.allocations.length + ' invoice allocation(s)' : 'Unallocated payment' }}</small></div></article> }
                  @if (!payments.length) { <p class="empty">No payments recorded yet.</p> }
                </div>
              </section>
            }

            @if (tab === 'assistant') {
              <section class="panel chat-panel">
                <div class="section-head"><div><h2>AI Business Assistant</h2><p>Answers grounded in recent records from this workspace only.</p></div><span class="count">Read-only</span></div>
                <div class="chat-log" aria-live="polite">
                  @if (!chatMessages.length) { <p class="empty">Ask about recent issued invoices, recorded expenses, or your customer and product counts.</p> }
                  @for (message of chatMessages; track $index) { <article class="chat-message" [class.user-message]="message.role === 'user'"><span>{{ message.role === 'user' ? 'You' : 'Assistant' }}</span><p>{{ message.content }}</p>@if (message.sources?.length) { <small class="source-list">Sources: @for (source of message.sources; track source.id) { <span>{{ source.type }} · {{ source.invoice_number || source.category || source.id }}</span> }</small> }</article> }
                </div>
                <form class="chat-form" (ngSubmit)="sendChat()"><textarea name="chatMessage" rows="2" maxlength="2000" placeholder="Ask a question about your business…" required [(ngModel)]="chatمسودة"></textarea><button class="primary" type="submit" [disabled]="loading || !chatمسودة.trim()">إرسال</button></form>
                <p class="footnote">The assistant does not create, update, or delete business records. AI provider configuration is required on the backend.</p>
              </section>
            }
          }
          <footer>AI Business Assistant <span>Firebase ID token · Tenant-scoped API · PostgreSQL records</span></footer>
        </main>
      }
    </div>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#f6f8fb;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}
    .shell{min-height:100vh}.sidebar{position:fixed;inset:0 auto 0 0;width:245px;background:#111827;color:#e5e7eb;padding:26px 17px;display:flex;flex-direction:column;z-index:2}
    .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:0 7px 38px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#a7f3d0;color:#064e3b;font-size:21px;font-weight:900;margin-bottom:20px}.brand-mark.small{width:34px;height:34px;border-radius:11px;margin:0;font-size:16px}.light{font-weight:400;color:#9ca3af;margin-left:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:#6b7280;margin:0 0 8px}.nav-label{font-size:10px;color:#9ca3af;letter-spacing:1.5px;padding:0 10px}.nav-item{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:#cbd5e1;text-align:left;padding:12px;border-radius:10px;margin:3px 0;font-size:14px;transition:background .18s ease,color .18s ease}.nav-item:hover{background:#1e293b;color:#fff}.nav-item.active{background:linear-gradient(100deg,#164e63,#1d4ed8);color:#fff;box-shadow:inset 3px 0 #5eead4}.nav-icon{display:inline-grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;font-size:17px;font-weight:800;background:#1e293b}.overview-icon{color:#67e8f9;background:#164e63}.invoices-icon{color:#fcd34d;background:#713f12}.products-icon{color:#86efac;background:#14532d}.customers-icon{color:#c4b5fd;background:#4c1d95}.assistant-icon{color:#f9a8d4;background:#831843}.payments-icon{color:#67e8f9;background:#164e63}.nav-item.active .nav-icon{background:#ffffff24;color:#fff}.sidebar-bottom{margin-top:auto;border-top:1px solid #293548;padding:18px 8px 0;font-size:11px}.sidebar-bottom small{display:block;color:#9ca3af;margin:8px 0 0 15px;line-height:1.5}.status-dot{display:inline-block;width:7px;height:7px;background:#34d399;border-radius:50%;margin-right:8px}
    .main{margin-left:245px;padding:30px clamp(18px,4vw,54px) 20px;max-width:1550px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:0}.user-area{display:flex;align-items:center;gap:12px;font-size:12px;color:#4b5563}.secondary,.primary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:#fff;color:#374151}.primary{background:#0f766e;border-color:#0f766e;color:#fff}.primary:hover{background:#115e59}.workspace-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 17px;background:#fff;border:1px solid #e5e7eb;border-radius:13px;margin-bottom:18px}.workspace-bar strong{display:block;font-size:14px}.workspace-bar select{max-width:260px}.hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:30px 34px;border-radius:19px;background:linear-gradient(115deg,#14243a,#1e3a5f 60%,#155e75);color:#fff}.hero .eyebrow{color:#a7f3d0}.hero h2{font-size:clamp(25px,3vw,36px);line-height:1.12;letter-spacing:-1px;margin:10px 0}.hero p:last-child{max-width:460px;font-size:12px;line-height:1.6;color:#cbd5e1}.hero-mark{width:84px;height:84px;display:grid;place-items:center;border-radius:26px;background:linear-gradient(135deg,#a7f3d0,#60a5fa);color:#0f2942;font-weight:900;font-size:24px;margin-right:4%;box-shadow:0 15px 45px #02061755}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.metric,.panel,.quick-card{background:#fff;border:1px solid #e5eaf1;border-radius:14px}.metric{padding:17px;min-height:125px}.metric>span{display:block;color:#6b7280;font-size:11px;margin-bottom:13px}.metric strong{display:block;font-size:19px;letter-spacing:-.5px;overflow-wrap:anywhere}.metric small{display:block;font-size:10px;color:#9ca3af;margin-top:6px}.notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}.notice strong{white-space:nowrap}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:15px}.quick-card{text-align:left;padding:18px}.quick-card strong,.quick-card span{display:block}.quick-card strong{font-size:13px;margin-bottom:8px}.quick-card span{font-size:11px;color:#6b7280}
    .panel{padding:22px;margin-top:4px}.panel.narrow{max-width:650px;margin:50px auto}.panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:#6b7280;line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:#6b7280;margin:0}.count{font-size:10px;font-weight:700;color:#0f766e;background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:#f8fafc;border:1px solid #edf0f5;border-radius:11px}.invoice-form{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 100px auto auto}.payment-form{grid-template-columns:repeat(3,minmax(0,1fr))}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.payment-mark{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:11px;background:#cffafe;color:#0e7490;font-size:17px;font-weight:800}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:#6b7280;font-size:10px;margin-top:5px;overflow-wrap:anywhere}.empty{padding:20px;text-align:center;color:#9ca3af;font-size:12px}.footnote{font-size:10px;line-height:1.6;color:#9ca3af;margin:15px 0 0}.chat-log{min-height:180px;max-height:440px;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-left:auto;background:#e0f2fe}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:800}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:#0f766e;font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-right:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical}.error,.error-banner{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:12px;line-height:1.6}.error-banner{margin-bottom:14px}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:#6b7280;line-height:1.7}.setup-steps{background:#f8fafc;border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:#0f766e;font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10px}footer span{color:#9ca3af}
    @media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form .primary{grid-column:1/-1}}@media(max-width:760px){
      .global-loading{position:fixed;inset:0 0 auto;z-index:1000;height:3px;background:#ccfbf1;overflow:hidden}.global-loading>span:first-child{position:absolute;inset:0 auto 0 0;width:35%;background:#0f766e;animation:loading-sweep 1.15s ease-in-out infinite}.loading-label{position:absolute;top:10px;right:12px;background:#0f766e;color:#fff;padding:7px 12px;border-radius:999px;font-size:12px;box-shadow:0 4px 14px #0f172a22}@keyframes loading-sweep{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.global-loading>span:first-child{animation:none;width:100%}}
    .sidebar{position:fixed;inset:auto 0 0;width:100%;min-height:0;height:auto;padding:8px 6px calc(8px + env(safe-area-inset-bottom));display:grid;grid-template-columns:repeat(6,minmax(0,1fr));align-items:stretch;gap:2px;overflow-x:auto;overflow-y:hidden;background:rgba(15,23,42,.97);border-top:1px solid #334155;box-shadow:0 -8px 28px #0f172a20;backdrop-filter:blur(16px);z-index:20}
      .brand,.brand>span:last-child,.nav-label,.sidebar-bottom{display:none}
      .nav-item{min-width:0;min-height:58px;margin:0;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border-radius:12px;font-size:10px;line-height:1.1;text-align:center;white-space:normal;color:#cbd5e1}
      .nav-item>span:not(.nav-icon){display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .nav-item .nav-icon{display:grid;flex:0 0 27px;width:27px;height:27px;font-size:17px;border-radius:9px}
      .nav-item.active{background:#1e293b;box-shadow:inset 0 -2px #5eead4;color:#fff}
      .main{margin:0;padding:20px 14px calc(100px + env(safe-area-inset-bottom));max-width:none}
      .topbar{align-items:flex-start;margin-bottom:18px;gap:10px}
      .topbar h1{font-size:clamp(20px,5.5vw,25px);line-height:1.2}
      .user-area{gap:6px}.user-area>span{display:none}.user-area .secondary{padding:9px 10px;min-height:40px}
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
    @media(max-width:380px){.nav-item{font-size:9px}.nav-item .nav-icon{width:25px;height:25px;flex-basis:25px}.sidebar{padding-inline:3px}.main{padding-inline:11px}.metric{padding:10px}.metric>span{font-size:10px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
  `]
})
export class AppComponent implements OnInit {
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
  payments: Payment[] = [];
  businessName = '';
  currencyCode = 'EGP';
  customerName = '';
  customerEmail = '';
  customerالهاتف = '';
  productName = '';
  productالسعر = '';
  stockTracked = false;
  invoiceProductId = '';
  invoiceالكمية = '1';
  invoiceNumber = '';
  editingInvoiceId: string | null = null;
  paymentAmount = '';
  paymentAllocationAmount = '';
  paymentInvoiceId = '';
  paymentMethod = 'cash';
  paymentالمرجع = '';
  paymentIdempotencyKey = '';
  chatمسودة = '';
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources'] }> = [];

  constructor(private readonly auth: AuthService, private readonly api: ApiService) {}

  ngOnInit(): void {
    void this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    this.loading = true;
    this.error = '';
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
    }
  }

  get pageTitle(): string {
    const titles: Record<Tab, string> = {
      overview: 'نظرة عامة على النشاط', customers: 'العملاء',
      products: 'المنتجات والمخزون', invoices: 'المبيعات والفواتير',
      payments: 'المدفوعات', assistant: 'مساعد الأعمال الذكي'
    };
    return titles[this.tab];
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
      this.error = this.message(error);
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

  async loadWorkspaceData(): Promise<void> {
    if (!this.business) return;
    const id = this.business.id;
    try {
      const [dashboard, customers, products, invoices, payments] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id), this.api.payments(id)
      ]);
      if (this.business?.id !== id) return;
      this.dashboard = dashboard;
      this.customers = customers;
      this.products = products;
      this.invoices = invoices;
      this.payments = payments;
      if (!this.invoiceProductId && products.length) this.invoiceProductId = products[0].id;
      if (!this.paymentInvoiceId) this.paymentInvoiceId = invoices.find(item => item.status === 'issued')?.id || '';
    } catch (error) {
      this.error = this.message(error);
    }
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.error = '';
  }

  async createCustomer(): Promise<void> {
    if (!this.business) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.createCustomer(this.business.id, {
        name: this.customerName, email: this.customerEmail || undefined,
        phone: this.customerالهاتف || undefined
      });
      this.customerName = ''; this.customerEmail = ''; this.customerالهاتف = '';
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
        name: this.productName, unit_price: this.productالسعر, is_stock_tracked: this.stockTracked
      });
      this.productName = ''; this.productالسعر = ''; this.stockTracked = false;
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
        lines: [{ product_id: this.invoiceProductId, quantity: String(this.invoiceالكمية) }]
      };
      if (this.editingInvoiceId) {
        await this.api.updateمسودةInvoice(this.business.id, this.editingInvoiceId, payload);
      } else {
        await this.api.createInvoice(this.business.id, payload);
      }
      this.cancelInvoiceتعديل();
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
        throw new Error('The quick editor supports one product line. This invoice was left unchanged.');
      }
      this.editingInvoiceId = invoice.id;
      this.invoiceNumber = detail.invoice_number;
      this.invoiceProductId = detail.lines[0].product_id;
      this.invoiceالكمية = detail.lines[0].quantity;
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  cancelInvoiceتعديل(): void {
    this.editingInvoiceId = null;
    this.invoiceNumber = '';
    this.invoiceالكمية = '1';
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
      `إلغاء invoice ${invoice.invoice_number}? إصدارd invoices with allocated payments cannot be voided; use a refund/credit-note workflow.`
    )) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.voidInvoice(this.business.id, invoice.id, 'إلغاءed by an authorized workspace user');
      this.invoices = await this.api.invoices(this.business.id);
      this.dashboard = await this.api.dashboard(this.business.id);
      this.products = await this.api.products(this.business.id);
      if (this.editingInvoiceId === invoice.id) this.cancelInvoiceتعديل();
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
      this.error = 'Enter the amount to allocate to the selected invoice.';
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
        reference: this.paymentالمرجع.trim() || undefined,
        allocations: this.paymentInvoiceId ? [{
          invoice_id: this.paymentInvoiceId,
          amount: allocation
        }] : []
      });
      this.paymentAmount = '';
      this.paymentAllocationAmount = '';
      this.paymentالمرجع = '';
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
    if (!this.business || !this.chatمسودة.trim()) return;
    const question = this.chatمسودة.trim();
    const history = this.chatMessages.slice(-8);
    this.chatMessages = [...this.chatMessages, { role: 'user', content: question }];
    this.chatمسودة = '';
    this.loading = true;
    this.error = '';
    try {
      const reply: ChatReply = await this.api.chat(this.business.id, question, history);
      this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources }];
    } catch (error) {
      this.error = this.message(error);
      this.chatMessages = [...this.chatMessages, { role: 'assistant', content: this.message(error) }];
    } finally {
      this.loading = false;
    }
  }

  private message(error: unknown): string {
    const value = error as { code?: string; message?: string };
    const code = typeof value?.code === 'string' ? value.code : '';
    const message = typeof value?.message === 'string' ? value.message : '';
    const authMessages: Record<string, string> = {
      'auth/email-already-in-use': 'This email already has an account. تسجيل الدخول instead, or use a different email.',
      'auth/invalid-email': 'أدخل بريدًا إلكترونيًا صحيحًا.',
      'auth/weak-password': 'اختر كلمة مرور أقوى من 6 أحرف على الأقل.',
      'auth/operation-not-allowed': 'Email/password sign-up is disabled in Firebase Authentication. Enable the Email/كلمة المرور provider in Firebase Console.',
      'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication. Add ai-business-assistant-web.vercel.app to Authorized domains.',
      'auth/network-request-failed': 'Could not reach Firebase Authentication. Check the internet connection and Firebase API key restrictions, then try again.',
      'auth/too-many-requests': 'حظر Firebase المحاولات المتكررة مؤقتًا. انتظر قليلًا ثم حاول مجددًا.'
    };
    if (code && authMessages[code]) return authMessages[code];
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'The request could not reach a service. Check your connection. If account creation succeeded, switch to تسجيل الدخول before trying again; otherwise verify Firebase Authentication and API/CORS settings.';
    }
    if (message) return message;
    return 'حدث خطأ غير متوقع. حاول مجددًا.';
  }
}
