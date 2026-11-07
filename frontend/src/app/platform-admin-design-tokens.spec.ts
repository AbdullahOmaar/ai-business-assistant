import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const localTokens = ['--ink', '--muted', '--line', '--panel', '--teal', '--background', '--surface-soft'];

test('Platform Admin local theme tokens resolve through the shared semantic foundation', () => {
  const definitions = [...source.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]);
  const references = [...source.matchAll(/var\((--[\w-]+)/g)].map(match => match[1]);
  for (const token of localTokens) {
    assert.ok(definitions.includes(token), `expected ${token} to be defined`);
  }
  const unresolved = [...new Set(references.filter(token => localTokens.includes(token) && !definitions.includes(token)))];
  assert.deepEqual(unresolved, []);
  assert.match(source, /--surface-soft:var\(--aba-color-surface-subtle,#f8fafc\)/);
  assert.equal(references.filter(token => token === '--surface-soft').length, 2,
    'both runtime summary cards must resolve the shared soft surface');
});

test('Platform Admin focus states use the shared visible focus ring tokens', () => {
  assert.match(source, /button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible\{outline:var\(--aba-focus-ring-width,3px\) solid var\(--aba-color-focus-ring,#2563eb\);outline-offset:var\(--aba-focus-ring-offset,2px\)\}/);
});
