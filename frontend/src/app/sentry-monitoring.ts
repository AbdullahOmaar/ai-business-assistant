import type { RuntimeConfig } from './runtime-config';

let started = false;

/**
 * Start Sentry error monitoring when the runtime config carries a DSN
 * (3A-327). The SDK is loaded lazily through a dynamic import so it never
 * weighs on the initial bundle, and monitoring stays fully off when no DSN
 * is configured (local development, tests, previews without monitoring).
 * Only unhandled errors are reported: no default PII (no cookies, headers,
 * request bodies or user identity) and no performance tracing.
 */
export async function initializeSentryMonitoring(config: RuntimeConfig): Promise<void> {
  if (started) return;
  const dsn = config.sentry?.dsn?.trim() ?? '';
  if (!dsn) return;
  started = true;
  const Sentry = await import('@sentry/browser');
  Sentry.init({
    dsn,
    environment: config.sentry.environment?.trim() || 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}
