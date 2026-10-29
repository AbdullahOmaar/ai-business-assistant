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
