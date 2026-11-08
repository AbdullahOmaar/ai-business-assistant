const EMPTY_PREVIEW_CONFIG = Object.freeze({
  apiBaseUrl: '',
  firebase: Object.freeze({
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  }),
});

const PREVIEW_ENV_KEYS = [
  'ABA_PREVIEW_API_BASE_URL',
  'ABA_PREVIEW_FIREBASE_API_KEY',
  'ABA_PREVIEW_FIREBASE_AUTH_DOMAIN',
  'ABA_PREVIEW_FIREBASE_PROJECT_ID',
  'ABA_PREVIEW_FIREBASE_APP_ID',
];

const PRODUCTION_API_HOSTS = new Set([
  'ai-business-assistant-api.vercel.app',
  'ai-business-assistant-api-thepresidentabdo-9110s-projects.vercel.app',
]);
// Block this product's generated Vercel deployment URLs too. A deployment URL
// remains a route to its Production deployment even when the custom alias differs.
const PRODUCTION_VERCEL_PRODUCT_HOST = /^ai-business-assistant-(?:api|[a-z0-9]{9})-thepresidentabdo-9110s-projects\.vercel\.app$/;
const PRODUCTION_FIREBASE_PROJECT = 'ai-business-assistant-97f37';
const PRODUCTION_FIREBASE_AUTH_DOMAIN = 'ai-business-assistant-97f37.firebaseapp.com';

/**
 * Preview deployments must never inherit the checked-in Production runtime config.
 * Missing Preview settings return an intentionally unconfigured client; partial or
 * known-Production settings fail the build rather than exposing Production to tests.
 */
export function createPreviewRuntimeConfig(env) {
  if (env.VERCEL_ENV !== 'preview') return null;

  const values = Object.fromEntries(PREVIEW_ENV_KEYS.map(key => [key, String(env[key] ?? '').trim()]));
  const providedCount = Object.values(values).filter(Boolean).length;
  if (providedCount === 0) return EMPTY_PREVIEW_CONFIG;
  if (providedCount !== PREVIEW_ENV_KEYS.length) {
    throw new Error('Preview runtime configuration must provide all isolated API and Firebase settings.');
  }

  let apiUrl;
  try {
    apiUrl = new URL(values.ABA_PREVIEW_API_BASE_URL);
  } catch {
    throw new Error('Preview API base URL must be a valid HTTPS URL.');
  }
  // DNS treats a trailing dot as the absolute form of the same hostname.
  // Normalize it before comparing so Production cannot bypass the Preview guard.
  const normalizedApiHostname = apiUrl.hostname.toLowerCase().replace(/\.$/, '');
  if (apiUrl.protocol !== 'https:' || PRODUCTION_API_HOSTS.has(normalizedApiHostname) ||
      PRODUCTION_VERCEL_PRODUCT_HOST.test(normalizedApiHostname)) {
    throw new Error('Preview API base URL must target an isolated non-Production HTTPS service.');
  }
  if (values.ABA_PREVIEW_FIREBASE_PROJECT_ID === PRODUCTION_FIREBASE_PROJECT ||
      values.ABA_PREVIEW_FIREBASE_AUTH_DOMAIN === PRODUCTION_FIREBASE_AUTH_DOMAIN) {
    throw new Error('Preview Firebase settings must target an isolated non-Production project.');
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
