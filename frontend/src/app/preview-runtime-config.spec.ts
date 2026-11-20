import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewRuntimeConfig } from '../../scripts/preview-runtime-config.mjs';

test('non-Preview builds keep the existing runtime config untouched', () => {
  assert.equal(createPreviewRuntimeConfig({ VERCEL_ENV: 'production' }), null);
  assert.equal(createPreviewRuntimeConfig({}), null);
});

test('Preview builds keep the checked-in current development runtime config by default', () => {
  assert.equal(createPreviewRuntimeConfig({ VERCEL_ENV: 'preview' }), null);
});

test('Preview builds reject partial runtime overrides instead of mixing settings', () => {
  assert.throws(
    () => createPreviewRuntimeConfig({ VERCEL_ENV: 'preview', ABA_PREVIEW_API_BASE_URL: 'https://synthetic-api.example.test' }),
    /must provide all API and Firebase settings/,
  );
});

test('Preview builds allow the current API and Firebase project because current data is synthetic', () => {
  assert.deepEqual(createPreviewRuntimeConfig({
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'https://ai-business-assistant-api.vercel.app',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-current-dev-web-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'ai-business-assistant-97f37.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'ai-business-assistant-97f37',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:803541434464:web:current-dev-app',
  }), {
    apiBaseUrl: 'https://ai-business-assistant-api.vercel.app',
    firebase: {
      apiKey: 'public-current-dev-web-key',
      authDomain: 'ai-business-assistant-97f37.firebaseapp.com',
      projectId: 'ai-business-assistant-97f37',
      appId: '1:803541434464:web:current-dev-app',
    },
  });
});

test('Preview builds accept complete explicit HTTPS overrides', () => {
  assert.deepEqual(createPreviewRuntimeConfig({
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'https://alternate-api.example.test/',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-preview-web-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'alternate-project.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'alternate-project',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:123:web:alternate',
  }), {
    apiBaseUrl: 'https://alternate-api.example.test',
    firebase: {
      apiKey: 'public-preview-web-key',
      authDomain: 'alternate-project.firebaseapp.com',
      projectId: 'alternate-project',
      appId: '1:123:web:alternate',
    },
  });
});

test('Preview builds reject invalid or non-HTTPS API URLs', () => {
  const base = {
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'http://api.example.test',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-preview-web-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'alternate-project.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'alternate-project',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:123:web:alternate',
  };
  assert.throws(() => createPreviewRuntimeConfig(base), /valid HTTPS URL/);
  assert.throws(() => createPreviewRuntimeConfig({...base, ABA_PREVIEW_API_BASE_URL: 'https://user:secret@api.example.test'}), /without embedded credentials/);
});
