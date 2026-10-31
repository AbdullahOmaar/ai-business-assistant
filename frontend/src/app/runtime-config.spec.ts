import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRuntimeConfig } from './runtime-config.ts';

const completeConfig = {
  apiBaseUrl: 'https://api.example.test',
  firebase: {
    apiKey: 'public-web-key',
    authDomain: 'example.firebaseapp.com',
    projectId: 'example-project',
    appId: '1:123:web:abc',
  },
};

test('accepts a complete valid runtime config without changing public settings', () => {
  assert.deepEqual(validateRuntimeConfig(completeConfig), completeConfig);
});

test('normalizes missing or null optional settings to the explicit setup-required shape', () => {
  assert.deepEqual(validateRuntimeConfig({}), {
    apiBaseUrl: '',
    firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
  });
  assert.deepEqual(validateRuntimeConfig({ apiBaseUrl: null, firebase: null }), {
    apiBaseUrl: '',
    firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
  });
  assert.deepEqual(validateRuntimeConfig({ firebase: { apiKey: 'key' } }), {
    apiBaseUrl: '',
    firebase: { apiKey: 'key', authDomain: '', projectId: '', appId: '' },
  });
});

test('rejects null, arrays and primitive top-level payloads', () => {
  for (const value of [null, [], 'config', 42, true]) {
    assert.throws(() => validateRuntimeConfig(value), {
      message: 'Runtime configuration is invalid.',
    });
  }
});

test('rejects a non-string API base URL', () => {
  for (const value of [42, true, [], {}]) {
    assert.throws(() => validateRuntimeConfig({ apiBaseUrl: value }), {
      message: 'Runtime configuration is invalid.',
    });
  }
});

test('rejects non-object Firebase settings while allowing omitted/null setup settings', () => {
  for (const value of ['firebase', 42, true, []]) {
    assert.throws(() => validateRuntimeConfig({ firebase: value }), {
      message: 'Runtime configuration is invalid.',
    });
  }
});

test('rejects non-string values for every Firebase web-app field', () => {
  for (const field of ['apiKey', 'authDomain', 'projectId', 'appId']) {
    for (const invalidValue of [42, true, [], {}]) {
      assert.throws(() => validateRuntimeConfig({
        firebase: { [field]: invalidValue },
      }), { message: 'Runtime configuration is invalid.' }, `${field} must be a string`);
    }
  }
});

test('does not echo untrusted configuration values in validation errors', () => {
  const secretLikeValue = 'do-not-echo-this-value';
  assert.throws(
    () => validateRuntimeConfig({ apiBaseUrl: secretLikeValue, firebase: { apiKey: { value: secretLikeValue } } }),
    error => error instanceof Error &&
      error.message === 'Runtime configuration is invalid.' &&
      !error.message.includes(secretLikeValue),
  );
});
