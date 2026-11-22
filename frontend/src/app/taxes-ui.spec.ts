import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const appSourceRaw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const appSource = expandTranslationCalls(appSourceRaw);
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

// T18 U10 (2026-11-22): Taxes. The tax figures, operational-character and
// stored-value rules live here as source assertions (no TestBed in the node
// runner), following the aba-icon.spec.ts / reports-ui.spec.ts pattern.
// The date-input names and the date-range wiring are pinned in
// aba-date-range.spec.ts (exactly 3 date ranges: P&L, statement, taxes),
// not duplicated here. Baseline 2026-11-22: no responsive defect was found
// on the Taxes screen at 195/220/390/1280 EN+AR (populated, empty, filled
// dates and invalid-range states all measured) — this spec pins the
// already-correct behaviour; there is no production change in this slice.

// --- Per-currency rendering: no mixed-currency total ---

test('tax figures are grouped per currency with no mixed-currency total', () => {
  assert.match(appSource, /get taxTableRows\(\): readonly AbaRecordTableRow\[\] \{ return \(this\.taxSummaryReport\?\.currencies\|\|\[\]\)\.map\(row=>\(\{id:row\.currency_code/);
  assert.match(appSource, /get taxTableColumns\(\): readonly AbaRecordTableColumn\[\] \{ return \[/);
  assert.ok(appSourceRaw.includes("{key:'currency',label:this.t('ui.m_1jd5ck6'),primary:true}"),
    'the tax table has one row per currency code');
  assert.ok(appSourceRaw.includes("{key:'tax',label:this.t('ui.m_129leiq'),kind:'numeric'}"),
    'the tax figure is a numeric column per currency row');
  assert.ok(appSourceRaw.includes("{key:'count',label:this.t('ui.m_1dnybga'),kind:'numeric'}"),
    'the invoice count is a numeric column per currency row');
  assert.doesNotMatch(appSource, /taxSummaryReport\?\.total|taxSummaryReport\.total/,
    'no tax total across currencies exists to render');
  assert.equal(english.ui.m_1dw63nh,
    'Shows saved tax totals on issued invoices, separated by currency.');
  assert.equal(arabic.ui.m_1dw63nh,
    'يعرض الضرائب المحفوظة على الفواتير الصادرة مع فصل كل عملة.');
});

// --- Operational character visible, not a generic total ---

test('the operational character of taxes is visible in both languages', () => {
  assert.equal(english.ui.m_129leiq, 'Tax total');
  assert.equal(arabic.ui.m_129leiq, 'إجمالي الضريبة');
  assert.equal(english.ui.m_1dnybga, 'Issued invoices');
  assert.equal(arabic.ui.m_1dnybga, 'الفواتير الصادرة');
  // The three limitations the real API returns (backend/app/extended_api.py
  // report_tax_summary), each translated — saved totals, no recalculation;
  // totals kept separate, never converted; operational summary, not a filing.
  assert.equal(english.app.reportLimitation['4'],
    'Uses saved tax totals on issued invoices; it does not recalculate historical taxes.');
  assert.equal(arabic.app.reportLimitation['4'],
    'يعتمد على قيم الضرائب المحفوظة في الفواتير الصادرة ولا يعيد حساب الضرائب التاريخية.');
  assert.equal(english.app.reportLimitation['5'],
    'Currency totals are kept separate and are not converted.');
  assert.equal(arabic.app.reportLimitation['5'],
    'تُعرض إجماليات العملات منفصلة ولا يتم تحويلها.');
  assert.equal(english.app.reportLimitation['6'],
    'This is an operational summary, not a jurisdiction-specific tax filing.');
  assert.equal(arabic.app.reportLimitation['6'],
    'هذا ملخص تشغيلي وليس إقرارًا ضريبيًا رسميًا خاصًا بجهة ضريبية.');
  assert.ok(appSourceRaw.includes("@for (limitation of taxSummaryReport.limitations; track limitation) { <p class=\"muted\">• {{ reportLimitationLabel(limitation) }}</p> }"),
    'the tax limitations render under the table in both languages');
});

// --- Stored values only: no tax/discount semantic change ---

test('tax totals are stored values, never recalculated in the shell', () => {
  assert.ok(appSourceRaw.includes('tax:`${row.tax_total} ${row.currency_code}`'),
    'the tax cell renders the stored total with its currency code');
  assert.ok(appSourceRaw.includes('count:String(row.invoice_count)'),
    'the count cell renders the stored invoice count');
  const getterStart = appSourceRaw.indexOf('get taxTableRows()');
  assert.ok(getterStart >= 0, 'missing taxTableRows getter');
  const getter = appSourceRaw.slice(getterStart, appSourceRaw.indexOf('get integrityInvoiceColumns', getterStart));
  assert.doesNotMatch(getter, /tax_total\s*[*+\-/]/,
    'no arithmetic on the stored tax total — the shell never recalculates it');
  assert.doesNotMatch(getter, /tax_total\s*\+/,
    'no string or numeric addition on the stored tax total either');
});

// --- Tax form: date range + submit only, no presets (§7.4 default) ---

test('the tax form is the shared date range plus submit, with no presets', () => {
  const formStart = appSourceRaw.indexOf('(ngSubmit)="loadTaxSummary()"');
  assert.ok(formStart >= 0, 'missing tax form');
  const form = appSourceRaw.slice(formStart, appSourceRaw.indexOf('</form>', formStart));
  assert.ok(form.includes('<aba-date-range'), 'tax dates use the shared date-range component');
  assert.ok(form.includes('name="taxStartDate"'), 'tax start input is kept');
  assert.ok(form.includes('name="taxEndDate"'), 'tax end input is kept');
  assert.ok(form.includes('<button class="primary" type="submit"'),
    'the form submits through the Run report button');
  assert.ok(!form.includes('preset'),
    'no date presets in the tax form — §7.4 default is two inputs + clear only');
});
