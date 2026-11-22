import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeSentryMonitoring } from './sentry-monitoring.ts';
import type { RuntimeConfig } from './runtime-config.ts';

function configWithSentry(sentry: RuntimeConfig['sentry']): RuntimeConfig {
  return {
    apiBaseUrl: 'https://api.example.test',
    firebase: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' },
    sentry,
  };
}

// 3A-327: without a DSN the monitor must stay completely off — the SDK is
// never imported and the call simply resolves.
test('stays off when the sentry DSN is empty or whitespace', async () => {
  await initializeSentryMonitoring(configWithSentry({ dsn: '', environment: 'production' }));
  await initializeSentryMonitoring(configWithSentry({ dsn: '   ', environment: '' }));
});

test('stays off when the sentry section is missing entirely', async () => {
  const legacy = {
    apiBaseUrl: 'https://api.example.test',
    firebase: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' },
  } as RuntimeConfig;
  await initializeSentryMonitoring(legacy);
});
