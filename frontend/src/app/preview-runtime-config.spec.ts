import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewRuntimeConfig } from '../../scripts/preview-runtime-config.mjs';

test('non-Preview builds keep the existing runtime config untouched', () => {
  assert.equal(createPreviewRuntimeConfig({ VERCEL_ENV: 'production' }), null);
  assert.equal(createPreviewRuntimeConfig({}), null);
});

test('Preview builds fail closed when isolated runtime variables are absent', () => {
  assert.deepEqual(createPreviewRuntimeConfig({ VERCEL_ENV: 'preview' }), {
    apiBaseUrl: '',
    firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' },
  });
});

test('Preview builds reject partial runtime configuration instead of mixing defaults', () => {
  assert.throws(
    () => createPreviewRuntimeConfig({
      VERCEL_ENV: 'preview',
      ABA_PREVIEW_API_BASE_URL: 'https://synthetic-api.example.test',
    }),
    /must provide all isolated API and Firebase settings/,
  );
});

test('Preview builds reject the known Production API or Firebase project', () => {
  const env = {
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'https://ai-business-assistant-api.vercel.app',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-test-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'synthetic-project.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'synthetic-project',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:123:web:synthetic',
  };
  assert.throws(() => createPreviewRuntimeConfig(env), /isolated non-Production HTTPS service/);

  assert.throws(() => createPreviewRuntimeConfig({
    ...env,
    ABA_PREVIEW_API_BASE_URL: 'https://synthetic-api.example.test',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'ai-business-assistant-97f37',
  }), /isolated non-Production project/);
});

test('Preview builds reject Production API host aliases including case and trailing-dot forms', () => {
  const env = {
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'https://AI-BUSINESS-ASSISTANT-API.VERCEL.APP./',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-test-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'synthetic-project.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'synthetic-project',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:123:web:synthetic',
  };
  assert.throws(() => createPreviewRuntimeConfig(env), /isolated non-Production HTTPS service/);
});

test('Preview builds reject Production project and deployment-specific Vercel aliases', () => {
  const env = {
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'https://ai-business-assistant-api-thepresidentabdo-9110s-projects.vercel.app',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-test-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'synthetic-project.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'synthetic-project',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:123:web:synthetic',
  };
  assert.throws(() => createPreviewRuntimeConfig(env), /isolated non-Production HTTPS service/);

  assert.throws(() => createPreviewRuntimeConfig({
    ...env,
    ABA_PREVIEW_API_BASE_URL: 'https://ai-business-assistant-7f376efb8-thepresidentabdo-9110s-projects.vercel.app',
  }), /isolated non-Production HTTPS service/);
});

test('Preview builds use only the complete isolated synthetic configuration', () => {
  assert.deepEqual(createPreviewRuntimeConfig({
    VERCEL_ENV: 'preview',
    ABA_PREVIEW_API_BASE_URL: 'https://synthetic-api.example.test/',
    ABA_PREVIEW_FIREBASE_API_KEY: 'public-synthetic-key',
    ABA_PREVIEW_FIREBASE_AUTH_DOMAIN: 'synthetic-project.firebaseapp.com',
    ABA_PREVIEW_FIREBASE_PROJECT_ID: 'synthetic-project',
    ABA_PREVIEW_FIREBASE_APP_ID: '1:123:web:synthetic',
  }), {
    apiBaseUrl: 'https://synthetic-api.example.test',
    firebase: {
      apiKey: 'public-synthetic-key',
      authDomain: 'synthetic-project.firebaseapp.com',
      projectId: 'synthetic-project',
      appId: '1:123:web:synthetic',
    },
  });
});
