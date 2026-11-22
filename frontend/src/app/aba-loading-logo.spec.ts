import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LoadingCounter } from './loading-counter.ts';

const componentSource = readFileSync(new URL('./shared/ui/aba-loading-logo.component.ts', import.meta.url), 'utf8');
const stateMessageSource = readFileSync(new URL('./shared/ui/aba-state-message.component.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const arabic = JSON.parse(readFileSync(new URL('../../public/i18n/ar.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const english = JSON.parse(readFileSync(new URL('../../public/i18n/en.json', import.meta.url), 'utf8')) as Record<string, unknown>;

// T18 Slice B: reference-counted loading state + animated loading logo.
// The component is exercised by source assertions (no TestBed in the node
// runner); the counter itself is exercised at runtime. The spec lives flat
// in src/app/ like the other 60 specs: `npm test` globs src/app/*.spec.ts,
// so a spec under shared/ui/ would never run.

// --- Reference count: runtime ---

test('loader is hidden with no in-flight request and shows on the first begin', () => {
  const loading = new LoadingCounter();
  assert.equal(loading.count(), 0);
  assert.equal(loading.isLoading(), false);
  loading.begin();
  assert.equal(loading.count(), 1);
  assert.equal(loading.isLoading(), true);
});

test('concurrent requests do not stop the indicator early', () => {
  const loading = new LoadingCounter();
  loading.begin();
  loading.begin();
  assert.equal(loading.count(), 2);
  loading.end();
  assert.equal(loading.count(), 1);
  assert.equal(loading.isLoading(), true, 'one request finishing must not hide the loader while another runs');
  loading.end();
  assert.equal(loading.count(), 0);
  assert.equal(loading.isLoading(), false);
});

test('cancel decrements the count and the loader hides at zero', () => {
  const loading = new LoadingCounter();
  loading.begin();
  loading.begin();
  loading.end(); // first request cancelled
  assert.equal(loading.isLoading(), true);
  loading.end(); // second request cancelled
  assert.equal(loading.isLoading(), false);
});

test('retry re-increments the count', () => {
  const loading = new LoadingCounter();
  loading.begin();
  loading.end();
  assert.equal(loading.isLoading(), false);
  loading.begin(); // retry is a new request, not a resurrection of the old one
  assert.equal(loading.count(), 1);
  assert.equal(loading.isLoading(), true);
  loading.end();
  assert.equal(loading.isLoading(), false);
});

test('loader stops on error: a failing request still releases its count in finally', async () => {
  const loading = new LoadingCounter();
  loading.begin();
  loading.begin();
  try {
    await Promise.reject(new Error('request failed'));
  } catch {
    // Error path: the request is over, its count is released exactly once.
    loading.end();
  } finally {
    // No second release here: exactly once per begin.
  }
  assert.equal(loading.count(), 1);
  assert.equal(loading.isLoading(), true, 'the surviving request still holds the loader');
  loading.end();
  assert.equal(loading.isLoading(), false);
});

test('loader stops on leaving the screen: a context change releases every held count', () => {
  const loading = new LoadingCounter();
  loading.begin();
  loading.begin();
  loading.reset(); // workspace switch / sign-out invalidates all in-flight work
  assert.equal(loading.count(), 0);
  assert.equal(loading.isLoading(), false);
});

test('an extra release never drives the count negative', () => {
  const loading = new LoadingCounter();
  loading.end();
  loading.end();
  assert.equal(loading.count(), 0);
  assert.equal(loading.isLoading(), false);
  loading.begin();
  loading.end();
  loading.end();
  assert.equal(loading.count(), 0);
});

test('the shell derives its loading flag from the counter, with no competing boolean', () => {
  assert.match(appSource, /get loading\(\): boolean \{\s*return this\.loadingState\.isLoading\(\);/);
  assert.match(appSource, /set loading\(value: boolean\) \{\s*if \(value\) this\.loadingState\.begin\(\); else this\.loadingState\.end\(\);/);
  assert.doesNotMatch(appSource, /^\s+loading = false;$/m, 'the plain-boolean field must be gone');
  assert.match(appSource, /inject\(AbaLoadingStateService\)/, 'shell injects the counter service');
  assert.match(appSource, /this\.loadingState\.reset\(\);/, 'context changes release every held count');
  const serviceSource = readFileSync(new URL('./loading-state.service.ts', import.meta.url), 'utf8');
  assert.match(serviceSource, /@Injectable\(\{ providedIn: 'root' \}\)/);
  assert.match(serviceSource, /export class AbaLoadingStateService extends LoadingCounter/);
});

// --- Loader component: source ---

test('loader uses namespaced classes and keyframes only', () => {
  for (const name of ['aiba-loader-rise', 'aiba-loader-pop', 'aiba-loader-breathe']) {
    assert.ok(componentSource.includes(`@keyframes ${name}`), `missing namespaced keyframes ${name}`);
  }
  assert.ok(componentSource.includes('.aiba-loader__bar'), 'missing namespaced bar class');
  assert.ok(componentSource.includes('.aiba-loader__dot'), 'missing namespaced dot class');
  assert.ok(componentSource.includes('.aiba-loader__star'), 'missing namespaced star class');
  for (const generic of ['@keyframes rise{', '@keyframes pop{', '@keyframes breathe{', '.bar{', '.dot{', '.star{']) {
    assert.equal(componentSource.includes(generic), false, `generic name must not ship: ${generic}`);
  }
  assert.equal(componentSource.includes("class=\"bar"), false);
  assert.equal(componentSource.includes('class="b1"'), false);
  assert.equal(componentSource.includes('class="b2"'), false);
});

test('no AIPA string ships anywhere in the loader slice', () => {
  for (const [name, source] of [
    ['loader component', componentSource],
    ['state message', stateMessageSource],
    ['index.html', indexHtml],
  ] as const) {
    assert.equal(source.includes('AIPA'), false, `${name} must not contain AIPA`);
  }
  assert.equal(componentSource.includes('aria-label='), false, 'the component must not set its own aria-label attribute; the visually hidden locale label owns the name');
});

test('loader has role=status with a visually hidden locale-aware label', () => {
  assert.match(componentSource, /\[attr\.role\]="announce\(\) \? 'status' : null"/);
  assert.ok(componentSource.includes('.aiba-loader__label'), 'missing visually hidden label class');
  assert.match(componentSource, /\.aiba-loader__label\{position:absolute;width:1px;height:1px/);
  assert.ok(componentSource.includes("translate('ui.m_1rza5t5')"), 'label must come from the locale dictionary');
  const ar = (arabic['ui'] as Record<string, string>)['m_1rza5t5'];
  const en = (english['ui'] as Record<string, string>)['m_1rza5t5'];
  assert.equal(ar, 'جارٍ التحميل…');
  assert.equal(en, 'Loading…');
  assert.equal(ar.includes('AIPA'), false);
  assert.equal(en.includes('AIPA'), false);
});

test('loader uses the supplied white-on-dark mark on a teal disc: dark bars on the white star', () => {
  assert.ok(componentSource.includes('linear-gradient(180deg,var(--aiba-brand-teal-light,#1f8c96),var(--aiba-brand-teal-deep,#093a44))'), 'disc must use the teal app-icon gradient');
  assert.ok(componentSource.includes('.aiba-loader__disc'), 'missing disc element');
  // Owner correction 2026-11-21: Slice B shipped the two short bars WHITE,
  // which made them invisible against the white star (only the amber bar/dot
  // showed). The supplied mark (mark_white_on_dark.svg) has DARK short bars
  // (#093A44) on the white star, so the fills now match it exactly: white
  // star, dark short bars, amber tall bar and dot.
  assert.ok(componentSource.includes('class="aiba-loader__star"'), 'missing star');
  assert.match(componentSource, /aiba-loader__star"[^>]*fill="#ffffff"/);
  assert.match(componentSource, /aiba-loader__bar--first"[^>]*fill="#093A44"/);
  assert.match(componentSource, /aiba-loader__bar--second"[^>]*fill="#093A44"/);
  assert.match(componentSource, /aiba-loader__bar--third"[^>]*fill="#f5a623"/);
  assert.match(componentSource, /aiba-loader__dot"[^>]*fill="#f5a623"/);
  assert.equal(componentSource.includes('fill="#0F5C68"'), false, 'teal star must not ship on the teal disc');
});

test('loader is a fixed-size container, so it cannot shift layout', () => {
  assert.match(componentSource, /\.aiba-loader\{[^}]*width:48px;height:48px/);
  assert.match(componentSource, /\.aiba-loader--compact\{width:28px;height:28px\}/);
  assert.ok(componentSource.includes('readonly compact = input(false)'), 'missing compact size input');
  assert.ok(componentSource.includes('flex:0 0 auto'), 'loader must not shrink inside flex rows');
});

test('loader animates on a 1.4s loop with staggered bars and a popping dot', () => {
  assert.ok(componentSource.includes('animation:aiba-loader-rise 1.4s'), 'bars must rise on a 1.4s loop');
  assert.ok(componentSource.includes('animation:aiba-loader-pop 1.4s'), 'dot must pop on a 1.4s loop');
  assert.ok(componentSource.includes('animation:aiba-loader-breathe 2.8s'), 'star must breathe on a 2.8s loop');
  assert.ok(componentSource.includes('animation-delay:.15s'), 'second bar must be staggered');
  assert.ok(componentSource.includes('animation-delay:.3s'), 'third bar must be staggered');
  assert.ok(componentSource.includes('animation-delay:.45s'), 'dot must be staggered');
});

test('two frames captured at different times differ: the keyframes change the rendered mark', () => {
  // Rise: the bar is nearly flat at 0% and full height at 45% of the loop.
  const rise = componentSource.match(/@keyframes aiba-loader-rise\{([\s\S]*?)\}\}/)?.[1] ?? '';
  assert.ok(rise.includes('0%{transform:scaleY(.15)'), 'frame at loop start must be the low bar');
  assert.ok(rise.includes('45%,75%{transform:scaleY(1)'), 'frame mid-loop must be the full bar');
  // Pop: the dot is invisible at 0% and overshoots at 55% of the loop.
  const pop = componentSource.match(/@keyframes aiba-loader-pop\{([\s\S]*?)\}\}/)?.[1] ?? '';
  assert.ok(pop.includes('0%,35%{transform:scale(0)'), 'frame at loop start must hide the dot');
  assert.ok(pop.includes('55%{transform:scale(1.25)'), 'frame mid-loop must show the dot popped in');
});

test('prefers-reduced-motion renders a static frame', () => {
  assert.match(
    componentSource,
    /@media\(prefers-reduced-motion:reduce\)\{\.aiba-loader__bar,\.aiba-loader__dot,\.aiba-loader__star\{animation:none\}\}/,
  );
});

test('loader is standalone and OnPush, and a parent can silence its announcement', () => {
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.ok(componentSource.includes('readonly announce = input(true)'), 'parents that own the status region must be able to silence the nested announcement');
});

// --- Where the loader appears ---

test('global loading bar is the logo mark now, under the same template condition', () => {
  assert.match(appSource, /@if \(loading && initialized\) \{ <div class="global-loading"/);
  assert.match(appSource, /<aba-loading-logo \[compact\]="true" \[announce\]="false" \/>/);
  assert.match(appSource, /AbaLoadingLogoComponent/);
  assert.ok(appStyles.includes('.global-loading{'), 'global-loading rules must exist');
  assert.ok(appStyles.includes('.loading-label{'), 'the visible loading label pill stays next to the mark');
  assert.equal(appStyles.includes('loading-sweep'), false, 'the sweep bar is replaced by the logo mark');
});

test('deferred placeholders use the compact logo mark, not the border spinner', () => {
  // No spec pins .aba-state-message__spinner / aba-spin (checked 2026-11-21):
  // the spinner is removed deliberately and replaced by the logo mark.
  assert.ok(stateMessageSource.includes('<aba-loading-logo [compact]="true" [announce]="false" />'),
    'loading state-message must render the compact logo mark');
  assert.equal(stateMessageSource.includes('aba-state-message__spinner'), false, 'border spinner class must be gone');
  assert.equal(stateMessageSource.includes('aba-spin'), false, 'border spinner keyframes must be gone');
  assert.ok(stateMessageSource.includes('AbaLoadingLogoComponent'), 'state-message must import the loader');
  assert.match(stateMessageSource, /\[attr\.role\]="kind\(\) === 'error' \? 'alert' : 'status'"/,
    'the state-message section still owns the status announcement');
});

test('boot fallback is a static SVG frame of the new mark on a teal disc', () => {
  assert.match(indexHtml, /<main class="boot-fallback" role="status" aria-live="polite">/);
  assert.ok(indexHtml.includes('class="boot-mark"'), 'boot mark must remain');
  assert.ok(indexHtml.includes('<svg'), 'boot fallback must be the SVG mark, not the old "A"');
  assert.ok(indexHtml.includes('linear-gradient(180deg,#1f8c96,#093a44)'), 'boot mark needs the teal disc');
  assert.equal(indexHtml.includes('>A</div>'), false, 'the old text "A" boot mark must be gone');
  assert.equal(indexHtml.includes('AIPA'), false);
  // Owner correction 2026-11-21: the boot mark is the supplied white-on-dark
  // mark — white star, DARK short bars (#093A44), amber tall bar/dot. Slice B
  // shipped white short bars, invisible against the white star.
  assert.match(indexHtml, /<rect x="27\.25"[^>]*fill="#093A44"/);
  assert.match(indexHtml, /<rect x="44\.25"[^>]*fill="#093A44"/);
});
