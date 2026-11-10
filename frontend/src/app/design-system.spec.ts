import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const angular = JSON.parse(readFileSync(new URL('../../angular.json', import.meta.url), 'utf8'));
const app = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');

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

test('Angular loads the design system after the existing application stylesheet', () => {
  const styles = angular.projects['ai-business-assistant'].architect.build.options.styles;
  assert.deepEqual(styles, ['src/styles.css', 'src/design-system.css']);
});

test('forms, fields, filters, buttons, tables and cards share reusable visual rules', () => {
  for (const selector of [
    'form.stack', 'form.inline-form', '.list-tools', '.customer-invoice-filter',
    '.filter-bar', 'input:focus-visible', 'input[aria-invalid="true"]',
    'button.primary', 'button.secondary', '.table-wrap thead th',
    '.table-wrap tbody td', 'section.panel', '.metric-grid > aba-metric-card',
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
