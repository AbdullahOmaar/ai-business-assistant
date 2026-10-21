import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Metric = {
  label: string;
  value: string;
  note: string;
  trend: string;
  icon: string;
};

type Activity = {
  title: string;
  detail: string;
  amount: string;
  time: string;
  kind: 'sale' | 'payment' | 'expense' | 'stock';
};

@Component({
  selector: 'aba-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="app-shell">
      <aside class="sidebar" [class.sidebar-open]="mobileMenuOpen">
        <a class="brand" href="#" (click)="$event.preventDefault(); setSection('Overview')">
          <span class="brand-mark">A<span>·</span></span>
          <span class="brand-copy"><strong>daybook</strong><small>AI BUSINESS ASSISTANT</small></span>
        </a>

        <div class="workspace-label">WORKSPACE</div>
        <button class="workspace-switch" type="button" (click)="workspaceNotice = !workspaceNotice">
          <span class="workspace-avatar">S</span>
          <span class="workspace-name"><strong>Sample business</strong><small>Local preview</small></span>
          <span class="chevron">⌄</span>
        </button>
        <p class="workspace-hint" *ngIf="workspaceNotice">Workspace switching will be connected after secure sign-in is implemented.</p>

        <nav aria-label="Main navigation">
          <div class="nav-group-label">MANAGE</div>
          <button *ngFor="let item of primaryNav" class="nav-item" [class.active]="activeSection === item.label"
            type="button" (click)="setSection(item.label)">
            <span class="nav-icon">{{ item.icon }}</span><span>{{ item.label }}</span>
            <span *ngIf="item.label === 'Invoices'" class="nav-count">3</span>
          </button>
          <div class="nav-group-label nav-spaced">OPERATIONS</div>
          <button *ngFor="let item of operationsNav" class="nav-item" [class.active]="activeSection === item.label"
            type="button" (click)="setSection(item.label)">
            <span class="nav-icon">{{ item.icon }}</span><span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="sidebar-bottom">
          <div class="preview-note"><span class="preview-dot"></span><span><strong>Preview mode</strong><small>No live business data</small></span></div>
          <button class="profile-button" type="button" (click)="setSection('Settings')">
            <span class="profile-avatar">O</span><span><strong>Business owner</strong><small>Settings & preferences</small></span><span class="profile-more">···</span>
          </button>
        </div>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <button class="mobile-menu" type="button" aria-label="Toggle navigation" (click)="mobileMenuOpen = !mobileMenuOpen">☰</button>
          <div class="breadcrumbs"><span>Workspace</span><span class="crumb-slash">/</span><strong>{{ activeSection }}</strong></div>
          <div class="topbar-actions">
            <label class="search-box"><span>⌕</span><input [(ngModel)]="searchTerm" aria-label="Search activity" placeholder="Search activity..." /></label>
            <button class="icon-button" type="button" aria-label="Notifications" (click)="showNotifications = !showNotifications">♧<i></i></button>
            <span class="top-avatar">O</span>
          </div>
        </header>

        <div class="content">
          <div class="preview-banner"><span class="banner-icon">i</span><span><strong>Preview workspace</strong> — these are sample figures, not connected to a database.</span><button type="button" (click)="dismissBanner()" aria-label="Dismiss preview notice">×</button></div>

          <section *ngIf="activeSection === 'Overview'; else placeholderSection">
            <div class="page-heading">
              <div><div class="eyebrow">TUESDAY, OCTOBER 21</div><h1>Good afternoon.</h1><p>Here’s what’s happening with your business today.</p></div>
              <div class="heading-actions"><button class="button-secondary" type="button" (click)="exportPreview()">↓ <span>Export report</span></button><button class="button-primary" type="button" (click)="setSection('Invoices')"><span>＋</span> New invoice</button></div>
            </div>

            <div class="date-row"><div class="date-pills"><button *ngFor="let range of dateRanges" type="button" [class.selected]="selectedRange === range" (click)="selectedRange = range">{{ range }}</button></div><span class="last-updated"><span class="live-dot"></span> Sample data · not live</span></div>

            <div class="metric-grid">
              <article class="metric-card" *ngFor="let metric of metrics">
                <div class="metric-top"><span>{{ metric.label }}</span><span class="metric-icon">{{ metric.icon }}</span></div>
                <div class="metric-value">{{ metric.value }}</div>
                <div class="metric-foot"><span class="metric-trend">{{ metric.trend }}</span><span>{{ metric.note }}</span></div>
              </article>
            </div>

            <div class="dashboard-grid">
              <section class="panel revenue-panel">
                <div class="panel-heading"><div><h2>Revenue overview</h2><p>Recorded sales and payments at a glance</p></div><button class="subtle-button" type="button" (click)="setSection('Reports')">View report ↗</button></div>
                <div class="chart-legend"><span><i class="legend-sales"></i> Invoiced sales</span><span><i class="legend-payments"></i> Payments collected</span></div>
                <div class="chart-wrap" role="img" aria-label="Illustrative bar chart comparing sample invoiced sales and collected payments over six months">
                  <div class="chart-y"><span>12k</span><span>9k</span><span>6k</span><span>3k</span><span>0</span></div>
                  <div class="chart-bars">
                    <div class="chart-row" *ngFor="let month of chartMonths"><div class="bar-pair"><span class="bar sales-bar" [style.height.%]="month.sales"></span><span class="bar payments-bar" [style.height.%]="month.payments"></span></div><span class="month-label">{{ month.label }}</span></div>
                  </div>
                </div>
                <div class="chart-foot"><span><b></b> Demo visualization only</span><span>Currency: EGP</span></div>
              </section>

              <section class="panel attention-panel">
                <div class="panel-heading"><div><h2>Needs attention</h2><p>Items to review soon</p></div><span class="attention-count">3</span></div>
                <button class="attention-item" type="button" (click)="setSection('Invoices')"><span class="attention-symbol amber">₤</span><span class="attention-copy"><strong>3 invoices overdue</strong><small>Review outstanding balances</small></span><span class="item-arrow">›</span></button>
                <button class="attention-item" type="button" (click)="setSection('Inventory')"><span class="attention-symbol coral">▤</span><span class="attention-copy"><strong>2 items low in stock</strong><small>Check inventory levels</small></span><span class="item-arrow">›</span></button>
                <button class="attention-item" type="button" (click)="setSection('Expenses')"><span class="attention-symbol blue">↗</span><span class="attention-copy"><strong>Expense review</strong><small>1 item needs a category</small></span><span class="item-arrow">›</span></button>
                <div class="attention-footer">Alerts are illustrative until business data is connected.</div>
              </section>
            </div>

            <section class="panel activity-panel">
              <div class="panel-heading"><div><h2>Recent activity</h2><p>A quick look at your latest business records</p></div><button class="subtle-button" type="button" (click)="setSection('Reports')">View all activity ↗</button></div>
              <div class="activity-table-wrap">
                <table>
                  <thead><tr><th>ACTIVITY</th><th>TYPE</th><th>DATE</th><th class="amount-cell">AMOUNT</th><th></th></tr></thead>
                  <tbody>
                    <tr *ngFor="let activity of filteredActivities">
                      <td><div class="activity-title"><span class="activity-avatar" [ngClass]="activity.kind">{{ activity.kind === 'sale' ? '↗' : activity.kind === 'payment' ? '↓' : activity.kind === 'expense' ? '−' : '▦' }}</span><span><strong>{{ activity.title }}</strong><small>{{ activity.detail }}</small></span></div></td>
                      <td><span class="type-pill" [ngClass]="activity.kind">{{ activity.kind }}</span></td>
                      <td class="activity-time">{{ activity.time }}</td>
                      <td class="amount-cell" [class.positive]="activity.kind === 'payment' || activity.kind === 'sale'">{{ activity.amount }}</td>
                      <td><button class="row-more" type="button" aria-label="Open activity" (click)="setSection(activity.kind === 'stock' ? 'Inventory' : activity.kind === 'expense' ? 'Expenses' : activity.kind === 'payment' ? 'Payments' : 'Invoices')">↗</button></td>
                    </tr>
                    <tr *ngIf="filteredActivities.length === 0"><td colspan="5" class="empty-state">No sample activity matches “{{ searchTerm }}”.</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="table-footer"><span>Showing {{ filteredActivities.length }} sample records</span><button type="button" (click)="searchTerm = ''">Clear search</button></div>
            </section>

            <section class="assistant-card">
              <div class="assistant-spark">✳</div><div class="assistant-copy"><span class="eyebrow">YOUR BUSINESS, MADE CLEARER</span><h2>Ask your business assistant</h2><p>Once connected, get clear answers from your records — with calculations and context you can verify.</p></div><button class="button-light" type="button" (click)="setSection('AI Assistant')">Explore assistant <span>→</span></button>
            </section>
          </section>

          <ng-template #placeholderSection>
            <section class="placeholder-page">
              <div class="page-heading"><div><div class="eyebrow">WORKSPACE</div><h1>{{ activeSection }}</h1><p>{{ sectionDescription }}</p></div><button class="button-secondary" type="button" (click)="setSection('Overview')">← Back to overview</button></div>
              <div class="placeholder-card"><div class="placeholder-icon">{{ sectionIcon }}</div><h2>{{ activeSection }} is not connected yet</h2><p>This navigation and layout are part of the frontend foundation. The next step is to connect a validated API after authentication and business-level permissions are implemented.</p><span class="status-chip"><i></i> UI foundation only</span></div>
            </section>
          </ng-template>

          <div class="notification-popover" *ngIf="showNotifications"><strong>You're all caught up</strong><p>Notifications will appear here when the backend queue and delivery worker are connected.</p><button type="button" (click)="showNotifications = false">Close</button></div>
          <footer class="page-footer"><span>daybook <span>·</span> AI Business Assistant</span><span>Local preview · No live data connected</span></footer>
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host { display:block; min-height:100vh; color:#182421; }
    .app-shell { min-height:100vh; display:flex; background:#f7f8f6; }
    .sidebar { width:248px; flex:0 0 248px; background:#14211f; color:#eaf0eb; display:flex; flex-direction:column; padding:24px 14px 16px; position:relative; z-index:5; }
    .brand { display:flex; align-items:center; gap:11px; padding:0 10px 30px; color:inherit; text-decoration:none; }
    .brand-mark { width:34px; height:34px; border-radius:11px; display:grid; place-items:center; background:#d7f16b; color:#17251f; font-size:22px; font-weight:800; letter-spacing:-2px; }
    .brand-mark span { color:#668638; }
    .brand-copy { display:flex; flex-direction:column; gap:3px; }
    .brand-copy strong { font-size:18px; line-height:1; letter-spacing:-.7px; }
    .brand-copy small { color:#91a39b; font-size:8px; letter-spacing:1.25px; font-weight:700; }
    .workspace-label,.nav-group-label { color:#81928a; font-size:9px; letter-spacing:1.4px; font-weight:800; padding:0 12px 9px; }
    .workspace-switch { display:flex; align-items:center; gap:9px; border:1px solid #354640; border-radius:10px; background:#1d2d28; color:inherit; padding:9px; text-align:left; width:100%; cursor:pointer; }
    .workspace-avatar,.profile-avatar { display:grid; place-items:center; flex:0 0 30px; width:30px; height:30px; border-radius:8px; background:#d9edc7; color:#263e31; font-weight:800; }
    .workspace-name,.profile-button>span:nth-child(2) { min-width:0; display:flex; flex:1; flex-direction:column; gap:4px; }
    .workspace-name strong,.profile-button strong { font-size:11px; font-weight:700; }
    .workspace-name small,.profile-button small { font-size:10px; color:#9aaba3; }
    .chevron { color:#a2b0a9; margin-left:auto; }
    .workspace-hint { margin:8px 6px 0; color:#d4e1d9; background:#263a33; border-radius:8px; padding:10px; font-size:10px; line-height:1.5; }
    nav { padding-top:27px; }
    .nav-group-label { padding-bottom:8px; }
    .nav-item { width:100%; display:flex; align-items:center; gap:11px; padding:10px 12px; margin:2px 0; border:0; border-radius:8px; color:#aab8b1; background:transparent; font-size:12px; text-align:left; cursor:pointer; transition:background .16s,color .16s; }
    .nav-item:hover { background:#20312b; color:#fff; }
    .nav-item.active { background:#d9efb5; color:#1a2a22; font-weight:750; }
    .nav-icon { width:18px; text-align:center; font-size:15px; opacity:.95; }
    .nav-count { margin-left:auto; background:#31463b; color:#d6e2d9; border-radius:6px; padding:2px 6px; font-size:9px; }
    .nav-item.active .nav-count { background:#b8d78d; color:#253825; }
    .nav-spaced { padding-top:23px; }
    .sidebar-bottom { margin-top:auto; }
    .preview-note { display:flex; align-items:center; gap:9px; margin:15px 4px; padding:11px 10px; background:#1c2d27; border:1px solid #2a3b34; border-radius:9px; }
    .preview-dot,.live-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:#d8ed87; }
    .preview-note span:last-child { display:flex; flex-direction:column; gap:4px; }
    .preview-note strong { font-size:10px; }
    .preview-note small { font-size:9px; color:#8fa49a; }
    .profile-button { display:flex; align-items:center; gap:9px; width:100%; padding:14px 5px 0; border:0; border-top:1px solid #304039; background:none; color:#edf3ef; text-align:left; cursor:pointer; }
    .profile-avatar { background:#edcbb5; }
    .profile-button strong { font-size:10px; }
    .profile-button small { font-size:9px; }
    .profile-more { font-size:20px; color:#9aaba3; }
    .main-area { min-width:0; flex:1; }
    .topbar { height:68px; display:flex; align-items:center; justify-content:space-between; padding:0 36px; background:#fff; border-bottom:1px solid #e9ece8; }
    .breadcrumbs { display:flex; align-items:center; gap:11px; color:#84908a; font-size:11px; }
    .breadcrumbs strong { color:#293b34; font-weight:750; }
    .crumb-slash { color:#d3d9d3; }
    .topbar-actions { display:flex; align-items:center; gap:15px; }
    .search-box { display:flex; align-items:center; gap:9px; width:220px; border:1px solid #e7eae6; background:#fafbf9; border-radius:8px; padding:8px 10px; color:#829089; }
    .search-box>span { font-size:20px; line-height:12px; }
    .search-box input { border:0; outline:0; min-width:0; width:100%; background:transparent; color:#27372f; font:inherit; font-size:11px; }
    .icon-button { width:32px; height:32px; border:1px solid #e8ece7; background:#fff; color:#4c5c54; border-radius:9px; position:relative; font-size:17px; cursor:pointer; }
    .icon-button i { position:absolute; top:6px; right:6px; width:5px; height:5px; background:#e6a467; border-radius:50%; }
    .top-avatar { display:grid; place-items:center; width:30px; height:30px; background:#f0d8c8; color:#6a4530; border-radius:50%; font-size:11px; font-weight:800; }
    .mobile-menu { display:none; border:0; background:transparent; font-size:20px; color:#25362e; }
    .content { max-width:1540px; margin:0 auto; padding:22px 36px 20px; position:relative; }
    .preview-banner { display:flex; align-items:center; gap:9px; border:1px solid #e8e7d7; border-radius:8px; background:#fffdf2; color:#6d6b54; padding:10px 12px; font-size:10px; }
    .preview-banner strong { color:#4f523d; }
    .banner-icon { display:grid; place-items:center; flex:0 0 17px; width:17px; height:17px; border:1px solid #c7c49e; border-radius:50%; font-size:10px; font-weight:800; }
    .preview-banner button { margin-left:auto; border:0; background:transparent; color:#88856a; font-size:18px; cursor:pointer; }
    .page-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin:29px 0 20px; }
    .eyebrow { color:#8b978f; font-size:9px; letter-spacing:1.4px; font-weight:800; }
    h1 { margin:8px 0 6px; font-size:30px; line-height:1.1; letter-spacing:-1.4px; font-weight:750; color:#1b2b24; }
    .page-heading p { margin:0; color:#89938d; font-size:12px; }
    .heading-actions { display:flex; gap:9px; }
    .button-primary,.button-secondary,.button-light { display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:8px; padding:10px 13px; font:inherit; font-size:11px; font-weight:750; cursor:pointer; }
    .button-primary { background:#1d382c; border:1px solid #1d382c; color:white; box-shadow:0 2px 3px #18271d12; }
    .button-primary:hover { background:#294b3a; }
    .button-secondary { background:#fff; border:1px solid #e2e7e1; color:#35483d; }
    .button-secondary:hover { background:#f6f8f4; }
    .date-row { display:flex; align-items:center; justify-content:space-between; gap:15px; margin:24px 0 12px; }
    .date-pills { display:flex; gap:3px; padding:3px; border-radius:8px; background:#edf0eb; }
    .date-pills button { border:0; border-radius:6px; padding:7px 11px; color:#7c8880; background:transparent; font:inherit; font-size:10px; cursor:pointer; }
    .date-pills button.selected { background:#fff; color:#23362b; box-shadow:0 1px 3px #17291c12; font-weight:750; }
    .last-updated { display:flex; align-items:center; gap:7px; color:#8c9790; font-size:9px; }
    .last-updated .live-dot { width:6px; height:6px; background:#a8b4aa; }
    .metric-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:13px; }
    .metric-card { min-width:0; background:#fff; border:1px solid #e9ede8; border-radius:11px; padding:17px 17px 15px; box-shadow:0 3px 10px #1c32200a; }
    .metric-top { display:flex; align-items:center; justify-content:space-between; color:#7d8981; font-size:10px; font-weight:650; gap:5px; }
    .metric-icon { display:grid; place-items:center; width:29px; height:29px; border-radius:9px; background:#f0f5e9; color:#4f7043; font-size:15px; }
    .metric-card:nth-child(2) .metric-icon { background:#e8f3ef; color:#367b62; }
    .metric-card:nth-child(3) .metric-icon { background:#fff3e6; color:#b27b42; }
    .metric-card:nth-child(4) .metric-icon { background:#f0edfa; color:#8170b4; }
    .metric-value { margin:14px 0 9px; color:#1e3027; font-size:27px; letter-spacing:-1.1px; font-weight:800; white-space:nowrap; }
    .metric-foot { display:flex; flex-wrap:wrap; align-items:center; gap:5px; color:#9aa39c; font-size:9px; }
    .metric-trend { color:#438463; font-weight:800; }
    .dashboard-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(300px,1fr); gap:14px; margin-top:15px; }
    .panel { min-width:0; background:#fff; border:1px solid #e8ece7; border-radius:11px; box-shadow:0 3px 10px #1c322008; }
    .panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:18px 19px 0; }
    .panel-heading h2,.assistant-copy h2 { margin:0; font-size:13px; font-weight:800; letter-spacing:-.2px; color:#24372d; }
    .panel-heading p { margin:5px 0 0; color:#9aa49d; font-size:9px; }
    .subtle-button { border:0; background:transparent; color:#718c74; font:inherit; font-size:10px; font-weight:750; cursor:pointer; padding:3px 0; white-space:nowrap; }
    .chart-legend { display:flex; gap:15px; padding:20px 20px 0; color:#86918a; font-size:9px; }
    .chart-legend span { display:flex; align-items:center; gap:6px; }
    .chart-legend i { display:inline-block; width:7px; height:7px; border-radius:2px; }
    .legend-sales { background:#c4d99b; }.legend-payments { background:#4d927a; }
    .chart-wrap { display:flex; height:174px; padding:12px 20px 0 12px; }
    .chart-y { width:30px; display:flex; flex-direction:column; justify-content:space-between; align-items:flex-end; padding:0 7px 23px 0; color:#a6afa9; font-size:8px; }
    .chart-bars { display:flex; flex:1; justify-content:space-around; align-items:stretch; min-width:0; background:repeating-linear-gradient(to bottom,transparent 0,transparent 32px,#edf0ec 33px,#edf0ec 34px); }
    .chart-row { display:flex; flex-direction:column; justify-content:flex-end; align-items:center; width:13%; height:100%; }
    .bar-pair { height:calc(100% - 23px); display:flex; align-items:flex-end; gap:4px; }
    .bar { display:block; width:11px; min-height:3px; border-radius:3px 3px 0 0; }
    .sales-bar { background:#c5dba0; }.payments-bar { background:#4f927a; }
    .month-label { margin-top:9px; color:#929d95; font-size:8px; }
    .chart-foot { display:flex; justify-content:space-between; padding:10px 19px 13px; border-top:1px solid #f0f2ef; color:#a0a9a2; font-size:8px; }
    .chart-foot span:first-child { display:flex; align-items:center; gap:5px; }.chart-foot b { width:5px; height:5px; background:#b9c8b5; border-radius:50%; }
    .attention-count { display:grid; place-items:center; width:22px; height:22px; border-radius:7px; background:#fff1dd; color:#a66d2e; font-size:10px; font-weight:800; }
    .attention-item { display:flex; align-items:center; width:calc(100% - 36px); gap:10px; margin:0 18px; padding:16px 0; border:0; border-bottom:1px solid #f0f2ef; background:transparent; text-align:left; cursor:pointer; }
    .attention-item:first-of-type { margin-top:9px; }
    .attention-symbol { display:grid; place-items:center; width:32px; height:32px; flex:0 0 32px; border-radius:9px; font-size:14px; }
    .attention-symbol.amber { background:#fff4e5; color:#b77b3b; }.attention-symbol.coral { background:#ffeded; color:#c66f65; }.attention-symbol.blue { background:#eaf1fb; color:#6489b7; }
    .attention-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:5px; }
    .attention-copy strong { color:#405047; font-size:10px; font-weight:750; }
    .attention-copy small { color:#9aa49d; font-size:9px; }
    .item-arrow { color:#a5aea8; font-size:19px; }
    .attention-footer { padding:13px 18px; color:#a0aaa2; font-size:8px; line-height:1.5; }
    .activity-panel { margin-top:15px; }
    .activity-table-wrap { overflow-x:auto; margin-top:15px; }
    table { border-collapse:collapse; width:100%; min-width:570px; }
    thead { background:#fafbf9; border-top:1px solid #f0f2ef; border-bottom:1px solid #edf0ec; }
    th { padding:11px 18px; text-align:left; color:#9ba69e; font-size:8px; letter-spacing:.7px; font-weight:800; }
    td { padding:12px 18px; border-bottom:1px solid #f1f3f0; color:#718078; font-size:10px; }
    tbody tr:last-child td { border-bottom:0; }
    .activity-title { display:flex; align-items:center; gap:10px; }
    .activity-avatar { display:grid; place-items:center; width:29px; height:29px; flex:0 0 29px; border-radius:8px; font-size:13px; }
    .activity-avatar.sale { background:#eaf4e0; color:#608a49; }.activity-avatar.payment { background:#e7f4ee; color:#40836a; }.activity-avatar.expense { background:#fff1e6; color:#b87e49; }.activity-avatar.stock { background:#efedfa; color:#887bb7; }
    .activity-title>span:last-child { display:flex; flex-direction:column; gap:4px; }
    .activity-title strong { color:#384a40; font-size:10px; font-weight:750; }
    .activity-title small { color:#a1aaa4; font-size:9px; }
    .type-pill { display:inline-block; border-radius:5px; padding:4px 7px; background:#f1f3f0; color:#748178; font-size:8px; text-transform:capitalize; }
    .type-pill.sale,.type-pill.payment { background:#eaf4e9; color:#578062; }.type-pill.expense { background:#fff2e6; color:#a97646; }.type-pill.stock { background:#f0eef9; color:#8073ae; }
    .activity-time { white-space:nowrap; color:#98a39b; }
    .amount-cell { text-align:right; white-space:nowrap; font-weight:750; color:#5e6b63; }
    .amount-cell.positive { color:#448263; }
    th.amount-cell { text-align:right; }
    .row-more { border:0; background:transparent; color:#9ca79f; cursor:pointer; font-size:14px; }
    .empty-state { text-align:center; padding:28px; color:#8b978f; }
    .table-footer { display:flex; justify-content:space-between; padding:12px 18px; border-top:1px solid #f0f2ef; color:#a1aaa3; font-size:9px; }
    .table-footer button { border:0; background:transparent; color:#6e8a72; font:inherit; font-weight:750; cursor:pointer; }
    .assistant-card { display:flex; align-items:center; gap:17px; margin-top:15px; padding:20px 22px; border-radius:11px; background:#e9f0df; border:1px solid #dfe8d2; }
    .assistant-spark { display:grid; place-items:center; flex:0 0 39px; width:39px; height:39px; border-radius:12px; background:#d4e4b6; color:#526d3e; font-size:21px; }
    .assistant-copy { flex:1; min-width:0; }
    .assistant-copy .eyebrow { color:#7c9168; font-size:8px; }
    .assistant-copy h2 { margin:6px 0; font-size:13px; }
    .assistant-copy p { margin:0; max-width:600px; color:#788771; font-size:10px; line-height:1.6; }
    .button-light { background:#fff; color:#435d39; border:1px solid #dce6d2; white-space:nowrap; }
    .page-footer { display:flex; justify-content:space-between; gap:15px; margin-top:26px; color:#a2aaa4; font-size:9px; }
    .page-footer span span { color:#b6c5a1; }
    .placeholder-page { min-height:65vh; }
    .placeholder-card { display:flex; align-items:center; flex-direction:column; max-width:560px; margin:50px auto; padding:45px 36px; background:#fff; border:1px solid #e8ece7; border-radius:14px; text-align:center; box-shadow:0 8px 35px #1d30200b; }
    .placeholder-icon { display:grid; place-items:center; width:52px; height:52px; border-radius:15px; background:#edf3e5; color:#668052; font-size:23px; }
    .placeholder-card h2 { margin:20px 0 8px; font-size:18px; color:#26382e; }
    .placeholder-card p { margin:0; max-width:420px; color:#89958d; font-size:12px; line-height:1.7; }
    .status-chip { display:inline-flex; align-items:center; gap:6px; margin-top:22px; border-radius:20px; padding:7px 10px; background:#f2f5ef; color:#71846b; font-size:9px; font-weight:750; }
    .status-chip i { width:5px; height:5px; background:#a4bd83; border-radius:50%; }
    .notification-popover { position:absolute; z-index:10; top:61px; right:70px; width:250px; padding:17px; border:1px solid #e5eae3; border-radius:10px; background:#fff; box-shadow:0 10px 35px #172b1c18; }
    .notification-popover strong { font-size:12px; }.notification-popover p { color:#89958d; font-size:10px; line-height:1.6; }.notification-popover button { border:0; background:transparent; color:#66836b; font-size:10px; font-weight:750; cursor:pointer; }
    @media (max-width:1180px) { .sidebar { width:220px; flex-basis:220px; }.topbar { padding:0 24px; }.content { padding:20px 24px; }.metric-card { padding:15px 12px; }.metric-value { font-size:23px; }.dashboard-grid { grid-template-columns:minmax(0,1.25fr) minmax(280px,1fr); } }
    @media (max-width:920px) { .sidebar { position:fixed; top:0; bottom:0; left:0; transform:translateX(-100%); transition:transform .2s ease; box-shadow:10px 0 30px #12271b18; }.sidebar.sidebar-open { transform:translateX(0); }.mobile-menu { display:block; }.topbar { gap:12px; padding:0 18px; }.breadcrumbs { margin-right:auto; }.search-box { width:180px; }.content { padding:18px; }.metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.dashboard-grid { grid-template-columns:1fr; } }
    @media (max-width:580px) { .topbar { height:60px; padding:0 13px; }.topbar-actions { gap:8px; }.search-box { width:34px; padding:8px; }.search-box input { display:none; }.search-box:focus-within { position:absolute; left:12px; right:100px; width:auto; background:#fff; z-index:3; }.search-box:focus-within input { display:block; }.content { padding:13px 12px; }.preview-banner { align-items:flex-start; line-height:1.5; }.page-heading { align-items:flex-start; flex-direction:column; margin:23px 0 15px; }.page-heading h1 { font-size:27px; }.heading-actions { width:100%; }.heading-actions button { flex:1; }.date-row { align-items:flex-start; flex-direction:column; margin-top:18px; }.date-pills { width:100%; justify-content:space-between; }.date-pills button { flex:1; padding:7px 5px; }.metric-grid { gap:8px; }.metric-card { padding:12px 10px; }.metric-top { font-size:9px; }.metric-icon { width:25px; height:25px; }.metric-value { font-size:22px; margin:11px 0 8px; }.metric-foot { font-size:8px; }.panel-heading { padding:15px 13px 0; }.chart-legend { padding-left:13px; }.chart-wrap { padding-left:4px; padding-right:10px; }.chart-foot { padding-left:13px; padding-right:13px; }.attention-item { width:calc(100% - 26px); margin:0 13px; }.attention-footer { padding:12px 13px; }.activity-panel { margin-top:10px; }.assistant-card { align-items:flex-start; flex-wrap:wrap; gap:12px; padding:16px; }.assistant-copy { flex-basis:calc(100% - 55px); }.button-light { margin-left:51px; }.page-footer { flex-direction:column; gap:6px; }.placeholder-card { margin:25px auto; padding:35px 20px; }.notification-popover { right:10px; top:55px; } }
  `],
})
export class AppComponent {
  activeSection = 'Overview';
  selectedRange = 'This month';
  searchTerm = '';
  mobileMenuOpen = false;
  workspaceNotice = false;
  showNotifications = false;
  bannerVisible = true;

  readonly dateRanges = ['7 days', '30 days', 'This month', 'This year'];
  readonly primaryNav = [
    { label: 'Overview', icon: '⌂' },
    { label: 'Customers', icon: '♙' },
    { label: 'Products & services', icon: '▦' },
    { label: 'Invoices', icon: '▤' },
    { label: 'Payments', icon: '↙' },
    { label: 'Expenses', icon: '↗' },
  ];
  readonly operationsNav = [
    { label: 'Inventory', icon: '▥' },
    { label: 'Suppliers', icon: '♧' },
    { label: 'Purchase orders', icon: '▣' },
    { label: 'Returns', icon: '↩' },
    { label: 'Reports', icon: '▧' },
    { label: 'AI Assistant', icon: '✳' },
    { label: 'Settings', icon: '⚙' },
  ];
  readonly metrics: Metric[] = [
    { label: 'Invoiced sales', value: 'EGP 48,250', note: 'vs. previous period', trend: '↑ 12.8%', icon: '↗' },
    { label: 'Payments collected', value: 'EGP 36,800', note: 'vs. previous period', trend: '↑ 8.4%', icon: '↓' },
    { label: 'Outstanding', value: 'EGP 11,450', note: 'Across 8 invoices', trend: '23.7% of sales', icon: '◷' },
    { label: 'Recorded expenses', value: 'EGP 9,620', note: 'vs. previous period', trend: '↓ 3.2%', icon: '−' },
  ];
  readonly chartMonths = [
    { label: 'May', sales: 54, payments: 39 },
    { label: 'Jun', sales: 68, payments: 49 },
    { label: 'Jul', sales: 47, payments: 40 },
    { label: 'Aug', sales: 78, payments: 61 },
    { label: 'Sep', sales: 63, payments: 52 },
    { label: 'Oct', sales: 91, payments: 72 },
  ];
  readonly activities: Activity[] = [
    { title: 'Invoice INV-0248', detail: 'Nile Office Supplies', amount: '+ EGP 4,500', time: 'Today, 10:42 AM', kind: 'sale' },
    { title: 'Payment received', detail: 'From Karim Hassan · INV-0241', amount: '+ EGP 2,200', time: 'Today, 9:18 AM', kind: 'payment' },
    { title: 'Monthly rent', detail: 'Office & storage', amount: '− EGP 3,000', time: 'Yesterday', kind: 'expense' },
    { title: 'Stock adjusted', detail: 'Arabica coffee · SKU-104', amount: '− 6 units', time: 'Yesterday', kind: 'stock' },
    { title: 'Invoice INV-0247', detail: 'Mina Trading', amount: '+ EGP 1,750', time: 'Oct 19, 2026', kind: 'sale' },
  ];

  get filteredActivities(): Activity[] {
    const query = this.searchTerm.trim().toLowerCase();
    if (!query) return this.activities;
    return this.activities.filter((activity) =>
      [activity.title, activity.detail, activity.amount, activity.kind, activity.time]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }

  get sectionDescription(): string {
    const descriptions: Record<string, string> = {
      'Customers': 'Keep customer details organized and find the right record quickly.',
      'Products & services': 'Manage your catalog, pricing, and stock-tracked products.',
      'Invoices': 'Prepare clear invoices and keep issued records traceable.',
      'Payments': 'Track collected payments and how they are allocated to invoices.',
      'Expenses': 'Record business spending with dates, categories, and currency.',
      'Inventory': 'Understand stock from recorded receipts, sales, returns, and adjustments.',
      'Suppliers': 'Keep supplier contact details and purchasing relationships in one place.',
      'Purchase orders': 'Track supplier orders and partial or completed receiving.',
      'Returns': 'Review returns against original invoice lines.',
      'Reports': 'Review reliable summaries with date ranges and currencies kept separate.',
      'AI Assistant': 'Ask questions grounded in verified business records and calculations.',
      'Settings': 'Configure your business profile and access preferences.',
    };
    return descriptions[this.activeSection] ?? 'Explore your business workspace.';
  }

  get sectionIcon(): string {
    const item = [...this.primaryNav, ...this.operationsNav].find((entry) => entry.label === this.activeSection);
    return item?.icon ?? '✳';
  }

  setSection(label: string): void {
    this.activeSection = label;
    this.mobileMenuOpen = false;
    this.showNotifications = false;
  }

  dismissBanner(): void {
    this.bannerVisible = false;
  }

  exportPreview(): void {
    const header = 'Activity,Details,Type,Date,Amount';
    const rows = this.activities.map((item) =>
      [item.title, item.detail, item.kind, item.time, item.amount]
        .map((value) => '"' + value.replaceAll('"', '""') + '"')
        .join(','),
    );
    const blob = new Blob([[header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ai-business-assistant-preview.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
