// Owner rule 2026-11-25 (release gate): a prominent release line —
// «الإصدار X — نُشر [date/time]» — on the splash AND inside the app,
// built only from generated build metadata (APP_BUILD_INFO), never
// typed by hand. Without it a deploy does not pass review.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const appSource = expandTranslationCalls(
  readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'),
);
const appStyles = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const ar = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8'));
const en = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8'));

test('release line wording exists in both locales with version and date placeholders', () => {
  assert.match(ar.ui.releaseLine, /الإصدار \{\{version\}\} — نُشر \{\{date\}\}/);
  assert.match(en.ui.releaseLine, /Version \{\{version\}\} — published \{\{date\}\}/);
});

test('release line is composed from build metadata only (version + builtAt)', () => {
  assert.match(appSource, /readonly appVersion = APP_BUILD_INFO\.version/);
  assert.match(appSource, /APP_BUILD_INFO\.builtAt/);
  // expandTranslationCalls turns t('ui.releaseLine', ...) into the bilingual
  // copy followed by the params object — the getter must feed it the build
  // version and the build-time label, nothing typed by hand.
  assert.match(appSource, /get releaseLine\(\)/);
  assert.match(
    appSource,
    /نُشر \{\{date\}\}[\s\S]{0,160}version: this\.appVersion, date: this\.buildTimeLabel/,
  );
});

test('release line renders on the splash, in the workspace bar, and as a mobile sibling', () => {
  assert.match(appSource, /class="release-line release-line-splash"/);
  assert.match(appSource, /workspace-release-meta-inline[\s\S]*?class="release-line"/);
  assert.match(appSource, /class="release-line release-line-mobile"/);
});

test('release line is prominent and the mobile sibling only shows on small screens', () => {
  assert.match(appStyles, /\.release-line\{[^}]*font-size:13px[^}]*font-weight:800/);
  assert.match(appStyles, /\.release-line-splash\{[^}]*font-size:14px/);
  assert.match(appStyles, /\.release-line-mobile\{display:none\}/);
  assert.match(appStyles, /@media\(max-width:760px\)\{\.release-line-mobile\{display:block\}\}/);
});
