import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const component = readFileSync(new URL('./credit-note-issuance.component.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('Stage 1 UI supports return draft, owner approval, and owner-only credit-note issuance', () => {
  assert.match(component, /this\.api\.createSalesReturn\(/);
  assert.match(component, /this\.api\.approveSalesReturn\(/);
  assert.match(component, /this\.api\.issueCreditNote\(/);
  assert.match(component, /this\.role !== 'owner'/);
  assert.match(component, /ret\.status !== 'approved'/);
  assert.match(component, /creditNoteForReturn\(ret\.id\)/);
  assert.match(component, /this\.api\.salesReturns\(businessId, undefined, 0, this\.pageSize\)/);
  assert.match(component, /this\.api\.creditNotes\(businessId, 0, this\.pageSize\)/);
});

test('Stage 1 UI does not expose receivable application or cash refund controls', () => {
  assert.doesNotMatch(component, /applyCredit|beginApplyCredit|refundCredit|createCashRefund|CashRefund|CreditApplication/);
  assert.match(component, /t\('phaseFootnote'\)/);
  assert.match(component, /this\.t\('creditNoteIssuedMessage'\)/);
});

test('invoice workspace mounts the stage-one workflow and API client uses the scoped endpoints', () => {
  assert.match(app, /import \{ CreditNoteIssuanceComponent \} from '\.\/credit-note-issuance\.component';/);
  assert.match(app, /<aba-credit-note-issuance[\s\S]*?\[businessId\]="business\.id"/);
  assert.match(api, /\/sales-returns\?\$\{params\.toString\(\)\}/);
  assert.match(api, /creditNotes\(businessId: string, offset = 0, limit = 100\)/);
  assert.match(api, /salesReturns\(businessId: string, status\?: SalesReturn\['status'\], offset = 0, limit = 100\)/);
  assert.match(api, /\/sales-returns\/\$\{encodeURIComponent\(returnId\)\}\/credit-note/);
});


test('invoice, return and issued-note histories expose explicit pagination controls', () => {
  assert.match(component, /\(click\)="loadMoreInvoices\(\)"/);
  assert.match(component, /\(click\)="loadMoreReturns\(\)"/);
  assert.match(component, /\(click\)="loadMoreNotes\(\)"/);
  assert.match(component, /this\.invoiceOffset \+= page\.length/);
  assert.match(component, /this\.returnsOffset \+= page\.items\.length/);
  assert.match(component, /this\.notesOffset \+= page\.items\.length/);
});
