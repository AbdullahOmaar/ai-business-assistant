import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../../../backend/app/core_features_api.py', import.meta.url), 'utf8');
const metricCardSource = readFileSync(new URL('./shared/ui/aba-metric-card.component.ts', import.meta.url), 'utf8');

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
  assert.match(home, /kind="loading"/);
  assert.match(home, /kind="empty"/);
  assert.match(home, /!error/);
});

test('Home page identity and responsive metric hierarchy follow the UX handoff', () => {
  assert.match(appSource, /overview: 'الرئيسية'/);
  assert.match(appSource, /overview: 'Overview'/);
  assert.match(appSource, /\.metric-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(appSource, /@media\(max-width:1050px\)\{\.metric-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(appSource, /@media\(max-width:760px\)\{\.metric-grid\{grid-template-columns:minmax\(0,1fr\)\)/);
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
  assert.match(home, /<summary class="module-directory-summary">/);
  assert.match(home, /<h2 id="module-directory-title">/);
  assert.doesNotMatch(home, /<details[^>]*\bopen\b/);
  assert.match(appSource, /WORKSPACE_MODULE_CATALOG\.filter\(module => this\.canAccessTab\(module\.tab\)\)/);
  assert.match(appSource, /selectHomeQuickAccessModules\(this\.homeModuleCards\)/);
  assert.match(home, /homeModuleCards/);
});

test('Home shortcuts remain compact on mobile and trust copy is visually neutral', () => {
  assert.match(appSource, /\.quick-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(appSource, /@media\(max-width:360px\)\{\.quick-grid\{grid-template-columns:minmax\(0,1fr\)\)/);
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
});


test('Home exposes its business summary as a navigable section heading', () => {
  assert.equal(home.split('<h2 class="dashboard-period__title">').length - 1, 2,
    'the ready and loading Home period sections must share one level-two heading each');
  assert.match(home, /<h2 class="dashboard-period__title">\{\{ t\('ملخص النشاط', 'Business summary'\) \}\}<\/h2>/);
  assert.match(home, /<section class="dashboard-period dashboard-period--skeleton" aria-hidden="true">[\s\S]*?<h2 class="dashboard-period__title">/);
  assert.match(appSource, /\.dashboard-period__title\{[^}]*font-size:14px/);
});


test('Home loading skeleton uses the current bilingual Business Summary heading', () => {
  const loadingStart = home.indexOf('} @else if (loading) {');
  const loadingEnd = home.indexOf('} @else if (!error)', loadingStart);
  const loading = home.slice(loadingStart, loadingEnd);
  assert.ok(loadingStart >= 0 && loadingEnd > loadingStart);
  assert.match(loading, /<h2 class="dashboard-period__title">\{\{ t\('ملخص النشاط', 'Business summary'\) \}\}<\/h2>/);
  assert.doesNotMatch(loading, /BUSINESS SUMMARY/);
});
