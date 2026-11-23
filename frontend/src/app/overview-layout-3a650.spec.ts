import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

// 3A-650 (fix batch from the round-2 review, 3A-445): two layout defects
// confirmed by the owner on his phone and root-caused in the review.
// (1) The assistant @defer block was the only tab block without an @if
// guard, so its placeholder skeleton rendered on every screen and, after
// the first assistant visit, the live assistant panel embedded itself into
// every other screen. The overview block shared the same latent shape.
// (2) The overview KPI .metric-grid rules lived only in the shell CSS,
// which cannot cross the extracted component's view encapsulation, so the
// cards stacked one per row at every width.
const appSource = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
const overviewSource = expandTranslationCalls(readFileSync(new URL('./overview-workspace.component.ts', import.meta.url), 'utf8'));

test('3A-650: the assistant defer block is wrapped in its tab guard like every sibling', () => {
  assert.match(
    appSource,
    /@if \(tab === 'assistant'\) \{\s*@defer \(when tab === 'assistant'\) \{\s*<aba-assistant-workspace/,
    'the assistant workspace must only exist in the DOM while its tab is active',
  );
});

test('3A-650: the overview defer block is wrapped in its tab guard like every sibling', () => {
  assert.match(
    appSource,
    /@if \(tab === 'overview'\) \{\s*@defer \(when tab === 'overview'\) \{\s*<aba-overview-workspace/,
    'the overview workspace must only exist in the DOM while its tab is active',
  );
});

test('3A-650: every simple tab defer block sits directly inside its tab guard', () => {
  const lines = appSource.split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/@defer \(when tab === '([a-z-]+)'\) \{/);
    if (!match) return;
    let prev = index - 1;
    while (prev >= 0 && lines[prev].trim() === '') prev -= 1;
    assert.match(
      lines[prev] ?? '',
      new RegExp(`@if \\(tab === '${match[1]}'(?:\\s*&&[^)]*)?\\) \\{`),
      `the ${match[1]} defer block must be wrapped in an @if guard on tab === '${match[1]}'`,
    );
  });
});

test('3A-650: the overview component defines its own metric-grid layout', () => {
  assert.ok(
    overviewSource.includes('.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px'),
    'desktop KPI grid: four cards per row, defined inside the component',
  );
  assert.ok(
    overviewSource.includes('@media(max-width:1050px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'),
    'tablet/mobile KPI grid: two cards per row (owner direction 2026-11-23)',
  );
  assert.ok(
    overviewSource.includes('@media(max-width:760px){.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}}'),
    'small screens keep two cards per row with tighter gaps',
  );
});
