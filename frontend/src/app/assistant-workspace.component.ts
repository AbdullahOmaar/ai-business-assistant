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
import { Component, ElementRef, inject, input, OnChanges, output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, type ChatReply } from './api.service';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { AbaSkeletonComponent } from './shared/ui/aba-skeleton.component';

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
        <button type="button" class="chat-new-button" (click)="startNewChat()" [disabled]="chatSending || (!chatMessages.length && !chatDraft.trim())">{{ t('ui.m_gz9o3g') }}</button>
      </div>
    </aba-section-header>
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
          <p>{{ message.content }}</p>
          @if (message.sources?.length) { <small class="source-list">{{ t('ui.m_1uui693') }} @for (source of message.sources; track source.id) { <span>{{ source.type === 'invoice' ? t('ui.m_1nfhuv2') : (source.type === 'expense' ? t('ui.m_q7obp1') : source.type) }} · {{ source.invoice_number || (source.type === 'expense' && source.category ? expenseCategoryLabel(source.category) : (source.category || source.id)) }}</span> }</small> }
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
    <form #chatForm="ngForm" class="chat-form" (ngSubmit)="chatForm.valid && chatDraft.trim() && sendChat()"><textarea #chatMessageControl="ngModel" name="chatMessage" rows="2" maxlength="2000" enterkeyhint="send" (keydown.enter)="handleChatKeydown($any($event))" [attr.aria-label]="t('ui.m_1d2fatg')" [attr.aria-invalid]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'true' : null" [attr.aria-describedby]="(chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted) ? 'chat-message-hint chat-message-error' : 'chat-message-hint'" [placeholder]="t('ui.m_1pafgoq')" required [(ngModel)]="chatDraft" [disabled]="chatSending"></textarea><button class="primary" type="submit" [disabled]="chatSending || !chatDraft.trim()">{{ chatSending ? t('ui.m_1sgwbzd') : t('ui.m_rf7y63') }}</button></form>
    <div class="chat-composer-meta"><small id="chat-message-hint">{{ t('ui.m_vdvf9x') }}</small><small>{{ chatDraft.length }} / 2000</small></div>
    @if ((chatMessageControl.invalid || !chatDraft.trim()) && (chatMessageControl.touched || chatForm.submitted)) { <small id="chat-message-error" class="field-error" role="alert">{{ t('ui.m_18j0gfn') }}</small> }
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
@media(max-width:480px){.assistant-suggestions{padding:12px}.suggestion-card{flex-basis:158px;min-height:82px;padding:8px}.chat-log{min-height:220px;max-height:48vh}.chat-message{max-width:96%}.chat-header-actions{gap:6px}.chat-new-button{min-height:40px}.chat-form{grid-template-columns:minmax(0,1fr) 84px;gap:8px}.chat-form .primary{padding-inline:8px}.chat-composer-meta{align-items:flex-start}.chat-composer-meta small{font-size:9px}}
.chat-log{min-height:280px;max-height:55vh;overflow:auto;border:1px solid #edf0f5;border-radius:11px;padding:12px}
.chat-message{max-width:85%;padding:11px 13px;border-radius:12px;background:#f3f4f6;margin:8px 0}
.chat-message.user-message{margin-inline-end:auto;margin-inline-start:0;background:#e0f2fe}
.chat-message-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.chat-message span{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--aba-color-text-tertiary,#6b7280);font-weight:800}
.chat-copy-button{min-height:32px;min-width:44px;padding:5px 8px;border:1px solid var(--aba-color-border-subtle,#dbe2ea);border-radius:8px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-secondary,#475569);font-size:10px;font-weight:700}
.chat-copy-button:hover{border-color:var(--aba-color-primary,#0f766e);color:var(--aba-color-primary,#0f766e)}
.chat-message p{font-size:12px;line-height:1.65;white-space:pre-wrap;margin:5px 0 0}
.chat-form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin-top:12px}
.chat-form textarea{resize:vertical;min-height:48px;max-height:180px;line-height:1.5}
.chat-form .primary{min-width:84px;min-height:48px}
.chat-composer-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;color:var(--aba-color-text-tertiary,#64748b)}
.chat-composer-meta small{font-size:10px;line-height:1.5}
.chat-composer-meta small:last-child{flex:0 0 auto;font-variant-numeric:tabular-nums}
.chat-form textarea{font-size:16px}
.chat-copy-button span{display:inline-block}
@media(max-width:480px){.chat-message p{font-size:14px;line-height:1.75;overflow-wrap:anywhere}.suggestion-card strong{font-size:12px}.suggestion-card small{font-size:11px}.chat-composer-meta small{font-size:10px}}
.assistant-suggestions{padding:12px;border:1px solid #dbeafe;border-radius:15px;background:linear-gradient(135deg,#f8fbff,#eff6ff)}
.assistant-suggestions .suggestion-card{min-height:68px}
@media(max-width:600px){.suggestion-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:760px){.chat-form{position:sticky;bottom:calc(var(--aba-keyboard-inset,0px) + 8px);z-index:25;align-items:end;padding:8px 0;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 18%)}.shell.keyboard-open .chat-form{position:fixed;inset-inline:12px;bottom:calc(var(--aba-keyboard-inset,0px) + 8px);margin-top:0;padding:8px 10px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;background:var(--aba-color-surface,#fff);box-shadow:0 8px 24px #0f172a1a}.chat-form textarea{min-height:48px;max-height:25dvh;resize:none}.shell.keyboard-open .chat-log{min-height:100px;max-height:35dvh}}
  `],
})
export class AssistantWorkspaceComponent implements OnChanges {
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
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; sources?: ChatReply['sources']; mode?: string }> = [];
  chatSending = false;
  chatError = '';
  chatConfigurationMissing = false;
  chatCopyStatus: { index: number; success: boolean } | null = null;
  @ViewChild('chatLog') private chatLog?: ElementRef<HTMLElement>;

  private readonly chatRequestGuard = new WorkspaceLoadGuard();

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
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.chatRequestGuard.invalidate();
    this.chatSending = false;
    this.chatMessages = [];
    this.chatDraft = '';
    this.chatError = '';
    this.chatConfigurationMissing = false;
    this.chatCopyStatus = null;
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
    const history = this.chatMessages.slice(-8);
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
      () => this.api.chat(requestContext.workspaceId, question, history),
      {
        onSuccess: (reply: ChatReply) => {
          const shouldFollowLatest = this.isChatLogNearBottom();
          this.chatMessages = [...this.chatMessages, { role: 'assistant', content: reply.answer, sources: reply.sources, mode: reply.mode }];
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
        },
      },
    );
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
