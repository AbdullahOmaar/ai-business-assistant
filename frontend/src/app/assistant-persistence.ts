// Slice 4 — pure helpers for assistant persistence, the morning brief
// and the conversation settings surface. No user-visible copy lives
// here (the localization guard forbids inline Arabic in UI source);
// every label is an i18n key resolved by the component.
//
// Rebase seam with Slice 2 (PR #488): resumed messages carry only a
// lightweight proposal summary (id/action/CURRENT status) rendered as
// a one-line state chip. Slice 2's full proposal cards replace and
// augment this chip at rebase; no Slice 2 code is copied here.
import type {
  AssistantBrief,
  AssistantConversationDetail,
  AssistantProposalSummary,
} from './api.service';

export const ASSISTANT_DIALECTS = ['egyptian', 'formal', 'english'] as const;
export type AssistantDialect = (typeof ASSISTANT_DIALECTS)[number];
export const DIALECT_SETTING_KEY = 'assistant.dialect';
export const MORNING_BRIEF_SETTING_KEY = 'assistant.morning_brief.enabled';

/** One chat log entry, extended with the resumed proposal state. */
export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: { type: string; id: string; date: string | null; invoice_number?: string; category?: string }[];
  mode?: string;
  proposal?: AssistantProposalSummary | null;
}

export function isAssistantDialect(value: string | null | undefined): value is AssistantDialect {
  return value === 'egyptian' || value === 'formal' || value === 'english';
}

export function dialectLabelKey(dialect: AssistantDialect): string {
  // Literal keys so the localization spec can verify they exist.
  if (dialect === 'formal') return 'ui.assistantSettings.dialectFormal';
  if (dialect === 'english') return 'ui.assistantSettings.dialectEnglish';
  return 'ui.assistantSettings.dialectEgyptian';
}

/** The i18n key for a proposal's CURRENT state chip on a resumed message. */
export function proposalStateKey(status: string): string {
  // Literal keys so the localization spec can verify they exist.
  switch (status) {
    case 'proposed': return 'ui.assistantPersistence.proposalProposed';
    case 'approved': return 'ui.assistantPersistence.proposalApproved';
    case 'executing': return 'ui.assistantPersistence.proposalExecuting';
    case 'executed': return 'ui.assistantPersistence.proposalExecuted';
    case 'expired': return 'ui.assistantPersistence.proposalExpired';
    case 'rejected': return 'ui.assistantPersistence.proposalRejected';
    default: return 'ui.assistantPersistence.proposalUnknown';
  }
}

export function conversationTitleOrFallback(title: string | null | undefined, fallback: string): string {
  const trimmed = (title ?? '').trim();
  return trimmed ? trimmed : fallback;
}

/** A short locale date for the history list (Intl, never a date pipe —
 * the localization guard forbids date/number pipes in templates). */
export function formatConversationDate(iso: string | null | undefined, language: string): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', {
    day: 'numeric', month: 'short',
  }).format(parsed);
}

/** Map a resumed conversation onto the chat log. Persisted messages
 * carry no sources/mode (those belong to the live answer), but an
 * attached proposal survives with its CURRENT state. */
export function toChatMessages(detail: AssistantConversationDetail): AssistantChatMessage[] {
  return detail.messages.map(message => ({
    role: message.role,
    content: message.content,
    proposal: message.proposal ?? null,
  }));
}

/** Whether the brief has anything that needs attention today. */
export function briefHasAttention(brief: AssistantBrief): boolean {
  return brief.overdue_invoices.length > 0
    || brief.low_stock.length > 0
    || brief.recurring_due_tomorrow.length > 0;
}

/** Display form of a sales-growth percentage, or null when the
 * previous window was empty (the template shows the "new" label). */
export function formatGrowth(changePct: number | null | undefined): string | null {
  if (changePct === null || changePct === undefined || Number.isNaN(changePct)) return null;
  const rounded = Math.round(changePct * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** Read one setting value out of the settings list. */
export function settingsValue(
  settings: Array<{ setting_key: string; setting_value: string }>,
  key: string,
  fallback: string,
): string {
  const found = settings.find(item => item.setting_key === key);
  return found ? found.setting_value : fallback;
}
