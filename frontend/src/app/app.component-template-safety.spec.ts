import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('mobile More menu has a correctly delimited active-class attribute', () => {
  const line = source.split('\n').find((value) => value.includes('class="nav-item mobile-more"'));
  assert.ok(line, 'mobile More button must exist');
  assert.ok(line.includes("tab === 'release-guide'\" [attr.aria-label]"));
  assert.equal(line.includes("tab === 'release-guide'\"\""), false);
});
