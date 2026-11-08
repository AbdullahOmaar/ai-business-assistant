import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

function methodBetween(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Unable to locate method: ${startMarker}`);
  return source.slice(start, end);
}

test('invoice drafts use the dedicated mixed-line editor and never calculate browser totals', () => {
  assert.match(source, /<aba-invoice-draft-editor/);
  assert.match(source, /\(saveDraft\)="saveInvoiceDraft\(\$event\)"/);
  assert.doesNotMatch(source, /get invoicePreview\(/);
  assert.match(source, /serverSummary\]="invoiceDraftSummary"/);
});

test('invoice create and edit requests send mixed line payloads and display server-returned totals', () => {
  const save = methodBetween('async saveInvoiceDraft(payload: InvoiceDraftPayload)', 'private escapePrintHtml');
  assert.match(save, /this\.api\.createInvoice\(businessId, request\)/);
  assert.match(save, /this\.api\.updateDraftInvoice\(businessId, editingInvoiceId, request\)/);
  assert.match(save, /total: saved\.total/);
  const edit = methodBetween('async editInvoice(invoice: Invoice)', 'cancelInvoiceEdit(): void');
  assert.match(edit, /invoiceDraftLinesFromExisting\(detail\.lines\)/);
  assert.match(edit, /this\.invoiceEditRequestGuard\.begin\(\)/);
});

test('invoice draft mutations are fenced by workspace, user, role and auth generation', () => {
  const save = methodBetween('async saveInvoiceDraft(payload: InvoiceDraftPayload)', 'private escapePrintHtml');
  const edit = methodBetween('async editInvoice(invoice: Invoice)', 'cancelInvoiceEdit(): void');
  assert.match(save, /this\.isCurrentTenantOperation\(this\.invoiceSaveGuard/);
  assert.match(edit, /this\.isCurrentTenantOperation\(this\.invoiceEditRequestGuard/);
  assert.match(source, /authTransitionVersion: this\.authTransitionVersion/);
});
