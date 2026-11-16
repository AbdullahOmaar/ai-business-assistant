import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const auth = readFileSync(new URL('./auth.service.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('./api.service.ts', import.meta.url), 'utf8');

test('login offers a localized public demo action only outside sign-up mode', () => {
  assert.match(app, /@if \(!signingUp\)/);
  assert.match(app, /class="demo-login-button"/);
  assert.match(app, /submitDemoLogin\(\)/);
  assert.match(app, /demo\.login\.button/);
  assert.match(app, /demo\.login\.note/);
});

test('demo login uses a server-minted Firebase custom token', () => {
  assert.match(app, /this\.api\.createDemoSession\(\)/);
  assert.match(app, /this\.auth\.signInWithCustomToken\(session\.custom_token\)/);
  assert.match(auth, /signInWithCustomToken\(customToken: string\)/);
  assert.match(auth, /auth\.signInWithCustomToken/);
  assert.match(api, /\/api\/v1\/demo\/session/);
  assert.doesNotMatch(app + auth + api, /admin@demo-aiba\.test|N8v!q4L/);
});

test('demo session request is public, POST-only, and not cached', () => {
  const method = api.slice(api.indexOf('async createDemoSession'), api.indexOf('private async request'));
  assert.match(method, /method: 'POST'/);
  assert.match(method, /cache: 'no-store'/);
  assert.doesNotMatch(method, /Authorization|idToken\(\)/);
});
