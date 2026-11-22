import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandDictionaryBackedProperties, expandTranslationCalls } from './localization-test-helpers.ts';

const source = expandTranslationCalls(
  readFileSync(new URL('./app.component.ts', import.meta.url), 'utf8')
  + '\n'
  + readFileSync(new URL('./app.component.css', import.meta.url), 'utf8')
);
const moduleAccessSource = readFileSync(new URL('./module-access.ts', import.meta.url), 'utf8');
const catalogueSource = expandDictionaryBackedProperties(readFileSync(new URL('./workspace-module-catalog.ts', import.meta.url), 'utf8'));

test('mobile bottom navigation keeps four slots and places platform admin in More', () => {
  // T18 Slice K: the dock is one floating pill; the old full-width-bar rule is gone.
  // The anchor is the consolidated dock rule's opening (position + floating inset).
  const mobileSidebarStart = source.indexOf('.sidebar{\n        position:fixed;\n        inset:auto 10px calc(8px + env(safe-area-inset-bottom,0px)) 10px;');
  const mobileItemsStart = source.indexOf('.nav-item{', mobileSidebarStart);
  assert.ok(mobileSidebarStart >= 0 && mobileItemsStart > mobileSidebarStart);

  const mobileSidebarStyles = source.slice(mobileSidebarStart, mobileItemsStart);
  assert.match(mobileSidebarStyles, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(mobileSidebarStyles, /border-radius:22px/);
  assert.match(mobileSidebarStyles, /display:grid/);
  assert.doesNotMatch(source, /\.sidebar\{position:fixed;inset:auto 0 0;width:100%/);
  // Safe-area insets carry a 0px fallback so the dock and the More menu keep their
  // offsets where env() is unsupported; the menu bottom derives from the dock height
  // (75px dock + 8px lift + 5px gap = 88px; 62px narrow dock + 8 + 5 = 75px).
  assert.match(source, /bottom:calc\(88px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(source, /\.mobile-more-menu\{bottom:calc\(75px \+ env\(safe-area-inset-bottom,0px\)\)\}/);
  // Narrow dock: 52px tab (T18 Slice K), still a comfortable touch target.
  assert.match(source, /\.nav-item\{min-height:52px;font-size:9px\}/);
  // Active tab uses the brand teal gradient with an amber ring (T18 Slice K).
  assert.match(source, /linear-gradient\(145deg,var\(--aiba-brand-teal-deep,#093A44\),var\(--aiba-brand-strong,#115e59\)\)/);
  assert.match(source, /color-mix\(in srgb,var\(--aiba-brand-amber,#F5A623\) 45%,transparent\)/);
  assert.match(source, /class="mobile-dock-items"/);
  assert.match(source, /\.mobile-dock-items\{display:contents\}/);
  assert.match(source, /\.desktop-sidebar-groups\{display:none\}/);
  assert.match(source, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);

  const moreStart = source.indexOf('id="mobile-more-menu"');
  const moreEnd = source.indexOf('</nav>', moreStart) + '</nav>'.length;
  assert.ok(moreStart >= 0 && moreEnd > moreStart);
  const moreMenu = source.slice(moreStart, moreEnd);
  assert.match(moreMenu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(moreMenu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(moreMenu, /selectMobileMoreTab\(module\.tab\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);
  assert.match(moduleAccessSource, /if \(tab === 'platform-admin'\) return platformAdminAvailable;/);
  assert.match(source, /get primaryNavigationModules/);
  assert.match(source, /\['overview', 'invoices', 'customers'\]/);
  assert.match(source, /@for \(module of primaryNavigationModules; track module\.tab\)/);
  assert.match(source, /get desktopNavigationGroups/);
  assert.match(source, /@for \(group of desktopNavigationGroups; track group\.id\)/);
  assert.match(source, /setTab\(module\.tab\)/);
  assert.match(catalogueSource, /tab: 'platform-admin', mobileGroup: 'team-admin'/);

  assert.ok(
    source.includes('[class.active]="mobileMoreOpen || isMobileMoreTab(tab)"'),
    'the More active state must use the shared tested tab classifier',
  );
  assert.match(moduleAccessSource, /export function isMobileMoreTab\(tab: WorkspaceModuleTab\): boolean/);
  assert.match(moduleAccessSource, /return MOBILE_MORE_TABS\.has\(tab\)/);
});



test('dock labels become icon-only below 220px so nothing clips at 200% zoom', () => {
  // T18 dock labels (2026-11-21): at 195px (200% zoom) each dock slot is
  // ~40px wide while "Customers" at 9px needs ~45px, so the labels clipped
  // to "Over…"/"Invoi…"/"Custo…". Below 220px the dock is icon-only.
  assert.match(source, /@media\(max-width:220px\)\{\s*\.mobile-dock-items \.nav-item>span:not\(\.nav-icon\)\{display:none\}/);
  // The accessible name is preserved: every dock button carries its full
  // title in aria-label and title, and the icon span is aria-hidden.
  const dockStart = source.indexOf('class="mobile-dock-items"');
  const dockEnd = source.indexOf('</div>', dockStart);
  assert.ok(dockStart >= 0 && dockEnd > dockStart);
  const dock = source.slice(dockStart, dockEnd);
  assert.match(dock, /\[attr\.aria-label\]="t\(module\.titleKey\)"/);
  assert.match(dock, /\[attr\.title\]="t\(module\.titleKey\)"/);
  assert.match(dock, /class="nav-icon" aria-hidden="true"/);
  // Scoped to the dock: the More menu keeps its labels.
  assert.doesNotMatch(source, /@media\(max-width:220px\)\{[^}]*\.mobile-more-menu \.nav-item>span:not\(\.nav-icon\)\{display:none\}/);
  assert.match(source, /\.mobile-more-menu \.nav-item>span:not\(\.nav-icon\)\{max-width:none\}/);
});

test('mobile More keeps grouped destinations and no longer renders a sections search control', () => {
  const moreStart = source.indexOf('id="mobile-more-menu"');
  const moreEnd = source.indexOf('</nav>', moreStart) + '</nav>'.length;
  assert.ok(moreStart >= 0 && moreEnd > moreStart);
  const menu = source.slice(moreStart, moreEnd);
  assert.doesNotMatch(menu, /mobile-more-search|mobileMoreSearch|type="search"/);
  assert.doesNotMatch(menu, /ابحث باسم القسم أو وصفه/);
  assert.match(menu, /@for \(group of mobileMoreGroups; track group\.id\)/);
  assert.match(menu, /@for \(module of group\.modules; track module\.tab\)/);
  assert.match(source, /get mobileMoreGroups\(\): readonly/);
  assert.doesNotMatch(source, /filteredMobileMoreGroups|mobileMoreSearch/);
});

test('Home module directory exposes bilingual search and a localized empty state', () => {
  const homeStart = source.indexOf('class="module-directory-disclosure"');
  const homeEnd = source.indexOf("@if (tab === 'notifications')", homeStart);
  assert.ok(homeStart >= 0 && homeEnd > homeStart);
  const home = source.slice(homeStart, homeEnd);

  assert.match(home, /name="homeModuleSearch"/);
  assert.match(home, /\[\(ngModel\)\]="homeModuleSearch"/);
  assert.match(source, /get filteredHomeModuleCards/);
  assert.match(home, /@for \(module of filteredHomeModuleCards; track module\.tab\)/);
  assert.match(home, /module-directory-empty" role="status"/);
  assert.match(source, /filterWorkspaceModules\(\s*this\.homeModuleCards,\s*this\.homeModuleSearch/);
});

test('Home module directory search is hidden below 760px and kept on desktop (owner direction Nov 20)', () => {
  // Routine item (A) (2026-11-22): the owner asked to remove the section
  // (module) search on mobile. The search stays in the template and works
  // on desktop; below 760px it is display:none — gone from the layout, the
  // accessibility tree and the tab order — not a visual-only hide.
  assert.match(source, /<aba-search-field class="module-directory-search" name="homeModuleSearch" autocomplete="off"/,
    'the desktop module search call site stays in the template');
  assert.match(source, /\.module-directory-search\{display:block;min-width:0\}/,
    'the desktop base rule still renders the search');
  // The hide lives in the same <=760px block that already hides the
  // mobile-duplicate quick-access launcher (T18 Slice U01).
  const mobileBlockStart = source.indexOf('/* T18 Slice U01 (2026-11-21): remove the mobile duplication');
  assert.ok(mobileBlockStart >= 0, 'missing the U01 mobile block anchor');
  const mobileBlockEnd = source.indexOf('@media(max-width:380px)', mobileBlockStart);
  assert.ok(mobileBlockEnd > mobileBlockStart);
  const mobileBlock = source.slice(mobileBlockStart, mobileBlockEnd);
  assert.match(mobileBlock, /\.module-directory-search\{display:none\}/,
    'the module search is display:none below 760px');
  assert.doesNotMatch(mobileBlock, /\.module-directory-search\{[^}]*(visibility:hidden|opacity:0|clip-path|width:1px)/,
    'the mobile hide must not be a visual-only hide that keeps the field focusable');
});


test('desktop navigation groups every authorized destination and scrolls independently of the fixed shell', () => {
  assert.match(source, /<nav class="sidebar-nav-scroll"/);
  assert.match(source, /get desktopNavigationGroups/);
  assert.match(source, /const accessibleModules = this\.homeModuleCards/);
  assert.match(source, /modules: this\.primaryNavigationModules/);
  assert.match(source, /WORKSPACE_MODULE_GROUPS\.map\(group =>/);
  assert.match(source, /modules: accessibleModules\.filter\(module => module\.mobileGroup === group\.id\)/);
  assert.match(source, /\.sidebar-nav-scroll\{[^}]*min-height:0;[^}]*overflow-y:auto/s);
  assert.match(source, /overscroll-behavior:contain/);
  assert.match(source, /@media\(max-width:760px\)\{\s*\.sidebar-nav-scroll\{display:contents\}/);
  assert.match(source, /class="desktop-nav-group-label"/);
});
