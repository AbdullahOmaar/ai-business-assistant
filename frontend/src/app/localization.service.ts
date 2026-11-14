import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export type AppLanguage = 'ar' | 'en';

@Injectable({ providedIn: 'root' })
export class LocalizationService {
  private readonly translations = inject(TranslateService);
  private languageValue: AppLanguage = 'ar';

  get currentLanguage(): AppLanguage {
    return this.languageValue;
  }

  async initialize(): Promise<void> {
    this.translations.addLangs(['ar', 'en']);
    const requested = this.readSavedLanguage();

    try {
      await firstValueFrom(this.translations.use(requested));
      this.languageValue = requested;
    } catch (error) {
      if (requested === 'ar') throw error;
      await firstValueFrom(this.translations.use('ar'));
      this.languageValue = 'ar';
    }

    this.syncDocumentLanguage();
  }

  async setLanguage(language: AppLanguage): Promise<AppLanguage> {
    if (language === this.languageValue) return this.languageValue;

    // Load the new dictionary before changing the active locale or document direction.
    await firstValueFrom(this.translations.use(language));
    this.languageValue = language;
    try {
      localStorage.setItem('aba-language', language);
    } catch {
      // Persistence is optional; the current session still changes language.
    }
    this.syncDocumentLanguage();
    return this.languageValue;
  }

  translate(key: string, params?: Record<string, string | number>): string {
    const value = this.translations.instant(key, params);
    return typeof value === 'string' ? value : key;
  }

  get locale(): string {
    return this.languageValue === 'ar' ? 'ar-EG' : 'en-GB';
  }

  get direction(): 'rtl' | 'ltr' {
    return this.languageValue === 'ar' ? 'rtl' : 'ltr';
  }

  formatNumber(
    value: string | number | null | undefined,
    minimumFractionDigits = 0,
    maximumFractionDigits = 3,
  ): string {
    if (value === null || value === undefined || value === '') return '—';
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return String(value);
    return new Intl.NumberFormat(this.locale, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(numeric);
  }

  formatDate(
    value: string | number | Date | null | undefined,
    options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  ): string {
    if (value === null || value === undefined || value === '') return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(this.locale, options).format(date);
  }

  syncDocumentLanguage(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = this.languageValue;
    document.documentElement.dir = this.direction;
    document.title = this.translate('common.app_title');

    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = this.translate('common.app_description');
  }

  private readSavedLanguage(): AppLanguage {
    try {
      return localStorage.getItem('aba-language') === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  }
}
