import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const authSource = readFileSync(new URL('./auth.service.ts', import.meta.url), 'utf8');

test('Firebase auth observer stays subscribed after initial session resolution', () => {
  assert.match(authSource, /private authStateUnsubscribe\?: \(\) => void/);
  assert.match(authSource, /unsubscribe = onAuthStateChanged\([\s\S]*?user => \{\s*this\.user = user \?\? null;\s*if \(!settled\)/);
  assert.match(authSource, /this\.authStateUnsubscribe = unsubscribe;\s*resolve\(\);/);
  assert.doesNotMatch(authSource, /clearTimeout\(timeoutId\);\s*unsubscribe\(\);\s*this\.authStateUnsubscribe = unsubscribe/);
});

test('Firebase observer errors and startup timeouts clear cached identity and allow retry', () => {
  assert.match(authSource, /this\.user = null;[\s\S]*?this\.authStateUnsubscribe = undefined;[\s\S]*?this\.authReady = undefined/);
  assert.match(authSource, /Firebase sign-in session check timed out/);
  assert.match(authSource, /this\.authStateUnsubscribe\?\.\(\);/);
});

test('explicit sign-out clears the cached Firebase user', () => {
  assert.match(authSource, /async signOut\(\): Promise<void> \{[\s\S]*?await signOut\(this\.auth!\);\s*this\.user = null;/);
});
