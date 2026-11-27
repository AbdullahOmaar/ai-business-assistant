import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// T18 Slice I (2026-11-21): form fields — one height and one radius, at the
// CSS-rule level. Single-line fields are 44px high with an 11px radius
// everywhere the rules reach. No token set was renamed or merged and no
// token value changed: the --aba-* / --aiba-* values are untouched, and the
// unification is done by pointing the field rules at the 44px / 11px
// resolutions (see the Slice I comments in design-system.css / styles.css).
//
// Two splits REMAIN, deliberately, because other specs pin them — do not
// "fix" them by loosening those specs:
//  (a) mobile (<=760px) fields stay 48px: design-tokens.spec.ts pins the
//      design-system.css <=760px field rule at 48px + 16px, and the
//      customer-module / inventory-ledger specs pin the components' own
//      48px mobile rules. That is the touch-target rule, not a leftover.
//  (b) the customer editor stays 46px: customer-module.spec.ts pins
//      min-height:46px in customer-editor.component.css.
// Textareas keep content-driven heights (104px default, 92px draft editor,
// 88px product editor, 96px customer editor, 48px chat composer); only
// single-line fields are unified to 44px.

const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
// 3A-921 F1d: the auth field errors live in the auth screen component now.
const authScreenSource = readFileSync(new URL('./auth-screen.component.ts', import.meta.url), 'utf8');
// 3A-351: the three reports field errors moved with the reports workspace.
const reportsSource = readFileSync(new URL('./reports-workspace.component.ts', import.meta.url), 'utf8');

const ruleBlock = (css: string, selectorStart: string): string => {
  const start = css.indexOf(selectorStart);
  assert.ok(start >= 0, 'missing rule: ' + selectorStart);
  return css.slice(start, css.indexOf('}', start));
};

test('global field rules resolve to one height (44px) and one radius (11px)', () => {
  const aibaFields = ruleBlock(
    designSystem,
    ':root body .shell input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"])',
  );
  assert.match(aibaFields, /min-height: var\(--aiba-control-md\)/);
  assert.match(aibaFields, /border-radius: var\(--aiba-radius-control\)/);
  assert.ok(!designSystem.includes('var(--aiba-control-lg)'),
    'no field rule may still use the 48px --aiba-control-lg value');

  const abaFields = ruleBlock(
    styles,
    ':root body .shell input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="range"])',
  );
  assert.match(abaFields, /min-height: var\(--aba-control-height\)/);
  assert.match(abaFields, /border-radius: var\(--aiba-radius-control, 11px\)/);
  // The --aba-control-radius token itself is untouched (still 10px) and its
  // var() form remains on the button rules; only the field rule resolves to 11px.
  assert.ok(styles.includes('border-radius: var(--aba-control-radius)'));
});

test('shell field rules in app.component.css use the 11px radius', () => {
  assert.match(appCss, /\.input, input,select,textarea\{[^}]*border-radius:11px/);
  assert.match(appCss, /\.shell input,\.shell select,\.shell textarea\{[^}]*border-radius:11px/);
});

test('bespoke component field rules use the 11px radius at 44px height', () => {
  const cases: Array<[string, RegExp]> = [
    ['./customer-workspace.component.ts', /\.customer-workspace__search input\{[^}]*min-height:44px[^}]*border-radius:11px/],
    ['./purchasing-workspace.component.ts', /\.pw__line-form input,[^}]*min-height:44px[^}]*border-radius:11px/],
    ['./platform-admin.component.ts', /\.filters input,[^}]*border-radius:11px/],
    ['./platform-admin.component.ts', /\.user-role-form select,[^}]*border-radius:11px/],
    ['./product-editor.component.ts', /\.product-editor input,[^}]*min-height:44px[^}]*border-radius:11px/],
    ['./customer-editor.component.css', /\.customer-editor input,[^}]*border-radius:11px/],
    ['./credit-note-issuance.component.ts', /input, select \{[^}]*border-radius: 11px/],
    ['./customer-directory.component.css', /\.customer-directory__mobile-sort select\{[^}]*min-height:44px[^}]*border-radius:11px/],
    ['./product-catalog.component.css', /\.product-catalog__mobile-sort select\{[^}]*min-height:44px[^}]*border-radius:11px/],
    ['./invoice-draft-editor.component.ts', /input,select,textarea\{[^}]*border-radius:11px/],
    ['./invoice-draft-editor.component.ts', /input,select\{min-height:44px/],
    ['./employee-payroll.component.ts', /input,select\{[^}]*border-radius:11px/],
    ['./audit-events-workspace.component.ts', /\.audit-filters select\{[^}]*border-radius:11px/],
    ['./workspace-invitations.component.ts', /input\{width:100%;min-width:0;min-height:44px;[^}]*border-radius:11px/],
    ['./shared/ui/aba-search-field.component.ts', /:host \.aba-search-field input\{[^}]*min-height:var\(--aiba-control-md,44px\)/],
    ['./inventory-movement-ledger.component.ts', /\.inventory-ledger select\{[^}]*min-height:44px[^}]*border-radius:var\(--aiba-radius-control,11px\)/],
  ];
  for (const [path, pattern] of cases) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, pattern, path + ' field rule must be 44px / 11px');
  }
});

test('pinned height exceptions stay as documented, not silently unified', () => {
  const editorCss = readFileSync(new URL('./customer-editor.component.css', import.meta.url), 'utf8');
  assert.match(editorCss, /min-height:46px/, 'customer editor 46px is pinned by customer-module.spec.ts');
  assert.match(designSystem, /@media \(max-width: 760px\)[\s\S]*?min-height: 48px;[\s\S]*?font-size: 16px;/,
    'mobile 48px field rule is pinned by design-tokens.spec.ts');
  for (const path of [
    './customer-editor.component.css',
    './customer-directory.component.css',
    './product-catalog.component.css',
    './inventory-movement-ledger.component.ts',
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /min-height:48px/, path + ' keeps its pinned 48px mobile rule');
  }
});

test('field errors that sit next to their field live inside the field label', () => {
  assert.match(styles, /\.field-error\s*\{[^}]*display:\s*block/);
  assert.match(designSystem, /:root body \.shell form\.stack > label,[\s\S]*?display: grid;/);
  // The 9 errors already rendered inside their label (auth, workspace
  // setup, reports P&L + ageing, product editor) must stay there.
  // NOTE (follow-up, not this CSS-only slice): 15 per-field errors in the
  // notifications, suppliers, recurring, payments and expenses forms plus
  // the chat form render in a form-level .form-validation /
  // .expense-validation summary block below the form instead of next to
  // their field. Moving them into their labels is a markup change and the
  // summary blocks are pinned by app.component-template-safety.spec.ts and
  // expense-ui.spec.ts, so it belongs to the follow-up field-component
  // slice, not Slice I. Each of those controls already links to its error
  // via aria-describedby.
  for (const [id, home] of [
    ['auth-email-error', authScreenSource], ['auth-password-error', authScreenSource], ['workspace-name-error', appSource],
    ['profit-loss-start-error', reportsSource], ['profit-loss-end-error', reportsSource], ['aging-as-of-error', reportsSource],
    ['product-name-error', appSource], ['product-price-error', appSource], ['product-opening-quantity-error', appSource],
  ]) {
    const at = home.indexOf(`id="${id}"`);
    assert.ok(at >= 0, 'missing error: ' + id);
    const before = home.slice(0, at);
    assert.ok(before.lastIndexOf('<label') > before.lastIndexOf('</label>'),
      id + ' must sit inside its field label');
  }
});
