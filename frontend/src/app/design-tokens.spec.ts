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
  ];
  for (const token of requiredShellTokens) {
    assert.ok(appSource.includes(`var(${token}`), `app shell must consume ${token}`);
  }
});
