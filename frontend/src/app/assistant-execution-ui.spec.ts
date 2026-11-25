// Slice 2 — assistant execution UI: pure-helper unit tests plus source
// assertions on the assistant workspace component (no TestBed in the node
// runner; the component template and wiring are asserted on the source,
// following the aba-skeleton.spec.ts pattern).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coerceScalar,
  flattenPayload,
  formatPayloadValue,
  getAtPath,
  isStopWord,
  proposalCountdown,
  recordTabForTarget,
  refusalAlternative,
  setAtPath,
} from './assistant-execution-ui.ts';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(appDirectory, 'assistant-workspace.component.ts'), 'utf8');
const helperSource = readFileSync(resolve(appDirectory, 'assistant-execution-ui.ts'), 'utf8');
const apiSource = readFileSync(resolve(appDirectory, 'api.service.ts'), 'utf8');
const arabic = JSON.parse(readFileSync(resolve(appDirectory, '../../public/i18n/ar.json'), 'utf8')) as Record<string, any>;
const english = JSON.parse(readFileSync(resolve(appDirectory, '../../public/i18n/en.json'), 'utf8')) as Record<string, any>;

const ARABIC_RUN = /[\u0621-\u063A\u0641-\u064A]{2,}/;

test('stop words match the exact word, with whitespace and trailing punctuation tolerated', () => {
  assert.equal(isStopWord('وقف'), true);
  assert.equal(isStopWord('  وقف  '), true);
  assert.equal(isStopWord('وقف!'), true);
  assert.equal(isStopWord('استنى'), true);
  assert.equal(isStopWord('استني'), true);
  assert.equal(isStopWord('إلغاء'), true);
  assert.equal(isStopWord('اعمل فاتورة'), false);
  assert.equal(isStopWord('وقفة'), false);
  assert.equal(isStopWord(''), false);
});

test('proposal countdown counts the 5-minute validity and reports expiry', () => {
  const expiresAt = '2026-11-25T10:05:00.000Z';
  const now = Date.parse('2026-11-25T10:00:00.000Z');
  const countdown = proposalCountdown(expiresAt, now);
  assert.equal(countdown.expired, false);
  assert.equal(countdown.totalSeconds, 300);
  assert.equal(countdown.text, '5:00');
  assert.equal(proposalCountdown(expiresAt, Date.parse('2026-11-25T10:04:30.000Z')).text, '0:30');
  const expired = proposalCountdown(expiresAt, Date.parse('2026-11-25T10:05:00.000Z'));
  assert.equal(expired.expired, true);
  assert.equal(expired.text, '0:00');
  assert.equal(proposalCountdown('not-a-date', now).expired, true);
});

test('payload flattening exposes scalar leaves with dot/bracket paths', () => {
  const { rows, truncated } = flattenPayload({
    name: 'Ahmed',
    currency_code: 'EGP',
    lines: [
      { description: 'Lesson', quantity: 2, unit_price: 150 },
      { description: 'Book', quantity: 1, unit_price: 80 },
    ],
    allocations: [{ invoice_id: 'inv-1', amount: 100 }],
  });
  assert.equal(truncated, false);
  assert.deepEqual(rows.map(row => row.path), [
    'name', 'currency_code',
    'lines[0].description', 'lines[0].quantity', 'lines[0].unit_price',
    'lines[1].description', 'lines[1].quantity', 'lines[1].unit_price',
    'allocations[0].invoice_id', 'allocations[0].amount',
  ]);
  assert.equal(rows.find(row => row.path === 'lines[0].quantity')?.value, 2);
  assert.equal(rows.find(row => row.path === 'lines[0].quantity')?.editable, true);
});

test('payload flattening keeps scalar arrays as one row and caps the preview', () => {
  const scalarArray = flattenPayload({ tags: ['a', 'b'] });
  assert.deepEqual(scalarArray.rows, [{ path: 'tags', value: ['a', 'b'], editable: false }]);
  const big: Record<string, number> = {};
  for (let index = 0; index < 80; index += 1) big[`field_${index}`] = index;
  const capped = flattenPayload(big);
  assert.equal(capped.rows.length, 50);
  assert.equal(capped.truncated, true);
});

test('payload path get/set round-trips through bracket paths', () => {
  const payload: Record<string, unknown> = { lines: [{ quantity: 2 }] };
  assert.equal(getAtPath(payload, 'lines[0].quantity'), 2);
  assert.equal(getAtPath(payload, 'lines[1].quantity'), undefined);
  setAtPath(payload, 'lines[0].quantity', 3);
  assert.equal(getAtPath(payload, 'lines[0].quantity'), 3);
});

test('edited scalars coerce back to the original type or fail', () => {
  assert.deepEqual(coerceScalar('12.5', 2), { ok: true, value: 12.5 });
  assert.deepEqual(coerceScalar('abc', 2), { ok: false });
  assert.deepEqual(coerceScalar('true', false), { ok: true, value: true });
  assert.deepEqual(coerceScalar('yes', false), { ok: false });
  assert.deepEqual(coerceScalar('new name', 'old'), { ok: true, value: 'new name' });
  assert.deepEqual(coerceScalar('', null), { ok: true, value: null });
});

test('payload values format for display without crashing on objects', () => {
  assert.equal(formatPayloadValue(null), '—');
  assert.equal(formatPayloadValue(150), '150');
  assert.equal(formatPayloadValue(['a', 'b']), 'a, b');
  assert.equal(formatPayloadValue({ nested: true }), '{"nested":true}');
});

test('execution results map to the record tab, with import jobs by entity type', () => {
  assert.equal(recordTabForTarget('customer'), 'customers');
  assert.equal(recordTabForTarget('invoice'), 'invoices');
  assert.equal(recordTabForTarget('payment'), 'payments');
  assert.equal(recordTabForTarget('stock_movement'), 'products');
  assert.equal(recordTabForTarget('sales_return'), 'invoices');
  assert.equal(recordTabForTarget('credit_note'), 'invoices');
  assert.equal(recordTabForTarget('recurring_invoice_schedule'), 'recurring');
  assert.equal(recordTabForTarget('pricing_rule'), 'products');
  assert.equal(recordTabForTarget('payroll'), 'employees');
  assert.equal(recordTabForTarget('notification'), 'notifications');
  assert.equal(recordTabForTarget('import_job', { entity_type: 'customers' }), 'customers');
  assert.equal(recordTabForTarget('import_job', { entity_type: 'products' }), 'products');
  assert.equal(recordTabForTarget('import_job', { entity_type: 'unknown' }), null);
  assert.equal(recordTabForTarget('unknown_type'), null);
});

test('refusal alternatives classify the forbidden action family', () => {
  assert.equal(refusalAlternative('customer.delete'), 'delete');
  assert.equal(refusalAlternative('member.remove'), 'delete');
  assert.equal(refusalAlternative('settings.update'), 'settings');
  assert.equal(refusalAlternative('member.invite'), 'membership');
  assert.equal(refusalAlternative('invoice.create'), 'generic');
});

test('the helper keeps stop words as Unicode escapes — no Arabic literals in source', () => {
  assert.equal(ARABIC_RUN.test(helperSource), false);
  assert.equal(ARABIC_RUN.test(componentSource), false);
  assert.ok(helperSource.includes('\\u0648\\u0642\\u0641'));
});

const CLOSED_ACTIONS = [
  'customer.create', 'supplier.create', 'product.create', 'customer.update',
  'invoice.create', 'invoice.update', 'invoice.update_draft', 'invoice.duplicate',
  'invoice.issue', 'invoice.void', 'payment.record', 'stock.movement',
  'expense.create', 'purchase_order.create', 'purchase_order.duplicate',
  'purchase_order.approve', 'purchase_order.receive', 'purchase_order.cancel',
  'sales_return.create', 'sales_return.approve', 'credit_note.issue',
  'recurring_invoice.create', 'pricing_rule.create', 'payroll.create',
  'payroll.approve', 'payroll.pay', 'payroll.update', 'data_import.create',
  'notification.create',
];

test('every closed-list action has a label in both dictionaries', () => {
  assert.equal(CLOSED_ACTIONS.length, 29);
  for (const action of CLOSED_ACTIONS) {
    const [group, name] = action.split('.');
    assert.ok(
      typeof arabic.ui.assistantExecution.action[group]?.[name] === 'string',
      `Missing Arabic action label: ${action}`,
    );
    assert.ok(
      typeof english.ui.assistantExecution.action[group]?.[name] === 'string',
      `Missing English action label: ${action}`,
    );
  }
});

test('the chat reply and ApiService expose proposals and suggestions', () => {
  assert.ok(apiSource.includes('suggestions?: SettingSuggestion[]'));
  assert.ok(apiSource.includes('proposal?: AssistantProposalView'));
  for (const method of [
    'createProposal', 'getProposal', 'approveProposal', 'executeProposal',
    'cancelProposal', 'createOptOut', 'deleteOptOut', 'listOptOuts',
    'updateSetting', 'deleteSetting',
  ]) {
    assert.ok(apiSource.includes(`${method}(`), `Missing ApiService method: ${method}`);
  }
  assert.ok(apiSource.includes("payload_hash: payloadHash"));
});

test('the assistant renders proposal, confirmation, suggestion, refusal and stopped cards', () => {
  for (const key of [
    "t('ui.assistantExecution.proposalPreview')",
    "t('ui.assistantExecution.proposalExecute')",
    "t('ui.assistantExecution.proposalEdit')",
    "t('ui.assistantExecution.proposalCancel')",
    "t('ui.assistantExecution.proposalSaveNew')",
    "t('ui.assistantExecution.secondApprovalBadge')",
    "t('ui.assistantExecution.approvalCountdown'",
    "t('ui.assistantExecution.optOutLabel')",
    "t('ui.assistantExecution.proposalApprove')",
    "t('ui.assistantExecution.executedTitle')",
    "t('ui.assistantExecution.openRecord')",
    "t('ui.assistantExecution.refusalTitle')",
    "t('ui.assistantExecution.stoppedTitle')",
    "t('ui.assistantExecution.suggestionTitle')",
    "t('ui.assistantExecution.suggestionApply')",
    "t('ui.assistantExecution.suggestionRollback')",
  ]) {
    assert.ok(componentSource.includes(key), `Missing card copy: ${key}`);
  }
  assert.ok(componentSource.includes("class=\"proposal-card\""));
  assert.ok(componentSource.includes("'proposal-' + attachment.card.proposal.id"));
  assert.ok(componentSource.includes("attachment.kind === 'proposal'"));
  assert.ok(componentSource.includes("attachment.kind === 'suggestion'"));
  assert.ok(componentSource.includes("attachment.kind === 'refusal'"));
  assert.ok(componentSource.includes("attachment.kind === 'stopped'"));
});

test('approval goes through the opt-out then the hash-bound approve call', () => {
  assert.ok(componentSource.includes('createOptOut(this.businessId(), card.proposal.action)'));
  assert.ok(componentSource.includes('approveProposal(\n        this.businessId(), card.proposal.id, card.proposal.payload_hash,'));
  assert.ok(componentSource.includes('requester_subject !== this.userId()'));
  assert.ok(componentSource.includes("role() === 'owner'"));
});

test('editing submits a new proposal and cancels the old one afterwards', () => {
  assert.ok(componentSource.includes('createProposal(this.businessId(), card.proposal.action, draft)'));
  assert.ok(componentSource.includes('cancelProposal(this.businessId(), card.proposal.id)'));
  assert.ok(componentSource.includes('coerceScalar(raw, row.value)'));
});

test('the countdown ticks from expires_at and the stop flow invalidates the chat request', () => {
  assert.ok(componentSource.includes('setInterval(() => {'));
  assert.ok(componentSource.includes('this.nowTick = Date.now()'));
  assert.ok(componentSource.includes('proposalCountdown(card.proposal.expires_at, this.nowTick)'));
  assert.ok(componentSource.includes('isStopWord(question)'));
  assert.ok(componentSource.includes('stopAssistantWork()'));
  assert.ok(componentSource.includes('this.chatRequestGuard.invalidate()'));
  assert.ok(componentSource.includes('getProposal(this.businessId(), card.proposal.id)'));
  assert.ok(componentSource.includes("appendStoppedCard(view.status === 'executed' ? 'executed' : 'not-executed')"));
});

test('the record link navigates to the record tab through the shell route', () => {
  assert.ok(componentSource.includes('workspaceUrlFor(tab, window.location.search, window.location.hash)'));
  assert.ok(componentSource.includes("dispatchEvent(new PopStateEvent('popstate'))"));
});

test('suggestions apply and roll back through the owner-only settings endpoints', () => {
  assert.ok(componentSource.includes('updateSetting(this.businessId(), card.suggestion.setting_key, card.suggestion.proposed_value)'));
  assert.ok(componentSource.includes('deleteSetting(this.businessId(), card.suggestion.setting_key)'));
  assert.ok(componentSource.includes("state === 'confirming'"));
});

test('the mic uses the Web Speech API with a graceful fallback and Arabic locale', () => {
  assert.ok(componentSource.includes('webkitSpeechRecognition'));
  assert.ok(componentSource.includes('micSupported'));
  assert.ok(componentSource.includes("'ar-EG'"));
  assert.ok(componentSource.includes("t('ui.assistantExecution.micError')"));
  assert.ok(componentSource.includes('micRecognition'));
});

test('action buttons sit side by side and the cards fit a 375px width', () => {
  assert.ok(componentSource.includes('.proposal-actions{display:flex;flex-wrap:wrap'));
  assert.ok(componentSource.includes('@media(max-width:480px)'));
  assert.ok(componentSource.includes('.proposal-card,.suggestion-proposal-card,.refusal-card,.stopped-card{padding:10px}'));
  assert.ok(componentSource.includes('.chat-form{grid-template-columns:minmax(0,1fr) auto 84px;'));
});

test('no version line is added to the assistant footer — the sidebar line covers it', () => {
  assert.equal(componentSource.includes('m_c8v101'), false);
});
