import { provideHttpClient } from '@angular/common/http';
import { provideAppInitializer, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { AppComponent } from './app/app.component';
import { LocalizationService } from './app/localization.service';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: '/i18n/',
        suffix: '.json',
        failOnError: true,
      }),
      fallbackLang: 'ar',
      lang: 'ar',
      retry: 2,
    }),
    provideAppInitializer(() => inject(LocalizationService).initialize()),
  ],
}).catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
});
