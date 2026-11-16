const PREVIEW_ENV_KEYS = [
  'ABA_PREVIEW_API_BASE_URL',
  'ABA_PREVIEW_FIREBASE_API_KEY',
  'ABA_PREVIEW_FIREBASE_AUTH_DOMAIN',
  'ABA_PREVIEW_FIREBASE_PROJECT_ID',
  'ABA_PREVIEW_FIREBASE_APP_ID',
];

/**
 * The Owner has explicitly classified the current provider-Production runtime as
 * synthetic development data. Preview therefore keeps the checked-in shared
 * development runtime config by default, including its current API and Firebase
 * client settings. Complete explicit Preview overrides remain supported.
 *
 * This affects only public frontend endpoints/client identifiers. Server secrets
 * remain on the API host; authentication, tenant isolation and audit controls are
 * still enforced by the backend.
 */
export function createPreviewRuntimeConfig(env) {
  if (env.VERCEL_ENV !== 'preview') return null;

  const values = Object.fromEntries(PREVIEW_ENV_KEYS.map(key => [key, String(env[key] ?? '').trim()]));
  const providedCount = Object.values(values).filter(Boolean).length;
  if (providedCount === 0) return null;
  if (providedCount !== PREVIEW_ENV_KEYS.length) {
    throw new Error('Preview runtime overrides must provide all API and Firebase settings.');
  }

  let apiUrl;
  try {
    apiUrl = new URL(values.ABA_PREVIEW_API_BASE_URL);
  } catch {
    throw new Error('Preview API base URL must be a valid HTTPS URL.');
  }
  if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password) {
    throw new Error('Preview API base URL must be a valid HTTPS URL without embedded credentials.');
  }

  return {
    apiBaseUrl: values.ABA_PREVIEW_API_BASE_URL.replace(/\/+$/, ''),
    firebase: {
      apiKey: values.ABA_PREVIEW_FIREBASE_API_KEY,
      authDomain: values.ABA_PREVIEW_FIREBASE_AUTH_DOMAIN,
      projectId: values.ABA_PREVIEW_FIREBASE_PROJECT_ID,
      appId: values.ABA_PREVIEW_FIREBASE_APP_ID,
    },
  };
}
