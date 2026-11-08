import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../../../backend/app/core_features_api.py', import.meta.url), 'utf8');
const metricCardSource = readFileSync(new URL('./shared/ui/aba-metric-card.component.ts', import.meta.url), 'utf8');
const mobileHeaderCssSource = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.css', import.meta.url), 'utf8');
const quickAccessCardSource = readFileSync(new URL('./shared/ui/aba-quick-access-card.component.ts', import.meta.url), 'utf8');
const moduleCatalogSource = readFileSync(new URL('./workspace-module-catalog.ts', import.meta.url), 'utf8');

const homeStart = appSource.indexOf("@if (tab === 'overview') {");
const homeEnd = appSource.indexOf("@if (tab === 'notifications')", homeStart);
const home = appSource.slice(homeStart, homeEnd);

test('Home keeps the canonical four source-backed metrics and currency-separated rows', () => {
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  for (const field of ['invoiced_sales', 'collected_payments', 'expenses', 'outstanding_balances']) {
    assert.ok(home.includes('dashboard.' + field), 'expected source-backed metric ' + field);
  }
  assert.equal(home.split('<aba-metric-card role="group"').length - 1, 4);
  for (const id of ['metric-invoiced-sales-label', 'metric-collected-payments-label', 'metric-expenses-label', 'metric-outstanding-balances-label']) {
    assert.ok(home.includes('role="group" aria-labelledby="' + id + '"'));
    assert.ok(home.includes('id="' + id + '" metricLabel'));
  }

  assert.match(home, /item\.currency_code/);
  assert.equal(home.split('<bdi dir="ltr">{{ item.total }} {{ item.currency_code }}</bdi>').length - 1, 4,
    'each currency amount must retain its LTR number/code order inside an isolated bidi run');
  assert.equal(home.split('<bdi dir="ltr">{{ item.count }}</bdi>').length - 1, 3,
    'only the three source-backed metric counts are rendered and isolated');

  assert.match(home, /item\.count/);
  const outstandingStart = home.indexOf("dashboard.outstanding_balances");
  const outstandingEnd = home.indexOf("</aba-metric-card>", outstandingStart);
  const outstandingCard = home.slice(outstandingStart, outstandingEnd);
  assert.doesNotMatch(outstandingCard, /item\.count/,
    'the API does not return an outstanding-balance count');
});

test('Home KPI cards render visible localized labels separately from projected values', () => {
  const labels = [
    ['metric-invoiced-sales-label', 'المبيعات بالفواتير', 'Invoiced sales'],
    ['metric-collected-payments-label', 'التحصيلات', 'Collected payments'],
    ['metric-expenses-label', 'المصروفات', 'Expenses'],
    ['metric-outstanding-balances-label', 'المبالغ المستحقة', 'Outstanding balances'],
  ];
  for (const [id, arabic, english] of labels) {
    assert.ok(home.includes('<span id="' + id + '" metricLabel>{{ t(\'' + arabic + '\', \'' + english + '\') }}</span>'),
      id + ' must contain a visible localized metric label');
  }
  assert.ok(metricCardSource.includes('ng-content select="[metricLabel]"'));
  assert.ok(metricCardSource.includes('<ng-content />'),
    'amounts, counts and basis notes must flow into the value slot, not the label slot');
});

test('Home reports the backend business-local period without generating a client date window', () => {
  assert.match(home, /dashboard\.period\.start_date/);
  assert.match(home, /dashboard\.period\.end_date/);
  assert.match(home, /dashboard\.period\.timezone/);
  assert.ok(home.includes('<bdi dir="ltr">{{ dashboard.period.start_date || \'—\' }}</bdi>'));
  assert.ok(home.includes('<bdi dir="ltr">{{ dashboard.period.end_date || \'—\' }}</bdi>'));

  assert.match(home, /Last 30 days/);
  assert.match(apiSource, /dashboard\(businessId: string\): Promise<Dashboard>/);
  assert.match(apiSource, /backend applies the default 30-day window using the business's timezone/);
  assert.match(backendSource, /business_today - timedelta\(days=29\)/);
  assert.match(backendSource, /"timezone": timezone_name/);
});

test('empty Home metric groups do not imply a currency-less monetary zero', () => {
  const fields = ['invoiced_sales', 'collected_payments', 'expenses', 'outstanding_balances'];
  const emptyGroups = fields.filter(field =>
    home.includes('@if (!dashboard.' + field + '.length) { <strong>—</strong>'),
  );
  assert.equal(emptyGroups.length, 4,
    'empty metric groups use a neutral placeholder because no currency amount exists to label');
  for (const field of fields) {
    assert.ok(!home.includes('@if (!dashboard.' + field + '.length) { <strong>0</strong>'),
      field + ' must not render an unqualified zero with no currency code');
  }
});

test('Home explains each metric source timestamp and keeps financial meanings distinct', () => {
  assert.match(home, /By invoice issue date/);
  assert.match(home, /By payment received time/);
  assert.match(home, /By expense incurred date/);
  assert.match(home, /Issued invoices after allocated payments/);
  assert.match(home, /not the same as collected payments/);
  assert.match(home, /not net profit/);
  assert.match(home, /currencies are never combined/);
});

test('Home omits unsupported attention, trend, aging and recent-activity panels', () => {
  assert.doesNotMatch(home, /attention_items|pending_work|dashboard\.trend|dashboard\.series|receivables_aging|recent_activity|<Chart/i);
  assert.doesNotMatch(home, /class="hero"|Better decisions start/);
});

test('Home preserves quick access, the role-filtered module directory and safe loading/empty states', () => {
  assert.match(home, /homeQuickAccessCards/);
  assert.match(home, /homeModuleCards/);
  assert.match(home, /metric-grid--skeleton/);
  assert.match(appSource, /@if \(loading\) \{ <aba-state-message kind="loading"/);
  assert.match(home, /kind="empty"/);
  assert.match(home, /!error/);
});

test('Home page identity and responsive metric hierarchy follow the UX handoff', () => {
  assert.match(appSource, /overview: 'الرئيسية'/);
  assert.match(appSource, /overview: 'Overview'/);
  assert.match(appSource, /\.metric-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(appSource, /@media\(max-width:1050px\)\{\.metric-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.ok(appSource.includes('.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'));
  assert.ok(appSource.includes('.module-directory-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}'));
  assert.match(appSource, /dashboard-period__details/);
});

test('shared metric cards style projected amounts and source-basis notes legibly', () => {
  assert.match(metricCardSource, /aba-metric-card__values strong/);
  assert.match(metricCardSource, /font-variant-numeric:tabular-nums/);
  assert.match(metricCardSource, /aba-metric-card__values \.metric-basis/);
  assert.match(metricCardSource, /overflow-wrap:anywhere/);
});


test('Home keeps the full role-filtered module directory discoverable but collapsed by default', () => {
  assert.match(home, /<details class="module-directory-disclosure">/);
  assert.match(appSource, /\.module-directory-summary\{[^}]*min-height:44px/);
  assert.match(home, /<summary class="module-directory-summary">/);
  assert.match(home, /<span class="module-directory-summary__title" role="heading" aria-level="2" id="module-directory-title">/);
  assert.doesNotMatch(home, /<summary[^>]*>[\s\S]*?<h[1-6]\b/, 'native summary content must stay phrasing-only');
  assert.match(appSource, /\.module-directory-summary__title\{margin:0;/);
  assert.doesNotMatch(home, /<details[^>]*\bopen\b/);
  assert.match(appSource, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(appSource, /selectHomeQuickAccessModules\(this\.homeModuleCards\)/);
  assert.match(home, /homeModuleCards/);
});

test('Home quick access uses compact links instead of a second module-card grid', () => {
  const navStart = home.indexOf('<nav class="home-shortcut-list"');
  const navEnd = home.indexOf('</nav>', navStart);
  const shortcuts = home.slice(navStart, navEnd);
  assert.ok(navStart >= 0 && navEnd > navStart, 'Home must expose a named quick-shortcut navigation region');
  assert.match(shortcuts, /<button class="home-shortcut-link"/);
  assert.doesNotMatch(shortcuts, /aba-quick-access-card/,
    'quick shortcuts must remain compact links, not a duplicate module-card surface');
  assert.ok(appSource.includes('.home-shortcut-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.match(appSource, /\.home-shortcut-link\{[^}]*min-height:44px/);
  assert.match(appSource, /\.home-shortcut-link\{[^}]*font-size:var\(--aba-font-size-base,14px\)/, 'navigation controls use the shared readable base font size');
  assert.match(appSource, /\.home-shortcut-link:focus-visible/);
  assert.match(appSource, /\.home-shortcut-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.ok(appSource.includes('.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'));
  assert.ok(quickAccessCardSource.includes(':host-context(.module-directory-grid) .aba-quick-access{min-height:96px;display:grid;grid-template-columns:32px minmax(0,1fr)'));
  assert.ok(quickAccessCardSource.includes('-webkit-line-clamp:2'));
  assert.ok(quickAccessCardSource.includes('.aba-quick-access__arrow{display:none}'));
  assert.match(home, /dashboard-trust-note" role="note"/);
  assert.match(appSource, /\.dashboard-trust-note\{background:var\(--aba-color-surface-subtle/);
});


test('Home preserves the reporting-period hierarchy while KPI data is loading', () => {
  const loadingStart = home.indexOf('} @else if (loading) {');
  const loadingEnd = home.indexOf('} @else if (!error)', loadingStart);
  const loading = home.slice(loadingStart, loadingEnd);
  assert.ok(loadingStart >= 0 && loadingEnd > loadingStart);
  assert.match(loading, /dashboard-period dashboard-period--skeleton" aria-hidden="true"/);
  assert.match(loading, /t\('ملخص النشاط', 'Business summary'\)/);
  assert.match(loading, /t\('آخر 30 يومًا', 'Last 30 days'\)/);
  assert.match(loading, /dashboard-period-skeleton__details/);
  assert.match(appSource, /\.dashboard-period--skeleton\{min-height:66px\}/);
});


test('Home clears tenant-scoped metrics before loading another workspace', () => {
  const switchStart = appSource.indexOf('async switchBusiness(id: string)');
  const switchEnd = appSource.indexOf('private readonly workspaceLoadGuard', switchStart);
  const switchMethod = appSource.slice(switchStart, switchEnd);
  assert.ok(switchStart >= 0 && switchEnd > switchStart);
  assert.match(switchMethod, /this\.clearWorkspaceData\(\)/);

  const clearStart = appSource.indexOf('private clearWorkspaceData(): void');
  const clearEnd = appSource.indexOf('async createWorkspace(): Promise<void>', clearStart);
  const reset = appSource.slice(clearStart, clearEnd);
  assert.ok(clearStart >= 0 && clearEnd > clearStart);
  assert.match(reset, /this\.dashboard = null/);
  assert.match(reset, /this\.workspaceLoadGuard\.invalidate\(\)/);

  const loadStart = appSource.indexOf('async loadWorkspaceData(): Promise<void>');
  const loadEnd = appSource.indexOf('async refreshAfterPayrollPayment(): Promise<void>', loadStart);
  const load = appSource.slice(loadStart, loadEnd);
  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  assert.match(load, /this\.workspaceLoadGuard\.isCurrent\(loadVersion, this\.business\?\.id, id\)/);
});


test('Home reporting metadata and KPI detail text remain comfortably readable', () => {
  assert.match(appSource, /\.dashboard-period__details\{[^}]*font-size:12px/);
  assert.match(appSource, /\.metric-grid aba-metric-card small\{font-size:12px;line-height:1\.55\}/);
  assert.match(appSource, /\.dashboard-trust-note\{[^}]*font-size:12px;line-height:1\.65/);
  assert.match(home, /dashboard-period__details/);
  assert.match(home, /class="notice dashboard-trust-note" role="note"/);
  assert.match(home, /t\('ملاحظات على المؤشرات', 'Metric notes'\)/);
  assert.doesNotMatch(home, /t\('سلامة البيانات', 'Data integrity'\)/);
});


test('Home exposes its business summary as a navigable section heading', () => {
  assert.equal(home.split('<h2 class="dashboard-period__title">').length - 1, 2,
    'the ready and loading Home period sections must share one level-two heading each');
  assert.match(home, /<h2 class="dashboard-period__title">\{\{ t\('ملخص النشاط', 'Business summary'\) \}\}<\/h2>/);
  assert.match(home, /<section class="dashboard-period dashboard-period--skeleton" aria-hidden="true">[\s\S]*?<h2 class="dashboard-period__title">/);
  assert.match(appSource, /\.dashboard-period__title\{[^}]*font-size:14px/);
});


test('Mobile app header is compact while retaining accessible controls and workspace context', () => {
  assert.ok(mobileHeaderCssSource.includes('gap: 7px;'));
  assert.ok(mobileHeaderCssSource.includes('margin-block: 0 10px;'));
  assert.ok(mobileHeaderCssSource.includes('padding: 8px 10px;'));
  assert.ok(mobileHeaderCssSource.includes('.brand-copy small { display: none; }'));
  assert.ok(mobileHeaderCssSource.includes('width: 44px; height: 44px;'));
  assert.ok(mobileHeaderCssSource.includes('padding: 7px 9px;'));
  assert.ok(mobileHeaderCssSource.includes('workspace-switch select'));
  assert.ok(mobileHeaderCssSource.includes('assistant-shortcut'));
  assert.ok(mobileHeaderCssSource.includes('.greeting { display: none; }'));
});

test('Home loading skeleton uses the current bilingual Business Summary heading', () => {
  const loadingStart = home.indexOf('} @else if (loading) {');
  const loadingEnd = home.indexOf('} @else if (!error)', loadingStart);
  const loading = home.slice(loadingStart, loadingEnd);
  assert.ok(loadingStart >= 0 && loadingEnd > loadingStart);
  assert.match(loading, /<h2 class="dashboard-period__title">\{\{ t\('ملخص النشاط', 'Business summary'\) \}\}<\/h2>/);
  assert.doesNotMatch(loading, /BUSINESS SUMMARY/);
});


test('Home uses one workspace-level loading announcement and a visual KPI skeleton', () => {
  assert.match(appSource, /@if \(loading\) \{ <aba-state-message kind="loading" \[description\]="t\('جارٍ تحميل بيانات مساحة العمل…', 'Loading workspace data…'\)" \/> \}/);
  assert.doesNotMatch(home, /aba-state-message kind="loading"/,
    'the Home branch must not duplicate the shared workspace loading announcement');
  assert.match(home, /metric-grid--skeleton/,
    'the Home KPI hierarchy remains visible as a non-data skeleton');
});

test('failed payroll dashboard refresh clears stale Home metrics through the current OWNER-scoped error callback', () => {
  const start = appSource.indexOf('async refreshAfterPayrollPayment(): Promise<void>');
  const end = appSource.indexOf('exportReceivablesAgingCsv(): void', start);
  const method = appSource.slice(start, end);
  const errorCallback = method.indexOf('onError: error =>');
  const staleClear = method.indexOf('this.dashboard = null;', errorCallback);
  const storedRetryError = method.indexOf('this.homeDashboardError = this.message(error);', errorCallback);
  const retryError = method.indexOf('this.error = this.homeDashboardError;', errorCallback);

  assert.ok(start >= 0 && end > start, 'post-payroll refresh method must exist');
  assert.match(method, /requestContext\.role !== 'owner'/);
  assert.match(method, /runTenantScopedRequest\(\s*this\.payrollRefreshGuard/);
  assert.ok(errorCallback >= 0 && staleClear > errorCallback && storedRetryError > staleClear && retryError > storedRetryError,
    'a failed current OWNER refresh must clear old dashboard metrics, store the Home error, then expose the retryable banner');

  const successfulDashboard = method.indexOf('this.dashboard = dashboard;');
  const clearResolvedBanner = method.indexOf("if (this.error === this.homeDashboardError) this.error = '';");
  const clearHomeError = method.indexOf("this.homeDashboardError = '';", clearResolvedBanner);
  assert.ok(successfulDashboard >= 0 && clearResolvedBanner > successfulDashboard && clearHomeError > clearResolvedBanner,
    'a successful refresh clears only the matching Home refresh banner before clearing its stored error');
  assert.match(method, /if \(this\.error === this\.homeDashboardError\) this\.error = '';/,
    'success clears the page-level banner only when it belongs to this Home refresh');
});


test('Home quick access follows the approved high-frequency destinations in stable order', () => {
  const configured = moduleCatalogSource.match(
    /export const HOME_QUICK_ACCESS_TABS:[^=]+=[\s\S]*?\[([\s\S]*?)\];/,
  );
  assert.ok(configured, 'the canonical Home quick-access list must exist');
  const tabs = [...configured[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(tabs, ['invoices', 'customers', 'products', 'expenses', 'reports']);
  assert.match(appSource, /return WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(appSource, /return selectHomeQuickAccessModules\(this\.homeModuleCards\)/);
});


test('Home does not invent pending actions or operational alerts absent from the dashboard contract', () => {
  const dashboardStart = backendSource.indexOf('def dashboard(');
  const dashboardEnd = backendSource.indexOf('@router.get("/businesses/{business_id}/profit-loss")', dashboardStart);
  assert.ok(dashboardStart >= 0 && dashboardEnd > dashboardStart);
  const handler = backendSource.slice(dashboardStart, dashboardEnd);
  const responseStart = handler.indexOf('return {');
  assert.ok(responseStart >= 0);
  const response = handler.slice(responseStart);
  for (const field of ['"period":', '"invoiced_sales":', '"collected_payments":', '"expenses":', '"outstanding_balances":', '"limitations":']) {
    assert.ok(response.includes(field), 'dashboard response must retain ' + field);
  }
  assert.doesNotMatch(response, /pending_actions|action_queue|operational_alerts|attention_items|alert_count|pending_count/i);
  assert.doesNotMatch(home, /pending_actions|action_queue|operational_alerts|attention_items|alert_count|pending_count/i);
});


test('Home retains a failed dashboard-refresh error when navigating away and back', () => {
  const setTabStart = appSource.indexOf('setTab(tab: Tab): void {');
  const setTabEnd = appSource.indexOf('get statementBalanceEntries():', setTabStart);
  const setTab = appSource.slice(setTabStart, setTabEnd);
  const refreshStart = appSource.indexOf('async refreshAfterPayrollPayment(): Promise<void>');
  const refreshEnd = appSource.indexOf('exportReceivablesAgingCsv(): void', refreshStart);
  const refresh = appSource.slice(refreshStart, refreshEnd);
  const clearStart = appSource.indexOf('private clearWorkspaceData(): void');
  const clearEnd = appSource.indexOf('async createWorkspace(): Promise<void>', clearStart);
  const clear = appSource.slice(clearStart, clearEnd);

  assert.ok(setTabStart >= 0 && setTabEnd > setTabStart);
  assert.match(setTab, /this\.error = tab === 'overview' && this\.homeDashboardError \? this\.homeDashboardError : '';/);
  assert.match(refresh, /this\.homeDashboardError = this\.message\(error\);/);
  assert.match(refresh, /this\.homeDashboardError = '';/);
  assert.match(clear, /this\.homeDashboardError = '';/,
    'workspace changes must discard the previous workspace Home refresh error');
  assert.match(appSource, /this\.dashboard = dashboard;\s*this\.homeDashboardError = '';/,
    'a successful workspace dashboard load must clear the preserved error');
});
