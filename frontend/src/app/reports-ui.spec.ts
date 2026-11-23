import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

// 3A-351: the reports sections moved from the shell into
// aba-reports-workspace (deferred behind @defer), so the source assertions
// read the workspace component — whose inline styles carry the
// amount-pair rule that used to live in app.component.css.
const appSourceRaw = readFileSync(new URL('./reports-workspace.component.ts', import.meta.url), 'utf8');
const appSource = expandTranslationCalls(appSourceRaw);
const appCss = appSourceRaw;
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

// T18 U09 (2026-11-22): Reports / Operating result. The P&L and receivables
// ageing content rules live here as source assertions (no TestBed in the node
// runner), following the aba-icon.spec.ts / aba-search-field.spec.ts pattern.
// The date-input names and the ageing single-date rule are pinned in
// aba-date-range.spec.ts, not duplicated here.

// --- Per-currency rendering: no mixed-currency total ---

test('P&L figures are grouped per currency with no mixed-currency total', () => {
  assert.match(appSource, /get profitLossTableRows\(\): readonly AbaRecordTableRow\[\] \{ return \(this\.profitLoss\?\.currencies\|\|\[\]\)\.map\(row=>\(\{id:row\.currency_code/);
  assert.match(appSource, /get profitLossTableColumns\(\): readonly AbaRecordTableColumn\[\] \{ return \[/);
  assert.ok(appSourceRaw.includes("{key:'currency',label:this.t('ui.m_1jd5ck6'),primary:true}"),
    'the P&L table has one row per currency code');
  assert.doesNotMatch(appSource, /profitLoss\?\.total|profitLoss\.total/,
    'no P&L total across currencies exists to render');
  assert.equal(english.ui.m_ujpaej,
    'This is a preliminary result: product purchase costs are not yet linked to sales, and revenue is based on issued invoices rather than cash collected. Different currencies are never combined.');
  assert.equal(arabic.ui.m_ujpaej,
    'هذا حساب مبدئي: لا يشمل تكلفة شراء البضاعة لأن تكلفة المنتج غير مرتبطة بعد بالمبيعات، كما أن الإيرادات تُحسب من الفواتير الصادرة لا من النقد المحصّل. لا يتم جمع العملات المختلفة.');
});

// --- Cost-of-goods warning visible ---

test('the cost-of-goods warning is visible on the P&L result', () => {
  assert.equal(english.ui.m_1tz1k9k, 'Important limitation');
  assert.equal(arabic.ui.m_1tz1k9k, 'مهم قبل اعتبارها أرباحًا صافية');
  assert.equal(english.ui.m_7hhfvq,
    'Preliminary result based on issued-invoice revenue and recorded expenses; cost of goods sold is not deducted.');
  assert.equal(arabic.ui.m_7hhfvq,
    'نتيجة أولية مبنية على إيرادات الفواتير الصادرة والمصروفات المسجلة، ولا تخصم تكلفة البضاعة المباعة.');
  assert.ok(appSourceRaw.includes('<div class="notice"><strong>{{ t(\'ui.m_1tz1k9k\') }}</strong><span>{{ t(\'ui.m_ujpaej\') }}</span></div>'),
    'the P&L result carries the limitation notice once the report loads');
});

// --- Collection basis stated ---

test('the revenue collection basis is stated on the P&L result', () => {
  assert.equal(english.ui.m_8hpy6m, 'Revenue basis:');
  assert.equal(arabic.ui.m_8hpy6m, 'أساس الإيراد:');
  assert.ok(appSourceRaw.includes('<p class="muted"><strong>{{ t(\'ui.m_8hpy6m\') }}</strong> {{ revenueBasisLabel(profitLoss.revenue_basis) }}</p>'),
    'the basis line renders next to the period line');
  assert.equal(english.ui.m_9mwoh2, 'Issued invoice total');
  assert.equal(arabic.ui.m_9mwoh2, 'إجمالي الفواتير الصادرة');
});

// --- Tax / result operational character labelled ---

test('the P&L result is labelled with its operational character, not a generic total', () => {
  assert.equal(english.ui.m_1jzh8n6, 'Result before COGS');
  assert.equal(arabic.ui.m_1jzh8n6, 'النتيجة قبل تكلفة البضاعة');
  assert.ok(appSourceRaw.includes("{key:'result',label:this.t('ui.m_1jzh8n6'),kind:'numeric'}"),
    'the result column says before-COGS, so the figure is never read as net profit');
  assert.match(appSource, /operating_result_before_cost_of_goods/);
});

// --- Ageing per-currency articles ---

test('receivables ageing renders one metric article per currency with its buckets', () => {
  assert.ok(appSourceRaw.includes('@for (summary of agingReport.by_currency; track summary.currency_code)'),
    'ageing groups by currency, it never sums across currencies');
  assert.ok(appSourceRaw.includes('<article class="metric"><span>{{ t(\'ui.m_1dusybc\') }} · {{ summary.currency_code }}</span><strong>{{ summary.total_outstanding }} {{ summary.currency_code }}</strong>'),
    'each currency article shows its own total with its code');
  assert.equal(english.ui.m_1dusybc, 'Total outstanding');
  assert.equal(arabic.ui.m_1dusybc, 'إجمالي المستحق');
});

// --- U09 fix: excess-allocation amount stays with its currency ---

test('ageing warnings keep the excess-allocation amount with its currency (U09 baseline 2026-11-22)', () => {
  // Baseline: at EN 195px the line wrapped as "Excess allocation: 1500.00 /
  // EGP" and at AR 220px as "قيمة التخصيص الزائد: 1500.00 / EGP" — the
  // currency orphaned on its own line, breaking the amounts-intact rule.
  // The amount + currency now render inside one nowrap span, so the pair
  // wraps as a unit onto the next line instead of splitting.
  assert.ok(appSource.includes('<span class="amount-pair">{{ warning.excess_allocated }} {{ warning.invoice_currency || \'\' }}</span>'),
    'the excess-allocation amount and currency share one span');
  assert.match(appCss, /\.warning-notice \.amount-pair\{white-space:nowrap;overflow-wrap:normal\}/,
    'the span is nowrap AND overflow-wrap:normal — nowrap alone is not enough, the abaCard host sets overflow-wrap:anywhere which the span would otherwise inherit');
});

// --- 3A-435 / T40: reports hand their context to the assistant ---

test('the P&L section offers to ask the assistant about the loaded report', () => {
  assert.ok(appSourceRaw.includes(`(click)="askAssistantAboutProfitLoss()"`),
    'a button in the P&L section triggers the handoff');
  assert.equal(english.reports.askAssistantAboutProfitLoss, 'Ask the assistant about this report');
  assert.equal(arabic.reports.askAssistantAboutProfitLoss, 'اسأل المساعد عن هذا التقرير');
  assert.match(appSourceRaw, /readonly askAssistant = output<string>\(\);/,
    'the workspace emits the question to the shell');
  assert.match(appSourceRaw, /this\.askAssistant\.emit\(question\);/,
    'the question carries the loaded report figures, not a static string');
  assert.match(appSourceRaw, /if \(!report \|\| !report\.currencies\.length\) return;/,
    'no handoff fires without a loaded report');
  const shellSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
  assert.ok(shellSource.includes(`(askAssistant)="askAssistantFromReports($event)"`),
    'the shell wires the reports output to its handler');
  assert.ok(shellSource.includes(`[pendingQuestion]="pendingAssistantQuestion"`),
    'the shell hands the question to the assistant workspace');
  const assistantSource = readFileSync(new URL('./assistant-workspace.component.ts', import.meta.url), 'utf8');
  assert.match(assistantSource, /readonly pendingQuestion = input<string>\(''\);/,
    'the assistant accepts a pending question');
  assert.match(assistantSource, /this\.useAssistantSuggestion\(pending\);/,
    'the pending question is sent as soon as the assistant mounts with it');
});
