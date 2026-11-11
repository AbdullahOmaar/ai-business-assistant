import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const angular = JSON.parse(readFileSync(new URL('../../angular.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./release-guide.ts', import.meta.url), 'utf8');

test('the final AIBA visual direction defines a complete semantic token foundation', () => {
  const tokens = [...css.matchAll(/^\s*(--aiba-[\w-]+)\s*:/gm)].map(match => match[1]);
  assert.ok(tokens.length >= 45, 'expected color, type, spacing, control and elevation tokens');
  assert.equal(new Set(tokens).size, tokens.length, 'AIBA token names must be unique');
  for (const token of [
    '--aiba-brand', '--aiba-brand-strong', '--aiba-page', '--aiba-surface',
    '--aiba-ink', '--aiba-muted', '--aiba-line', '--aiba-focus',
    '--aiba-font-sans', '--aiba-text-md', '--aiba-heading-lg',
    '--aiba-space-4', '--aiba-space-8', '--aiba-control-md',
    '--aiba-radius-control', '--aiba-radius-card', '--aiba-shadow-card',
  ]) {
    assert.match(css, new RegExp(token + ':'));
  }
});

test('muted copy and placeholders use the contrast-safe neutral token', () => {
  assert.match(css, /--aiba-muted:\s*#5f6e83/);
  assert.match(css, /input::placeholder[\s\S]*?color:\s*var\(--aiba-muted\)/);
});

test('primary button white labels meet WCAG AA contrast at every gradient stop', () => {
  const token = (name: string) => css.match(new RegExp(name + ':\\s*(#[0-9a-f]{6})', 'i'))?.[1];
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16) / 255);
    const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (hex: string) => 1.05 / (luminance(hex) + 0.05);
  const strong = token('--aiba-brand-strong');
  const brand = token('--aiba-brand');
  assert.ok(strong && brand, 'primary gradient tokens must resolve to six-digit colors');
  assert.match(css, /background:\s*linear-gradient\(135deg,\s*var\(--aiba-brand-strong\) 0%,\s*var\(--aiba-brand\) 100%\)/);
  for (const stop of [strong, brand]) assert.ok(contrast(stop) >= 4.5, stop + ' must provide at least 4.5:1 contrast with white');
});

test('KPI card surface is drawn once by the inner component, not the Angular host', () => {
  const hostBlocks = [...css.matchAll(/([^{}]*metric-grid > aba-metric-card[^{}]*)\{([^{}]*)\}/g)]
    .filter(([, selector]) => !selector.includes('.aba-metric-card'));
  const inner = css.match(/:root body \.shell \.metric-grid > aba-metric-card \.aba-metric-card\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.ok(hostBlocks.length >= 3, 'base and responsive Angular host rules must remain covered');
  for (const [, selector, declarations] of hostBlocks) {
    const hostPadding = declarations.match(/\bpadding\s*:\s*([^;]+);/)?.[1].trim();
    assert.ok(!hostPadding || hostPadding === '0' || hostPadding === '0px', selector.trim() + ' must not add host padding');
    assert.doesNotMatch(declarations, /\b(border|background|box-shadow)\s*:/, selector.trim());
  }
  assert.match(inner, /border:/);
  assert.match(inner, /background:/);
  assert.match(inner, /box-shadow:/);
});

test('Angular loads the design system after the existing application stylesheet', () => {
  const styles = angular.projects['ai-business-assistant'].architect.build.options.styles;
  assert.deepEqual(styles, ['src/styles.css', 'src/design-system.css']);
});

test('forms, fields, filters, buttons, tables and cards share reusable visual rules', () => {
  for (const selector of [
    'form.stack', 'form.inline-form', '.list-tools', '.customer-invoice-filter',
    '.filter-bar', 'input:focus-visible', 'input[aria-invalid="true"]',
    'button.primary', 'button.secondary', '.table-wrap thead th',
    '.table-wrap tbody td', 'section.panel', '.metric-grid > aba-metric-card .aba-metric-card',
    'form.expense-form', 'form.payment-form', 'form.invoice-form',
    '.invoice-toolbar', '.statement-filters', '.invoice-table-wrap thead th',
    '.audit-table-wrap tbody td', '.invoice-card', '.line-card', '.server-summary',
    '.employee-form', '.payroll-form', '.employee-tools', '.filters', '.audit-filters',
    '.status-form', '.user-role-form', '.chat-form',
    '.admin-shell .metric-card', '.admin-shell .permission-card',
    '.admin-shell .section-nav', '.admin-shell .detail-grid',
  ]) {
    assert.ok(css.includes(selector), 'missing design system selector: ' + selector);
  }
});

test('the complete Home dashboard screen uses the new hero, metric and quick-access patterns', () => {
  for (const selector of [
    '.dashboard-period', '.dashboard-period__heading', '.dashboard-period__details',
    '.dashboard-trust-note', '.metric-grid', '.home-shortcut-list',
    '.home-shortcut-link', '.module-directory-summary',
  ]) {
    assert.ok(app.includes(selector.slice(1)), 'missing Home dashboard markup: ' + selector);
    assert.ok(css.includes(selector), 'missing dashboard styling: ' + selector);
  }
});

test('mobile, reduced-motion and high-contrast behavior remain defined', () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
});

test('Home KPIs and module shortcuts keep two readable columns at narrow phone widths', () => {
  const kpiMobileRule = css.slice(css.indexOf('/* At the narrowest supported phone width'));
  const shortcutMobileRule = css.slice(css.indexOf('/* Keep the Home action and module grids'));
  assert.match(kpiMobileRule, /\.metric-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(kpiMobileRule, /aba-metric-card strong\s*\{\s*font-size:\s*17px/);
  assert.match(shortcutMobileRule, /\.home-shortcut-list,\s*:root body \.shell \.module-directory-grid\s*\{\s*grid-template-columns:\s*repeat\(2/);
});


test('interactive navigation and disclosure controls retain touch size and visible keyboard focus', () => {
  assert.match(css, /\.home-shortcut-link,[\s\S]*?\.module-directory-summary[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\[tabindex\]:focus-visible[\s\S]*?outline:\s*3px solid var\(--aiba-focus\)/);
});


test('mobile state messages wrap retry actions and reserve document viewport clearance above the dock', () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?html\s*\{\s*scroll-padding-block-end:\s*calc\(128px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)[\s\S]*?:root body \.shell \.aba-state-message\s*\{\s*flex-wrap:\s*wrap/);
  assert.doesNotMatch(app, /\.main,[^{]*\{[^}]*scroll-padding-block-end/);
});


test('every authenticated workspace route exposes a localized skip link to the main landmark', () => {
  assert.match(app, /class="skip-link" href="#main-content"/);
  assert.ok(app.includes("@if (initialized && signedIn && !startupFailed && !setupNeeded) {"));
  assert.match(app, /تخطي إلى المحتوى الرئيسي/);
  assert.match(app, /Skip to main content/);
  assert.match(guide, /titleAr: 'تخطي إلى المحتوى الرئيسي'[\\s\\S]*?titleEn: 'Skip to main content'[\\s\\S]*?detailAr:[\\s\\S]*?detailEn:/);
  assert.match(app, /<main class="main" id="main-content" tabindex="-1">/);
  assert.match(css, /\.skip-link\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.skip-link:focus\s*\{[\s\S]*?transform:\s*translateY\(0\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.skip-link\s*\{[\s\S]*?transition:\s*none/);
});


test('skip navigation does not suppress the main landmark keyboard focus indicator', () => {
  assert.doesNotMatch(css, /#main-content:focus\s*\{[^}]*outline:\s*none/);
  assert.match(css, /\[tabindex\]:focus-visible[\s\S]*?outline:\s*3px solid var\(--aiba-focus\)/);
});
