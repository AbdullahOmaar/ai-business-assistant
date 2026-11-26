// Slice 4 — pure helpers for assistant persistence, the morning brief
// and the conversation settings surface (assistant-persistence.ts),
// plus pins on the assistant workspace component's Slice 4 seams:
// history/settings/brief panels, the resumed-proposal state chip,
// and the persisted-thread wiring of sendChat. Slice 2 is merged now,
// so the component references its card builders (one copy, from the
// merged Slice 2) — the rebase seam is closed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  briefHasAttention,
  conversationTitleOrFallback,
  dialectLabelKey,
  formatConversationDate,
  formatGrowth,
  isAssistantDialect,
  proposalStateKey,
  settingsValue,
  toChatMessages,
} from './assistant-persistence.ts';
import type { AssistantBrief, AssistantConversationDetail } from './api.service.ts';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(resolve(appDirectory, 'assistant-workspace.component.ts'), 'utf8');

function brief(overrides: Partial<AssistantBrief> = {}): AssistantBrief {
  return {
    generated_at: '2026-11-25T07:00:00+00:00',
    business_timezone: 'Africa/Cairo',
    date: '2026-11-25',
    enabled: true,
    dialect: 'egyptian',
    summary: 'summary',
    overdue_invoices: [],
    low_stock: [],
    recurring_due_tomorrow: [],
    sales_growth: [],
    low_stock_threshold: 10,
    limitations: [],
    ...overrides,
  };
}

test('proposal state keys cover every lifecycle state plus unknown', () => {
  assert.equal(proposalStateKey('proposed'), 'ui.assistantPersistence.proposalProposed');
  assert.equal(proposalStateKey('approved'), 'ui.assistantPersistence.proposalApproved');
  assert.equal(proposalStateKey('executing'), 'ui.assistantPersistence.proposalExecuting');
  assert.equal(proposalStateKey('executed'), 'ui.assistantPersistence.proposalExecuted');
  assert.equal(proposalStateKey('expired'), 'ui.assistantPersistence.proposalExpired');
  assert.equal(proposalStateKey('rejected'), 'ui.assistantPersistence.proposalRejected');
  assert.equal(proposalStateKey('bogus'), 'ui.assistantPersistence.proposalUnknown');
  assert.equal(proposalStateKey(''), 'ui.assistantPersistence.proposalUnknown');
});

test('dialect helpers accept only the three known dialects', () => {
  assert.equal(isAssistantDialect('egyptian'), true);
  assert.equal(isAssistantDialect('formal'), true);
  assert.equal(isAssistantDialect('english'), true);
  assert.equal(isAssistantDialect('klingon'), false);
  assert.equal(isAssistantDialect(null), false);
  assert.equal(isAssistantDialect(undefined), false);
  assert.equal(dialectLabelKey('egyptian'), 'ui.assistantSettings.dialectEgyptian');
  assert.equal(dialectLabelKey('formal'), 'ui.assistantSettings.dialectFormal');
  assert.equal(dialectLabelKey('english'), 'ui.assistantSettings.dialectEnglish');
});

test('conversation titles fall back when blank or missing', () => {
  assert.equal(conversationTitleOrFallback('  hello  ', 'fallback'), 'hello');
  assert.equal(conversationTitleOrFallback('', 'fallback'), 'fallback');
  assert.equal(conversationTitleOrFallback('   ', 'fallback'), 'fallback');
  assert.equal(conversationTitleOrFallback(null, 'fallback'), 'fallback');
  assert.equal(conversationTitleOrFallback(undefined, 'fallback'), 'fallback');
});

test('history dates format per language and reject bad input', () => {
  const english = formatConversationDate('2026-11-25T07:00:00+00:00', 'en');
  assert.match(english, /25/);
  assert.match(english, /Nov/);
  const arabic = formatConversationDate('2026-11-25T07:00:00+00:00', 'ar');
  assert.ok(arabic.length > 0);
  assert.notEqual(arabic, english);
  assert.equal(formatConversationDate(null, 'en'), '');
  assert.equal(formatConversationDate('not-a-date', 'en'), '');
});

test('resumed messages keep roles and content plus the current proposal', () => {
  const detail: AssistantConversationDetail = {
    id: 'conv-1', business_id: 'biz-1', user_subject: 'owner-a',
    title: 'thread', created_at: null, updated_at: null, message_count: 2,
    messages: [
      { id: 'm1', conversation_id: 'conv-1', role: 'user', content: 'hello', proposal_id: null, proposal: null, created_at: null },
      {
        id: 'm2', conversation_id: 'conv-1', role: 'assistant', content: 'prepared a proposal',
        proposal_id: 'prop-1',
        proposal: { id: 'prop-1', action: 'expense.create', effective_action: 'expense.create', status: 'expired', expires_at: null },
        created_at: null,
      },
    ],
  };
  const messages = toChatMessages(detail);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages[0].content, 'hello');
  assert.equal(messages[0].proposal, null);
  assert.equal(messages[1].proposal?.status, 'expired');
  assert.equal(messages[1].sources, undefined);
});

test('brief attention is true when any section has items', () => {
  assert.equal(briefHasAttention(brief()), false);
  assert.equal(briefHasAttention(brief({ overdue_invoices: [{ invoice_id: 'i', invoice_number: 'INV-1', customer_name: null, currency_code: 'EGP', total: '1.00', outstanding: '1.00', days_overdue: 3, due_date: '2026-11-22' }] })), true);
  assert.equal(briefHasAttention(brief({ low_stock: [{ product_id: 'p', name: 'sugar', stock_quantity: '8', state: 'running_low' }] })), true);
  assert.equal(briefHasAttention(brief({ recurring_due_tomorrow: [{ schedule_id: 's', customer_name: null, next_run_at: null, interval_days: 30 }] })), true);
  // Sales growth alone is information, not attention.
  assert.equal(briefHasAttention(brief({ sales_growth: [{ currency_code: 'EGP', current_total: '100.00', previous_total: '50.00', change_pct: 100, current_window: { start_date: '2026-11-18', end_date: '2026-11-25' }, previous_window: { start_date: '2026-11-11', end_date: '2026-11-18' } }] })), false);
});

test('growth percentages sign positive moves and stay null for a first week', () => {
  assert.equal(formatGrowth(100), '+100%');
  assert.equal(formatGrowth(-41.176), '-41.2%');
  assert.equal(formatGrowth(0), '0%');
  assert.equal(formatGrowth(null), null);
  assert.equal(formatGrowth(undefined), null);
  assert.equal(formatGrowth(Number.NaN), null);
});

test('settings lookup returns the stored value or the fallback', () => {
  const settings = [
    { setting_key: 'assistant.dialect', setting_value: 'formal' },
    { setting_key: 'assistant.morning_brief.enabled', setting_value: 'false' },
  ];
  assert.equal(settingsValue(settings, 'assistant.dialect', 'egyptian'), 'formal');
  assert.equal(settingsValue(settings, 'assistant.morning_brief.enabled', 'true'), 'false');
  assert.equal(settingsValue(settings, 'assistant.unknown', 'fallback'), 'fallback');
  assert.equal(settingsValue([], 'assistant.dialect', 'egyptian'), 'egyptian');
});

test('assistant workspace renders the Slice 4 panels and the proposal state chip', () => {
  for (const key of [
    'ui.assistantHistory.title',
    'ui.assistantSettings.title',
    'ui.assistantBrief.title',
    'ui.assistantPersistence.proposalLabel',
  ]) {
    assert.ok(component.includes(`t('${key}')`), `missing template key: ${key}`);
  }
  for (const cssClass of ['.assistant-history', '.assistant-settings', '.assistant-brief', '.proposal-state']) {
    assert.ok(component.includes(cssClass), `missing style: ${cssClass}`);
  }
  // The proposal chip reads the CURRENT state through the helper.
  assert.ok(component.includes('proposalStateLabel(message.proposal.status)'));
  // The brief card hides when disabled or dismissed, and the settings
  // panel keeps the owner-only writes behind the owner check.
  assert.ok(component.includes('brief.enabled && !briefDismissed'));
  assert.ok(component.includes('[disabled]="!isOwner"'));
});

test('sendChat rejoins the persisted thread and history resumes it', () => {
  assert.ok(component.includes('this.currentConversationId ?? undefined'));
  assert.ok(component.includes('reply.conversation_id'));
  assert.ok(component.includes('resumeConversation(item.id)'));
  assert.ok(component.includes('toChatMessages(detail)'));
  // Slice 2 is merged now: the full proposal cards live here (one copy,
  // from the merged Slice 2) — the rebase seam is closed.
  assert.match(component, /newProposalCard/);
  // The 375px panel rules stay phone-sized (no full-width fixed panels).
  assert.doesNotMatch(component, /\.assistant-(history|settings|brief)\{[^}]*position:\s*fixed/);
});
