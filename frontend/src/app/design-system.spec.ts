import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandDictionaryBackedProperties, expandTranslationCalls } from './localization-test-helpers.ts';

const css = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const angular = JSON.parse(readFileSync(new URL('../../angular.json', import.meta.url), 'utf8'));
const app = expandTranslationCalls(
  readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8')
);
// 3A-921 F1d: the signed-out region lives in the auth screen component now.
const authSource = expandTranslationCalls(readFileSync(new URL('./auth-screen.component.ts', import.meta.url), 'utf8'));
// 3A-351: the Home tab lives in the deferred overview workspace now.
const overviewSource = expandTranslationCalls(readFileSync(new URL('./overview-workspace.component.ts', import.meta.url), 'utf8'));
const localization = readFileSync(new URL('./localization.service.ts', import.meta.url), 'utf8');
const globalStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const guide = expandDictionaryBackedProperties(readFileSync(new URL('./release-guide.ts', import.meta.url), 'utf8'));

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

// T18 Slice D (2026-11-21): the .primary/.secondary contract is one
// definition. The design-system.css `:root body .shell` rules are the
// contract; the app.component.css base carries the same declarations (same
// min-height, padding, radius, gradient, contrast, disabled opacity, hover
// lift) so the two cannot fight. The old competing base (9px radius, 10px
// 13px padding, flat #0f766e fill, 12px/700 type, .55 disabled opacity) is
// gone. The focus-visible base is intentionally NOT aligned here: it is
// pinned by design-tokens.spec.ts as the --aba-* focus-token usage.
test('button contract is one definition: the shell base matches the design-system contract', () => {
  const secondary = app.match(/\.secondary\{([^}]*)\}/)?.[1] ?? '';
  const primary = app.match(/\.primary\{([^}]*)\}/)?.[1] ?? '';
  assert.ok(secondary.length > 0, 'missing .secondary base in app.component.css');
  assert.ok(primary.length > 0, 'missing .primary base in app.component.css');
  for (const [name, block] of [['secondary', secondary], ['primary', primary]] as const) {
    assert.match(block, /min-height:\s*var\(--aiba-control-md,44px\)/, name + ' min-height must be the 44px contract');
    assert.match(block, /border-radius:\s*var\(--aiba-radius-control,11px\)/, name + ' radius must be the 11px contract');
    assert.match(block, /font-size:\s*var\(--aiba-text-sm,13px\)/, name + ' type must be the 13px contract');
  }
  assert.match(secondary, /padding:\s*9px 14px/);
  assert.match(secondary, /border:\s*1px solid var\(--aiba-line-strong,#cbd5e1\)/);
  assert.match(secondary, /background:\s*var\(--aiba-surface,#fff\)/);
  assert.match(secondary, /color:\s*var\(--aiba-ink-soft,#344256\)/);
  assert.match(secondary, /font-weight:\s*650/);
  assert.match(primary, /padding:\s*10px 17px/);
  assert.match(primary, /border:\s*1px solid var\(--aiba-brand,#0f766e\)/);
  assert.match(primary, /background:\s*linear-gradient\(135deg,var\(--aiba-brand-strong,#115e59\) 0%,var\(--aiba-brand,#0f766e\) 100%\)/);
  assert.match(primary, /color:\s*#fff/);
  assert.match(primary, /font-weight:\s*720/);
  assert.match(app, /\.secondary:hover:not\(:disabled\)\{border-color:#94a3b8;background:var\(--aba-color-surface-subtle,#f8fafc\);box-shadow:0 2px 7px rgb\(15 23 42 \/ 5%\)\}/);
  assert.match(app, /\.primary:hover:not\(:disabled\)\{filter:saturate\(1\.08\) brightness\(\.98\);box-shadow:0 6px 16px rgb\(15 118 110 \/ 20%\);transform:translateY\(-1px\)\}/);
  assert.ok(app.includes('button:disabled{opacity:.62;cursor:not-allowed}'), 'disabled opacity must be the .62 contract');
  assert.ok(!app.includes('.secondary,.primary{border-radius:9px'), 'old combined competing base must be gone');
  assert.ok(!app.includes('.primary:hover{background:#115e59}'), 'old flat primary hover must be gone');
  assert.ok(!app.includes('button:disabled{opacity:.55'), 'old .55 disabled opacity must be gone');
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

test('public authentication screens fit the visible viewport without redundant vertical overflow', () => {
  assert.ok(app.includes('class="shell" [class.auth-shell]="!signedIn"'));
  assert.ok(app.includes('.shell.auth-shell{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;min-height:100dvh;padding-block:24px}'));
  // 3A-921 F1d: the cards live inside the auth screen component, which
  // carries the same zero-margin rule scoped to its own cards.
  assert.ok(authSource.includes('.auth-card,.setup-card{margin:0 auto}'));
});

test('splash opens as one fixed overlay step without repositioning (owner order 2026-11-27, 3A-919)', () => {
  // The splash is a fixed overlay that never participates in layout, so the
  // sign-in form appears at its final centered position instead of the card
  // sliding from the middle to the top when the form replaces it.
  assert.ok(authSource.includes('<main class="splash-overlay" role="status" aria-live="polite">'));
  assert.ok(authSource.includes('.splash-overlay{position:fixed;inset:0;'));
  assert.ok(authSource.includes('.splash-overlay .auth-card{margin:0 auto}'));
  // Content order inside the splash card: logo, app name, release meta, then
  // the loading line — the version line is prominent, the transient text last.
  const splashStart = authSource.indexOf('<main class="splash-overlay"');
  const splashEnd = authSource.indexOf('</main>', splashStart);
  const splash = authSource.slice(splashStart, splashEnd);
  assert.ok(splash.indexOf('aba-loading-logo') < splash.indexOf('splash-release-meta'));
  assert.ok(splash.indexOf('splash-release-meta') < splash.indexOf('class="muted"'));
});

test('topbar and mobile headings stay complete: long titles wrap, never truncate (owner correction 2026-11-21)', () => {
  // Slice A forced long titles onto one line; the owner requires the opposite:
  // a long title wraps and stays complete, with no ellipsis and no nowrap.
  const headingRule = css.match(/:root body \.shell \.topbar h1,[\s\S]*?\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(headingRule, /font-family:\s*var\(--aiba-font-heading\)/);
  assert.match(headingRule, /white-space:\s*normal;/);
  assert.match(headingRule, /overflow:\s*visible;/);
  assert.match(headingRule, /text-overflow:\s*clip;/);
  assert.doesNotMatch(headingRule, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(headingRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(css, /Long titles shrink via the viewport term/);
  const topbarRule = app.match(/\.topbar h1\{([^}]*)\}/)?.[1] ?? '';
  assert.match(topbarRule, /white-space:normal/);
  assert.match(topbarRule, /text-overflow:clip/);
  assert.doesNotMatch(app, /\.topbar h1\{[^}]*text-overflow:ellipsis/);
  // Setup/auth card h1 (2026-11-21 regression, superseded 2026-11-21 by the
  // U01 follow-up): at 195px (200% zoom) the long English word "workspace"
  // in the 28px Black heading font is wider than the ~119px content box and
  // overflowed the document. The b558cbd fix let long words break anywhere,
  // which stopped the overflow but split words mid-word ("works pace") —
  // the owner does not accept mid-word breaks. The replacement keeps whole
  // words (`overflow-wrap:normal`) and shrinks the size instead: the clamp
  // minimum 17px fits the longest word ("workspace", 150.88px at 28px ->
  // 91.6px at 17px; the startup-failed heading's "configuration", 191.11px
  // at 28px -> 115.8px at 17px) inside the 119px box at 195px.
  // 3A-921 F1d: the setup/auth card rules live in the auth screen component.
  const setupH1Rule = authSource.match(/\.setup-card h1,\.auth-card h1\{([^}]*)\}/)?.[1] ?? '';
  assert.match(setupH1Rule, /font-size:clamp\(17px,8vw,28px\)/);
  assert.match(setupH1Rule, /overflow-wrap:normal/);
  assert.doesNotMatch(setupH1Rule, /overflow-wrap:anywhere/);
});

test('the authentication form is named by its visible localized heading', () => {
  assert.ok(authSource.includes('<h1 id="auth-form-heading">{{ signingUp ?'));
  assert.ok(authSource.includes('<form #authForm="ngForm" aria-labelledby="auth-form-heading"'));
});

test('bootstrap and global body styles allow auth reflow below the legacy 320px floor', () => {
  assert.ok(!globalStyles.includes('min-width: 320px'));
  assert.ok(!indexHtml.includes('min-width:320px'));
  assert.ok(authSource.includes('.setup-card,.auth-card{width:min(540px,calc(100% - 30px))'));
});

test('browser title and root language metadata follow the persisted locale and language toggle', () => {
  assert.match(localization, /document\.documentElement\.lang = this\.languageValue/);
  assert.match(localization, /document\.documentElement\.dir = this\.direction/);
  assert.match(localization, /document\.title = this\.translate\('common\.app_title'\)/);
  assert.match(localization, /localStorage\.getItem\('aba-language'\)/);
  assert.match(localization, /firstValueFrom\(this\.translations\.use\(requested\)\)/);
  assert.match(app, /this\.localization\.setLanguage\(nextLanguage\)/);
  assert.match(app, /this\.language = language/);
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
    assert.ok(app.includes(selector.slice(1)) || overviewSource.includes(selector.slice(1)), 'missing Home dashboard markup: ' + selector);
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
  // T18 Slice U01 follow-up (2026-11-21): 14px, not 17px — a 17px amount
  // ("548525.00 EGP", 115px) does not fit the 2-column card at 320-380px
  // (box 125-149px) on the owner's wider font rendering, which split it at
  // 390px; 14px (~95px) fits with margin. The amount stays nowrap (see the
  // base amount rule). Below 300px the grid goes single-column (asserted in
  // the period-header test) because no readable size fits two columns there.
  assert.match(kpiMobileRule, /aba-metric-card strong\s*\{\s*font-size:\s*14px/);
  assert.match(shortcutMobileRule, /\.home-shortcut-list,\s*:root body \.shell \.module-directory-grid\s*\{\s*grid-template-columns:\s*repeat\(2/);
});

// T18 Slice U01 (2026-11-21): the period hero is a small header (compact
// padding and title) and no single-column KPI rule may contradict the
// two-column phone contract — except the U01 follow-up ≤300px exception
// below, where a 13-char amount cannot fit a 2-column card at any readable
// size (see the ≤300px block comment for the measured widths).
test('Home period header stays small and KPI cards keep two flexible columns', () => {
  const heroStart = css.indexOf(':root body .shell .dashboard-period {');
  assert.ok(heroStart >= 0, 'the Home period hero rule must exist');
  const hero = css.slice(heroStart, css.indexOf('}', heroStart));
  assert.match(hero, /padding:\s*clamp\(14px, 2vw, 20px\)/);
  const titleStart = css.indexOf(':root body .shell .dashboard-period__title {');
  assert.ok(titleStart >= 0, 'the Home period title rule must exist');
  const title = css.slice(titleStart, css.indexOf('}', titleStart));
  assert.match(title, /font-size:\s*clamp\(18px, 2vw, 22px\)/);
  // The ≤380px KPI grid stays two columns; the only single-column KPI rule
  // is the ≤300px amount-fit exception (a 2-column card is ~64px wide at
  // 195px while "548525.00 EGP" needs 95px at the 14px minimum). The slice
  // ends at the ≤300px exception block so the exception itself is not
  // counted against the ≤380px contract.
  const narrowBlock = css.slice(css.indexOf('/* At the narrowest supported phone width'), css.indexOf('/* T18 Slice U01 follow-up (2026-11-21): below 300px the KPI grid is a'));
  assert.doesNotMatch(narrowBlock, /\.metric-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    'the ≤380px KPI grid stays two columns');
  assert.match(css, /@media \(max-width: 300px\)[\s\S]*?\.metric-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    'below 300px the KPI grid is a single column so a 13-char amount fits');
  // Hero title wraps on words at narrow widths: below 380px the period pill
  // ("Last 30 days", nowrap, ~102px) squeezed the title to ~42px at 195px
  // and "Business" broke mid-word; the heading now stacks so the title
  // takes the full row.
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.dashboard-period__heading\s*\{\s*flex-wrap:\s*wrap/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.dashboard-period__title\s*\{\s*flex:\s*1 1 100%/);
  // 3A-351: the base period-title rule moved with the overview workspace.
  const heroTitleRule = (app + overviewSource).match(/\.dashboard-period__title\{([^}]*)\}/)?.[1] ?? '';
  assert.match(heroTitleRule, /overflow-wrap:normal/);
  assert.doesNotMatch(heroTitleRule, /overflow-wrap:anywhere/);
  // KPI amounts never split: the base amount rule is nowrap with a
  // viewport clamp sized from the measured "548525.00 EGP" width.
  const amountRule = css.match(/:root body \.shell \.metric-grid \.metric strong,[\s\S]*?\{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(amountRule, /font-size:\s*clamp\(14px, 3\.8vw, 18px\)/);
  assert.match(amountRule, /white-space:\s*nowrap/);
  // The global projected-slot rule in styles.css is the one that actually
  // set the computed `overflow-wrap:anywhere` on the amount (the component
  // and design-system rules only set the size); it is nowrap now.
  const globalAmountRule = globalStyles.match(/aba-metric-card strong \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(globalAmountRule, /white-space:\s*nowrap/);
  assert.doesNotMatch(globalAmountRule, /overflow-wrap:anywhere/);
});

// T18 Slice U02 date fix (2026-11-21): the ISO period dates split at the
// hyphens at 195/220px in both EN and AR ("2026-11-" / "11"). The date
// values are the <bdi dir="ltr"> elements inside .dashboard-period__details;
// each date stays on one line and the line breaks only at the spaces between
// "From", the dates and "to". NEW assertion (no old assertion — the dates
// had no nowrap rule before this fix).
test('Home period ISO dates stay unbroken at narrow widths', () => {
  const dateRule = css.match(/:root body \.shell \.dashboard-period__details bdi\[dir="ltr"\] \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(dateRule, /white-space:\s*nowrap/);
  assert.match(dateRule, /overflow-wrap:\s*normal/);
  assert.doesNotMatch(dateRule, /overflow-wrap:anywhere/);
});

// U02 follow-up (2026-11-21): at <=220px the native date inputs in a
// date-range row are too narrow for "mm/dd/yyyy" at the 16px mobile size —
// the calendar icon crowds the text (AR clips a letter) on wider real-Chrome
// rendering. The inputs get a smaller type and tighter inline padding so the
// text clears the icon in both languages. NEW assertions (no old assertions —
// the date inputs had no <=220px rule before this fix).
test('date-range date inputs keep clearance from the calendar icon at narrow widths', () => {
  assert.match(css, /@media\s*\(max-width:\s*220px\)[\s\S]*?aba-date-range \.aba-date-range__fields > label input\[type="date"\][\s\S]*?font-size:\s*13px !important/);
  assert.match(css, /aba-date-range \.aba-date-range__fields > label input\[type="datetime-local"\][\s\S]*?font-size:\s*13px !important/);
  assert.match(css, /aba-date-range \.aba-date-range__fields > label input\[type="date"\][\s\S]*?padding-inline:\s*8px !important/);
});

// T18 U06 (2026-11-21): the expense form's datetime-local shows only the
// date at 195/220px — the time segment is cut ("11/21/2026, 09:") at the 16px
// mobile size. Same treatment as the U02 date-range fix above, one step
// smaller: 13px still left the final "M" of "PM" cut at 220px in EN, and 12px
// still left it cut in AR (the AR field is 6px narrower), so the type is 11px
// with the same 8px inline padding, and date + time clear the calendar icon
// at 220px in both languages. NEW assertions (no old assertions — the expense
// date input had no <=220px rule before this fix).
test('expense datetime-local input keeps date and time visible at narrow widths', () => {
  assert.match(css, /@media\s*\(max-width:\s*220px\)[\s\S]*?form\.expense-form input\[name="expenseDate"\][\s\S]*?font-size:\s*11px !important/);
  assert.match(css, /form\.expense-form input\[name="expenseDate"\][\s\S]*?padding-inline:\s*8px !important/);
});

// T18 U11 (2026-11-22): the recurring form's datetime-local shows only the
// date at 195px ("11/22/2026") and a truncated time at 220px ("11/22/2026,
// 1") at the 16px mobile size — the same class as the U06 expense fix above,
// so the same 11px + 8px treatment. NEW assertions (no old assertions — the
// recurring next-run input had no <=220px rule before this fix).
test('recurring datetime-local input keeps date and time visible at narrow widths', () => {
  assert.match(css, /@media\s*\(max-width:\s*220px\)[\s\S]*?input\[name="recurringNextRunAt"\][\s\S]*?font-size:\s*11px !important/);
  assert.match(css, /input\[name="recurringNextRunAt"\][\s\S]*?padding-inline:\s*8px !important/);
});

// Narrow-input fix (2026-11-22): the shared search field's magnifier
// overlapped the first ~19px of the placeholder/text at every width — the
// Slice I base input rule (five :not()s, (0,7,2)) beat the component's own
// 48px/42px padding, so the input computed 13px/13px. design-system.css
// restores the component's 48px/42px values with !important (same reason as
// the U02/U06 overrides of this base rule). At ≤220px placeholders render
// at 11px so the form placeholders fit their fields; the search placeholders
// are shortened by the component's narrow placeholder instead. NEW assertions
// (no old assertions — the search input had no override and placeholders had
// no ≤220px font-size before this fix).
test('shared search field keeps icon/text clearance and placeholders fit at narrow widths', () => {
  assert.match(css, /:root body \.shell aba-search-field \.aba-search-field input[\s\S]*?padding-inline-start:\s*48px !important/);
  assert.match(css, /:root body \.shell aba-search-field \.aba-search-field input[\s\S]*?padding-inline-end:\s*42px !important/);
  assert.match(css, /@media\s*\(max-width:\s*220px\)[\s\S]*?:root body \.shell input::placeholder,[\s\S]*?:root body \.shell textarea::placeholder[\s\S]*?font-size:\s*11px;/);
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
  assert.match(guide, /titleAr: 'تخطي إلى المحتوى الرئيسي'[\s\S]*?titleEn: 'Skip to main content'[\s\S]*?detailAr:[\s\S]*?detailEn:/);
  assert.match(app, /<main class="main" id="main-content" tabindex="-1">/);
  assert.match(css, /\.skip-link\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.skip-link:focus\s*\{[\s\S]*?transform:\s*translateY\(0\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.skip-link\s*\{[\s\S]*?transition:\s*none/);
});


test('skip navigation does not suppress the main landmark keyboard focus indicator', () => {
  assert.doesNotMatch(css, /#main-content:focus\s*\{[^}]*outline:\s*none/);
  assert.match(css, /\[tabindex\]:focus-visible[\s\S]*?outline:\s*3px solid var\(--aiba-focus\)/);
});


test('mobile fixed navigation leaves a safe scroll runway after the final content item', () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.shell \.main[\s\S]*?padding-block-end:\s*calc\(132px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /scroll-padding-block-end:\s*calc\(132px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.shell \.sidebar[\s\S]*?padding-block-end:\s*calc\(8px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});

test('tablet workspace navigation uses a compact rail without removing accessible navigation names', () => {
  const tabletRail = css.slice(css.indexOf('/* Tablet workspace rail:'));
  assert.match(tabletRail, /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*900px\)/);
  assert.match(tabletRail, /--aba-layout-sidebar:\s*84px/);
  assert.match(tabletRail, /overflow-y:\s*auto/);
  assert.match(tabletRail, /\.nav-item > span:not\(\.nav-icon\)\s*\{\s*display:\s*none/);
  assert.match(tabletRail, /\.brand > span:not\(\.brand-mark\)\s*\{[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);

  const sidebarStart = app.indexOf('<aside class="sidebar"');
  const moreMenuStart = app.indexOf('<nav #mobileMoreMenu', sidebarStart);
  assert.ok(sidebarStart >= 0 && moreMenuStart > sidebarStart, 'the workspace sidebar navigation must exist');
  const sidebarMarkup = app.slice(sidebarStart, moreMenuStart);
  assert.match(sidebarMarkup, /class="sidebar-nav-scroll"/);
  assert.match(sidebarMarkup, /@for \(group of desktopNavigationGroups; track group\.id\)/);
  assert.match(sidebarMarkup, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(sidebarMarkup, /\[attr\.aria-label\]="t\(module\.titleKey\)"/);
  assert.match(sidebarMarkup, /\[attr\.title\]="t\(module\.titleKey\)"/);
  assert.match(sidebarMarkup, /\(click\)="setTab\(module\.tab\)"/);
});


// T18 Slice U02 (2026-11-21): the customer tools carry icons inline with
// their labels (Export CSV button, CSV-import disclosure).
test('customer export and import tools lay their icons inline with the label', () => {
  assert.match(css, /:root body \.shell \.customers-tool\{display:inline-flex;align-items:center;gap:7px\}/);
  assert.match(css, /:root body \.shell \.customers-tool aba-icon\{width:16px;height:16px\}/);
  assert.match(css, /:root body \.shell details\.aba-record-secondary\.csv-disclosure>summary>span\{display:inline-flex;align-items:center;gap:7px;min-width:0\}/);
  assert.match(css, /:root body \.shell details\.aba-record-secondary\.csv-disclosure>summary aba-icon\{width:16px;height:16px\}/);
});
