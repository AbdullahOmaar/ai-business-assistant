export interface RuntimeConfig {
  apiBaseUrl: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new Error('Runtime configuration is invalid.');
  }
  return value;
}

/**
 * Validate untrusted JSON before it reaches Firebase initialization or API clients.
 * Missing/null public settings normalize to empty strings so the UI can show its
 * explicit setup-required screen. Invalid shapes fail closed with a safe message.
 */
export function validateRuntimeConfig(value: unknown): RuntimeConfig {
  if (!isRecord(value)) {
    throw new Error('Runtime configuration is invalid.');
  }

  const rawFirebase = value['firebase'];
  if (rawFirebase !== undefined && rawFirebase !== null && !isRecord(rawFirebase)) {
    throw new Error('Runtime configuration is invalid.');
  }

  const firebase = isRecord(rawFirebase) ? rawFirebase : {};
  return {
    apiBaseUrl: optionalString(value['apiBaseUrl']),
    firebase: {
      apiKey: optionalString(firebase['apiKey']),
      authDomain: optionalString(firebase['authDomain']),
      projectId: optionalString(firebase['projectId']),
      appId: optionalString(firebase['appId']),
    },
  };
}
