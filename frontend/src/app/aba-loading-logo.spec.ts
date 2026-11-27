import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  for (const name of ['aiba-loader-bob', 'aiba-loader-bob-compact', 'aiba-loader-shadow']) {
    assert.ok(componentSource.includes(`@keyframes ${name}`), `missing namespaced keyframes ${name}`);
  }
  assert.ok(componentSource.includes('.aiba-loader__figure'), 'missing namespaced figure class');
  assert.ok(componentSource.includes('.aiba-loader__shadow'), 'missing namespaced shadow class');
  for (const generic of ['@keyframes bob{', '@keyframes rise{', '@keyframes pop{', '@keyframes breathe{', '.bar{', '.dot{', '.star{']) {
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

test('loader renders the owner-approved character cutout as one flat decorative image', () => {
  // Owner decision 2026-11-22 (handover batch 3A-346): the bundle identity —
  // character + loader prototype v3 — is approved as-is. The component ships
  // the approved transparent cutout (downscaled for the web) as ONE flat
  // image; the superseded Slice B SVG disc mark must not remain.
  assert.ok(componentSource.includes('src="identity/loader-character.png"'), 'loader must render the approved character asset');
  assert.ok(componentSource.includes('class="aiba-loader__figure"'), 'missing character figure element');
  assert.match(componentSource, /aiba-loader__figure"[^>]*alt=""/, 'character image must be decorative (empty alt)');
  assert.match(componentSource, /aiba-loader__figure"[^>]*aria-hidden="true"/, 'character image must be hidden from assistive tech; the hidden label owns the name');
  assert.equal(componentSource.includes('<svg'), false, 'the superseded SVG disc mark must not ship in the component');
  assert.equal(componentSource.includes('aiba-loader__disc'), false, 'the superseded teal disc must not ship');
  const assetUrl = new URL('../../public/identity/loader-character.png', import.meta.url);
  assert.ok(existsSync(assetUrl), 'the approved character asset must exist under public/identity/');
});

test('loader shadow ellipse renders only at the full size, like the prototype centred variant', () => {
  assert.ok(componentSource.includes('@if (!compact()) { <span class="aiba-loader__shadow"'), 'shadow ellipse must be full-size only');
  assert.match(componentSource, /\.aiba-loader__shadow\{[^}]*border-radius:50%/);
});

test('loader is a fixed-size container, so it cannot shift layout', () => {
  assert.match(componentSource, /\.aiba-loader\{[^}]*width:96px;height:108px/);
  assert.match(componentSource, /\.aiba-loader--compact\{width:44px;height:44px\}/);
  assert.ok(componentSource.includes('readonly compact = input(false)'), 'missing compact size input');
  assert.ok(componentSource.includes('flex:0 0 auto'), 'loader must not shrink inside flex rows');
});

test('loader bobs the whole character on the prototype v3 timing: 1.44s loop, shadow in sync', () => {
  // Prototype v3 (owner-approved 2026-11-22): whole-character motion only,
  // matched to the reference GIF — 24 frames x 60 ms = 1.44 s loop.
  assert.ok(componentSource.includes('animation:aiba-loader-bob 1.44s ease-in-out infinite'), 'character must bob on the 1.44s loop');
  assert.ok(componentSource.includes('animation:aiba-loader-shadow 1.44s ease-in-out infinite'), 'shadow must pulse on the same 1.44s loop');
  assert.ok(componentSource.includes('animation-name:aiba-loader-bob-compact'), 'compact size must use the smaller bob');
});

test('two frames captured at different times differ: the keyframes move the whole character', () => {
  // Bob: the whole figure rests at 0% and is lifted/tilted at 50%.
  const bob = componentSource.match(/@keyframes aiba-loader-bob\{([\s\S]*?)\}\}/)?.[1] ?? '';
  assert.ok(bob.includes('0%,100%{transform:translateY(0) rotate(0deg)'), 'frame at loop start must be the resting figure');
  assert.ok(bob.includes('50%{transform:translateY(-7px) rotate(-1deg)'), 'frame mid-loop must be the lifted, tilted figure');
  // Shadow: full width at rest, narrowed and faded while the figure is up.
  const shadow = componentSource.match(/@keyframes aiba-loader-shadow\{([\s\S]*?)\}\}/)?.[1] ?? '';
  assert.ok(shadow.includes('0%,100%{transform:scaleX(1);opacity:1'), 'frame at loop start must be the full shadow');
  assert.ok(shadow.includes('50%{transform:scaleX(.86);opacity:.7'), 'frame mid-loop must be the narrowed shadow');
});

test('prefers-reduced-motion renders a static frame', () => {
  assert.match(
    componentSource,
    /@media\(prefers-reduced-motion:reduce\)\{\.aiba-loader__figure,\.aiba-loader__shadow\{animation:none\}\}/,
  );
});

test('loader is standalone and OnPush, and a parent can silence its announcement', () => {
  assert.ok(componentSource.includes('standalone: true'));
  assert.ok(componentSource.includes('ChangeDetectionStrategy.OnPush'));
  assert.ok(componentSource.includes('readonly announce = input(true)'), 'parents that own the status region must be able to silence the nested announcement');
});

// --- Where the loader appears ---

test('global loading is a centered overlay with the full-size logo mark, under the same template condition', () => {
  assert.match(appSource, /@if \(loading && initialized\) \{ <div class="global-loading"/);
  assert.match(appSource, /<div class="global-loading"[^>]*><aba-loading-logo \[announce\]="false" \/>/);
  assert.match(appSource, /AbaLoadingLogoComponent/);
  assert.ok(appStyles.includes('.global-loading{'), 'global-loading rules must exist');
  assert.ok(appStyles.includes('.loading-label{'), 'the visible loading label pill stays below the mark');
  assert.equal(appStyles.includes('loading-sweep'), false, 'the sweep bar is replaced by the logo mark');
  assert.ok(appStyles.includes('.global-loading{position:fixed;inset:0;'), 'the overlay covers the whole viewport, centered');
  assert.equal(appStyles.includes('inset:0 0 auto'), false, 'the top strip is replaced by the centered overlay');
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
