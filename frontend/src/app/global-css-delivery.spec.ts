import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Regression guard for the 2026-11-25 production incident: the global CSS
// bundle (styles.css + design-system.css) silently never applied in
// production because Angular's inlineCritical pattern delivered it as
// <link rel="stylesheet" media="print" onload="this.media='all'"> and the
// CSP 'unsafe-hashes' allowlist in vercel.json no longer matched the hash
// of the generated onload handler, so browsers blocked the handler and the
// bundle stayed print-only. The durable fix is to keep critical-CSS
// inlining OFF for the global styles so the bundle ships as a plain
// stylesheet link that no CSP hash pairing can ever break again.
const angular = JSON.parse(readFileSync(new URL('../../angular.json', import.meta.url), 'utf8'));

test('production build never delivers the global CSS bundle via the media-print onload pattern', () => {
  const production = angular.projects['ai-business-assistant'].architect.build.configurations.production;
  assert.equal(production.optimization?.styles?.inlineCritical, false,
    'inlineCritical must stay false: the media-print/onload stylesheet pattern is what killed the global bundle in production (CSP hash desync, 2026-11-25)');
  assert.equal(production.optimization?.styles?.minify, true,
    'styles stay minified; only critical inlining is off');
  assert.equal(production.optimization?.scripts, true,
    'script optimization stays on; only the styles inlining changed');
});
