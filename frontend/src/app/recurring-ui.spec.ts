import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const appSourceRaw = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const appSource = expandTranslationCalls(appSourceRaw);
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, Record<string, string>>;

// T18 U11 (2026-11-22): Recurring. The add-on-demand, per-row clarity and
// scheduler-warning rules live here as source assertions (no TestBed in the
// node runner), following the aba-icon.spec.ts / reports-ui.spec.ts /
// taxes-ui.spec.ts pattern. Baseline 2026-11-22 at 6643a89: one fixable
// defect — the next-run datetime-local showed only the date at 195px and a
// truncated time at 220px (same class as the U06 expense fix); fixed with the
// same 11px + 8px treatment, full value visible at 220px in both languages.
// The timezone value splits mid-token at every width in both languages
// ("America/Argentina/Buenos_Aires" as "Buenos_Ai"/"res", by the record-table
// tbody overflow-wrap:anywhere rule) — NOT fixed: an overflow-wrap:normal
// attempt was measured and reverted because it clipped the value instead
// (this Chromium does not break after '/' with overflow-wrap:normal —
// verified by a standalone probe — so the value overflows its cell). It
// stays the accepted U02/U07 email-split class: all characters visible,
// split across lines. Everything else already held: no page overflow,
// headings wrap on words, form fits, validation errors inside the panel,
// empty state inside the panel, interval "30 days" intact.

// --- Add on demand ---

test('recurring form opens on demand, not always visible', () => {
  assert.match(appSourceRaw, /showRecurringForm = false;/,
    'the form starts closed');
  assert.ok(appSourceRaw.includes('(click)="showRecurringForm = !showRecurringForm"'),
    'a header toggle opens and closes the form');
  assert.ok(appSourceRaw.includes("{{ showRecurringForm ? t('ui.m_pw64as') : t('ui.m_slegw7') }}"),
    'closed the toggle reads as the section title (U05 pattern), open it reads Cancel');
  const recurringStart = appSourceRaw.indexOf("@if (tab === 'recurring')");
  const recurringEnd = appSourceRaw.indexOf("@if (tab === 'health'", recurringStart);
  const recurringView = appSourceRaw.slice(recurringStart, recurringEnd);
  // The toggle is owner-gated (staff never see a dead add button) and the
  // form sits inside the owner gate AND the on-demand gate, in that order.
  assert.match(recurringView, /@if \(business\?\.role === 'owner'\) \{ <button class="secondary" type="button" \(click\)="showRecurringForm = !showRecurringForm"/);
  assert.match(recurringView, /@if \(business\?\.role === 'owner'\) \{\s*@if \(showRecurringForm\) \{\s*<form #recurringForm="ngForm"/);
  assert.doesNotMatch(recurringView, /@if \(business\?\.role === 'owner'\) \{\s*<form #recurringForm="ngForm"/,
    'the form is never rendered always-visible any more');
});

// --- Per-row clarity: customer / interval / next run / timezone / status ---

test('recurring list renders customer, interval, next run, timezone and status per row', () => {
  assert.ok(appSourceRaw.includes("{key:'customer',label:this.t('ui.m_ubgrc2'),primary:true}"),
    'one row per schedule, customer first');
  assert.ok(appSourceRaw.includes("{key:'interval',label:this.t('ui.m_soswtl')}"),
    'interval column present');
  assert.ok(appSourceRaw.includes("{key:'nextRun',label:this.t('ui.m_1e7ftdu')}"),
    'next-run column present');
  assert.ok(appSourceRaw.includes("{key:'timezone',label:this.t('ui.m_z76sxh')}"),
    'timezone column present');
  assert.ok(appSourceRaw.includes("{key:'status',label:this.t('ui.m_jnmvwl'),kind:'status'}"),
    'status column present');
  // Rows: customer name (or "Not assigned"), "N days", next run via the
  // shared date formatter, timezone verbatim, active/inactive status.
  assert.ok(appSourceRaw.includes("customer:item.customer_id?this.customerNameForInvoice(item.customer_id):this.t('ui.m_j3ewjv')"),
    'unassigned schedules read "Not assigned", never blank');
  assert.ok(appSourceRaw.includes("interval:`${item.interval_days} ${this.t('ui.m_5mk40x')}`"),
    'interval stays number + unit together');
  assert.ok(appSourceRaw.includes('nextRun:this.formatRecordDate(item.next_run_at)'),
    'next run renders through the shared date formatter');
  assert.ok(appSourceRaw.includes('timezone:item.timezone'),
    'timezone renders verbatim');
  assert.ok(appSourceRaw.includes("status:item.is_active?this.t('ui.m_1vhpjk3'):this.t('ui.m_vspcsf')"),
    'status reads Active / Inactive');
  assert.equal(english.ui.m_5mk40x, 'days');
  assert.equal(arabic.ui.m_5mk40x, 'يوم');
});

// --- Scheduler worker warning must not disappear ---

test('the scheduler worker warning stays visible on the recurring section', () => {
  // The warning is the section-header description — rendered always, outside
  // the on-demand form gate, so hiding the form can never hide the warning.
  const recurringStart = appSourceRaw.indexOf("@if (tab === 'recurring')");
  const headerStart = appSourceRaw.indexOf('<aba-section-header', recurringStart);
  const formIf = appSourceRaw.indexOf('@if (showRecurringForm)', recurringStart);
  assert.ok(headerStart >= 0 && formIf > headerStart,
    'the header (with the warning) comes before the on-demand form gate');
  const header = appSourceRaw.slice(headerStart, appSourceRaw.indexOf('</aba-section-header>', headerStart));
  assert.ok(header.includes(`[description]=" t('ui.m_1e0c20g') "`),
    'the header description carries the scheduler-worker warning');
  assert.equal(english.ui.m_1e0c20g,
    'These are schedule settings only; automatic invoice generation requires a deployed scheduler worker.');
  assert.equal(arabic.ui.m_1e0c20g,
    'هذه إعدادات الجدولة فقط؛ إنشاء الفواتير تلقائيًا يحتاج عامل جدولة منشورًا.');
});

// --- No scheduler/recurring semantic change ---

test('creating a recurring schedule keeps its current contract', () => {
  const methodStart = appSourceRaw.indexOf('async createRecurringSchedule(): Promise<void>');
  const methodEnd = appSourceRaw.indexOf('get maxIntegrityTotal()', methodStart);
  const method = appSourceRaw.slice(methodStart, methodEnd);
  assert.ok(method.includes("if (!this.business || this.business.role !== 'owner') return;"),
    'only owners can create schedules');
  assert.ok(method.includes('await this.api.createRecurringSchedule(businessId, {'),
    'creation still goes through the same API call');
  assert.ok(method.includes('customer_id: this.recurringCustomerId || null,'),
    'customer stays optional');
  assert.ok(method.includes('interval_days: interval,'),
    'interval still posts as a number of days');
  assert.ok(method.includes("timezone: this.recurringTimezone.trim() || 'UTC',"),
    'timezone still posts trimmed, defaulting to UTC');
  assert.ok(method.includes('next_run_at: new Date(this.recurringNextRunAt).toISOString(),'),
    'next run still posts as an ISO instant');
  assert.match(method, /interval < 1 \|\| interval > 3650/,
    'the 1–3650 day validation is unchanged');
});

// --- Form fields keep their contract ---

test('recurring form fields keep their contract', () => {
  const formStart = appSourceRaw.indexOf('<form #recurringForm="ngForm"');
  const form = appSourceRaw.slice(formStart, appSourceRaw.indexOf('</form>', formStart));
  assert.ok(form.includes('name="recurringCustomerId" [(ngModel)]="recurringCustomerId"'),
    'customer select kept');
  assert.doesNotMatch(form, /name="recurringCustomerId"[^>]*required/,
    'customer stays optional');
  assert.ok(form.includes('name="recurringIntervalDays" type="number" min="1" max="3650" required'),
    'interval is a required number from 1 to 3650 days');
  assert.ok(form.includes('name="recurringNextRunAt" type="datetime-local" required'),
    'next run is a required datetime-local');
  assert.ok(form.includes('name="recurringTimezone" required maxlength="64"'),
    'timezone is required, up to 64 characters');
  assert.ok(form.includes('{{ t(\'ui.m_r0fiju\') }}'),
    'submit still reads "Save schedule"');
  assert.equal(english.ui.m_r0fiju, 'Save schedule');
  assert.equal(arabic.ui.m_r0fiju, 'حفظ الجدولة');
});
