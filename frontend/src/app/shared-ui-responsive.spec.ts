import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cardSurface = readFileSync(new URL('./shared/ui/aba-card.component.ts', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const appTemplate = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const employeePayroll = readFileSync(new URL('./employee-payroll.component.ts', import.meta.url), 'utf8');
const platformAdmin = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
const stateMessage = readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8');
const sectionHeader = readFileSync(new URL('./shared/ui/aba-section-header.component.ts', import.meta.url), 'utf8');
const metricCard = readFileSync(new URL('./shared/ui/aba-metric-card.component.ts', import.meta.url), 'utf8');
const quickAccess = readFileSync(new URL('./shared/ui/aba-quick-access-card.component.ts', import.meta.url), 'utf8');
const mobileHeaderCss = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.css', import.meta.url), 'utf8');
const confirmDialog = readFileSync(new URL('./shared/ui/aba-confirm-dialog.component.ts', import.meta.url), 'utf8');
const releaseGuide = readFileSync(new URL('./release-guide.component.ts', import.meta.url), 'utf8');

test('mobile state feedback keeps readable copy and a full-width action at 360px', () => {
  assert.match(stateMessage, /font-size:13px;line-height:1\.45/);
  assert.match(stateMessage, /font-size:var\(--aba-font-size-sm, 12px\);line-height:1\.55/);
  assert.match(stateMessage, /@media\(max-width:380px\)\{\.aba-state-message\{padding:10px\}\.aba-state-message__action\{width:100%;margin-inline-start:0\}\}/);
  assert.match(stateMessage, /min-height:44px/);
});

test('section headings and descriptions remain readable on narrow screens', () => {
  assert.match(sectionHeader, /font-size:var\(--aba-font-size-sm, 12px\);line-height:1\.55/);
  assert.match(sectionHeader, /aba-section-header__count\{[^}]*font-size:var\(--aba-font-size-xs, 11px\)/);
  assert.match(designSystem, /\.aba-section-header__actions \.count\s*\{[^}]*font-size:\s*var\(--aiba-text-xs\)/);
  assert.match(sectionHeader, /@media\(max-width:600px\)\{[\s\S]*\.aba-section-header h2,\.aba-section-header h3\{font-size:15px\}/);
  assert.match(sectionHeader, /grid-template-columns:minmax\(0,1fr\)/);
});

test('mobile KPI labels and supporting values retain a readable minimum size', () => {
  assert.match(metricCard, /\.aba-metric-card__label\{display:block;[^}]*font-size:var\(--aba-font-size-sm, 12px\)/);
  assert.match(metricCard, /@media\(max-width:760px\)\{[\s\S]*:host\{--aba-font-size-2xs:12px\}/);
  assert.doesNotMatch(metricCard, /\.aba-metric-card__values small\{[^}]*font-size:/);
  assert.match(metricCard, /overflow-wrap:anywhere/);
});

test('mobile module cards preserve touch-friendly height and readable two-line descriptions', () => {
  assert.match(quickAccess, /@media\(max-width:760px\)\{[\s\S]*min-height:96px/);
  assert.match(quickAccess, /@media\(max-width:380px\)\{[\s\S]*min-height:96px/);
  assert.match(quickAccess, /\.aba-quick-access__copy>span\{color:[^}]*font-size:var\(--aba-font-size-sm, 12px\)/);
  assert.match(quickAccess, /\.aba-quick-access__copy>span\{font-size:12px\}/);
  assert.match(quickAccess, /\.aba-quick-access__copy>span\{display:-webkit-box;min-height:2\.9em;[\s\S]*?line-height:1\.45\}/);
  assert.match(quickAccess, /\.aba-quick-access:active:not\(:disabled\)\{[^}]*transform:scale\(\.99\)\}/);
  assert.match(quickAccess, /prefers-reduced-motion:reduce\)[\s\S]*?\.aba-quick-access:active:not\(:disabled\)\{transform:none\}/);
});

test('tablet workspace header preserves readable business name and selector columns', () => {
  assert.match(appTemplate, /@media\(max-width:900px\)\{[\s\S]*?\.workspace-bar\{grid-template-columns:minmax\(0,1fr\) minmax\(180px,260px\);align-items:center\}/);
  assert.match(appTemplate, /\.workspace-release-meta-inline\{grid-column:1\/-1;justify-content:flex-start/);
  assert.match(appTemplate, /@media\(max-width:760px\)\{[\s\S]*?\.workspace-bar\{grid-template-columns:minmax\(0,1fr\)/);
});

test('mobile app header keeps secondary context readable without shrinking touch targets', () => {
  assert.match(mobileHeaderCss, /\.context-label\s*\{[\s\S]*font-size:\s*12px/);
  assert.match(mobileHeaderCss, /\.workspace-copy strong\s*\{[\s\S]*font-size:\s*13px/);
  assert.match(mobileHeaderCss, /\.assistant-shortcut\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(mobileHeaderCss, /\.icon-button,[\s\S]*width:\s*44px/);
  assert.match(mobileHeaderCss, /@media\s*\(max-width:\s*380px\)[\s\S]*font-size:\s*12px/);
});

test('shared UI styles remain syntactically balanced and contain no escaped media-query separators', () => {
  const componentStyles = [stateMessage, sectionHeader, metricCard, quickAccess].map(source => {
    const match = source.match(/styles: \[`([\s\S]*?)`\],/);
    assert.ok(match, 'component style block must be present');
    return match[1];
  });
  const allStyles = [...componentStyles, mobileHeaderCss, cardSurface.match(/styles: \[`([\s\S]*?)`\],/)?.[1] ?? ''];
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

test('shared cards use comfortable mobile padding and reduce narrow-card vertical gaps', () => {
  assert.match(cardSurface, /@media\(max-width:600px\)\{[\s\S]*:host\{padding:var\(--aba-space-4, 16px\)\}[\s\S]*:host\(\.narrow\)\{margin-block:24px\}/);
  assert.match(cardSurface, /@media\(max-width:380px\)\{[\s\S]*:host\{padding:var\(--aba-space-3, 12px\)\}[\s\S]*:host\(\.narrow\)\{margin-block:16px\}/);
});

test('release guide keeps card padding and disclosure targets comfortable on mobile', () => {
  assert.match(releaseGuide, /@media\(max-width:600px\)\{[\s\S]*\.release-guide-panel\{padding:16px\}[\s\S]*\.release-feature-group>summary,\.release-version>summary\{padding:12px\}/);
  assert.match(releaseGuide, /@media\(max-width:380px\)\{[\s\S]*\.release-guide-panel\{padding:12px\}[\s\S]*\.release-feature-group>summary,\.release-version>summary\{padding:10px;gap:8px\}/);
  assert.match(releaseGuide, /min-height:52px;touch-action:manipulation/);
  assert.match(releaseGuide, /content:'⌄'[\s\S]*?transition:transform 160ms ease/);
  assert.match(releaseGuide, /\[open\]>summary\{background:var\(--aba-color-surface-subtle/);
  assert.match(releaseGuide, /prefers-reduced-motion:reduce\)\{\.release-feature-group>summary:after,\.release-version>summary:after\{transition:none\}\}/);
  assert.match(releaseGuide, /\.release-guide-footnote\{[^}]*font-size:13px;line-height:1\.65/);
  assert.match(releaseGuide, /\.release-guide-version-pill\{[^}]*font-size:12px/);
  assert.match(releaseGuide, /\.release-guide-current-badge\{[^}]*white-space:normal;overflow-wrap:anywhere/);
  assert.match(releaseGuide, /@media\(max-width:600px\)\{[\s\S]*\.release-guide-version-pill\{font-size:12px\}/);
});

test('Platform Admin mobile controls remain touch-friendly and readable', () => {
  const platformAdmin = readFileSync(new URL('./platform-admin.component.ts', import.meta.url), 'utf8');
  const styleBlock = platformAdmin.match(/styles: \[`([\s\S]*?)`\]/)?.[1] ?? '';
  assert.ok(styleBlock.length > 0, 'Platform Admin styles must be present');
  assert.match(styleBlock, /@media\(max-width:760px\)\{[\s\S]*?\.section-nav button,\.quiet-button,\.outline-button,\.primary-button,\.text-action,\.pagination button\{min-height:44px\}/);
  assert.match(styleBlock, /\.filters input,\.filters select,\.status-form select,\.status-form textarea,\.user-role-form select,\.user-role-form textarea\{min-height:44px\}/);
  assert.match(styleBlock, /\.filters label,\.status-form label,\.user-role-form label>span\{font-size:12px\}/);
  assert.match(styleBlock, /@media\(max-width:480px\)\{[\s\S]*?\.section-nav button\{min-height:46px;font-size:12px\}/);
  assert.match(styleBlock, /\.compact-table th,\.compact-table td\{font-size:11px;line-height:1\.4\}/);
  assert.match(styleBlock, /@media\(max-width:760px\)\{[\s\S]*?\.compact-table th,\.compact-table td\{padding:7px 5px;font-size:11px;line-height:1\.4\}/);
  assert.match(styleBlock, /\.read-only,.status-pill,.role-pill,.nav-count,[\s\S]*?font-size:12px/);
  assert.match(styleBlock, /\.runtime-grid small,.runtime-note,.currency-row small,[\s\S]*?font-size:12px;line-height:1\.45/);
  assert.match(styleBlock, /\.user-facts-grid small,.user-root-label,.data-note small\{font-size:12px;line-height:1\.45\}/);
  assert.match(styleBlock, /\.metric-card small\{font-size:12px\}/);
  assert.match(styleBlock, /\.data-note p\{font-size:12px\}/);
});

test('real workspace filter groups reflow to one column and preserve 44px mobile controls', () => {
  assert.ok(appTemplate.includes('class="list-tools"'), 'Customer/product search must use the shared list filter');
  assert.ok(appTemplate.includes('class="list-tools operations-search"'), 'Operational searches must use the shared search filter');
  assert.ok(appTemplate.includes('class="invoice-controls"'), 'Invoice search/status filters must use the shared invoice filter');
  assert.ok(appTemplate.includes('class="inline-form statement-filters"'), 'Customer statements must use the shared statement filter');
  assert.ok(platformAdmin.includes('class="filters audit-filters"'), 'Platform Admin audit form must use its responsive audit filter');
  assert.ok(employeePayroll.includes('class="employee-tools"'), 'employee search markup must use the covered employee filter');
  assert.ok(platformAdmin.includes('class="filters"'), 'Platform Admin filter forms must retain their dedicated responsive styling');
  for (const selector of [
    '.list-tools', '.operations-search', '.invoice-controls', '.statement-filters',
    '.audit-filters', '.employee-tools',
  ]) {
    assert.ok(designSystem.includes(selector), 'shared filter selector must be covered: ' + selector);
  }
  assert.match(designSystem, /\.list-tools > input,[\s\S]*?min-height:\s*var\(--aiba-control-md\)/);
  assert.match(designSystem, /\.list-tools > button,[\s\S]*?min-height:\s*var\(--aiba-control-md\)/);
  assert.match(designSystem, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.list-tools,[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('mobile tables retain every field with a touch-scroll and sticky first-column fallback', () => {
  assert.match(designSystem, /\.table-wrap,[\s\S]*?overflow-x:\s*auto/);
  assert.match(designSystem, /\.table-wrap,[\s\S]*?overscroll-behavior-inline:\s*contain/);
  assert.match(designSystem, /\.table-wrap tbody td:first-child,[\s\S]*?position:\s*sticky/);
  assert.match(designSystem, /\.table-wrap thead th:first-child,[\s\S]*?z-index:\s*4/);
  assert.match(designSystem, /\.invoice-table-wrap/);
});

test('global focus treatment remains visible and keyboard targets scroll clear of the dock', () => {
  assert.match(designSystem, /button:focus-visible,[\s\S]*?outline:\s*3px solid var\(--aiba-focus\)/);
  assert.match(designSystem, /:is\(button, a, input, select, textarea, \[tabindex\]\):focus-visible\s*\{\s*scroll-margin-block:\s*12px/);
  assert.match(sectionHeader, /:is\(button,a,\[role="button"\]\)\{min-height:44px/);
});

