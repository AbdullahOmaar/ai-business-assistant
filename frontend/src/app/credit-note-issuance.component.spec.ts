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


test('return reason is required before save and legacy drafts without a reason are blocked from approval and issuance', () => {
  // Empty or whitespace-only reasons are rejected before any API call.
  assert.match(component, /const reason = this\.returnReason\.trim\(\);/);
  assert.match(component, /if \(!reason\) \{\s*this\.returnReasonError = this\.t\('returnReasonRequired'\);\s*return;\s*\}/);
  assert.ok(component.indexOf("this.t('returnReasonRequired')") < component.indexOf('this.api.createSalesReturn('));
  // The trimmed reason is sent; the old trim-or-undefined escape is gone.
  assert.match(component, /\n        reason,\n/);
  assert.doesNotMatch(component, /this\.returnReason\.trim\(\) \|\| undefined/);
  // The field is marked required, capped at 500 and announces its error accessibly.
  assert.match(component, /name="returnReason" maxlength="500" required/);
  assert.match(component, /role="alert"/);
  assert.match(component, /aria-describedby="return-reason-error"/);
  assert.match(component, /\(ngModelChange\)="returnReasonError = ''"/);
  // Legacy drafts with no saved reason stay visible but cannot be approved or issued.
  const legacyGuard = /if \(!ret\.reason \|\| !ret\.reason\.trim\(\)\) \{\s*this\.error = this\.t\('returnReasonMissingForDraft'\);\s*return;\s*\}/g;
  assert.equal((component.match(legacyGuard) || []).length, 2);
  assert.ok(component.indexOf("approve(ret: SalesReturn)") < component.indexOf('this.api.approveSalesReturn('));
  // Both dictionaries carry the required keys and no longer label the field optional.
  for (const lang of ['ar', 'en']) {
    const dict = JSON.parse(readFileSync(new URL(`../../public/i18n/${lang}.json`, import.meta.url), 'utf8'));
    assert.ok(dict.creditNotes.returnReasonRequired);
    assert.ok(dict.creditNotes.returnReasonMissingForDraft);
    assert.doesNotMatch(dict.creditNotes.returnReason, /\(اختياري\)|\(optional\)/i);
  }
});

test('invoice, return and issued-note histories expose explicit pagination controls', () => {
  assert.match(component, /\(click\)="loadMoreInvoices\(\)"/);
  assert.match(component, /\(click\)="loadMoreReturns\(\)"/);
  assert.match(component, /\(click\)="loadMoreNotes\(\)"/);
  assert.match(component, /this\.invoiceOffset \+= page\.length/);
  assert.match(component, /this\.returnsOffset \+= page\.items\.length/);
  assert.match(component, /this\.notesOffset \+= page\.items\.length/);
});
