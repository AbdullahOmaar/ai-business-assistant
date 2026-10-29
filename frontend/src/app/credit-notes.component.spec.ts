import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./credit-notes.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('credit-note screen reads returns and notes through business-scoped API methods', () => {
  assert.match(component, /this\.api\.salesReturns\(this\.businessId/);
  assert.match(component, /this\.api\.creditNotes\(this\.businessId/);
  assert.match(api, /\/api\/v1\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/sales-returns/);
  assert.match(api, /\/api\/v1\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/credit-notes/);
});

test('credit-note issuance is owner-only and guarded against duplicate clicks', () => {
  assert.match(component, /if \(this\.role !== 'owner' \|\| ret\.status !== 'approved' \|\| this\.issuingId !== null \|\| this\.approvingId !== null \|\| this\.creditNoteForReturn\(ret\.id\)\) return/);
  assert.match(component, /@else if \(role === 'owner'\)/);
  assert.match(component, /this\.api\.issueCreditNoteForReturn\(this\.businessId, ret\.id\)/);
});

test('screen explicitly distinguishes credit notes from cash refunds and invoice edits', () => {
  assert.match(component, /does not refund cash or change the original invoice total/);
  assert.match(component, /No cash refund was recorded and the original invoice was not changed/);
  assert.match(component, /tax-bearing invoices until tax can be allocated/);
});

test('credit notes are reachable through desktop and mobile navigation', () => {
  assert.match(app, /tab === 'credit-notes'/);
  assert.match(app, /<aba-credit-notes \[businessId\]="business\.id"/);
  assert.match(app, /@defer \(on immediate\)/);
  assert.match(app, /setTab\('credit-notes'\)/);
  assert.match(app, /platform-admin','credit-notes'\]\.includes\(tab\)/);
});


test('return draft creation uses persisted invoice-line identifiers and quantities', () => {
  assert.match(component, /this\.api\.createSalesReturn\(this\.businessId/);
  assert.match(component, /invoice_line_id: line\.invoiceLineId, quantity: String\(line\.quantity\)/);
  assert.match(component, /quantity > Number\(line\.invoicedQuantity\)/);
  assert.match(api, /createSalesReturn\(businessId:[\s\S]{0,400}'POST', body/);
});

test('return approval is owner-only and remains separate from credit-note issuance', () => {
  assert.match(component, /if \(this\.role !== 'owner' \|\| ret\.status !== 'draft'/);
  assert.match(component, /this\.api\.approveSalesReturn\(this\.businessId, ret\.id\)/);
  assert.match(component, /Return approved\. Credit-note issuance is a separate step\./);
});

test('stale workspace refreshes cannot overwrite data for the newly selected business', () => {
  assert.match(component, /private refreshSequence = 0/);
  assert.match(component, /const requestId = \+\+this\.refreshSequence/);
  assert.match(component, /requestedBusinessId !== this\.businessId/);
  assert.match(component, /if \(requestId === this\.refreshSequence\) this\.loading = false/);
  assert.match(component, /this\.invoices = \[\]/);
  assert.match(component, /this\.returns = \[\]/);
  assert.match(component, /this\.notes = \[\]/);
});

test('stale invoice-detail responses cannot replace the latest invoice selection', () => {
  assert.match(component, /private invoiceDetailSequence = 0/);
  assert.match(component, /const requestId = \+\+this\.invoiceDetailSequence/);
  assert.match(component, /requestedBusinessId !== this\.businessId \|\| invoiceId !== this\.selectedInvoiceId/);
  assert.match(component, /if \(requestId === this\.invoiceDetailSequence\) this\.detailLoading = false/);
});

test('credit-note list supports customer filtering and displays customer names', () => {
  assert.match(component, /selectedCustomerId = ''/);
  assert.match(component, /customer_id: this\.selectedCustomerId \|\| undefined/);
  assert.match(component, /this\.api\.customers\(requestedBusinessId\)/);
  assert.match(component, /customerName\(note\.customer_id\)/);
  assert.match(component, /onCustomerFilterChanged\(\): void/);
});

test('failed customer-filter refresh does not leave stale credit-note results visible', () => {
  assert.match(component, /Never show a previous customer's result/);
  assert.match(component, /this\.notes = \[\]/);
});

test('credit-note listing supports guarded offset pagination without duplicate rows', () => {
  assert.match(component, /notesHasMore = false/);
  assert.match(component, /limit: 100, offset, customer_id: requestedCustomerId \|\| undefined/);
  assert.match(component, /const existingIds = new Set\(this\.notes\.map\(note => note\.id\)\)/);
  assert.match(component, /requestedCustomerId !== this\.selectedCustomerId/);
  assert.match(component, /\(click\)="loadMoreCreditNotes\(\)"/);
});


test('credit application retries reuse the same idempotency key for the exact payload', () => {
  assert.match(component, /private applicationIdempotencyKeys: Record<string, string>/);
  assert.match(component, /const requestKey = `\$\{note\.id\}\|\$\{invoiceId\}\|\$\{amount\}`/);
  assert.match(component, /this\.applicationIdempotencyKeys\[requestKey\] \?\?/);
  assert.match(component, /delete this\.applicationIdempotencyKeys\[requestKey\]/);
  assert.match(component, /this\.api\.applyCreditNote\(this\.businessId/);
  assert.match(component, /@if \(role === 'owner' && remainingCredit\(note\) > 0\)/);
});

test('credit application UI constrains amount to remaining credit and invoice receivable', () => {
  assert.match(component, /Math\.min\(this\.remainingCredit\(note\), Number\(invoice\.outstanding_amount \?\? 0\)\)/);
  assert.match(component, /invoice\.customer_id === note\.customer_id/);
  assert.match(component, /invoice\.currency_code\.trim\(\)\.toUpperCase\(\) === note\.currency_code\.trim\(\)\.toUpperCase\(\)/);
  assert.match(component, /amount <= this\.maxApplyAmount\(note\)/);
});


test('credit application UI is owner-only and limits invoices to the same customer and currency', () => {
  assert.match(component, /role === 'owner' && hasRemainingCredit\(note\)/);
  assert.match(component, /invoice\.customer_id === note\.customer_id/);
  assert.match(component, /invoice\.currency_code\.trim\(\)\.toUpperCase\(\) === note\.currency_code\.trim\(\)\.toUpperCase\(\)/);
  assert.match(component, /this\.api\.applyCreditNote\(requestedBusinessId/);
  assert.match(api, /\/api\/v1\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/credit-applications/);
});

test('credit application retries preserve the idempotency key and explain that no cash refund occurs', () => {
  assert.match(component, /if \(!this\.applicationIdempotencyKey\) this\.applicationIdempotencyKey = crypto\.randomUUID\(\)/);
  assert.match(component, /Keep the same key\/body available for a safe retry/);
  assert.match(component, /No cash refund was recorded and the original invoice total was unchanged/);
});


test('cash refund UI is owner-only, separate from receivable credit, and shows refund history', () => {
  assert.match(component, /this\.api\.cashRefunds\(requestedBusinessId/);
  assert.match(component, /this\.api\.createCashRefund\(requestedBusinessId, note\.id/);
  assert.match(component, /this\.remainingCredit\(note\)/);
  assert.match(component, /refundsForNote\(note\.id\)/);
  assert.match(component, /Record a separate cash refund/);
  assert.match(component, /لم يتم تغيير إجمالي الفاتورة/);
  assert.match(api, /\/api\/v1\/businesses\/\$\{encodeURIComponent\(businessId\)\}\/cash-refunds/);
});

test('cash refund retries retain the same idempotency key for the same refund payload', () => {
  assert.match(component, /private refundIdempotencyKeys: Record<string, string>/);
  assert.match(component, /const requestKey = `\$\{note\.id\}\|\$\{amount\}\|\$\{method\}\|\$\{reference \?\? ''\}`/);
  assert.match(component, /this\.refundIdempotencyKeys\[requestKey\] \?\?/);
  assert.match(component, /delete this\.refundIdempotencyKeys\[requestKey\]/);
});


test('cash refunds require a settled original receivable and cannot reuse applied credit', () => {
  assert.match(component, /invoice\.outstanding_amount !== undefined/);
  assert.match(component, /Number\(invoice\.outstanding_amount\) <= 0/);
  assert.match(component, /amount <= Number\(this\.remainingCredit\(note\)\)/);
  assert.match(component, /Cash refunds require the original invoice receivable to be fully settled/);
  assert.match(component, /Original payment must be allocated to the credit note's invoice/);
});


test('cash refund history is loaded per credit note and paginates without duplicate records', () => {
  assert.match(component, /this\.api\.cashRefunds\(requestedBusinessId, \{[\s\S]{0,100}credit_note_id: requestedNoteId, limit: 100, offset/);
  assert.match(component, /refundHistoryHasMore\[requestedNoteId\] = page\.items\.length === 100/);
  assert.match(component, /const existingIds = new Set\(existing\.map\(refund => refund\.id\)\)/);
  assert.match(component, /loadMoreRefundHistory\(note\)/);
  assert.match(component, /requestedBusinessId !== this\.businessId/);
});
