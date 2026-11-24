import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 3A-698 (Phase 1 closure batch 1 of 3): U21 sign-in gate + U22 sign-up mode —
// the shared system applied to the auth card, per the 3A-408 derivation.
// Source-assertion style, following the closure-3a696.spec.ts pattern.

const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');

const authStart = appSource.indexOf('} @else if (!signedIn) {');
const authEnd = appSource.indexOf('class="mobile-install-card auth-mobile-install"');
assert.ok(authStart >= 0 && authEnd > authStart, 'the signed-out auth card slice must be locatable');
const authCard = appSource.slice(authStart, authEnd);

test('U21: the auth card carries the app identity — the approved character and the app name, like the U24 boot card', () => {
  assert.ok(authCard.includes('class="auth-identity"'), 'auth card has an identity block');
  assert.ok(authCard.includes('src="identity/loader-character.png"'), 'identity block renders the approved character asset');
  assert.ok(authCard.includes('<span class="auth-app-name">{{ t(\'common.app_title\') }}</span>'), 'identity block names the app');
  assert.ok(!authCard.includes('<div class="brand-mark">A</div>'), 'the lone letter mark no longer stands in for the identity on the auth card');
});

test('U21: the demo entry is a clear secondary action — outline treatment, no gradient competing with the primary submit', () => {
  const rule = appCss.match(/\.demo-login-button\{[^}]*\}/);
  assert.ok(rule, 'demo-login-button rule must exist');
  assert.ok(!rule[0].includes('linear-gradient'), 'demo button carries no gradient fill');
  assert.ok(rule[0].includes('background:var(--aba-color-surface,#fff)'), 'demo button sits on the plain surface');
  assert.ok(rule[0].includes('color:#0f766e'), 'demo button reads as an outline action in the accent colour');
});

test('U21: an auth failure appears right after the form, before the demo entry and the mode switch', () => {
  const errorIdx = authCard.indexOf('@if (error) { <aba-state-message kind="error"');
  const demoIdx = authCard.indexOf('class="demo-login-button"');
  assert.ok(errorIdx >= 0, 'the auth card renders its error state');
  assert.ok(demoIdx > errorIdx, 'the error sits beside the form, ahead of the demo entry');
});

test('U22: switching modes keeps the same card and clears a stale failure from the other mode', () => {
  assert.ok(authCard.includes('(click)="toggleAuthMode()"'), 'the mode switch goes through toggleAuthMode');
  const method = appSource.match(/toggleAuthMode\(\): void \{([\s\S]*?)\n  \}/);
  assert.ok(method, 'toggleAuthMode must exist');
  assert.ok(method[1].includes('this.signingUp = !this.signingUp;'), 'it flips the mode');
  assert.ok(method[1].includes("this.error = '';"), 'it clears the stale error');
});
