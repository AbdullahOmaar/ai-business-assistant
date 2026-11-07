import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const componentPaths = [
  './shared/ui/aba-card.component.ts',
  './shared/ui/aba-metric-card.component.ts',
  './shared/ui/aba-quick-access-card.component.ts',
  './shared/ui/aba-section-header.component.ts',
  './shared/ui/aba-state-message.component.ts',
];
const componentSources = componentPaths.map(path =>
  readFileSync(new URL(path, import.meta.url), 'utf8'),
);
const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

test('semantic design tokens are defined once and cover the shared UI foundation', () => {
  const definitions = [...styles.matchAll(/^\s*(--aba-[\w-]+)\s*:/gm)].map(match => match[1]);
  assert.equal(new Set(definitions).size, definitions.length, 'design token names must not be redefined');

  const required = [
    '--aba-color-primary',
    '--aba-color-primary-strong',
    '--aba-color-primary-soft',
    '--aba-color-primary-border',
    '--aba-color-on-primary',
    '--aba-color-text-primary',
    '--aba-color-text-muted',
    '--aba-color-text-secondary',
    '--aba-color-text-tertiary',
    '--aba-color-text-inverse',
    '--aba-color-page',
    '--aba-color-surface',
    '--aba-color-surface-subtle',
    '--aba-color-surface-hover',
    '--aba-color-border',
    '--aba-color-border-subtle',
    '--aba-color-border-strong',
    '--aba-color-focus',
    '--aba-color-focus-ring',
    '--aba-color-danger-soft',
    '--aba-color-danger-border',
    '--aba-color-danger-text',
    '--aba-color-success-soft',
    '--aba-color-success-border',
    '--aba-color-success-text',
    '--aba-color-info-soft',
    '--aba-color-info-border',
    '--aba-color-info-text',
    '--aba-color-warning-soft',
    '--aba-color-warning-border',
    '--aba-color-warning-text',
    '--aba-color-nav-surface',
    '--aba-color-nav-surface-deep',
    '--aba-color-nav-surface-raised',
    '--aba-color-nav-surface-glass',
    '--aba-color-nav-border',
    '--aba-color-nav-text',
    '--aba-color-nav-muted',
    '--aba-color-nav-accent',
    '--aba-color-nav-active-start',
    '--aba-color-nav-active-end',
    '--aba-shadow-nav-menu',
    '--aba-shadow-nav-dock',
    '--aba-color-hero-start',
    '--aba-color-hero-mid',
    '--aba-color-hero-end',
    '--aba-color-hero-text',
    '--aba-color-hero-muted',
    '--aba-font-family',
    '--aba-font-size-xs',
    '--aba-font-size-sm',
    '--aba-font-size-base',
    '--aba-font-size-lg',
    '--aba-font-size-xl',
    '--aba-line-height-normal',
    '--aba-line-height-relaxed',
    '--aba-font-weight-medium',
    '--aba-font-weight-semibold',
    '--aba-font-weight-bold',
    '--aba-space-1',
    '--aba-space-2',
    '--aba-space-3',
    '--aba-space-4',
    '--aba-space-5',
    '--aba-space-6',
    '--aba-space-8',
    '--aba-space-10',
    '--aba-radius-control',
    '--aba-radius-card',
    '--aba-radius-panel',
    '--aba-radius-pill',
    '--aba-shadow-card',
    '--aba-shadow-card-hover',
    '--aba-shadow-popover',
    '--aba-motion-fast',
    '--aba-motion-normal',
    '--aba-easing-standard',
    '--aba-focus-ring-width',
    '--aba-focus-ring-offset',
    '--aba-control-height',
    '--aba-control-radius',
    '--aba-control-padding-inline',
    '--aba-layout-sidebar',
    '--aba-layout-content-max',
    '--aba-layout-mobile-nav',
    '--aba-z-index-sticky',
    '--aba-z-index-dropdown',
    '--aba-z-index-toast',
    '--aba-z-index-dialog',
  ];

  for (const token of required) {
    assert.equal(definitions.filter(name => name === token).length, 1, `${token} must be defined exactly once`);
  }
});

test('shared UI primitives consume the semantic token layer instead of owning a parallel palette', () => {
  for (const [index, source] of componentSources.entries()) {
    assert.match(source, /var\(--aba-[\w-]+/,
      `${componentPaths[index]} must consume shared design tokens`);
  }
});

test('global foundation preserves focus visibility, reduced motion, and local Arabic font fallback', () => {
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /Noto Sans Arabic/);
  assert.match(styles, /system-ui/);
  assert.match(styles, /color-scheme:\s*light/);
});


test('the workspace shell consumes semantic navigation and hero palette tokens', () => {
  const requiredShellTokens = [
    '--aba-color-nav-surface',
    '--aba-color-nav-text',
    '--aba-color-nav-surface-raised',
    '--aba-color-nav-active-start',
    '--aba-color-nav-active-end',
    '--aba-color-nav-accent',
    '--aba-color-hero-start',
    '--aba-color-hero-mid',
    '--aba-color-hero-end',
    '--aba-layout-sidebar',
    '--aba-layout-content-max',
    '--aba-layout-mobile-nav',
  ];
  for (const token of requiredShellTokens) {
    assert.ok(appSource.includes(`var(${token}`), `app shell must consume ${token}`);
  }
});


test('app-wide focus indicators use the same visible focus tokens as shared controls', () => {
  assert.match(appSource, /button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible\{outline:var\(--aba-focus-ring-width,3px\) solid var\(--aba-color-focus-ring,#2563eb\);outline-offset:var\(--aba-focus-ring-offset,2px\)\}/);
});


test('shared section headers preserve h2/h3 hierarchy for nested workspace sections', () => {
  const sectionHeaderSource = componentSources[3];
  assert.match(sectionHeaderSource, /readonly level = input<2 \| 3>\(2\)/);
  assert.match(sectionHeaderSource, /@if \(level\(\) === 3\)/);
  assert.match(sectionHeaderSource, /<h3 \[id\]="titleId\(\) \|\| null">/);
  assert.equal([...appSource.matchAll(/<aba-section-header \[level\]="3"/g)].length, 2,
    'nested receivables and customer statement sections must use h3');
});


test('native Angular validation styles touched and submitted invalid controls without styling untouched fields', () => {
  assert.match(styles, /\.shell input\.ng-invalid\.ng-touched/);
  assert.match(styles, /\.shell select\.ng-invalid\.ng-touched/);
  assert.match(styles, /\.shell textarea\.ng-invalid\.ng-touched/);
  assert.match(styles, /\.shell form\.ng-submitted input\.ng-invalid/);
  assert.match(styles, /border-color: var\(--aba-color-danger-border\)/);
  assert.match(styles, /background-color: var\(--aba-color-danger-soft\)/);
  assert.match(styles, /:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="file"\]\)/);
});


test('inline field errors use shared semantic danger and typography tokens', () => {
  assert.match(styles, /\.field-error\s*\{[^}]*color:\s*var\(--aba-color-danger-text\)/);
  assert.match(styles, /\.field-error\s*\{[^}]*font-size:\s*var\(--aba-font-size-xs\)/);
  assert.match(styles, /\.field-error\s*\{[^}]*overflow-wrap:\s*anywhere/);
});


test('sign-in form receives the same touched and submitted invalid-control treatment as workspace forms', () => {
  assert.match(styles, /\.auth-card input\.ng-invalid\.ng-touched/);
  assert.match(styles, /\.auth-card form\.ng-submitted input\.ng-invalid/);
  assert.match(styles, /\.auth-card input\.ng-invalid\.ng-touched:focus-visible/);
  assert.match(styles, /\.field-error\s*\{[^}]*color:\s*var\(--aba-color-danger-text\)/);
});


const colorToken = (name: string): string => {
  const line = styles.split(/\r?\n/).find(value => value.trimStart().startsWith(name + ':'));
  const match = line?.match(/^\s*--aba-[\w-]+:\s*(#[0-9a-fA-F]{6})\s*;?\s*$/);
  assert.ok(match, `missing six-digit color token: ${name}`);
  return match[1];
};

const relativeLuminance = (hex: string): number => {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrastRatio = (foreground: string, background: string): number => {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test('semantic text colors meet WCAG AA and the focus indicator meets 3:1 non-text contrast', () => {
  const textPairs = [
    ['--aba-color-text-primary', '--aba-color-surface'],
    ['--aba-color-text-primary', '--aba-color-page'],
    ['--aba-color-text-muted', '--aba-color-surface'],
    ['--aba-color-text-secondary', '--aba-color-surface'],
    ['--aba-color-text-tertiary', '--aba-color-surface'],
    ['--aba-color-nav-text', '--aba-color-nav-surface'],
    ['--aba-color-nav-muted', '--aba-color-nav-surface'],
    ['--aba-color-hero-muted', '--aba-color-hero-mid'],
    ['--aba-color-danger-text', '--aba-color-danger-soft'],
    ['--aba-color-success-text', '--aba-color-success-soft'],
    ['--aba-color-info-text', '--aba-color-info-soft'],
    ['--aba-color-warning-text', '--aba-color-warning-soft'],
    ['--aba-color-on-primary', '--aba-color-primary'],
  ];
  for (const [foreground, background] of textPairs) {
    const ratio = contrastRatio(colorToken(foreground), colorToken(background));
    assert.ok(ratio >= 4.5, `${foreground} on ${background} must be >= 4.5:1 (got ${ratio.toFixed(2)}:1)`);
  }

  const focus = colorToken('--aba-color-focus-ring');
  for (const surface of ['--aba-color-surface', '--aba-color-page']) {
    const ratio = contrastRatio(focus, colorToken(surface));
    assert.ok(ratio >= 3, `focus indicator on ${surface} must be >= 3:1 (got ${ratio.toFixed(2)}:1)`);
  }
});


test('Phase 2 interaction foundation centralizes touch targets, form controls, and shared surfaces', () => {
  for (const token of ['--aba-control-height', '--aba-control-radius', '--aba-control-padding-inline']) {
    assert.equal(styles.split('\n').filter(line => line.trimStart().startsWith(token + ':')).length, 1,
      `${token} must be defined exactly once`);
  }

  assert.ok(styles.includes(':root body .shell button:not(.nav-item):not(.mobile-more)'));
  assert.ok(styles.includes('min-height: var(--aba-control-height)'));
  assert.ok(styles.includes(':root body .shell input:not([type="checkbox"])'));
  assert.ok(styles.includes(':root body .shell select'));
  assert.ok(styles.includes('border-radius: var(--aba-control-radius)'));
  assert.ok(styles.includes(':root body .shell .primary:hover:not(:disabled)'));
  assert.ok(styles.includes(':root body .shell .secondary:hover:not(:disabled)'));
  assert.ok(styles.includes(':root body .shell .table-wrap tbody tr:hover'));
  assert.ok(styles.includes('@media (forced-colors: active)'));
  assert.ok(appSource.includes('input,select,textarea{font-size:16px!important;min-height:44px}'));
});


test('destructive secondary actions retain semantic danger styling', () => {
  assert.ok(styles.includes(':root body .shell .secondary.danger'));
  assert.ok(styles.includes(':root body .shell .secondary.danger:hover:not(:disabled)'));
  assert.ok(styles.includes('color: var(--aba-color-danger-text)'));
  assert.ok(styles.includes('background: var(--aba-color-danger-soft)'));
});


test('route-level headings, filters, notices, and assistant messages share semantic surfaces', () => {
  for (const selector of [
    ':root body .shell .topbar h1',
    ':root body .shell .section-head h2',
    ':root body .shell .count',
    ':root body .shell .inline-form',
    ':root body .shell .notice',
    ':root body .shell .chat-message.user-message',
    ':root body .shell .suggestion-card:hover',
  ]) assert.ok(styles.includes(selector), `missing shared UX selector: ${selector}`);

  assert.ok(styles.includes('font-size: clamp(var(--aba-font-size-2xl)'));
  assert.ok(styles.includes('background: var(--aba-color-success-soft)'));
  assert.ok(styles.includes('background: var(--aba-color-primary-soft)'));
});


test('authentication and nested form surfaces use semantic tokens', () => {
  for (const selector of [
    ':root body .shell .auth-card',
    ':root body .shell .setup-card',
    ':root body .shell .invoice-create-disclosure',
    ':root body .shell .invoice-create-disclosure > summary:after',
    ':root body .shell .invoice-line-row',
    ':root body .shell .aging-buckets > div',
    ':root body .shell .version-pill',
  ]) assert.ok(styles.includes(selector), `missing semantic surface selector: ${selector}`);

  assert.ok(styles.includes('box-shadow: var(--aba-shadow-popover)'));
  assert.ok(styles.includes('background: var(--aba-color-surface-subtle)'));
  assert.ok(styles.includes('color: var(--aba-color-primary-strong)'));
});


test('helper, warning, import and install surfaces use semantic contrast tokens', () => {
  for (const selector of [
    ':root body .shell .csv-import-panel',
    ':root body .shell .csv-import-errors',
    ':root body .shell .warning-notice',
    ':root body .shell .divider',
    ':root body .shell .footnote',
    ':root body .shell .metric small',
    ':root body .shell footer span',
    ':root body .shell .install-button',
  ]) assert.ok(styles.includes(selector), `missing semantic helper selector: ${selector}`);

  assert.ok(styles.includes('color: var(--aba-color-danger-text)'));
  assert.ok(styles.includes('color: var(--aba-color-warning-text)'));
  assert.ok(styles.includes('color: var(--aba-color-text-tertiary)'));
  assert.ok(styles.includes('background: var(--aba-color-success-soft)'));
});
