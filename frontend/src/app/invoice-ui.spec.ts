import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('./invoice-draft-editor.component.ts', import.meta.url), 'utf8');
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

test('invoice cards are the primary responsive layout rather than a desktop-only table replacement', () => {
  assert.match(appSource, /\.invoice-table-wrap\{display:none\}/);
  assert.match(appSource, /\.invoice-cards\{display:grid;grid-template-columns:repeat\(auto-fit/);
  assert.match(appSource, /\.invoice-cards\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('Product and Service use a segmented toggle with no reorder controls or large add buttons', () => {
  assert.match(editorSource, /class="line-kind-switch"/);
  assert.match(editorSource, /class="kind-option"/);
  assert.match(editorSource, /changeKind\(line, 'product'\)/);
  assert.match(editorSource, /changeKind\(line, 'manual'\)/);
  assert.match(editorSource, /Add another line/);
  assert.doesNotMatch(editorSource, /Move up|Move down|moveLine|line-kind-select|class="add-actions"/);
});


test('startup screen shows the Cairo-localized build date and time beneath release versions', () => {
  assert.match(appSource, /class="splash-build-time"/);
  assert.match(appSource, /Build date & time/);
  assert.match(appSource, /get buildTimeLabel\(\): string/);
  assert.match(appSource, /timeZone: 'Africa\/Cairo'/);
});

test('invoice search icon stays clear of search text in RTL and LTR', () => {
  assert.match(appSource, /\.invoice-search input\{[^}]*padding-inline:42px 38px;appearance:none;-webkit-appearance:none;direction:inherit/);
  assert.match(appSource, /\.invoice-search-icon\{[^}]*inset-inline-start:14px/);
  assert.match(appSource, /\.invoice-search input::-webkit-search-decoration/);
});

test('invoice editor selectors, catalog prices and read-only rate fields are clearly distinguished', () => {
  assert.match(appSource, /\.invoice-filter select\{width:100%;min-width:0;font-weight:400\}/);
  assert.match(editorSource, /class="invoice-customer-select"/);
  assert.match(editorSource, /class="readonly-field"/);
  assert.match(editorSource, /productPrice\(line\.product_id\)/);
  assert.match(editorSource, /name="invoiceDiscountRate"[^>]*readonly aria-readonly="true"/);
  assert.match(editorSource, /name="invoiceTaxRate"[^>]*readonly aria-readonly="true"/);
});

test('invoice editor groups details, line items, server totals and notes in the approved layout', () => {
  assert.match(editorSource, /aria-labelledby="invoice-details-heading"/);
  assert.match(editorSource, /aria-labelledby="invoice-lines-heading"/);
  assert.match(editorSource, /aria-labelledby="invoice-summary-heading"/);
  assert.match(editorSource, /aria-labelledby="invoice-notes-heading"/);
  assert.match(editorSource, /class="product-line"/);
  assert.match(editorSource, /class="service-line"/);
  assert.match(editorSource, /class="summary-total"/);
  assert.match(editorSource, /serverSummary\.total \| number:'1\.2-2'/);
  assert.match(editorSource, /No amounts are estimated in the browser/);
  assert.match(editorSource, /maxlength="2000"/);
});

test('discount and tax rates stay side by side and read-only while amounts come from the server', () => {
  assert.match(editorSource, /class="readonly-rates"/);
  assert.match(editorSource, /name="invoiceDiscountRate"[^>]*readonly aria-readonly="true"/);
  assert.match(editorSource, /name="invoiceTaxRate"[^>]*readonly aria-readonly="true"/);
  assert.match(editorSource, /serverSummary\?\.discount_total/);
  assert.match(editorSource, /serverSummary\?\.tax_total/);
  assert.match(editorSource, /serverSummary\.total \| number:'1\.2-2'/);
  assert.doesNotMatch(editorSource, /\[\(ngModel\)\]="(?:discountRate|taxRate)"/);
});

test('invoice notes are hydrated for editing and submitted with the existing draft payload', () => {
  assert.match(editorSource, /name="invoiceNotes"/);
  assert.match(editorSource, /maxlength="2000"/);
  assert.match(editorSource, /notes: this\.notes/);
});
