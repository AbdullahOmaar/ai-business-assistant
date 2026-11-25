// 3A-351: the AI assistant tab, extracted verbatim from the app shell
// (template + chat state + send/copy logic) so it loads only when the tab is
// opened. The shell renders this component behind @defer (when tab ===
// 'assistant') and keeps ownership of the tenant context (business, role,
// auth) — the component receives it through inputs and resets its chat state
// whenever the business changes, mirroring the shell's former resets.
// Change detection stays Default (same as the reports workspace): the chat
// state is plain fields assigned after await, and OnPush would leave the
// view stale. The assistant's layout rules moved with the template into this
// component's styles; the shell keeps the rules that target its own chrome
// (.sidebar/.main under .shell.keyboard-open).
import { Component, ElementRef, inject, input, OnChanges, OnDestroy, output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiRequestError, ApiService, type AssistantBrief, type AssistantConversationSummary, type AssistantOptOut, type AssistantProposalSummary, type AssistantProposalView, type ChatReply, type SettingSuggestion } from './api.service';
import {
  ASSISTANT_DIALECTS, DIALECT_SETTING_KEY, MORNING_BRIEF_SETTING_KEY,
  briefHasAttention, conversationTitleOrFallback, dialectLabelKey,
  formatConversationDate, formatGrowth, isAssistantDialect, proposalStateKey,
  settingsValue, toChatMessages,
  type AssistantChatMessage, type AssistantDialect,
} from './assistant-persistence';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaSkeletonComponent } from './shared/ui/aba-skeleton.component';
import {
  coerceScalar,
  flattenPayload,
  formatPayloadValue,
  isStopWord,
  proposalCountdown,
  recordTabForTarget,
  refusalAlternative,
  setAtPath,
  type PayloadRow,
} from './assistant-execution-ui';
import { workspaceUrlFor } from './core/navigation/workspace-route';

// Slice 2 — execution UI: proposal/confirmation cards, B7 suggestion
// cards, refusal and stopped cards. A chat message carries its cards as
// attachments; the producer of proposal attachments is Slice 3 (chat
// intent -> proposal draft), while B7 suggestions already arrive in the
// chat reply today. The component never executes anything itself — every
// action goes through the Slice 1 proposal API (verdict() on the server).
interface ProposalCardState {
  proposal: AssistantProposalView;
  busy: 'approve' | 'execute' | 'cancel' | 'edit' | null;
  error: string;
  editing: boolean;
  editDraft: Record<string, unknown> | null;
  editInputs: Record<string, string>;
  optOutChecked: boolean;
}
interface SuggestionCardState {
  suggestion: SettingSuggestion;
  state: 'pending' | 'confirming' | 'applied' | 'rolled-back';
  busy: boolean;
  error: string;
}
interface RefusalCardState {
  action: string;
  alternative: 'delete' | 'settings' | 'membership' | 'generic';
  detail: string;
}
interface StoppedCardState {
  kind: 'chat' | 'executed' | 'not-executed';
}
type ChatAttachment =
  | { kind: 'proposal'; card: ProposalCardState }
  | { kind: 'suggestion'; card: SuggestionCardState }
  | { kind: 'refusal'; card: RefusalCardState }
  | { kind: 'stopped'; card: StoppedCardState };
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatReply['sources'];
  mode?: string;
  attachments?: ChatAttachment[];
  proposal?: AssistantProposalSummary | null;
}
// Minimal structural type for the Web Speech API (no lib.dom dependency on
// the prefixed constructor).
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start(): void;
  stop(): void;
}

@Component({
  selector: 'aba-assistant-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent, AbaSkeletonComponent],
  template: `
  <div class="assistant-workspace" [class.has-chat]="chatMessages.length > 0">
  <section abaCard class="panel chat-panel">
    <aba-section-header [title]=" t('ui.m_1ajyrpz') " [description]=" t('ui.m_1yriqyt') ">
      <div class="chat-header-actions">
        <span class="count">{{ t('ui.m_1bvwx8l') }}</span>
        <button type="button" class="chat-new-button" (click)="toggleHistory()" [disabled]="chatSending" [attr.aria-expanded]="historyOpen ? 'true' : 'false'">{{ t('ui.assistantHistory.open') }}</button>
        <button type="button" class="chat-new-button" (click)="toggleSettings()" [disabled]="chatSending" [attr.aria-expanded]="settingsOpen ? 'true' : 'false'">{{ t('ui.assistantSettings.open') }}</button>
        <button type="button" class="chat-new-button" (click)="startNewChat()" [disabled]="chatSending || (!chatMessages.length && !chatDraft.trim())">{{ t('ui.m_gz9o3g') }}</button>
      </div>
    </aba-section-header>
    @if (historyOpen) {
      <div class="assistant-history" role="region" [attr.aria-label]="t('ui.assistantHistory.title')">
        <div class="assistant-panel-head">
          <strong>{{ t('ui.assistantHistory.title') }}</strong>
          <button type="button" class="chat-new-button" (click)="toggleHistory()">{{ t('ui.assistantHistory.close') }}</button>
        </div>
        @if (historyLoading) { <aba-skeleton variant="list-row" /> }
        @else if (historyError) { <aba-state-message kind="error" [description]="historyError" /> }
        @else if (!historyItems.length) { <aba-state-message kind="empty" [description]="t('ui.assistantHistory.empty')" /> }
        @else {
          <ul class="assistant-history-list">
            @for (item of historyItems; track item.id) {
              <li>
                <button type="button" class="assistant-history-item" [class.active]="item.id === currentConversationId" (click)="resumeConversation(item.id)" [disabled]="chatSending">
                  <span class="assistant-history-item-title">{{ conversationTitle(item) }}</span>
                  <small>{{ t('ui.assistantHistory.itemMeta', { count: item.message_count ?? 0, date: historyDate(item.updated_at) }) }}</small>
                </button>
              </li>
            }
          </ul>
        }
      </div>
    }
    @if (settingsOpen) {
      <div class="assistant-settings" role="region" [attr.aria-label]="t('ui.assistantSettings.title')">
        <div class="assistant-panel-head">
          <strong>{{ t('ui.assistantSettings.title') }}</strong>
          <button type="button" class="chat-new-button" (click)="toggleSettings()">{{ t('ui.assistantHistory.close') }}</button>
        </div>
        @if (settingsLoading) { <aba-skeleton variant="list-row" /> }
        @else if (settingsError) { <aba-state-message kind="error" [description]="settingsError" /> }
        @else {
          <label class="assistant-setting-row">
            <span>{{ t('ui.assistantSettings.dialect') }}</span>
            <select [value]="dialect" (change)="changeDialect($any($event.target).value)" [disabled]="!isOwner">
              @for (option of dialectOptions; track option) { <option [value]="option">{{ t(dialectLabel(option)) }}</option> }
            </select>
          </label>
          <small class="assistant-setting-hint">{{ t('ui.assistantSettings.dialectHint') }}</small>
          <label class="assistant-setting-row">
            <span>{{ t('ui.assistantSettings.morningBrief') }}</span>
            <input type="checkbox" [checked]="briefEnabled" (change)="toggleMorningBrief($any($event.target).checked)" [disabled]="!isOwner" />
          </label>
          <small class="assistant-setting-hint">{{ t('ui.assistantSettings.morningBriefHint') }}</small>
          @if (!isOwner) { <small class="assistant-setting-hint">{{ t('ui.assistantSettings.ownerOnly') }}</small> }
          <div class="assistant-optouts">
            <strong>{{ t('ui.assistantSettings.optOuts') }}</strong>
            @if (!optOuts.length) { <small>{{ t('ui.assistantSettings.optOutsEmpty') }}</small> }
            @else {
              <ul>
                @for (optOut of optOuts; track optOut.id) {
                  <li>
                    <span>{{ optOut.action }}</span>
                    @if (isOwner) { <button type="button" class="chat-new-button" (click)="revokeOptOut(optOut.action)">{{ t('ui.assistantSettings.revoke') }}</button> }
                  </li>
                }
              </ul>
            }
          </div>
          @if (settingsSaved) { <small class="assistant-setting-saved">{{ t('ui.assistantSettings.saved') }}</small> }
        }
      </div>
    }
    @if (briefLoading) { <aba-skeleton variant="list-row" /> }
    @else if (briefError) { <aba-state-message kind="error" [description]="briefError" /> }
    @else if (brief && brief.enabled && !briefDismissed) {
      <div class="assistant-brief" role="region" [attr.aria-label]="t('ui.assistantBrief.title')">
        <div class="assistant-panel-head">
          <strong>{{ t('ui.assistantBrief.title') }}</strong>
          <span class="assistant-brief-actions">
            <button type="button" class="chat-new-button" (click)="refreshBrief()">{{ t('ui.assistantBrief.refresh') }}</button>
            <button type="button" class="chat-new-button" (click)="briefDismissed = true">{{ t('ui.assistantBrief.dismiss') }}</button>
          </span>
        </div>
        @if (brief.summary) { <p class="assistant-brief-summary">{{ brief.summary }}</p> }
        @if (!briefNeedsAttention(brief)) { <small>{{ t('ui.assistantBrief.nothingToDo') }}</small> }
        @if (brief.overdue_invoices.length) {
          <strong class="assistant-brief-section">{{ t('ui.assistantBrief.overdue', { count: brief.overdue_invoices.length }) }}</strong>
          <ul class="assistant-brief-list">
            @for (item of brief.overdue_invoices; track item.invoice_id) {
              <li>{{ t('ui.assistantBrief.overdueItem', { invoiceNumber: item.invoice_number, outstanding: item.outstanding, currency: item.currency_code, days: item.days_overdue }) }}</li>
            }
          </ul>
        }
        @if (brief.low_stock.length) {
          <strong class="assistant-brief-section">{{ t('ui.assistantBrief.lowStock', { count: brief.low_stock.length }) }}</strong>
          <ul class="assistant-brief-list">
            @for (item of brief.low_stock; track item.product_id) {
              <li>{{ item.state === 'out_of_stock' ? t('ui.assistantBrief.lowStockOutItem', { name: item.name }) : t('ui.assistantBrief.lowStockItem', { name: item.name, quantity: item.stock_quantity }) }}</li>
            }
          </ul>
        }
        @if (brief.recurring_due_tomorrow.length) {
          <strong class="assistant-brief-section">{{ t('ui.assistantBrief.recurringDue', { count: brief.recurring_due_tomorrow.length }) }}</strong>
          <ul class="assistant-brief-list">
            @for (item of brief.recurring_due_tomorrow; track item.schedule_id) {
              <li>@if (item.customer_name) { <span>{{ item.customer_name }} — </span> }{{ t('ui.assistantBrief.recurringItem', { days: item.interval_days }) }}</li>
            }
          </ul>
        }
        @if (brief.sales_growth.length) {
          <strong class="assistant-brief-section">{{ t('ui.assistantBrief.salesGrowth') }}</strong>
          <ul class="assistant-brief-list">
            @for (item of brief.sales_growth; track item.currency_code) {
              <li>{{ t('ui.assistantBrief.growthItem', { currency: item.currency_code, current: item.current_total, previous: item.previous_total }) }} · {{ growthLabel(item.change_pct) }}</li>
            }
          </ul>
        }
      </div>
    }
    <div #chatLog class="chat-log" role="log" tabindex="0" aria-live="polite" aria-relevant="additions" aria-atomic="false" [attr.aria-busy]="chatSending ? 'true' : null" [attr.aria-label]="t('ui.m_180k0we')">
      @if (!chatMessages.length) { <aba-state-message kind="empty" [description]="t('ui.m_1dsxkpa')" /> }
      @for (message of chatMessages; track $index; let messageIndex = $index) {
        <article class="chat-message" [class.user-message]="message.role === 'user'">
          <div class="chat-message-head">
            <span>{{ message.role === 'user' ? t('ui.m_ma3u89') : t('ui.m_dzn3ev') }}</span>
            @if (message.role === 'assistant') {
              <button type="button" class="chat-copy-button" (click)="copyAssistantMessage(message.content, messageIndex)" [attr.aria-label]="t('ui.m_14dh0xk')">
                <span aria-live="polite">{{ chatCopyStatus?.index === messageIndex ? (chatCopyStatus?.success ? t('ui.m_d2vkge') : t('ui.m_qenrab')) : t('ui.m_1dtdc5p') }}</span>
              </button>
            }
          </div>
          @if (message.mode === 'local-fallback') { <small class="source-list">{{ t('ui.m_1raguvh') }}</small> }
          @if (message.content) { <p>{{ message.content }}</p> }
          @if (message.proposal) { <small class="proposal-state">{{ t('ui.assistantPersistence.proposalLabel') }}: {{ t(proposalStateLabel(message.proposal.status)) }}</small> }
          @if (message.sources?.length) { <small class="source-list">{{ t('ui.m_1uui693') }} @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? t('ui.m_1nfhuv2') : (source.type === 'expense' ? t('ui.m_q7obp1') : source.type) }} · {{ source.invoice_number || (source.type === 'expense' && source.category ? expenseCategoryLabel(source.category) : (source.category || source.id)) }}</span> }</small> }
          @for (attachment of message.attachments ?? []; track $index) {
            @if (attachment.kind === 'proposal') {
              <article class="proposal-card" [id]="'proposal-' + attachment.card.proposal.id">
                <div class="proposal-card-head">
                  <strong>{{ actionLabel(attachment.card.proposal.effective_action) }}</strong>
                  @if (attachment.card.proposal.requires_second_approval) { <span class="proposal-badge">{{ t('ui.assistantExecution.secondApprovalBadge') }}</span> }
                </div>
                @if (attachment.card.proposal.effective_action !== attachment.card.proposal.action) { <small class="proposal-sub">{{ t('ui.assistantExecution.requestedAs', {action: actionLabel(attachment.card.proposal.action)}) }}</small> }
                @if (attachment.card.proposal.execution_note) { <p class="proposal-note">{{ attachment.card.proposal.execution_note }}</p> }
                <p class="proposal-preview-title">{{ t('ui.assistantExecution.proposalPreview') }}</p>
                <dl class="proposal-rows">
                  @for (row of payloadRows(attachment.card.proposal); track row.path) {
                    <div class="proposal-row">
                      <dt>{{ fieldLabel(row.path) }}</dt>
                      @if (attachment.card.editing && row.editable) { <dd><input type="text" [value]="editInputValue(attachment.card, row)" (input)="onEditInput(attachment.card, row, $event)" [disabled]="attachment.card.busy !== null" [attr.aria-label]="fieldLabel(row.path)"></dd> }
                      @else { <dd>{{ formatValue(row.value) }}</dd> }
                    </div>
                  }
                </dl>
                @if (payloadTruncated(attachment.card.proposal)) { <small class="proposal-sub">{{ t('ui.assistantExecution.previewTruncated') }}</small> }
                @if (attachment.card.proposal.status === 'executed' && attachment.card.proposal.result) {
                  <p class="proposal-success">{{ t('ui.assistantExecution.executedTitle') }}</p>
                  @if (resultSummary(attachment.card)) { <p class="proposal-sub">{{ resultSummary(attachment.card) }}</p> }
                  @if (hasRecordLink(attachment.card)) { <div class="proposal-actions"><button type="button" class="proposal-action-button" (click)="openRecord(attachment.card)">{{ t('ui.assistantExecution.openRecord') }}</button></div> }
                } @else if (proposalExpired(attachment.card)) {
                  <p class="proposal-error-text">{{ t('ui.assistantExecution.proposalExpiredNote') }}</p>
                } @else if (attachment.card.proposal.status === 'rejected') {
                  <p class="proposal-sub">{{ t('ui.assistantExecution.executionCancelled') }}</p>
                } @else {
                  @if (attachment.card.proposal.requires_second_approval && attachment.card.proposal.status === 'proposed') {
                    <p class="proposal-countdown">{{ t('ui.assistantExecution.approvalCountdown', {time: proposalCountdownText(attachment.card)}) }}</p>
                    @if (isOwner()) { <label class="proposal-opt-out"><input type="checkbox" [(ngModel)]="attachment.card.optOutChecked" [ngModelOptions]="{standalone: true}" [disabled]="attachment.card.busy !== null"> {{ t('ui.assistantExecution.optOutLabel') }}</label> }
                    <div class="proposal-actions">
                      <button type="button" class="proposal-action-button primary" (click)="approveProposal(attachment.card)" [disabled]="attachment.card.busy !== null || !canApprove(attachment.card)">{{ t('ui.assistantExecution.proposalApprove') }}</button>
                    </div>
                    @if (!canApprove(attachment.card)) {
                      @if (attachment.card.proposal.requester_subject === userId()) { <p class="proposal-sub">{{ t('ui.assistantExecution.cannotApproveOwn') }}</p> }
                      @else if (!isOwner()) { <p class="proposal-sub">{{ t('ui.assistantExecution.staffCannotApprove') }}</p> }
                      @else { <p class="proposal-sub">{{ t('ui.assistantExecution.proposalWaitingOwner') }}</p> }
                    }
                  }
                  <div class="proposal-actions">
                    @if (!(attachment.card.proposal.requires_second_approval && attachment.card.proposal.status === 'proposed')) {
                      <button type="button" class="proposal-action-button primary" (click)="executeProposal(attachment.card)" [disabled]="attachment.card.busy !== null || !canExecute(attachment.card)">{{ t('ui.assistantExecution.proposalExecute') }}</button>
                    }
                    @if (!attachment.card.editing) { <button type="button" class="proposal-action-button" (click)="startEditProposal(attachment.card)" [disabled]="attachment.card.busy !== null">{{ t('ui.assistantExecution.proposalEdit') }}</button> }
                    <button type="button" class="proposal-action-button" (click)="cancelProposal(attachment.card)" [disabled]="attachment.card.busy !== null">{{ t('ui.assistantExecution.proposalCancel') }}</button>
                  </div>
                  @if (attachment.card.editing) {
                    <p class="proposal-sub">{{ t('ui.assistantExecution.editInvalidatesApproval') }}</p>
                    <div class="proposal-actions">
                      <button type="button" class="proposal-action-button primary" (click)="saveEditedProposal(attachment.card)" [disabled]="attachment.card.busy !== null">{{ t('ui.assistantExecution.proposalSaveNew') }}</button>
                      <button type="button" class="proposal-action-button" (click)="discardEditProposal(attachment.card)" [disabled]="attachment.card.busy !== null">{{ t('ui.assistantExecution.proposalDiscardEdit') }}</button>
                    </div>
                  }
                }
                @if (attachment.card.busy === 'execute') { <p class="proposal-sub">{{ t('ui.assistantExecution.executing') }}</p> }
                @if (attachment.card.error) { <p class="proposal-error-text" role="alert">{{ attachment.card.error }}</p> }
              </article>
            }
            @if (attachment.kind === 'suggestion') {
              <article class="suggestion-proposal-card">
                <div class="proposal-card-head"><strong>{{ t('ui.assistantExecution.suggestionTitle') }}</strong></div>
                <p class="proposal-sub">{{ attachment.card.suggestion.setting_key }}</p>
                @if (attachment.card.suggestion.reason) { <p class="proposal-sub">{{ t('ui.assistantExecution.suggestionReason') }}: {{ attachment.card.suggestion.reason }}</p> }
                <dl class="proposal-rows">
                  <div class="proposal-row"><dt>{{ t('ui.assistantExecution.suggestionOld') }}</dt><dd>{{ attachment.card.suggestion.current_value ?? '—' }}</dd></div>
                  <div class="proposal-row"><dt>{{ t('ui.assistantExecution.suggestionNew') }}</dt><dd>{{ attachment.card.suggestion.proposed_value }}</dd></div>
                </dl>
                @if (attachment.card.suggestion.is_financial) { <p class="proposal-note">{{ t('ui.assistantExecution.suggestionConfirmFinancial') }}</p> }
                @if (attachment.card.state === 'applied') { <p class="proposal-success">{{ t('ui.assistantExecution.suggestionApplied') }}</p> }
                @else if (attachment.card.state === 'rolled-back') { <p class="proposal-success">{{ t('ui.assistantExecution.suggestionRolledBack') }}</p> }
                @if (isOwner() && attachment.card.state !== 'applied') {
                  <div class="proposal-actions">
                    @if (attachment.card.state === 'confirming') {
                      <button type="button" class="proposal-action-button primary" (click)="confirmApplySuggestion(attachment.card)" [disabled]="attachment.card.busy">{{ t('ui.assistantExecution.suggestionConfirmApply') }}</button>
                      <button type="button" class="proposal-action-button" (click)="cancelConfirmSuggestion(attachment.card)" [disabled]="attachment.card.busy">{{ t('ui.assistantExecution.proposalCancel') }}</button>
                    } @else {
                      <button type="button" class="proposal-action-button primary" (click)="applySuggestion(attachment.card)" [disabled]="attachment.card.busy">{{ t('ui.assistantExecution.suggestionApply') }}</button>
                    }
                  </div>
                }
                @if (isOwner() && attachment.card.state === 'applied') {
                  <div class="proposal-actions">
                    <button type="button" class="proposal-action-button" (click)="rollbackSuggestion(attachment.card)" [disabled]="attachment.card.busy">{{ t('ui.assistantExecution.suggestionRollback') }}</button>
                  </div>
                }
                @if (attachment.card.error) { <p class="proposal-error-text" role="alert">{{ attachment.card.error }}</p> }
              </article>
            }
            @if (attachment.kind === 'refusal') {
              <article class="refusal-card">
                <strong>{{ t('ui.assistantExecution.refusalTitle') }}</strong>
                @if (attachment.card.detail) { <p>{{ attachment.card.detail }}</p> }
                <p>{{ t('ui.assistantExecution.refusalAlternative') }}</p>
                <p>{{ refusalAlternativeText(attachment.card) }}</p>
              </article>
            }
            @if (attachment.kind === 'stopped') {
              <article class="stopped-card">
                <strong>{{ t('ui.assistantExecution.stoppedTitle') }}</strong>
                <p>{{ stoppedDoneText(attachment.card) }}</p>
                <p>{{ stoppedNotDoneText(attachment.card) }}</p>
                <div class="proposal-actions">
                  <button type="button" class="proposal-action-button" (click)="dismissStopped(message, attachment)">{{ t('ui.assistantExecution.stoppedResume') }}</button>
                  <button type="button" class="proposal-action-button" (click)="reviewDrafts()">{{ t('ui.assistantExecution.stoppedReviewDrafts') }}</button>
                  <button type="button" class="proposal-action-button" (click)="clearDrafts()">{{ t('ui.assistantExecution.stoppedClearDrafts') }}</button>
                </div>
              </article>
            }
          }
        </article>
      }
      @if (chatSending) {
        <article class="chat-message chat-message--pending" role="status" [attr.aria-label]="t('ui.m_1xguwi5')">
          <div class="chat-message-head"><span>{{ t('ui.m_dzn3ev') }}</span></div>
          <aba-skeleton variant="list-row" />
        </article>
      }
    </div>
  
    @if (chatError) { <aba-state-message kind="error" [description]="chatError" [actionLabel]="chatConfigurationMissing ? '' : t('ui.m_worzj7')" [actionDisabled]="chatSending || !chatDraft.trim()" (action)="sendChat()" /> }
    <form #chatForm="ngForm" class="chat-form" (ngSubmit)="chatForm.valid && chatDraft.trim() && sendChat()"><textarea #chatMessageControl="ngModel" name="chatMessage" rows="2" maxlength="2000" enterkeyhint="send" (keydown.enter)="handleChatKeydown($any($event))" [attr.aria-label]="t('ui.m_1d2fatg')" [attr.aria-invalid]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'true' : null" [attr.aria-describedby]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'chat-message-hint chat-message-error' : 'chat-message-hint'" [placeholder]="t('ui.m_1pafgoq')" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea>@if (!(chatSending || executingProposalId)) { <button class="primary" type="submit" [disabled]="chatSending || !chatDraft.trim()">{{ chatSending ? t('ui.m_1sgwbzd') : t('ui.m_rf7y63') }}</button> } @else { <button type="button" class="stop-button" (click)="stopAssistantWork()">⛔ {{ t('ui.assistantExecution.stopButton') }}</button> }@if (micSupported) { <button type="button" class="mic-button" (click)="toggleMic()" [disabled]="chatSending" [attr.aria-label]="t('ui.assistantExecution.micLabel')" [attr.aria-pressed]="micListening ? 'true' : 'false'">{{ micListening ? t('ui.assistantExecution.micListening') : '🎙' }}</button> }</form>
    <div class="chat-composer-meta"><small id="chat-message-hint">{{ t('ui.m_vdvf9x') }}</small><small>{{ chatDraft.length }} / 2000</small></div>
    @if ((chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted)) { <small id="chat-message-error" class="field-error" role="alert">{{ t('ui.m_18j0gfn') }}</small> }
    @if (micError) { <small class="field-error" role="alert">{{ micError }}</small> }
    <p class="footnote">{{ t('ui.m_118u9lx') }}</p>
  </section>
  <aside class="assistant-suggestions" aria-label="{{ t('ui.m_1is9ve0') }}"><p>{{ t('ui.m_lxd4e7') }}</p><div class="suggestion-grid"><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_1clvjpr'))"><span class="suggestion-icon">↗</span><strong>{{ t('ui.m_1dkpjlm') }}</strong><small>{{ t('ui.m_70o2ur') }}</small></button><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_1ij9tr8'))"><span class="suggestion-icon">✦</span><strong>{{ t('ui.m_159lqb4') }}</strong><small>{{ t('ui.m_1ktypo7') }}</small></button><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_4tgkt3'))"><span class="suggestion-icon">▦</span><strong>{{ t('ui.m_yezco3') }}</strong><small>{{ t('ui.m_1a12moo') }}</small></button><button type="button" class="suggestion-card" [disabled]="chatSending" (click)="useAssistantSuggestion(t('ui.m_xc417r'))"><span class="suggestion-icon">◎</span><strong>{{ t('ui.m_b2oroc') }}</strong><small>{{ t('ui.m_ap19ks') }}</small></button></div></aside>
  </div>
  `,
  styles: [`
.assistant-workspace{display:grid;grid-template-columns:minmax(0,1fr) 228px;gap:16px;align-items:start}
.assistant-suggestions{min-width:0;margin:0;padding:16px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:16px;background:var(--aba-color-surface,#fff);box-shadow:0 8px 24px #0f172a08}
.assistant-suggestions>p{font-size:12px;font-weight:800;color:var(--aba-color-text-muted,#334155);margin:0 0 10px}
.suggestion-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.suggestion-card{display:grid;grid-template-columns:28px minmax(0,1fr);align-items:center;column-gap:9px;row-gap:2px;text-align:start;padding:9px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc);color:#1e293b;transition:background .16s ease,border-color .16s ease}
.suggestion-card:hover:not(:disabled){background:#eff6ff;border-color:#2563eb}
.suggestion-card:disabled{opacity:.55;cursor:not-allowed}
.suggestion-icon{grid-row:span 2;display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#dbeafe;color:#1d4ed8;font-size:15px}
.suggestion-card strong{font-size:11px}
.suggestion-card small{font-size:10px;color:var(--aba-color-text-secondary,#64748b);line-height:1.35}
.chat-panel{min-width:0}
.chat-header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chat-new-button{min-height:36px;padding:7px 11px;border:1px solid var(--aba-color-border,#d1d5db);border-radius:9px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#1f2937);font-size:11px;font-weight:700}
.chat-new-button:hover:not(:disabled){background:var(--aba-color-surface-subtle,#f8fafc);border-color:var(--aba-color-primary,#0f766e)}
.chat-log{min-height:280px;max-height:55vh}
@media(max-width:900px){.assistant-workspace{grid-template-columns:minmax(0,1fr)}.assistant-suggestions{grid-row:2}.assistant-workspace:not(.has-chat) .assistant-suggestions{grid-row:1}.assistant-workspace:not(.has-chat) .chat-panel{grid-row:2}.suggestion-grid{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.suggestion-grid{scroll-snap-type:x proximity;overscroll-behavior-inline:contain;scrollbar-width:thin}.suggestion-card{flex:0 0 175px;min-height:82px;scroll-snap-align:start}}
@media(max-width:480px){.assistant-suggestions{padding:12px}.suggestion-card{flex-basis:158px;min-height:82px;padding:8px}.chat-log{min-height:220px;max-height:48vh}.chat-message{max-width:96%}.chat-header-actions{gap:6px}.chat-new-button{min-height:40px}.chat-form{grid-template-columns:minmax(0,1fr) auto 84px;gap:8px}.chat-form .primary{padding-inline:8px}.chat-composer-meta{align-items:flex-start}.chat-composer-meta small{font-size:9px}}
.chat-log{min-height:280px;max-height:55vh;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}
.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}
.chat-message.user-message{margin-inline-end:auto;margin-inline-start:0;background:#e0f2fe}
.chat-message-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--aba-color-text-tertiary,#6b7280);font-weight:800}
.chat-copy-button{min-height:32px;min-width:44px;padding:5px 8px;border:1px solid var(--aba-color-border-subtle,#dbe2ea);border-radius:8px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-secondary,#475569);font-size:10px;font-weight:700}
.chat-copy-button:hover{border-color:var(--aba-color-primary,#0f766e);color:var(--aba-color-primary,#0f766e)}
.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}
.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;margin-top:12px}
.chat-form textarea{resize:vertical;min-height:48px;max-height:180px;line-height:1.5}
.chat-form .primary{min-width:84px;min-height:48px;grid-column:3}
.chat-form .mic-button{grid-column:2;min-width:48px;min-height:48px;border:1px solid var(--aba-color-border-subtle,#dbe2ea);border-radius:10px;background:var(--aba-color-surface,#fff);font-size:18px;cursor:pointer}
.chat-form .mic-button[aria-pressed="true"]{border-color:var(--aba-color-primary,#0f766e);background:#e0f2fe}
.chat-form .stop-button{grid-column:3;min-width:84px;min-height:48px;border:1px solid #b91c1c;border-radius:10px;background:#fef2f2;color:#b91c1c;font-weight:800;cursor:pointer}
.chat-composer-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;color:var(--aba-color-text-tertiary,#64748b)}
.chat-composer-meta small{font-size:10px;line-height:1.5}
.chat-composer-meta small:last-child{flex:0 0 auto;font-variant-numeric:tabular-nums}
.chat-form textarea{font-size:16px}
.chat-copy-button span{display:inline-block}
@media(max-width:480px){.chat-message p{font-size:14px;line-height:1.75;overflow-wrap:anywhere}.suggestion-card strong{font-size:12px}.suggestion-card small{font-size:11px}.chat-composer-meta small{font-size:10px}}
.assistant-suggestions{padding:12px;border:1px solid #dbeafe;border-radius:15px;background:linear-gradient(135deg,#f8fbff,#eff6ff)}
.assistant-suggestions .suggestion-card{min-height:68px}
@media(max-width:600px){.suggestion-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:760px){.chat-form{position:sticky;bottom:calc(var(--aba-keyboard-inset,0px) + var(--aba-dock-offset,8px));z-index:25;align-items:end;padding:8px 0;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 18%)}.shell.keyboard-open .chat-form{position:fixed;inset-inline:12px;bottom:calc(var(--aba-keyboard-inset,0px) + 8px);margin-top:0;padding:8px 10px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;background:var(--aba-color-surface,#fff);box-shadow:0 8px 24px #0f172a1a}.chat-form textarea{min-height:48px;max-height:25dvh;resize:none}.shell.keyboard-open .chat-log{min-height:100px;max-height:35dvh}}
.proposal-card,.suggestion-proposal-card,.refusal-card,.stopped-card{margin-top:10px;padding:12px;border:1px solid var(--aba-color-border-subtle,#dbe2ea);border-radius:12px;background:var(--aba-color-surface,#fff)}
.proposal-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.proposal-card-head strong{font-size:13px}
.proposal-badge{font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;background:#fef3c7;color:#92400e;white-space:nowrap}
.proposal-preview-title{font-size:11px;font-weight:800;margin:10px 0 4px;color:var(--aba-color-text-secondary,#475569)}
.proposal-rows{margin:0}
.proposal-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12px}
.proposal-row:last-child{border-bottom:0}
.proposal-row dt{color:var(--aba-color-text-secondary,#475569);flex:0 0 auto}
.proposal-row dd{margin:0;text-align:end;overflow-wrap:anywhere;min-width:0}
.proposal-row dd input{width:100%;min-height:36px;text-align:end}
.proposal-note{font-size:11px;line-height:1.6;color:var(--aba-color-text-secondary,#475569);margin:8px 0 0}
.proposal-sub{font-size:11px;line-height:1.6;color:var(--aba-color-text-secondary,#475569);margin:6px 0 0}
.proposal-countdown{font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;margin:10px 0 0}
.proposal-opt-out{display:flex;align-items:center;gap:8px;font-size:12px;margin-top:10px;cursor:pointer}
.proposal-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.proposal-action-button{min-height:40px;padding:8px 14px;border:1px solid var(--aba-color-border-subtle,#dbe2ea);border-radius:10px;background:var(--aba-color-surface,#fff);font-weight:700;font-size:12px;cursor:pointer}
.proposal-action-button.primary{background:var(--aba-color-primary,#0f766e);border-color:var(--aba-color-primary,#0f766e);color:#fff}
.proposal-action-button:disabled{opacity:.5;cursor:not-allowed}
.proposal-success{font-size:12px;font-weight:800;color:#15803d;margin:10px 0 0}
.proposal-error-text{font-size:12px;line-height:1.6;color:#b91c1c;margin:10px 0 0}
.refusal-card strong,.stopped-card strong{font-size:13px}
.refusal-card p,.stopped-card p{font-size:12px;line-height:1.65;margin:6px 0 0}
@media(max-width:480px){.proposal-card,.suggestion-proposal-card,.refusal-card,.stopped-card{padding:10px}.proposal-row{font-size:12px}.proposal-action-button{min-height:40px}}
.assistant-history,.assistant-settings,.assistant-brief{margin:12px 0 0;padding:12px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc)}
.assistant-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.assistant-panel-head strong{font-size:12px}
.assistant-brief-actions{display:flex;gap:6px;flex-wrap:wrap}
.assistant-history-list,.assistant-brief-list{list-style:none;margin:8px 0 0;padding:0}
.assistant-history-item{display:grid;gap:2px;width:100%;text-align:start;padding:9px 10px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:9px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#1f2937);cursor:pointer}
.assistant-history-item:hover:not(:disabled){border-color:var(--aba-color-primary,#0f766e)}
.assistant-history-item.active{border-color:var(--aba-color-primary,#0f766e);background:#eff6ff}
.assistant-history-item:disabled{opacity:.55;cursor:not-allowed}
.assistant-history-item-title{font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.assistant-history-item small,.assistant-setting-hint{font-size:10px;color:var(--aba-color-text-secondary,#64748b)}
.assistant-history-list li{margin-top:6px}
.assistant-setting-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;font-size:12px;font-weight:700}
.assistant-setting-row select{min-height:36px;border:1px solid var(--aba-color-border,#d1d5db);border-radius:8px;background:var(--aba-color-surface,#fff);font-size:12px}
.assistant-setting-row input[type="checkbox"]{width:20px;height:20px;accent-color:var(--aba-color-primary,#0f766e)}
.assistant-setting-hint{display:block;margin-top:4px}
.assistant-optouts{display:grid;gap:6px;margin-top:12px}
.assistant-optouts strong{font-size:12px}
.assistant-optouts ul{list-style:none;margin:0;padding:0}
.assistant-optouts li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid var(--aba-color-border-subtle,#e2e8f0);font-size:12px}
.assistant-setting-saved{color:var(--aba-color-primary,#0f766e);font-weight:700}
.assistant-brief-summary{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:0 0 8px}
.assistant-brief-section{display:block;font-size:11px;margin-top:10px}
.assistant-brief-list li{font-size:12px;line-height:1.6;padding:3px 0}
.proposal-state{display:block;margin-top:6px;font-size:10px;font-weight:700;color:var(--aba-color-text-secondary,#64748b)}
@media(max-width:480px){.assistant-history,.assistant-settings,.assistant-brief{padding:10px}.assistant-setting-row{font-size:13px}}
  `],
})
export class AssistantWorkspaceComponent implements OnChanges, OnDestroy {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input.required<string | null | undefined>();
  readonly signedIn = input.required<boolean>();
  readonly language = input.required<string>();
  readonly pendingQuestion = input<string>('');
  readonly questionConsumed = output<void>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);

  chatDraft = '';
  chatMessages: ChatMessage[] = [];
  chatSending = false;
  chatError = '';
  chatConfigurationMissing = false;
  chatCopyStatus: { index: number; success: boolean } | null = null;
  // Slice 4 — persistence + morning brief + conversation settings.
  // The conversation id is the thread the turns belong to: created by
  // the API on the first turn, sent back on later turns, cleared by
  // "new chat" and by a business change.
  currentConversationId: string | null = null;
  historyOpen = false;
  historyLoading = false;
  historyError = '';
  historyItems: AssistantConversationSummary[] = [];
  settingsOpen = false;
  settingsLoading = false;
  settingsError = '';
  settingsSaved = false;
  dialect: AssistantDialect = 'egyptian';
  briefEnabled = true;
  optOuts: AssistantOptOut[] = [];
  brief: AssistantBrief | null = null;
  briefLoading = false;
  briefError = '';
  briefDismissed = false;
  @ViewChild('chatLog') private chatLog?: ElementRef<HTMLElement>;

  // Slice 2: the 5-minute countdown ticks from this clock (1s interval).
  nowTick = Date.now();
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  // The proposal whose execute call is currently in flight, if any.
  executingProposalId: string | null = null;
  private stopRequested = false;
  micSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  micListening = false;
  micError = '';
  private micRecognition: SpeechRecognitionLike | null = null;

  private readonly chatRequestGuard = new WorkspaceLoadGuard();
  // One guard per Slice 4 load family (history / brief / settings):
  // the families run concurrently and must not invalidate each other
  // (a newer generation skips the older one's callbacks, which would
  // leave its loading flag stuck), and none of them may cancel an
  // in-flight chat send.
  private readonly historyGuard = new WorkspaceLoadGuard();
  private readonly briefGuard = new WorkspaceLoadGuard();
  private readonly settingsGuard = new WorkspaceLoadGuard();

  ngOnChanges(changes: SimpleChanges): void {
    // 3A-435 / T40: a question handed over from another workspace (e.g. the
    // reports P&L) is sent as soon as this component mounts with it. The
    // shell clears the input after consumption, so a repeated identical
    // question still fires (the value changes '' -> text each time).
    const pending = changes['pendingQuestion']?.currentValue as string | undefined;
    if (pending && !this.chatSending) {
      this.useAssistantSuggestion(pending);
      this.questionConsumed.emit();
    }
    // 3A-351: a business change clears the conversation, exactly as the shell
    // used to reset the chat fields on a business switch.
    if (changes['businessId']) {
      if (!changes['businessId'].firstChange) {
        this.chatRequestGuard.invalidate();
        this.chatSending = false;
        this.chatMessages = [];
        this.chatDraft = '';
        this.chatError = '';
        this.chatConfigurationMissing = false;
        this.chatCopyStatus = null;
        this.resetExecutionState();
      }
      // Slice 4: a business change also clears the persisted thread and
      // reloads the new business's brief + settings.
      this.historyGuard.invalidate();
      this.briefGuard.invalidate();
      this.settingsGuard.invalidate();
      this.resetSlice4State();
      this.slice4LoadedFor = null;
      void this.ensureSlice4Loaded();
    }
    // If the component mounted before sign-in resolved, the loads above
    // skipped themselves — retry once auth lands.
    if (changes['signedIn']?.currentValue === true) {
      void this.ensureSlice4Loaded();
    }
  }

  ngOnDestroy(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.micRecognition?.stop();
    this.micRecognition = null;
  }

  private slice4LoadedFor: string | null = null;

  private async ensureSlice4Loaded(): Promise<void> {
    const businessId = this.businessId();
    if (!businessId || !this.signedIn() || this.slice4LoadedFor === businessId) return;
    this.slice4LoadedFor = businessId;
    await this.loadBrief();
    await this.loadSettings();
  }

  private resetSlice4State(): void {
    this.currentConversationId = null;
    this.historyOpen = false;
    this.historyLoading = false;
    this.historyError = '';
    this.historyItems = [];
    this.settingsOpen = false;
    this.settingsLoading = false;
    this.settingsError = '';
    this.settingsSaved = false;
    this.dialect = 'egyptian';
    this.briefEnabled = true;
    this.optOuts = [];
    this.brief = null;
    this.briefLoading = false;
    this.briefError = '';
    this.briefDismissed = false;
  }

  get isOwner(): boolean {
    return this.role() === 'owner';
  }

  readonly dialectOptions: AssistantDialect[] = [...ASSISTANT_DIALECTS];

  /** Template wrappers for the Slice 4 pure helpers. */
  dialectLabel(option: AssistantDialect): string {
    return dialectLabelKey(option);
  }

  proposalStateLabel(status: string): string {
    return proposalStateKey(status);
  }

  conversationTitle(item: AssistantConversationSummary): string {
    return conversationTitleOrFallback(item.title, this.t('ui.assistantHistory.untitled'));
  }

  historyDate(iso: string | null | undefined): string {
    return formatConversationDate(iso, this.language());
  }

  briefNeedsAttention(brief: AssistantBrief): boolean {
    return briefHasAttention(brief);
  }

  growthLabel(changePct: number | null): string {
    return formatGrowth(changePct) ?? this.t('ui.assistantBrief.growthNew');

  private resetExecutionState(): void {
  }

  private chatRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  expenseCategoryLabel(category: string): string {
    // 3A-351: the shell keeps its own copy for the expenses tab; this one
    // serves the assistant's source chips (same 9-entry key map).
    const keys: Record<string, string> = {
      General: 'app.expenseCategory.general', Supplies: 'app.expenseCategory.supplies',
      Rent: 'app.expenseCategory.rent', Utilities: 'app.expenseCategory.utilities',
      Transport: 'app.expenseCategory.transport', Marketing: 'app.expenseCategory.marketing',
      Payroll: 'app.expenseCategory.payroll', Maintenance: 'app.expenseCategory.maintenance',
      Other: 'app.expenseCategory.other',
    };
    return keys[category] ? this.t(keys[category]) : category;
  }

  useAssistantSuggestion(question: string): void {
    if (this.chatSending || !question.trim()) return;
    this.chatDraft = question;
    void this.sendChat();
  }

  handleChatKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!this.chatDraft.trim() || this.chatSending) return;
    void this.sendChat();
  }

  startNewChat(): void {
    if (this.chatSending) return;
    this.chatMessages = [];
    this.chatDraft = '';
    this.chatError = '';
    this.chatConfigurationMissing = false;
    this.chatCopyStatus = null;
    this.resetExecutionState();
    // Slice 4: a new chat starts a new persisted thread on the next send.
    this.currentConversationId = null;
  }

  // Slice 4 — history, brief and settings. Loads run through the
  // tenant-scoped guard on their own generation so a business switch
  // discards late responses instead of showing another workspace's data.
  toggleHistory(): void {
    this.historyOpen = !this.historyOpen;
    if (this.historyOpen) void this.loadHistory();
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    if (this.settingsOpen) void this.loadSettings();
  }

  async loadHistory(): Promise<void> {
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId) return;
    this.historyLoading = true;
    this.historyError = '';
    await runTenantScopedRequest(
      this.historyGuard,
      requestContext,
      () => this.chatRequestContext(),
      () => this.api.listConversations(requestContext.workspaceId),
      {
        onSuccess: items => { this.historyItems = items; },
        onError: error => { this.historyError = this.message(error); },
        onFinally: () => { this.historyLoading = false; },
      },
    );
  }

  async resumeConversation(conversationId: string): Promise<void> {
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId || this.chatSending) return;
    this.historyError = '';
    await runTenantScopedRequest(
      this.historyGuard,
      requestContext,
      () => this.chatRequestContext(),
      () => this.api.getConversation(requestContext.workspaceId, conversationId),
      {
        onSuccess: detail => {
          // Restored messages keep their attached proposal's CURRENT
          // state (a proposal whose 5 minutes elapsed reads expired).
          this.chatMessages = toChatMessages(detail);
          this.currentConversationId = detail.id;
          this.historyOpen = false;
          this.chatError = '';
          this.chatCopyStatus = null;
          this.scrollChatToLatest(true);
        },
        onError: error => { this.historyError = this.message(error); },
        onFinally: () => {},
      },
    );
  }

  async loadBrief(): Promise<void> {
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId) return;
    this.briefLoading = true;
    this.briefError = '';
    await runTenantScopedRequest(
      this.briefGuard,
      requestContext,
      () => this.chatRequestContext(),
      () => this.api.getBrief(requestContext.workspaceId),
      {
        onSuccess: brief => { this.brief = brief; this.briefEnabled = brief.enabled; },
        onError: error => { this.briefError = this.message(error); },
        onFinally: () => { this.briefLoading = false; },
      },
    );
  }

  async refreshBrief(): Promise<void> {
    this.briefDismissed = false;
    await this.loadBrief();
  }

  async loadSettings(): Promise<void> {
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId) return;
    this.settingsLoading = true;
    this.settingsError = '';
    this.settingsSaved = false;
    await runTenantScopedRequest(
      this.settingsGuard,
      requestContext,
      () => this.chatRequestContext(),
      async () => ({
        settings: await this.api.listSettings(requestContext.workspaceId),
        optOuts: await this.api.listOptOuts(requestContext.workspaceId),
      }),
      {
        onSuccess: ({ settings, optOuts }) => {
          const dialect = settingsValue(settings, DIALECT_SETTING_KEY, 'egyptian');
          this.dialect = isAssistantDialect(dialect) ? dialect : 'egyptian';
          this.briefEnabled = settingsValue(settings, MORNING_BRIEF_SETTING_KEY, 'true').trim().toLowerCase() !== 'false';
          this.optOuts = optOuts;
        },
        onError: error => { this.settingsError = this.message(error); },
        onFinally: () => { this.settingsLoading = false; },
      },
    );
  }

  async changeDialect(value: string): Promise<void> {
    if (!this.isOwner || !isAssistantDialect(value) || value === this.dialect) return;
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId) return;
    try {
      await this.api.updateSetting(requestContext.workspaceId, DIALECT_SETTING_KEY, value);
      this.dialect = value;
      this.settingsSaved = true;
      this.settingsError = '';
      // The greeting dialect lives in the brief — reload it so the
      // new dialect shows at once.
      await this.loadBrief();
    } catch (error) {
      this.settingsError = this.message(error);
    }
  }

  async toggleMorningBrief(checked: boolean): Promise<void> {
    if (!this.isOwner) return;
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId) return;
    try {
      await this.api.updateSetting(
        requestContext.workspaceId, MORNING_BRIEF_SETTING_KEY, checked ? 'true' : 'false',
      );
      this.briefEnabled = checked;
      this.settingsSaved = true;
      this.settingsError = '';
      if (checked) await this.loadBrief();
      else this.brief = null;
    } catch (error) {
      this.settingsError = this.message(error);
    }
  }

  async revokeOptOut(action: string): Promise<void> {
    if (!this.isOwner) return;
    const requestContext = this.chatRequestContext();
    if (!requestContext.signedIn || !requestContext.workspaceId) return;
    try {
      await this.api.deleteOptOut(requestContext.workspaceId, action);
      this.optOuts = this.optOuts.filter(optOut => optOut.action !== action);
      this.settingsSaved = true;
      this.settingsError = '';
    } catch (error) {
      this.settingsError = this.message(error);
    }
  }

  async copyAssistantMessage(content: string, index: number): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(content);
        } catch {
          this.copyTextWithSelectionFallback(content);
        }
      } else {
        this.copyTextWithSelectionFallback(content);
      }
      this.chatCopyStatus = { index, success: true };
    } catch {
      this.chatCopyStatus = { index, success: false };
    }
  }

  private copyTextWithSelectionFallback(content: string): void {
    const temporaryInput = document.createElement('textarea');
    temporaryInput.value = content;
    temporaryInput.setAttribute('readonly', '');
    temporaryInput.setAttribute('aria-hidden', 'true');
    temporaryInput.style.position = 'fixed';
    temporaryInput.style.opacity = '0';
    temporaryInput.style.pointerEvents = 'none';
    temporaryInput.style.insetInlineStart = '-9999px';
    document.body.appendChild(temporaryInput);
    let copied = false;
    try {
      temporaryInput.select();
      temporaryInput.setSelectionRange(0, temporaryInput.value.length);
      copied = document.execCommand('copy');
    } finally {
      temporaryInput.remove();
    }
    if (!copied) throw new Error('Clipboard copy command failed');
  }

  private isChatLogNearBottom(): boolean {
    const log = this.chatLog?.nativeElement;
    if (!log) return true;
    return log.scrollHeight - log.scrollTop - log.clientHeight <= 120;
  }

  private scrollChatToLatest(force = false): void {
    requestAnimationFrame(() => {
      const log = this.chatLog?.nativeElement;
      if (!log || (!force && !this.isChatLogNearBottom())) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      log.scrollTo({ top: log.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  async sendChat(): Promise<void> {
    if (!this.businessId() || !this.chatDraft.trim() || this.chatSending) return;
    const requestContext = this.chatRequestContext();
    // Fail closed if the request cannot be tied to an authenticated user and current role.
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.role || !requestContext.workspaceId) return;

    const question = this.chatDraft.trim();
    // Slice 2: a stop word typed while a proposal execution is in flight
    // stops it — it never goes to the model as a question. (Chat
    // generation is stopped by the stop button; sendChat cannot run then.)
    if (isStopWord(question) && this.executingProposalId !== null) {
      this.chatDraft = '';
      this.stopAssistantWork();
      return;
    }
    const history = this.chatMessages.slice(-8);
    // Only the text turns travel as history — a resumed proposal card
    // is server state, not model context.
    const history = this.chatMessages.slice(-8).map(message => ({ role: message.role, content: message.content }));
    const shouldFollowLatest = this.isChatLogNearBottom();
    this.chatMessages = [...this.chatMessages, { role: 'user', content: question }];
    this.chatDraft = '';
    this.chatSending = true;
    this.chatError = '';
    this.chatCopyStatus = null;
    this.scrollChatToLatest(shouldFollowLatest);

    await runTenantScopedRequest(
      this.chatRequestGuard,
      requestContext,
      () => this.chatRequestContext(),
      () => this.api.chat(requestContext.workspaceId, question, history, this.currentConversationId ?? undefined),
      {
        onSuccess: (reply: ChatReply) => {
          const shouldFollowLatest = this.isChatLogNearBottom();
          // Slice 4: the API returns the persisted thread id (created
          // on the first turn); later turns rejoin the same thread,
          // and the history list picks it up.
          if (reply.conversation_id) {
            this.currentConversationId = reply.conversation_id;
            if (this.historyOpen) void this.loadHistory();
          }
          this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources, mode: reply.mode }];
          const attachments: ChatAttachment[] = [];
          for (const suggestion of reply.suggestions ?? []) {
            attachments.push({ kind: 'suggestion', card: { suggestion, state: 'pending', busy: false, error: '' } });
          }
          if (reply.proposal) {
            attachments.push({ kind: 'proposal', card: this.newProposalCard(reply.proposal) });
            this.ensureCountdownTimer();
          }
          this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources, mode: reply.mode, attachments }];
          this.scrollChatToLatest(shouldFollowLatest);
        },
        onError: error => {
          this.chatMessages = this.chatMessages.slice(0, -1);
          this.chatDraft = question;
          const rawMessage = error instanceof Error ? error.message : '';
          this.chatConfigurationMissing = /AI chat is not configured/i.test(rawMessage);
          this.chatError = this.message(error);
        },
        onFinally: () => {
          this.chatSending = false;
        },
        onStale: () => {
          // The latest request lost its identity/role context without a workspace clear.
          this.chatSending = false;
          this.chatMessages = [];
          this.chatDraft = '';
          this.chatError = '';
          this.chatConfigurationMissing = false;
          this.chatCopyStatus = null;
          this.currentConversationId = null;
        },
      },
    );
  }

  // ---- Slice 2: assistant execution UI ----

  isOwner(): boolean {
    return this.role() === 'owner';
  }

  private newProposalCard(proposal: AssistantProposalView): ProposalCardState {
    return { proposal, busy: null, error: '', editing: false, editDraft: null, editInputs: {}, optOutChecked: false };
  }

  private ensureCountdownTimer(): void {
    if (this.countdownTimer !== null) return;
    this.countdownTimer = setInterval(() => {
      this.nowTick = Date.now();
    }, 1000);
  }

  actionLabel(action: string): string {
    const key = 'ui.assistantExecution.action.' + action;
    const translated = this.t(key);
    return translated === key ? action : translated;
  }

  fieldLabel(path: string): string {
    const segment = path.split('.').pop()?.replace(/\[\d+\]/g, '') ?? path;
    const key = 'ui.assistantExecution.field.' + segment;
    const translated = this.t(key);
    return translated === key ? segment.replace(/_/g, ' ') : translated;
  }

  payloadRows(proposal: AssistantProposalView): PayloadRow[] {
    return flattenPayload(proposal.payload).rows;
  }

  payloadTruncated(proposal: AssistantProposalView): boolean {
    return flattenPayload(proposal.payload).truncated;
  }

  formatValue(value: unknown): string {
    return formatPayloadValue(value);
  }

  proposalCountdownText(card: ProposalCardState): string {
    return proposalCountdown(card.proposal.expires_at, this.nowTick).text;
  }

  proposalExpired(card: ProposalCardState): boolean {
    return proposalCountdown(card.proposal.expires_at, this.nowTick).expired;
  }

  canApprove(card: ProposalCardState): boolean {
    const proposal = card.proposal;
    return this.isOwner()
      && proposal.status === 'proposed'
      && proposal.requires_second_approval
      && proposal.requester_subject !== this.userId()
      && !this.proposalExpired(card);
  }

  canExecute(card: ProposalCardState): boolean {
    const proposal = card.proposal;
    const executable = (proposal.status === 'approved')
      || (proposal.status === 'proposed' && !proposal.requires_second_approval);
    const party = proposal.requester_subject === this.userId()
      || proposal.approver_subject === this.userId();
    return executable && party && !this.proposalExpired(card);
  }

  async approveProposal(card: ProposalCardState): Promise<void> {
    if (card.busy !== null || !this.canApprove(card)) return;
    card.busy = 'approve';
    card.error = '';
    try {
      // The opt-out waives only the second-approval *question* for the
      // owner's own requests; if storing it fails, do not approve.
      if (card.optOutChecked) {
        await this.api.createOptOut(this.businessId(), card.proposal.action);
      }
      card.proposal = await this.api.approveProposal(
        this.businessId(), card.proposal.id, card.proposal.payload_hash,
      );
    } catch (error) {
      card.error = this.message(error);
    } finally {
      card.busy = null;
    }
  }

  async executeProposal(card: ProposalCardState): Promise<void> {
    if (card.busy !== null || !this.canExecute(card)) return;
    card.busy = 'execute';
    card.error = '';
    this.executingProposalId = card.proposal.id;
    try {
      card.proposal = await this.api.executeProposal(this.businessId(), card.proposal.id);
    } catch (error) {
      card.error = this.message(error);
      if (error instanceof ApiRequestError && error.status === 403) {
        this.appendRefusalCard(card.proposal.action, this.message(error));
      }
    } finally {
      card.busy = null;
      this.executingProposalId = null;
      // A stop requested mid-execution reconciles against the server's
      // truth: the card reports executed vs still proposed, never a guess.
      if (this.stopRequested) {
        this.stopRequested = false;
        try {
          const view = await this.api.getProposal(this.businessId(), card.proposal.id);
          card.proposal = view;
          this.appendStoppedCard(view.status === 'executed' ? 'executed' : 'not-executed');
        } catch {
          this.appendStoppedCard('not-executed');
        }
      }
    }
  }

  async cancelProposal(card: ProposalCardState): Promise<void> {
    if (card.busy !== null) return;
    card.busy = 'cancel';
    card.error = '';
    try {
      card.proposal = await this.api.cancelProposal(this.businessId(), card.proposal.id);
    } catch (error) {
      card.error = this.message(error);
    } finally {
      card.busy = null;
    }
  }

  startEditProposal(card: ProposalCardState): void {
    card.editing = true;
    card.error = '';
    card.editDraft = JSON.parse(JSON.stringify(card.proposal.payload)) as Record<string, unknown>;
    card.editInputs = {};
  }

  discardEditProposal(card: ProposalCardState): void {
    card.editing = false;
    card.editDraft = null;
    card.editInputs = {};
    card.error = '';
  }

  onEditInput(card: ProposalCardState, row: PayloadRow, event: Event): void {
    card.editInputs[row.path] = (event.target as HTMLInputElement).value;
  }

  editInputValue(card: ProposalCardState, row: PayloadRow): string {
    return card.editInputs[row.path] ?? formatPayloadValue(row.value);
  }

  async saveEditedProposal(card: ProposalCardState): Promise<void> {
    if (card.busy !== null || !card.editDraft) return;
    // Proposals are immutable: an edit submits a NEW proposal, then the
    // old one is cancelled so a failed create keeps the old card alive.
    const draft = JSON.parse(JSON.stringify(card.editDraft)) as Record<string, unknown>;
    for (const row of flattenPayload(card.proposal.payload).rows) {
      if (!row.editable) continue;
      const raw = card.editInputs[row.path];
      if (raw === undefined) continue;
      const coerced = coerceScalar(raw, row.value);
      if (!coerced.ok) {
        card.error = this.t('ui.assistantExecution.editInvalidValue');
        return;
      }
      setAtPath(draft, row.path, coerced.value);
    }
    card.busy = 'edit';
    card.error = '';
    try {
      const view = await this.api.createProposal(this.businessId(), card.proposal.action, draft);
      try {
        card.proposal = await this.api.cancelProposal(this.businessId(), card.proposal.id);
      } catch (error) {
        card.error = this.message(error);
      }
      card.editing = false;
      card.editDraft = null;
      card.editInputs = {};
      this.chatMessages = [
        ...this.chatMessages,
        { role: 'assistant', content: '', attachments: [{ kind: 'proposal', card: this.newProposalCard(view) }] },
      ];
      this.ensureCountdownTimer();
      this.scrollChatToLatest(true);
    } catch (error) {
      card.error = this.message(error);
      if (error instanceof ApiRequestError && error.status === 403) {
        this.appendRefusalCard(card.proposal.action, this.message(error));
      }
    } finally {
      card.busy = null;
    }
  }

  hasRecordLink(card: ProposalCardState): boolean {
    const result = card.proposal.result;
    if (!result) return false;
    return recordTabForTarget(result.target_type, card.proposal.payload) !== null;
  }

  resultSummary(card: ProposalCardState): string {
    const result = card.proposal.result;
    if (!result) return '';
    for (const field of ['invoice_number', 'order_number', 'name', 'total'] as const) {
      const value = (result as Record<string, unknown>)[field];
      if (typeof value === 'string' && value) return value;
      if (typeof value === 'number') return String(value);
    }
    return '';
  }

  openRecord(card: ProposalCardState): void {
    const result = card.proposal.result;
    if (!result) return;
    const tab = recordTabForTarget(result.target_type, card.proposal.payload);
    if (!tab) return;
    // No per-record URLs exist by design (nested paths fail closed), so
    // the link opens the record's tab; the new record lists first there.
    const url = workspaceUrlFor(tab, window.location.search, window.location.hash);
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // ---- B7 setting suggestions ----

  applySuggestion(card: SuggestionCardState): void {
    // A financial suggestion needs an explicit separate confirm step first.
    if (card.suggestion.is_financial && card.suggestion.requires_confirmation && card.state === 'pending') {
      card.state = 'confirming';
      return;
    }
    void this.doApplySuggestion(card);
  }

  confirmApplySuggestion(card: SuggestionCardState): void {
    void this.doApplySuggestion(card);
  }

  cancelConfirmSuggestion(card: SuggestionCardState): void {
    card.state = 'pending';
  }

  private async doApplySuggestion(card: SuggestionCardState): Promise<void> {
    if (card.busy) return;
    card.busy = true;
    card.error = '';
    try {
      await this.api.updateSetting(this.businessId(), card.suggestion.setting_key, card.suggestion.proposed_value);
      card.state = 'applied';
    } catch (error) {
      card.error = this.message(error);
    } finally {
      card.busy = false;
    }
  }

  async rollbackSuggestion(card: SuggestionCardState): Promise<void> {
    if (card.busy) return;
    card.busy = true;
    card.error = '';
    try {
      if (card.suggestion.current_value === null) {
        await this.api.deleteSetting(this.businessId(), card.suggestion.setting_key);
      } else {
        await this.api.updateSetting(this.businessId(), card.suggestion.setting_key, card.suggestion.current_value);
      }
      card.state = 'rolled-back';
    } catch (error) {
      card.error = this.message(error);
    } finally {
      card.busy = false;
    }
  }

  // ---- Refusal / stopped cards ----

  private appendRefusalCard(action: string, detail: string): void {
    this.chatMessages = [
      ...this.chatMessages,
      { role: 'assistant', content: '', attachments: [{ kind: 'refusal', card: { action, alternative: refusalAlternative(action), detail } }] },
    ];
    this.scrollChatToLatest(true);
  }

  refusalAlternativeText(card: RefusalCardState): string {
    // Full key literals (see stoppedDoneText): the localization guard
    // collects every literal key, so prefixes must be real keys.
    const keys = {
      delete: 'ui.assistantExecution.refusalAlternativeDelete',
      settings: 'ui.assistantExecution.refusalAlternativeSettings',
      membership: 'ui.assistantExecution.refusalAlternativeMembership',
      generic: 'ui.assistantExecution.refusalAlternativeGeneric',
    };
    return this.t(keys[card.alternative]);
  }

  private appendStoppedCard(kind: StoppedCardState['kind']): void {
    this.chatMessages = [
      ...this.chatMessages,
      { role: 'assistant', content: '', attachments: [{ kind: 'stopped', card: { kind } }] },
    ];
    this.scrollChatToLatest(true);
  }

  stoppedDoneText(card: StoppedCardState): string {
    // Full key literals: the localization guard collects every literal
    // key, so a shared 'stopped' prefix would read as a missing key.
    const keys = {
      chat: 'ui.assistantExecution.stoppedChatDone',
      executed: 'ui.assistantExecution.stoppedExecutedDone',
      'not-executed': 'ui.assistantExecution.stoppedNotExecutedDone',
    };
    return this.t(keys[card.kind]);
  }

  stoppedNotDoneText(card: StoppedCardState): string {
    const keys = {
      chat: 'ui.assistantExecution.stoppedChatNotDone',
      executed: 'ui.assistantExecution.stoppedExecutedNotDone',
      'not-executed': 'ui.assistantExecution.stoppedNotExecutedNotDone',
    };
    return this.t(keys[card.kind]);
  }

  stopAssistantWork(): void {
    if (this.chatSending) {
      // runTenantScopedRequest drops the late response after invalidate
      // (neither onFinally nor onStale runs), so the flag resets here.
      this.chatRequestGuard.invalidate();
      this.chatSending = false;
      this.appendStoppedCard('chat');
      return;
    }
    if (this.executingProposalId !== null) {
      // The execute settle handler reconciles the true outcome.
      this.stopRequested = true;
    }
  }

  dismissStopped(message: ChatMessage, attachment: ChatAttachment): void {
    message.attachments = (message.attachments ?? []).filter(item => item !== attachment);
    if (!message.content && !(message.attachments ?? []).length) {
      this.chatMessages = this.chatMessages.filter(item => item !== message);
    }
  }

  reviewDrafts(): void {
    for (const message of this.chatMessages) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.kind !== 'proposal') continue;
        const status = attachment.card.proposal.status;
        if (status !== 'proposed' && status !== 'approved') continue;
        document.getElementById('proposal-' + attachment.card.proposal.id)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }

  clearDrafts(): void {
    for (const message of this.chatMessages) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.kind !== 'proposal') continue;
        const status = attachment.card.proposal.status;
        if (status === 'proposed' || status === 'approved') {
          void this.cancelProposal(attachment.card);
        }
      }
    }
  }

  // ---- Voice input (Web Speech API) ----

  toggleMic(): void {
    if (this.micListening) {
      this.micRecognition?.stop();
      return;
    }
    if (typeof window === 'undefined') return;
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Constructor = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Constructor) {
      this.micError = this.t('ui.assistantExecution.micError');
      return;
    }
    const recognition = new Constructor();
    recognition.lang = this.language().startsWith('ar') ? 'ar-EG' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    const baseDraft = this.chatDraft;
    recognition.onresult = event => {
      let transcript = '';
      for (const result of Array.from(event.results)) {
        transcript += result[0]?.transcript ?? '';
      }
      this.chatDraft = baseDraft ? baseDraft + ' ' + transcript : transcript;
    };
    recognition.onend = () => {
      this.micListening = false;
      this.micRecognition = null;
    };
    recognition.onerror = () => {
      this.micError = this.t('ui.assistantExecution.micError');
      this.micListening = false;
      this.micRecognition = null;
    };
    this.micRecognition = recognition;
    this.micError = '';
    this.micListening = true;
    recognition.start();
  }

  private lastErrorKind: 'session-expired' | 'access-denied' | null = null;
  private lastErrorMessage: string | null = null;

  private message(error: unknown, context: 'auth' | 'api' = 'api'): string {
    const value = error as { code?: string; message?: string };
    const code = typeof value?.code === 'string' ? value.code : '';
    const message = typeof value?.message === 'string' ? value.message : '';
    this.lastErrorKind = null;
    this.lastErrorMessage = null;

    const authKeys: Record<string, string> = {
      'auth/email-already-in-use': 'app.authError.auth_email_already_in_use',
      'auth/invalid-email': 'app.authError.auth_invalid_email',
      'auth/weak-password': 'app.authError.auth_weak_password',
      'auth/operation-not-allowed': 'app.authError.auth_operation_not_allowed',
      'auth/unauthorized-domain': 'app.authError.auth_unauthorized_domain',
      'auth/network-request-failed': 'app.authError.auth_network_request_failed',
      'auth/too-many-requests': 'app.authError.auth_too_many_requests',
    };
    if (code && authKeys[code]) return this.t(authKeys[code]);

    const deniedMessage = message.trim();
    if (deniedMessage === 'Authentication required' || deniedMessage === 'Authenticated subject is missing') {
      this.lastErrorKind = 'session-expired';
      const translated = this.t('ui.m_agj0gj');
      this.lastErrorMessage = translated;
      return translated;
    }
    if (deniedMessage === 'Platform administrator access is not granted.') {
      this.lastErrorKind = 'access-denied';
      const translated = this.t('ui.m_1404mrg');
      this.lastErrorMessage = translated;
      return translated;
    }
    if ([
      'No active membership for this business',
      'Business role is not permitted for this operation',
      'No access to this business workspace.',
    ].includes(deniedMessage) || /^(?:forbidden|permission denied|not authorized|access denied)\b/i.test(deniedMessage)) {
      this.lastErrorKind = 'access-denied';
      const translated = this.t('ui.m_1nbaoyf');
      this.lastErrorMessage = translated;
      return translated;
    }
    if (/AI chat is not configured/i.test(message)) return this.t('ui.m_1kpvtc1');
    if (/timed out/i.test(message)) return this.t('ui.m_1wa8x7o');
    if (message.startsWith('API_CONNECTION_FAILED:')) return this.t('ui.m_1qj0ayu');
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return context === 'auth' ? this.t('ui.m_jjvwnu') : this.t('ui.m_g15vmh');
    }
    if (message) return message;
    return this.t('ui.m_s1b5tm');
  }

  // Public: the template calls t(...) directly (same convention as the reports workspace).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
