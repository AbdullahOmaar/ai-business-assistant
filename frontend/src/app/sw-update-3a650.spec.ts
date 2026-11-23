import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

// 3A-650 part E: the service-worker update notice could only be acted on
// or ignored for the whole session — there was no way to dismiss it, and
// long-lived tabs only learned about a newer worker at the next full
// load. The new worker already controls the page (skipWaiting +
// clients.claim), so dismissing only defers the reload.
const appSource = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));

test('3A-650: the update notice is dismissible for the session', () => {
  assert.ok(
    appSource.includes('@if (appUpdateAvailable && !appUpdateDismissed)'),
    'the notice hides once dismissed',
  );
  assert.ok(
    appSource.includes('(click)="dismissAppUpdate()"'),
    'the notice carries a dismiss action',
  );
  assert.match(appSource, /dismissAppUpdate\(\): void \{\s*this\.appUpdateDismissed = true;\s*\}/);
});

test('3A-650: the registration checks for updates when the tab becomes visible again', () => {
  assert.ok(appSource.includes("document.addEventListener('visibilitychange'"));
  assert.ok(appSource.includes('void registration.update().catch(() => undefined);'));
});
