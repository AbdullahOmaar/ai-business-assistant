import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, LocalizationService } from './api.service';
import type { BusinessInvitation, BusinessInvitationCreated } from './api.service';

@Component({
  selector: 'aba-workspace-invitations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="team-card" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      @if (mode === 'manage') {
        <header class="team-heading">
          <div><p class="eyebrow">{{ t('access_management') }}</p><h2>{{ t('title') }}</h2><p>{{ t('description') }}</p></div>
          <span class="team-role">{{ t('owner_only') }}</span>
        </header>
        <form class="invite-form" (ngSubmit)="createInvitation()">
          <label>{{ t('staff_email') }}
            <input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" required maxlength="254" autocomplete="email" [placeholder]="t('email_placeholder')">
          </label>
          <button class="primary" type="submit" [disabled]="loading || !inviteEmail.trim()">{{ loading ? t('working') : t('create_invitation') }}</button>
        </form>
        @if (createdInviteLink) {
          <div class="invite-created" role="status">
            <strong>{{ t('invitation_ready') }}</strong>
            <p>{{ t('share_manually') }}</p>
            <div class="copy-row"><input [attr.aria-label]="t('invitation_link')" readonly [value]="createdInviteLink"><button type="button" class="secondary" (click)="copyInviteLink()">{{ copied ? t('copied') : t('copy_link') }}</button></div>
          </div>
        }
        <div class="team-list-heading"><h3>{{ t('invitations') }}</h3><button type="button" class="secondary" (click)="loadInvitations()" [disabled]="loading">{{ t('refresh') }}</button></div>
        @if (invitations.length) {
          <div class="invitation-list">
            @for (invitation of invitations; track invitation.id) {
              <article class="invitation-row">
                <div class="invitation-main"><strong>{{ invitation.email }}</strong><small>{{ t('staff') }} · {{ formatDate(invitation.expires_at) }}</small></div>
                <span class="status" [class.pending]="invitation.status === 'pending'">{{ statusLabel(invitation.status) }}</span>
                @if (invitation.status === 'pending') { <button type="button" class="danger-link" (click)="revokeInvitation(invitation)" [disabled]="loading">{{ t('revoke') }}</button> }
              </article>
            }
          </div>
        } @else {
          <p class="empty">{{ t('no_invitations') }}</p>
        }
      } @else if (acceptVisible) {
        <header class="team-heading"><div><p class="eyebrow">{{ t('workspace_access') }}</p><h2>{{ t('have_invitation') }}</h2><p>{{ t('accept_instructions') }}</p></div></header>
        <form class="invite-form accept-form" (ngSubmit)="acceptInvitation()">
          <label>{{ t('invitation_token') }}<input name="inviteToken" [(ngModel)]="inviteToken" required minlength="32" autocomplete="off"></label>
          <button class="primary" type="submit" [disabled]="loading || inviteToken.trim().length < 32">{{ loading ? t('joining') : t('accept_invitation') }}</button>
        </form>
      }
      @if (error) { <p class="feedback error" role="alert">{{ error }}</p> }
      @if (success) { <p class="feedback success" role="status">{{ success }}</p> }
    </section>
  `,
  styles: [`
    :host{display:block}.team-card{background:var(--aba-color-surface,#fff);border:1px solid var(--aba-color-border,#e5eaf1);border-radius:18px;padding:clamp(16px,3vw,24px);color:var(--aba-color-text-primary,#172033);box-shadow:var(--aba-shadow-card,0 2px 8px #00000008)}
    .team-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px}.eyebrow{margin:0 0 6px;color:var(--aba-color-primary,#0f766e);font-size:11px;font-weight:800;letter-spacing:.08em}.team-heading h2{margin:0;font-size:clamp(20px,3vw,26px)}.team-heading p:last-child{margin:8px 0 0;color:var(--aba-color-text-muted,#64748b);line-height:1.6;max-width:680px}.team-role,.status{white-space:nowrap;border-radius:999px;padding:6px 10px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59);font-size:12px;font-weight:700}
    .invite-form{display:flex;align-items:flex-end;gap:12px;padding:16px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;background:var(--aba-color-surface-subtle,#f8fafc)}label{display:grid;gap:7px;flex:1;font-size:13px;font-weight:700}input{width:100%;min-width:0;min-height:44px;border:1px solid var(--aba-color-border-strong,#cbd5e1);border-radius:10px;padding:10px 12px;background:#fff;color:inherit;font:inherit}button{min-height:42px;border:0;border-radius:10px;padding:9px 15px;font:inherit;font-weight:700;cursor:pointer}.primary{background:var(--aba-color-primary,#0f766e);color:#fff}.secondary{background:var(--aba-color-surface-hover,#f1f5f9);color:inherit;border:1px solid var(--aba-color-border,#e5eaf1)}button:disabled{opacity:.55;cursor:not-allowed}
    .invite-created{margin-top:14px;padding:14px;border:1px solid var(--aba-color-success-border,#bbf7d0);border-radius:12px;background:var(--aba-color-success-soft,#ecfdf5)}.invite-created p{margin:6px 0 12px;color:var(--aba-color-text-muted,#64748b);line-height:1.5}.copy-row{display:flex;gap:8px}.team-list-heading{display:flex;justify-content:space-between;align-items:center;margin:22px 0 10px}.team-list-heading h3{margin:0;font-size:16px}.invitation-list{display:grid;gap:8px}.invitation-row{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:12px}.invitation-main{display:grid;gap:4px;flex:1;min-width:0}.invitation-main strong{overflow-wrap:anywhere}.invitation-main small,.empty{color:var(--aba-color-text-muted,#64748b)}.status{background:var(--aba-color-surface-hover,#f1f5f9);color:var(--aba-color-text-muted,#64748b)}.status.pending{background:var(--aba-color-warning-soft,#fffbeb);color:var(--aba-color-warning-text,#92400e)}.danger-link{background:transparent;color:var(--aba-color-danger-text,#991b1b);padding-inline:8px}.feedback{margin:14px 0 0;padding:10px 12px;border-radius:10px}.feedback.error{background:var(--aba-color-danger-soft,#fef2f2);color:var(--aba-color-danger-text,#991b1b)}.feedback.success{background:var(--aba-color-success-soft,#ecfdf5);color:var(--aba-color-success-text,#065f46)}.empty{padding:16px;text-align:center}.accept-form{margin-top:8px}
    @media(max-width:620px){.team-heading{display:grid}.invite-form{align-items:stretch;flex-direction:column}.invite-form button{width:100%}.invitation-row{align-items:flex-start;flex-wrap:wrap}.invitation-main{flex-basis:calc(100% - 20px)}.copy-row{flex-direction:column}.copy-row button{width:100%}}
  `],
})
export class WorkspaceInvitationsComponent implements OnChanges {
  @Input() businessId: string | null = null;
  @Input() mode: 'manage' | 'accept' = 'manage';
  @Input() language: 'ar' | 'en' = 'ar';
  @Output() accepted = new EventEmitter<void>();

  inviteEmail = '';
  inviteToken = '';
  invitations: BusinessInvitation[] = [];
  createdInviteLink = '';
  loading = false;
  copied = false;
  error = '';
  success = '';
  acceptVisible = false;

  constructor(private readonly api: ApiService, private readonly localization: LocalizationService) {}

  ngOnChanges(): void {
    if (this.mode === 'manage' && this.businessId) void this.loadInvitations();
    if (this.mode === 'accept') {
      const fragment = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
      const token = new URLSearchParams(fragment).get('invite');
      if (token) this.inviteToken = token;
      this.acceptVisible = Boolean(this.inviteToken) || !this.businessId;
    }
  }

  t(key: string): string { return this.localization.translate('team.' + key); }

  async loadInvitations(): Promise<void> {
    if (!this.businessId) return;
    this.loading = true; this.error = '';
    try { this.invitations = await this.api.businessInvitations(this.businessId); }
    catch (error) { this.error = error instanceof Error ? error.message : this.t('load_error'); }
    finally { this.loading = false; }
  }

  async createInvitation(): Promise<void> {
    if (!this.businessId || !this.inviteEmail.trim() || this.loading) return;
    this.loading = true; this.error = ''; this.success = ''; this.createdInviteLink = '';
    try {
      const created: BusinessInvitationCreated = await this.api.createBusinessInvitation(this.businessId, this.inviteEmail.trim());
      const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
      this.createdInviteLink = base ? base + '#invite=' + encodeURIComponent(created.token) : created.token;
      this.inviteEmail = '';
      this.success = this.t('created_success');
      await this.loadInvitations();
    } catch (error) { this.error = error instanceof Error ? error.message : this.t('create_error'); }
    finally { this.loading = false; }
  }

  async copyInviteLink(): Promise<void> {
    if (!this.createdInviteLink) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(this.createdInviteLink); this.copied = true;
      } else { this.success = this.t('copy_manual'); }
    } catch { this.success = this.t('copy_manual'); }
  }

  async revokeInvitation(invitation: BusinessInvitation): Promise<void> {
    if (!this.businessId || invitation.status !== 'pending' || this.loading) return;
    this.loading = true; this.error = ''; this.success = '';
    try {
      await this.api.revokeBusinessInvitation(this.businessId, invitation.id);
      this.success = this.t('revoked_success');
      await this.loadInvitations();
    } catch (error) { this.error = error instanceof Error ? error.message : this.t('revoke_error'); }
    finally { this.loading = false; }
  }

  async acceptInvitation(): Promise<void> {
    if (this.inviteToken.trim().length < 32 || this.loading) return;
    this.loading = true; this.error = ''; this.success = '';
    try {
      await this.api.acceptBusinessInvitation(this.inviteToken.trim());
      this.inviteToken = ''; this.acceptVisible = false;
      this.success = this.t('accepted_success');
      if (typeof window !== 'undefined' && window.location.hash.includes('invite=')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      this.accepted.emit();
    } catch (error) { this.error = error instanceof Error ? error.message : this.t('accept_error'); }
    finally { this.loading = false; }
  }

  statusLabel(status: BusinessInvitation['status']): string {
    return ({
      pending: this.t('status_pending'),
      accepted: this.t('status_accepted'),
      revoked: this.t('status_revoked'),
      expired: this.t('status_expired'),
    })[status];
  }

  formatDate(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return this.localization.formatDate(date, { dateStyle: 'medium', timeStyle: 'short' });
  }
}
