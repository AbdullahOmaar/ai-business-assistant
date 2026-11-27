// 3A-921 F1d (Clean Code program): the signed-out region of the
// shell (splash, startup failure, setup notice and the auth card),
// extracted as a presentational component. Zero behavior change:
// the shell keeps the whole auth/session flow (submitAuth, demo
// login, initializeApp, install prompt, language) and its state;
// the component renders the same four branches in the same order
// and two-way-binds email/password/signingUp/installHelp back to
// the shell fields. Styles moved verbatim from app.component.css;
// the .version-pill and .mobile-install-card rules are copies
// (the shell keeps its own for the signed-in chrome, the same
// arrangement as the invoice status badge in F1b).
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocalizationService } from './localization.service';
import { AbaLoadingLogoComponent } from './shared/ui/aba-loading-logo.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';

@Component({
  selector: 'aba-auth-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaLoadingLogoComponent, AbaStateMessageComponent],
  template: `
@if (!initialized) {
  <main class="splash-overlay" role="status" aria-live="polite">
    <div class="auth-card">
      <aba-loading-logo [announce]="false" />
      <h1>{{ t('common.app_title') }}</h1>
      <div class="splash-release-meta">
        <span class="version-pill splash-version" [attr.title]="t('ui.m_g3351m') + ' · UI commit ' + uiCommitLabel + ' · API commit ' + apiCommitLabel + ' · Build time (Cairo): ' + buildTimeLabel">UI v{{ appVersion }} · API {{ apiVersionLabel }}</span>
        <p class="release-line splash-release-line">{{ releaseLineLabel }}</p>
      </div>
      <p class="muted">{{ t('ui.m_1uzdlys') }}</p>
    </div>
  </main>
} @else if (startupFailed) {
  <main class="auth-card">
    <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguageRequest.emit()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button></div>
    <div class="brand-mark">A</div>
    <h1>{{ t('ui.m_tee7tu') }}</h1>
    <aba-state-message kind="error" [description]="error" />
    <button class="secondary auth-retry" type="button" (click)="retryInitializeRequest.emit()" [disabled]="loading">{{ loading ? t('ui.m_1dc4cbo') : t('ui.m_lr6ezy') }}</button>
  </main>
} @else if (setupNeeded) {
  <main class="setup-card">
    <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguageRequest.emit()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button></div>
    <div class="brand-mark">A</div>
    <p class="eyebrow">{{ t('ui.m_1yxyqru') }}</p>
    <h1>{{ t('ui.m_11t8fki') }}</h1>
    <p>{{ t('ui.m_1pg99q7') }}</p>
    <div class="setup-steps">
      <p><strong>1.</strong> {{ t('ui.m_1ltjr2f') }} <code>frontend/public/runtime-config.json</code> {{ t('ui.m_11mqt0a') }}</p>
      <p><strong>2.</strong> {{ t('ui.m_1lj5n4d') }} <code>apiBaseUrl</code> {{ t('ui.m_1aj80o5') }}</p>
      <p><strong>3.</strong> {{ t('ui.m_15vm5ge') }} <code>apiKey</code>, <code>authDomain</code>, <code>projectId</code>, {{ t('ui.m_57gsye') }} <code>appId</code>.</p>
      <p><strong>4.</strong> {{ t('ui.m_1rirx3l') }}</p>
    </div>
    <p class="footnote">{{ t('ui.m_1uk988r') }}</p>
  </main>
} @else {
  <main class="auth-card">
    <div class="language-row"><button class="secondary language-toggle" type="button" (click)="toggleLanguageRequest.emit()">{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</button></div>
    <div class="auth-identity">
      <img class="auth-character" src="identity/loader-character.png" alt="" aria-hidden="true">
      <span class="auth-app-name">{{ t('common.app_title') }}</span>
    </div>
    <p class="eyebrow">{{ t('ui.m_ll4uy7') }}</p>
    <h1 id="auth-form-heading">{{ signingUp ? t('ui.m_1cuf5gq') : t('ui.m_cfel9w') }}</h1>
    <p class="muted">{{ t('ui.m_1euk0tm') }}</p>
    <form #authForm="ngForm" aria-labelledby="auth-form-heading" (ngSubmit)="authForm.valid && submitAuthRequest.emit()" class="stack">
      <label>{{ t('ui.m_1jc8kzg') }}<input #emailModel="ngModel" name="email" type="email" autocomplete="email" required [(ngModel)]="email" (ngModelChange)="emailChange.emit($event)" [attr.aria-invalid]="emailModel.invalid && (emailModel.touched || authForm.submitted) ? 'true' : null" [attr.aria-describedby]="emailModel.invalid && (emailModel.touched || authForm.submitted) ? 'auth-email-error' : null">
        @if (emailModel.invalid && (emailModel.touched || authForm.submitted)) {
          <small id="auth-email-error" class="field-error" aria-live="polite">{{ emailModel.errors?.['required'] ? t('ui.m_gxa0df') : t('ui.m_1afx9c8') }}</small>
        }
      </label>
      <label>{{ t('ui.m_eklfkj') }}<input #passwordModel="ngModel" name="password" type="password" [attr.autocomplete]="signingUp ? 'new-password' : 'current-password'" minlength="6" required [(ngModel)]="password" (ngModelChange)="passwordChange.emit($event)" [attr.aria-invalid]="passwordModel.invalid && (passwordModel.touched || authForm.submitted) ? 'true' : null" [attr.aria-describedby]="passwordModel.invalid && (passwordModel.touched || authForm.submitted) ? 'auth-password-error' : null">
        @if (passwordModel.invalid && (passwordModel.touched || authForm.submitted)) {
          <small id="auth-password-error" class="field-error" aria-live="polite">{{ passwordModel.errors?.['required'] ? t('ui.m_pfxpuv') : t('ui.m_1vnk3nk') }}</small>
        }
      </label>
      <button class="primary" type="submit" [disabled]="loading">{{ loading ? t('ui.m_jxz3f3') : (signingUp ? t('ui.m_1hggna5') : t('ui.m_h8edye')) }}</button>
    </form>
    @if (error) { <aba-state-message kind="error" [description]="error" /> }
    @if (!signingUp) {
      <button class="demo-login-button" type="button" (click)="demoLoginRequest.emit()" [disabled]="loading">
        <span class="demo-login-icon" aria-hidden="true">✦</span>
        <span>{{ loading ? t('demo.login.loading') : t('demo.login.button') }}</span>
        <span class="demo-login-arrow" aria-hidden="true">←</span>
      </button>
      <p class="demo-login-note">{{ t('demo.login.note') }}</p>
    }
    <button class="text-button" type="button" (click)="signingUpChange.emit(!signingUp)">{{ signingUp ? t('ui.m_1uh3cl9') : t('ui.m_1fdki9f') }}</button>
    @if (!isInstalled) {
      <section class="mobile-install-card auth-mobile-install" [attr.aria-label]="t('ui.m_1ig5s72')">
        <div class="mobile-install-copy">
          <span class="mobile-install-icon" aria-hidden="true">⇧</span>
          <div>
            <strong>{{ t('ui.m_1i6f7xh') }}</strong>
            <small>{{ t('ui.m_1ggnkh3') }}</small>
          </div>
        </div>
        <button class="secondary install-button mobile-install-button" type="button" (click)="installRequest.emit()">{{ t('ui.m_76lwbh') }}</button>
      </section>
    }
    @if (installHelp && !isInstalled) {
      <div class="install-help install-help-inline" role="status">
        {{ t('ui.m_14cdic2') }}
        <button type="button" class="secondary" (click)="installHelpChange.emit(false)">{{ t('ui.m_1av23fu') }}</button>
      </div>
    }
  </main>
}
  `,
  styles: [`
.splash-overlay{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:#f6f8fb}
.splash-overlay .auth-card{margin:0 auto}
.language-row{display:flex;justify-content:flex-end;margin-bottom:8px}
.language-toggle{min-height:38px}
.install-help{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;padding:12px 14px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:12px;color:#065f46;font-size:12px;line-height:1.6}
.install-help-inline{position:static;z-index:auto;width:min(520px,100%);max-width:100%;margin:0 0 14px auto;box-shadow:none}
.setup-card,.auth-card{width:min(540px,calc(100% - 30px));margin:8vh auto;background:var(--aba-color-surface,#fff);border:1px solid #e5e7eb;border-radius:20px;padding:clamp(22px,5vw,42px);box-shadow:0 20px 70px #0f172a0b}
.setup-card h1,.auth-card h1{font-size:clamp(17px,8vw,28px);letter-spacing:-.8px;margin:8px 0;overflow-wrap:normal}
.setup-card>p:not(.eyebrow),.auth-card>p{font-size:12px;color:var(--aba-color-text-tertiary,#6b7280);line-height:1.7}
.setup-steps{background:var(--aba-color-surface-subtle,#f8fafc);border-radius:12px;padding:14px;margin-top:20px}
.setup-steps p{font-size:11px;line-height:1.7;color:#374151;margin:9px 0}
.setup-steps code{font-size:10px;overflow-wrap:anywhere}
.auth-card .primary{margin-top:3px}
.auth-identity{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.auth-character{width:52px;height:52px;object-fit:contain;flex:none}
.auth-app-name{font-size:19px;font-weight:800;letter-spacing:-.3px}
.demo-login-button{width:100%;min-height:54px;margin-top:16px;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:10px;border:1.5px solid #0f766e;border-radius:14px;background:var(--aba-color-surface,#fff);color:#0f766e;font:inherit;font-size:14px;font-weight:800;transition:background .18s ease,opacity .18s ease}
.demo-login-button:hover:not(:disabled){background:#f0fdfa}
.demo-login-button:focus-visible{outline:3px solid #0f766e;outline-offset:3px}
.demo-login-button:disabled{opacity:.65;cursor:wait}
.demo-login-icon{font-size:19px}
.demo-login-arrow{margin-inline-start:auto;font-size:18px}
.demo-login-note{margin:7px 0 0!important;text-align:center;font-size:10px!important;color:var(--aba-color-text-tertiary,#64748b)!important}
.splash-release-line{display:block;margin:-8px 0 18px;color:var(--aba-color-text-primary,#0f172a);font-size:13.5px;font-weight:600;line-height:1.6;text-align:center}
.splash-release-meta{display:grid;justify-items:center;gap:7px;width:100%;min-width:0;margin:0 0 18px;direction:inherit;text-align:center}
.version-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border:1px solid #cbd5e1;border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-muted,#334155);font-size:11px;font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums}
.mobile-install-card{display:none}
.auth-card,.setup-card{margin:0 auto}
@media(max-width:760px){.mobile-install-card{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;margin:0 0 12px;padding:10px 12px;border:1px solid var(--aba-color-primary-border,#99f6e4);border-radius:14px;background:linear-gradient(110deg,#f0fdfa,#f8fafc);box-shadow:0 2px 10px #0f766e0a}.mobile-install-copy{display:flex;align-items:center;gap:9px;min-width:0}.mobile-install-copy>div{display:grid;gap:2px;min-width:0}.mobile-install-copy strong{color:var(--aba-color-text-primary,#172033);font-size:12px;line-height:1.4}.mobile-install-copy small{color:var(--aba-color-text-secondary,#64748b);font-size:11px;line-height:1.45}.mobile-install-icon{display:grid;flex:0 0 34px;width:34px;height:34px;place-items:center;border-radius:10px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59);font-size:18px;font-weight:900}.mobile-install-button{display:inline-flex;flex:0 0 auto;min-width:72px;min-height:44px;padding:9px 12px;border-radius:11px}}
@media(max-width:380px){.mobile-install-card{gap:8px;padding:9px}.mobile-install-copy{gap:7px}.mobile-install-copy small{font-size:10px}.mobile-install-button{min-width:68px;padding-inline:10px}}
  `],
})
export class AuthScreenComponent {
  @Input() initialized = false;
  @Input() startupFailed = false;
  @Input() setupNeeded = false;
  @Input() signingUp = false;
  @Input() loading = false;
  @Input() error = '';
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() isInstalled = false;
  @Input() installHelp = false;
  @Input() email = '';
  @Input() password = '';
  @Input() appVersion = '';
  @Input() apiVersionLabel = '';
  @Input() uiCommitLabel = '';
  @Input() apiCommitLabel = '';
  @Input() buildTimeLabel = '';
  @Input() releaseLineLabel = '';

  @Output() emailChange = new EventEmitter<string>();
  @Output() passwordChange = new EventEmitter<string>();
  @Output() signingUpChange = new EventEmitter<boolean>();
  @Output() installHelpChange = new EventEmitter<boolean>();
  @Output() submitAuthRequest = new EventEmitter<void>();
  @Output() demoLoginRequest = new EventEmitter<void>();
  @Output() retryInitializeRequest = new EventEmitter<void>();
  @Output() toggleLanguageRequest = new EventEmitter<void>();
  @Output() installRequest = new EventEmitter<void>();

  private readonly localization = inject(LocalizationService);

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
