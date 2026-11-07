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
  assert.equal((home.match(/<aba-metric-card>/g) || []).length, 4);
  assert.match(home, /item\.currency_code/);
  assert.match(home, /item\.count/);
  const outstandingStart = home.indexOf("dashboard.outstanding_balances");
  const outstandingEnd = home.indexOf("</aba-metric-card>", outstandingStart);
  const outstandingCard = home.slice(outstandingStart, outstandingEnd);
  assert.doesNotMatch(outstandingCard, /item\.count/,
    'the API does not return an outstanding-balance count');
});

test('Home reports the backend business-local period without generating a client date window', () => {
  assert.match(home, /dashboard\.period\.start_date/);
  assert.match(home, /dashboard\.period\.end_date/);
  assert.match(home, /dashboard\.period\.timezone/);
  assert.match(home, /Last 30 days/);
  assert.match(apiSource, /dashboard\(businessId: string\): Promise<Dashboard>/);
  assert.match(apiSource, /backend applies the default 30-day window using the business's timezone/);
  assert.match(backendSource, /business_today - timedelta\(days=29\)/);
  assert.match(backendSource, /"timezone": timezone_name/);
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
