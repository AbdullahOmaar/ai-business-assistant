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


test('uncertain invoice writes are stored before mutation and verified without resubmission', () => {
  const save = methodBetween('async saveInvoiceDraft(payload: InvoiceDraftPayload)', 'async refreshInvoiceDraftStatus()');
  const store = save.indexOf('this.invoiceDraftOutcomeVault.save(authUid, outcomeSnapshot)');
  const write = save.indexOf('await this.api.createInvoice(businessId, request)');
  assert.ok(store >= 0 && write > store);
  assert.match(save, /this\.invoiceDraftUncertain = true/);
  assert.match(save, /error\.definitiveNoWrite/);
  const verify = methodBetween('async refreshInvoiceDraftStatus()', 'private escapePrintHtml');
  assert.match(verify, /this\.api\.invoices\(businessId\)/);
  assert.doesNotMatch(verify, /this\.api\.createInvoice/);
  assert.match(source, /\[blocked\]="invoiceDraftUncertain"/);
  assert.match(source, /\(refreshStatus\)="refreshInvoiceDraftStatus\(\)"/);
});

test('invoice outcome recovery is restored only for the same authenticated user and workspace', () => {
  assert.match(source, /this\.invoiceDraftOutcomeVault\.get\(this\.currentAuthUid, id\)/);
  assert.match(source, /this\.invoiceDraftUncertain = true/);
  const pay = methodBetween('payInvoice(invoice: Invoice)', 'async createExpense()');
  assert.match(pay, /this\.paymentRetryPending/);
});


test('issued invoice printing is read-only, status-checked and auth/workspace fenced', () => {
  const print = methodBetween('async printInvoice(invoice: Invoice)', 'async editInvoice(invoice: Invoice)');
  assert.match(print, /this\.signedIn/);
  assert.match(print, /this\.currentAuthUid/);
  assert.match(print, /this\.isCurrentTenantOperation\(this\.printRequestGuard/);
  assert.match(print, /detail\.status !== 'issued'/);
  assert.match(print, /printWindow\.close\(\)/);
});

test('issue and void mutations are Owner-only and auth/workspace fenced', () => {
  const issue = methodBetween('async issueInvoice(invoice: Invoice)', 'requestInvoiceVoid(');
  const voidFlow = methodBetween('async confirmInvoiceVoid()', 'hasOutstandingBalance(');
  assert.match(issue, /this\.business\.role !== 'owner'/);
  assert.match(issue, /this\.isCurrentTenantOperation\(this\.invoiceMutationGuard/);
  assert.match(voidFlow, /this\.business\.role !== 'owner'/);
  assert.match(voidFlow, /this\.isCurrentTenantOperation\(this\.invoiceMutationGuard/);
});
