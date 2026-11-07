import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Business } from '../../api.service';

@Component({
  selector: 'aba-mobile-app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mobile-app-header" [class.install-cta-visible]="showInstallButton"
      [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'"
      [attr.aria-label]="t('رأس التطبيق ومساحة العمل', 'App and workspace header')">
      <div class="brand-row">
        <button class="brand-button" type="button" (click)="homeRequested.emit()"
          [attr.aria-label]="t('العودة إلى الرئيسية', 'Go to Home')">
          <span class="brand-mark" aria-hidden="true">A</span>
          <span class="brand-copy">
            <strong>{{ t('مساعد الأعمال', 'Business Assistant') }}</strong>
            <small>AI Business Assistant</small>
          </span>
        </button>
        <span class="version-pill" [attr.aria-label]="t('إصدار الواجهة', 'App version')">v{{ appVersion }}</span>
        <div class="header-actions">
          <button class="icon-button notification-button" type="button"
            [attr.aria-label]="t('الإشعارات', 'Notifications')"
            [attr.title]="t('الإشعارات', 'Notifications')"
            (click)="notificationsRequested.emit()">
            <span aria-hidden="true">♢</span>
          </button>
          <button #profileTrigger class="profile-trigger" type="button"
            [attr.aria-label]="t('خيارات الحساب', 'Account options')"
            [attr.aria-expanded]="profileMenuOpen"
            [attr.aria-controls]="profileMenuOpen ? 'mobile-account-menu' : null"
            (click)="toggleProfileMenu()">
            <span class="profile-avatar" aria-hidden="true">{{ userInitial }}</span>
          </button>
        </div>
      </div>
      <div class="workspace-context">
        <div class="workspace-copy">
          <span class="context-label">{{ t('مساحة العمل الحالية', 'Current workspace') }}</span>
          <strong aria-live="polite" aria-atomic="true">{{ workspaceName }}</strong>
        </div>
        @if (businesses.length > 1) {
          <label class="workspace-switch">
            <span class="sr-only">{{ t('تغيير مساحة العمل', 'Change workspace') }}</span>
            <select [attr.aria-label]="t('تغيير مساحة العمل', 'Change workspace')"
              [ngModel]="selectedBusinessId" (ngModelChange)="businessChange.emit($event)">
              @for (business of businesses; track business.id) {
                <option [value]="business.id">{{ business.name }}</option>
              }
            </select>
          </label>
        }
      </div>
      <div class="page-context">
        <div class="page-copy">
          @if (showGreeting) {
            <p class="greeting">{{ t('أهلاً بعودتك', 'Welcome back') }}</p>
          }
          <h1>{{ pageTitle }}</h1>
        </div>
        <button class="assistant-shortcut" type="button"
          [attr.aria-label]="t('افتح المساعد الذكي', 'Open AI assistant')"
          (click)="assistantRequested.emit()">
          <span aria-hidden="true">✦</span>
          <span>{{ t('اسأل المساعد', 'Ask assistant') }}</span>
        </button>
      </div>
      @if (profileMenuOpen) {
        <div id="mobile-account-menu" class="account-menu" role="group"
          [attr.aria-label]="t('خيارات الحساب', 'Account options')">
          <p class="account-email">{{ userEmail }}</p>
          <button type="button" class="account-action" (click)="requestLanguageToggle()">
            <span aria-hidden="true">文</span>
            <span>{{ language === 'ar' ? 'English' : 'العربية' }}</span>
          </button>
          <button type="button" class="account-action sign-out-action" (click)="requestSignOut()">
            <span aria-hidden="true">↪</span>
            <span>{{ t('تسجيل الخروج', 'Sign out') }}</span>
          </button>
        </div>
      }
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
  @Input() showInstallButton = false;

  @Output() homeRequested = new EventEmitter<void>();
  @Output() businessChange = new EventEmitter<string>();
  @Output() notificationsRequested = new EventEmitter<void>();
  @Output() assistantRequested = new EventEmitter<void>();
  @Output() languageToggleRequested = new EventEmitter<void>();
  @Output() signOutRequested = new EventEmitter<void>();

  @ViewChild('profileTrigger') private profileTrigger?: ElementRef<HTMLButtonElement>;
  profileMenuOpen = false;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  get userInitial(): string {
    return this.userEmail.trim().charAt(0).toUpperCase() || 'A';
  }

  t(ar: string, en: string): string {
    return this.language === 'ar' ? ar : en;
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen = !this.profileMenuOpen;
  }

  requestLanguageToggle(): void {
    this.profileMenuOpen = false;
    this.languageToggleRequested.emit();
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

  @HostListener('document:pointerdown', ['$event'])
  closeProfileMenuOnOutsidePointer(event: PointerEvent): void {
    if (!this.profileMenuOpen) return;
    const target = event.target;
    if (!(target instanceof Node) || this.host.nativeElement.contains(target)) return;
    this.profileMenuOpen = false;
  }
}
