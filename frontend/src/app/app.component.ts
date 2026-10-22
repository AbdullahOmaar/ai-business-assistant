import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Business, ChatReply, Customer, Dashboard, Invoice, Product } from './api.service';
import { AuthService } from './auth.service';

type Tab = 'overview' | 'customers' | 'products' | 'invoices' | 'assistant';

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="shell">
      @if (setupNeeded) {
        <main class="setup-card">
          <div class="brand-mark">A</div>
          <p class="eyebrow">AI BUSINESS ASSISTANT · SETUP REQUIRED</p>
          <h1>Connect your secure workspace</h1>
          <p>The live interface is ready, but public Firebase web-app settings and the deployed API URL must be configured before sign-in can start.</p>
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
          <p class="eyebrow">YOUR BUSINESS, IN ONE PLACE</p>
          <h1>{{ signingUp ? 'Create your account' : 'Welcome back' }}</h1>
          <p class="muted">Sign in securely to access only the workspaces you belong to.</p>
          <form (ngSubmit)="submitAuth()" class="stack">
            <label>Email address<input name="email" type="email" autocomplete="email" required [(ngModel)]="email"></label>
            <label>Password<input name="password" type="password" [attr.autocomplete]="signingUp ? 'new-password' : 'current-password'" minlength="6" required [(ngModel)]="password"></label>
            <button class="primary" type="submit" [disabled]="loading">{{ loading ? 'Please wait…' : (signingUp ? 'Create account' : 'Sign in') }}</button>
          </form>
          <button class="text-button" type="button" (click)="signingUp = !signingUp">{{ signingUp ? 'Already registered? Sign in' : 'New here? Create an account' }}</button>
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
        </main>
      } @else {
        <aside class="sidebar">
          <a class="brand" href="#" (click)="$event.preventDefault(); setTab('overview')"><span class="brand-mark small">A</span><span>Business<span class="light">Pilot</span></span></a>
          <p class="nav-label">WORKSPACE</p>
          <button class="nav-item" [class.active]="tab === 'overview'" (click)="setTab('overview')">▦ <span>Overview</span></button>
          <button class="nav-item" [class.active]="tab === 'invoices'" (click)="setTab('invoices')">▤ <span>Sales & invoices</span></button>
          <button class="nav-item" [class.active]="tab === 'products'" (click)="setTab('products')">◇ <span>Products & stock</span></button>
          <button class="nav-item" [class.active]="tab === 'customers'" (click)="setTab('customers')">♧ <span>Customers</span></button>
          <button class="nav-item" [class.active]="tab === 'assistant'" (click)="setTab('assistant')">✧ <span>AI assistant</span></button>
          <div class="sidebar-bottom"><span class="status-dot"></span> Authenticated session<small>Workspace access is checked by the API</small></div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div><p class="eyebrow">YOUR WORKSPACE</p><h1>{{ pageTitle }}</h1></div>
            <div class="user-area"><span>{{ userEmail }}</span><button class="secondary" type="button" (click)="logout()">Sign out</button></div>
          </header>

          @if (error) { <div class="error-banner" role="alert">{{ error }}</div> }
          @if (loading) { <p class="muted">Loading verified workspace data…</p> }

          @if (!business) {
            <section class="panel narrow">
              <p class="eyebrow">GET STARTED</p><h2>Create your first workspace</h2>
              <p class="muted">Your workspace is linked to your verified account. Other users cannot access it without membership.</p>
              <form class="stack" (ngSubmit)="createWorkspace()">
                <label>Business name<input name="businessName" required maxlength="160" [(ngModel)]="businessName"></label>
                <label>Default currency<select name="currency" [(ngModel)]="currencyCode"><option value="EGP">EGP · Egyptian pound</option><option value="USD">USD · US dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · British pound</option><option value="SAR">SAR · Saudi riyal</option><option value="AED">AED · UAE dirham</option></select></label>
                <button class="primary" type="submit" [disabled]="loading">Create workspace</button>
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
                <div><p class="eyebrow light">BUSINESS OVERVIEW</p><h2>Good decisions start with<br>reliable numbers.</h2><p>Showing recorded activity for the last 30 days. Currency totals are kept separate.</p></div>
                <div class="hero-mark" aria-hidden="true">AI</div>
              </section>
              @if (dashboard) {
                <section class="metric-grid">
                  <article class="metric"><span>Invoiced sales</span>@for (item of dashboard.invoiced_sales; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} issued invoices</small> } @if (!dashboard.invoiced_sales.length) { <strong>0</strong><small>No issued sales in this period</small> }</article>
                  <article class="metric"><span>Collected payments</span>@for (item of dashboard.collected_payments; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} payments recorded</small> } @if (!dashboard.collected_payments.length) { <strong>0</strong><small>No recorded payments in this period</small> }</article>
                  <article class="metric"><span>Expenses</span>@for (item of dashboard.expenses; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>{{ item.count }} expenses recorded</small> } @if (!dashboard.expenses.length) { <strong>0</strong><small>No recorded expenses in this period</small> }</article>
                  <article class="metric"><span>Outstanding balances</span>@for (item of dashboard.outstanding_balances; track item.currency_code) { <strong>{{ item.total }} {{ item.currency_code }}</strong><small>Issued invoices less allocations</small> } @if (!dashboard.outstanding_balances.length) { <strong>0</strong><small>No outstanding invoices in this period</small> }</article>
                </section>
              }
              <section class="notice"><strong>Data integrity</strong><span>These totals come from saved business records. They are not a profit calculation and currencies are never combined.</span></section>
              <section class="quick-grid">
                <button class="quick-card" (click)="setTab('customers')"><strong>Customers</strong><span>{{ customers.length }} active records · View directory →</span></button>
                <button class="quick-card" (click)="setTab('products')"><strong>Products</strong><span>{{ products.length }} active records · View catalog →</span></button>
                <button class="quick-card" (click)="setTab('invoices')"><strong>Invoices</strong><span>{{ invoices.length }} records · Manage sales →</span></button>
              </section>
            }

            @if (tab === 'customers') {
              <section class="panel">
                <div class="section-head"><div><h2>Customer directory</h2><p>Records are scoped to the selected workspace.</p></div><span class="count">{{ customers.length }} customers</span></div>
                <form class="inline-form" (ngSubmit)="createCustomer()">
                  <input aria-label="Customer name" name="customerName" placeholder="Customer name" required [(ngModel)]="customerName">
                  <input aria-label="Customer email" name="customerEmail" type="email" placeholder="Email (optional)" [(ngModel)]="customerEmail">
                  <input aria-label="Customer phone" name="customerPhone" placeholder="Phone (optional)" [(ngModel)]="customerPhone">
                  <button class="primary" type="submit" [disabled]="loading">Add customer</button>
                </form>
                <div class="list">
                  @for (customer of customers; track customer.id) { <article class="list-row"><div class="avatar">{{ customer.name.slice(0,1).toUpperCase() }}</div><div class="grow"><strong>{{ customer.name }}</strong><small>{{ customer.email || 'No email' }} · {{ customer.phone || 'No phone' }}</small></div></article> }
                  @if (!customers.length) { <p class="empty">No customers yet. Add your first customer above.</p> }
                </div>
              </section>
            }

            @if (tab === 'products') {
              <section class="panel">
                <div class="section-head"><div><h2>Products & services</h2><p>Prices are stored with exact decimal precision.</p></div><span class="count">{{ products.length }} products</span></div>
                <form class="inline-form" (ngSubmit)="createProduct()">
                  <input aria-label="Product name" name="productName" placeholder="Product name" required [(ngModel)]="productName">
                  <input aria-label="Unit price" name="productPrice" type="number" min="0" step="0.01" placeholder="Unit price" required [(ngModel)]="productPrice">
                  <label class="check"><input name="stockTracked" type="checkbox" [(ngModel)]="stockTracked"> Track stock</label>
                  <button class="primary" type="submit" [disabled]="loading">Add product</button>
                </form>
                <div class="list">
                  @for (product of products; track product.id) { <article class="list-row"><div class="product-mark">◇</div><div class="grow"><strong>{{ product.name }}</strong><small>{{ product.is_stock_tracked ? 'Stock tracked' : 'Service / stock not tracked' }}{{ product.sku ? ' · SKU ' + product.sku : '' }}</small></div><strong>{{ product.unit_price }} {{ business.currency_code }}</strong></article> }
                  @if (!products.length) { <p class="empty">No products yet. Add a product or service above.</p> }
                </div>
              </section>
            }

            @if (tab === 'invoices') {
              <section class="panel">
                <div class="section-head"><div><h2>Sales & invoices</h2><p>Create a draft and issue it when the details are correct.</p></div><span class="count">{{ invoices.length }} invoices</span></div>
                <form class="inline-form invoice-form" (ngSubmit)="createInvoice()">
                  <input name="invoiceNumber" aria-label="Invoice number" placeholder="Invoice number (auto if blank)" maxlength="80" [(ngModel)]="invoiceNumber">
                  <select name="invoiceProduct" aria-label="Product" required [(ngModel)]="invoiceProductId"><option value="" disabled>Select product</option>@for (product of products; track product.id) { <option [value]="product.id">{{ product.name }} · {{ product.unit_price }} {{ business.currency_code }}</option> }</select>
                  <input name="invoiceQuantity" aria-label="Quantity" type="number" min="0.001" step="0.001" required [(ngModel)]="invoiceQuantity">
                  <button class="primary" type="submit" [disabled]="loading || !products.length">{{ editingInvoiceId ? 'Save draft' : 'Create draft' }}</button>
                  @if (editingInvoiceId) { <button class="secondary" type="button" (click)="cancelInvoiceEdit()">Cancel</button> }
                </form>
                <div class="list">
                  @for (invoice of invoices; track invoice.id) { <article class="list-row"><div class="invoice-mark">▤</div><div class="grow"><strong>{{ invoice.invoice_number }}</strong><small>{{ invoice.status }} · {{ invoice.currency_code }}</small></div><strong>{{ invoice.total }} {{ invoice.currency_code }}</strong>@if (invoice.status === 'draft') { <button class="secondary" (click)="editInvoice(invoice)" [disabled]="loading">Edit</button><button class="secondary" (click)="issueInvoice(invoice)" [disabled]="loading">Issue</button><button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">Void</button> } @else if (invoice.status === 'issued') { <button class="secondary danger" (click)="voidInvoice(invoice)" [disabled]="loading">Void</button> }</article> }
                  @if (!invoices.length) { <p class="empty">No invoices yet. Add a product first, then create a draft.</p> }
                </div>
                <p class="footnote">Issuing an invoice deducts tracked stock atomically and fails if stock is insufficient.</p>
              </section>
            }

            @if (tab === 'assistant') {
              <section class="panel chat-panel">
                <div class="section-head"><div><h2>AI Business Assistant</h2><p>Answers grounded in recent records from this workspace only.</p></div><span class="count">Read-only</span></div>
                <div class="chat-log" aria-live="polite">
                  @if (!chatMessages.length) { <p class="empty">Ask about recent issued invoices, recorded expenses, or your customer and product counts.</p> }
                  @for (message of chatMessages; track $index) { <article class="chat-message" [class.user-message]="message.role === 'user'"><span>{{ message.role === 'user' ? 'You' : 'Assistant' }}</span><p>{{ message.content }}</p>@if (message.sources?.length) { <small class="source-list">Sources: @for (source of message.sources; track source.id) { <span>{{ source.type }} · {{ source.invoice_number || source.category || source.id }}</span> }</small> }</article> }
                </div>
                <form class="chat-form" (ngSubmit)="sendChat()"><textarea name="chatMessage" rows="2" maxlength="2000" placeholder="Ask a question about your business…" required [(ngModel)]="chatDraft"></textarea><button class="primary" type="submit" [disabled]="loading || !chatDraft.trim()">Send</button></form>
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
    .brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:0 7px 38px}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#a7f3d0;color:#064e3b;font-size:21px;font-weight:900;margin-bottom:20px}.brand-mark.small{width:34px;height:34px;border-radius:11px;margin:0;font-size:16px}.light{font-weight:400;color:#9ca3af;margin-left:4px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:800;color:#6b7280;margin:0 0 8px}.nav-label{font-size:10px;color:#9ca3af;letter-spacing:1.5px;padding:0 10px}.nav-item{display:flex;align-items:center;gap:12px;border:0;background:transparent;color:#9ca3af;text-align:left;padding:12px;border-radius:10px;margin:3px 0;font-size:14px}.nav-item.active{background:#263448;color:#fff}.sidebar-bottom{margin-top:auto;border-top:1px solid #293548;padding:18px 8px 0;font-size:11px}.sidebar-bottom small{display:block;color:#9ca3af;margin:8px 0 0 15px;line-height:1.5}.status-dot{display:inline-block;width:7px;height:7px;background:#34d399;border-radius:50%;margin-right:8px}
    .main{margin-left:245px;padding:30px clamp(18px,4vw,54px) 20px;max-width:1550px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:0}.user-area{display:flex;align-items:center;gap:12px;font-size:12px;color:#4b5563}.secondary,.primary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:#fff;color:#374151}.primary{background:#0f766e;border-color:#0f766e;color:#fff}.primary:hover{background:#115e59}.workspace-bar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px 17px;background:#fff;border:1px solid #e5e7eb;border-radius:13px;margin-bottom:18px}.workspace-bar strong{display:block;font-size:14px}.workspace-bar select{max-width:260px}.hero{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:30px 34px;border-radius:19px;background:linear-gradient(115deg,#14243a,#1e3a5f 60%,#155e75);color:#fff}.hero .eyebrow{color:#a7f3d0}.hero h2{font-size:clamp(25px,3vw,36px);line-height:1.12;letter-spacing:-1px;margin:10px 0}.hero p:last-child{max-width:460px;font-size:12px;line-height:1.6;color:#cbd5e1}.hero-mark{width:84px;height:84px;display:grid;place-items:center;border-radius:26px;background:linear-gradient(135deg,#a7f3d0,#60a5fa);color:#0f2942;font-weight:900;font-size:24px;margin-right:4%;box-shadow:0 15px 45px #02061755}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.metric,.panel,.quick-card{background:#fff;border:1px solid #e5eaf1;border-radius:14px}.metric{padding:17px;min-height:125px}.metric>span{display:block;color:#6b7280;font-size:11px;margin-bottom:13px}.metric strong{display:block;font-size:19px;letter-spacing:-.5px;overflow-wrap:anywhere}.metric small{display:block;font-size:10px;color:#9ca3af;margin-top:6px}.notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}.notice strong{white-space:nowrap}.quick-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:15px}.quick-card{text-align:left;padding:18px}.quick-card strong,.quick-card span{display:block}.quick-card strong{font-size:13px;margin-bottom:8px}.quick-card span{font-size:11px;color:#6b7280}
    .panel{padding:22px;margin-top:4px}.panel.narrow{max-width:650px;margin:50px auto}.panel h2{font-size:20px;margin:0 0 8px}.muted{font-size:12px;color:#6b7280;line-height:1.7}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{font-size:18px;margin:0 0 6px}.section-head p{font-size:11px;color:#6b7280;margin:0}.count{font-size:10px;font-weight:700;color:#0f766e;background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}.inline-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:9px;padding:14px;background:#f8fafc;border:1px solid #edf0f5;border-radius:11px}.invoice-form{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 100px auto auto}.danger{color:#b91c1c;border-color:#fecaca}.stack{display:grid;gap:14px;margin-top:20px}.stack label{display:grid;gap:7px;font-size:12px;font-weight:700;color:#374151}.input, input,select,textarea{min-width:0;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:11px 12px;font-size:12px;color:#111827}.check{display:flex;align-items:center;gap:7px;font-size:11px;white-space:nowrap}.check input{min-width:auto}.list{margin-top:14px}.list-row{display:flex;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5}.list-row:last-child{border-bottom:0}.avatar,.product-mark,.invoice-mark{width:36px;height:36px;border-radius:11px;background:#eff6ff;color:#1d4ed8;display:grid;place-items:center;font-weight:800;font-size:13px;flex-shrink:0}.product-mark{background:#ecfdf5;color:#047857;font-size:20px}.invoice-mark{background:#f5f3ff;color:#6d28d9}.grow{flex:1;min-width:0}.list-row strong{font-size:12px;overflow-wrap:anywhere}.list-row small{display:block;color:#6b7280;font-size:10px;margin-top:5px;overflow-wrap:anywhere}.empty{padding:20px;text-align:center;color:#9ca3af;font-size:12px}.footnote{font-size:10px;line-height:1.6;color:#9ca3af;margin:15px 0 0}.chat-log{min-height:180px;max-height:440px;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}.chat-message.user-message{margin-left:auto;background:#e0f2fe}.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;font-weight:800}.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}.source-list{display:block;color:#0f766e;font-size:10px;line-height:1.7;margin-top:8px}.source-list span{display:inline-block;margin-right:9px}.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}.chat-form textarea{resize:vertical}.error,.error-banner{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:12px;line-height:1.6}.error-banner{margin-bottom:14px}.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}.setup-card h1,.auth-card h1{font-size:28px;letter-spacing:-.8px;margin:8px 0}.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:#6b7280;line-height:1.7}.setup-steps{background:#f8fafc;border-radius:12px;padding:14px;margin-top:20px}.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}.setup-steps code{font-size:10px;overflow-wrap:anywhere}.text-button{border:0;background:transparent;color:#0f766e;font-size:11px;font-weight:700;padding:15px 0 0}.auth-card .primary{margin-top:3px}footer{display:flex;justify-content:space-between;gap:12px;margin-top:26px;padding-top:15px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10px}footer span{color:#9ca3af}
    @media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form{grid-template-columns:repeat(2,minmax(0,1fr))}.inline-form .primary{grid-column:1/-1}}@media(max-width:760px){.sidebar{position:static;width:auto;min-height:auto;padding:13px 15px;display:flex;flex-direction:row;align-items:center;gap:6px;overflow-x:auto}.brand{padding:0 10px 0 0;flex-shrink:0}.brand>span:last-child,.nav-label,.sidebar-bottom{display:none}.nav-item{padding:9px;font-size:0;white-space:nowrap}.nav-item span{display:none}.main{margin:0;padding:20px 14px}.topbar h1{font-size:21px}.user-area>span{display:none}.hero{padding:24px}.hero-mark{display:none}.quick-grid{grid-template-columns:1fr}.workspace-bar{align-items:flex-start;flex-direction:column}.workspace-bar select{max-width:none;width:100%}.section-head{align-items:flex-start}.list-row{flex-wrap:wrap}.metric-grid{gap:8px}.metric{padding:13px}.metric strong{font-size:16px}.inline-form,.invoice-form{grid-template-columns:1fr}.inline-form .primary{grid-column:auto}.panel{padding:15px}.notice{flex-direction:column}.notice strong{white-space:normal}footer{flex-direction:column}}
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
  chatDraft = '';
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources'] }> = [];

  constructor(private readonly auth: AuthService, private readonly api: ApiService) {}

  ngOnInit(): void {
    void this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    try {
      const config = await this.auth.getRuntimeConfig();
      this.setupNeeded = !config.apiBaseUrl?.trim() ||
        !config.firebase?.apiKey || !config.firebase?.authDomain ||
        !config.firebase?.projectId || !config.firebase?.appId;
      if (this.setupNeeded) return;
      const user = await this.auth.currentUser();
      if (user) {
        this.signedIn = true;
        this.userEmail = user.email || 'Signed-in user';
        await this.loadBusinesses();
      }
    } catch (error) {
      this.error = this.message(error);
    }
  }

  get pageTitle(): string {
    const titles: Record<Tab, string> = {
      overview: 'Business overview', customers: 'Customers',
      products: 'Products & stock', invoices: 'Sales & invoices',
      assistant: 'AI Business Assistant'
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
      this.userEmail = user.email || 'Signed-in user';
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
      const [dashboard, customers, products, invoices] = await Promise.all([
        this.api.dashboard(id), this.api.customers(id), this.api.products(id), this.api.invoices(id)
      ]);
      if (this.business?.id !== id) return;
      this.dashboard = dashboard;
      this.customers = customers;
      this.products = products;
      this.invoices = invoices;
      if (!this.invoiceProductId && products.length) this.invoiceProductId = products[0].id;
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
        throw new Error('The quick editor supports one product line. This invoice was left unchanged.');
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
      `Void invoice ${invoice.invoice_number}? Issued invoices with allocated payments cannot be voided; use a refund/credit-note workflow.`
    )) return;
    this.loading = true;
    this.error = '';
    try {
      await this.api.voidInvoice(this.business.id, invoice.id, 'Voided by an authorized workspace user');
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

  async sendChat(): Promise<void> {
    if (!this.business || !this.chatDraft.trim()) return;
    const question = this.chatDraft.trim();
    const history = this.chatMessages.slice(-8);
    this.chatMessages = [...this.chatMessages, { role: 'user', content: question }];
    this.chatDraft = '';
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
      'auth/email-already-in-use': 'This email already has an account. Sign in instead, or use a different email.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Choose a stronger password with at least 6 characters.',
      'auth/operation-not-allowed': 'Email/password sign-up is disabled in Firebase Authentication. Enable the Email/Password provider in Firebase Console.',
      'auth/unauthorized-domain': 'This website domain is not authorized in Firebase Authentication. Add ai-business-assistant-web.vercel.app to Authorized domains.',
      'auth/network-request-failed': 'Could not reach Firebase Authentication. Check the internet connection and Firebase API key restrictions, then try again.',
      'auth/too-many-requests': 'Firebase temporarily blocked repeated attempts. Wait a little and try again.'
    };
    if (code && authMessages[code]) return authMessages[code];
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'The request could not reach a service. Check your connection. If account creation succeeded, switch to Sign in before trying again; otherwise verify Firebase Authentication and API/CORS settings.';
    }
    if (message) return message;
    return 'An unexpected error occurred. Please try again.';
  }
}
