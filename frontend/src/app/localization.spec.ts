import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));

const arabic = JSON.parse(readFileSync(resolve(appDirectory, '../../public/i18n/ar.json'), 'utf8')) as Record<string, unknown>;
const english = JSON.parse(readFileSync(resolve(appDirectory, '../../public/i18n/en.json'), 'utf8')) as Record<string, unknown>;

function flattenTranslations(value: Record<string, unknown>, prefix = '', result: Record<string, string> = {}): Record<string, string> {
  for (const [key, entry] of Object.entries(value)) {
    const translationKey = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flattenTranslations(entry as Record<string, unknown>, translationKey, result);
      continue;
    }
    assert.equal(typeof entry, 'string', `Translation value must be a string: ${translationKey}`);
    result[translationKey] = entry as string;
  }
  return result;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const arabicEntries = flattenTranslations(arabic);
const englishEntries = flattenTranslations(english);

test('Arabic and English dictionaries expose the same non-empty translation keys', () => {
  assert.deepEqual(
    Object.keys(arabicEntries).sort(),
    Object.keys(englishEntries).sort(),
  );
  for (const [key, value] of Object.entries(arabicEntries)) {
    assert.ok(value.trim(), `Arabic translation is empty: ${key}`);
    assert.ok(englishEntries[key]?.trim(), `English translation is empty: ${key}`);
  }
});

test('translation placeholders match in both locales', () => {
  const placeholders = (value: string): string[] =>
    [...value.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(match => match[1]).sort();

  for (const key of Object.keys(arabicEntries)) {
    assert.deepEqual(
      placeholders(arabicEntries[key]),
      placeholders(englishEntries[key]),
      `Interpolation placeholders differ: ${key}`,
    );
  }
});

test('every literal translation key referenced by a UI component exists in both dictionaries', () => {
  const references = new Set<string>();
  const keyPattern = /['"]((?:ui|common|app|audit|release|catalog|invoiceDraft|customerDirectory|productCatalog)\.[A-Za-z0-9_.-]+)['"]/g;

  for (const path of sourceFiles(appDirectory)) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(keyPattern)) references.add(match[1]);
  }

  const missing = [...references].filter(key => !(key in arabicEntries) || !(key in englishEntries));
  assert.deepEqual(missing, []);
});

test('UI source files contain no inline Arabic copy or legacy bilingual component helpers', () => {
  const legacyHelpers: string[] = [];
  const inlinePairs: string[] = [];
  const arabicCopy: string[] = [];
  const localePipes: string[] = [];

  for (const path of componentFiles(appDirectory)) {
    const source = readFileSync(path, 'utf8');
    if (/\b(?:keyOrArabic|paramsOrEnglish)\b/.test(source)) legacyHelpers.push(path);
    if (/\bt\(\s*['"][^'"]+['"]\s*,\s*['"][^'"]+['"]\s*\)/.test(source)) inlinePairs.push(path);
    if (/[\u0600-\u06FF]{2,}/.test(source)) arabicCopy.push(path);
    if (/\|\s*(?:date|number):/.test(source)) localePipes.push(path);
  }

  assert.deepEqual(legacyHelpers, []);
  assert.deepEqual(inlinePairs, []);
  assert.deepEqual(arabicCopy, []);
  assert.deepEqual(localePipes, []);
});
