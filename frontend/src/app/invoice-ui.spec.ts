import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const appSource = expandTranslationCalls(
  readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8')
);
const editorSource = expandTranslationCalls(readFileSync(new URL('./invoice-draft-editor.component.ts', import.meta.url), 'utf8'));
// 3A-921 F1d: the splash lives in the auth screen component now.
const authScreenSource = expandTranslationCalls(readFileSync(new URL('./auth-screen.component.ts', import.meta.url), 'utf8'));
// 3A-921 F1b: the detail drawer was extracted verbatim into its own component.
const drawerSource = expandTranslationCalls(readFileSync(new URL('./invoice-detail-drawer.component.ts', import.meta.url), 'utf8'));
const searchFieldSource = readFileSync(new URL('./shared/ui/aba-search-field.component.ts', import.meta.url), 'utf8');
const designSystemSource = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');

test('editor back navigation mirrors correctly for RTL and LTR', () => {
  assert.match(editorSource, /language === 'ar' \? '→' : '←'/);
});
const cardStart = appSource.indexOf('<div class="invoice-cards">');
const cardEnd = appSource.indexOf('\n                  </div>', cardStart);
const cardMarkup = cardStart >= 0 && cardEnd > cardStart ? appSource.slice(cardStart, cardEnd) : '';

test('invoice cards show a compact customer avatar and keep the name as the primary identity', () => {
  assert.ok(cardMarkup, 'invoice card template must exist');
  assert.match(cardMarkup, /class="invoice-customer-avatar"/);
  assert.match(cardMarkup, /customerInitialForInvoice\(invoice\.customer_id\)/);
  assert.match(cardMarkup, /class="invoice-card-customer-copy"/);
  assert.match(cardMarkup, /class="invoice-card-meta"/);
  assert.match(appSource, /\.invoice-card-customer strong\{font-size:14px/);
  assert.match(appSource, /\.invoice-customer-avatar\{[^}]*width:38px;height:38px/);
});

test('invoice cards align total, server-allocated paid amount, and server outstanding balance under their labels', () => {
  assert.match(appSource, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(cardMarkup, /t\('الإجمالي', 'Total'\)[\s\S]*?invoice\.total/);
  assert.match(cardMarkup, /t\('المدفوع', 'Paid'\)[\s\S]*?invoice\.allocated_payments/);
  assert.match(cardMarkup, /t\('المتبقي', 'Remaining'\)[\s\S]*?invoice\.outstanding_amount/);
  assert.match(cardMarkup, /invoice\.currency_code/);
  assert.doesNotMatch(cardMarkup, /invoice\.total \| number:'1\.2-2' \}\} \{\{ invoice\.currency_code/);
});

test('payment state and progress require server-returned allocations and outstanding balance', () => {
  assert.match(appSource, /invoicePaymentTone\(invoice: Invoice\)/);
  assert.match(appSource, /invoice\.allocated_payments === undefined \|\| invoice\.outstanding_amount === undefined/);
  assert.match(appSource, /invoicePaymentProgress\(invoice: Invoice\): number \| null/);
  assert.match(cardMarkup, /class="invoice-payment-progress"/);
  assert.match(cardMarkup, /role="progressbar"/);
  assert.match(cardMarkup, /status-paid/);
  assert.match(cardMarkup, /status-partial/);
  assert.match(cardMarkup, /status-unpaid/);
});

test('invoice cards remain the default while compact mode provides a sortable table and bounded pagination', () => {
  assert.match(appSource, /invoiceDensity: 'comfortable' \| 'compact' = 'comfortable'/);
  assert.match(appSource, /class="[^"]*invoice-density-toggle"/);
  assert.match(appSource, /class="invoice-table-wrap"/);
  assert.match(appSource, /class="invoice-table"/);
  assert.match(appSource, /aria-sort/);
  assert.match(appSource, /toggleInvoiceSort\('total'\)/);
  assert.match(appSource, /invoice-pagination/);
  assert.match(appSource, /invoicePageSize = 10/);
  assert.match(appSource, /@for \(invoice of visibleInvoices; track invoice\.id\)/);
  assert.match(appSource, /\.invoice-cards\{display:grid;grid-template-columns:repeat\(auto-fit/);
  assert.match(appSource, /\.invoice-card \.invoice-actions button\{min-height:44px\}/);
  assert.match(appSource, /\.invoice-cards\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('Product and Service use a segmented toggle with no reorder controls or large add buttons', () => {
  assert.match(editorSource, /class="line-kind-switch"/);
  assert.match(editorSource, /class="kind-option"/);
  assert.match(editorSource, /changeKind\(line, 'product'\)/);
  assert.match(editorSource, /changeKind\(line, 'manual'\)/);
  assert.match(editorSource, /Add another line/);
  assert.doesNotMatch(editorSource, /Move up|Move down|\bmoveLine\b|line-kind-select|class="add-actions"/);
});


// Owner rule (2026-11-25): the release line «Version X — Published [date
// time]» is prominent on the splash AND inside the app shell (sidebar +
// mobile More menu), built from the build metadata (APP_BUILD_INFO).
test('startup screen and shell show the release line beneath release versions', () => {
  assert.match(authScreenSource, /class="splash-release-meta"[\s\S]*?class="version-pill splash-version"[\s\S]*?class="release-line splash-release-line"/);
  assert.match(appSource, /class="release-line sidebar-release-line"/);
  assert.match(appSource, /class="release-line mobile-more-release"/);
  assert.match(appSource, /get releaseLineLabel\(\): string/);
  assert.match(appSource, /— Published \{\{publishedAt\}\}/);
  assert.match(appSource, /@if \(loading && initialized\) \{ <div class="global-loading"/);
  assert.match(authScreenSource, /\.splash-release-meta\{display:grid;justify-items:center/);
  assert.match(appSource, /get buildTimeLabel\(\): string/);
  assert.match(appSource, /timeZone: 'Africa\/Cairo'/);
});

// T18 Slice E (2026-11-21): the invoice search input and its icon moved into
// aba-search-field, and the clearance rules moved with them (48px/42px input
// padding, 15px icon inset, hidden native search decorations). The old
// .invoice-search CSS in app.component.css was deleted with the duplicated
// markup; the component owns the clearance now.
test('invoice search icon stays clear of search text in RTL and LTR', () => {
  assert.match(searchFieldSource, /padding-inline-start:48px;padding-inline-end:42px/);
  assert.match(searchFieldSource, /\.aba-search-field__icon\{[^}]*inset-inline-start:15px/);
  assert.match(searchFieldSource, /input::-webkit-search-decoration/);
  assert.match(searchFieldSource, /input::-webkit-search-cancel-button\{display:none\}/);
  assert.match(designSystemSource, /\.invoice-controls aba-search-field,/);
  assert.match(appSource, /<aba-search-field class="invoice-search" name="invoiceSearch"/);
});

test('invoice editor selectors, catalog prices and read-only rate fields are clearly distinguished', () => {
  assert.match(appSource, /\.invoice-filter select\{width:100%;min-width:0;font-weight:400\}/);
  assert.match(editorSource, /class="invoice-customer-select"/);
  assert.match(editorSource, /class="readonly-field"/);
  assert.match(editorSource, /linePrice\(line\)/);
  assert.match(editorSource, /name="invoiceDiscountRate"[^>]*readonly aria-readonly="true"/);
  assert.match(editorSource, /name="invoiceTaxRate"[^>]*readonly aria-readonly="true"/);
});

test('invoice editor groups details, line items, server totals and notes in the approved layout', () => {
  assert.match(editorSource, /aria-labelledby="invoice-details-heading"/);
  assert.match(editorSource, /aria-labelledby="invoice-lines-heading"/);
  assert.match(editorSource, /aria-labelledby="invoice-summary-heading"/);
  assert.match(editorSource, /aria-labelledby="invoice-notes-heading"/);
  assert.match(editorSource, /class="line-fields product-line"/);
  assert.match(editorSource, /class="line-fields service-line"/);
  assert.match(editorSource, /class="summary-total"/);
  assert.match(editorSource, /formatNumber\(serverSummary\.total\)/);
  assert.match(editorSource, /No amounts are estimated in the browser/);
  assert.match(editorSource, /maxlength="2000"/);
});

test('discount and tax rates stay side by side and read-only while amounts come from the server', () => {
  assert.match(editorSource, /class="readonly-rates"/);
  assert.match(editorSource, /name="invoiceDiscountRate"[^>]*readonly aria-readonly="true"/);
  assert.match(editorSource, /name="invoiceTaxRate"[^>]*readonly aria-readonly="true"/);
  assert.match(editorSource, /serverSummary\?\.discount_total/);
  assert.match(editorSource, /serverSummary\?\.tax_total/);
  assert.match(editorSource, /formatNumber\(serverSummary\.total\)/);
  assert.doesNotMatch(editorSource, /\[\(ngModel\)\]="(?:discountRate|taxRate)"/);
});

test('invoice notes are hydrated for editing and submitted with the existing draft payload', () => {
  assert.match(editorSource, /name="invoiceNotes"/);
  assert.match(editorSource, /maxlength="2000"/);
  assert.match(editorSource, /notes: this\.notes/);
});


test('customer invoice shortcut resets compact pagination before applying its filter', () => {
  const start = appSource.indexOf('showCustomerInvoices(customerId: string): void');
  const end = appSource.indexOf('\n  }', start);
  const handler = appSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /this\.invoicePageIndex = 0/);
  assert.ok(handler.indexOf('this.invoicePageIndex = 0') < handler.indexOf('this.invoiceFilterCustomerId = customerId'));
});


test('invoice workspace has count-backed status chips and a compact three-up summary', () => {
  assert.match(appSource, /class="invoice-summary-cards"/);
  assert.match(appSource, /invoiceStatusCounts\.all/);
  assert.match(appSource, /invoiceStatusCounts\.draft/);
  assert.match(appSource, /invoiceStatusCounts\.issued/);
  assert.match(appSource, /class="invoice-status-chips" role="group"/);
  assert.match(appSource, /aria-pressed/);
  assert.match(appSource, /setInvoiceStatusFilter\('void'\)/);
  assert.match(appSource, /\.invoice-summary-cards\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(appSource, /\.invoice-status-chips\{[^}]*flex-wrap:wrap/s);
});

test('invoice detail is a tenant-guarded read-only slide-over using persisted line and total fields', () => {
  assert.match(appSource, /openInvoiceDetails\(invoice: Invoice, event\?: Event\)/);
  assert.match(appSource, /this\.api\.invoiceDetail\(businessId, invoice\.id\)/);
  assert.match(appSource, /this\.business\?\.id !== businessId/);
  assert.match(drawerSource, /role="dialog" aria-modal="true"/);
  assert.match(drawerSource, /class="invoice-detail-lines"/);
  assert.match(drawerSource, /detail\.lines/);
  assert.match(drawerSource, /detail\.subtotal/);
  assert.match(drawerSource, /detail\.discount_total/);
  assert.match(drawerSource, /detail\.tax_total/);
  assert.match(drawerSource, /detail\.total/);
  assert.match(appSource, /editInvoiceFromDetails\(\)/);
  assert.match(appSource, /issueInvoiceFromDetails\(\)/);
  assert.match(appSource, /payInvoiceFromDetails\(\)/);
});

test('invoice list uses the existing authenticated limit/offset endpoint without a contract extension', () => {
  const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
  assert.match(apiSource, /invoices\(businessId: string, offset = 0, limit = 100\)/);
  assert.match(apiSource, /\?limit=\$\{limit\}&offset=\$\{offset\}/);
  assert.match(appSource, /loadMoreInvoices\(\)/);
});


test('invoice tables and slide-over preserve explicit RTL/LTR direction and accessible dialog semantics', () => {
  assert.match(appSource, /<table class="invoice-table" \[attr\.dir\]="language === 'ar' \? 'rtl' : 'ltr'"/);
  assert.match(drawerSource, /class="invoice-detail-drawer" role="dialog" aria-modal="true"/);
  assert.match(drawerSource, /aria-labelledby="invoice-detail-heading"/);
  assert.match(drawerSource, /invoiceDetailCloseButton/);
});

// T18 Slice U04 (2026-11-21): the invoice list and drawer stay readable at
// narrow widths, export tools are secondary, and the editor hides its delete
// control when only one line remains. Measured at d185578 with a 548,525.00
// EGP fixture: amounts split into 2-3 lines at 195/220, the customer name
// split mid-word into 8-27 lines, the drawer lines table scrolled at
// 195/220/390, and the drawer totals split across 2 lines.

test('invoice export tools render as secondary actions', () => {
  assert.match(appSource, /class="secondary invoice-export"/);
  assert.match(appSource, /class="secondary invoice-load-more-customers"/);
  assert.match(appSource, /class="secondary invoice-density-toggle"/);
});

test('invoice card amounts stay intact and stack below 320px', () => {
  assert.match(appSource, /\.invoice-card-financials strong\{[^}]*white-space:nowrap;overflow-wrap:normal/);
  assert.match(appSource, /@media\(max-width:320px\)\{[\s\S]*?\.invoice-card-financials\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(appSource, /@media\(max-width:320px\)\{[\s\S]*?\.invoice-summary-cards\{grid-template-columns:minmax\(0,1fr\)\}/);
  // The pre-existing <=760px block re-asserts the 3-column summary cards;
  // same-specificity rules later in the file win, so the narrow rule must
  // come after it or the cards stay 3-up at 195px.
  const summaryNarrow = appSource.indexOf('.invoice-summary-cards{grid-template-columns:minmax(0,1fr)}');
  const summaryWide = appSource.indexOf('.invoice-summary-cards{grid-template-columns:repeat(3,minmax(0,1fr))');
  assert.ok(summaryNarrow > summaryWide, 'narrow summary rule must come after the 3-column rule');
});

test('invoice card customer name wraps on words with a stacked header below 380px', () => {
  assert.match(appSource, /\.invoice-card-customer strong\{[^}]*overflow-wrap:normal/);
  assert.match(appSource, /\.invoice-card-meta\{[^}]*overflow-wrap:normal/);
  assert.match(appSource, /\.invoice-card-meta-date\{white-space:nowrap\}/);
  assert.match(appSource, /@media\(max-width:380px\)\{[\s\S]*?\.invoice-card-header\{flex-wrap:wrap\}/);
  assert.match(appSource, /@media\(max-width:380px\)\{[\s\S]*?\.invoice-card-customer\{flex:1 1 100%;min-width:0\}/);
});

test('invoice detail lines stack with labels below 480px and totals stay intact', () => {
  assert.match(drawerSource, /\[attr\.data-label\]="t\('[^']*', 'Quantity'\)"/);
  assert.match(drawerSource, /\[attr\.data-label\]="t\('[^']*', 'Unit price'\)"/);
  assert.match(drawerSource, /\[attr\.data-label\]="t\('[^']*', 'Line total'\)"/);
  assert.match(drawerSource, /\.invoice-detail-totals dd\{[^}]*white-space:nowrap/);
  assert.match(drawerSource, /\.invoice-detail-meta strong bdi\{white-space:nowrap\}/);
  assert.match(drawerSource, /@media\(max-width:480px\)\{[\s\S]*?\.invoice-detail-lines-wrap\{overflow-x:visible\}/);
  assert.match(drawerSource, /@media\(max-width:480px\)\{[\s\S]*?\.invoice-detail-lines thead\{position:absolute/);
  assert.match(drawerSource, /@media\(max-width:480px\)\{[\s\S]*?\.invoice-detail-lines tbody tr\{display:grid/);
  assert.match(drawerSource, /@media\(max-width:480px\)\{[\s\S]*?\.invoice-detail-lines td\[data-label\]::before\{content:attr\(data-label\)/);
  assert.match(drawerSource, /@media\(max-width:380px\)\{[\s\S]*?\.invoice-detail-meta\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(drawerSource, /@media\(max-width:380px\)\{[\s\S]*?\.invoice-detail-totals>div\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  // The pre-existing <=760px block re-asserts the 2-column drawer meta;
  // same-specificity rules later in the file win, so the narrow rule must
  // come after it or the meta stays 2-up and overflows at 195px.
  const metaNarrow = drawerSource.indexOf('.invoice-detail-meta{grid-template-columns:minmax(0,1fr)}');
  const metaWide = drawerSource.indexOf('.invoice-detail-meta{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}');
  assert.ok(metaNarrow > metaWide, 'narrow meta rule must come after the 2-column rule');
});

test('editor delete control is hidden when only one line item remains', () => {
  assert.match(editorSource, /@if \(lines\.length > 1\) \{[\s\S]*?class="remove-line"/);
  assert.doesNotMatch(editorSource, /\[disabled\]="locked \|\| lines\.length <= 1"/);
  const draftSource = readFileSync(new URL('./invoice-draft.ts', import.meta.url), 'utf8');
  assert.match(draftSource, /lines\.length <= 1\) return/);
});

test('editor title, line controls and rate fields stack below 380px', () => {
  // At 195px the title column was ~31px wide ("Create a new invoice" broke
  // into single letters) and the Product/Service switch, Remove button and
  // Discount/Tax fields all broke mid-word in ~55px columns.
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.editor-topbar\{grid-template-columns:42px minmax\(0,1fr\)\}/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.draft-status\{grid-column:1\/-1;justify-self:start/);
  assert.match(editorSource, /\.editor-title h3\{[^}]*overflow-wrap:normal/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.line-card-heading\{flex-wrap:wrap\}/);
  assert.match(editorSource, /\.remove-line\{[^}]*white-space:nowrap/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.line-kind-switch\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.kind-option\{padding:7px 8px;overflow-wrap:normal\}/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.readonly-rates\{grid-template-columns:minmax\(0,1fr\)/);
});

test('screen-reader-only utility exists so the invoices heading stays hidden', () => {
  assert.match(appSource, /<h2 id="invoices-section-title" class="sr-only">/);
  assert.match(designSystemSource, /:root body \.shell \.sr-only\{position:absolute!important;width:1px!important/);
});

// T18 U04 fix (2026-11-21): four defects from the coordinator's independent
// real-Chrome renders at 195/220, EN+AR. (1) The sticky Cancel / Save draft
// buttons clipped their labels at both edges (the two-column grid gave
// Cancel ~39px and Save draft ~58px at 195px for ~40px/~61px of centred
// nowrap text). (2) The customer select showed only the tail of a long name
// ("Company"): a native select clips at the end its direction points to.
// (3) The invoice-number value was cut at the start in AR (RTL input).
// (4) The list-card name/meta boxes stretched ~11px past the card's content
// edge at EN 195px (the nowrap "Created: 3 Nov 2026" span's min-content
// exceeded the ~94px copy column). Classes kept separate: defects 2 and 3
// are field text (reachable by scrolling inside the field); defects 1 and 4
// are content cut off with no way to read it.

test('editor sticky actions stack below 380px so Cancel and Save draft stay readable', () => {
  assert.match(editorSource, /\.action-buttons\{display:grid;grid-template-columns:minmax\(0,\.8fr\) minmax\(0,1\.2fr\)\}/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.editor-actions\{padding:12px\}/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.action-buttons\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(editorSource, /@media\(max-width:380px\)\{[\s\S]*?\.primary-action,\.secondary-action\{white-space:normal\}/);
});

test('invoice number input is LTR so its value is cut at the end, never the start', () => {
  assert.match(editorSource, /<input name="invoiceNumber" dir="ltr"/);
});

test('customer select direction follows the selected name script, not the UI language', () => {
  assert.match(editorSource, /\[attr\.dir\]="customerSelectDir"/);
  assert.match(editorSource, /get customerSelectDir\(\): 'ltr' \| 'rtl'/);
  assert.match(editorSource, /customers\.find\(customer => customer\.id === this\.customerId\)/);
  assert.match(editorSource, /\\u0590-\\u05FF\\u0600-\\u06FF/);
  assert.match(editorSource, /\[A-Za-z\]/);
  assert.match(editorSource, /return this\.language === 'ar' \? 'rtl' : 'ltr'/);
  // `unicode-bidi: plaintext` does not change select rendering in Chromium
  // (verified by experiment: identical screenshots); the script-aware
  // direction is the fix, not a bidi override.
  assert.doesNotMatch(editorSource, /unicode-bidi:plaintext/);
});

test('invoice card meta keeps the date intact while the Created prefix wraps', () => {
  assert.ok(cardMarkup, 'invoice card template must exist');
  assert.match(cardMarkup, /invoice\.issue_date \? '' : \(invoice\.created_at \? t\('[^']*', '[^']*'\) : ''\) \}\}<span class="invoice-card-meta-date">/);
  assert.match(cardMarkup, /<span class="invoice-card-meta-date">\{\{ invoice\.issue_date \? formatRecordDate\(invoice\.issue_date, 'date'\) : \(invoice\.created_at \? formatRecordDate\(invoice\.created_at, 'date'\)/);
  assert.doesNotMatch(cardMarkup, /\+ formatRecordDate\(invoice\.created_at, 'date'\)/);
  assert.match(appSource, /\.invoice-card-meta-date\{white-space:nowrap\}/);
});

test('invoice card copy cannot stretch past the card below 220px', () => {
  assert.match(appSource, /@media\(max-width:220px\)\{[\s\S]*?\.invoice-card-customer-copy>\*\{min-width:0\}/);
  // The <=220px block must come after the <=380px U04 block so it wins at
  // equal specificity.
  const copyNarrow = appSource.indexOf('.invoice-card-customer-copy>*{min-width:0}');
  const headerNarrow = appSource.indexOf('.invoice-card-header{flex-wrap:wrap}');
  assert.ok(copyNarrow > headerNarrow, '220px copy rule must come after the 380px card rules');
});
