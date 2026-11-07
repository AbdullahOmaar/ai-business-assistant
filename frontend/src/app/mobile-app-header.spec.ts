import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('mobile app header is an isolated standalone presentation component with explicit workspace and navigation contracts', () => {
  assert.match(source, /selector: 'aba-mobile-app-header'/);
  assert.match(source, /standalone: true/);
  assert.match(source, /@Input\(\) appVersion = ''/);
  assert.match(source, /@Input\(\) workspaceName = ''/);
  assert.match(source, /@Input\(\) businesses: Business\[\] = \[\]/);
  assert.match(source, /@Input\(\) selectedBusinessId = ''/);
  assert.match(source, /@Input\(\) pageTitle = ''/);
  assert.match(source, /@Input\(\) showGreeting = false/);
  for (const output of ['homeRequested', 'businessChange', 'notificationsRequested', 'assistantRequested', 'languageToggleRequested', 'signOutRequested']) {
    assert.ok(source.includes('@Output() ' + output + ' = new EventEmitter'), 'expected output contract for ' + output);
  }
  assert.match(source, /styleUrl: '\.\/aba-mobile-app-header\.component\.css'/);
});

test('mobile header uses the dynamic build version and existing workspace records only', () => {
  assert.match(source, /v\{\{ appVersion \}\}/);
  assert.match(source, /\[ngModel\]="selectedBusinessId"/);
  assert.match(source, /businessChange\.emit\(\$event\)/);
  assert.match(source, /business\.name/);
  assert.match(appSource, /\[appVersion\]="appVersion"/);
  assert.match(appSource, /\[workspaceName\]="business\.name"/);
  assert.match(appSource, /\[businesses\]="businesses"/);
  assert.match(appSource, /\(businessChange\)="switchBusiness\(\$event\)"/);
  assert.match(appSource, /readonly appVersion = APP_BUILD_INFO\.version/);
});

test('mobile header keeps notification and assistant shortcuts within existing routes and avoids invented unread counts', () => {
  assert.match(source, /notificationsRequested\.emit\(\)/);
  assert.match(source, /assistantRequested\.emit\(\)/);
  assert.match(appSource, /\(notificationsRequested\)="setTab\('notifications'\)"/);
  assert.match(appSource, /\(assistantRequested\)="setTab\('assistant'\)"/);
  const notificationType = apiSource.match(/export interface NotificationRecord \{[^}]+\}/)?.[0] ?? '';
  assert.ok(notificationType, 'the current notification contract must remain discoverable');
  assert.doesNotMatch(notificationType, /unread|is_read|read_at/i);
  assert.doesNotMatch(source, /unread|notificationCount|notificationBadge/i);
});

test('mobile account entry is keyboard-dismissible and reuses existing language and sign-out actions', () => {
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-controls/);
  assert.match(source, /@HostListener\('document:keydown\.escape'\)/);
  assert.match(source, /@HostListener\('document:pointerdown'/);
  assert.match(source, /this\.languageToggleRequested\.emit\(\)/);
  assert.match(source, /this\.signOutRequested\.emit\(\)/);
  assert.match(appSource, /\(languageToggleRequested\)="toggleLanguage\(\)"/);
  assert.match(appSource, /\(signOutRequested\)="logout\(\)"/);
});

test('mobile header has compact responsive RTL-safe layout and accessible tap targets', () => {
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /@media \(max-width: 380px\)/);
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(appSource, /env\\(safe-area-inset-top/);
  assert.match(appSource, /install-cta-visible/);
  assert.match(appSource, /shell\\.install-help-open \\.main/);
  assert.match(source, /aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(styles, /install-cta-visible|safe-area-inset-top/);
  assert.match(styles, /inset-inline-end/);
  assert.match(styles, /min-height: 44px/);
  assert.match(appSource, /\.workspace-bar\{display:none!important\}/);
  assert.doesNotMatch(appSource, /class="mobile-page-heading"/);
});


test('mobile header consumes shared semantic tokens rather than a one-off palette', () => {
  for (const token of [
    '--aba-color-surface',
    '--aba-color-surface-subtle',
    '--aba-color-info-soft',
    '--aba-color-info-border',
    '--aba-color-info-text',
    '--aba-color-primary-soft',
    '--aba-color-primary-border',
    '--aba-color-primary-strong',
    '--aba-color-primary',
    '--aba-shadow-popover',
    '--aba-z-index-dropdown',
  ]) {
    assert.ok(styles.includes('var(' + token), 'expected shared semantic token ' + token);
  }
  assert.doesNotMatch(styles, /(?:background|color|border(?:-color)?):\s*#(?:bfdbfe|eff6ff|1e40af|1d4ed8|2563eb|dbeafe)/i,
    'the header must not carry a second hard-coded blue palette');
});


test('mobile header interactive controls meet the 44px touch-target baseline', () => {
  assert.match(styles, /\.brand-button \{ min-height: 44px;/);
  assert.match(styles, /\.workspace-switch select \{[^}]*min-height: 44px;/);
  assert.match(styles, /\.assistant-shortcut \{[^}]*min-height: 44px;/);
  assert.match(styles, /\.icon-button, \.profile-trigger \{[^}]*height: 44px/);
  assert.match(styles, /\.account-action \{[^}]*min-height: 44px/);
});


test('mobile page title changes are announced politely without moving focus', () => {
  assert.match(source, /<h1 aria-live="polite" aria-atomic="true">\{\{ pageTitle \}\}<\/h1>/);
});


test('mobile account menu dismisses when another header control is activated', () => {
  assert.match(source, /const accountMenu = this\.host\.nativeElement\.querySelector\('\.account-menu'\)/);
  assert.match(source, /this\.profileTrigger\?\.nativeElement\.contains\(target\) \|\| accountMenu\?\.contains\(target\)/);
  assert.doesNotMatch(source, /this\.host\.nativeElement\.contains\(target\)/);
});
