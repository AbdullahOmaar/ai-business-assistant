import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandTranslationCalls } from './localization-test-helpers.ts';

const componentSource = readFileSync(new URL('./shared/ui/aba-skeleton.component.ts', import.meta.url), 'utf8');
const appSource = expandTranslationCalls(readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8'));
const appStyles = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');

const homeStart = appSource.indexOf("@if (tab === 'overview') {");
const homeEnd = appSource.indexOf("@if (tab === 'notifications')", homeStart);
const home = appSource.slice(homeStart, homeEnd);
const loadingStart = home.indexOf('} @else if (loading) {');
const loadingEnd = home.indexOf('} @else if (!error)', loadingStart);
const loading = home.slice(loadingStart, loadingEnd);

// T18 Slice C: shared skeleton component (variants: metric-card, list-row,
// detail), extracted from the Overview skeleton. The component is exercised
// by source assertions (no TestBed in the node runner), following the
// aba-loading-logo.spec.ts pattern. The spec lives flat in src/app/ like the
// other specs: `npm test` globs src/app/*.spec.ts, so a spec under
// shared/ui/ would never run.

// --- Component contract ---

test('skeleton is a standalone OnPush component with the three variants and detail inputs', () => {
  assert.ok(componentSource.includes("selector: 'aba-skeleton'"), 'missing selector');
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.match(componentSource, /readonly variant = input<'metric-card' \| 'list-row' \| 'detail'>\('metric-card'\)/);
  assert.ok(componentSource.includes('readonly title = input<string | null>(null)'), 'detail variant needs a title input');
  assert.ok(componentSource.includes('readonly subtitle = input<string | null>(null)'), 'detail variant needs a subtitle input');
});

test('metric-card variant renders one KPI card with three bars', () => {
  assert.ok(componentSource.includes("variant() === 'detail'"), 'detail branch must be checked first');
  assert.ok(componentSource.includes("variant() === 'list-row'"), 'list-row branch must exist');
  const metricStart = componentSource.indexOf('<div class="metric-skeleton aba-skeleton aba-skeleton--metric-card"');
  assert.ok(metricStart >= 0, 'missing metric-card variant');
  const metric = componentSource.slice(metricStart, componentSource.indexOf('`', metricStart));
  assert.match(metric, /<div class="metric-skeleton aba-skeleton aba-skeleton--metric-card" aria-hidden="true">/);
  assert.equal((metric.match(/<span class="aba-skeleton__bar"><\/span>/g) ?? []).length, 3,
    'metric-card must render exactly three bars (label, value, note)');
  assert.match(componentSource, /\.metric-skeleton \.aba-skeleton__bar:first-child\{width:44%\}/);
  assert.match(componentSource, /\.metric-skeleton \.aba-skeleton__bar:nth-child\(2\)\{width:72%;height:24px;border-radius:8px\}/);
  assert.match(componentSource, /\.metric-skeleton \.aba-skeleton__bar:last-child\{width:58%\}/);
});

test('list-row variant renders a thumb and two text lines', () => {
  const rowStart = componentSource.indexOf('<div class="aba-skeleton aba-skeleton--list-row"');
  assert.ok(rowStart >= 0, 'missing list-row variant');
  const row = componentSource.slice(rowStart, componentSource.indexOf('} @else {', rowStart));
  assert.match(row, /<div class="aba-skeleton aba-skeleton--list-row" aria-hidden="true">/);
  assert.ok(row.includes('<span class="aba-skeleton__thumb"></span>'), 'list-row needs a thumb block');
  assert.ok(row.includes('<span class="aba-skeleton__lines">'), 'list-row needs a lines container');
  assert.match(componentSource, /\.aba-skeleton__lines \.aba-skeleton__bar:first-child\{width:56%\}/);
  assert.match(componentSource, /\.aba-skeleton__lines \.aba-skeleton__bar:last-child\{width:82%\}/);
  assert.match(componentSource, /\.aba-skeleton__thumb\{flex:0 0 40px;width:40px;height:40px;border-radius:10px\}/);
});

test('detail variant renders a section with the real heading and two detail bars', () => {
  const detailStart = componentSource.indexOf('<section class="aba-skeleton aba-skeleton--detail"');
  assert.ok(detailStart >= 0, 'missing detail variant');
  const detail = componentSource.slice(detailStart, componentSource.indexOf("} @else if (variant() === 'list-row')", detailStart));
  assert.match(detail, /<section class="aba-skeleton aba-skeleton--detail" aria-hidden="true">/);
  assert.ok(detail.includes('<h2 class="aba-skeleton__title">{{ title() }}</h2>'),
    'detail must render the title as a real h2 so the hierarchy stays visible while loading');
  assert.ok(detail.includes('<strong class="aba-skeleton__subtitle">{{ subtitle() }}</strong>'),
    'detail must render the subtitle as real text under the title');
  assert.ok(detail.includes('<div class="aba-skeleton__details">'), 'detail needs a details bar row');
  assert.match(componentSource, /\.aba-skeleton__details \.aba-skeleton__bar\{width:clamp\(110px,24vw,190px\);height:9px\}/);
  assert.match(componentSource, /\.aba-skeleton__details \.aba-skeleton__bar:last-child\{width:clamp\(90px,18vw,145px\)\}/);
});

// --- Reserved space: no layout shift ---

test('skeleton reserves the content space: metric card 145px, detail section 66px, list row 64px', () => {
  assert.match(componentSource, /\.metric-skeleton\{[^}]*min-height:145px;[^}]*padding:16px/);
  assert.match(componentSource, /\.aba-skeleton--detail\{[^}]*min-height:66px/);
  assert.match(componentSource, /\.aba-skeleton--list-row\{[^}]*min-height:64px/);
  assert.match(componentSource, /:host\{display:block;min-width:0\}/,
    'the host must be a block grid item that can shrink, so the card keeps the grid slot');
});

// --- Accessibility ---

test('every variant root is aria-hidden: the skeleton is decorative and the parent owns the announcement', () => {
  for (const root of [
    '<section class="aba-skeleton aba-skeleton--detail" aria-hidden="true">',
    '<div class="aba-skeleton aba-skeleton--list-row" aria-hidden="true">',
    '<div class="metric-skeleton aba-skeleton aba-skeleton--metric-card" aria-hidden="true">',
  ]) {
    assert.ok(componentSource.includes(root), `missing aria-hidden root: ${root}`);
  }
  assert.equal(componentSource.includes('role="status"'), false,
    'the skeleton must not own a status region; the parent announces loading');
});

// --- Shimmer: motion-safe ---

test('bars carry a subtle namespaced shimmer that changes over time', () => {
  assert.ok(componentSource.includes('@keyframes aiba-skeleton-shimmer'), 'missing namespaced shimmer keyframes');
  assert.ok(componentSource.includes('animation:aiba-skeleton-shimmer 1.6s linear infinite'),
    'bars and thumb must shimmer on a 1.6s loop');
  assert.ok(componentSource.includes('linear-gradient(90deg,var(--aiba-line,#e2e8f0) 25%,var(--aiba-surface-raised,#fbfdff) 50%,var(--aiba-line,#e2e8f0) 75%)'),
    'shimmer must be a light band moving over the bar colour');
  assert.ok(componentSource.includes('background-size:200% 100%'), 'the gradient must be wider than the bar so it can travel');
  const shimmer = componentSource.match(/@keyframes aiba-skeleton-shimmer\{([\s\S]*?)\}\}/)?.[1] ?? '';
  assert.ok(shimmer.includes('0%{background-position:200% 0'), 'frame at loop start must be at one end of the travel');
  assert.ok(shimmer.includes('100%{background-position:-200% 0'), 'frame at loop end must be at the other end');
  assert.equal(componentSource.includes('@keyframes shimmer{'), false, 'generic shimmer keyframes must not ship');
});

test('prefers-reduced-motion renders a static frame: no animation, flat bar colour', () => {
  assert.match(
    componentSource,
    /@media\(prefers-reduced-motion:reduce\)\{\.aba-skeleton__bar,\.aba-skeleton__thumb\{animation:none;background:var\(--aiba-line,#e2e8f0\)\}\}/,
  );
});

// --- Tokens ---

test('skeleton uses the --aiba-* tokens and does not consume the --aba-* set', () => {
  for (const token of ['--aiba-line', '--aiba-surface', '--aiba-surface-raised', '--aiba-surface-tint', '--aiba-ink', '--aiba-radius-card', '--aiba-text-md']) {
    assert.ok(componentSource.includes(`var(${token}`), `skeleton must consume ${token}`);
  }
  assert.equal(componentSource.includes('var(--aba-'), false,
    'new shared pieces use the --aiba-* tokens (plan section 1); the --aba-* set is left untouched, not mixed in');
});

test('no AIPA string ships in the skeleton component', () => {
  assert.equal(componentSource.includes('AIPA'), false, 'skeleton must not contain AIPA');
});

// --- Where the skeleton appears: Overview ---

test('Overview loading state uses the skeleton component for the period and the four KPI cards', () => {
  assert.ok(loadingStart >= 0 && loadingEnd > loadingStart);
  assert.match(loading, /<aba-skeleton variant="detail" \[title\]="t\('ملخص النشاط', 'Business summary'\)" \[subtitle\]="t\('آخر 30 يومًا', 'Last 30 days'\)" \/>/);
  assert.equal(loading.split('<aba-skeleton variant="metric-card" />').length - 1, 4,
    'the four KPI cards must each render a metric-card skeleton');
  assert.match(loading, /<section class="metric-grid metric-grid--skeleton" aria-hidden="true">/,
    'the metric grid wrapper stays in the shell: its grid layout is shared with the loaded cards');
  assert.ok(appSource.includes("import { AbaSkeletonComponent } from './shared/ui/aba-skeleton.component';"),
    'shell must import the skeleton component');
  assert.ok(appSource.includes('AbaSkeletonComponent'), 'shell must register the skeleton component');
});

test('the old bespoke Overview skeleton markup and CSS are gone from the shell', () => {
  assert.equal(home.includes('<div class="metric-skeleton">'), false,
    'the shell must not render bespoke metric-skeleton divs; the component owns them');
  assert.equal(home.includes('dashboard-period-skeleton__details'), false,
    'the shell must not render the bespoke period details bars; the component owns them');
  assert.equal(home.includes('dashboard-period--skeleton'), false,
    'the shell must not render the bespoke period skeleton section; the component owns it');
  assert.equal(appStyles.includes('.metric-skeleton{'), false,
    'the bespoke metric-skeleton rules must be gone from app.component.css');
  assert.equal(appStyles.includes('.dashboard-period--skeleton{'), false,
    'the bespoke period-skeleton rule must be gone from app.component.css');
  assert.equal(appStyles.includes('dashboard-period-skeleton__details'), false,
    'the bespoke period details rules must be gone from app.component.css');
  // The ready-state period rules stay: the loaded section still uses them.
  assert.ok(appStyles.includes('.dashboard-period{display:flex;'), 'ready-state period layout must stay in the shell CSS');
  assert.ok(appStyles.includes('.dashboard-period__details{display:flex;'), 'ready-state period details must stay in the shell CSS');
});

test('metric-skeleton class is kept on the component root for the Playwright route sweeps', () => {
  assert.ok(componentSource.includes('class="metric-skeleton aba-skeleton aba-skeleton--metric-card"'),
    'route-matrix-402 and mobile-chat locate .metric-skeleton:visible and wait for it to disappear after load');
});
