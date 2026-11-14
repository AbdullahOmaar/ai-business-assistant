import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expandDictionaryBackedProperties,
  expandTranslationCalls,
} from './localization-test-helpers.ts';

test('source assertion helper expands dictionary-backed UI copy in both locales', () => {
  const source = expandTranslationCalls("{{ t('ui.m_1ca11bx') }}");
  assert.match(source, /أكمل حفظ مسودة الفاتورة/);
  assert.match(source, /Finish saving the invoice draft/);
});

test('catalogue assertion helper expands translated fields without changing runtime sources', () => {
  const source = expandDictionaryBackedProperties('titleKey: "release.catalog.m_whaqa4", noteKey: "release.catalog.m_6wk025"');
  assert.match(source, /titleAr:/);
  assert.match(source, /titleEn:/);
  assert.match(source, /noteAr:/);
  assert.match(source, /noteEn:/);
});
