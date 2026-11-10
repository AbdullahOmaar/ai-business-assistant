import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stateMessage = readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8');
const sectionHeader = readFileSync(new URL('./shared/ui/aba-section-header.component.ts', import.meta.url), 'utf8');
const metricCard = readFileSync(new URL('./shared/ui/aba-metric-card.component.ts', import.meta.url), 'utf8');
const quickAccess = readFileSync(new URL('./shared/ui/aba-quick-access-card.component.ts', import.meta.url), 'utf8');
const mobileHeaderCss = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.css', import.meta.url), 'utf8');
const confirmDialog = readFileSync(new URL('./shared/ui/aba-confirm-dialog.component.ts', import.meta.url), 'utf8');

test('mobile state feedback keeps readable copy and a full-width action at 360px', () => {
  assert.match(stateMessage, /font-size:13px;line-height:1\.45/);
  assert.match(stateMessage, /font-size:var\(--aba-font-size-sm, 12px\);line-height:1\.55/);
  assert.match(stateMessage, /@media\(max-width:380px\)\{\.aba-state-message\{padding:10px\}\.aba-state-message__action\{width:100%;margin-inline-start:0\}\}/);
  assert.match(stateMessage, /min-height:44px/);
});

test('section headings and descriptions remain readable on narrow screens', () => {
  assert.match(sectionHeader, /font-size:var\(--aba-font-size-sm, 12px\);line-height:1\.55/);
  assert.match(sectionHeader, /@media\(max-width:600px\)\{[\s\S]*\.aba-section-header h2,\.aba-section-header h3\{font-size:15px\}/);
  assert.match(sectionHeader, /grid-template-columns:minmax\(0,1fr\)/);
});

test('mobile KPI labels and supporting values retain a readable minimum size', () => {
  assert.match(metricCard, /\.aba-metric-card__label\{display:block;[^}]*font-size:var\(--aba-font-size-sm, 12px\)/);
  assert.match(metricCard, /@media\(max-width:380px\)\{[\s\S]*\.aba-metric-card__label\{font-size:11px\}[\s\S]*\.aba-metric-card__values small\{font-size:10px\}/);
  assert.match(metricCard, /overflow-wrap:anywhere/);
});

test('mobile module cards preserve touch-friendly height and readable two-line descriptions', () => {
  assert.match(quickAccess, /@media\(max-width:760px\)\{[\s\S]*min-height:96px/);
  assert.match(quickAccess, /@media\(max-width:380px\)\{[\s\S]*min-height:96px/);
  assert.match(quickAccess, /\.aba-quick-access__copy>span\{color:[^}]*font-size:var\(--aba-font-size-sm, 12px\)/);
  assert.match(quickAccess, /\.aba-quick-access__copy>span\{font-size:11px\}/);
});

test('mobile app header keeps secondary context readable without shrinking touch targets', () => {
  assert.match(mobileHeaderCss, /\.context-label\s*\{[\s\S]*font-size:\s*10px/);
  assert.match(mobileHeaderCss, /\.workspace-copy strong\s*\{[\s\S]*font-size:\s*12px/);
  assert.match(mobileHeaderCss, /\.assistant-shortcut\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(mobileHeaderCss, /\.icon-button,[\s\S]*width:\s*44px/);
  assert.match(mobileHeaderCss, /@media\s*\(max-width:\s*380px\)[\s\S]*font-size:\s*11px/);
});

test('shared UI styles remain syntactically balanced and contain no escaped media-query separators', () => {
  const componentStyles = [stateMessage, sectionHeader, metricCard, quickAccess].map(source => {
    const match = source.match(/styles: \[`([\s\S]*?)`\],/);
    assert.ok(match, 'component style block must be present');
    return match[1];
  });
  const allStyles = [...componentStyles, mobileHeaderCss];
  for (const styles of allStyles) {
    let depth = 0;
    for (const character of styles) {
      if (character === '{') depth += 1;
      if (character === '}') depth -= 1;
      assert.ok(depth >= 0, 'CSS closing brace must have a matching opening brace');
    }
    assert.equal(depth, 0, 'CSS blocks must have balanced braces');
    assert.ok(!styles.includes('\\n    @media'), 'media queries must be separated by real CSS whitespace');
  }
});

test('mobile confirmation dialogs use a safe-area-aware bottom sheet with reachable actions', () => {
  assert.match(confirmDialog, /@media\(max-width:480px\)\{[\s\S]*\.confirm-backdrop\{align-items:end;justify-items:stretch;padding:0;backdrop-filter:none\}/);
  assert.match(confirmDialog, /border-radius:20px 20px 0 0/);
  assert.match(confirmDialog, /env\(safe-area-inset-bottom,0px\)/);
  assert.match(confirmDialog, /\.confirm-actions button\{min-width:0;min-height:48px\}/);
  assert.match(confirmDialog, /@media\(max-width:380px\)\{\.confirm-actions\{grid-template-columns:1fr\}\}/);
  assert.match(confirmDialog, /prefers-reduced-motion:reduce\)\{\.confirm-dialog\{animation:none\}\}/);
});
