import { Component } from '@angular/core';

type Feature = { icon: string; title: string; detail: string; state: 'Foundation' | 'Planned' };

@Component({
  selector: 'aba-root',
  standalone: true,
  template: `
    <div class="layout">
      <aside class="sidebar" aria-label="Main navigation">
        <a class="brand" href="#" aria-label="AI Business Assistant home">
          <span class="brand-mark">A</span><span>Business<span class="brand-light">Pilot</span></span>
        </a>
        <p class="nav-label">WORKSPACE</p>
        <button class="nav-item active" type="button"><span>▦</span> Overview</button>
        <button class="nav-item" type="button" disabled title="Coming in a later feature slice"><span>▤</span> Sales & invoices</button>
        <button class="nav-item" type="button" disabled title="Coming in a later feature slice"><span>◇</span> Products & stock</button>
        <button class="nav-item" type="button" disabled title="Coming in a later feature slice"><span>♧</span> Customers & suppliers</button>
        <button class="nav-item" type="button" disabled title="Coming in a later feature slice"><span>↗</span> Reports</button>
        <div class="sidebar-bottom"><span class="status-dot"></span> Local-first workspace <small>Preview · Not connected to live data</small></div>
      </aside>
      <main class="main">
        <header class="topbar"><div><span class="eyebrow">YOUR WORKSPACE</span><h1>Business overview</h1></div><div class="avatar" aria-label="Profile not configured">U</div></header>
        <section class="welcome">
          <div><span class="eyebrow light">AI BUSINESS ASSISTANT</span><h2>Make your next move<br>with confidence.</h2><p>Your operations, organized in one place. Connect a verified account and database to begin.</p></div>
          <div class="welcome-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="spark">✦</div><div class="art-core">AI</div></div>
        </section>
        <section class="section-head"><div><h2>Workspace modules</h2><p>Feature progress · Early development</p></div><span class="progress-pill">API foundation in progress</span></section>
        <section class="feature-grid" aria-label="Workspace modules">
          @for (feature of features; track feature.title) {
            <article class="feature-card">
              <div class="feature-icon">{{ feature.icon }}</div>
              <div class="feature-copy"><h3>{{ feature.title }}</h3><p>{{ feature.detail }}</p></div>
              <span class="feature-state" [class.ready]="feature.state === 'Foundation'">{{ feature.state }}</span>
            </article>
          }
        </section>
        <section class="notice"><span class="notice-icon">i</span><div><strong>Demo interface — no live business data</strong><p>This screen is a frontend foundation. Authentication, live API data, reporting, and AI insights are not yet connected. No sample figures are presented as real business results.</p></div></section>
        <footer>AI Business Assistant <span>Built incrementally · Security before live data</span></footer>
      </main>
    </div>
  `,
  styles: [`
    :host{display:block;min-height:100vh}.layout{min-height:100vh;display:grid;grid-template-columns:248px minmax(0,1fr)}.sidebar{background:#111827;color:#e5e7eb;padding:28px 18px;display:flex;flex-direction:column;min-height:100vh}.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:16px;font-weight:750;letter-spacing:-.4px;padding:0 8px 38px}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#a7f3d0;color:#064e3b;font-weight:900}.brand-light{font-weight:400;color:#9ca3af;margin-left:4px}.nav-label,.eyebrow{font-size:10px;font-weight:800;letter-spacing:1.6px;color:#9ca3af}.nav-label{padding:0 10px;margin:0 0 12px}.nav-item{display:flex;align-items:center;gap:12px;width:100%;border:0;background:transparent;color:#9ca3af;text-align:left;padding:12px 13px;border-radius:10px;margin:3px 0;font-size:13px}.nav-item span{font-size:18px;width:20px;text-align:center}.nav-item.active{background:#263448;color:#fff}.nav-item:disabled{opacity:.48}.sidebar-bottom{margin-top:auto;padding:18px 10px 0;border-top:1px solid #293548;color:#d1d5db;font-size:12px}.sidebar-bottom small{display:block;color:#9ca3af;margin:8px 0 0 16px;font-size:10px}.status-dot{display:inline-block;width:7px;height:7px;background:#fbbf24;border-radius:50%;margin-right:8px}.main{max-width:1440px;width:100%;margin:0 auto;padding:30px clamp(20px,4vw,56px) 20px}.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}.topbar h1{font-size:25px;letter-spacing:-.8px;margin:7px 0 0;color:#111827}.topbar .eyebrow{color:#6b7280}.avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#dbeafe;color:#1d4ed8;font-weight:800}.welcome{min-height:238px;border-radius:20px;padding:32px 38px;background:linear-gradient(115deg,#14243a,#1e3a5f 60%,#155e75);color:#fff;display:flex;justify-content:space-between;align-items:center;overflow:hidden;position:relative}.eyebrow.light{color:#a7f3d0}.welcome h2{font-size:clamp(26px,3vw,38px);line-height:1.12;letter-spacing:-1.3px;margin:12px 0}.welcome p{max-width:450px;line-height:1.7;color:#cbd5e1;font-size:13px;margin:0}.welcome-art{width:180px;height:180px;position:relative;display:grid;place-items:center;margin-right:5%;flex-shrink:0}.orbit{position:absolute;border:1px solid #93c5fd55;border-radius:50%;transform:rotate(-24deg)}.orbit-one{width:160px;height:95px}.orbit-two{width:130px;height:165px;transform:rotate(38deg)}.art-core{width:76px;height:76px;border-radius:25px;background:linear-gradient(135deg,#a7f3d0,#60a5fa);display:grid;place-items:center;color:#0f2942;font-size:23px;font-weight:900;box-shadow:0 15px 45px #02061766}.spark{position:absolute;top:20px;right:12px;color:#a7f3d0;font-size:26px}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:30px 0 16px}.section-head h2{font-size:17px;margin:0 0 6px;color:#111827}.section-head p{margin:0;color:#6b7280;font-size:12px}.progress-pill{border:1px solid #dbeafe;color:#1d4ed8;background:#eff6ff;border-radius:999px;padding:8px 12px;font-size:11px;font-weight:700}.feature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.feature-card{background:#fff;border:1px solid #e7ebf2;border-radius:15px;padding:18px;display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;position:relative;min-height:115px}.feature-icon{width:40px;height:40px;display:grid;place-items:center;background:#f0fdf4;color:#047857;border-radius:12px;font-size:19px}.feature-copy h3{margin:2px 0 6px;font-size:13px;color:#111827}.feature-copy p{margin:0;font-size:11px;line-height:1.6;color:#6b7280;padding-right:35px}.feature-state{position:absolute;right:14px;bottom:13px;font-size:9px;color:#6b7280;background:#f3f4f6;padding:5px 7px;border-radius:999px}.feature-state.ready{color:#047857;background:#d1fae5}.notice{display:flex;gap:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:13px;padding:16px;margin-top:18px;color:#92400e}.notice-icon{width:22px;height:22px;border:1px solid #d97706;border-radius:50%;display:grid;place-items:center;font-size:12px;flex-shrink:0}.notice strong{font-size:12px}.notice p{font-size:11px;line-height:1.6;margin:5px 0 0;color:#92400e}.main footer{display:flex;justify-content:space-between;gap:10px;margin-top:24px;padding:16px 0 0;border-top:1px solid #e5e7eb;color:#6b7280;font-size:10px}.main footer span{color:#9ca3af}.feature-grid{color:#111827}@media(max-width:900px){.layout{grid-template-columns:72px minmax(0,1fr)}.sidebar{padding:22px 10px}.brand{padding:0 9px 36px}.brand>span:last-child,.nav-label,.nav-item:not(.active){display:none}.nav-item{justify-content:center;padding:12px 8px;font-size:0}.nav-item span{font-size:20px}.sidebar-bottom{font-size:0;padding:16px 8px 0}.sidebar-bottom small{display:none}.status-dot{margin:0}.welcome{padding:28px}.welcome-art{margin-right:0;transform:scale(.8)}}@media(max-width:620px){.main{padding:22px 15px}.topbar h1{font-size:21px}.welcome{padding:24px;min-height:220px}.welcome-art{display:none}.welcome p{font-size:12px}.section-head{align-items:flex-start;flex-direction:column}.feature-grid{grid-template-columns:1fr}.feature-card{min-height:105px}.main footer{flex-direction:column}.progress-pill{font-size:10px}}
  `]
})
export class AppComponent {
  readonly features: Feature[] = [
    { icon: '◈', title: 'Products & inventory', detail: 'Product catalog and stock movement workflow foundation.', state: 'Foundation' },
    { icon: '▤', title: 'Invoices & payments', detail: 'Invoice creation, issuing, and payment allocation services.', state: 'Foundation' },
    { icon: '♧', title: 'Customers & suppliers', detail: 'Business-scoped directories with membership checks.', state: 'Foundation' },
    { icon: '▥', title: 'Expenses & purchasing', detail: 'Expense and purchasing workflows are still being connected.', state: 'Planned' },
    { icon: '⌁', title: 'Reports & insights', detail: 'Read-only financial summaries and business analytics.', state: 'Planned' },
    { icon: '✧', title: 'AI business assistant', detail: 'Grounded, read-only answers once safe data access is ready.', state: 'Planned' }
  ];
}
