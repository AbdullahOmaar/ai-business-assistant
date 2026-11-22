import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// G5 F1 (2026-11-21): two malformed declarations entered with the P1 squash
// 4e75457 and survived at a150cc23 — `background:var(--aba-color-surface,#fff)beb`
// and `background:var(--aba-color-surface,#fff)fff24`. A var() call closed with
// ")" followed directly by hex digits is not a valid value, so the CSS parser
// drops the whole declaration (the warning notice lost its amber background;
// the active nav icon lost its translucent white). The token specs assert
// specific rules, not a full CSS parse, so this family passed all 600 tests.
const appStyles = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const globalStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const designSystemStyles = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');

test('stylesheets contain no var() call with trailing hex junk', () => {
  for (const [name, source] of [
    ['app.component.css', appStyles],
    ['styles.css', globalStyles],
    ['design-system.css', designSystemStyles],
  ] as const) {
    const bad = source.match(/var\([^)]*\)[0-9a-fA-F]{2,}/);
    assert.equal(bad, null, `${name} contains a malformed var() value: ${bad?.[0]}`);
    assert.equal(source.includes(')beb'), false, `${name} still contains ")beb"`);
    assert.equal(source.includes(')fff24'), false, `${name} still contains ")fff24"`);
  }
});

test('warning notice keeps its amber background (warning-soft token)', () => {
  assert.ok(
    appStyles.includes('.warning-notice{border-color:#f59e0b;background:var(--aba-color-warning-soft,#fffbeb)}'),
    'warning-notice must use the --aba-color-warning-soft token (#fffbeb)',
  );
});

test('active nav icon keeps its translucent white background in both rules', () => {
  const fixed = '.nav-item.active .nav-icon{background:#ffffff24;color:var(--aba-color-text-inverse,#fff)}';
  const occurrences = appStyles.split(fixed).length - 1;
  assert.equal(occurrences, 2, `expected the fixed active nav-icon rule twice (base + desktop-sidebar-groups), found ${occurrences}`);
});
