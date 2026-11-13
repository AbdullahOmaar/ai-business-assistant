import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Business } from '../../api.service';
import { LocalizationService } from '../../localization.service';

@Component({
  selector: 'aba-mobile-app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mobile-app-header"
      [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'"
      [attr.aria-label]="t("ui.m_kaqjkm")">
      <div class="page-context">
        <button class="brand-button" type="button" (click)="homeRequested.emit()"
          [attr.aria-label]="t("ui.m_1a1fpcr")">
          <span class="brand-mark" aria-hidden="true">A</span>
        </button>
        <div class="page-copy">
          @if (showGreeting) {
            <p class="greeting">{{ t("ui.m_16yi12b") }}</p>
          }
          <h1 aria-live="polite" aria-atomic="true">{{ pageTitle }}</h1>
        </div>
        <div class="header-actions">
          <button class="assistant-shortcut" type="button"
            [attr.aria-label]="t("ui.m_13ly4yi")"
            (click)="assistantRequested.emit()">
            <span aria-hidden="true">✦</span>
            <span>{{ t("ui.m_1k5kzkx") }}</span>
          </button>
          <button class="icon-button notification-button" type="button"
            [attr.aria-label]="t("ui.m_vlrg7")"
            [attr.title]="t("ui.m_vlrg7")"
            (click)="notificationsRequested.emit()">
            <span aria-hidden="true">♢</span>
          </button>
          <button #profileTrigger class="profile-trigger" type="button"
            [attr.aria-label]="t("ui.m_1l0ize9")"
            [attr.aria-expanded]="profileMenuOpen"
            [attr.aria-controls]="profileMenuOpen ? 'mobile-account-menu' : null"
            (click)="toggleProfileMenu()">
            <span class="profile-avatar" aria-hidden="true">{{ userInitial }}</span>
          </button>
        </div>
      </div>
      @if (profileMenuOpen) {
        <div #accountMenu id="mobile-account-menu" class="account-menu" role="group"
          [attr.aria-label]="t("ui.m_1l0ize9")">
          <p class="account-email">{{ userEmail }}</p>
          <button type="button" class="account-action" (click)="requestLanguageToggle()">
            <span aria-hidden="true">文</span>
            <span>{{ language === 'ar' ? t('common.languages.english') : t('common.languages.arabic') }}</span>
          </button>
          <button type="button" class="account-action sign-out-action" (click)="requestSignOut()">
            <span aria-hidden="true">↪</span>
            <span>{{ t("ui.m_r2b303") }}</span>
          </button>
        </div>
      }
      <div class="workspace-context">
        <div class="workspace-copy">
          <span class="context-label">{{ t("ui.m_qhibn3") }}</span>
          <strong aria-live="polite" aria-atomic="true">{{ workspaceName }}</strong>
        </div>
        @if (businesses.length > 1) {
          <label class="workspace-switch">
            <span class="sr-only">{{ t("ui.m_2ifq4l") }}</span>
            <select [attr.aria-label]="t("ui.m_2ifq4l")"
              [ngModel]="selectedBusinessId" (ngModelChange)="businessChange.emit($event)">
              @for (business of businesses; track business.id) {
                <option [value]="business.id">{{ business.name }}</option>
              }
            </select>
          </label>
        }
      </div>
    </section>
  `,
  styleUrl: './aba-mobile-app-header.component.css'
})
export class AbaMobileAppHeaderComponent {
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() appVersion = '';
  @Input() workspaceName = '';
  @Input() businesses: Business[] = [];
  @Input() selectedBusinessId = '';
  @Input() pageTitle = '';
  @Input() userEmail = '';
  @Input() showGreeting = false;

  @Output() homeRequested = new EventEmitter<void>();
  @Output() businessChange = new EventEmitter<string>();
  @Output() notificationsRequested = new EventEmitter<void>();
  @Output() assistantRequested = new EventEmitter<void>();
  @Output() languageToggleRequested = new EventEmitter<void>();
  @Output() signOutRequested = new EventEmitter<void>();

  @ViewChild('profileTrigger') private profileTrigger?: ElementRef<HTMLButtonElement>;
  profileMenuOpen = false;

  constructor(private readonly host: ElementRef<HTMLElement>, private readonly localization: LocalizationService) {}

  get userInitial(): string {
    return this.userEmail.trim().charAt(0).toUpperCase() || 'A';
  }

  t(keyOrArabic: string, paramsOrEnglish?: Record<string, string | number> | string): string {
    if (typeof paramsOrEnglish === 'string') {
      return this.language === 'ar' ? keyOrArabic : paramsOrEnglish;
    }
    return this.localization.translate(keyOrArabic, paramsOrEnglish);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  requestLanguageToggle(): void {
    this.profileMenuOpen = false;
    this.languageToggleRequested.emit();
    queueMicrotask(() => this.profileTrigger?.nativeElement.focus());
  }

  requestSignOut(): void {
    this.profileMenuOpen = false;
    this.signOutRequested.emit();
  }

  @HostListener('document:keydown.escape')
  closeProfileMenuOnEscape(): void {
    if (!this.profileMenuOpen) return;
    this.profileMenuOpen = false;
    this.profileTrigger?.nativeElement.focus();
  }

  @HostListener('document:focusin', ['$event'])
  closeProfileMenuOnOutsideFocus(event: FocusEvent): void {
    if (!this.profileMenuOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    const accountMenu = this.host.nativeElement.querySelector('.account-menu');
    if (this.profileTrigger?.nativeElement.contains(target) || accountMenu?.contains(target)) return;
    this.profileMenuOpen = false;
  }

  @HostListener('document:pointerdown', ['$event'])
  closeProfileMenuOnOutsidePointer(event: PointerEvent): void {
    if (!this.profileMenuOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    const accountMenu = this.host.nativeElement.querySelector('.account-menu');
    if (this.profileTrigger?.nativeElement.contains(target) || accountMenu?.contains(target)) return;
    this.profileMenuOpen = false;
  }
}
