import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const arabic = JSON.parse(readFileSync(resolve(appDirectory, '../../public/i18n/ar.json'), 'utf8')) as Record<string, unknown>;
const english = JSON.parse(readFileSync(resolve(appDirectory, '../../public/i18n/en.json'), 'utf8')) as Record<string, unknown>;

function lookup(dictionary: Record<string, unknown>, key: string): string | undefined {
  let value: unknown = dictionary;
  for (const segment of key.split('.')) {
    if (!value || typeof value !== 'object' || !(segment in value)) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === 'string' ? value : undefined;
}

function singleQuoted(value: string): string {
  return "'" + value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029') + "'";
}

/**
 * Expand dictionary-backed t('namespace.key') calls into the bilingual copy
 * they render. This keeps source-contract tests useful while the production
 * implementation stores copy only in the canonical external dictionaries.
 */
export function expandTranslationCalls(source: string): string {
  return source.replace(/\\bt\\(\\s*(['"])([A-Za-z][A-Za-z0-9_.-]*)\\1/g, (match, _quote: string, key: string) => {
    const ar = lookup(arabic, key);
    const en = lookup(english, key);
    if (ar === undefined || en === undefined) return match;
    return 't(' + singleQuoted(ar) + ', ' + singleQuoted(en);
  });
}

/**
 * Adds a test-only bilingual view of catalogue fields that now store keys.
 * Runtime catalogue objects remain key-based and production copy stays in JSON.
 */
export function expandDictionaryBackedProperties(source: string): string {
  return source.replace(/\\b(title|note|detail|description)Key:\\s*(['"])([A-Za-z][A-Za-z0-9_.-]*)\\2/g,
    (match, field: string, _quote: string, key: string) => {
      const ar = lookup(arabic, key);
      const en = lookup(english, key);
      if (ar === undefined || en === undefined) return match;
      return field + 'Ar: ' + singleQuoted(ar) + ', ' + field + 'En: ' + singleQuoted(en);
    });
}
