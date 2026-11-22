import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('./app.component.css', import.meta.url), 'utf8');
const designSystem = readFileSync(new URL('../design-system.css', import.meta.url), 'utf8');
const sectionHeader = readFileSync(new URL('./shared/ui/aba-section-header.component.ts', import.meta.url), 'utf8');
const mobileHeaderSource = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.ts', import.meta.url), 'utf8');
const mobileHeaderCss = readFileSync(new URL('./shared/ui/aba-mobile-app-header.component.css', import.meta.url), 'utf8');

// T18 Slice H: section headings use aba-section-header, and the page title is
// one contract (mark + current name + screen title, compact) shared by the
// shell .topbar h1 and the mobile-header h1. The spec lives flat in src/app/
// like the other specs: `npm test` globs src/app/*.spec.ts, so a spec under
// shared/ui/ would never run. Headings keep their exact text, level and
// meaning; only the presentation/contract changes. Owner correction
// 2026-11-21: a long heading wraps and stays complete — never truncate with
// an ellipsis, never force one line, no shrink-to-fit.

// --- Section headings ---

test('shell section headings use aba-section-header with unchanged text and level', () => {
  assert.ok(appSource.includes("import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';"));
  // Workspace creation card: same title and description keys, eyebrow kept above.
  assert.ok(appSource.includes(`<p class="eyebrow">{{ t('ui.m_117ileb') }}</p><aba-section-header [title]="t('ui.m_sgf5dv')" [description]="t('ui.m_1bmd66c')" />`),
    'workspace creation heading must keep its title and description');
  // CSV import panels (customers, products): level-3 headers, same keys.
  assert.ok(appSource.includes(`<aba-section-header [level]="3" [title]="t('ui.m_p4xhry')" [description]="t('ui.m_1239wd4')" />`),
    'customer CSV import heading must keep its title and description at level 3');
  assert.ok(appSource.includes(`<aba-section-header [level]="3" [title]="t('ui.m_1wgx28b')" [description]="t('ui.m_1kaqi1p')" />`),
    'product CSV import heading must keep its title and description at level 3');
  // Data-integrity subsections: level-3 headers, same keys.
  assert.ok(appSource.includes(`<aba-section-header [level]="3" [title]="t('ui.m_h5fuqc')" />`),
    'integrity invoice subsection must keep its title at level 3');
  assert.ok(appSource.includes(`<aba-section-header [level]="3" [title]="t('ui.m_ord1a3')" />`),
    'integrity allocation subsection must keep its title at level 3');
});

test('no bare section h2/h3 remains in the shell template outside the allow-list', () => {
  // Kept deliberately, each pinned by its own spec or role:
  // - desktop-nav-group-label / mobile-more group labels (navigation, not sections)
  // - dashboard-period__title moved with the Home tab into the overview
  //   workspace (home-dashboard.spec.ts pins the ready-state h2 there)
  // - invoices-section-title (sr-only heading; the visible count stays as-is)
  // - invoice-detail-heading (dialog heading, aria-labelledby target)
  // - invoice-detail notes h3 (12px label inside the bordered note box, not a section)
  const allowed = new Set([
    `<h2 class="desktop-nav-group-label" [id]="'desktop-nav-' + group.id">`,
    `<h3 [id]="'mobile-more-' + group.id + '-heading'">`,
    `<h2 id="invoices-section-title" class="sr-only">`,
    `<h2 id="invoice-detail-heading">`,
    `<h3>`,
  ]);
  const headings = [...appSource.matchAll(/<h[23]\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(headings.length, 5, `expected only the 5 allow-listed bare headings, found: ${headings.join(' | ')}`);
  for (const heading of headings) {
    assert.ok(allowed.has(heading), `bare heading is not a section heading under the contract: ${heading}`);
  }
});

test('section headings wrap and stay complete, never truncate', () => {
  assert.match(sectionHeader, /\.aba-section-header h2,\.aba-section-header h3\{overflow-wrap:anywhere\}/);
  assert.doesNotMatch(sectionHeader, /text-overflow:\s*ellipsis/);
  // The count pill alone keeps white-space:nowrap; the headings themselves must not.
  const headingRules = [...sectionHeader.matchAll(/\.aba-section-header h2,\.aba-section-header h3\{[^}]*\}/g)].map((m) => m[0]);
  assert.ok(headingRules.length > 0, 'expected heading rules in the section-header component');
  for (const rule of headingRules) {
    assert.doesNotMatch(rule, /white-space:\s*nowrap/);
  }
});

// --- One page-title contract ---

test('shell and mobile page titles share one marker and amber bar, defined once', () => {
  // The amber octagram marker is a ::before pseudo-element on both h1s
  // (design-system.css), not a DOM span inside them: a real span adds a
  // second box to Range.getClientRects(), which the mobile E2E title check
  // reads as a second rendered line (2026-11-21 regression at b558cbd).
  // Neither h1 carries a marker span any more.
  assert.doesNotMatch(appSource, /aiba-page-title-marker/,
    'topbar h1 must not carry a marker span — the marker is a ::before');
  assert.doesNotMatch(mobileHeaderSource, /aiba-page-title-marker/,
    'mobile h1 must not carry a marker span — the marker is a ::before');
  // One shared ::before rule draws the marker for both h1s; the octagram
  // geometry (amber #F5A623) is defined once, as a data-URI background.
  assert.match(designSystem,
    /:root body \.shell \.topbar h1::before,\s*:root body \.shell \.mobile-app-header \.page-copy h1::before \{[^}]*background: url\("data:image\/svg\+xml,[^"]*fill='%23F5A623'[^"]*"\)/);
  assert.match(designSystem,
    /:root body \.shell \.topbar h1::before,\s*:root body \.shell \.mobile-app-header \.page-copy h1::before \{[^}]*68\.75,4\.73 76\.52,23\.48 95\.27,31\.25/);
  // One shared rule draws the bar.
  assert.match(designSystem,
    /:root body \.shell \.topbar h1::after,\s*:root body \.shell \.mobile-app-header \.page-copy h1::after \{[^}]*background: var\(--aiba-brand-amber\);/);
  // The old per-shell copies are gone: no second definition to drift.
  assert.doesNotMatch(appSource, /topbar-title-marker/);
  assert.doesNotMatch(appCss, /topbar-title-marker/);
  assert.doesNotMatch(appCss, /\.topbar h1::after/);
  assert.doesNotMatch(designSystem, /topbar-title-marker/);
  assert.doesNotMatch(mobileHeaderSource, /topbar-title-marker/);
});

test('mobile page title keeps its heading face and wraps beside the fixed actions', () => {
  assert.match(mobileHeaderCss, /\.page-copy h1 \{[\s\S]*?font-family: var\(--aiba-font-heading,/);
  assert.match(mobileHeaderCss, /\.page-copy h1 \{[\s\S]*?overflow: visible;/);
  assert.match(mobileHeaderCss, /\.page-copy h1 \{[\s\S]*?white-space: normal;/);
  assert.doesNotMatch(mobileHeaderCss, /\.page-copy h1 \{[^}]*text-overflow:ellipsis/);
});

test('no AIPA string ships in the Slice H files', () => {
  for (const [name, source] of [
    ['app.component.ts', appSource],
    ['app.component.css', appCss],
    ['design-system.css', designSystem],
    ['aba-mobile-app-header.component.ts', mobileHeaderSource],
    ['aba-mobile-app-header.component.css', mobileHeaderCss],
    ['aba-section-header.component.ts', sectionHeader],
  ]) {
    assert.equal(source.includes('AIPA'), false, `${name} must not contain AIPA`);
  }
});
